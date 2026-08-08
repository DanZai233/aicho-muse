# API 设计：Aicho Muse

> REST 为主 + SSE 流式对话，统一 `/api/v1` 前缀，JSON 请求/响应，JWT 认证（`Authorization: Bearer <token>`）。

## 1. 通用约定

### 1.1 响应格式

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

错误时 `code` 非 0：

| code | 含义 |
| --- | --- |
| 40001 | 参数校验失败 |
| 40101 | 未登录或 token 过期 |
| 40301 | 无权限 |
| 40401 | 资源不存在 |
| 42901 | 触发限流 |
| 50001 | 服务内部错误 |

### 1.2 分页

`?page=1&page_size=20`，响应 `data` 内含 `list` 与 `total`。

### 1.3 时间与 ID

- 时间统一 UTC ISO8601。
- ID 统一 UUIDv7。

## 2. 认证

### POST /api/v1/auth/register

```json
{ "email": "user@example.com", "password": "******" }
```

### POST /api/v1/auth/login

同字段，返回：

```json
{ "token": "jwt...", "expires_at": "2026-08-08T00:00:00Z" }
```

### POST /api/v1/auth/logout

撤销当前 token（服务端 Redis 黑名单）。

## 3. 项目 Projects

### POST /api/v1/projects

创建项目：

```json
{
  "title": "我的前半生",
  "genre": "biography",
  "theme": "一个江南小镇青年的成长",
  "target_audience": "家人与朋友",
  "goal_word_count": 30000
}
```

### GET /api/v1/projects

项目列表（分页），含 `default_persona` 摘要。

### GET /api/v1/projects/:id

项目详情（含大纲节点、人物卡、章节摘要）。

### PATCH /api/v1/projects/:id

更新元信息。

### DELETE /api/v1/projects/:id

删除项目（级联删除章节、会话、快照）。

## 4. 章节 Chapters

### GET /api/v1/projects/:id/chapters

章节列表（按 order_index 排序）。

### POST /api/v1/projects/:id/chapters

```json
{ "title": "第一章 出发", "content": "# 第一章 出发\n\n...", "order_index": 1 }
```

### GET /api/v1/chapters/:id

章节详情 + 最近版本快照。

### PATCH /api/v1/chapters/:id

更新标题/内容/状态。每次内容变更自动生成 `version_snapshots` 快照。

### GET /api/v1/chapters/:id/versions

版本历史列表。

### POST /api/v1/chapters/:id/restore

```json
{ "version_id": "..." }
```

回滚到指定版本（同时生成新的快照记录回滚事件）。

## 5. 人设 Personas

### GET /api/v1/personas?scope=preset|mine

预设库或我的人设列表。

### GET /api/v1/personas/:id

人设详情。

### POST /api/v1/personas

```json
{
  "name": "黎文",
  "tagline": "安静的倾听者",
  "background": "当过十二年文学编辑……",
  "personality": ["温和", "耐心", "敏锐"],
  "speaking_style": {
    "tone": "平静而温暖",
    "preferences": ["多用提问引导", "偶尔引用一句诗"],
    "avoid": ["说教", "替用户做决定"]
  },
  "values": ["真实比华丽重要"],
  "relationship": "亦师亦友的编辑",
  "expertise": ["叙事结构", "人物塑造", "回忆录写作"],
  "greeting": "今天想讲点什么？我在听。"
}
```

### PATCH /api/v1/personas/:id

更新人设（version 自增）。

### DELETE /api/v1/personas/:id

删除自定义人设（预设不可删）。

## 6. 声色 Voice Profiles

### GET /api/v1/voice-profiles

列表。

### POST /api/v1/voice-profiles

```json
{
  "display_name": "黎文 · 温润男声",
  "provider": "volcengine",
  "voice_id": "volc_xxx",
  "params": { "rate": 0.95, "pitch": 0, "emotion": "warm", "energy": 0.6 }
}
```

### PATCH /api/v1/voice-profiles/:id

### DELETE /api/v1/voice-profiles/:id

## 7. 会话与对话 Conversations

### POST /api/v1/conversations

```json
{ "project_id": "…", "persona_id": "…", "voice_profile_id": "…" }
```

### GET /api/v1/conversations/:id/messages?before=<ts>&limit=50

历史消息（游标分页）。

### POST /api/v1/conversations/:id/messages

发送文字消息。响应为 202（已受理），实际回复经 SSE 推送。

```json
{ "content": "我想写小时候在江南小镇长大的经历", "reply_as_voice": true }
```

### DELETE /api/v1/conversations/:id

## 8. 流式对话 SSE

### GET /api/v1/conversations/:id/stream

`text/event-stream`，事件格式：

```text
event: text_delta
data: {"delta": "小时候……"}

event: text_done
data: {"message_id": "…", "reply_type": "question"}

event: audio_ready
data: {"audio_url": "/api/v1/audio/…", "duration": 8.2}
```

事件类型：

