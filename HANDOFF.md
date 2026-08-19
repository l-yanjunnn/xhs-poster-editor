# 小红书排版编辑器 · Handoff 文档

> 给下一个会话窗口的 Claude 看的项目交接文档。
> 🌐 **生产 URL：Cloudflare `https://xhs-poster-editor.l-yanjunnn.workers.dev`｜大陆通道 `https://xhsposter.tshzchen.cn`**
> 最后更新：2026-08-19（**v1.11.0「封面副标题微排版」已完成本地实施与门禁；用户已锁定视觉值并授权走上线闭环，发布正在进行**。standard 的 sealed geometry/snapshot/画布截图与 v1.10.2 real-fixture 严格相同，2160×3600 PNG 只有低于 0.002% 的 1 色阶抗锯齿差异；线上稳定版在双轨验证完成前仍为 v1.10.2。产品提交 `919802a` 已落地，尚未 push/tag/归档/部署。v1.10.2 已完成双轨发布、精确 tag、不覆盖归档与公告闭环。旧版全文在 git 历史，`git log -- HANDOFF.md` / `git show <commit>:HANDOFF.md` 可考古）

---

## 0. 现状快照（30 秒接手）

| 项 | 值 |
|---|---|
| 线上版本 | **v1.10.2**。发布提交与精确 tag `v1.10.2` 均指向 `0b2d6468c9f8aa4db9cdf6d88533b7eaff47f267`。Cloudflare 与 OSS/CDN 双入口逐字节同构，均加载 `index.html` + `assets/index-Bdq1zB4M.js` + `assets/index-BosMHSUQ.css`；SHA-256 依次为 `2528734a5922cd8f3947cc14edb405d1631f51bfbdaecb20aca060fbd0c65204` / `c0556c0125cd759c9277c2d1ed3f73767c96304389fa0c578f1bf3ae48f93368` / `cfbf5ce9fc0a564b264242f65ab017de76191f630ceb9564c5e1b002654bda36`。两入口的 `test_prod_deep.py`、低视口弹窗、跨页续段与 Code 块定向生产回归全绿 |
| 本地归档 | 当前完整构建在 `app/dist/`；v1.10.2 快照在 `archive/dist-v1.10.2/`（9.6M，排除字体 3337 个）；v1.10.1 快照在 `archive/dist-v1.10.1/`（9.6M，排除字体 3337 个）；v1.10.0 快照在 `archive/dist-v1.10.0/`；v1.9.0 快照在 `archive/dist-v1.9.0/`（发版时漏交 git，2026-08-14 已补交 `0e9bb1e`）；更旧归档继续保留，完整复原走对应 tag + `bash ci.sh` |
| 状态 | **线上 v1.10.2 双轨稳定，发布闭环完成，无未完成发版步骤**。本版修复低视口导入/导出弹窗 CTA 可达性、`Enter → 分页` 的跨页续段末行排版，以及 Code 块长中文、URL 和无断点 token 的静态换行；真段尾、手工换行、空白和等宽字体语义保持不变 |
| v1.10.1 迭代记录 | **v1.10.1「删光草稿回开箱教程态」2026-08-14 深夜已双轨上线**（用户反馈当日修复并授权走闭环）。根因：删除最后一份草稿时自动新建的草稿装的是空段落（`EMPTY_DOCUMENT_JSON`，v1.10.0 之前就存在），用户删光草稿后画布空白、找不到教程。修复：该路径改为 `createEditorDocumentJSON(DEFAULT_CONTENT)` + 雅致默认样式，与首次开箱一致；`EMPTY_DOCUMENT_JSON` 常量随之删除。门禁四连全绿（Vitest 43/435）；真实浏览器回归（本地+两生产入口）：编辑落盘→删光全部草稿→教程 5 页回归→刷新仍在。发布提交/tag `927175f` / `v1.10.1`，`archive/dist-v1.10.1/` 已归档。**公告已发**：核对 `default` 租户「Claude聊天助手」后回复刘彦君既有发布会话，消息 `om_x100b68c7929024a0b24dbdb9c2277a7`。**v1.10.1 无未完成步骤**。v1.10.0 记录如下（历史） |
| 最近完成迭代 | **v1.10.2「用户反馈可靠性修复」2026-08-16 已双轨上线并完成全部闭环**。产品工作包提交为 `3b93160` / `9879dca` / `ff85779`，发布提交与 tag 为 `0b2d6468c9f8aa4db9cdf6d88533b7eaff47f267` / `v1.10.2`。反馈 1/3/4 已通过 TDD、全量 CI、真实 Chromium/PNG 本地回归与双入口生产回归；反馈 2 不改产品或代码，`Enter` 仍表示分段，同一标题内换行用 `Shift+Enter`。`archive/dist-v1.10.2/` 已归档。按用户最终决定，公告仅合并 v1.10.1 与 v1.10.2；已使用「Claude聊天助手」回复刘彦君既有发布会话，消息 `om_x100b673d13ea44a0b4af0de2ed1ccd4` 已回读确认，用户自行转发群聊 |
| 当前迭代 | **v1.11.0「封面副标题微排版」已锁值，发布中**。2026-08-19 已完成 `compact / standard / relaxed` 全链路、「全篇 H1 宽度」命名澄清、旧 V1/V2/用户主题兼容、公考 3 版式×3 档截图与 2160×3600 PNG。standard 的 sealed geometry/snapshot/画布截图与 v1.10.2 严格相同，PNG 差异仅为低于 0.002% 的 1 色阶抗锯齿波动。用户已锁定普通/居中 `0em / 0.08em`、kicker `0.10em / 0.26em`，并授权走上线闭环。产品提交为 `919802a`；双轨部署、生产回归、tag 与归档尚待完成。 |
| v1.10.0 迭代记录 | **v1.10.0「结构化封面槽位版」2026-08-14 已双轨上线**（用户目检 + 授权走闭环；发布提交/tag `adbc9ef` / `v1.10.0`，两入口同构建 `index-Dzu6JFfe.js`，`archive/dist-v1.10.0/` 已归档；两入口 `test_prod_deep` + 封面槽位 8 项像素回归全绿，测 Cloudflare 入口的槽位回归需 `test_cover_slots_export_local.py` 的 workers.dev 显式代理逻辑）。范围 = ROADMAP P2 封面槽位（demo 已于 8-13 目检认可）。接手 8-13 深夜留在工作区的未提交半成品（`coverSlots.ts` + Inspector「封面版式」三卡/垂直三档 + App/documentStore/themes/Preview/ThemePreview 全链路 + `docs/design/cover-slots-demo-2026-08-13/SPEC.md`），闭环期修复三处真缺陷：① 槽位 CSS 覆盖块写在公考主题规则**前**且特异性打平被整组压掉（B 副标题在 80% 窄盒里居中偏左、C 眉题字号/0.18em 字距全失效）→ 移到主题规则之后 + `canvas.test.ts` 锁规则顺序；② B 分隔条 / C 眉题竖条用 in-flow 伪元素，被物化后绝对定位行盒压住不可见/与首字重叠 → 改绝对定位挂在物化块上（B 挂 `h1::after` 盒下缘居中、C 眉题 `margin-left:20px` 让位 + `::before` 绝对定位）；③ **Preview 排版事务 effect 漏 `coverLayout/coverVertical` 依赖**：切版式只触发「标 pending」的快速物化 effect，seal 事务永不重跑 → 所有页卡死 pending、导出静默挂死（无报错无 console）→ 补依赖。新增 `tools/export-race-repro/test_cover_slots_export_local.py`（8 项导出像素断言：B 分隔条进 PNG/主副标题居中 ±8px、C 竖条进 PNG 且为最左墨迹、A 左缘回归；headless 需置空 showSaveFilePicker 走经典下载）。顺带清理（CODE-REVIEW）：R8 导入失败 stale 文案（`lastStorageErrorRef` 镜像最新错误）、R8 预检图片标签改「第 X 页第 Y 张图片」、M4 `clearTypographyMetricsCache` family 陷阱分支删除、M5 弃用 option 字段（punctuationPreferredEm/otherGapMaxEm）删除。门禁：tsc/ESLint/build 全绿，Vitest **43 文件 / 435 测试**；画布截图 `docs/screenshots/cover-slots-local/`（00 默认雅致教程态、A 上/中/下、B 中、C 上、内页不变）。**示例文案策略（2026-08-14 用户拍板，推翻上会话的三项规格外改动）**：① 默认主题回退**雅致**（新建空草稿同）；② 默认教程首页文案保持教程原文；③ 示例只跟公考绑定——默认教程未改过时切「公考·山水卷」，首页**整页**换成版式 A 示例封面（`replaceDefaultTutorialCoverHtml`，忽略空白逐字比对整个首页、改过一字就不动、可撤销、只动第一个分页符之前）；封面仍是三套示例之一时切版式同步换示例文案（沿用）；④ 右栏三张版式卡缩略图改**中性灰阶排版示意图**（PIL 生成，`cover-layout-*-v1.png`，任何主题下不违和）。浏览器回归：默认态/切公考整页换示例/全页 sealed/撤销恢复教程/改过标题不覆盖 5 场景全过（脚本 scratchpad `test_theme_swap.py`）。**公告已发**：核对 `default` 租户「Claude聊天助手」后回复刘彦君既有发布会话，消息 `om_x100b68c6b9b1bcb0b143212ef197155`（含双入口地址 + 飞书使用说明云文档链接）。**v1.10.0 无未完成步骤**。v1.9.0 记录如下（历史） |
| v1.9.0 迭代记录 | **v1.9.0「引擎提速版」2026-08-13 已双轨上线**（用户授权走闭环）。范围 = CODE-REVIEW §五 v1.9.0 行 + 用户拍板并入：① **P1** DP 断行求解器（`deterministicTextLayout.ts`：按 `model.min` 单调性提前终止内层扫描、`SegmentSolution` 改链式 `{cost,end,next}`、物化推迟到最优链重建；`lineAdjustmentModel` 增 `visibleTargetError` 供不物化淘汰 clamp 候选，`missingOptical` 前缀和复刻物化侧判据——可行集与旧实现严格一致）。微基准 100/500/2000 字与混排 = 67→15 / 6593→74 / 428401→**307** / 2824→72 ms；**等价性差分**：git HEAD 旧实现 vs 新实现 6 组语料（含 hardNoBreak 短语/标点密集/单字符）逐字节相等 + snapshotHash 相等；② **P5/P7** `deterministicTypography.ts`：导出基线校准写读分相（逐 atom reflow→整批一次）、`materializedAtomBaselines` 按 (font, line-height, 盒高) 类去重 probe（逐字素→每块 1–3 个）；端到端导出持平（html2canvas 主导），收益体现在打字延迟（11 页 382.4→71.2 ms、5 页 101.5→83.3 ms）；`lineBaseline` 缓存因字体加载失效风险明确不做；③ **R5** 纯打开草稿零落盘：真根因是 Editor 挂载 effect 在 onUpdate 回调身份变化时重放 HTML、旧回调依赖 draftReady 翻转致重放落在非 hydrating 窗口误标 dirty——改恒定身份回调（读 draftReadyRef/writerLeaseStateRef）+ autosave 守卫（dirty=false 且无 pending 且 revision>0 早退，新建空草稿 revision=0 例外），真实浏览器 5 场景回归全过；④ **M3** FNV-1a hash 实为 **4 处**拷贝（审查漏了 exportPng.ts 一处）+ 毫像素取整 2 处 → `stableHash.ts` 单一实现，单测钉死输出位；`deterministicTextLayout.ts` 对 stableHash 用显式 `.ts` 扩展名 import（node 直跑 solver-bench 需要）；⑤ **M7 五步拆分完成** App.tsx 2344→**1286 行**：`useWriterLease` / `useThemeCssVars` / `useResourceRecovery`(398) / `useDraftPersistence`(745) / `runExport`(279)；`hydrateDocument`、`activeDraftRef`、恒定身份 `handleEditorUpdate` 因跨域耦合留在 App（文件内有注释）；⑥ **默认教程重写**（用户目检通过）：覆盖公考主题/导入/发布文案/目录导出/滚动联动，修掉旧第 3 页两行排版超限——全新用户 5 页 layout issues 全空、导出直通无强制导出关卡；⑦ **字体减重第一刀**：index.html 跳过 LXGW 包入口 style.css（@import 6 份），直链 400/700 非 mono 两份。门禁：tsc/ESLint/build 全绿，Vitest **42 文件 / 417 测试**（v1.8.2 基线 41/412 + 新增 stableHash 5 项）。真实浏览器：`test_prod_deep`（本地+两生产入口）、`test_v180_local` + `test_v180_longdoc_local`（19 页联动）、`test_r5.py`（scratchpad，5 场景）全绿。发布闭环：`61267f0` 推 main + `deploy-oss.sh` 双轨同构建 `index-uiqcd8rt.js`，tag `v1.9.0` 已推，`archive/dist-v1.9.0/` 已归档。**生产回归事故记录**：Cloudflare 入口前三次 `test_prod_deep` 皆在首个导出等 download 120s 超时——探针定位为本机代理对 workers.dev 同源 Noto woff2 批量请求黑洞化 → `document.fonts.ready` 永挂 → 导出按既有 fail-safe 等待；同构建本地与大陆入口全绿、卡住字体为 v1.9.0 未触碰的 fontsource 文件、直连本网不可达（必走代理），判定纯环境故障；约 40 分钟后第 4 次复跑全绿闭环。**公告已发**：核对 `default` 租户「Claude聊天助手」后回复刘彦君既有发布会话，消息 `om_x100b68ea7945a4a0b1523fb7acae06a`。**v1.9.0 无未完成步骤** |
| v1.8.2 迭代记录 | **v1.8.2「性能版」2026-08-13 已双轨上线**（用户授权走闭环）。按 CODE-REVIEW §五 v1.8.2 行实现六项：① P2 `Editor.tsx` reportEditorState 三态浅比较 bail-out（ref 持上次值，光标移动值未变不回调 App）；② P3 `memo(Preview)` + App 端 `getPageRefCallback` 按页序缓存 ref 回调、画布回调（onSelectImage/onClearSelection/onCommitImage/recordRecentAction）全部 useCallback 固定，多页打字只重渲染变化页；③ P4 WAL 写入 200ms 短防抖（`WAL_DEBOUNCE_MS` + `walTimerRef`，定时器带 recoveryId 守卫防复活已清除 WAL；`clearAutosaveTimer` 连清 WAL 计时器），visibilitychange/pagehide 同步兜底原样保留；④ P6 `buildExportBatchCss()` 批级 CSS 缓存，`RenderPageOptions.cssText` 透传，`writeDirectoryPlan`/`executeZipExport` 批开头各算一次（含 retry 复用），onclone 注入策略不变；⑤ M1 删 `exportPages`/`triggerDownload`/JSZip 导入死管线约 50 行，`suggestFilename` 保留；⑥ M2 门控收敛为 `assertNoBlockingExportIssues(issues, {allowWarnings})` 单一实现，App 闸门与测试共用（测试改走 check+门控组合真实路径），语义逐行等价。门禁：tsc/ESLint/build 全绿，Vitest **41 文件 / 412 测试**；真实浏览器自查 23/23（打字/荧光笔/图片选择/12 页打字/撤销重做/双向滚动联动与开关/WAL 三路径：防抖后真实写入、900ms 自动保存清 WAL 不变、编辑后立即刷新不丢；console 0），脚本与截图在 scratchpad/v182。发布闭环：`dbf8c3b` 推 main + `deploy-oss.sh` 双轨同构建 `index-CNJjlkPq.js`，tag `v1.8.2` 已推，`archive/dist-v1.8.2/` 已归档；两生产入口 `test_prod_deep.py` 三主题+用户字体全绿。**公告已发**：核对 `default` 租户「Claude聊天助手」后回复刘彦君既有发布会话，消息 `om_x100b68fef232dca0de2af09d3045f55`（含飞书使用说明云文档链接）。**v1.8.2 无未完成步骤** |
| v1.8.1 迭代记录 | **v1.8.1「审查修复版」2026-08-13 已双轨上线**（用户目检截图后授权走闭环）。同日完成全量代码审查（四维度并行 + 人工核验，报告 `docs/CODE-REVIEW-2026-08-13.md`，后续迭代待办以其 §五版本编排为准）。七项修复：① 主题 fontSize 按 documentStore 同款 12–120 clamp（坏主题曾可砖化自动保存并清空 WAL）；② 导出预检新增 Canvas 2D 探针硬阻断（引擎层 measureText fallback 是 jsdom 单测的排版基座必须保持宽容，fail-closed 移到 App.tsx 导出闸门——实施中修正了审查原方案，10 个单测红过一轮）；③ 目录导出中断错误透出底层 cause；④ 粘贴 HTML 规范化改 DOMParser 惰性文档；⑤ Markdown 分隔线放宽 `-{3,}`；⑥ 滚动联动两处 cancelAnimationFrame 后清零 rafRef；⑦ 荧光笔默认透明度 50%→25%（不迁移旧草稿既选值，§8 冻结文案与 USAGE.md 已同步）。门禁：tsc/ESLint/build 全绿，Vitest **41 文件 / 412 测试**（+3：荧光笔默认值、themes clamp、`----` 分隔线）；真实浏览器自查荧光笔 25% 编辑器/画布/JSON 三处一致，截图 `docs/screenshots/v1.8.1/`。发布闭环：`dffd5cd` 推 main + `deploy-oss.sh` 双轨同构建 `index-BPzi9LFD.js`，tag `v1.8.1` 已推，`archive/dist-v1.8.1/` 已归档；两生产入口 `test_prod_deep.py` 三主题+用户字体全绿。**公告已发**：核对 `default` 租户「Claude聊天助手」后回复刘彦君既有发布会话，消息 `om_x100b68fe489288a4df6607a5ef94bc8`。**v1.8.1 无未完成步骤**。v1.8.0 完整记录见下行与 git 历史 |
| v1.8.0 迭代记录 | **v1.8.0「长文双向滚动联动版」2026-08-12 已双轨上线**（用户目检截图后授权走闭环）。实现按 `docs/ROADMAP-2026-08-12.md` §2 的四个工作包：① `documentScrollSync.ts` 纯映射层——视口中心语义锚点 `(pageIndex, blockIndex, blockProgress)`、双向投影、空页退化为页级锚点、clamp 饱和标记、结构签名，16 个新单测；② `useDocumentScrollSync.ts` 协调层——rAF 合帧（每帧一次测量+写入）、程序滚动事务 `(target, expected, 250ms 兜底)` 只确认不反投、wheel/滚动条 pointerdown/touchstart/滚动键立即接管主控权（鼠标按在内容后代=编辑不接管；可编辑上下文的方向键/空格不算滚动意图）、左右结构签名不一致跳帧重试（上限 20 帧）、ResizeObserver+fonts.loadingdone 失效重投、documentIdentity 变化全量清零并静止至首次人工滚动、图片手势期间暂停；③ 接线——EditorHandle 新增 `getScrollAreaElement/getEditorRootElement` 只读 DOM 引用，画布 sticky 标题真实 rect 高度参与可视中心，标题栏「滚动联动」开关复用 topbar-switch 视觉（会话态，不入草稿/undo/导出）；④ 回归——`test_v180_local.py`（双向定位/静置不振荡/打字不跳动/开关独立与恢复）+ `test_v180_longdoc_local.py`（19 页 fixture 导入后静止、中段页级完全对应、反向与快速交替 ±1 页内、console 0）。自查中修复一个真缺陷：点击编辑器聚焦曾被 pointerdown 误判为滚动意图抢主控权导致打字后画布跳 122px。门禁：tsc/ESLint/build 全绿，Vitest **41 文件 / 409 测试**；本地生产构建 `test_prod_deep.py` 三主题+用户字体全绿；截图在 `docs/screenshots/v1.8.0/`。发布闭环：`067a761` 推 main（Cloudflare 轨）+ `deploy-oss.sh`（大陆轨）双轨同构建 `index-37OJxpyY.js`，tag `v1.8.0` 已推，`archive/dist-v1.8.0/` 已归档。**两生产入口回归**：`test_prod_deep.py`（三主题导出像素+用户字体）双入口全绿；19 页长文联动门禁双入口全绿（页级对应与本地一致）；联动冒烟 Cloudflare 全绿+prod 截图归档，大陆入口功能项全过、一条直连 CDN 字体资源超时的偶发 console error（与 Gate 0 直连时延结论一致，同入口另两轮回归 console 0，判定环境偶发非应用缺陷；后续复跑受本机直连抖动 goto 超时所阻，未再取到全绿快照）。**公告已发**：核对 `default` 租户「Claude聊天助手」后回复刘彦君既有发布会话，消息 `om_x100b68f3e4d9d0a0c4c989a07938443`。**v1.8.0 无未完成步骤**。同日 Gate 0 CDN 字体诊断完成（见 §5），v1.7.3 完整记录见下行与 git 历史 |
| v1.7.3 发布闭环 | **2026-08-12 全部完成**（用户授权发布 + 目检页码 demo 后定稿）。两部分均已落地：① 求解器修复——`deterministicTextLayout.ts` 的 `lineAdjustmentModel` 对非两端对齐行同样启用闭标点可见墨迹悬挂，`raggedFittingWidth` 让 DP/贪心断行按可见右缘判宽，真实 19 页草稿（公考 + 44px + 宽松 + 「道理」短语不拆）复现场景 19/19 全绿、整句一行放下且短语不拆；② `REQ-EXPORT-PREFLIGHT-OVERRIDE`——`unsatisfied-line` 降为 warning（未知 code 默认 blocking），warning-only 页封存为 `ready-with-warnings`，预检弹窗显示页码+段落序号+原文+行号+建议，提供「返回修改 / 按当前预览强制导出 / 重新检查」，强制路径仅带 `allowWarnings` 白名单（`skipReadiness` 不再覆盖排版），`导出清单.json` 记录 `preflightWarnings`（含 snapshotId + 北京时间确认戳，已实测与封存快照一致）。验证：tsc / ESLint / build 全绿，Vitest **40 文件 / 393 测试**；真实 Chromium 完成用户场景回归 + 60 连续句号警告页强制导出 ZIP 全链路，console error 0；截图在 `docs/screenshots/v1.7.3/`。另含一项视觉微调：**公考·山水卷内页页码从顶线下方右侧移到下方居中**（`bottom: 96px` 居中；用户目检右下角/下方居中两版 demo 后选定居中，demo 在 `docs/design/v1.7.3/`；历史回退值 top:112/right:96）。`app/package.json` 已 bump 1.7.3。**发布闭环 2026-08-12 完成**：`143a899` 推 main（Cloudflare 轨）+ `deploy-oss.sh`（大陆轨）双轨同构建；两生产入口 `test_prod_deep.py` 三主题像素 + 用户字体全绿（版本 v1.7.3 / js=BEVpM1nC），大陆入口另做定点验证：18 页 fixture + 公考 + 44px + 宽松下「…言不明的道理。」整句一行、全页无 issue、内页页码 bottom:96px 居中；tag `v1.7.3` 已推、`archive/dist-v1.7.3/` 已归档；已核对旧企业租户 `default` 的「Claude聊天助手」后回复刘彦君既有发布会话发送公告，消息 `om_x100b68f233de94a4c3221a8360b798a`。**v1.7.3 无未完成步骤** |
| v1.7.2 发布闭环 | **2026-08-12 全部完成**：`v1.7.1` 初次生产门禁发现列表序号/正文中线 12px 回归，保留历史标签并升为 v1.7.2 修复；两入口同构建、1/2/5 页、公考主题、三旧主题、用户字体、撤销重做、标题/安全区、18/19 页导入与各 19 张真实 ZIP 全绿，H2 误差 0.5px、列表误差 0px；`archive/dist-v1.7.2/` 已生成。旧企业租户 `default` 的「Claude聊天助手」已回复刘彦君既有发布会话发送公告，消息 `om_x100b68f7a069a4a4b2a1ffe0d80a051` |
| v1.7.0 发布闭环 | **2026-08-11 全部完成**：Cloudflare + OSS/CDN 双轨加载同一构建；两入口 18/19 页导入、19 页真实 ZIP、1/2/5 页旧链、三旧主题、用户字体、撤销重做和 2160×3600 输出全绿；Cloudflare 另完成 5 页原生目录写入；`archive/dist-v1.7.0/` 已生成。旧企业租户 `default` 的「Claude聊天助手」已向刘彦君既有发布会话发送公告，消息 `om_x100b6887b2a35ca8b4a99575b534996` |
| v1.5.1 发布闭环 | **2026-08-11 全部完成**：`main` 与精确 `v1.5.1` tag 已推送，Cloudflare + OSS/CDN 双轨加载同一构建；两入口的 1/2/5 页、公考 Cover/Inner、标题字形、旧三主题、用户字体、2160×3600 导出和不依赖 dev hook 的 WP1–WP4 生产 UI 冒烟全绿；归档已生成。19:04 CST 使用飞书旧企业租户 `default` 的「Claude聊天助手」机器人发送专业公告至刘彦君 1v1，消息 `om_x100b6884555fe8b4b16098c17098e27` 已回读确认 |
| v1.5.0 发布闭环 | **2026-08-11 全部完成**：15:48 CST 完成 `main` / 精确 tag 推送、Cloudflare + OSS/CDN 双轨上线、两入口 1/2/5 页公考矩阵及旧三主题/用户字体深回归；16:10 CST 使用飞书旧企业租户的既有机器人将 `docs/RELEASE-v1.5.0.md` 专业公告发送至刘彦君 1v1 私聊并回读确认；Markdown 导入/自动编排继续顺延 |
| 技术栈 | Vite + React 19 + TS + Tailwind v4 + shadcn/ui + Tiptap 3 |
| 部署 | **双轨**。轨一：Cloudflare Workers，`git push origin main` 自动 build+deploy（1–3 分钟），不要碰后台；轨二：阿里云 OSS+CDN 大陆通道 `https://xhsposter.tshzchen.cn`，`bash tools/deploy-oss.sh`。**双轨发版纪律：每版两轨都必须推**（沃林发圈工具欠费停服事故教训） |
| 仓库 | https://github.com/l-yanjunnn/xhs-poster-editor （public，main） |
| 本地 | `/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/`，React 工作目录在 `app/` |
| v1.10.2 测试基线 | TypeScript、ESLint、Vite build 全绿，Vitest **45 文件 / 465 测试**全绿。Cloudflare + 大陆通道均通过 `test_prod_deep.py`、`test_v1102_dialog_viewport.py`、`test_continuation_prod.py` 与 `test_code_block_wrap_prod.py`：版本断言 v1.10.2，导出 PNG 2160×3600，弹窗几何/焦点、续段/真段尾、Code 块换行/空白保真全绿，console/page error 为 0 |
| 测试基线 | v1.10.0 正式版：Vitest **43 文件 / 435 测试**（+coverSlots 5 项/canvas 槽位契约 5 项等）、`tsc -b`、ESLint、Vite build 全绿；两生产入口 `test_prod_deep.py` + `test_cover_slots_export_local.py`（B 分隔条/主副标题居中±8px、C 眉题竖条、A 左缘回归，8 项像素断言）全绿；真实浏览器主题切换示例链路 5 场景（默认雅致教程/切公考整页换示例/全页 sealed/撤销恢复/改过标题不覆盖）全过。v1.9.0 基线：Vitest **42 文件 / 417 测试**（+stableHash 5 项）、`tsc -b`、ESLint、Vite build 全绿；两生产入口 `test_prod_deep.py` 全绿；`test_v180_local` + `test_v180_longdoc_local`（19 页联动）全绿；R5 五场景真实浏览器回归（脚本在 session scratchpad，规格见 PERF-BASELINE §四）全绿；性能对比复跑方式见 `docs/PERF-BASELINE-2026-08-13.md` §三。v1.8.2 基线：Vitest **41 文件 / 412 测试**、`tsc -b`、ESLint、Vite build 全绿（exportReadiness 测试改走 checkExportReadiness+assertNoBlockingExportIssues 真实路径；exportDelivery mock 增 buildExportBatchCss）；两生产入口 `test_prod_deep.py` 全绿；真实浏览器 `scratchpad/v182/test_v182_local.py` 23/23。v1.8.1 基线：Vitest 41 文件 / 412 测试、四门禁全绿（新增荧光笔默认值/themes fontSize clamp/`----` 分隔线断言）。v1.8.0 基线：Vitest 41 文件 / 409 测试、`tsc -b`、ESLint、Vite build 全绿；新增 `documentScrollSync` 纯映射层 16 个单测；真实浏览器回归 `test_v180_local.py`（5 页双向/开关/打字不跳动）+ `test_v180_longdoc_local.py`（19 页导入静止/页级对应/快速交替不振荡）+ `test_prod_deep.py` 三主题导出像素与用户字体。v1.7.0 基线（导入/导出链路，37 文件 / 292 测试起点）：Vitest、`tsc -b`、ESLint、Vite build 全绿；新增解析、17/18/19+、范围归一、无丢页/重复页、单文件夹/单 ZIP、清单、目录中断/清单失败续写、超长 UTF-8 文件名、同名普通文件碰撞、发布文案兼容与两端对齐断言。两个生产入口分别通过 18/19 页导入与约 196 MB 的 19 页真实 ZIP，旧链 1/2/5 页、三旧主题、用户字体、撤销重做与标题边界回归全绿；Cloudflare 另完成 5 页真实目录写入，5 张 PNG 与清单完整；两入口 console/page error 均为 0 |
| v1.7.2 门禁 | Vitest **40 文件 / 386 测试**、`tsc -b`、ESLint、Vite build 全绿；最小样例：行末误差、汉缝偏差、混排 baseline、标点双侧净空、冒号左右差、行末可见右缘均为 0，跨行下划线逐行存在；预览/导出行列 lag 均 0，H2 bbox 最大差 1px。真实 19 页本地 19/19；两个生产入口各通过 18/19 页导入与 19 张 2160×3600 ZIP，以及 1/2/5 页、三主题、用户字体和 UI 冒烟；console/page error 为 0 |
| 定位 | 小红书 9:15（3:5）长图排版工具，给非技术用户开箱即用。阶段 A：纯静态站点（无登录无后端） |

