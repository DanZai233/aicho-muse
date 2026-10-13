# Muse 项目入口

新聊天开始工作前，先读 `docs/PROJECT_CONTEXT.md`，再按任务阅读相关源码和设计文档。项目知识以仓库文档为准，不依赖其他聊天的历史。

## 仓库与生产环境

- 当前仓库是 Muse 文学创作工作台：`/Users/dan_zai/Git/aicho-muse`。
- Letter 信笺是独立仓库：`/Users/dan_zai/Git/aicho-muse-letter`，使用 Muse 的人设、LLM、Fish Audio 能力。
- Aicho 是另一款独立应用：`/Users/dan_zai/Git/Aicho`；不能因为名称相近就把 Muse 改动部署到 Aicho。
- 用户确认当前生产服务统一在 `ssh aicho`，主域名为 `imuse.chat`、`letter.imuse.chat`、`aicho.chat`。旧 `dz` 和旧域名仅为历史信息。
- 实际部署前检查容器 compose 标签、挂载与配置；不要仅凭旧文档重建服务。

## 工作约定

- 用中文交流。修改按功能拆模块，避免把全部逻辑堆在一个文件。
- 保留用户既有未提交改动。提交只包含本次任务文件，完成修改后验证并提交推送对应仓库。
- 不把 API key、密码、订阅链接、管理员 token 或生产用户内容写入文档、日志输出或 Git。
- 同步代码不要覆盖生产 `.env`、数据目录和 Docker volumes；部署前备份数据库和持久化文件。
- 官方人设与音色永久落库。部署和重启不得清空或覆盖已有预设，不执行 `docker compose down -v`。
- 大模型遵守用户指定的 DeepSeek Flash 系列；先核实模型列表和当前配置，不擅自换 Pro。Fish Audio 的 TTS 模型名称与 LLM 限制是不同配置。
- 更新部署关系、端口或域名后，同步维护 `docs/PROJECT_CONTEXT.md`。

## 产品原则

- 书与正文编辑是主流程：左侧导航与页面缩略图，从封面开始组织完整书籍结构；聊天独立且占用较小。
- 问答、建议、鼓励不能混入正文 diff。明确要求写作或确认方向后才产出可采纳正文；不带“续写稿：”等包装文字。
- 助手名称和用户称呼可自定义，称呼自动进入提示词；人设始终包含服务文学创作的 Muse 指令。
- 音频同时只能播放一段，点击其他段立即打断并播放所选段。Letter 先返回分段回信，按需生成语音，支持继续播放与分享复用音频。
