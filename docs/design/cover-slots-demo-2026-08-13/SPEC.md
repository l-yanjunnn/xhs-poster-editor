# 结构化封面槽位 · 实施规格（v1.10.0）

> 视觉方向以同目录 demo 为准（2026-08-13 用户目检通过）。
> 本文件只锁定实现边界，不重复展开已拍板的产品判断。

## 语义

- 主标题 = 首图 `.content` 第一个 H1
- 副标题 = 该 H1 紧邻的第一个 `p`
- 槽位只改成品画布呈现，不改 Tiptap 文档结构，不新建 `PosterTemplate`
- 非封面页不受影响

## 可调项

| 字段 | 取值 | 缺省 |
|---|---|---|
| `coverLayout` | `stack-left` / `poster-center` / `kicker-above` | `stack-left` |
| `coverVertical` | `top` / `middle` / `bottom` | `top` |

- 字号沿用主题比例；颜色沿用现有封面 HEX
- 两字段写入 Theme 与 V2 草稿 style；不升 V3
- 旧主题 / 旧草稿缺字段时归一为 `stack-left` + `top`，外观贴近现状
- **示例文案策略（2026-08-14 用户拍板）**：默认主题保持雅致、默认教程文案不动；示例只跟公考绑定——默认教程未改过时切「公考·山水卷」，首页整页换成版式 A 示例封面（可撤销，正文改过一字就不动）；封面仍是三套示例之一时切版式换对应文案和默认垂直档；版式卡缩略图用中性灰阶排版示意图，不带主题视觉

## 呈现

- 只在 `.page--first` 上打 `data-cover-layout` / `data-cover-vertical`
- **A · 上不加 flex**，沿用现有文档流，保证旧草稿像素贴近
- B 居中：封面主副标题设 `--dtl-text-align: center`，确定性排版按行平移（物化后 `text-align` 会被锁成 left，不能再读 computed）
- C 用 flex `order` 把副标题视作眉题（竖条 + 加宽字距），不交换 JSON 节点
- 中 / 下：整页封面内容作为一叠在安全盒内 `justify-content`；下档依赖已有 `--page-padding-bottom: 300px` 留山形距离
- 切换版式会重跑首图物化；不包一层 slot DOM，避免打断顶层块映射

## 明确不做

自由文本框、任意坐标、旋转、复杂网格、逐页版式、非封面页、导出引擎改写。

## 实施状态（2026-08-16 更新）

v1.10.0 已于 2026-08-14 完成用户目检和双轨发布，导出像素验证 8/8 通过。v1.10.2 发布时，两个生产入口再次通过深度回归，封面槽位保持原样。实施闭环期在原方案上修了三处：

1. 槽位 CSS 覆盖块必须写在公考主题规则**之后**（特异性打平靠顺序胜出；写在前面会被 `.theme-public-exam-landscape.page--first … + p` 的 max-width/font-size/letter-spacing 整组压掉），`canvas.test.ts` 已锁规则顺序
2. B 分隔条 / C 眉题竖条不能用 in-flow 伪元素（物化后行盒绝对定位、块内流式高度为零）——B 挂 `h1::after` 绝对定位于盒下缘，C 眉题 `margin-left: 20px` 让位 + `::before` 绝对定位
3. Preview **两个** effect 的依赖都要带 `coverLayout/coverVertical`：只加「快速物化」不加「排版事务」会让切版式后全页卡 pending、导出静默挂死

导出像素回归：`tools/export-race-repro/test_cover_slots_export_local.py`。
