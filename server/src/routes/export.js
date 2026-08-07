import { Router } from 'express';
import { authRequired } from '../auth.js';
import { db } from '../db.js';

const router = Router();
router.use(authRequired);

function projectChapters(req, id) {
  const d = db();
  const p = d.projects.find(x => x.id === id && x.user_id === req.user.id);
  if (!p) return null;
  const chapters = d.chapters.filter(c => c.project_id === p.id).sort((a, b) => a.order_index - b.order_index);
  return { project: p, chapters };
}

function mdEscape(s = '') { return s.replace(/\r\n/g, '\n').trim(); }

router.get('/projects/:id/markdown', (req, res) => {
  const data = projectChapters(req, req.params.id);
  if (!data) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const { project: p, chapters } = data;
  const parts = [`# ${p.title}\n`, `> 体裁：${p.genre} ｜ 主题：${p.theme || '未设置'}\n`, ''];
  for (const ch of chapters) { parts.push(`## ${ch.title}\n`); if (ch.content) parts.push(mdEscape(ch.content)); parts.push(''); }
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
router.get('/projects/:id/pdf', (req, res) => {
  const data = projectChapters(req, req.params.id);
  if (!data) return res.status(404).json({ code: 40401, message: '作品不存在' });
  const { project: p, chapters } = data;
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: 56, right: 56 } });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', () => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`${p.title}.pdf`)}"`);
    res.send(Buffer.concat(chunks));
  });
  // 中文字体：优先系统 PingFang，找不到则用内置 Helvetica（中文可能显示为方块）
  const fonts = [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/System/Library/Fonts/Supplemental/Songti.ttc',
  ];
  let fontLoaded = false;
  for (const f of fonts) {
    try { doc.font(f, 'PingFangSC-Regular'); fontLoaded = true; break; } catch { /* try next */ }
  }
  doc.fontSize(26).text(p.title, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#666666').text(`体裁：${p.genre} ｜ 主题：${p.theme || '未设置'}`, { align: 'center' });
  doc.moveDown();
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
  doc.end();
});

export default router;