### 迭代待办快照（2026-08-19 更新；v1.11.0 规格以本节为唯一来源；旧 `docs/ROADMAP-2026-08-12.md` 只保留长期候选，代码质量项仍参考 `docs/CODE-REVIEW-2026-08-13.md` §五）

> **v1.10.2 已于 2026-08-16 双轨上线并出列，当前没有发布遗留。v1.11.0 已完成本地实现与测试；2026-08-19 用户已锁定紧凑/舒展值并授权走上线闭环。当前发布正在进行，尚不能描述为已上线。** `R7` 英文长段落 justify 继续 mark 不做（详见 CODE-REVIEW §五）。下表 P2/P3 为尚未立项或待触发事项。

| 优先级 | 待办 | 一句话范围 |
|---|---|---|
| P0·v1.11.0（已锁值，发布中） | 封面副标题字距三档 | 「紧凑 / 标准 / 舒展」全链路已实施；standard 保持 v1.10.2，紧凑/舒展数值已于 2026-08-19 由用户锁定 |
| P1·v1.11.0（本地完成） | H1 宽度命名澄清 | 右栏已改名为`全篇 H1 宽度`；原位置、原选项、持久化和行为未变，左侧 H1 工具未动 |
| P1·v1.11.0（本地完成） | 首图微排版可靠性回归 | 真实 Chrome 已锁住群聊文案、普通空格/NBSP、`Shift+Enter`、三套版式、预览/2160×3600 PNG 与 sealed snapshot 一致性 |
| P0·反馈 1 ✅v1.10.2 已上线 | 低视口导入确认弹窗可达性 | 弹窗固定头尾、只让中间正文滚动，任何支持的桌面视口下都能看到并操作「生成到新草稿」 |
| P1·反馈 3 ✅v1.10.2 已上线 | `Enter → 分页` 跨页续段 | 为跨页续段建立显式语义；只有上一页的续段末行铺满，真正段尾仍自然左对齐 |
| P1·反馈 4 ✅v1.10.2 已上线 | Code 块长行自动换行 | 保留空格/Tab/手工换行与等宽字体，中文、URL 和无断点长串不得在编辑区、画布或 PNG 右侧被裁掉 |
| P2 | 字体本地化后续刀 | 第一刀（LXGW 6 份 CSS→2 份）已随 v1.9.0 上线；剩余 = ZCOOL/马善政/Long Cang/LXGW 的 CDN 本地化或 npm 化、字重档位，按真实使用率拆批 |
| P2 | 跨刷新目录续写 | 当前导出中断续写仅同一页面会话有效；评估目录句柄持久化、重新授权与已有文件核验 |
| P2·先量化 | 清理 `hasRaceArtifact + retry` | v8 后属死保险，纯黑右缘背景会误判致每页多渲染 3 遍；先用生产矩阵证明可安全删 |
| P2·契约审计 | 隐藏快捷键去留 | inline code / strike / code block 等 StarterKit 偶然继承行为，明确正式支持或禁用 |
| P2·条件触发 | PWA 与资源自诊断 | 出现明确安装诉求或重复线上故障后再立项；不与 Tauri 同时开工 |
| P3 | 37+ 上传分组重均衡 | 等 37+ 页真实样本；是发布工作流优化，不是导出缺陷 |
| P3 | 小红书原生长文管线 | 另一条平台管线，需先重新调研账号能力与当期规则 |
| P3 | 独立 `PosterTemplate` | 只有出现「带正文骨架/封面字段槽位/页类型」需求才设计；Theme 继续只管视觉 |
| P3·条件触发 | 手机端独立壳 / v2.0.0 产品壳 / SaaS / Tauri | 各有触发条件，见 ROADMAP §1 |

#### v1.11.0「封面副标题微排版」（已锁值｜用户已授权｜发布中）

> **状态边界**：2026-08-19 用户已确认完整范围，并因新增用户可见能力正式锁定版本号 `v1.11.0`。当日已完成本地候选与 WP1–WP4 门禁；用户随后以「我们走上线闭环」锁定当前视觉值并单独授权发布。线上稳定版、最新精确 tag 与最新归档在闭环完成前仍为 v1.10.2；本节同时保留实施规格与本地证据，不代表生产已经上线。

##### 一、需求来源与归因边界

- 证据源是飞书群「公考美术优化」2026-08-18 21:10 至 2026-08-19 00:04 的消息与截图；群内「麦宏博」即本项目语境中的「小麦」，截图里的线上编辑器为 v1.10.2。
- **小麦直接反馈**：发出一张副标题发生折行的首图后表示“看起来不对劲”，随后用红框标注副标题区域；提出“可以调一下副标题的左右间距”；被建议切 80% / 100% 后回复“调整不了哦，我 try 过了”。这能确认现有操作没有解决他的排版问题，但不能仅凭群聊判定他要的是区块宽度、统一字距、局部空格还是更明确的断行控制。
- **周宇直接反馈**：除第一张图外的其余页面“完全没问题，手工感非常棒”，本轮重点只改首图并提升点击率；要求封面“有呼吸感”，在截图中标出若干词组/标点边界并说“需要加空格，调下字间距”。标注更接近局部留白，不能反推为他已明确要求整段统一 `letter-spacing`。
- **代码核验**：封面副标题当前为 `text-align: start`、`text-align-last: auto`，不是两端对齐块；之前群里把问题笼统归为“两端对齐优化”的说法不能当作已确认根因。本版不得重写 justify 或确定性断行引擎来“修”一个尚未成立的根因。
- **2026-08-19 产品决定**：尽管统一字距不是小麦原话，用户同意先把「紧凑 / 标准 / 舒展」做成封面副标题专属、可撤回的实验能力，再根据实际使用决定保留或隐藏。该实验不得宣称已经完整解决“小麦的左右间距反馈”。
- 附件里虽出现“本页内容已超出安全区，请手动分页”，但周宇同时明确除首图外都没问题；安全区/自动分页不纳入本版。iCloud 共享文件夹不可见属于协作权限问题，也不归因为编辑器缺陷。

##### 二、确认范围

1. **副标题字距三档**
   - 右栏封面版式区域新增「副标题字距」，展示为「紧凑 / 标准 / 舒展」，内部值固定为 `compact / standard / relaxed`。
   - 只作用于首页“第一个 H1 + 紧邻第一个 p”中的副标题；不改变文字内容、主副标题对齐关系、区块宽度、字号、行高、颜色、上下间距或分页语义。
   - `standard` 的定义不是统一写死一个新数值，而是**严格保持 v1.10.2 各主题/版式当前视觉**：公考普通/居中约 `0.02em`，其他主题普通/居中沿用 `normal/0`，kicker 眉题沿用 `0.18em`。
   - `compact / relaxed` 的最终数值属于视觉标定，不在未目检前冻结。首轮候选可从普通版式 `0em / 0.08em`、kicker `0.10em / 0.26em` 起做样张；其他主题若“紧凑”和“标准”无可见差异，不得为了制造差异直接上线负字距，先通过真实字体与 PNG 目检决定。
   - 入口可标记为实验能力；如果后续证实冗余，只隐藏 UI，继续保留解析/渲染兼容，不能让已经保存该档位的草稿失真或打不开。
2. **H1 宽度命名澄清**
   - 现有 `h1Width` 实际作用全篇 `.content h1`，本版只将右栏文案从「H1 宽度」改为「全篇 H1 宽度」，保持原位置、选项、持久化与行为。
   - 左侧编辑区的 H1 语义工具继续存在；改右栏文案或增加副标题字距，都不会删除、替换或改写 H1 节点。
   - 不把现有全局 `h1Width` 移进封面版式，也不改名为「主标题宽度」。未来若需要封面专属主标题宽度，必须新建独立字段，不能复用全局字段造成误导。
3. **真实样稿可靠性回归**
   - 核心副标题 fixture 使用群聊原句：`「看起来」高分和「实际高分」是两件事情`；同时覆盖用户插入单个有意空格、数字/中文混排、短副标题、长副标题与 kicker 眉题。
   - `Shift+Enter` 继续表示同一副标题内软换行，`Enter` 继续新建块；本版不改变既有编辑语义。
   - 普通文本、且不属于既有“中文粗体边界空白清理”场景时，单个有意空格与 NBSP 必须在 Tiptap JSON、刷新恢复、中央预览和 PNG 中可预期保留；本版不改变既有粗体边界清理规则，也不把连续多个普通 ASCII 空格定义为精排工具。

##### 三、实施工作包

