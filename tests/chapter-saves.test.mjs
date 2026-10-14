import test from 'node:test';
import assert from 'node:assert/strict';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../web/src/lib/chapterSaves.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { ChapterSaves } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const base = { id: 'one', project_id: 'p', title: '第一章', content: '原文', updated_at: '2026-01-01', word_count: 2 };
function setup(save) {
  const events = [], drafts = new Map();
  const queue = new ChapterSaves({ save, change: (chapter, state) => events.push({ chapter, state }), draft: (ch, b) => drafts.set(ch.id, { ch, b }), clear: id => drafts.delete(id) });
  queue.receive(base);
  return { queue, events, drafts };
}
test('serial saves preserve edits made while a response is delayed', async () => {
  const requests = [];
  const { queue, drafts } = setup((ch, b) => new Promise(resolve => requests.push({ ch, b, resolve })));
  queue.edit({ ...base, content: '第一次编辑' });
  const pending = queue.flush(base.id);
  queue.edit({ ...base, content: '较新的正文', title: '新的章节名' });
  assert.equal(requests.length, 1);
  requests[0].resolve({ ...requests[0].ch, updated_at: '2026-01-02' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(queue.current(base.id).content, '较新的正文');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].b.content, '第一次编辑');
  requests[1].resolve({ ...requests[1].ch, updated_at: '2026-01-03' });
  await pending;
  assert.equal(queue.state(base.id), 'saved'); assert.equal(drafts.size, 0);
  assert.equal(queue.current(base.id).title, '新的章节名');
  queue.stopTimers();
});
test('late project fetches and remote content cannot replace a dirty or newer buffer', async () => {
  const { queue } = setup(async ch => ({ ...ch, updated_at: '2026-01-03' }));
  const version = queue.capture().get(base.id);
  queue.edit({ ...base, content: '本地新正文' });
  assert.equal(queue.receive({ ...base, content: '旧服务端正文' }, version).content, '本地新正文');
  await queue.flush(base.id);
  assert.equal(queue.receive(base, version).content, '本地新正文');
  queue.stopTimers();
});
test('conflicts preserve draft and require explicit rebase before overwrite', async () => {
  let conflict = true;
  const { queue, drafts } = setup(async ch => { if (conflict) throw Object.assign(new Error('conflict'), { status: 409 }); return ch; });
  queue.edit({ ...base, title: '改名', content: '保留我的修改' });
  await assert.rejects(queue.flush(base.id));
  assert.equal(queue.state(base.id), 'conflict'); assert.equal(drafts.get(base.id).ch.content, '保留我的修改');
  assert.equal(queue.receive({ ...base, content: '协作者修改' }).content, '保留我的修改');
  conflict = false;
  await queue.rebase(base.id, { ...base, content: '协作者修改' });
  assert.equal(queue.state(base.id), 'saved');
  queue.stopTimers();
});
test('switching chapters does not redirect or discard a pending save', async () => {
  const saved = [];
  const { queue } = setup(async ch => { saved.push(ch); return ch; });
  queue.edit({ ...base, title: '仅改标题' });
  queue.receive({ ...base, id: 'two', content: '第二章正文' });
  await queue.flush('one');
  assert.equal(saved[0].id, 'one'); assert.equal(saved[0].title, '仅改标题');
  assert.equal(queue.current('two').content, '第二章正文');
  queue.stopTimers();
});
