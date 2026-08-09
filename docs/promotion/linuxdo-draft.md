# Linux.do 发布草稿（Aicho Muse · 声创）

## 分区

**程序员**（https://linux.do/c/dev/13）或 **分享创造**（若开放）

## 标题

[分享创造] 开源：一个「会说话的 AI 写作伙伴」——语音口述、人设声色自定义、diff 采纳式写作，Docker 一键部署

## 正文

写小说、自传、散文时最难的往往不是「写」，而是「开始」和「坚持」。我做了 Aicho Muse（声创），一个把 AI 当成**创作陪伴者**而不是「生成器」的开源项目。

**设计理念**：AI 不应该替你写，而应该陪你写。

**工作流**
- 语音口述（浏览器原生 STT）或打字表达想法
- 人设化的 AI 提问引导 → 反馈 → 鼓励 → 建议
- 你确认方向后，AI 进入写作模式只输出正文
- 回复内容以 diff 呈现，逐段「采纳/忽略」，可指定写入哪个章节——保证用户始终掌控稿件

**功能清单**
- 📖 完整作品结构：书 / 章节 / 封面 / 大纲 / 人物卡 / 时间线 / 灵感箱
- 🕸 角色关系图：力导向 SVG + AI 生成候选关系，一键应用
- 🧑🎨 人设系统：性格 / 说话风格 / 价值观 / 口头禅 / 擅长领域 / 开场白全部进提示词；支持 AI 生成、润色、克隆官方预设
- 🔊 声色系统：Fish Audio 广场搜索收藏（83 种语言）+ 声音克隆 + 浏览器 TTS
- 🤝 多人协作：邀请码、实时光标定位（为减轻服务器压力，刷新间隔做了节流）
- 📤 拾卷广场：作品快照分享、点赞、无登录阅读
- 📄 论文模式：摘要 / 关键词 / 引用标注 / 参考文献
- 🗂 版本历史、离线草稿同步、导出 MD/PDF/DOCX

**技术栈**
- Web：React 18 + TypeScript + Vite + Tailwind（桌面 / 移动端适配）
- Server：Node.js + Express + MySQL 8，Docker Compose 一条命令起
- LLM：UniLLM SDK 统一接入 14+ 家（DeepSeek / OpenAI / Claude / Gemini / 通义 / 豆包 / Ollama 等），线上配置 deepseek-v4-flash
- 未配置任何 Key 时使用内置规则引擎，开箱即用

**仓库**：https://github.com/DanZai233/aicho-muse

**快速体验**
```bash
git clone https://github.com/DanZai233/aicho-muse.git
cd aicho-muse
cp .env.example .env   # 可选：填 LLM_API_KEY
docker compose up --build -d
# 打开 http://localhost:3001，管理后台 /admin
```

线上演示：muse.danzaii.cn

欢迎 star、提 issue、贡献代码。目前每天还在迭代，优先做「写作体验」而不是「功能堆砌」。