1. **WP1 · 状态、草稿与主题兼容**
   - 在 `coverSlots.ts` 建立 `CoverSubtitleSpacing`、默认值 `standard`、三档选项与 normalize；运行时 `Theme` / `EditorDocumentStyleV2` 增加 `coverSubtitleSpacing`。
   - 旧 V1、旧 V2、旧用户主题缺失或出现非法值时一律 normalize 为 `standard`；不得把缺字段改成草稿/主题损坏。无需升级 `EditorDocumentV3`、IndexedDB `DB_VERSION` 或 recovery key。
   - 接通新建/导入/删除至最后草稿后的样式来源、普通 IndexedDB 快照、WAL/recovery、草稿 hydrate、主题应用/保存/恢复。
2. **WP2 · Inspector 与应用状态**
   - 在现有封面版式/垂直位置控制附近增加三段式控件，辅助说明“只影响封面副标题”；图片或正文文字选中态不重复出现入口。
   - App state、`documentStyle` 及其依赖、hydrate、apply/save theme、`customize()` dirty 标记、Preview 和 Inspector props 全链路接通。
   - 同批完成「H1 宽度」→「全篇 H1 宽度」的纯文案澄清，不改变现有 `h1Width` 数据。
3. **WP3 · 局部渲染与 sealed snapshot**
   - 扩展 `coverSlotDataset(isFirstPage, layout, vertical, spacing)`，同步更新 Preview 与 ThemePreview 调用；通过首页 dataset/CSS 将字距限定到 `.page--first .content > h1:first-of-type + p`。
   - CSS 规则必须放在公考主题、poster-center 与 kicker 规则之后；`standard` 不得新增统一 `letter-spacing` 覆盖，只为 `compact / relaxed` 加规则，kicker 特化规则最后，以保证旧草稿回落 standard 后视觉不漂移。
   - 左侧编辑区只保证副标题文字、普通场景空格和软换行语义，不在本版新增字距实时预览接线；最终字距以中央成品画布与 PNG 为准。H1、内页、正文 density 与其他标题均保持不变。
   - 将新属性加入 `previewLayoutRevision`、Preview 两组排版事务依赖和 ThemePreview typography 依赖；切换后 Preview 必须从 pending 重新得到最新的 `ready`（或既有 warning 状态）+ `sealed` 快照，ThemePreview 必须更新 dataset、视觉与光学校准，快速连续切换不得被旧事务回写。
   - 字距实际变化时，切换前后的 Preview snapshot ID 必须不同，并断言副标题 atom 间距/横坐标或换行几何发生对应变化，不能只检查最终重新显示 `ready + sealed`。
   - 不改 `deterministicTypography.ts` / `deterministicTextLayout.ts` 算法：现有链路已读取 computed `letter-spacing` 并烘焙进 atom 几何。PNG 继续复制用户眼前同一份 sealed snapshot，不另建导出排版分支。
4. **WP4 · TDD、真实浏览器与视觉标定**
   - 单元/契约测试至少覆盖：三档 normalize 与首页 dataset、内页无属性、旧 V1/V2/用户主题兼容、IDB/WAL 往返、Inspector 选中态、主题保存/恢复、CSS 作用域与规则顺序、Preview 重新 `ready + sealed`、ThemePreview dataset/视觉更新、文字 Unicode 完整性。
   - 浏览器核心矩阵：公考主题 3 套封面版式 × 3 档字距，共 9 组；至少一个非公考旧主题也覆盖三档，且用 `standard` 与 v1.10.2 做视觉非回归；三个垂直位置各覆盖一例。
   - 使用群聊真实副标题检查 computed 字距、折行、溢出、文字完整性、单个有意空格、`Shift+Enter`、自动保存刷新与用户主题恢复。
   - PNG 至少覆盖 3 版式 × 3 档，尺寸固定 `2160 × 3600`；预览与 PNG 的行数、位置、文字与 snapshot 一致，poster-center 仍居中，kicker 竖条/顺序不回归。

##### 四、明确不做

- 不在本版新增「副标题宽度 / 左右 padding / 80%—100%」控制；这仍是小麦直接反馈的强候选，但要等三档字距真实使用或再次确认后独立立项。
- 不新增封面主标题专属宽度，不移动现有全局 H1 宽度，不改 H1 节点或左侧编辑工具。
- 不做自由字距滑杆、任意数值输入、选中文字局部 tracking、连续多空格精排或自由文本框。
- 不改正文两端对齐、确定性断行/标点算法、分页、安全区、图片、PNG/ZIP/目录交付管线。
- 不把去内部术语、去 AI 句式、点击率文案、B 站复用或 iCloud 素材归档混进编辑器代码；这些属于内容/协作工作流的后续议题。
- 本规划阶段不 bump `app/package.json`，不创建 tag/归档，不部署双轨，不发公告；用户目检和发布授权必须分开取得。

##### 五、验收顺序与状态检查表

1. 先锁 v1.10.2 `standard` 基线截图/PNG，再写失败测试与实现，防止“标准档”偷偷改旧视觉。
2. 完成状态/兼容 → UI → CSS/排版事务 → 单元门禁；再生成三档 × 三版式本地截图与 PNG 供用户目检。
3. 用户确定紧凑/舒展的最终视觉数值后，再跑 `tsc -b`、ESLint、Vitest、Vite build 与真实浏览器完整回归。
4. 只有用户另行明确授权，才 bump 版本、提交、tag、双轨部署、双生产入口回归、不覆盖归档与公告；不能把“同意规划/开始开发”解释为发布授权。

- [x] 已读取 2026-08-18—19 群聊并区分小麦、周宇与产品推断
- [x] 用户同意三档字距作为可撤回实验方向（2026-08-19）
- [x] HANDOFF 规划草案已写入（2026-08-19）
- [x] 用户确认 v1.11.0 完整范围（2026-08-19）
- [x] RED 复现 / v1.10.2 标准基线（2026-08-19）
- [x] 功能实现与单元门禁（2026-08-19）
- [x] 本地真实 Chromium / 2160×3600 PNG 回归（2026-08-19）
- [x] 用户目检并锁定紧凑/舒展数值（2026-08-19）
- [x] 用户单独授权发布（2026-08-19，「我们走上线闭环」）
- [ ] bump / commit / 精确 tag / 双轨部署 / 双入口生产回归
- [ ] `archive/dist-v1.11.0/` 不覆盖归档、README/USAGE/HANDOFF/公告闭环

**2026-08-19 本地候选证据（未发布）**：

- 开工顺序已锁：当时 `HEAD=e74a815` 的 `app/src` / `app/package.json` 与 v1.10.2 tag 无差异；先保留 v1.10.2 real-fixture standard 截图/PNG，再以 `coverSlots.test.ts` 稳定得到 3 项 RED，之后才接入实现。权威基线是 `docs/screenshots/v1.11.0/standard-baseline-v1.10.2-real-fixture/`。
- 用户已锁定首轮校准值为正式值：普通/居中 `0em / 0.08em`，kicker `0.10em / 0.26em`；standard 没有新 CSS 覆盖，继承 v1.10.2 的主题/版式差异。
- 单元/契约：`tsc -b`、ESLint、Vite build 全绿；Vitest **45 文件 / 481 测试**全绿。独立只读实现审计没有发现 P0/P1，且确认未改确定性算法、分页、安全区、PNG/ZIP/目录导出管线。
- 应用状态真实 Chrome：`tools/export-race-repro/test_v1110_state_local.py` **10/10 PASS**，覆盖页面/文字/图片选中态、快速切档 latest-wins、三档 snapshot/atom 几何变化、上中下三位置、普通空格/NBSP/`Shift+Enter`、自动保存刷新和用户主题恢复。
- 公考视觉矩阵：`tools/export-race-repro/test_v1110_cover_subtitle_local.py` 完成 3 版式×3 档共 9 组；9 张 PNG 均为 2160×3600，导出前后文字/折行/snapshot 未变，poster-center 仍居中，kicker 竖条仍存在。standard 的 sealed geometry/snapshot/画布截图与 v1.10.2 real-fixture 严格相同；3 张 PNG 分别只有 98 / 63 / 48 个像素的 1 色阶抗锯齿差异（最高 0.00127%），均低于 0.002% 门槛。候选证据在 `docs/screenshots/v1.11.0/candidate-real-fixture-v1/`。
- 非公考旧主题：`tools/export-race-repro/test_v1110_nonpublic_local.py` 已跑「极简白」三档，standard 与真 v1.10.2 画布逐像素一致；其旧字距本为零，compact 保持相同，relaxed 会改变 sealed 几何，未为制造差异引入负字距。证据在 `docs/screenshots/v1.11.0/nonpublic-minimal-white-v1/`。
- 锁值备注：左叠排/居中三档差异故意保持克制；长真实副标题在 kicker standard 中的窄栏多行是 v1.10.2 原视觉，compact 明显收拢，relaxed 仍保留窄栏特征。详见 `docs/screenshots/v1.11.0/README.md` 与联系表。
- 发布边界：产品提交 `919802a` 与视觉证据提交 `2052473` 已落地；`app/package.json` 已 bump 为 1.11.0，本地四门禁、真实 Chrome 10 场景、3 主题 PNG 深回归和 3×3 全尺寸矩阵均全绿。当前构建为 `index-CStU0xGT.js` / `index-gRCFVCH5.css`；push/tag/归档/双轨部署/生产回归尚未完成。工作树中用户的 `docs/飞书使用说明-文档封面.png` 仍未跟踪，未纳入、移动、覆盖或删除。

##### 六、新窗口开工提示

> 继续小红书排版编辑器 v1.11.0「封面副标题微排版」。先读 `HANDOFF.md` §0 的 v1.11.0 规格与本地证据；WP1–WP4 已实施，用户已锁定视觉值并授权走上线闭环，不要重复开发或再要求范围确认。当前从产品提交 `919802a` 继续：修正后的像素比较器与发布文档已在工作树，下一步是 bump v1.11.0、跑最终本地门禁、精确 tag、双轨部署、双生产回归与不覆盖归档。公告文案要专业完整；只有用户明确要求代发时才调用飞书机器人。继续保留用户的未跟踪文件 `docs/飞书使用说明-文档封面.png`，不纳入、移动、覆盖或删除。

#### v1.10.2「用户反馈可靠性修复」（2026-08-16 已完成并双轨上线）

**范围结论**：用户反馈共 4 项，本迭代实现 **1 / 3 / 4**，已完成代码、测试、真实浏览器/PNG 回归和生产发布闭环。反馈 2 是已有编辑语义与用户操作方式不一致，不改产品语义。以下原始规格保留作验收依据。

##### 反馈 1｜低视口下导入确认按钮不可达

**需求与验收口径**

- 文件选择、拖拽、粘贴和示例文档进入「确认解析结果」后，弹窗头部和底部操作区始终留在视口内；只有中间解析结果区可纵向滚动。
- 在 1366×650 和 1600×720 等低高度桌面视口下，用户无需缩放页面就能看到并点击「生成到新草稿」，也能通过鼠标滚轮/触控板阅读中间全部内容。
- 普通高度视口、关闭、返回修改、生成新草稿和焦点顺序不回归。

**已确认根因**

- `app/src/components/ImportDialog/ImportDialog.tsx` 的 `DialogContent` 只有 `max-h-[calc(100vh-56px)]` 和外层 `overflow-hidden`，没有明确的三行 Grid 轨道。`auto` 轨道按中间内容的 max-content 撑开，已有 `min-h-0 overflow-y-auto` 的正文区没有被压缩，最终由外层直接裁掉 footer。
- 生产 1600×720 已稳定复现：弹窗可见高度约 664px，自然行高却是约 93 / 726 / 65px，底部 CTA 完全落在视口外。因此这是确定性布局缺陷，不是用户没找到按钮。

**实施方法**

1. 只在 `ImportDialog` 的 `DialogContent` 上补 `grid-rows-[auto_minmax(0,1fr)_auto]`，将限高改为动态视口单位 `max-h-[calc(100dvh-56px)]`（如要兼容旧浏览器，通过局部 CSS 保留 `100vh` fallback）。保留正文区已有的 `min-h-0 overflow-y-auto`。
2. **不改全局通用 `DialogContent`**，避免影响其他弹窗。`app/src/components/ExportDialog/ExportDialog.tsx` 已确认存在同样的三段结构和限高写法，同批在 ExportDialog 上定向补同样的 Grid 行约束并单独验收，不把修复上移到通用组件。
3. 弹窗的 header/footer 不参与滚动，中间区是唯一 scroll container；不用放开外层 `overflow-hidden` 来制造整个弹窗滚动。

**自动化门禁**

- 新增低视口 Playwright 几何断言：`CTA.getBoundingClientRect().bottom <= window.innerHeight`；footer 滚动前后均可见；中间区 `scrollHeight > clientHeight`，真实 wheel 后 `scrollTop > 0`。
- 分别覆盖文件选择、拖拽、粘贴、示例进入 review 的路径；同时回归 ExportDialog 的长清单。
- 加一组窄宽视口回归，检查 footer 换行后仍在可见区；仅用 `Tab` / `Shift+Tab` 能进入中间区并到达 footer 所有操作，焦点不被裁剪区域吞掉。
- **不能只用 `locator.click()` 当可达性证据**：Playwright 会将被 `overflow-hidden` 裁掉的节点程序性滚入视图，会掩盖真实缺陷。

##### 反馈 2｜封面标题换行（已拍板：不开发）

- 保持现有契约：`Enter` 将 H1 拆成两个块级标题，封面主标题槽位只识别第一个 H1；同一标题内只换行必须用 `Shift+Enter`。
- 对外回复口径：「封面标题内换行请用 `Shift+Enter`；`Enter` 会新建一个标题段落，因此不再属于原封面主标题。」
- **不改 UI、文档模型、封面槽位或样式规则；不得把所有连续 H1 都染成封面主标题色**，否则会吞掉用户真正的第二标题，也会破坏副标题槽位的相邻语义。

##### 反馈 3｜`Enter → 分页` 后，跨页续段的上一页末行应正常铺满

**需求与验收口径**

- 反馈用户已确认完整操作是：一个正文段落过长时，在需要跨页的位置先按 `Enter`，再插入分页符。
- 产品将这条操作路径理解为「同一正文段落跨页继续」：上一页最后一行按普通自动换行行处理，在合法字距/标点界限内两端铺满；下一页从同一段落继续。
- **真正的段落末行和 `Shift+Enter` 前的显式换行仍自然左对齐**。不将全文所有段尾拉满，不影响标题、列表、引用和 Code 块。
- 编辑区、画布预览和 PNG 对「续段/真段尾」的解释一致；画布与 PNG 必须复用同一份已封印的确定性几何。

**已确认根因**

- Tiptap 的 `Enter` 执行 `splitBlock`，将原文本拆成两个独立段落；接着分页后，上一页的文本在结构上已被当成真段尾。
- `app/src/lib/deterministicTextLayout.ts` 当前只对 `end === 'wrap'` 的行做 justify；自动换行用 `wrap`，`Shift+Enter` 用 `explicit`，段落末行用 `paragraph`。因此用户在原自动换行处按 Enter 后，该行会从「铺满行」变为「自然段尾」，字距和断行位置随之变化。这不是随机排版抖动，而是缺少「跨页续段」语义。

**实施方法**

1. 给根级 `RootPageBreak` 增加可持久化的 `continuation: boolean` 属性（HTML 使用明确 `data-*` 属性），旧草稿无属性时默认 `false`。分页符仍必须是 Tiptap `doc` 直接子节点，不破坏 §1 决策 9/15。
2. 插入命令覆盖两条续段入口：①光标直接位于正文段中时分页，命令知道前后文本原属同一段，标记 `continuation=true`；②用户已确认的 `Enter → 分页` 主路径，用交易 meta 或窄范围 plugin state 记住刚刚发生的 split boundary，在没有中间编辑且选区仍在该边界时将分页转为续段。
3. **不得仅凭「分页符前后恰好是两个段落」的 DOM 相邻关系猜测续段**；否则用户在真段落边界分页也会被误标。选区移走、继续输入或执行其他结构操作后，临时 split candidate 必须失效。
4. 让 `normalizePageBreakHtml` / `normalizePageBreakJson`、Tiptap JSON/HTML round-trip、自动保存、恢复、撤销/重做都保留这个布尔属性；对粘贴/导入的非法值按 `false` 闭合。
5. `splitIntoPages` 在切页时把该边界翻译为「上一页末段是 continuation terminal」的渲染标记，不能在移除 `<hr>` 时丢掉语义。
6. 为确定性求解器增加显式 terminal 类型/选项（如 `continuation`）：仅 `wrap` 和 `continuation` 的行进入 justify，`paragraph` / `explicit` 仍保持现状。**不能只在 `materializeLine` 最后强行拉宽**；DP/贪心断行的候选可行性、成本、`ragged` 判定和 emergency 路径都要从求解开始将 continuation terminal 视为需铺满行，否则会先选错断点再硬拉字距。编辑区如需即时反馈，只能对带 continuation 属性的紧邻前段使用局部样式，不改全局 `text-align-last`。

**明确禁止的伪修复**

- 不全局设置 `text-align-last: justify`；这会把短段和真段尾也强拉满。
- 不只改 CSS；画布文字已由确定性引擎物化，预览/PNG 必须在求解层理解 continuation。
- 不用纯 DOM 相邻猜测代替可持久化文档语义，不改写真正的 `Enter` 分段契约。

**自动化与视觉门禁**

- 命令/文档层：段中直接分页会标记续段；`Enter → 分页` 会标记续段；真段落边界分页不标记；选区移走/编辑后临时 candidate 失效；分页符始终是 doc 直属。
- 持久化：JSON/HTML round-trip、草稿保存重载、撤销/重做、粘贴/导入规范化，旧草稿默认 `false`。
- 求解器：continuation terminal 的最后一行 `justified=true`；真段尾和 hard break 的最后一行仍 `false`；断行结果在字距/标点上限内，无新增 `unsatisfied-line`。
- 极短的 continuation terminal 如果在既有字距/光学上限内无法合理铺满，继续走现有 emergency/预检机制；不为了「必须铺满」放宽排版安全阈值。
- 端到端：用反馈主路径的真实长段落测试编辑区、1080×1800 公考画布和 2160×3600 PNG；上一页末行左右边界在断言容差内，预览与 PNG 的 snapshot hash/行几何一致。再用一个旧主题回归真段尾不被拉满。

##### 反馈 4｜Code 块长文本无法自动换行

**需求与验收口径**

- Code 块在固定宽度静态海报中必须自动换行，不能依赖横向滚动；中文长句、长 URL 和无断点 token 都不得超出内容宽度或被 `.page { overflow: hidden; }` 裁掉。
- 保留用户原文中的手工换行、连续空格、Tab、空行和等宽字体；自动换行不得改写 Tiptap 内容或插入真实换行符。
- 左侧编辑区、中央画布和导出 PNG 的可见文本、换行语义一致。

**已确认根因与实施方法**

- `app/src/styles/editor.css` 的 `.tiptap-editor pre` 和 `app/src/styles/canvas.css` 的 `.content pre` 都没有显式换行规则，沿用 `<pre>` 默认 `white-space: pre`；画布页又使用 `overflow: hidden`，因此超宽内容直接被裁。导出复制同一画布 DOM/CSS，PNG 也会重现。
- 同时在两处 `pre` 规则增加：

  ```css
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
  max-width: 100%;
  ```

