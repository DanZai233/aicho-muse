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
    encryptChapters(cache);
    for (const [table, meta] of Object.entries(COLLECTIONS)) {
      const rows = cache[table];
      if (!rows || !Array.isArray(rows)) continue;
      for (const row of rows) {
        const value = JSON.stringify(row);
        await conn.query('INSERT INTO app_data (`key`, `value`) VALUES (?, ?)', [`${table}:${row.id || ''}`, value]);
      }
    }
    // settings / stats
    await conn.query('INSERT INTO app_data (`key`, `value`) VALUES (?, ?)', ['settings', JSON.stringify(cache.settings || {})]);
    await conn.query('INSERT INTO app_data (`key`, `value`) VALUES (?, ?)', ['stats', JSON.stringify(cache.stats || {})]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    decryptChapters(cache);
    conn.release();
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
