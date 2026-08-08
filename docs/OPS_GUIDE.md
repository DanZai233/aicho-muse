# Aicho Muse 操作与运维指南

> 适用版本：当前线上部署（https://muse.danzaii.cn）

## 1. 访问入口与账号

### 用户端

- 地址：https://muse.danzaii.cn
- 注册：打开首页 → 「注册」→ 任意邮箱 + 至少 6 位密码（无需邮箱验证）
- 登录后即可创建作品、与 AI 助手对话、写作

### 管理后台

- 地址：https://muse.danzaii.cn/admin
- 默认账号：**admin / admin123**（线上已实测可登录）
- 登录后页面右上角显示当前管理员；可随时「退出」
- 后台包含 4 个页签：**数据概览 / 用户管理 / 系统设置 / 预设管理**

> 安全建议：后台没有“修改自身密码”的入口。如果希望更换密码，需要用服务器 root 直接改数据库中的 admin_users 记录（见下文 5.4）。

## 2. 管理后台能做什么

| 页签 | 功能 |
| --- | --- |
| 数据概览 | 用户数、作品/章节/会话/消息总量、今日消息、AI 引擎与模型、回复类型分布 |
| 用户管理 | 查看全部注册用户（昵称/邮箱/注册时间）、删除用户及其全部数据 |
| 系统设置 | AI 厂商与模型、API Key、配额（每日消息/每分钟/TTS 每小时/STT 每日分钟）、站点名称与公告、TTS/STT/声音克隆配置 |
| 预设管理 | 维护「预设人设」与「预设音色」库（供所有用户选择） |

## 3. 关于“每个用户的默认助手和音色”

### 当前实现（请按此预期使用）

- **管理员可配置全局“预设人设”和“预设音色”**：在管理后台「预设管理」添加后，所有用户都会在新建会话时看到并可选择它们。
- **用户自己决定每个会话用什么助手和音色**：在写作工作台点击「💬 对话」→「新会话」，即可从预设人设 / 官方预设音色 / 音频广场收藏中挑选；也可以先在「助手声色」页收藏音色、在「人设」页创建自己的人设。
- **作品级默认人设**：作品创建时可绑定 default_persona_id，会话默认倾向使用该人设。
- **没有“按用户逐一分配不同默认助手/音色”的管理入口**：当前系统是“全局预设 + 用户自选”，不是“管理员给每个用户单独指定默认值”。如果这是你想要的强需求，需要后续迭代（把 user 表加 default_persona_id / default_voice_id 字段，并在创建会话时读取）。

### 用户端实际流程

1. 进「助手声色」页 → 「音频广场」→ 搜索/试听 → 收藏音色（收藏后出现在「我的音色」，provider 为 fish-audio）。
2. 进「人设」页创建/选择自己的助手人设（性格、语气、口头禅等）。
3. 在写作工作台新建会话时，选择人设与音色，开始对话。

## 4. 用户数据是否完全隔离

**是，已验证。** 关键点：

- 所有业务数据（作品、章节、快照、会话、消息、人设、音色、大纲、人物卡、时间线、灵感、长期记忆、回收站）都以 user_id 或作品归属做过滤。
- 作品访问控制为三层：owner（创建者）/ editor（可编辑协作者）/ viewer（只读协作者）。非 owner 只有被邀请进 collaborators 才能看到作品。
- 已做线上实测：用户 A 创建作品后，用用户 B 的 token 访问该作品返回 404「作品不存在」；B 的作品列表为空；未登录访问返回 401「未登录」。
- 人设/音色分三类：is_preset（管理员全局预设，所有人可见）、is_public（用户主动公开分享）、其余为私有（仅本人可见）。
- 管理后台可以看到所有用户，但只有 admin 账号能进入；后台删除用户会级联清理其全部数据。

## 5. 服务器运维速查（dz）

### 5.1 服务状态

    ssh dz
    docker ps --format '{{.Names}} {{.Status}}' | grep muse
    # 期望：
    # aicho-muse-app     Up
    # aicho-muse-mysql   Up (healthy)

