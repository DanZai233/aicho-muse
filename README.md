# Aicho Muse · 声创

> 用对话和声音，把灵感写成作品。

Aicho Muse 是一款面向创作场景的 AI 创作伴侣：你可以通过 **语音或打字** 与一位 **人设、性格、声色完全自定义** 的 AI 助手对话，在聊天的过程中完成小说、散文、个人自传、诗歌等文学作品的创作。助手不只是"生成器"，更是你的**陪写教练**——给你反馈、建议、鼓励，陪你一步步把作品打磨成型。

## 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS（响应式，移动/平板/桌面三栏工作台）
- **后端**：Node.js + Express（轻量、零原生依赖，JSON 文件持久化，开箱即用）
- **语音**：浏览器原生 Web Speech API（STT 语音输入 + TTS 朗读，无需密钥）
- **AI**：OpenAI 兼容接口可插拔；未配置密钥时使用内置创作教练规则引擎
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

### 默认账号

- 用户端：注册任意邮箱即可
- 管理后台：`/admin`，默认 `admin / admin123`（部署后请尽快修改）

### 语音说明

- 语音输入与朗读使用浏览器原生能力，建议使用 Chrome / Edge。
- 配置外部 AI：在管理后台「系统设置 → AI 配置」填入 OpenAI 兼容 Base URL / API Key / 模型，回复将切换为真实大模型；不配置则使用内置创作教练。

## 功能总览

| 模块 | 功能 |
| --- | --- |
| 对话式创作 | 打字 / 语音输入，SSE 流式回复，回复带「提问 / 反馈 / 建议 / 鼓励」标签 |
| 自定义人设 | 4 个预设（黎文 / 苏禾 / 陈墨 / 阿岛），支持创建、编辑、基于预设克隆 |
| 自定义声色 | 语速 / 音调 / 情绪参数，试听，浏览器朗读 |
| 创作项目 | 多作品、分章节、自动保存、写作工具（润色/扩写/缩写/续写/风格迁移）、版本历史 |
| 导出 | 一键导出 Markdown |
| 管理后台 | 数据统计、用户管理、AI/配额/站点设置、预设管理 |
| 多端适配 | 响应式布局，PWA 可安装（构建后可补 manifest） |

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