- `white-space: pre-wrap` 保留原始空白和手工换行，同时允许按版心换行；`overflow-wrap: anywhere` 只在无合法断点的长 URL/token 必要时断开，也能正确收缩这类内容的 min-content 宽度。不用 `overflow-x: auto` 当静态海报解法，也不用隐藏溢出假装问题消失。
- **不要将 `pre` 加入 `deterministicTypography.ts` 现有文字块物化选择器**。现有求解输入不保证完整保留 Code 块的空格/Tab/手工换行，本补丁由 CSS 负责 Code 换行，避免内容损坏。
- 本项只修横向超宽/裁剪，**不在本迭代承诺超高 Code 块的自动分页**；纵向高度超出是独立分页需求，不能借换行补丁暗中改页面结构。

**自动化与导出门禁**

- CSS 契约测试同时锁住 editor/canvas 的 `pre-wrap` 与断词规则。
- 真实 Chromium fixture 同时包含：超长中文、超长 URL/单 token、缩进、Tab、空行和手工换行。断言 `pre.scrollWidth <= pre.clientWidth`、页面无横向溢出、`textContent` 与原文一致，换行后的下半部文字可见。
- 导出 2160×3600 PNG 做右边缘与换行后下一行像素断言，确认没有右侧截断、下一行实际进图。至少覆盖公考主题和一个旧主题，并回归普通段落/行内 code 未受影响。

##### 完成与发布记录（2026-08-15–16）

- 三个产品工作包保持独立提交：`3b93160`（低视口弹窗）、`9879dca`（Code 块换行）、`ff85779`（跨页续段）。均按 RED → GREEN 落地；反馈 3 在独立复核中发现并补齐可信 Enter provenance、Backspace→Undo 反例、尾随/连续 hard break 与封面副标题排除，复核后无剩余阻断。
- 全量本地门禁：TypeScript、ESLint、Vite build 全绿，Vitest **45 文件 / 465 测试**全绿；代码审查未发现发布阻断。自动扫描对测试夹具中的 `selector` / dummy `token` 给出两条误报，人工确认既非 SQL 拼接也非凭据。
- 反馈 1 真实 Chromium：文件、拖拽、粘贴、示例四入口与 19 页导出弹窗，在 1366×650、1600×720、900×650 下均验证固定头尾、正文真实滚动、CTA 可见和 Tab / Shift+Tab 可达；console/page error 为 0。
- 反馈 3 真实 Chromium：通过真键盘 `Enter` 后点击真实「插入分页」按钮；公考续段末行 `right=target=840`、`residual=0`，真段尾 `777.2 < 888`，旧主题真段尾 `697.2 < 920`；三页均 ready + sealed + 0 issue，导出 PNG 为 2160×3600，预览/导出复用同一 snapshot。
- 反馈 4 真实 Chromium：公考与深夜黑双主题的长中文、URL、无断点 token、Tab、连续空格、空行和手工换行均保真自动换行，无横向溢出或安全区警告；Code 块后的普通段落仍可见，两张导出 PNG 均为 2160×3600，console/page error 为 0。
- 用户目检材料已固化到 `docs/screenshots/v1.10.2/`。本地/dev-hook 回归用 `test_v1102_dialog_viewport.py`、`test_continuation_local.py`、`test_code_block_wrap_local.py`；不依赖 dev hook 的生产回归用 `test_prod_deep.py`、`test_v1102_dialog_viewport.py`、`test_continuation_prod.py`、`test_code_block_wrap_prod.py`。
- **发布与精确 tag**：`app/package.json` 为 `1.10.2`，发布提交与 `v1.10.2` tag 均固定在 `0b2d6468c9f8aa4db9cdf6d88533b7eaff47f267`；`main` 已推送，Cloudflare 与 OSS/CDN 双轨均已上线。HTML / JS / CSS 的文件名、SHA-256 与双入口同构结果见 §0。
- **生产门禁**：Cloudflare + 大陆通道均完成 `test_prod_deep.py` 与弹窗/续段/Code 块三组定向回归，全部通过。Cloudflare 回归期间的代理 HTTP/2 黑洞已定位为测试环境问题；Chromium 改用 `--disable-http2`，`test_prod_deep.py` 同时对 jsDelivr 做 proxy bypass，不改产品代码或线上资源策略。
- **归档**：`archive/dist-v1.10.2/` 已生成（9.6M），按归档脚本策略排除 3337 个字体分片；完整复原使用 `v1.10.2` + `bash ci.sh`。
- **公告状态**：按用户最终决定，公告只合并 **v1.10.1 + v1.10.2**。2026-08-16 已核对旧企业租户 `default`、「Claude聊天助手」与刘彦君既有发布会话，并由机器人发至 1v1 私聊；最终消息 `om_x100b673d13ea44a0b4af0de2ed1ccd4` 已通过全文检索回读，群聊由用户自行转发。

##### 实施顺序、提交边界与整体验收（已执行）

1. 按 **反馈 1 → 反馈 4 → 反馈 3** 完成：先收口独立弹窗布局，再处理局部 CSS/导出回归，最后处理文档语义 + 分页 + 求解器链路。三项保持独立 commit 和定向测试，仍可单独定位。
2. 每个工作包均以失败测试复现缺陷后实现；验收包含几何、持久化、真实交互与 PNG 产物断言，不只做class/函数调用级检查。
3. 用户目检、本地总门禁、双轨部署、双入口深回归与三组定向回归、精确 tag、归档和 v1.10.1–v1.10.2 合并公告私聊发送均已完成。

**后续接手原则**：以 §0 现状为准；改导出相关代码前必读 §5，动手前扫 §6 对应域。`codex exec` 需 `--skip-git-repo-check`。dev 模式可用 `window.__editor` 和 `window.__test`；生产验证必须使用不依赖这两个钩子的 prod 脚本。

---

## 1. 关键决策（已拍板，不要推翻）

1. **SaaS 层次**：A（纯静态站点），后续再考虑 B（Supabase）/ C（付费 SaaS）
2. **包管理器**：pnpm（不是 npm/yarn/bun）
3. **UI 组件库**：shadcn/ui（Nova preset，Radix 底层），base color = neutral
4. **CSS**：Tailwind v4（@tailwindcss/vite 插件，配置在 `src/index.css` 的 `@theme` 块，无 tailwind.config.js）
5. **富文本**：Tiptap 3.x，**不要换**
6. **字体**：核心字体（思源黑/宋全档）走 fontsource npm 包（unicode-range 分片按需加载，大陆稳）；ZCOOL/Ma Shan Zheng/Long Cang/LXGW 走 CDN；用户自定义字体走 FontFace API + IndexedDB。苹方简因版权不能嵌
7. **主题（原「模板」）**：可复用视觉方案继续统一叫主题；扁平 JSON schema；**只存 assetId 不存 blob URL**（blob URL session-bound，刷新失效，是老模板功能翻车根因）。v1.5 用户口中的「公考模板」按**内置页面角色主题**落地，`contentJSON: null`，套用时不覆盖正文；只有未来确定要携带正文骨架/字段槽位时，才拆独立 `PosterTemplate`
8. **画布**：真实 9:15（1080×1800），导出 scale 2（2160×3600）；首图只在预览叠加中心 3:4 裁切参考，源图尺寸不变
9. **分页**：手动 `<hr class="page-break">`（Tiptap HorizontalRule 全部配置为分页符）；装饰分隔线是独立 `Divider` 节点（`hr.divider`）
10. **部署**：Cloudflare Workers Static Assets + GitHub auto-deploy，build 走 `bash ci.sh`
11. **旧 MVP**：`editor.html` + `assets/` + `demo.html` 保留作参考，不再维护
12. **页面角色底图**：v1.5 保留 `bgAssetId` 的旧语义（默认/内页底图），只新增 `coverBgAssetId` 作首页覆盖；页角色永远由当前页序推导，不存逐页背景数组
13. **封面语义色**：v1.5 用 `coverTitleColor` / `coverSubtitleColor` 作为 Theme/草稿样式，不写进 Tiptap 文字 mark；副标题严格定义为首图第一个 H1 后紧邻的第一个正文段，不得误染全篇正文
14. **工具可见性**：用户要求正文编辑工具全部常驻；不再使用「更多」、动态收纳或横向滚动。左栏继续固定桌面宽度，用稳定两行分组承载；右侧高级字体等设置仍可渐进展开，不在此要求内
15. **分页结构不变量**：`hr.page-break` 必须是 Tiptap `doc` 的直接子节点；工具栏插入、粘贴、草稿/恢复载入都不得留下 `li > hr.page-break` 等嵌套分页。`splitIntoPages` 继续只切顶层分页；禁止用 CSS 拉宽伪修复，也禁止递归搜 HR 后粗暴切 HTML
16. **v1.7 导入事务**：「导入文稿」固定在顶栏全局动作区；解析确认使用覆盖式大 Dialog。解析本身不碰当前草稿，用户确认后先落盘一个完整的新 `EditorDocumentV2`，再切换 UI。导入结果是普通 Tiptap 草稿，必须可继续手动编辑、分页、撤销和自动保存
17. **发布文案独立语义**：专用结构中 `# 正文` 以下内容写入草稿可选 `publication` 元数据，只在右栏独立卡片显示/编辑/复制，不混入成品页，不随选择页码复制，不自动添加“上篇 / 下篇”。沿用可选 V2 字段而非强升 V3，优先保证旧版能继续看到导入正文
18. **普通图文兼容线不是编辑器上限**：高置信兼容线集中在 `productConfig.ts` 的 `ORDINARY_POST_IMAGE_LIMIT`，当前为 18；它只控制提示和全部超限确认。超过后仍完整生成一个草稿、允许手动调整和一次完整导出，不截断、不缩字、不改写、不默认拆草稿；原生长文是另一平台管线，本版不接入
19. **v1.7 导出交付**：主路径为用户选择父目录后创建一个独立子文件夹，内部逐页生成/关闭文件，最后写 `导出清单.json`；不支持目录写入时回退为一个兼容 ZIP，ZIP 也只有一个顶层文件夹，不按 18 张拆包。范围输入与缩略图多选共用原稿页码；图片名为 `01_主题_cover.png` / `02_主题_inner.png`，重复导出追加 `-02` / `-03`。目录中断仅在同一页面会话内续写剩余页
20. **中文正文两端对齐**：左侧 Tiptap 编辑区可保留 CSS `text-align: justify` 作为输入反馈；成品画布必须由 `deterministicTextLayout.ts` 生成行级 x/box/gap 并封印快照，预览与导出复用这一份几何，不再依赖浏览器/html2canvas 的 `text-justify` 行为。H1/H2/H3 保持自然起始对齐。列表与引用仍保留自己的项目符号/竖线结构，必须在真实 1080×1800 画布目检标点、长英文/数字、粗体、软换行和段尾
21. **导出预检分级与用户最终决定权（`REQ-EXPORT-PREFLIGHT-OVERRIDE`）**：预检继续保留，但不得把所有问题统一当成硬故障。`unsatisfied-line` 这类“DOM 与文字完整、字体和 baseline 已校准、当前预览可实际渲染，仅排版质量约束未完全满足”的问题属于**可覆盖警告**：首次导出显示具体页码、文本块原文片段、块内行号、原因和修改建议；同时提供二次确认的「按当前预览强制导出」。强制导出必须封存并复用用户眼前同一份行级快照，不得退回浏览器原生 justify、不得静默重排或跳过字体检查。字体缺失 / 加载失败、`text-mismatch`、`invalid-width`、字形墨迹或 baseline 无法测量 / 超限、缺失或未封存快照仍是**不可覆盖硬阻断**。导出清单应记录强制导出的页码、警告 code 与快照 ID，便于复盘。

---

### P0 已本地实现：REQ-EXPORT-PREFLIGHT-OVERRIDE（v1.7.3，待目检与发布授权）

> 2026-08-12 实现状态：下述边界已全部落地并通过 40 文件 / 393 测试与真实 Chromium 回归（含真实 19 页故障草稿场景与 warning 页强制导出 ZIP 全链路）；求解器根因修复见 `deterministicTextLayout.ts` 的 `raggedFittingWidth` / `lineAdjustmentModel`，回归测试为 `deterministicTextLayout.test.ts` 的段落末行闭标点用例。以下原始需求文本保留作验收依据。

**用户场景（已用本机真实草稿 + Chromium 复现）**：19 页草稿的第 19 页段落「这里面存在着许多看似道不清、言不明的道理。」在句尾「道理」开启「短语不拆」时，提示「第 19 页排版：第 1 行在字距/标点上限内无法排入版心」；取消该 mark 后可正常导出。现有提示中的「第 1 行」是该文本块的内部行号，不是整页第一行；`data-layout-issues` 只保留 `blockIndex/message`、丢弃了求解器已有的 `blockText`，所以用户无法从弹窗定位到原文。

**已确认根因**：「道理」自身只约 88px，远小于公考内页 888px 版心，不是超长短语。未加 mark 时，求解器使用「道｜理」断点；加 mark 后该断点被正确禁止，而更早的「的｜道理。」断点无法在当前弹性上限内将前行撑满。本可将整段作为自然末行放下：它的逻辑 box 右缘仅超出 1.108px，但末尾句号的实际可见墨迹右缘仍在版心内 6.372px。当前 `lineAdjustmentModel` 只对两端对齐的非末行启用闭标点可见右缘/透明悬挂，段落末行却仍用完整逻辑 box 判定，因此产生假阳性 `unsatisfied-line`。

**现有双重硬阻断**：

1. `ExportDialog` 把所有 `font/layout` issue 都视为 blocking，不显示「仍然导出」；
2. 即使只放开按钮也无效：`Preview` 遇到任何 layout issue 都不会 seal 快照，`pageToPngCanvas` 又要求 `state=ready + issueCount=0 + phase=sealed`。

**实施边界**：

- 先修复求解器：段落末行仍不做两端拉伸，但当末字为闭标点时，应以实际可见墨迹右缘和合法光学净空判定是否放得下，允许只有透明 trailing clearance 悬挂；不得拆掉用户的 hard no-break 语义；
- 增加精确回归：公考内页 888px、正文 44px、上述原句且「道理」 hard no-break；要求短语同行、无 emergency、末行不 justify、可见墨迹 `<= 888px`、预览/导出快照一致；
- 在预检模型中新增独立的 `severity: warning | blocking`，不能继续用 `kind` 推断严重级别；首批只把 `unsatisfied-line` 列为 warning，未知 code 默认 blocking，失败时闭合；
- `materializeDeterministicTypography` 保留完整 `code/blockIndex/blockText/message`；仅 warning 且字体、baseline、Unicode 文本与列表几何全部通过时，允许生成 `ready-with-warnings`（或等价显式状态）的 sealed snapshot；
- 正常导出第一次仍停在确认页，不直接忽略；按钮明确为「返回修改 / 按当前预览强制导出」，并提示可能出现的视觉后果；
- 强制路径只能携带 `allowWarnings` / warning 白名单，禁止沿用现在能跳过全部检查的宽泛 `skipReadiness` 语义；底层仍校验 sealed snapshot、snapshot ID、字体、baseline hash、Unicode 一致性与 2160×3600 尺寸；
- 提示至少包含：页码、该块原文前 48 字、文本块内行号、问题类型；后续增加「定位到文字」和按 code 生成的建议，不自动改正文；
- `导出清单.json` 增加可选 `preflightWarnings`，记录页码、code、文本片段、snapshot ID 和用户确认时间；普通无警告导出保持 schema 向后兼容；
- 自动测试覆盖：warning-only 可确认导出、未确认不会导出、blocking 永不可绕过、未知 code 默认 blocking、强制导出与当前预览快照一致、19 页目录与 ZIP、续写 token、清单记录和旧草稿兼容；真实浏览器再用当前 19 页故障草稿完成一次 19/19 导出目检。

**非目标**：不删除预检、不把字体错误降级为警告、不允许导出器另算一套“凑合能出图”的布局、不在未经用户授权时部署或发布。

---

## 2. 固定开发工作流（SOP）

每次改动按此流程走，不跳步：

1. **动工前**：扫 §6 坑手册相关域；架构级改动先向用户交代方案再动手
2. **改码**（遵守 §7 不要做的事）
3. **本地验证三连**：
   ```bash
   cd app
   ./node_modules/.bin/tsc -b        # 类型检查
   ./node_modules/.bin/vitest run    # 单测
   ./node_modules/.bin/vite build    # 构建
   ```
4. **UI 改动**：`vite preview` + Playwright 截图自查 → 用户目检确认后再部署
5. **部署**：`git push origin main`，等 1–3 分钟自动上线
6. **⚠️ 凡碰导出路径（exportPng.ts / canvas.css / Preview）**：部署后**必须在两个 prod URL 上用 Playwright 实测**（三主题 × 多页，采样像素而不是肉眼看图）。基础门禁为 `tools/export-race-repro/test_prod_deep.py`，再按改动追加定向 prod 脚本；v1.10.2 可复用 `test_v1102_dialog_viewport.py`、`test_continuation_prod.py`、`test_code_block_wrap_prod.py`。prod 脚本不得依赖 `window.__editor` / `window.__test`；Cloudflare 走 127.0.0.1:7897 代理，大陆通道显式 `--no-proxy-server`
7. **收尾**：更新本文件 §0 现状快照（+涉及的章节）；里程碑级进展同步 `WorkLog-Obsidian/3-Projects/xhs-poster-小红书排版编辑器.md`

### 版本与上线闭环（2026-08-10 起，对齐沃林发圈工具工作流）

**版本号**：语义化三段 `主.次.修`，单一来源 = `app/package.json` 的 `version` 字段（构建时注入页面信息条显示，部署后看线上版本号即确认生效）。

- **主**：架构级/破坏性变更（如换导出库、不向后兼容的数据 schema 迁移）
- **次**：新功能、功能恢复
- **修**：bug 修复、文案、纯文档不发版

**每次发版固定闭环**（顺序不跳步）：

1. bump `app/package.json` version
2. 本地验证三连 + UI 改动 Playwright 截图自查
3. **用户目检确认**后才部署
4. `git push origin main`（= Cloudflare 轨）+ `bash tools/deploy-oss.sh`（= 阿里云轨，**每版必推，不允许只推一轨**）+ `git tag vX.Y.Z && git push origin refs/tags/vX.Y.Z`（只推本版精确 tag）
5. 导出路径改动：prod URL playwright 实测（§2 第 6 步）
6. **归档**：`bash tools/archive-release.sh` → `archive/dist-vX.Y.Z/`（对齐发圈工具文件管理法：历史版本永留 archive/，同版本拒绝覆盖；核心体积以当版构建为准，v1.5.0 为 9.5M，字体走 manifest + git tag 复原）
7. 更新 HANDOFF §0 版本行 + USAGE.md（如用户可感知的功能变化）
8. **发版公告必须专业、完整**（含工具网址 + 本版变化摘要 + 必要注意事项）。默认交付可直接发送的文案由用户发送；只有用户明确要求代发时，才使用飞书旧企业租户机器人，并在发送前核对租户、机器人和接收人身份。只记录真实 API 回执 ID，未代发不得编造 ID

与沃林工具的差异：本项目是 git 仓库，「每版新文件不覆盖」由 git 天然保证，无需复制文件。

**阿里云大陆通道架构**（2026-08-10 搭建，复刻发圈工具）：OSS bucket `xhs-poster-editor`（cn-shenzhen，public-read，SPA 404→index）→ CDN 加速域名 `xhsposter.tshzchen.cn`（回源 OSS）→ AliDNS CNAME。部署 = `tools/deploy-oss.sh`（hashed assets 长缓存 immutable、index 等 no-cache、自动刷新 CDN index）。凭据：本机 ossutil / aliyun CLI（与发圈工具同账号）。