### 5.2 重启 / 更新

    cd /opt/aicho-muse

    # 只重启应用容器（不重新构建）
    docker compose up -d app

    # 拉取最新代码并重建镜像（本地已 push 到 GitHub main 后）
    # 服务器代码目录不是 git 仓库，需要先把变更文件 scp 到 /opt/aicho-muse
    docker compose build app
    docker compose up -d app

> ⚠️ 线上端口与密钥：dz 上 muse 应用通过 nginx 以 **3002** 端口对外（
> /opt/aicho-muse/.env 中 `APP_PORT=3002`），数据库账号为 `aicho_muse`（不是 compose 默认的 `aicho`）。
> 同步代码时**不要覆盖 .env**（含 MYSQL_PASSWORD / JWT_SECRET / DATA_ENCRYPTION_KEY）。
> 线上 .env 共 19 行，除基础 10 行外还追加了：`LLM_API_KEY`（DeepSeek）、
> `TTS_PROVIDER/TTS_API_KEY/TTS_MODEL/TTS_BASE_URL`（Fish Audio）、
> `HTTPS_PROXY/HTTP_PROXY/NODE_USE_ENV_PROXY/NO_PROXY`（mihomo 代理，Fish 依赖）。
> 完整备份在本机 `/tmp/aicho_muse_env_full.txt`（含密钥，勿提交 git）。

    # 查看日志
    docker logs -f aicho-muse-app

### 5.3 数据备份

数据在 MySQL（aicho_muse 库）+ 应用 volume（aicho-muse_app_data，含上传头像/音频）。推荐定期：

    ssh dz
    mkdir -p /root/backup/aicho-muse
    docker exec aicho-muse-mysql mysqldump -uaicho_muse -p'密码' aicho_muse > /root/backup/aicho-muse/db-$(date +%F).sql
    tar -czf /root/backup/aicho-muse/app_data-$(date +%F).tar.gz -C /var/lib/docker/volumes aicho-muse_app_data

### 5.4 修改管理员密码

用 bcrypt 生成新哈希，然后更新 MySQL 中 admin_users 记录的 password_hash：

    ssh dz
    docker exec aicho-muse-mysql mysql -uaicho_muse -p'密码' aicho_muse \
      -e "UPDATE app_data SET value=JSON_SET(value, '$.password_hash', '<新bcrypt哈希>') WHERE \`key\`='admin_users:admin-root';"

生成哈希（任意 Node 环境）：

    node -e "console.log(require('bcryptjs').hashSync('你的新密码', 10))"

> 应用内存中的 db 缓存 2 秒内会被 MySQL 周期落库覆盖，因此直接改库后需重启应用容器生效：docker compose restart app。

### 5.5 官方预设（人设/音色）的落库规则

- **官方预设只写入一次**：全新库首次启动时从内置 seed 落库到 presets 表，之后任何部署/重启都不会再写入或覆盖该表（mysqlEnsureSeedPresets 仅在表完全为空时执行）。
- **官方预设的唯一修改入口是管理后台「预设管理」**（增/删）；后台删除后重启不会恢复，除非整张 presets 表被清空。
- 应用启动时若发现库已有用户数据但 presets 表读到 0 条，会轮询重试 10 秒，绝不用空缓存顶上；运行期每 30 秒从 presets 表回读一次做自愈同步。
- ⚠️ 不要手动 DELETE FROM presets，除非确认要重置全部官方预设；presets 表与用户数据（app_data）完全分离，mysqlSaveFull 永不触碰它。

## 6. 常见问题

- **朗读还是浏览器声音？** 请确认已登录、会话选中了 Fish 音色；后端 TTS 配置（TTS_API_KEY/TTS_MODEL）在管理后台「系统设置 → 语音服务」中。服务器已配置 Fish，代理链路已打通。
- **音频广场搜索失败？** 检查服务器代理 mihomo（fish 需走代理）与 TTS API Key。
- **忘记 admin 密码？** 见 5.4 直接改库。
- **用户数据不在了？** 检查是否在后台「用户管理」误删；删除不可恢复（回收站只覆盖作品/章节的普通删除）。
