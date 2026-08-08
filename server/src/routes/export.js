import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRequired } from '../auth.js';
import { db } from '../db.js';
import { findProject } from '../access.js';

const router = Router();
router.use(authRequired);

function projectChapters(req, id) {
  const d = db();
  const f = findProject(req, id);
  if (!f) return null;
  const p = f.p;
  const chapters = d.chapters.filter(c => c.project_id === p.id).sort((a, b) => a.order_index - b.order_index);
  return { project: p, chapters };
}

function mdEscape(s = '') { return s.replace(/\r\n/g, '\n').trim(); }

// 论文模式：引用格式标签 + 参考文献列表
function citationStyleLabel(project) {
  return { gb7714: 'GB/T 7714', apa: 'APA', mla: 'MLA' }[project.citation_style] || 'GB/T 7714';
}
function projectCitations(projectId) {
  return db().citations.filter(c => c.project_id === projectId).sort((a, b) => a.order_index - b.order_index);
}
function citationLine(c, idx) {
  return '[' + idx + '] ' + (c.raw || [c.authors, c.title, c.source, c.year].filter(Boolean).join('. '));
}
function paperKeywords(project) {
  return Array.isArray(project.keywords) && project.keywords.length ? project.keywords.join('、') : '';
}

router.get('/projects/:id/markdown', (req, res) => {
  const data = projectChapters(req, req.params.id);
  if (!data) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const { project: p, chapters } = data;
  const parts = [`# ${p.title}\n`, `> 体裁：${p.genre} ｜ 主题：${p.theme || '未设置'}\n`, ''];
  if (p.genre === 'paper') {
    if (p.abstract) parts.push(`> 摘要：${p.abstract.replace(/\n/g, ' ')}\n`);
    const kw = paperKeywords(p);
    if (kw) parts.push(`> 关键词：${kw}\n`);
    parts.push(`> 引用格式：${citationStyleLabel(p)}\n`, '');
  }
  for (const ch of chapters) { parts.push(`## ${ch.title}\n`); if (ch.content) parts.push(mdEscape(ch.content)); parts.push(''); }
  if (p.genre === 'paper') {
    const cites = projectCitations(p.id);
    if (cites.length) {
      parts.push('## 参考文献\n');
      cites.forEach((c, i) => parts.push(citationLine(c, i + 1) + '\n'));
      parts.push('');
    }
  }
  const md = parts.join('\n');
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`${p.title}.md`)}"`);
  res.send(md);
});

// DOCX 导出（docx 纯 JS 库）
router.get('/projects/:id/docx', async (req, res) => {
  const data = projectChapters(req, req.params.id);
  if (!data) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const { project: p, chapters } = data;
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
    const children = [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: p.title, bold: true, size: 36 })], alignment: AlignmentType.CENTER }),
      new Paragraph({ children: [new TextRun({ text: `体裁：${p.genre} ｜ 主题：${p.theme || '未设置'}`, size: 18, color: '666666' })] }),
      new Paragraph({ children: [] }),
    ];
    if (p.genre === 'paper') {
      if (p.abstract) children.push(new Paragraph({ children: [new TextRun({ text: '摘要：' + p.abstract, size: 20, color: '444444' })] }));
      const kw = paperKeywords(p);
      if (kw) children.push(new Paragraph({ children: [new TextRun({ text: '关键词：' + kw, size: 20, color: '444444' })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: '引用格式：' + citationStyleLabel(p), size: 20, color: '444444' })] }));
      children.push(new Paragraph({ children: [] }));
    }
    for (const ch of chapters) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: ch.title, bold: true, size: 28 })] }));
      const lines = (ch.content || '').split('\n');
      for (const line of lines) {
        if (!line.trim()) { children.push(new Paragraph({ children: [] })); continue; }
        const t = line.trim();
        if (t.startsWith('# ')) children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t.slice(2), size: 28 })] }));
        else if (t.startsWith('## ')) children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t.slice(3), size: 24 })] }));
        else if (t.startsWith('- ')) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: t.slice(2), size: 21 })] }));
        else children.push(new Paragraph({ children: [new TextRun({ text: line, size: 21 })], spacing: { after: 120 } }));
      }
      children.push(new Paragraph({ children: [] }));
    }
    if (p.genre === 'paper') {
      const cites = projectCitations(p.id);
      if (cites.length) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '参考文献', bold: true, size: 28 })] }));
        cites.forEach((c, i) => children.push(new Paragraph({ children: [new TextRun({ text: citationLine(c, i + 1), size: 21 })], spacing: { after: 80 } })));
        children.push(new Paragraph({ children: [] }));
      }
    }
    const doc = new Document({ sections: [{ children }] });
    const buf = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`${p.title}.docx`)}"`);
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ code: 50001, message: 'DOCX 导出失败: ' + e.message });
  }
});

// PDF 导出（pdfkit，中文用系统字体）
router.get('/projects/:id/pdf', async (req, res) => {
  const data = projectChapters(req, req.params.id);
  if (!data) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const { project: p, chapters } = data;
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: 56, right: 56 } });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', () => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`${p.title}.pdf`)}"`);
    res.send(Buffer.concat(chunks));
  });
  // 中文字体：仓库内置思源黑体（本地/Docker 通用），找不到则回退系统字体
  const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
  const fonts = [
    path.join(__dirname2, '..', '..', 'fonts', 'NotoSansSC-Regular.otf'),
    '/app/fonts/NotoSansSC-Regular.otf',
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/System/Library/Fonts/Supplemental/Songti.ttc',
  ];
  let fontLoaded = false;
  for (const f of fonts) {
    try { doc.font(f); fontLoaded = true; break; } catch (e) { if (!fontLoaded) console.error('[PDF] 字体加载失败: ' + f + ' -> ' + e.message); }
  }
  if (!fontLoaded) console.error('[PDF] 所有中文字体加载失败，将使用默认字体（中文可能无法显示）');
  doc.fontSize(26).text(p.title, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#666666').text(`体裁：${p.genre} ｜ 主题：${p.theme || '未设置'}`, { align: 'center' });
  doc.moveDown();
  if (p.genre === 'paper') {
    if (p.abstract) { doc.fontSize(11).fillColor('#333333').text('摘要：' + p.abstract, { lineGap: 2 }); doc.moveDown(0.3); }
    const kw = paperKeywords(p);
    if (kw) { doc.fontSize(11).fillColor('#333333').text('关键词：' + kw); doc.moveDown(0.3); }
    doc.fontSize(11).fillColor('#666666').text('引用格式：' + citationStyleLabel(p));
    doc.moveDown();
  }
  for (const ch of chapters) {
    doc.fillColor('#000000').fontSize(18).text(ch.title, { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(12).fillColor('#222222');
    const lines = (ch.content || '').split('\n');
    for (const line of lines) {
      if (!line.trim()) { doc.moveDown(0.25); continue; }
      doc.text(line, { lineGap: 3 });
    }
    doc.moveDown();
  }
  if (p.genre === 'paper') {
    const cites = projectCitations(p.id);
    if (cites.length) {
      doc.fillColor('#000000').fontSize(18).text('参考文献', { align: 'center' });
      doc.moveDown(0.4);
      doc.fontSize(11).fillColor('#222222');
      cites.forEach((c, i) => doc.text(citationLine(c, i + 1), { lineGap: 2 }));
    }
  }
  doc.end();
});

export default router;