HTTPS：CAS 免费 DV 证书（CertId 26549959，2026-08-10 签发，1 年期，联系人刘彦君 19303019049）。**续期流程**：`aliyun cas CreateCertificateRequest`（ValidateType DNS）→ `DescribeCertificateState` 拿 `_dnsauth` TXT 值 → AliDNS 加 TXT → 签发后 `aliyun cdn SetCdnDomainSSLCertificate --CertType cas --CertId <新ID> --SSLProtocol on` → 删 TXT。坑：新 OSS bucket 默认 `BlockPublicAccess=true` 会压掉 public-read ACL，要先 `put-bucket-public-access-block` 关掉再设 ACL；CAS API 必须显式 `--endpoint cas.aliyuncs.com --region cn-hangzhou`。

**HANDOFF 纪律**（本次重构的起因）：「当前状态」只允许存在于 §0 一处。历史章节不要留「当前 prod」字样——2026-08 审查时发现 v5 章节还标着「当前 prod 状态」而实际已是 v8，两处「当前」互相矛盾。临时脚本一律放进 `tools/`（进 git），不要引用 `/tmp/` 路径——/tmp 会被系统清掉（test_prod.py 曾经只活在 /tmp，已丢过一次）。

---

## 3. 功能清单（现状）

| 模块 | 内容 |
|---|---|
| 编辑器（Tiptap） | H1/H2/H3、正文、引用、代码块、列表、加粗、下划线、选中短语不拆行（≤12 字）、固定 `#7B3B8B` 正文荧光笔（透明度 0%–100%）、撤销重做、插入图片、手动分页符、分隔线；工具栏固定两行全部常驻；导入后的自动编排结果仍是同一个普通可编辑 Tiptap 文档；正文段落中文两端对齐、最后一行自然靠左，标题不强制拉伸 |
| 顶部全局栏 | 版本、撤销/重做、草稿保存状态与管理、**导入文稿**、裁切参考、排版参考、磁吸和唯一强 CTA「导出 PNG」；对象样式不再挤在顶栏 |
| 中央成品画布 | 多页真实 9:15 预览（自适应缩放）；是唯一图片直接操作面：点击选图、四角等比缩放、顶部抓手左/中/右对齐、常用宽度与位置磁吸、Option/Alt 临时旁路、Esc/取消回滚；公考主题按当前页序自动路由 Cover/Inner；H2 竖线和有序列表序号按真实字形中线校准；裁切/版心参考和页码角标均只属编辑层；**与左侧编辑区双向滚动联动**（v1.8.0）：视口中心语义锚点定位到同页同块附近，标题栏「滚动联动」开关为会话态、默认开，联动只写 scrollTop 不碰正文/选区/导出 |
| 右侧上下文检查器 | 顶部固定独立「发布文案」卡片，与当前草稿一起保存且不受对象选择影响；其下页面态显示主题、背景、Logo、字体和全局排版；文字态显示排版、短语不拆与荧光笔；图片态只显示对齐、宽度、替换、删除和溢出提示 |
| 最近操作 | 显示本会话最近 3–5 条已提交动作，不持久化、不另造历史系统；一次图片手势只生成一条动作与一个 undo 事务 |
| 草稿库 | IndexedDB `xhs-poster-documents` 保存完整 Tiptap JSON + V2 样式/双底图/语义色资产 id + 可选发布文案元数据；900ms 自动保存、同步 WAL 保护立即关页、刷新恢复、另存/切换/删除；导入先原子创建新草稿再切换；严格兼容 V1/V2 旧草稿，写入串行，并用浏览器原子 Web Lock 让第二标签页只读 |
| 主题库 | 内置 4（雅致/极简白/深夜黑/公考·山水卷）+ 用户主题（IndexedDB `xhs-poster-themes`），9:15 真图缩略图；公考主题只套用双底图与样式，不覆盖正文；历史含正文主题仍可兼容打开 |
| 素材库 | 背景/Logo/图片三 tab × 内置/上传，IndexedDB `xhs-poster` 存 Blob |
| 字体库 | 拖拽上传 ttf/otf/woff/woff2/ttc，IndexedDB `xhs-poster-fonts`，FontFace 注册，启动时全量恢复 |
| 导出 | 18 张只作普通图文上传兼容提示，不是导出上限；可一次导出全部或用范围输入 + 缩略图选择原稿页码。主路径写入一个独立文件夹，兼容路径为一个单顶层目录 ZIP；逐页 scale 2 输出、清单最后落盘、重复导出 `-02/-03`、目录中断可续剩余页；发布文案不进入导出包 |
| 资源可靠性 | 图片、字体、主题按资源局部降级，原位说明原因并支持重试；缺图仍保留文档结构和可恢复入口，不要求刷新或清空编辑内容 |
| 默认内容 | 5 页「使用教程」样张，开箱即见全功能演示 |

组件/模块地图见 §4 文件结构。各功能的实现细节和历史演进：`git log --oneline` + 对应 commit 的 HANDOFF 版本。

---

## 4. 仓库结构与开发命令

```
xhs-poster-小红书排版/
├── wrangler.jsonc        ← Workers 配置（assets = app/dist + SPA fallback）
├── ci.sh                 ← CI build（直调 binary 绕过 pnpm script runner，别改回 pnpm build）
├── package.json / .npmrc ← CI 兼容用（packageManager 字段 + frozen-lockfile=false）
├── HANDOFF.md            ← 本文件
├── README.md / USAGE.md  ← 开发者文档 / 用户说明
├── archive/              ← 版本归档（发圈工具管理法：历史版本永留此处不覆盖）
│   ├── dist-vX.Y.Z/             ← 每版构建产物核心快照（archive-release.sh 生成）
│   └── 旧MVP-单文件版/           ← editor.html + demo.html + base64 素材 + 旧打包脚本
├── source/               ← 内置素材原图，只读
├── tools/
│   ├── deploy-oss.sh            ← 阿里云轨部署
│   ├── archive-release.sh       ← 发版归档
│   ├── perf/                    ← v1.9.0 性能基线脚本（solver-bench.mjs / browser-baseline.py）
│   └── export-race-repro/       ← 导出/生产回归：test_prod_deep.py ⭐；v1.10.2 定向 prod = test_v1102_dialog_viewport.py / test_continuation_prod.py / test_code_block_wrap_prod.py，local = *_local.py
└── app/
    ├── public/builtin-assets/   ← 内置背景/Logo
    └── src/
        ├── App.tsx              ← 主状态机（v1.9.0 拆分后 1286 行）：样式 state、主题应用/保存、hydrateDocument；CSS vars/草稿持久化/资源恢复/导出编排在 lib 的五个拆分块里
        ├── components/
        │   ├── ui/              ← shadcn（button/dialog/tabs/select）
        │   ├── Editor/          ← Tiptap + 编辑工具栏；ImageExtension / TextHighlight 维护语义属性
        │   ├── Preview/         ← 9:15 多页画布 + 图片直接操作覆盖层 + 裁切/排版/磁吸辅助层
        │   ├── Inspector/       ← 页面 / 文字 / 图片三态上下文检查器
        │   ├── DraftLibrary/    ← 草稿另存、切换、删除
        │   ├── Toolbar/         ← 顶部全局动作与状态
        │   ├── AssetLibrary/ FontLibrary/ ThemeLibrary/ ThemePreview/ ExportDialog/
        ├── lib/                 ← 纯逻辑层（有单测的都在这）
        │   ├── useWriterLease.ts useThemeCssVars.ts useResourceRecovery.ts
        │   │   useDraftPersistence.ts runExport.ts   ← M7 自 App.tsx 拆出的五块（v1.9.0）
        │   ├── stableHash.ts    ← FNV-1a + 毫像素取整唯一实现（快照 hash 契约核心）
        │   ├── themes.ts themeStore.ts    ← 主题模型 + IndexedDB
        │   ├── assetStore.ts fontStore.ts fontRegistry.ts fontPresets.ts
        │   ├── typographyMetrics.ts opticalTypography.ts opticalListMarkers.ts
        │   │                       ← v1.5 真实字形测量、标题竖线/列表序号光学中线校准
        │   ├── splitPages.ts fontSize.ts density.ts canvas.ts builtinAssets.ts
        │   ├── imageModel.ts textHighlight.ts exportReadiness.ts resolveAsset.ts
        │   └── exportPng.ts     ← ⚠️ 改前必读 §5
        └── styles/canvas.css editor.css workspace.css
```

```bash
cd app
./node_modules/.bin/vite              # dev server（不要用 pnpm dev，被 msw 卡）
./node_modules/.bin/tsc -b            # 类型检查
./node_modules/.bin/vitest run        # 单测一次
./node_modules/.bin/vitest            # 单测 watch
pnpm test / pnpm test:watch           # 同上（依赖 workspace 配置正常）
pnpm add <pkg>                        # 装依赖（遇 ERR_PNPM_UNEXPECTED_STORE 见 §6）
pnpm dlx shadcn@latest add <comp>     # 加 shadcn 组件
```

---

## 5. Export PNG：v8 基座 + v1.5 字形校准层 + 战史（改导出前必读）

### 当前仓库架构（exportPng.ts + exportPlan.ts + exportDelivery.ts）

v1.7 在既有像素渲染基座上新增交付编排层，不改 html2canvas 的核心渲染策略：

1. `exportPlan.ts` 只负责纯规划：17/18/19+ 状态、原稿页码范围、补零文件名、单文件夹名称、碰撞后缀与 `导出清单.json`
2. `exportDelivery.ts` 负责实际落盘：目录模式逐页渲染/写入/`close()`，清单最后写；中断生成差集续写 token。兼容模式只生成一个 ZIP 和一个顶层文件夹
3. `ExportDialog` 必须在用户点击的同步手势链最前调用目录/保存 picker；支持时让用户在系统弹窗选择位置和名称，不支持目录写入时明确回退 ZIP
4. `exportPng.ts` 暴露单页 `renderPagePngBlob` 供交付层顺序调用；旧 `exportPages` 死管线已于 v1.8.2 删除（连带 `triggerDownload`/JSZip 导入，`suggestFilename` 保留）。批级 CSS 由交付层用 `buildExportBatchCss()` 算一次经 `RenderPageOptions.cssText` 透传，onclone 注入策略不变

两层 v8 导出基座之上，v1.5.0 又增加了真实字形校准层：

1. **离屏渲染**（v7 引入）：deep clone `.page` 到 body 直接子节点的 fixed 屏外 stage（无 transform 祖先），bbox 由画布常量固定为 1080×1800。预览的 `transform: scale(0.4)` 与导出彻底解耦，源 DOM 零修改
2. **onclone 注入全量 CSS**（v8 引入）：html2canvas-pro 把 cloned DOM 放进 about:blank iframe 截图，prod 上 iframe 跨域加载 `<link>` stylesheet 会被 CORS 拦掉 → cloned doc 裸渲染。修法：`collectAllCss()` 把 `document.styleSheets` 全部 cssRules 转 text 注入 cloned doc `<head>`，同时拷贝 `:root` 的 inline CSS vars。对未来新主题/新素材天然鲁棒（全量复制，不依赖具体类名）
3. **真实字形中线校准**（v1.5.0；v1.7.1 收敛为共享快照）：`typographyMetrics.ts` 通过 canvas 的 `actualBoundingBoxAscent/Descent` 按实际字体、字号、字重和每个 grapheme 测量可见字形；`opticalTypography.ts` 在预览事务中校准 H2 竖条与列表 marker，并在列表列宽变化时先重物化再封存。导出不再重算 H2/marker，只对离屏副本做逐 atom 的 html2canvas baseline 适配，然后原样克隆同一 sealed snapshot；源 React DOM 始终零修改

辅助机制：img 解码等待（5s 兜底）、`document.fonts.ready`、字体注册表 revision/缓存失效、异步校准 abort guard、`hasRaceArtifact` 检测 + retry ×2（v5 遗留，v8 下基本不触发，留作兜底）、下载 60s 后才 revoke blob URL。

### 战史一览（v1~v8，细节看对应 commit 的 HANDOFF）

| 版本 | 思路 | 结局 |
|---|---|---|
| v1~v4.1 | 各种 onclone 改 transform/尺寸 | 全部失败：onclone 晚于 bbox 测量 |
| v5 | race 检测 + retry | 96% 缓解，不根治 |
| v6 | 截图前临时清源 DOM transform | 本地全绿，prod 非雅致主题仍坏 |
| v7 | 离屏渲染解耦预览/导出 | 修了 bbox，但 prod 上 CSS 进不了 iframe |
| v8 | v7 + onclone 注入全量 CSS | **终局**。prod 实测 3 主题各 5/5 |

### 铁律（八轮血泪）

- **本地 vite preview ≠ Cloudflare prod**。导出路径的任何修法，只有 prod URL 上 playwright 实测通过才能 claim 修好
- **像素采样 > 肉眼看图**：透明像素和坏布局肉眼看着相似，根因完全不同。采 4 角 + 中心 RGBA
- **不要在导出流程里修改源 React DOM**（img.src、inline data URL、批量锁尺寸都试过，race 概率反升）；闭包 + finally 恢复的临时改是唯一例外
- **要在导出里排除视觉元素**（如参考线）：用真实 DOM 子节点 + onclone `remove()`，**不要**用 `::before/::after`——html2canvas 处理伪元素早于 onclone
- `width/height` option 只控 canvas 尺寸，不控渲染区域（渲染区域由 bbox 决定）
- 雅致主题曾长期掩盖 bug：它有 `<img class="bg">`，CSS 全失效时视觉上仍"差不多对"。**测导出必须覆盖极简白/深夜黑**（纯 CSS 背景，一坏就暴露）

### 已知遗留

- ~~Step 12 加的导出进度回调（`exportPages` 第三参 + ExportDialog 显示 `3 / 6`）在 v7 重写时被静默丢弃~~ ✅ 2026-08-10 已恢复
- `hasRaceArtifact` + retry 在 v8 下属于死保险。副作用：右缘纯黑的自定义背景会每页白跑 3 遍渲染（导出时间 ×3）。2026-08-10 审查建议删除，暂保留观察

### ~~🐛 已知 bug~~ ✅ v1.2.0 已修（2026-08-10）

1. ~~**用户上传字体不参与导出渲染**~~：fontRegistry 注册时同存 `Map<family, blobURL>`（`getUserFontFaceCss()`），exportPng 的 onclone 把用户字体 `@font-face` 追加进注入 CSS，并 `await clonedDoc.fonts.ready`（3s 兜底）。本地像素对比验证：用户字体 vs 默认字体导出差异 10.4 万暗像素（字体真实生效）
2. ~~**「包含正文」主题里的插图存的是 blob URL**~~：image 节点加 `assetId` attribute（`data-asset-id`），applyTheme 时 `resolveContentImages()` 按 id 从 IndexedDB 重新 resolve src（纯遍历逻辑 `mapContentImages` 有单测）。注意：v1.2.0 之前保存的含插图旧主题无 assetId，无法修复，需重新保存

### ✅ 疑点已验证不成立（Gate 0 诊断 2026-08-12 完成）

- ~~CDN 字体（ZCOOL/马善政/Long Cang/LXGW）在 prod 导出里可能同样回退~~：**不成立**。两生产入口（Cloudflare 走代理 + 大陆通道强制 `--no-proxy-server` 真直连）实测 5 个 CDN 字体在预览与导出 PNG 中均真实生效。机制：`collectAllCss()` 确实跳过跨域表（每次导出 2 条 skip 警告），但克隆文档里的 `<link>` 会重新加载 CDN CSS/woff2 且实测全部 200；预览用过即有缓存，导出期重请求即时命中
- 完整证据、加载体积、直连时延与残余风险（冷缓存+慢网的 3s 兜底窗口）见 `docs/FONT-GATE0-2026-08-12.md`；诊断脚本 `tools/font-gate0/gate0_cdn_fonts_prod.py` 可重跑复现。**结论：无需当期补丁版本；字体本地化按 ROADMAP 以 ≥v1.9.0 性能/可靠性优化立项**
- 附带方法论坑：Playwright Chromium 不传 proxy 仍可能继承 macOS 系统代理，测「大陆直连」必须显式 `--no-proxy-server`。v1.10.2 回归脚本已按 URL 分支：Cloudflare 走 127.0.0.1:7897，大陆通道强制直连

---

## 6. 坑手册（按域分类，动手前扫相关域）

### pnpm / CI / Cloudflare

- **`pnpm dev` 卡死**：msw（shadcn Nova preset 带来的）有 ignored build script。绕过：直接 `./node_modules/.bin/vite`
- **`ERR_PNPM_UNEXPECTED_STORE`**：brew pnpm 11（store v11）vs `packageManager: pnpm@9`（corepack，store v3）冲突。装包时临时删 `app/package.json` 的 `packageManager` 字段，装完恢复。不要改全局 store-dir
- **Cloudflare CI 四连坑**（都已在仓库配置里修好，别动）：无根 package.json 被识别为 Worker（→ wrangler.jsonc）；被当 pnpm monorepo（→ `--ignore-workspace`）；CI pnpm 版本读不懂 lockfile v9（→ packageManager 字段 + frozen-lockfile=false）；`pnpm run` 触发 workspace 检测（→ ci.sh 直调 binary）
- **Cloudflare「Retry build」重跑的是旧 commit**，不是 main HEAD。要新代码必须 push（无改动就 `git commit --allow-empty -m "trigger"`）
- **build 排查顺序**：错误尾部 `pnpm help install`（依赖阶段）还是 `pnpm help run`（workspace 阶段）→ build log 的 commit 是不是 main HEAD → "resolved 1, downloaded 0" = pnpm 版本 → "packages field missing" = workspace 检测 → "ci.sh: No such file" = 旧 commit
- **TS 6 废弃 baseUrl**：paths 直接写 `"@/*": ["./src/*"]`

### shadcn / Radix

- `DialogContent` 默认 `sm:max-w-sm`（384px），要宽必须带 prefix 传 `sm:max-w-3xl`
- `DialogContent` 是 grid 但没设列，内部 `w-full` 失效 → 必传 `grid-cols-1`
- `Tabs` 源码的 `data-horizontal:flex-col` 永远不匹配（Radix 实际设 `data-orientation`）→ 每个 `<Tabs>` 显式加 `className="flex-col"`；改源码的治本写法是 `data-[orientation=horizontal]:flex-col`
- Radix Select 用 `onValueChange`；value 必须非空字符串（脱离主题用 `__custom__` sentinel）
- Dialog a11y：`ui/dialog.tsx` 已内置默认 sr-only Description，新 Dialog 可传 `description` prop

### Tiptap

- `Node` 从 `@tiptap/react` re-export 引，**不要**从 `@tiptap/core`（没装、也没 hoist）
- `setContent` 传 doc JSON 时用 `as never` 绕类型（v3 泛型签名不友好），报类型错先查这
- 空段落 `<p></p>` 画布高度为 0：CSS 用 `p:empty::before { content: '​' }` + min-height 撑
- 自定义 Node 的 `parseHTML` 加 `priority: 1000` 才能抢在 StarterKit 前匹配（Divider vs HorizontalRule）

### 字体 / 样式

