import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('rename persists; stale editor/tool writes are rejected; polished text replaces original once', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'muse-feedback-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  process.env.DATA_DIR = dir;
  delete process.env.MYSQL_HOST; delete process.env.DB_HOST;
  const { default: express } = await import('../server/node_modules/express/index.js');
  const { db, initStorage } = await import('../server/src/db.js');
  await initStorage();
  db().users.push({ id: 'feedback-test-owner', status: 'active' });
  db().projects.push({ id: 'feedback-test-project', user_id: 'feedback-test-owner', collaborators: [] });
  db().chapters.push({ id: 'feedback-test-chapter', project_id: 'feedback-test-project', title: '原始标题', content: '这是原始正文。', word_count: 8 });
  const { signToken } = await import('../server/src/auth.js');
  const token = signToken({ id: 'feedback-test-owner' });
  const chapters = (await import('../server/src/routes/chapters.js')).default;
  const tools = (await import('../server/src/routes/tools.js')).default;
  const { getRoom } = await import('../server/src/realtime/rooms.js');
  const broadcasts = [];
  getRoom('feedback-test-project', 'feedback-test-chapter').add('observer', { readyState: 1, send: x => broadcasts.push(JSON.parse(x)) }, { id: 'observer' });
  const app = express(); app.use(express.json()); app.use(chapters); app.use('/tools', tools);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function request(route, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}` + route, { method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, ...(await response.json()) };
  }
  await request('/chapters/feedback-test-chapter');
  assert.equal(broadcasts.length, 0, 'reads must not trigger recursive broadcasts');
  const renamed = await request('/chapters/feedback-test-chapter', 'PATCH', { title: '新的标题', base_content: '这是原始正文。', base_title: '原始标题' });
  assert.equal(renamed.data.chapter.title, '新的标题');
  assert.equal(broadcasts[0].persisted, true);
  assert.equal((await request('/chapters/feedback-test-chapter')).data.chapter.title, '新的标题');
  assert.equal((await request('/chapters/feedback-test-chapter', 'PATCH', { content: '旧请求正文', base_content: '更早的正文' })).status, 409);
  const polished = '这是润色之后的正文。';
  const applied = await request('/tools/apply', 'POST', { chapter_id: 'feedback-test-chapter', text: polished, mode: 'replace', base_content: '这是原始正文。', base_title: '新的标题' });
  assert.equal(applied.data.chapter.content, polished);
  assert.equal(db().snapshots.at(-1).content, '这是原始正文。');
  assert.equal((await request('/tools/apply', 'POST', { chapter_id: 'feedback-test-chapter', text: polished, mode: 'replace', base_content: '这是原始正文。' })).status, 409);
  assert.equal((await request('/chapters/feedback-test-chapter')).data.chapter.content, polished);
});
