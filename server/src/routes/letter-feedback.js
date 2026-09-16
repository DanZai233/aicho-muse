// 信笺(letter.danzaii.cn)反馈代理:管理员鉴权后转发到信笺应用的反馈 API
// 服务端持有 LETTER_FEEDBACK_TOKEN(信笺侧 FEEDBACK_ADMIN_TOKEN),浏览器不暴露
import { Router } from 'express';
import { adminRequired } from '../auth.js';

const router = Router();
router.use(adminRequired);

const LETTER_BASE = process.env.LETTER_BASE_URL || 'https://letter.danzaii.cn';
const LETTER_TOKEN = process.env.LETTER_FEEDBACK_TOKEN || '';
// 生成对外分享链接用的域名（信笺站点公网地址）
const SHARE_BASE = String(process.env.LETTER_PUBLIC_URL || process.env.LETTER_BASE_URL || 'https://letter.imuse.chat').replace(/\/+$/, '');

async function proxyFetch(path, opts = {}) {
  const r = await fetch(LETTER_BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': LETTER_TOKEN,
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await r.json(); } catch { data = { code: -1, message: '信笺响应解析失败' }; }
  if (!r.ok || (data.code && data.code !== 0)) {
    const err = new Error(data.message || ('信笺请求失败 ' + r.status));
    err.status = r.status === 403 ? 502 : r.status;
    throw err;
  }
  return data.data;
}

// 拉取信笺反馈列表(?status=new / done)
router.get('/letter-feedback', async (req, res) => {
  if (!LETTER_TOKEN) return res.status(500).json({ code: 50001, message: '服务端未配置 LETTER_FEEDBACK_TOKEN' });
  try {
    const q = new URLSearchParams();
    if (req.query.status) q.set('status', String(req.query.status));
    if (req.query.limit) q.set('limit', String(req.query.limit));
    const data = await proxyFetch('/api/v1/feedback?' + q.toString());
    res.json({ code: 0, data });
  } catch (e) {
    res.status(e.status || 502).json({ code: 50201, message: '信笺反馈拉取失败：' + e.message });
  }
});

// 标记信笺反馈已处理
router.patch('/letter-feedback/:id', async (req, res) => {
  if (!LETTER_TOKEN) return res.status(500).json({ code: 50001, message: '服务端未配置 LETTER_FEEDBACK_TOKEN' });
  try {
    const data = await proxyFetch('/api/v1/feedback/' + req.params.id, {
      method: 'PATCH',
      body: JSON.stringify({ status: req.body?.status === 'done' ? 'done' : 'new' }),
    });
    res.json({ code: 0, data });
  } catch (e) {
    res.status(e.status || 502).json({ code: 50201, message: '信笺反馈更新失败：' + e.message });
  }
});

// 信笺写信量统计（近 days 天每日写信数）
router.get('/letter-stats', async (req, res) => {
  if (!LETTER_TOKEN) return res.status(500).json({ code: 50001, message: '服务端未配置 LETTER_FEEDBACK_TOKEN' });
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    const data = await proxyFetch('/api/v1/stats/letters?days=' + days);
    res.json({ code: 0, data });
  } catch (e) {
    res.status(e.status || 502).json({ code: 50201, message: '信笺统计拉取失败：' + e.message });
  }
});

// 信笺信件列表（管理端查看全部信件，含分享链接）
// 分享链接用对外可访问的域名拼好（优先 LETTER_PUBLIC_URL，其次 LETTER_BASE_URL）
router.get('/letter-letters', async (req, res) => {
  if (!LETTER_TOKEN) return res.status(500).json({ code: 50001, message: '服务端未配置 LETTER_FEEDBACK_TOKEN' });
  try {
    const q = new URLSearchParams();
    for (const k of ['status', 'shared', 'q', 'page', 'page_size']) {
      const v = req.query[k];
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    const data = await proxyFetch('/api/v1/admin/letters?' + q.toString());
    const list = (data.list || []).map(it => ({
      ...it,
      share_url: it.share_path ? SHARE_BASE + it.share_path : null,
    }));
    res.json({ code: 0, data: { ...data, list } });
  } catch (e) {
    res.status(e.status || 502).json({ code: 50201, message: '信笺信件拉取失败：' + e.message });
  }
});

// 信笺单封信详情（含完整原文、回信与分享链接）
router.get('/letter-letters/:id', async (req, res) => {
  if (!LETTER_TOKEN) return res.status(500).json({ code: 50001, message: '服务端未配置 LETTER_FEEDBACK_TOKEN' });
  try {
    const data = await proxyFetch('/api/v1/admin/letters/' + encodeURIComponent(req.params.id));
    const lt = data.letter || {};
    res.json({ code: 0, data: { letter: { ...lt, share_url: lt.share_path ? SHARE_BASE + lt.share_path : null } } });
  } catch (e) {
    res.status(e.status || 502).json({ code: 50201, message: '信笺信件详情拉取失败：' + e.message });
  }
});

export default router;
