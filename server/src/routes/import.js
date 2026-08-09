import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { extractText } from '../textlib.js';
import { authRequired } from '../auth.js';
import { db, saveDb, uuid } from '../db.js';
import { callLLM } from '../ai.js';
import { canView, canEdit } from '../access.js';

const router = Router();
router.use(authRequired);

// 文件上传：内存存储，限制 20MB，只接受单个 file 字段
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

const GENRES = ['biography', 'fiction', 'prose', 'poetry', 'script', 'paper'];

function projectOf(id) { return id ? db().projects.find(p => p.id === id) : null; }

// 切分章节：支持 Markdown 标题（#/##/###）与中文"第X章/回/节"两种结构。
// 若文档第一个标题是 #（一级），视为作品标题而非章节。
function splitChapters(text) {
  const lines = text.split(/\r?\n/);
  const chapters = [];
  let projTitle = '';
  let current = null;
  let firstHeading = true;
  let cnHeadings = 0;
  const flush = () => {
    if (!current) return;
    current.content = current.content.replace(/\n{3,}/g, '\n\n').trim();
    if (current.content || current.title.trim()) chapters.push(current);
    current = null;
  };
  for (const raw of lines) {
    const h = raw.match(/^(#{1,3})\s+(.+)$/);
    const cn = raw.match(/^\s*第\s*([0-9一二三四五六七八九十百千万两]+)\s*[章回节卷]\s*[：:、．.\s]*(.*)$/);
    if (h) {
      if (firstHeading && h[1] === '#') { projTitle = h[2].trim(); firstHeading = false; continue; }
      firstHeading = false;
      flush();
      current = { title: h[2].trim() || '章节', content: '' };
      continue;
    }
    if (cn) {
      cnHeadings++;
      flush();
      current = { title: (cn[2] || '').trim() ? raw.trim() : ('第' + cn[1] + '章'), content: '' };
      continue;
    }
    if (!current) current = { title: '', content: '' };
    current.content += raw + '\n';
  }
  flush();
  // 中文"第X章"标题少于 2 个时，视为普通文档，合并为单章
  if (cnHeadings > 0 && chapters.length <= 1) {
    const all = chapters.map(c => c.title ? c.title + '\n' + c.content : c.content).join('\n\n').trim();
    chapters.splice(0, chapters.length, { title: '导入内容', content: all });
  }
  if (!chapters.length && text.trim()) chapters.push({ title: '导入内容', content: text.trim() });
  let idx = 1;
  for (const ch of chapters) { if (!ch.title.trim()) ch.title = '第 ' + idx + ' 节'; idx++; }
  return { projTitle, chapters };
}

// 让 AI 根据导入内容生成大纲（写入 outline_nodes）
async function aiOutline(project, chapters) {
  const sample = chapters.slice(0, 20).map(c => (c.title ? c.title + '：' : '') + (c.content || '').slice(0, 200)).join('\n');
  const messages = [
    { role: 'system', content: '你是文学/学术编辑。请根据用户导入的作品内容生成一份大纲。只输出 JSON 数组，不要任何其他文字或 markdown 代码块。' },
    { role: 'user', content: '作品《' + project.title + '》（体裁：' + project.genre + '）\n\n内容概览：\n' + sample.slice(0, 6000) + '\n\n请生成 5-12 个大纲节点，每个节点：{"title":"节点标题","summary":"2-3 句内容概括或写作提示"}。' },
  ];
  const raw = await callLLM(messages, { temperature: 0.3, max_tokens: 2000 });
  if (!raw) return 0;
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  let items = [];
  try { items = JSON.parse(cleaned); } catch { try { items = JSON.parse(cleaned.slice(cleaned.indexOf('['), cleaned.lastIndexOf(']') + 1)); } catch { return 0; } }
  if (!Array.isArray(items)) return 0;
  const d = db();
  const now = new Date().toISOString();
  const chapterByTitle = new Map(chapters.map((c, i) => [c.title, i]));
  let order = d.outline_nodes.filter(n => n.project_id === project.id).reduce((m, n) => Math.max(m, n.order_index), -1);
  let count = 0;
  for (const it of items.slice(0, 15)) {
    const title = String(it.title || it.name || '').trim();
    if (!title) continue;
    const chIdx = chapterByTitle.get(title);
    d.outline_nodes.push({
      id: uuid(), project_id: project.id, parent_id: null,
      title, summary: String(it.summary || it.description || '').trim(),
      order_index: ++order, chapter_id: chIdx !== undefined && chIdx >= 0 ? chapters[chIdx].id : null,
      created_at: now, updated_at: now,
    });
    count++;
  }
  if (count > 0) saveDb();
  return count;
}

// 导入文件：mode=new 新建作品；mode=existing 追加到已有作品
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ code: 40001, message: '请选择要导入的文件' });
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!['.docx', '.md', '.markdown', '.txt'].includes(ext)) {
      return res.status(400).json({ code: 40001, message: '仅支持导入 Word（.docx）、Markdown（.md）或纯文本（.txt）文件' });
    }
    const b = req.body || {};
    const mode = b.mode === 'existing' ? 'existing' : 'new';
    const aiOutlineOn = b.ai_outline === '1' || b.ai_outline === 'true';
    const aiKnowledgeOn = b.ai_knowledge === '1' || b.ai_knowledge === 'true';

    const text = await extractText(req.file);
    if (!text.trim()) return res.status(400).json({ code: 40001, message: '文件内容为空，无法导入' });
    const { projTitle, chapters } = splitChapters(text);
    const baseName = path.basename(req.file.originalname || '导入作品', ext);

    const d = db();
    const now = new Date().toISOString();
    let project = null;
    let created = false;

    if (mode === 'existing') {
      project = projectOf(b.project_id);
      if (!project || !canView(req, project)) return res.status(404).json({ code: 40401, message: '目标作品不存在' });
      if (!canEdit(req, project)) return res.status(403).json({ code: 40301, message: '没有编辑权限' });
    } else {
      const genre = GENRES.includes(b.genre) ? b.genre : 'fiction';
      const title = String(b.title || projTitle || baseName || '导入的作品').trim().slice(0, 80);
      project = {
        id: uuid(), user_id: req.user.id, title, genre,
        language: b.language || 'zh-CN', theme: b.theme || '', target_audience: '', goal_word_count: 0,
        status: 'drafting', default_persona_id: b.default_persona_id || null, team_persona_ids: [],
        subtitle: '', author_name: '', cover_color: b.cover_color || '#8b7d6b',
        abstract: '', keywords: [], citation_style: 'gb7714',
        created_at: now, updated_at: now,
      };
      d.projects.push(project);
      d.stats.projects_created++;
      created = true;
    }

    // 写入章节（追加模式从现有最大 order 继续）
    let maxOrder = d.chapters.filter(c => c.project_id === project.id).reduce((m, c) => Math.max(m, c.order_index), -1);
    const createdChapters = [];
    const titleFallback = chapters.length > 1 ? '' : ('导入：' + baseName);
    for (const ch of chapters) {
      const title = ch.title || titleFallback || ('第 ' + (maxOrder + 2) + ' 章');
      const row = {
        id: uuid(), project_id: project.id, title,
        content: ch.content || '', order_index: ++maxOrder,
        status: 'draft', word_count: (ch.content || '').length,
        created_at: now, updated_at: now,
      };
      d.chapters.push(row);
      createdChapters.push(row);
    }
    project.updated_at = now;
    saveDb();

    // 可选 AI 后处理（失败不阻塞导入结果）
    let outlineCount = 0;
    let knowledgeCount = 0;
    if (aiOutlineOn) {
      try { outlineCount = await aiOutline(project, createdChapters); }
      catch (e) { console.error('[Import] AI 大纲生成失败:', e.message); }
    }
    if (aiKnowledgeOn) {
      try { knowledgeCount = await aiKnowledge(req.user.id, project, createdChapters); }
      catch (e) { console.error('[Import] AI 知识库提取失败:', e.message); }
    }

    res.json({
      code: 0, data: {
        project, chapters: createdChapters, created,
        total_words: createdChapters.reduce((s, c) => s + c.word_count, 0),
        outline_generated: outlineCount, knowledge_generated: knowledgeCount,
      },
    });
  } catch (e) {
    console.error('[Import] 导入失败:', e.message);
    res.status(500).json({ code: 50001, message: '导入失败：' + e.message });
  }
});