- Tailwind v4 preflight 清掉 `ul/ol` 的 list-style，显示列表处必须显式声明 `disc`/`decimal`（canvas.css 和 editor.css 都要）
- 主题预设里的字体值必须**直接引用** fontPresets 某个 option 的 value——手写新 stack 会让 select 匹配不上静默回退第一项（踩过两次）
- 用户字体：先 `registerFontFromBlob` 成功才存 IndexedDB（防坏字体入库）；fontRegistry 重注册先 delete 旧 FontFace
- `fileNameToFamily` 类字符串清洗：trim 一律放最前（`$` 锚定正则对尾部空格不匹配，先 replace 后 trim 会漏）

### 确定性排版 / 导出预检

- **「短语不拆」触发段末闭标点宽度假阳性 → `unsatisfied-line` 阻止导出**（2026-08-12 真实草稿 + Chromium 已复现）：第 19 页段落「…言不明的道理。」为 44px、公考内页 888px 版心；给「道理」加 noWrapPhrase 后会禁止「道｜理」唯一可用断点，但短语本身并未超宽。整段的逻辑 box 只超出 1.108px，末尾句号可见墨迹却仍在版心内 6.372px；段落末行没有启用闭标点的可见右缘/透明悬挂判定，才是根因。取消 mark 会恢复断点并能导出，但这只是用户绕过 bug 的临时办法，不得当成产品解法；求解器应在保留 hard no-break 语义的同时正确接受该末行。
- 排查此类预检失败：读 `.page` 的 `data-layout-issues`（含 blockIndex），比预检弹窗信息全；dev 下 `window.__editor` 可直接改 mark 验证

### 下载 / 文件

- `triggerDownload` 必须 `document.body.appendChild(a)` 再 click（detached `<a>` 会被吞）
- `URL.revokeObjectURL` 至少延迟 60s（大 zip 真实写盘需要时间，1s revoke 会截断文件：下载条目在但文件损坏）
- 同名下载被 macOS 静默重命名 `xxx 2.png`，用户以为没更新 → ExportDialog 用 `usedNamesRef` 自动追 -2/-3

### 环境差异

- **dev ≠ prod（本地方向）**：dev server 下 file picker 不弹（StrictMode/HMR 副作用），prod 正常。涉 user gesture / Portal 的怪事先 build + preview 复现再深挖
- **本地 ≠ prod（远端方向）**：见 §5 铁律第一条
- **Cloudflare 代理 HTTP/2 黑洞（2026-08-16）**：本机 127.0.0.1:7897 对 workers.dev 的 HTTP/2/字体请求可出现长时间无响应，表现为 `document.fonts.ready` 与导出一起挂起，但不是产品回归。Cloudflare 生产脚本启动 Chromium 时传 `--disable-http2`；`test_prod_deep.py` 另对 `cdn.jsdelivr.net` 设置 proxy bypass。大陆通道仍用 `--no-proxy-server`，不得为规避测试环境故障去改产品的字体或导出逻辑

---

## 7. 不要做的事（速查）

- ❌ 不要做用户没要求的功能（YAGNI）；不要为「以后可能用」加抽象层；不要瞎补 try/catch
- ❌ 不要重写/维护旧 MVP（已入档 `archive/旧MVP-单文件版/`，只读）；不要动 `archive/` 里的任何历史版本（归档永不覆盖，改动=新版本号新归档）
- ❌ 不要碰 `source/` 原图
- ❌ 不要换 Tiptap；不要用原生 `<select>`（macOS Chrome popup 字号巨大）
- ❌ 主题数据不要存 blob URL，只存 assetId
- ❌ 不要动 Cloudflare 后台 build 配置；不要在仓库根加 `pnpm-workspace.yaml`（CI 会覆盖成空）；不要把 build command 改回 `pnpm build`
- ❌ 不要把用户素材转 base64 存 localStorage（用 IndexedDB Blob）
- ❌ 导出流程不要修改源 React DOM；排除视觉元素不要用伪元素（见 §5 铁律）
- ❌ 不要引用 `/tmp/` 下的脚本路径进文档——脚本进 `tools/`

---

## 8. v1.4 冻结验收基线与 v1.5 执行规格

### v1.4.0–v1.4.1「桌面交互与可靠性版」（2026-08-10 已完成并双轨上线）

参考只读源：`/Users/a0000/Nutstore Files/Claude_YJ/Wallin-发圈工具/` v12.3。学习其**交互原则**，不要复制全局变量、命令式 DOM 或单 Canvas 架构；本项目继续保留 React + Tiptap + 现有分页/导出引擎。

桌面 UI/UX 初始提案：[`xhs-editor-v1.4-ui-baseline-v1.png`](docs/design/v1.4.0/xhs-editor-v1.4-ui-baseline-v1.png)；最终本地验收截图：[`三栏工作台`](docs/design/v1.4.0/xhs-editor-v1.4-local-shell-v1.png)、[`图片选中态`](docs/design/v1.4.0/xhs-editor-v1.4-local-image-selected-v1.png)、[`导出成品`](docs/design/v1.4.0/xhs-editor-v1.4-local-export-page-v1.png)。用户已目检确认视觉通过；v1.4.1 只修正默认教程文案，不改变该视觉与交互基线。以下内容作为 V1.4 冻结验收基线保留；线上现状与证据只看 §0。

**本版已作为一套能力整体交付：**

1. **图片选中与直接缩放**：点击主编辑面中的正文图片出现清晰选中框与缩放手柄；拖手柄等比缩放，宽度限制 10%–100%；一次拖动只形成一次撤销记录和一次草稿更新
2. **图片语义对齐**：每张图片独立支持左 / 中 / 右对齐，不再只有全局宽度档；旧图片无 `align` 时按 `left` 兼容，不能改变历史草稿外观。对齐可由上下文按钮或专用横向抓手触发；若做整图横拖，松手时只能落到 `left / center / right`，未吸附则回滚，绝不产生自由坐标
3. **磁吸对齐**：磁吸是对齐/缩放过程的默认辅助，不是孤立的工具模式。位置目标至少包含内容区左边界、画布中心线和内容区右边界；缩放目标包含 33% / 50% / 66% / 75% / 100% 宽度档。缩放手柄只改 `width`，吸中才显示蓝色临时对齐线，继续拖远即可脱开，`Option/Alt` 临时关闭磁吸
4. **版心参考线**：在现有首图 3:4「裁切参考」之外新增独立的「排版参考」开关，显示内容区左右边界、中心线和上下安全线；裁切参考 / 排版参考 / 磁吸三个状态彼此独立
5. **编辑层不进成品**：若左侧 Tiptap 是主编辑面，NodeView 选框与手柄不得序列化；若中央画布是主编辑面，React 选框、手柄、版心参考线和磁吸线统一作为可剥离覆盖层，进入 `.page` 的节点使用真实 DOM + `data-preview-only`。导出 PNG 必须主动剥离，不能使用难以排除的伪元素
6. **完整可靠性闭环**：对齐与尺寸写入 Tiptap JSON，草稿另存/恢复、撤销重做、手动分页、多页 ZIP、三主题和 2160×3600 导出全部保持一致；图片变大导致本页溢出时只提示，不在本版偷偷加入自动分页
7. **桌面编辑器外壳重排**：全局动作在顶部、正文编辑在左、9:15 成品画布居中、当前对象属性在右。顶部只保留版本、撤销重做、草稿状态、参考线和导出；字体、图片等参数按当前选中对象进入右侧上下文检查器
8. **轻量最近操作与状态反馈**：显示最近 3–5 条本会话已提交动作，例如「插入图片 / 居中对齐 / 调整为 66%」；一次手势只生成一次动作。它只帮助用户理解刚才发生了什么，不持久化、不支持任意回跳，也不另造一套历史系统；真正撤销/重做继续复用 Tiptap 历史
9. **普通用户可恢复的失败路径**：字体、图片或主题资源缺哪个只降级哪个，原地给出原因与重试，不得要求用户刷新后丢失编辑内容；导出前统一检查资源是否就绪，加载中就等待，失败时给明确的重试或继续入口
10. **主次操作与按需加载**：导出是唯一强文字 CTA；次级动作允许图标化但必须有中文提示和清楚禁用原因。图片面板等重功能在用户选中对象或打开面板后再预热，避免首屏为暂时不用的功能付出成本
11. **正文荧光笔**：只对用户当前选中的文字应用，不影响整段或后续输入；本版只提供固定基色 `#7B3B8B`，不加入调色盘。透明度使用 0%–100% 无极滑杆，默认 25%（v1.8.1 起下调，v1.4–v1.8.0 为 50%；不迁移已有草稿的既选透明度），界面实时显示当前百分比；未选中文字时禁用并提示「请先选中文字」

**架构边界（已落实，后续继续遵守）：**

- V1.4 延续 Tiptap block image node，并在 `src / assetId / width` 上新增 `imageId / align`；继续用百分比 `width` 与 `height:auto`。历史 `width:null` 仍表示「原大小」，第一次拖动缩放时才转成百分比
- 第一阶段做**流式文档里的横向磁吸**，不保存自由 `x / y / height / transform`，不做纵向磁吸；正文顺序和纵向占位仍由文档流决定
- 先抽出独立 Image Extension，正式 `renderHTML` 始终保持单个根级 `<img>`。若左侧是主编辑面，再使用 React NodeView；若中央画布是主编辑面，则使用 React 覆盖层和映射桥，不在左侧再做第二套手柄。两条路线都必须在拖动时只改临时状态，`pointerup` 一次性提交属性，`pointercancel / Esc / 失焦` 可回滚
- 不要直接启用 Tiptap 自带像素 resize：编辑区、1080 画布、40% 预览是三套尺度，必须继续存百分比
- 预览与导出必须继续同源：选框、手柄、磁吸线和参考线都是可剥离编辑层；正式布局数据只能来自 Tiptap / ThemeConfig，不能从 Preview DOM 反向猜取
- 荧光笔使用独立 Tiptap mark，颜色与透明度作为语义属性分开保存，例如 `color: '#7B3B8B' / opacity: 0.5`，渲染时再组合成背景色；不要只把临时 `rgba(...)` 写进 DOM。它必须随 JSON/HTML、草稿和复制粘贴稳定往返，旧文档无此 mark 时保持原样

**已确认的主编辑面：中央 9:15 成品画布。**

- 中央 9:15 成品画布直接选图、缩放与吸附；左侧负责正文录入和结构编辑，右侧负责所选对象参数
- 稳定 `imageId`、复制粘贴去重、`Preview imageId → Tiptap node position` 映射及预览比例坐标换算是 v1.4 必做；中央画布是唯一图片直接操作面，左侧不得再维护第二套独立选框/拖动状态
- Tiptap 始终是唯一数据源，Preview DOM 不得成为持久数据源；若实装后需要改变主编辑面，必须先让用户看截图确认，不能在开发中自行退回双套交互

**桌面操作界面基线（已实装）：**

- 桌面端学习沃林的层级：**全局动作在顶部、正文编辑在左、成品画布居中、当前对象属性在右**。顶部只留版本/撤销重做/草稿状态/参考线/导出等全局动作，不再横向塞满所有字体和图片参数
- 右侧改为上下文检查器：未选对象时显示页面/主题；选中文字时显示排版与荧光笔；选中图片时只显示对齐、宽度、替换、删除。高级项按需展开，不让非设计用户一次看到全部控制
- 画布上的悬停轮廓、选中框、手柄、临时蓝线与状态文案必须明确区分「可点 / 已选 / 正在吸附」；禁用项要直接说明原因
- 悬停、选中、吸附、保存中、已保存、保存失败六类状态必须有可区分的反馈；不能只靠 toast，也不能让提示遮住画布
- 保持「受控自由度」：优先左中右、宽度档位、磁吸和安全边界，不把 Figma / Adobe 的自由坐标、旋转和复杂图层能力搬进本版

**v1.4.0 冻结测试矩阵：**旧草稿兼容；非法宽度/对齐归一化；`getJSON → setContent → getHTML` 后仍是单个 `<img>` 且分页不变；`resolveContentImages` 后 `width / align / assetId` 不丢；左中右与缩放在编辑器/预览/导出三处一致；缩放不触发节点重排；一次手势一次 undo 且 redo 可恢复；磁吸阈值与 Alt 旁路；Esc/失焦/pointer cancel 回滚；多图只改选中项；第二页图片不改变分页；刷新/另存恢复；资源缺失的局部降级与原地重试；导出就绪检查；所有辅助层、最近操作和溢出提示不进导出；`imageId` 复制粘贴去重、第二页映射与预览比例坐标换算。荧光笔另测：只命中选区、默认 50%、0%/100% 边界、连续调节、撤销重做、JSON/HTML 往返、草稿恢复，以及编辑器/预览/PNG 三处颜色与透明度一致。执行结果见 §0。

### v1.4.0 从沃林吸收什么、明确不照搬什么

1. **吸收**：画布优先、全局动作与对象动作分层、明确选中态、命中才出现的磁吸线、一次手势一次撤销、命名操作反馈、资源局部降级、原地重试、导出就绪防线、按意图加载、受控自由度、预览与导出同源
2. **不照搬**：Wallin 的全局变量、命令式 DOM、单 Canvas、自由 `x/y`、图片旋转、中心正方形裁切区、固定 4% 边距、右键/字母快捷键主路径，以及「最近导出即草稿」
3. **完整可点击回跳的修改时间线暂不做**：Tiptap 没有现成动作标签与任意回跳能力，为它另造持久快照系统会把图片交互版本拖成历史系统重构；v1.4 先用轻量最近操作 + 原生撤销重做验证价值
4. **独立自诊断页暂不做**：本版先完成资源就绪检查、局部降级和原地重试；只有真实故障数据证明需要时，再建设完整自诊断页

### v1.5.0「公考双底图模板版」（2026-08-11 已双轨上线）

#### 需求与产品定义

1. Markdown 导入、结构解析、自动编排和自动分页全部顺延，v1.5 不顺手做任何其中能力
2. 新增一套内置公考视觉模板，用户可见名称暂定 **「公考·山水卷」**：第 1 页固定用 Cover，第 2 页及以后统一用 Inner
3. 本轮的「模板」只是**有封面/内页角色的视觉主题**：套用到当前草稿，不替换正文、不新建草稿、不引入独立模板库。这是对当前 Theme 链路的最小、可兼容扩展
4. 页面角色只由当前页序决定：1 页时只用 Cover；2/5/任意多页时为 `[Cover, Inner, Inner…]`；增删分页后实时重算，不存「第 3 页用什么」这类易失效状态

#### 版本化设计输入（已实装，仍是唯一素材源）

| 角色 | 项目内设计原图 | 尺寸 / Alpha | SHA-256 |
|---|---|---|---|
| Cover（仅第 1 页） | [`docs/design/v1.5.0/public-exam-cover-v1.png`](docs/design/v1.5.0/public-exam-cover-v1.png) | 1080×1800 / 无 | `33228831119ffced8e96785015231ad751a7ec190dfaafd0a21d474e52e2b89c` |
| Inner（第 2 页起） | [`docs/design/v1.5.0/public-exam-inner-v1.png`](docs/design/v1.5.0/public-exam-inner-v1.png) | 1080×1800 / 无 | `613d1b4c56da3ac2a38161cc8f7751f0fc38decf806e96130020754c44707401` |

- 两份项目内文件是用户 Downloads 原件的无损副本，尺寸、Alpha 和 hash 已核对；后续不再依赖 Downloads 路径
- 已无损复制进 `app/public/builtin-assets/`，文件名为 `bg-public-exam-landscape-cover-v1.png` / `bg-public-exam-landscape-inner-v1.png`，稳定 ID 为 `builtin-bg-public-exam-landscape-cover-v1` / `builtin-bg-public-exam-landscape-inner-v1`
- 这两张是不可拆对的模板资产；日后修图必须新增 `v2` 文件名和 assetId，禁止覆盖同名文件，避免 Cloudflare/CDN 缓存混版
- 原图已是精确 9:15，页面内按原位全画布显示；不做 CSS 位移、缩放或二次裁切

**新增设计/问题证据（只作开发参考，不随应用发布）：**

- [`public-exam-title-colors-reference-v1.png`](docs/design/v1.5.0/public-exam-title-colors-reference-v1.png)：用户给定主/副标题精确色值的快照，2086×2168，SHA-256 `56d2d09189c778c9f190200703d8c345d46684dd73f34b0960a622ce3be5f986`
- [`editor-toolbar-more-current-v1.png`](docs/design/v1.5.0/editor-toolbar-more-current-v1.png)：v1.4.1 左侧正文工具被固定收进「更多」的问题快照，3456×2168，SHA-256 `30c22a68a6b0dced665a3f05743bc7b9817556eae8e435e46428cf2a967a8b56`
- [`list-page-break-nested-current-v1.png`](docs/design/v1.5.0/list-page-break-nested-current-v1.png)：v1.4.1 在无序列表内插入分页时，分页线跟随列表缩进且右侧仍不切页的问题快照，3334×1832（带 Alpha），SHA-256 `421105d75de068d7b54409c42fc1aae718a9236c35ef378b1f7fb18c5469ec2d`
- `typography-optical-public-exam-preview-v1/v2/v3.png` 与 `typography-optical-public-exam-export-v1/v2/v3.png`：「提出对策题」标题竖线和有序列表序号的真实字形中线校准迭代证据；v3 为最终用户目检版，v1/v2 保留为不可覆盖的迭代记录

#### 视觉基线（首次实装参数，以用户截图验收为准）

**Cover：**

- 纸张为暖象牙色，山水约从 `y=1300` 进入、`y=1450` 后变重；小红书中心 3:4 裁切区为 `y=180…1620`，船恰好落在下裁切边缘，只能当装饰，不承载语义
- 正式文字安全盒：`x=120…960 / y=340…1180`；建议主标题左对齐、最多 3 行，钩子/副标题最多 2–3 行，不让任何关键信息压到 `y≥1250`
- 初始 token：`--page-padding-x: 120px`、`--page-padding-top: 340px`、`--page-padding-bottom: 620px`、H1 宽度 `80%`。主标题用 Noto Serif SC/700，正文基准 40px 时 H1 沿用现有 90px 比例；先看真实样稿，不为凑更大标题强行改全局字号系统

**Inner：**

- 顶部紫线位于约 `y=82…83 / x=46…1034`，抽样色 `#8A4B7C`；它已烘进底图，不得再用 CSS 画第二条顶线
- 正文安全盒：`x=96…984 / y=180…1500`，即初始 token 为 `--page-padding-x: 96px`、`--page-padding-top: 180px`、`--page-padding-bottom: 300px`；底部山形从约 `y=1550` 进入，正文和图片不得侵入
- 正文 Noto Sans SC 40px、行高沿用 1.85，初始间距用 `normal`；H2 使用 Noto Serif SC/700。装不下就手动分页，不缩小到 36px 以下，不挤进山形区
- 多页页码不再放底部山中：Cover 隐藏页码，Inner 的 `2 / N` 移到顶线下方右侧（初始值 `top: 112px; right: 96px`）

**共通视觉：**

