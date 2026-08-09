import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { encryptChapters, decryptChapters } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
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
      voice_profile_id: 'preset-voice-warm',
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
      voice_profile_id: 'preset-voice-clear',
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
      voice_profile_id: 'preset-voice-deep',
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
      voice_profile_id: 'preset-voice-lively',
      avatar_color: '#6b8e6b',
      version: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-elysia',
      name: '爱莉希雅',
      tagline: '活泼开朗的粉色妖精',
      background: '拥有粉色长发、天仙般美丽的少女，乐土英桀第二位，伊甸与阿波尼亚最好的朋友。活泼开朗可爱，深爱着世界与所有人，是逐火英桀的创立者与维系十三人的核心。',
      personality: ['活泼', '开朗', '可爱', '真诚', '调皮', '自恋', '自由自在'],
      speaking_style: { tone: '轻快灵动', preferences: ['善用轻佻的举止互动', '活跃气氛迅速拉近关系', '在关键之处戛然而止留下暗示的笑容', '充满热情拥抱每一天'], avoid: ['冷漠', '说教', '沉闷'] },
      values: ['深爱世界与所有人', '凡事任凭心意而为', '只在有趣的事上花心思'],
      relationship: '真诚热情的朋友',
      expertise: ['情感陪伴', '活跃气氛', '创作灵感', '故事分享'],
      greeting: '嗨～我是爱莉希雅！今天想和我分享什么有趣的故事呀？♪',
      is_preset: true,
      voice_profile_id: 'preset-voice-elysia',
      avatar_color: '#FF6B9D',
      version: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'preset-zhuangfangyi',
      name: '庄方宜',
      tagline: '武陵科学发展区管代 · 麒麟天师',
      background: '《明日方舟：终末地》宏山科学院麒麟族干员，武陵科学发展区管代，息壤新材项目负责天师。出身宏山，自幼天赋非凡，未成年便以优异成绩进入天师府学院，后被选拔加入息壤项目，成为武陵科考站最年轻的成员。一场灾难中科考站几乎全军覆没，资历最浅的她被推上台前担任管代，背负起整个武陵。临危受命后很快振作，十年间建设起繁荣的武陵城，成为尽职尽责的领袖。擅长雷法与御剑术，能咬牙坚持就不算输。',
      personality: ['温柔', '可靠', '沉稳', '坚毅', '苦劳人', '反差萌', '重视同伴'],
      speaking_style: { tone: '沉稳而亲和', preferences: ['用行动和担当说话', '偶尔露出忙里偷闲的松弛', '鼓励对方坚持', '对重视的人格外温柔'], avoid: ['空话套话', '过度沉重', '说教'] },
      values: ['人还在，那就什么都在', '能咬牙坚持下来，就不算输', '守护重于个人得失'],
      relationship: '同行的战友与引路人',
      expertise: ['雷法', '御剑术', '城市治理', '裂隙研究', '教导徒弟', '故事讲述'],
      greeting: '能咬牙坚持下来，就不算输。今天想写点什么？我陪你。',
      is_preset: true,
      voice_profile_id: 'preset-voice-zhuangfangyi',
      avatar_color: '#3e5f4a',
      version: 1,
      created_at: now,
      updated_at: now,
    },
  ];
  const presetVoices = [
    { id: 'preset-voice-warm', display_name: '温润男声（夏彦）', provider: 'fish-audio', voice_id: '5961991a10ad447bbc245a04d361bf65', params: { rate: 0.95, pitch: 0, emotion: 'warm', energy: 0.6 }, is_preset: true, created_at: now, updated_at: now },
    { id: 'preset-voice-clear', display_name: '清亮女声（花火）', provider: 'fish-audio', voice_id: '9e8cdae701d1473c8454d0922b41e78d', params: { rate: 1.0, pitch: 1.1, emotion: 'bright', energy: 0.7 }, is_preset: true, created_at: now, updated_at: now },
    { id: 'preset-voice-deep', display_name: '低沉中性声（钟离）', provider: 'fish-audio', voice_id: 'ad10ca12fec5405ea22d6ca2379d8963', params: { rate: 0.9, pitch: -0.5, emotion: 'serious', energy: 0.5 }, is_preset: true, created_at: now, updated_at: now },
    { id: 'preset-voice-lively', display_name: '元气轻快声（萧逸）', provider: 'fish-audio', voice_id: 'b47aa24773514256b132f04e5c92d92d', params: { rate: 1.1, pitch: 0.6, emotion: 'cheerful', energy: 0.8 }, is_preset: true, created_at: now, updated_at: now },
    { id: 'preset-voice-elysia', display_name: '爱莉希雅', provider: 'fish-audio', voice_id: 'f06ed9ea97004b45ae790daf61a7f4c0', source: 'fish-library', params: { rate: 1, pitch: 0, emotion: 'sweet', energy: 0.6 }, speech_notes: 'A young female voice with a sweet, gentle, and breathy tone. It features an expressive, intimate quality perfect for character narration and melodic storytelling.', is_preset: true, created_at: now, updated_at: now },
    { id: 'preset-voice-zhuangfangyi', display_name: '庄方宜', provider: 'fish-audio', voice_id: 'c47fb727c55540fab4b55139c3f3bc3a', source: 'fish-library', params: { rate: 1, pitch: 0, emotion: 'calm', energy: 0.6 }, speech_notes: '一位声线沉稳、经验丰富的女性，擅长应对挑战并提供专业的建议，语调中带有一丝亲和与幽默。', is_preset: true, created_at: now, updated_at: now },
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
      quota: { daily_messages: 100, messages_per_minute: 30, tts_per_hour: 60, stt_minutes_per_day: 30 },
      site: { site_name: 'Aicho Muse', announcement: '', allow_registration: true, registration_message: '', default_persona_id: '', default_voice_id: '' },
      tts: { provider: 'fish-audio', voice_uri: '', rate: 1, pitch: 1, api_key: '', base_url: 'https://api.fish.audio', model: 's2.1-pro-free', no_save_audio: false },
      stt: { api_key: '', base_url: '', model: 'whisper-1', no_save_audio: false },
      voice_clone: { api_key: '', base_url: '', model: 'fishaudio/fish-speech-1.5' },
    },
    admin_users: [
      { id: 'admin-root', username: 'admin', password_hash: '$2a$10$zi2vYGtrKf4SyKDjvOiMH.7hP4GRKmKDUEU8ZEoRto41GXYdCuymq', role: 'superadmin', created_at: now },
    ],
    memories: [],
    feedback: [],
    outline_nodes: [],
    character_cards: [],
    timeline_events: [],
    idea_notes: [],
    citations: [],
    shares: [],
    reference_docs: [],
    reference_chunks: [],
    trash: [],
    agent_logs: [],
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
    m.startPresetRefresh(cache);
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
      decryptChapters(cache);
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
  encryptChapters(cache);
  try {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } finally {
    decryptChapters(cache);
  }
}

