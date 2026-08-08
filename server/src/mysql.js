// MySQL 存储层：环境变量 MYSQL_HOST 存在时启用，否则回退 JSON 文件
// 设计：启动时全量加载到内存 cache（路由零改动），保存时防抖整表重写（MVP 规模足够）
import mysql from 'mysql2/promise';
import { encryptChapters, decryptChapters } from './crypto.js';

export const mysqlEnabled = () => !!(process.env.MYSQL_HOST || process.env.DB_HOST);

let pool = null;
export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
      user: process.env.MYSQL_USER || process.env.DB_USER || 'aicho',
      password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || 'aicho123',
      database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'aicho_muse',
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

// 表名 -> 集合名 + JSON 字段
const COLLECTIONS = {
  users: { json: [] },
  projects: { json: [] },
  chapters: { json: [] },
  snapshots: { json: [] },
  personas: { json: ['personality', 'speaking_style', 'values', 'expertise'] },
  voices: { json: ['params', 'features'] },
  conversations: { json: [] },
  messages: { json: [] },
  outline_nodes: { json: [] },
  character_cards: { json: ['relationships'] },
  timeline_events: { json: ['linked_chapters'] },
  idea_notes: { json: ['tags'] },
  memories: { json: [] },
  citations: { json: [] },
  shares: { json: ['likes'] },
  reference_docs: { json: [] },
  reference_chunks: { json: [] },
  admin_users: { json: [] },
  trash: { json: [] },
  agent_logs: { json: [] },
};

// 每张表一个 JSON 列存整行，字段名即 key
async function ensureTables() {
  const conn = await getPool().getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS app_data (
      \`key\` VARCHAR(80) PRIMARY KEY,
      \`value\` JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await conn.query(`CREATE TABLE IF NOT EXISTS presets (
      \`kind\` VARCHAR(16) NOT NULL,
      \`id\` VARCHAR(80) NOT NULL,
      \`value\` JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (kind, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } finally {
    conn.release();
  }
}

export async function mysqlLoad(cache) {
  if (!mysqlEnabled()) return false;
  await ensureTables();
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.query('SELECT `key`, `value` FROM app_data');
    // 按 key 前缀归类：users:<id> → cache.users 数组；settings/stats 直接赋值
    const grouped = {};
    for (const r of rows) {
      const v = r.value;
      if (typeof v !== 'object' || v === null) continue;
      const sep = r.key.indexOf(':');
      if (sep > 0) {
        const table = r.key.slice(0, sep);
        if (!grouped[table]) grouped[table] = [];
        grouped[table].push(v);
      } else {
        cache[r.key] = v;
      }
    }
    for (const [table, list] of Object.entries(grouped)) {
      if (table in cache && Array.isArray(cache[table])) cache[table] = list;
    }
    // 官方预设独立永久表：与用户数据分开，全量落库永不触碰
    const [presetRows] = await conn.query('SELECT kind, id, value FROM presets');
    const personas = new Map((cache.personas || []).map((p) => [p.id, p]));
    const voices = new Map((cache.voices || []).map((v) => [v.id, v]));
    for (const pr of presetRows) {
      const v = pr.value;
      if (typeof v !== 'object' || v === null) continue;
      if (pr.kind === 'persona') personas.set(pr.id, v);
      else if (pr.kind === 'voice') voices.set(pr.id, v);
    }
    cache.personas = [...personas.values()];
    cache.voices = [...voices.values()];
    // 保证内置官方预设永久存在（库中缺失时自动补回）
    await mysqlEnsureSeedPresets(cache, conn);
    decryptChapters(cache);
    // 首次启动（DB 无 users 行）：写入种子数据
    const loaded = rows.some(r => r.key.startsWith('users:'));
    if (!loaded) await mysqlSaveFull(cache);
    return true;
  } finally {
    conn.release();
  }
}

export async function mysqlSaveFull(cache) {
  if (!mysqlEnabled()) return;
  await ensureTables();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM app_data');
    const snapshot = JSON.parse(JSON.stringify(cache));
    encryptChapters(snapshot);
    for (const [table, meta] of Object.entries(COLLECTIONS)) {
      const rows = snapshot[table];
      if (!rows || !Array.isArray(rows)) continue;
      for (const row of rows) {
        // 官方预设不写入 app_data：它们只属于 presets 永久表，避免全量重写误删
        if (row.is_preset) continue;
        const value = JSON.stringify(row);
        await conn.query('INSERT INTO app_data (`key`, `value`) VALUES (?, ?)', [`${table}:${row.id || ''}`, value]);
      }
    }
    // settings / stats
    await conn.query('INSERT INTO app_data (`key`, `value`) VALUES (?, ?)', ['settings', JSON.stringify(snapshot.settings || {})]);
    await conn.query('INSERT INTO app_data (`key`, `value`) VALUES (?, ?)', ['stats', JSON.stringify(snapshot.stats || {})]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// 官方预设永久写入/删除（独立 presets 表，实时生效，不依赖 2 秒全量落库）
export async function mysqlUpsertPreset(kind, row) {
  if (!mysqlEnabled() || !row?.id) return;
  await ensureTables();
  const conn = await getPool().getConnection();
  try {
    await conn.query(
      'INSERT INTO presets (kind, id, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [kind, row.id, JSON.stringify(row)]
    );
  } finally {
    conn.release();
  }
}

export async function mysqlDeletePreset(kind, id) {
  if (!mysqlEnabled() || !id) return;
  await ensureTables();
  const conn = await getPool().getConnection();
  try {
    await conn.query('DELETE FROM presets WHERE kind = ? AND id = ?', [kind, id]);
  } finally {
    conn.release();
  }
}

// 确保内置官方预设（seed 中的 is_preset 条目）在永久表中存在
export async function mysqlEnsureSeedPresets(cache, connArg) {
  if (!mysqlEnabled()) return;
  const { seedPresets } = await import('./db.js');
  const { personas, voices } = seedPresets();
  await ensureTables();
  const conn = connArg || await getPool().getConnection();
  try {
    for (const p of personas) {
      const [ex] = await conn.query('SELECT 1 FROM presets WHERE kind = ? AND id = ?', ['persona', p.id]);
      if (!ex.length) {
        await conn.query('INSERT INTO presets (kind, id, value) VALUES (?, ?, ?)', ['persona', p.id, JSON.stringify(p)]);
        if (!cache.personas.some((x) => x.id === p.id)) cache.personas.push(p);
      }
    }
    for (const v of voices) {
      const [ex] = await conn.query('SELECT 1 FROM presets WHERE kind = ? AND id = ?', ['voice', v.id]);
      if (!ex.length) {
        await conn.query('INSERT INTO presets (kind, id, value) VALUES (?, ?, ?)', ['voice', v.id, JSON.stringify(v)]);
        if (!cache.voices.some((x) => x.id === v.id)) cache.voices.push(v);
      }
    }
  } finally {
    if (!connArg) conn.release();
  }
}

// 防抖保存：多个 saveDb 合并为一次全量写
let flushTimer = null;
let periodic = null;
export function startPeriodicFlush(cache) {
  if (periodic) return;
  periodic = setInterval(() => {
    mysqlSaveFull(cache).catch(e => console.error('[MySQL] 周期保存失败:', e.message));
  }, 2000);
  periodic.unref?.();
}

export function mysqlScheduleSave(cache) {
  if (!mysqlEnabled()) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    mysqlSaveFull(cache).catch(e => console.error('[MySQL] 保存失败:', e.message));
  }, 150);
}