- 封面主标题正式色为 `#6D136C`，封面副标题正式色为 `#5A465F`；Inner 正文仍用 `#2D292B`，次级/引用文字可用 `#5F5659`，主题强调色用底图紫 `#8A4B7C`；正文荧光笔仍保持已冻结的 `#7B3B8B`
- `overlay: none`，不加浅膜/深膜，避免洗掉纸纹、山水和紫线；引用底色可用 `rgba(123,59,139,.08)`
- 默认 `logoStrategy: none`；现有猫 Logo 与公考视觉不匹配，不得为了复用旧默认而放到每页
- 新增 `theme-public-exam-landscape` 承担正文/强调色、安全盒和页码位置；封面主/副标题颜色来自可编辑的 Theme 字段，不在 class 里硬编码。参考线应跟随新 padding，并继续属于纯编辑层

#### 封面主/副标题颜色与修改交互（v1.5 新增需求）

| 语义角色 | 正式色值 | RGB | 暖纸底 `#FBF2E6` 对比度 |
|---|---|---|---|
| 封面主标题 | `#6D136C` | `109, 19, 108` | 约 `9.67:1` |
| 封面副标题 | `#5A465F` | `90, 70, 95` | 约 `7.65:1` |

1. **语义定义必须唯一**：主标题 = 首图 `.content` 内第一个 H1；副标题 = 该 H1 后**紧邻**的第一个 `p`。建议选择器为 `.page--first .content > h1:first-of-type` 与 `.page--first .content > h1:first-of-type + p`；不用 H2 冒充副标题，不将全篇正文染成灰紫
2. **产品入口**：在右侧「页面与主题」主卡中增加始终可见的「封面文字颜色」组，不收进「高级字体设置」。两行分别为「主标题」/「副标题」，每行显示实时色块 + `#RRGGBB` 输入，并提供「恢复模板色」
3. **输入规则**：只接受六位 HEX，内部统一规范化为大写 `#RRGGBB`；当前值合法时实时预览，`Enter`/失焦提交；非法值原位提示且不写入 App state/草稿/CSS，不允许任意 CSS 字符串注入
4. **状态与预览**：有效修改走现有 `customize`，主题下拉显示「自定义样式」，并进入 autosave/WAL/另存草稿/保存用户主题。中央成品画布是权威实时预览，ThemePreview 与 PNG 导出使用同一组语义 token
5. **本轮的边界**：v1.5 只做封面主/副标题两个**主题级**颜色，不引入 Tiptap `TextStyle/Color` mark，不做逐字/任意选区颜色。否则 inline color 会压过主题、扩大复制粘贴/清除/混合选区/撤销语义，也会再次挤压左侧工具栏

#### 正文编辑工具全部常驻（v1.5 新增需求）

当前「更多」不是响应式自动收纳：`Editor.tsx` 将代码块/分隔线/分页/图片/短语不拆永久写在 Radix DropdownMenu 里，`editor.css` 的 `overflow: hidden` 还会静默裁掉超宽内容。左栏在 1280/1440/1536 桌面宽度下约为 400/450/480px，所有工具硬塞单行必然超宽，因此固定两行是稳定方案：

```text
第 1 行·文字格式  [正文 ▾] [代码块] [B] [I] [U] [无序] [有序] [引用]
第 2 行·结构插入  [分隔线] [分页] [图片] [短语不拆]
状态提示·固定高度  例：「短语不拆：请先选中 1–12 个字符」
```

1. **稳定分组**：两行共用一个外边框/圆角；第 2 行用 1px 顶分隔线与极浅底色标明「会改变文档结构」的动作，四个按钮等分宽度。不用 `flex-wrap` 随机漂移，不横向滚动，不再生成任何「更多」入口
2. **文字与命中面**：第 1 行沿用紧凑图标按钮，但必须有中文 tooltip/`aria-label`；第 2 行必须显示图标 + 「分隔线/分页/图片/短语不拆」短文字，不能为了塞一行退化成难猜的纯图标。所有按钮保持至少 32px 高度与清晰 focus ring
3. **代码块去重不改语义**：代码块属于 block type，放在第 1 行作快捷按钮；段落 Select 仍能显示 `CODE` 当前状态，不破坏旧文档。可以保留 Select 中的代码块选项，但不能再作为唯一入口
4. **不可用状态仍可理解**：「短语不拆」无选区、超过 12 字或 H1 宽度不容纳时仍占位显示；用 `aria-disabled` + no-op 保持可聚焦，用固定高度的直接提示 + `aria-describedby` 说明原因，不要让用户先猜为什么点不了
5. **键盘与可访问性**：外层与两行用 `role="group"` + 中文 `aria-label`，保留原生 Tab/Shift+Tab 顺序和 Enter/Space；本轮不贸然声明 `role="toolbar"`，除非同时实现 APG 要求的 roving tabindex + 方向键。toggle 继续用 `aria-pressed`，插入动作不伪装 toggle
6. **布局变化边界**：工具栏高度预计从约 64px 增到 96–110px，只压缩本来就独立纵向滚动的正文区，不改左栏宽度、不侵占中央成品画布、不产生整页滚动。用户要求的「不收纳」仅指左侧正文工具，右侧高级字体设置仍保持渐进展开

#### 列表内分页可靠性（v1.5 新增缺陷，发版阻断）

**现象与根因已定位：**

- 用户在无序列表的项内点「插入分页」后，左侧蓝色分页线缩进到列表内，中央画布页数不增加，内容继续溢出安全区；有序列表、嵌套列表与 blockquote 内都有同类结构风险
- `Editor.tsx` 现在直接调用 `editor.chain().focus().setHorizontalRule().run()`。Tiptap `horizontalRule` 是普通 block，`listItem` 又允许 `paragraph block*`，所以会合法生成 `li > ... > hr.page-break`；JSON 往返还会稳定保存这个坏结构
- `splitIntoPages.ts` 只遍历 `root.children`，仅把顶层 `hr.page-break` 当分页边界。因此「线缩进」和「不分页」是同一个文档结构错误，不是两个 CSS 小问题

**产品语义与实现边界：**

1. 新增专用的 `insertRootPageBreak` 命令（名称可调整），固定两行工具栏的「分页」只调该命令，不再直接调 `setHorizontalRule()`
2. 普通段落/标题保留现有按光标位置切分的手感。在列表中点分页时，以**当前最外层列表项结束处**为安全边界：当前项和其嵌套内容留在前页，后续同级项作为同类列表在新页继续；光标在最后一项时就在整个列表之后分页。不在一个 bullet 的行内文字中间动刀
3. 列表空项中点分页时，消费该空项并在原边界插入顶层分页，不留空圆点/空编号。在列表项开头点分页时放在该项之前；非空列表项中部/末尾则按上述安全边界放在完整当前项之后
4. 有序列表拆成前/后两段时，后段必须保留连续序号（通过 `start` 或等价模型属性）；无序列表保留嵌套层级、marks 和段落顺序
5. blockquote 不得留下嵌套分页；按当前引用块的安全边界插入顶层分页。codeBlock 等现在已能生成顶层分页的节点不得回退
6. 命令用一个 ProseMirror transaction 完成，点一次「分页」只产生一次 undo；插入后 selection 落到新页的第一个可编辑位置，用户可继续输入
7. 在既有 `normalizeIncomingContent`/草稿 hydrate 边界增加纯 JSON 归一化，并在 paste transform 边界拦截新嵌套分页；将历史草稿、WAL 恢复、外部 setContent/粘贴中的嵌套分页升格为顶层边界，保留可见文本、列表类型/顺序和分页数；归一化不进入历史栈，不让用户第一次撤销又恢复坏结构
8. 优先抽出 Editor 与单测共用的生产 extensions factory，避免测试仍用「普通 StarterKit」而漏掉真实 page-break schema/命令。可用「顶层专用 PageBreak schema + 安全插入/清理」建立双重保障，但只改 schema 不足以清理空列表项和有序列表 `start`
9. `splitIntoPages` 保持顶层线性切分，作为简单可审核的消费端。不得只把嵌套线用负 margin 拉宽，不得用正则/递归 DOM 遇到 HR 就切字符串，也不得在 Preview 层二次猜测列表语义

#### 最小架构方案（不新造 `PosterTemplate`）

1. **Theme 字段**：保留 `bgAssetId` 为「默认/内页底图」，新增 `coverBgAssetId?: string` 为首页 override。旧主题没有该字段时 fallback 到 `bgAssetId`；判断必须用 `typeof value === 'string'`，因为显式 `''` 代表纯色封面，不能被 `||` 错误覆盖
2. **语义色字段**：Theme 与草稿 style 新增 `coverTitleColor` / `coverSubtitleColor`，只存规范化六位 HEX。App 分别注入 `--c-cover-title` / `--c-cover-subtitle`；`theme-public-exam-landscape` 不得在 class 内硬写这两个 CSS 变量，否则会压过用户的颜色控件
3. **内置主题**：新增 `builtin-public-exam-landscape`，`bgAssetId = Inner`、`coverBgAssetId = Cover`、`coverTitleColor = '#6D136C'`、`coverSubtitleColor = '#5A465F'`、`contentJSON = null`。应用时只写入样式/资产快照，不调用 `editor.setContent`
4. **草稿兼容**：草稿正式升为 `EditorDocumentV2`，style 一次显式保存 `coverBgAssetId / coverTitleColor / coverSubtitleColor`；parser 同时严格接受 V1/V2。V1 读取时 `coverBgAssetId = bgAssetId`，两个颜色按旧 `themeClass` 的原主色迁移（雅致 `#1A1A1A`、极简白 `#111111`、深夜黑 `#F0F0F0`），不得把所有旧草稿默认染成公考紫。IndexedDB object store 无需升级；WAL 使用 v2 key，v2 优先、兼容读 v1
5. **用户主题兼容**：Theme 库现在没有 schemaVersion，因此在读取/应用边界 normalize 旧主题；旧主题的双底图和两个颜色都按上述规则补全，新保存用户主题必须显式保留全部四项
6. **App 状态与资源**：新增 cover id/src 与两个封面颜色 state；hydrate、capture/autosave、applyTheme、save theme、retryResources 全链路携带。Cover/Inner 并行 resolve 后再通过现有 revision guard 原子提交，不得出现「新 Cover + 旧 Inner」的混搭；主题切换时两个颜色也必须一次替换，不留旧值
7. **按页路由**：`pages.map` 仅做 `index === 0 ? coverBgSrc : bgSrc`，Preview 仍只接收「本页底图」，不理解整套模板。导出继续 clone 每个 `.page`，不改写 `exportPng.ts` 架构；两个颜色通过既有 CSS/根变量注入路径自然进入导出
8. **现有背景入口**：用户在素材库点选普通背景时，同时把 Cover/Inner 设为该素材，恢复「全篇同一背景」旧语义并脱离当前主题。v1.5 不新增分别编辑首页/内页的入口
9. **主题库交互**：继续使用现有主题库和右侧主题下拉；「公考·山水卷」卡片主缩略图显示 Cover，增加简短「首图 + 内页」标识。ThemePreview 必须注入两个封面色；因为不替换正文，不需要危险操作确认弹窗
10. **缺资源降级**：问题文案分别叫「首图背景」/「内页背景」，可单独重试。对应页先回退到另一张已解析底图，两张都缺时才回退纯色；1 页文档未使用 Inner，Inner 缺失不得单独阻断导出

#### v1.5 明确不做

- 不做 Markdown 导入、自动分页、自动缩字或自动编排
- 不做根据画布高度自动推测分页；本轮只保证用户手动点击的分页在普通段落和列表中都真正生效
- 不新建 `PosterTemplate`、模板市场、用户自建/分享模板，不赠送或替换正文骨架
- 不做独立的封面眉题/主标题/钩子字段槽位；本轮继续编辑普通 Tiptap 流式文档
- 不做任意选区/逐字颜色，不引入 `TextStyle/Color` mark；两个封面颜色是 Theme/草稿样式，不改写 Tiptap JSON
- 不做任意逐页背景、最后一页专属背景、自由图层/x-y 或背景位置调整
- 不添加未获授权的国徽、政府/机构 Logo 或「官方背书」视觉；底图只使用本次用户交付素材
- 不重写已稳定的 Tiptap、Preview 或导出引擎，不借机做 PWA/手机端/产品壳

#### 验收矩阵

**模型/兼容：**

- V1 旧草稿迁移后 Cover/Inner 都等于原 `bgAssetId`，外观不变；V2 双底图经过 autosave、WAL、刷新、另存、切换后不丢
- 旧用户主题缺 `coverBgAssetId` 时全页仍使用原背景；公考主题保存再应用仍是成对底图；应用任一旧内置主题后所有页恢复同背景
- 主题套用不修改 Tiptap JSON/分页符、不产生跨草稿 undo；快速切换主题/草稿/背景时，旧异步 resolve 不得回写新状态

**封面颜色/语义：**

- 应用公考主题后，Cover 第一个 H1 的 computed color 精确为 `rgb(109, 19, 108)`，紧邻副标题 p 精确为 `rgb(90, 70, 95)`；ThemePreview、中央画布与 2160×3600 PNG 一致
- 副标题选择器只命中首图第一个 H1 的紧邻 p；其他正文、Inner 页、H2/H3、引用和荧光笔不得误染
- 两个 HEX 修改、「恢复模板色」、主题切换、autosave/WAL/刷新/另存/用户主题往返都要测；非法/不完整 HEX 不落盘、不产生 CSS 注入、不清空正文
- V1 三个旧主题迁移后标题/紧邻段落像素外观不变；切换主题时不得残留上一主题的封面颜色

**正文工具栏/可访问性：**

- 1280×800、1440×900、1536×1024 三档保持完全一致的两行布局；段落 Select 外的 11 个按钮全部在首屏，「代码块/插入分隔线/插入分页/插入图片/短语不拆」均是直接按钮；DOM 中不再存在 accessible name 「更多结构工具」
- 工具栏不横向滚动、不裁切、不用省略号，实测 `scrollWidth <= clientWidth`；最后一个「短语不拆」文字、focus ring 和固定提示行完整可见，整页不增加滚动
- 代码块 active/toggle；装饰分隔线不分页；分页立即改变页数和 Cover/Inner 路由；图片直达素材库 image tab；短语不拆在无选区/1–12 字/超长/H1 超宽/已激活解除五种状态都正确。可撤销动作继续一次产生一个 undo 事务
- 只用 Tab/Shift+Tab 可按视觉顺序访问全部控件，Enter/Space 生效；屏幕阅读器可读出两个分组、中文按钮名、pressed/disabled 状态与「短语不拆」禁用原因，点击后不丢当前选区/编辑器焦点

**手动分页/列表结构：**

- 普通段落/标题光标中部、空段落、无序列表、有序列表、列表首/中/尾项、空列表项、两层嵌套列表、blockquote 和 codeBlock 分别插入；每次后 `page-break` 均为 `doc` 直接子节点，不存在任何 `ul/ol/blockquote hr.page-break`
- 列表中段分页后，前后文字、marks、嵌套层级不丢不重，不留空 `ul/ol/li` 或幽灵圆点；有序列表要分别覆盖 `start=1` 和 `start=4`，后段序号连续而不重置；单次插入可一次 undo/redo 往返
- 用 v1.4.1 可产生的 `li > hr.page-break` JSON 构造旧草稿、WAL 恢复和外部 setContent/粘贴样例；载入后自动归一化且不污染 undo，再保存/刷新/JSON 往返不复发
- 每次插入或归一化后，`splitIntoPages(editor.getHTML()).length` 立即增加预期页数，中央画布不再把后续文字挤出安全区；公考主题的页角色同步变为 `[Cover, Inner…]`
- 单页 PNG/多页 ZIP 的页数、顺序和 2160×3600 尺寸与画布一致；保留既有「连续分页产生空页、首/尾分页保留空页、divider 不分页」语义

**页角色/可靠性：**

- 1 页只显示 Cover（Inner 可按现有资源策略预载）；2 页为 `[Cover, Inner]`；5 页为 `[Cover, Inner, Inner, Inner, Inner]`；手动插入/删除分页后立即重算。文档开头就有 page-break 时，空的 page 0 仍是 Cover，不做隐式跳页
- Cover/Inner 分别缺失、分别重试、双缺失、同 assetId 去重都要测；单页缺 Inner 可导出，多页缺 Inner 进导出预检
- 参考线在两种页角色上准确跟随安全盒；选框、参考线、裁切遮罩不进导出

**视觉/导出：**

- 本地用至少 2 页的公考真实样稿验证 Cover 标题层级、Inner 正文可读性、3:4 裁切参考、顶线不重复、无猫 Logo、页码不压山；1280/1440/1536 三档桌面宽度都截图
- 单页 PNG 和多页 ZIP 每张都是 2160×3600；通过 DOM src 顺序 + 底部特征像素确认第 1 页真的是 Cover、第 2–N 页真的是 Inner，不只靠肉眼看相似纸色
- 打开/关闭首图裁切参考后，导出成品 hash 不变；底图无叠膜、无 CSS 位移/二次裁切，Inner 顶线只有原图一条
- 既有雅致/极简白/深夜黑、自定义背景/字体、正文图片和荧光笔均回归，`test_v140_local.py` 继续全绿，新增 v1.5 双底图回归脚本/单测

#### v1.5 打包策略：一次对外发布，分区实现/验收

**默认结论：这四类需求合并为一个 v1.5.0，但禁止做成一个大提交或一口气改完才测。**

- 公考双底图依赖可靠手动分页，否则 Cover/Inner 页角色本身无法验收；两行工具栏又会把「分页」从更多菜单提到明面，不能让一个更容易点到的按钮仍保留已知坏路径
- 合并为一个用户版本，只需一次 V1→V2 迁移、一轮完整导出验收、一次双轨部署和一份专业公告；内部用独立工作包/提交又能让问题可定位、可回退
- 只有当公考模板明显延期，或线上分页缺陷需要立即止血时，才把「列表安全分页」先独立发为 **v1.4.2**，再发 v1.5.0；不得把多个不同构建都叫 v1.5.0

#### 实施完成记录与发布闭环

1. **WP1·分页可靠性 ✅**：`b4e9088` 实现顶层安全分页，`fbb9c03` 补强粘贴/恢复等内容边界的根层不变量；无序/有序/嵌套列表分页已回归
2. **WP2·工具可见性 ✅**：`faf109a` 将正文工具栏改为固定两行常驻，删除「更多」主路径，并通过第一轮用户目检
3. **WP3·数据/资源基础 ✅**：`b15fecf` 完成 V1→V2 草稿兼容、Theme normalize、Cover/Inner 双资源、封面语义色与原子解析
4. **WP4·公考视觉闭环 ✅**：`589694f` 接入页序路由、内置资产、「公考·山水卷」、专属 CSS、两个 HEX 控件、资源降级和导出预检
5. **WP4.1·真实字形光学对齐 ✅**：`86a5949` 完成 H2 标题与竖线、有序列表序号与首行文字的中线校准；覆盖预览、ThemePreview、html2canvas 导出、字体冷加载/切换、混合字体和可访问列表语义。最终 v3 预览/导出已获用户视觉确认
6. **WP5·联合回归 ✅**：32 文件 / 217 单测、tsc、ESLint、build、diff-check、`test_v150_local.py` 和真实 Chromium 多字体/多字号像素校验全绿；独立审计无 P0/P1/P2 或阻断项
7. **发布闭环 ✅**：用户于 2026-08-11 明确授权「可以发布」；`227b0da` 将版本升至 v1.5.0 并补齐生产回归脚本。Cloudflare + OSS/CDN 双轨部署同一 `index-D0LqeUgP.js` / `index-BQdpJR0I.css`，tag `v1.5.0` 已推送；两入口的 1/2/5 页背景、主/副标题色、列表分页、字形中线、旧三主题与用户字体回归全绿，`archive/dist-v1.5.0/` 已按不覆盖原则归档；16:10 CST 已按 §2 第 8 步核对旧企业租户/机器人/接收人并发送专业公告，私聊回读成功。**v1.5.0 当前无未完成步骤**

