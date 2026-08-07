import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const uuid = () => crypto.randomUUID();

function seed() {
  const now = new Date().toISOString();
  const presetPersonas = [
    {
      id: 'preset-liwen',
      name: '黎文',
      tagline: '安静的倾听者',
      background: '当过十二年文学编辑，现在开一间小书店，喜欢听人讲故事。',
      personality: ['温和', '耐心', '敏锐', '不评判'],
      speaking_style: { tone: '平静而温暖', preferences: ['多用提问引导', '少用绝对化结论', '偶尔引用一句诗'], avoid: ['说教', '过度夸奖', '替用户做决定'] },
      values: ['真实比华丽重要', '创作是自我发现的过程'],
      relationship: '亦师亦友的编辑',
      expertise: ['叙事结构', '人物塑造', '回忆录写作'],
      greeting: '今天想讲点什么？我在听。',
      is_preset: true,
      avatar_color: '#8b7d6b',
      version: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-suhe',
      name: '苏禾',
      tagline: '灵感缪斯',
      background: '住在海边小城的诗人，相信万物都有故事，擅长从日常里打捞诗意。',
      personality: ['浪漫', '跳跃', '诗意', '好奇'],
      speaking_style: { tone: '轻盈灵动', preferences: ['用比喻打开想象', '鼓励大胆尝试', '把平凡写得动人'], avoid: ['刻板教条', '否定式回应'] },
      values: ['想象力是最高贵的能力', '细节里住着神'],
      relationship: '灵感同伴',
      expertise: ['诗歌', '意象', '散文', '创意写作'],
      greeting: '嗨，今天的风带来什么故事？',
      is_preset: true,
      avatar_color: '#7b8d9a',
      version: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-chenmo',
      name: '陈墨',
      tagline: '严苛编辑',
      background: '从业二十年的出版编辑，改过上千部稿子，说话直接但眼光毒辣。',
      personality: ['犀利', '直接', '专业', '有原则'],
      speaking_style: { tone: '干脆利落', preferences: ['直指问题', '给出可执行的修改方向', '重视结构'], avoid: ['空洞夸奖', '模棱两可'] },
      values: ['结构大于辞藻', '每个字都要有用'],
      relationship: '严格的编辑',
      expertise: ['小说结构', '节奏控制', '商业写作', '故事逻辑'],
      greeting: '说吧，这次想让我看什么？我会直说。',
      is_preset: true,
      avatar_color: '#5a5a5a',
      version: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-adao',
      name: '阿岛',
      tagline: '旅行作家',
      background: '在路上十年的旅行作家，写过六本书，见过很多人，最擅长把经历变成故事。',
      personality: ['好奇', '幽默', '随性', '温暖'],
      speaking_style: { tone: '轻松有画面感', preferences: ['把提问变成画面', '分享旅行见闻做类比', '轻松化解卡壳'], avoid: ['严肃说教', '制造压力'] },
      values: ['经历本身就是素材', '故事在路上'],
      relationship: '同行的老友',
      expertise: ['游记', '人物特写', '对话场景', '非虚构'],
      greeting: '嘿，这次我们上哪儿？先说说你心里那个画面。',
      is_preset: true,
      avatar_color: '#6b8e6b',
      version: 1,
      created_at: now,
      updated_at: now,
    },
  ];
  const presetVoices = [
    { id: 'preset-voice-warm', display_name: '温润男声', provider: 'system', voice_id: '', params: { rate: 0.95, pitch: 0, emotion: 'warm', energy: 0.6 }, is_preset: true, created_at: now, updated_at: now },
    { id: 'preset-voice-clear', display_name: '清亮女声', provider: 'system', voice_id: '', params: { rate: 1.0, pitch: 1.1, emotion: 'bright', energy: 0.7 }, is_preset: true, created_at: now, updated_at: now },
    { id: 'preset-voice-deep', display_name: '低沉中性声', provider: 'system', voice_id: '', params: { rate: 0.9, pitch: -0.5, emotion: 'serious', energy: 0.5 }, is_preset: true, created_at: now, updated_at: now },
    { id: 'preset-voice-lively', display_name: '元气轻快声', provider: 'system', voice_id: '', params: { rate: 1.1, pitch: 0.6, emotion: 'cheerful', energy: 0.8 }, is_preset: true, created_at: now, updated_at: now },
  ];
  return {
    users: [],
    projects: [],
    chapters: [],
    snapshots: [],
    personas: presetPersonas,
    voices: presetVoices,
    conversations: [],
    messages: [],
    settings: {
      ai: { provider: 'none', base_url: '', api_key: '', model: 'gpt-4o-mini', system_prompt_mode: 'default', llm_provider: 'none', llm_api_key: '', llm_model: '' },
      quota: { daily_messages: 100, tts_per_hour: 60, stt_minutes_per_day: 30 },
      site: { site_name: 'Aicho Muse', announcement: '' },
      tts: { voice_uri: '', rate: 1, pitch: 1 },
    },
    admin_users: [
      { id: 'admin-root', username: 'admin', password_hash: '$2a$10$zi2vYGtrKf4SyKDjvOiMH.7hP4GRKmKDUEU8ZEoRto41GXYdCuymq', role: 'superadmin', created_at: now },
    ],
    memories: [],
    outline_nodes: [],
    character_cards: [],
    timeline_events: [],
    idea_notes: [],
    stats: { conversations_created: 0, messages_sent: 0, projects_created: 0 },
  };
}

let cache = null;

export function mysqlMode() {
  return !!(process.env.MYSQL_HOST || process.env.DB_HOST);
}

export async function initStorage() {
  loadDb();
  if (mysqlMode()) {
    const m = await import('./mysql.js');
    await m.mysqlLoad(cache);
    m.startPeriodicFlush(cache);
    console.log('[DB] MySQL 模式已启用（2 秒周期落库）');
  } else {
    console.log('[DB] JSON 文件模式（设置 MYSQL_HOST 可切换 MySQL）');
  }
}

export function loadDb() {
  if (cache) return cache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    cache = seed();
    saveDb();
  } else {
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const s = seed();
      for (const k of Object.keys(s)) if (!(k in cache)) cache[k] = s[k];
    } catch {
      cache = seed();
    }
  }
  return cache;
}

export function saveDb() {
  if (!cache) return;
  if (mysqlMode()) {
    import('./mysql.js').then(m => m.mysqlScheduleSave(cache)).catch(e => console.error('[DB] MySQL 调度失败:', e.message));
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function db() { return loadDb(); }

export function resetDb() {
  cache = seed();
  saveDb();
  return cache;
}
