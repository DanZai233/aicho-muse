# Aicho Muse · 声创

> 用对话和声音，把灵感写成作品。

Aicho Muse 是一款面向创作场景的 AI 创作伴侣：你可以通过 **语音或打字** 与一位 **人设、性格、声色完全自定义** 的 AI 助手对话，在聊天的过程中完成小说、散文、个人自传、诗歌等文学作品的创作。助手不只是"生成器"，更是你的**陪写教练**——给你反馈、建议、鼓励，陪你一步步把作品打磨成型。

## 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS（响应式，移动/平板/桌面三栏工作台）
- **后端**：Node.js + Express（默认 JSON 文件持久化开箱即用；设置 MYSQL_HOST 自动切换 MySQL）
- **部署**：Docker Compose 一键起 MySQL 8 + 应用，多阶段镜像构建前端
- **语音**：浏览器原生 Web Speech API（STT 语音输入 + TTS 朗读，无需密钥）
- **AI**：通过 **UniLLM SDK** 统一接入 14+ 厂商（OpenAI / Claude / Gemini / 豆包 / DeepSeek / Kimi / 通义 / 智谱 / Grok / Ollama 等）；未配置密钥时使用内置创作教练规则引擎
- **管理后台**：数据概览 / 用户管理 / AI 与配额设置 / 预设人设与音色管理

## 快速开始

```bash
# 安装依赖（仓库根目录）
npm run install:all

# 开发模式（两个终端）
npm run dev:server   # 后端 http://localhost:3001
npm run dev:web      # 前端 http://localhost:5173

# 生产模式（构建前端 + 启动后端，单端口 3001）
npm run serve
```

打开 http://localhost:3001 即可使用。

### Docker 部署（推荐生产）

```bash
# 1. 复制环境变量模板并按需修改（MySQL 账号、AI Key 等）
cp .env.example .env

# 2. 一键构建并启动（MySQL 8 + 应用，多阶段镜像构建前端）
docker compose up --build -d

# 3. 打开 http://localhost:3001（管理后台 /admin，admin/admin123）
```

`.env` 关键配置：

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | MySQL 库名与账号 | `aicho_muse` / `aicho` / `aicho123` |
| `JWT_SECRET` | 生产环境务必改为随机长串 | `change-me` |
| `LLM_PROVIDER` | AI 厂商（deepseek / openai / qwen / ollama …） | `deepseek` |
| `LLM_API_KEY` | 对应厂商 API Key | `sk-xxx` |
| `LLM_MODEL` | 模型 ID（可用管理后台「模型列表」查询） | `deepseek-v4-flash` |
| `LLM_BASE_URL` | 自定义端点（可选） | `https://api.deepseek.com` |

- 数据自动持久化到 Docker volume（`mysql_data` / `app_data`），重启不丢失。
- 不配置 AI Key 时自动使用内置创作教练规则引擎，功能照常可用。

### 默认账号

- 用户端：注册任意邮箱即可
- 管理后台：`/admin`，默认 `admin / admin123`（部署后请尽快修改）

### 语音说明

- 语音输入与朗读使用浏览器原生能力，建议使用 Chrome / Edge。
- 配置外部 AI：在管理后台「系统设置 → AI 配置」选择厂商（UniLLM 支持 OpenAI/Claude/Gemini/豆包/DeepSeek/Kimi/通义/智谱/Ollama 等 14+ 家）并填入对应 API Key；不配置则使用内置创作教练。
- 接入 UniLLM：默认读取 npm 包 `unillm-sdk`，可用环境变量 `UNILLM_PATH` 指向本地源码路径。

## 功能总览

| 模块 | 功能 |
| --- | --- |
| 对话式创作 | 打字 / 语音输入，SSE 流式回复，回复带「提问 / 反馈 / 建议 / 鼓励」标签 |
| 自定义人设 | 4 个预设（黎文 / 苏禾 / 陈墨 / 阿岛），支持创建、编辑、基于预设克隆 |
| 自定义声色 | 语速 / 音调 / 情绪参数，试听，浏览器朗读 |
| 书为中心 | 每本书有封面（书名/副标题/作者署名/封面色），首页以书封卡片展示并随内容“生长” |
| 书结构 | 封面 + 目录 + 章节树，完整“书预览”视图（封面页 + 各章书页缩略），书页式写作视图 |
| 长期记忆 | 自动记住创作偏好与设定并注入对话，设置页可查看/删除 |
| 创作项目 | 多作品、分章节、大纲/人物卡/时间线/灵感箱、自动保存、写作工具、版本历史 |
| Diff 采纳 | 对话侧栏里 AI 回复按段高亮 diff，逐段“采纳此段”或“采纳全部”写入当前章节/新章节 |
| 导出 | Markdown / PDF / DOCX 一键导出 |
| 管理后台 | 数据统计、用户管理、AI/配额/站点设置、预设管理 |
| 主次分明 | 文章始终是主视图（书页式全宽编辑器），聊天为右侧可折叠面板，不抢占主区域 |
| 多端适配 | 响应式布局，PWA 可安装 |

## 文档导航

- [产品设计](docs/PRODUCT_DESIGN.md) — 愿景、用户、场景、功能与设计原则
- [系统架构](docs/ARCHITECTURE.md) — 技术选型与整体架构
- [数据模型](docs/DATA_MODEL.md) — 核心表结构、关系、索引与数据生命周期
- [API 设计](docs/API_DESIGN.md) — REST 接口、SSE 流式对话、语音与限流
- [AI 提示词工程](docs/PROMPT_ENGINEERING.md) — 系统提示模板、回复类型、引导边界与质量指标
- [人设与声色系统](docs/VOICE_PERSONA.md) — 人设卡 / 声色卡结构与运行时组装
- [界面与交互设计](docs/UX_DESIGN.md) — 信息架构、工作台三栏布局、核心交互流程
- [路线图](docs/ROADMAP.md) — 里程碑与验收标准

## 仓库结构

```text
aicho-muse/
├── server/                # 后端（Express + JSON 存储）
│   └── src/
│       ├── index.js       # 入口
│       ├── db.js          # 数据层（JSON 持久化 + 预设种子）
│       ├── ai.js          # AI 编排（LLM 可插拔 + 内置规则教练）
│       └── routes/        # auth/projects/chapters/personas/voices/conversations/tools/export/admin
├── web/                   # 前端（React + Vite + Tailwind）
│   └── src/
│       ├── pages/         # Login/Home/Workspace/Personas/Voices/Settings/Admin
│       ├── components/    # 通用 UI 与布局
│       └── lib/           # API 封装、认证、语音
└── docs/                  # 设计文档
```

## License

[MIT](./LICENSE) © DanZai233