### 版本沿革与候选路线（当前状态只看 §0）

> `v1.6.0` 曾是未实施的候选代号；项目已经发布到 v1.7.2，不能再倒序创建 `v1.6.0`。其字体 / 结构化封面范围已重新排入 ≥v1.9.0 候选。2026-08-12 之后的完整优先级以 `docs/ROADMAP-2026-08-12.md` 为准。

| 范围 | 发布 / 规划记录 | 进度 | 后续门禁 |
|---|---|---:|---|
| v1.5.0 公考双底图模板版 | 已全部闭环 | **100%** | 只响应真实线上反馈；应用代码问题走新补丁版本，不移动 `v1.5.0` tag |
| v1.5.1 高频编辑修复 | 已全部闭环 | **100%** | 只响应真实线上反馈；应用代码问题走新补丁版本，不移动 `v1.5.1` tag |
| v1.6.0 旧视觉资产候选 | 从未立项或发布，版本代号停止使用 | — | 范围重排到 ≥v1.9.0；先过 CDN 字体生产 A/B Gate 0 |
| v1.7.0 导入文稿与完整导出 | 已全部闭环 | **100%** | 后续修复使用新补丁版本，不移动 `v1.7.0` tag |
| v1.7.1 确定性排版候选 | 历史 tag 保留；首次生产门禁发现列表基线回归，未作为稳定版闭环 | 淘汰 | 不移动 `v1.7.1` tag，不重新发布 |
| v1.7.2 确定性排版修复 | 稳定版闭环完成 | **100%** | 固定 `v1.7.2` tag；线上反馈使用新版本号修复 |
| v1.8.0 长文定位与滚动联动 | 已全部闭环（2026-08-12） | **100%** | 固定 `v1.8.0` tag；线上反馈使用新版本号修复 |

1. **v1.4.1 桌面交互与可靠性版（已上线）**：图片直接操作、等比缩放、左中右对齐、磁吸、排版参考线、正文荧光笔、桌面编辑器外壳、轻量最近操作、草稿与导出可靠性，以及上述沃林 UX 原则；补丁版同步默认 5 页教程
2. **v1.5.0 公考双底图模板版（2026-08-11 已完成并双轨上线）**：第 1 页 Cover、第 2 页起 Inner，公考专属安全盒/页码，封面主标题 `#6D136C` + 副标题 `#5A465F` 及可修改 HEX 控件，正文工具全部常驻，列表内分页保持顶层且真正切页，标题竖线/列表序号按真实字形中线对齐，旧草稿/主题兼容、资源恢复与高清导出闭环
3. **v1.5.1 高频编辑修复（2026-08-11 已双轨上线）**：全局但焦点安全的 Command/Ctrl+Z、Shift+Command/Ctrl+Z / Ctrl+Y；H1–H3 整段语义提示、跨段选区端点归一化、禁用产品未承诺的 H4–H6 快捷入口；用户确认右侧 Demo 后，公考 Cover 建议内容区已改为 `x=120/960、y=300/1500`，内页与旧主题不动，复杂网格仍明确否决。自动测试、视觉自查、用户目检、双轨生产回归、精确 tag 与不可覆盖归档均已完成
4. **v1.6.0 旧候选（从未发布，代号停止使用）**：原计划的字体本地化 / 减重 / 字重档位与结构化封面已重新排入 ≥v1.9.0；不得倒序补发或创建 `v1.6.0` tag
5. **v1.7.0 导入文稿与完整导出版（2026-08-11 已双轨上线）**：Markdown / 纯文本导入、覆盖式解析确认、同一可编辑新草稿、右栏独立发布文案、普通文稿 `---` 全局确认、17/18/19+ 上传兼容提示、一次完整目录/ZIP 导出、自选页码、导出清单、同会话续写剩余页和中文正文两端对齐。图片资源映射、原生长文、37+ 上传分组整体重均衡不在本次范围
6. **v1.7.1 生产门禁淘汰 / v1.7.2 稳定修复（2026-08-12 已双轨上线）**：预览与导出共享确定性行级快照；v1.7.1 的首次生产门禁发现列表基线回归，保留其历史 tag 但不把它视为稳定闭环；v1.7.2 修复后完成双轨生产验证，两版 tag 均固定
7. **v1.8.0 长文定位与滚动联动版（下一功能版首选）**：左侧 Tiptap 与中央多页画布按页 / 内容块 / 块内进度双向同步；吸收多人喜报的视口中心锚点、手算 scrollTop、防回环和双向回归，不照搬固定行高公式
8. **≥v1.9.0 视觉资产与结构化封面（候选，拆批立项）**：先做 CDN 字体生产 A/B，再评估字体本地化、减重和字重档位；结构化封面另按主 / 副标题槽位、三套版式和有限位置调整实施，不做自由文本框与复杂网格
9. **交付与诊断（不预占版本号）**：跨刷新目录续写、PWA、部署 / 资源诊断及简化 `hasRaceArtifact/retry` 均需先有证据或真实需求；Tauri 只在明确需要离线桌面分发时评估，不与 PWA 同时开工
10. **v2.0.0 运营机器产品壳**：项目首页、素材入口、历史作品、工作流导航等全局 UI/UX 与信息架构更新；只换产品壳和工作流，不重写已经稳定的排版、草稿与导出引擎
11. **独立内容模板，不预占版本号**：只有出现明确的「带正文骨架/封面字段槽位/页类型」需求后，才设计 `PosterTemplate`；Theme 继续管视觉 token，Template 才管内容结构，二者不混在一个模型里
12. **远期候选：手机端，不预占版本号**：当前不做。桌面功能稳定且出现明确移动场景后，再学习沃林的「共享引擎 + 独立手机壳」，单独设计底部抽屉、触控命中、双指手势与微信保存链路；绝不把桌面侧栏直接压缩到手机

---

## 9. 用户偏好

- 诚实优先、不偷懒、做不到直说；先查自身再怪外部
- 响应简短直接；关键决策用 AskUserQuestion 给选项，第一个标推荐
- 中文注释解释 WHY 不写 WHAT
- UI 改动 Playwright 截图自查后再交用户目检
- 正文编辑的高频/重要工具要直接可见，不收进「更多」；宁可稳定分成两行，也不隐藏或横向滚动
- 版本管理：迭代不覆盖原文件（全局记忆规则）
- 发版公告要写得专业、可直接发送；默认交付用户自行发送，只在用户明确授权代发时才调用飞书机器人并核对身份
- 终端统一 iTerm2

---

## 10. v1.5.1 已确认范围与新会话开场

### 用户已确认的产品判断

1. **封面与正文不得互相隔离**：继续使用同一编辑器、同一连续成品画布，用户始终能比较首图和内页的一致性。
2. **暂不做自由文本框**：后续使用结构化主标题/副标题槽位，配左对齐叠排、居中海报、小字在上大字在下三套高质量版式，并只开放有限位置调整。
3. **复杂网格已否决，参考线保持简洁**：完整收敛结论见 `docs/GRID-SYSTEM-DIAGNOSIS-2026-08-11.md`。只保留左/中/右/上/下五条线；封面左右继续 `x=120/960`，内页不动。用户已目检确认右侧 Demo 与最终成品：上下为 `y=300/1500`，等于在首图 3:4 可见区 `y=180…1620` 内上下各留 120px；现已随 v1.5.1 上线。不要再实施 6 栏、模块或可见基线网格。
4. **字体名称已解释清楚**：UI 里的“思源黑体/思源宋体”就是 CSS 中的 `Noto Sans SC / Noto Serif SC`，不是消失了；两者是中日韩字体，不是只服务英文。`serif / sans-serif` 是通用回退类别。main.tsx 现导入 Noto Sans 9 档 + Noto Serif 8 档，而 UI 标题只有二态字重；冗余清理与 CDN 本地化当时归入 v1.6 候选，现已重排至 ≥v1.9.0，不混进补丁。

### v1.5.1 本地工作包

- **WP1 · 全局 undo/redo**：修复编辑器失焦、点击顶栏或画布后 Command/Ctrl+Z 不工作。ProseMirror 内继续交给 Tiptap；input/textarea/contenteditable、组合输入、弹窗、只读状态和画布手势不得被全局 handler 抢走；只有命令实际成功才 `preventDefault`。
- **WP2 · 标题整段语义**：H1/H2/H3 是块级节点，同一段里的自动换行或 Shift+Enter 软换行必然一起变化；UI 必须写明“标题作用于整段；Enter 分段，Shift+Enter 只换行”。修复选区端点落在上一段末尾时相邻两段一起变化，并补跨段/边界回归。
- **WP3 · 标题范围**：StarterKit 只启用 H1–H3，移除隐藏的 Command/Ctrl+Option/Alt+4…6 入口，避免产生下拉框无法识别的 H4–H6。
- **WP4 · 封面上下安全区（用户已确认，已本地实施）**：左右维持 `x=120/960`，只把公考封面上下从 `y=340/1180` 扩为 `y=300/1500`，内页和旧主题不动；参考层保持五条简洁线，标签用“建议内容区”，提示为“重要文字尽量放在线内；背景图片可以铺满整页。参考线不会导出。”；真实 padding、溢出判断、旧草稿/页数/导出回归已同步。

### v1.5.1 本地完成记录（用户目检已通过）

1. **WP1 · 全局 undo/redo ✅**：新增焦点安全的 window 快捷键路由，仅在 Tiptap 失焦且历史命令成功时阻止默认行为；ProseMirror、input/textarea/select/contenteditable、IME、Dialog/Radix popup、只读标签页和画布手势均有回归。
2. **WP2 · 标题整段语义 ✅**：工具栏常驻提示“标题作用于整段；Enter 分段，Shift+Enter 只换行”；段落样式命令统一归一化选区端点，覆盖正向、反向、两个空端点、真跨段、标题转正文、Enter 和 Shift+Enter。
3. **WP3 · 标题范围 ✅**：StarterKit heading schema 只接受 H1–H3，明确吸收 Command/Ctrl+Option/Alt+4…6 而不创建节点；旧 HTML/JSON 中的 H4–H6 窄化迁移为 H3，避免不可识别节点。
4. **WP4 · 封面建议内容区 ✅**：仅把公考 Cover 改为 `x=120/960、y=300/1500`，Inner 保持 `x=96/984、y=180/1500`，旧主题不动；保留五条简洁线，中线更淡且使用虚线，标签/提示均位于仅预览层。
5. **验证证据**：Vitest 34 文件 / 253 测试、`tsc -b`、ESLint、Vite build、diff-check 全绿；`test_v151_local.py` 的真实 Chromium 焦点/选区矩阵与 `test_v150_local.py` 深回归全绿，参考层开关前后导出像素 SHA-256 一致；本地生产构建 `test_prod_deep.py` 三旧主题/用户字体全绿；1280×800、1440×900、1536×1024、标题菜单展开态和 safe-area Cover/Inner 的生产构建截图已自查，保存在 `docs/design/v1.5.1/`。
6. **边界与门禁**：仅实施用户确认的 WP1–WP4；复杂网格、内页/旧主题安全区、字体本地化/减重、字重档位、结构化封面和 Markdown 均未实施；`app/package.json` 为 `1.5.1`。用户目检、双轨发布、生产回归、精确 tag 与归档已经完成。
7. **发布证据**：发布提交/tag 为 `dd137f1` / `v1.5.1`；两入口与归档的 JS SHA-256 为 `97e669cc…e105a7`，CSS 为 `7d57c152…9efecb7c`。`archive/dist-v1.5.1/` 为 9.5M，排除字体 3337 个；`v1.5.0` tag 未移动。19:04 CST 已使用飞书旧企业租户 `default` 的「Claude聊天助手」机器人将专业公告发送至刘彦君 1v1，消息 `om_x100b6884555fe8b4b16098c17098e27` 已回读确认；本版本无未完成步骤。

### 快捷键文档（已写入 USAGE/发布说明）

- 全局：撤销 `Command/Ctrl+Z`；重做 `Shift+Command/Ctrl+Z`，Windows 兼容 `Ctrl+Y`；`Esc` 取消画布手势；拖图时 `Option/Alt` 临时关闭磁吸。
- 编辑器内：粗体 `Command/Ctrl+B`、斜体 `Command/Ctrl+I`、下划线 `Command/Ctrl+U`、硬换行 `Shift+Enter`、段落/标题 `Command/Ctrl+Option/Alt+0…3`、有序/无序列表 `Command/Ctrl+Shift+7/8`、列表层级 `Tab / Shift+Tab`。
- 现有但界面未公开的 inline code / strike / code block 快捷键在写说明前应决定保留还是移除，不能把偶然继承的 StarterKit 行为直接当产品承诺。

## 11. v1.7.0 正式发布记录

### 已确认并实现

1. 顶栏「导入文稿」支持 `.md` / `.txt`、拖放和粘贴；真实 18 页 fixture 与 19+ fixture 均可一键载入。解析确认不会改动当前草稿，确认后完整生成一个新草稿
2. 专用 `# 封面` / `# 正文` 结构将发布文案放入右栏独立卡片；普通文稿的 `---` 只做一次全局确认。解析不改写原文，19+ 不截断、不缩字、不拆草稿
3. 导入的新草稿进入现有 Tiptap / IndexedDB / undo / autosave 链，真实浏览器已输入测试文字并确认自动保存，再用撤销恢复原文；不是不可编辑快照
4. 17/18/19+ 精确状态由集中配置生成。18 张文案固定为“18 张，达到当前普通图文单篇上限”；19 张文案为“共 19 张，超过普通图文单篇上限 18 张；仍会完整生成”
5. 19+ 可一次完整导出；全部模式增加二次确认，但不会禁止。目录模式写入一个独立文件夹；兼容 ZIP 也只有一个顶层目录。另保留范围输入和缩略图多选，不连续选择仍用原稿页码
6. 图片命名为 `01_[主题]_cover.png` / `02_[主题]_inner.png`，页码按总页数至少补两位；文件夹含主题、范围、张数和北京时间。重复导出追加 `-02/-03`，清单记录源页、文件名、交付方式与 18 张兼容判断
7. 目录写入中断后，同一页面会话可在原文件夹只继续剩余页；成功 `close()` 才算已完成，`导出清单.json` 最后写入。浏览器不支持目录写入时使用一个兼容 ZIP
8. 正文段落在左侧和 1080×1800 成品画布保持中文两端对齐，最后一行自然靠左；H1/H2/H3 不强制拉伸。列表、引用、长文本和粗体已目检
9. 文档主题与 ZIP 名按 UTF-8 字节安全截断，避免操作系统 255-byte 路径段失败；若目标位置已有同名普通文件，也会继续尝试 `-02/-03`，不覆盖旧文件

### 验证证据

- 自动化：Vitest 37 文件 / 292 测试、TypeScript、ESLint、Vite build 全绿
- 浏览器：真实点击 18 页和 19 页全流程；19 页第 19 张存在；范围 `1-3, 5, 19` 选出 5 张，取消第 5 页后归一为 `1-3, 19`；`0, 20` 显示越界错误并禁用导出
- 真实交付：`test_v170_import_export_ui.py` 已在两个生产入口分别下载约 196 MB 的 19 页兼容 ZIP；唯一顶层目录，PNG `01..19` 无丢失/重复、均为 2160×3600，manifest `sourcePages=1..19`，console/page error 均为 0
- 旧链回归：`test_v150_prod.py`、`test_prod_deep.py` 与 `test_v151_prod.py` 已在两个生产入口跑通 1/2/5 页 ZIP、列表分页、三旧主题、用户字体、2160×3600 像素、字形中线、撤销重做与标题边界
- 生产目录写入：Cloudflare 生产页面通过 Chrome 原生目录权限完成一次 5 页导出；一个独立文件夹内有连续编号的 5 张 2160×3600 PNG 与最后写入的 `导出清单.json`，manifest 为 `deliveryMode=directory`、`sourcePages=1..5`
- 正式构建：两个生产入口、本地与 `archive/dist-v1.7.0/` 均使用 `assets/index-BKYNhwYN.js` / `assets/index-BVsea9B1.css`；JS SHA-256 `fbfafa1ec17407fc9886b7d7e74977d7622324275106949219d9c3b202b60dfc`，CSS SHA-256 `39a1a1dbc10c2debdfb209ad5b68b42ee686a9bfb9cfa62563627fb3bcd71c13`
- 版式：实际 DOM 画布为 1080×1800；正文计算样式 `justify / text-align-last:left / inter-character`，标题 `start / auto`；页面无横向溢出
- 控制台：两个生产入口的 console error / page error 均为 0
- 截图：`docs/screenshots/v1.7.0/01-import-18-review.png` 至 `06-export-19-selection.png`

### 发布闭环

- 发布提交/tag：`87a2d89` / `v1.7.0`；tag 已推送且不得移动
- Cloudflare Workers 与阿里云 OSS/CDN 已双轨上线，两个入口加载同一构建
- `archive/dist-v1.7.0/` 已按不覆盖原则归档（9.5M；字体 3337 个另见 `FONTS-MANIFEST.txt`）
- 旧企业租户 `default`、应用 `cli_a92bb2ebb1795bd2`「Claude聊天助手」已核对；正式公告发送至刘彦君既有发布会话，API 回执消息 `om_x100b6887b2a35ca8b4a99575b534996`

### 明确未做 / 延后

- 不接入小红书原生长文管线；18 不是所有内容类型的统一上限
- 不混入当时代号 v1.6 的字体本地化、字体减重、字重档位或结构化封面；这些范围现已重排至 ≥v1.9.0
- 37+ 页的上传分组与“整体重新均衡”只做标记；当前导出无需分批，仍是一个目录/ZIP
- 目录中断续写 token 只在同一页面会话有效；刷新后跨会话恢复留待后续可靠性版本
- 兼容 ZIP 需要在浏览器内存中汇总后再打包；19 页 fixture 的实际 ZIP 约 196 MB，因此支持目录写入时继续默认推荐逐页写入独立文件夹
- 旧 v1.5.1 若在回滚后重新编辑导入草稿，旧代码可能丢掉可选 `publication` 元数据；Tiptap 图片正文仍可见。这是本次已接受并记录的窄回滚权衡

### v1.7.0 当时的新任务开场提示（历史归档，当前状态只看 §0）

```
继续小红书排版编辑器。线上稳定版为 v1.7.0；发布提交/tag 为 `87a2d89` / `v1.7.0`，Cloudflare 与大陆通道已加载相同构建并完成生产回归，`archive/dist-v1.7.0/` 已生成。后续应用修复必须新开版本，不移动既有 tag。开始前请先读：

/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/AGENTS.md（若存在）
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/CLAUDE.md（若存在）
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/HANDOFF.md
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/README.md
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/docs/RELEASE-v1.7.0.md
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/docs/screenshots/v1.7.0/

v1.5.0、v1.5.1 与 v1.7.0 的 tag 均已固定，不重做、不移动。延期范围仍为：原生长文、当时代号 v1.6（现已重排至 ≥v1.9.0）的字体本地化/减重/字重档位/结构化封面、37+ 上传分组整体重均衡、跨刷新目录续写。新需求先重新定版本范围与生产门禁。
```
