# 角色预设与日语信笺（2026-10-28）

新增哥伦比娅 1 位、春物 43 位，共 44 位。`server/src/character-presets.js` 独立维护，`seedPresets()` 返回这些人设及 6 个新增音色；MySQL 和 JSON 都只补缺失 ID，不覆盖管理员修改。角色中文名可搜索，日语落款另存 `native_name`，春物统一 `reply_language: ja`。哥伦比娅保持中文。

## 调研与演绎边界

- [TBS 第一季角色介绍](https://www.tbs.co.jp/anime/oregairu/1st/chara/)和[完结篇角色页](https://www.tbs.co.jp/anime/oregairu/character/)核对身份、关系与主要人物。
- [春物角色名录](https://zh.wikipedia.org/wiki/果然我的青春戀愛喜劇搞錯了。)与[英文角色章节](https://en.wikipedia.org/wiki/My_Youth_Romantic_Comedy_Is_Wrong,_as_I_Expected#Characters)交叉核对次要人物、译名和同名区别。
- 主要角色个性补充：[八幡](https://oregairu.fandom.com/wiki/Hachiman_Hikigaya)、[雪乃](https://oregairu.fandom.com/wiki/Yukino_Yukinoshita)、[结衣](https://oregairu.fandom.com/wiki/Yui_Yuigahama)、[阳乃](https://oregairu.fandom.com/wiki/Haruno_Yukinoshita)。社区资料不作为新增未证实情节的依据。
- 哥伦比娅参考 [HoYoWiki](https://wiki.hoyolab.com/pc/genshin/entry/7476?lang=en-us)、[官方版本介绍](https://www.hoyoverse.com/en-us/news/162178)与[游戏语音记录](https://genshin-impact.fandom.com/wiki/Columbina/Voice-Overs)。采用已公开的月之少女、歌唱与归属主题，不沿用早期“纯恐怖反派”猜测。

语气、自称、写信方式和创作偏好属于本产品的同人交互设计，不是原作引文；问候语为原创。稀少登场人物只填写已知身份，标记资料有限，采用保守日常书信方向。未公开姓名的父母保留关系称谓；宠物镰仓、萨布雷明确为拟人化演绎。未给未命名路人、没有可核实身份的衍生角色编造完整人设，因此不宣称覆盖每个改编作品的每个背景人物。

43 位春物名录：比企谷八幡、雪之下雪乃、由比滨结衣、一色彩羽、平冢静、比企谷小町、户冢彩加、川崎沙希、叶山隼人、三浦优美子、海老名姬菜、户部翔、大和、大冈、相模南、材木座义辉、城廻巡、雪之下阳乃、鹤见留美、川崎大志、川崎京华、折本佳织、仲町千佳、玉绳、本牧牧人、藤泽沙和子、秦野、相模（游戏部）、优子（相模同学）、遥、城山、津久井、藤野、比企谷母亲、比企谷父亲、雪之下母亲、由比滨母亲、由香、仁美、小森、优子（林间学校）、镰仓、萨布雷。

## 音色

2026-10-28 通过现有 Fish 音色库接口搜索核对。八幡、雪乃、结衣使用对应标题的社区日语音色，哥伦比娅使用社区中文音色。其余按角色使用明确标注的通用日语男声或女声，音色名称不冒充原作声优或原声，亦不根据模糊搜索结果绑定其他作品的同名角色。不会自动下载头像、克隆声优或改变 TTS 模型。

Fish [TTS 文档](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)说明 `language` 只控制文本规范化，不会改变音色。日语效果依赖日语正文和日语参考音色；接口对含假名文本加 `language: ja`。原文仍是唯一朗读输入，中文译文不参与合成。

## 翻译接口

Muse POST `/api/v1/letter/translate`：接受至多 8 段、总计 6000 字的正文，仅返回等量中文译文，独立限流。Letter 本人 POST `/api/v1/letters/:id/translate`、分享 POST `/api/v1/share/:token/translate`：只翻译服务端现存信件，不接受客户端任意正文，保留所有权/分享权限。译文按回信版本缓存，合并并发任务；重新生成清空译文，旧任务不能写入新版；分享撤销或信件删除后不得返回进行中的结果。

本人详情与分享页提供「译为中文／收起中文译文」，逐段对照、失败重试。默认显示日语原文；历史信件不自动重写，不因角色更新改变旧音频。