export default router;

// 让 AI 从导入内容中提取"知识库"记忆（写入 memories，助手后续会自动参考）
async function aiKnowledge(userId, project, chapters) {
  const sample = chapters.slice(0, 10).map(c => (c.title ? c.title + '：' : '') + (c.content || '').slice(0, 300)).join('\n');
  const messages = [
    { role: 'system', content: '你是创作助手的数据整理器。请从用户导入的作品内容中提取对后续创作最有用的信息：核心设定、人物关系、关键情节、写作风格、背景知识等。只输出 JSON 数组，不要任何其他文字或 markdown 代码块。' },
    { role: 'user', content: '作品《' + project.title + '》内容：\n' + sample.slice(0, 6000) + '\n\n请输出 4-8 条记忆：{"content":"一条完整、自包含的记忆描述（30-80字）","importance":1-5整数}。' },
  ];
  const raw = await callLLM(messages, { temperature: 0.3, max_tokens: 2000 });
  if (!raw) return 0;
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  let items = [];
  try { items = JSON.parse(cleaned); } catch { try { items = JSON.parse(cleaned.slice(cleaned.indexOf('['), cleaned.lastIndexOf(']') + 1)); } catch { return 0; } }
  if (!Array.isArray(items)) return 0;
  const d = db();
  const now = new Date().toISOString();
  let count = 0;
  for (const it of items.slice(0, 10)) {
    const content = String(it.content || '').trim();
    if (!content) continue;
    d.memories.push({
      id: uuid(), user_id: userId, project_id: project.id, scope: 'project',
      key: it.key || '导入知识', content,
      importance: Math.max(1, Math.min(5, Number(it.importance) || 3)),
      source: 'import', created_at: now,
    });
    count++;
  }
  if (count > 0) saveDb();
  return count;
}
