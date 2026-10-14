import type { Chapter } from './api';

export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';
type Entry = { base: Chapter; draft: Chapter; version: number; dirty: boolean; state: SaveState; pending?: Promise<void>; timer?: ReturnType<typeof setTimeout> };
type Options = {
  save: (chapter: Chapter, base: Chapter) => Promise<Chapter>;
  change: (chapter: Chapter, state: SaveState) => void;
  draft: (chapter: Chapter, base: Chapter) => void;
  clear: (id: string) => void;
};

// One in-flight save per chapter. A response never replaces a newer local edit.
export class ChapterSaves {
  private entries = new Map<string, Entry>();
  constructor(private options: Options) {}
  capture() { return new Map([...this.entries].map(([id, entry]) => [id, entry.version])); }
  current(id: string) { return this.entries.get(id)?.draft; }
  state(id: string) { return this.entries.get(id)?.state || 'saved'; }
  receive(remote: Chapter, expectedVersion?: number): Chapter {
    const entry = this.entries.get(remote.id);
    if (entry) {
      if (entry.dirty || (expectedVersion !== undefined && expectedVersion !== entry.version)) return entry.draft;
      if (entry.base.updated_at && remote.updated_at && remote.updated_at < entry.base.updated_at) return entry.draft;
      if (entry.draft.content === remote.content && entry.draft.title === remote.title && entry.draft.updated_at === remote.updated_at) return entry.draft;
      entry.base = remote; entry.draft = remote; entry.version++;
      return remote;
    }
    this.entries.set(remote.id, { base: remote, draft: remote, version: 0, dirty: false, state: 'saved' });
    return remote;
  }
  edit(chapter: Chapter, base?: Chapter) {
    let entry = this.entries.get(chapter.id);
    if (!entry) {
      this.receive(base || chapter);
      entry = this.entries.get(chapter.id)!;
    }
    if (base && !entry.dirty) entry.base = base;
    entry.draft = chapter; entry.version++; entry.dirty = true;
    if (entry.state !== 'conflict') entry.state = 'saving';
    this.options.draft(chapter, entry.base);
    this.options.change(chapter, entry.state);
    clearTimeout(entry.timer);
    if (entry.state !== 'conflict') entry.timer = setTimeout(() => { this.flush(chapter.id).catch(() => {}); }, 1200);
  }
  flush(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || !entry.dirty) return Promise.resolve();
    clearTimeout(entry.timer);
    if (entry.pending) return entry.pending;
    if (entry.state === 'conflict') return Promise.reject(new Error('章节有保存冲突，本地草稿已保留'));
    const task = this.run(entry);
    entry.pending = task;
    task.finally(() => { entry.pending = undefined; }).catch(() => {});
    return task;
  }
  private async run(entry: Entry) {
    while (entry.dirty) {
      const sent = entry.draft;
      entry.state = 'saving'; this.options.change(entry.draft, entry.state);
      try {
        const saved = await this.options.save(sent, entry.base);
        entry.base = saved; entry.version++;
        if (entry.draft.content === sent.content && entry.draft.title === sent.title) {
          entry.dirty = false; entry.draft = saved; entry.state = 'saved';
          this.options.clear(sent.id);
        } else this.options.draft(entry.draft, saved);
        this.options.change(entry.draft, entry.state);
      } catch (error) {
        entry.state = (error as { status?: number }).status === 409 ? 'conflict' : 'error';
        this.options.draft(entry.draft, entry.base);
        this.options.change(entry.draft, entry.state);
        throw error;
      }
    }
  }
  rebase(id: string, remote: Chapter) {
    const entry = this.entries.get(id);
    if (!entry) return Promise.resolve();
    entry.base = remote; entry.state = 'saving'; entry.version++;
    this.options.draft(entry.draft, remote);
    return this.flush(id);
  }
  forget(id: string) { const entry = this.entries.get(id); clearTimeout(entry?.timer); this.entries.delete(id); }
  stopTimers() { for (const entry of this.entries.values()) clearTimeout(entry.timer); }
}