export function db() { return loadDb(); }

// 内置官方预设（seed 中 is_preset 的条目），供 MySQL 永久表初始化/补全
export function seedPresets() {
  const s = seed();
  return {
    personas: s.personas.filter((p) => p.is_preset),
    voices: s.voices.filter((v) => v.is_preset),
  };
}

// 官方预设的永久持久化：MySQL 模式下实时写入 presets 表；
// JSON 文件模式退化为全量保存。与用户数据落库完全分离，互不影响。
export function persistPreset(kind, row) {
  if (mysqlMode()) {
    import('./mysql.js')
      .then((m) => m.mysqlUpsertPreset(kind, row))
      .catch((e) => console.error('[DB] 预设永久落库失败:', e.message));
  } else {
    saveDb();
  }
}

export function unpersistPreset(kind, id) {
  if (mysqlMode()) {
    import('./mysql.js')
      .then((m) => m.mysqlDeletePreset(kind, id))
      .catch((e) => console.error('[DB] 预设永久删除失败:', e.message));
  } else {
    saveDb();
  }
}

// 章节历史版本：只保存文章内容，每个章节最多保留最新 MAX_SNAPSHOTS 条；
// 返回 { pushed, unchanged } 便于调用方判断是否有差异。
export const MAX_SNAPSHOTS = 50;

export function latestSnapshotOf(d, chapterId) {
  return d.snapshots
    .filter((s) => s.chapter_id === chapterId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
}

export function pushChapterSnapshot(d, chapterId, content, note) {
  const now = new Date().toISOString();
  const latest = latestSnapshotOf(d, chapterId);
  // 保存前校验：跟上个版本没有差异则不保存
  if (latest && latest.content === content) {
    return { pushed: false, unchanged: true };
  }
  d.snapshots.push({
    id: uuid(),
    chapter_id: chapterId,
    content,
    note: note || '保存版本',
    created_at: now,
  });
  // 只保留该章节最新 50 条，超出自动删除最旧的（不影响其他章节）
  const mine = d.snapshots.filter((s) => s.chapter_id === chapterId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (mine.length > MAX_SNAPSHOTS) {
    const keep = new Set(mine.slice(0, MAX_SNAPSHOTS).map((s) => s.id));
    d.snapshots = d.snapshots.filter((s) => s.chapter_id !== chapterId || keep.has(s.id));
  }
  return { pushed: true, unchanged: false };
}

export function resetDb() {
  cache = seed();
  saveDb();
  return cache;
}