| 事件 | 说明 |
| --- | --- |
| `text_delta` | 文本增量 |
| `text_done` | 助手回复完整结束 |
| `tool_call` | 助手触发工具（如查询章节） |
| `audio_ready` | TTS 音频就绪（可选） |
| `error` | 错误与重试提示 |

## 9. 语音 STT / TTS

### POST /api/v1/stt/transcribe

```json
multipart/form-data: audio 文件 + lang=zh-CN
```

返回 `{ "text": "…", "duration": 5.2 }`。

### POST /api/v1/tts/synthesize

```json
{ "text": "…", "voice_profile_id": "…", "stream": false }
```

返回 `{ "audio_url": "…", "duration": 8.2 }`；`stream: true` 时返回音频流。

### GET /api/v1/audio/:id

音频文件访问（鉴权 + 短期签名 URL）。

## 10. 写作工具 Writing Tools

统一入口（M2 提供）：

### POST /api/v1/tools/rewrite

```json
{
  "chapter_id": "…",
  "mode": "polish | expand | condense | continue | restyle",
  "target": "全章或指定段落",
  "instruction": "改成更冷峻的笔调",
  "options": { "length": "medium" }
}
```

返回 `{ "result": "…", "diff": [{"type":"replace","old":"…","new":"…"}] }`。

## 11. 限流与配额

- 登录：每 IP 10 次/分钟。
- 对话消息：每用户 30 次/分钟（可配）。
- TTS 合成：每用户 60 次/小时（可配）。
- STT 转写：按音频时长配额（如每用户 30 分钟/天）。
- 429 响应带 `Retry-After`。

## 12. 版本化与兼容

- 所有破坏性变更提升前缀版本（`/api/v2`），v1 维护期 ≥ 6 个月。
- 新增字段向后兼容；删除字段需先废弃公告。
- 前端 SDK 与 API 版本绑定，避免隐式漂移。

## 13. 文件导入与论文写作

### 导入文稿

`POST /api/v1/import`（multipart/form-data）

- `file`：必填，.docx / .md / .markdown / .txt，单文件 ≤ 20MB
- `mode`：`new` 新建作品 / `existing` 追加到已有作品（需 `project_id`）
- `title`、`genre`、`language`：新建作品时的元信息
- `ai_outline`（1/0）：导入后让 AI 生成大纲（写入 outline_nodes）
- `ai_knowledge`（1/0）：导入后让 AI 提取设定与背景知识（写入 memories，助手自动参考）

解析规则：Markdown 一级标题作为作品标题，二/三级标题与「第X章/回/节」切分章节；无标题时合并为单章。

返回 `{ project, chapters, created, total_words, outline_generated, knowledge_generated }`。

### 论文模式

- 项目体裁新增 `paper`，项目字段：`abstract`（摘要）、`keywords`（关键词数组）、`citation_style`（gb7714 / apa / mla）
- 参考文献：`GET/POST /api/v1/projects/:pid/citations`，`PATCH/DELETE /api/v1/citations/:id`
- 导出（MD/DOCX/PDF）自动附带摘要、关键词、引用格式与文末参考文献列表
- 写作 Agent 对 `paper` 项目启用学术提示词（客观语气、结构建议、[n] 引用规范）

## 14. 拾卷（分享广场）与参考文章

### 拾卷分享

- `POST /api/v1/shares`（登录，owner）：发布作品为公开分享。自动为当前状态创建快照副本（章节正文深拷贝），与原作品完全解耦；同一作品重复发布返回已有分享。
- `GET /api/v1/shares?page=&q=&genre=&sort=`：公开广场列表（无需登录），支持搜索/体裁筛选/按最新或点赞排序。
- `GET /api/v1/shares/:id`：公开详情（无需登录），返回完整章节快照；阅读时浏览量 +1。
- `POST /api/v1/shares/:id/republish`（登录，owner）：再发版，用最新内容刷新快照，版本号 +1，点赞/浏览保留。
- `POST /api/v1/shares/:id/like`（登录）：点赞/取消点赞。
- `DELETE /api/v1/shares/:id`（登录，owner）：下架。
- `GET /api/v1/shares/by-project/:pid`（登录）：查询作品当前的分享状态。

### 参考文章（知识库）

- `POST /api/v1/projects/:pid/reference-docs`（multipart，可编辑）：导入 docx/md/txt 参考文章，单文件 ≤50MB，自动按 3000 字分块（重叠 200 字）写入 `reference_chunks`。
- `GET /api/v1/projects/:pid/reference-docs`：作品参考文章列表（含分块数与字数）。
- `GET /api/v1/reference-docs/:id`、`GET /api/v1/reference-docs/:id/chunks?from=&limit=`：元信息与分块分页读取。
- `PATCH /api/v1/reference-docs/:id`（改标题）、`DELETE /api/v1/reference-docs/:id`（级联删分块）。
- 聊天 `POST /api/v1/conversations/:id/messages` 支持 `reference_doc_ids` 字段（≤8 篇）；SSE 生成时注入对应文章前若干分块（总 ≤8000 字）到 Agent 提示词。论文模式以 [R1]/[R2] 标注引用，文学模式作为同人/史料素材。
