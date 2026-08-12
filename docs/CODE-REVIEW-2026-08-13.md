# 全量代码审查报告（2026-08-13）

> 审查范围：`app/src` 全部源码（约 2.4 万行）+ 交叉验证测试引用关系。
> 方法：按四个维度并行审查（确定性排版引擎 / 导出链路 / React 状态与组件 / 持久化与导入），最高严重度发现另做人工代码核实。
> 基线：v1.8.0（`067a761`），Vitest 41 文件 / 409 测试全绿。
> 处置：🔴 级与部分小修已纳入 **v1.8.1 修复版**（见文末版本编排）；其余按批次排期。

**总体结论**：代码质量整体扎实——WAL 生命周期、写队列串行化、导出续写 token 边界、快照封印纪律、滚动联动分层都经得起推敲，**没有发现会丢数据、丢页或清单不符的现行缺陷**。发现集中在：2 个正确性缺口（均已人工核实）、一组编辑/导出热路径的性能空间、一批低成本清理项。

---

## 一、正确性（按严重度）

### R1 🔴 坏 fontSize 主题会"砖化"自动保存并销毁 WAL ✅已人工核实
- 位置：`lib/themes.ts` `normalizeTheme`（fontSize 只查 `Number.isFinite`，无范围）vs `lib/documentStore.ts:272` `parseDocumentStyleV1`（要求 12–120，越界即 throw）；应用路径 `App.tsx:1312` 无 clamp。
- 机理：越界 fontSize 的主题能正常入库和应用；应用后每次自动保存 `putEditorDocument` → parse 抛"草稿数据损坏"，保存永久失败；且 `writeEditorDocumentRecovery` 的 catch 会 `removeAllEditorDocumentRecoveryKeys()`——新 WAL 写不进，旧 WAL 保护也被清掉。用户后续编辑既进不了 IDB 也没有 WAL 兜底。
- 修法：`normalizeTheme` 对 fontSize 做与 documentStore 相同的 12–120 clamp。**→ v1.8.1**

### R2 🔴 Canvas 不可用时伪造墨迹指标，绕过 fail-closed 导出闸门 ✅已人工核实
- 位置：`lib/deterministicTypography.ts:205-225` `measureText` fallback → `:471-487` `extractAtoms`。
- 机理：`context2d()` 为 null 时 fallback 编造数字型 `actualBoundingBoxLeft/Right`；`opticalMetricsMissing` 判定是 `=== null`，伪造值永远不触发，`ink-metrics-unmeasurable` 阻断不会产生。字体预检只验 FontFaceSet 不验 Canvas。隐私扩展/企业策略禁用 Canvas 的浏览器会静默产出几何错误但被判"可导出"的快照。这是 fail-closed 纪律唯一的实质缺口。
- 修法（v1.8.1 实施时修正）：原方案"fallback 不再伪造 ink 指标"不可行——**jsdom 单测环境本身没有 Canvas，10 个排版单测就靠这个 fallback 跑**，引擎层必须保持宽容。实际修法：在 `App.tsx` handleExport 的导出预检中加 Canvas 2D 探针，不可用时产生无 severity（=硬阻断、不可覆盖）的 font 类 issue；引擎 fallback 处补注释说明分工。**→ v1.8.1**

### R3 🔴 目录导出中断吞掉根因，持续性故障成"可继续"死循环
- 位置：`lib/exportDelivery.ts:277-282` + `components/ExportDialog/ExportDialog.tsx:301-307`。
- 机理：任何异常（磁盘配额、权限被撤销等）统一包成 `DirectoryExportInterruptedError`，`cause` 只存不显。持续性故障下用户点"继续剩余 N 张"以相同方式再失败，永远看不到真实原因。
- 修法：exportError 文案拼接 `cause` 的 message。**→ v1.8.1**

### R4 🔴 粘贴 HTML 用主文档 `innerHTML` 解析，`<img onerror>` 会在消毒前执行
- 位置：`lib/textReliability.ts:215-216` `normalizeChineseBoldBoundaryWhitespaceHtml`。
- 机理：detached div 属于主文档，img 解析即加载、onerror 内联 handler 会执行——发生在 Tiptap sanitize 之前。同仓库 `suggestFilename` 已用正确姿势（`DOMParser` 惰性文档）。
- 修法：换 `DOMParser`，后续 TreeWalker/序列化逻辑不变。**→ v1.8.1**

### R5 🟠 打开草稿即触发一次完整落盘，updatedAt 被刷新
- 位置：`App.tsx:914-962`（autosave effect 依赖 `draftReady`）+ `App.tsx:442-459`（`captureDocument` 每次刷新 updatedAt、递增 revision）。
- 后果：只看了一眼的草稿跳到"最近"首位；revision 无意义膨胀；打开后 900ms 内关页留下多余的恢复回合。
- 注意：该路径同时承载新建空草稿的首次落盘（bootstrap else 分支依赖），修复需守卫跳过纯打开场景而非移除。**→ 排期（非 v1.8.1，需要小心的时序回归）**

### R6 🟠 Markdown 分隔线只认恰好 `---`
- 位置：`lib/importDocument.ts:94`（`PAGE_SEPARATOR`）及 renderMarkdown 同款。
- 机理：`----`（4+）等 CommonMark 合法 thematic break 既不分页也不渲染 divider，以字面文字进入成品图。
- 修法：放宽为 `-{3,}`；`***`/`___` 是否支持属产品口径，暂不动。**→ v1.8.1**

### R7 🟠 英文段落超一行 → 整段 emergency（产品边界待明示）
- 位置：`lib/deterministicTextLayout.ts:472-489`（space box 三值恒等）、`:643-649`、`:1792-1799`。
- 机理：纯拉丁/空格行无任何 justify 弹性，justified 可行性永不成立；DP 对整段求解，段内一句长英文即让全段（含中文行）落入 emergency，每行报 `unsatisfied-line`。
- 处置：若"中文正文工具不支持英文长段"是有意边界→在本文档与 HANDOFF 明示即可；要支持→给 collapsible space 一个伸缩区间（如 0.75×–1.5× advance）。**→ 待产品拍板**

### R8 🟡 小项
- 导入失败提示用 stale closure 旧文案：`App.tsx:1590`（`draftStorageError` 是本次 render 旧值）。
- 预检图片问题标签用跨页全局序号，用户对不上页码：`lib/exportReadiness.ts:52-58,106-117`。
- Windows 保留设备名（`CON` 等）可穿过 ZIP 命名清洗：`lib/exportPlan.ts:576-588`。
- 普通文稿"分页"模式允许静默空页（专用结构会报 `EMPTY_PAGE`，不对称）：`lib/importDocument.ts:180-185`。
- `looksBinary` 把整个文稿 spread 成字符数组，多 MB 粘贴先阻塞主线程：`lib/importDocument.ts:424`。
- 滚动联动：容器 null 时静默失效不自愈（潜伏，当前挂载顺序兜住）；两处 `cancelAnimationFrame` 后未清零 `rafRef.current`，靠隐式执行顺序兜住：`lib/useDocumentScrollSync.ts:102,109,113-115`。**rafRef 清零 → v1.8.1**

---

## 二、性能（按收益排序）

### P1 DP 断行求解器——引擎最大性能杠杆
- 位置：`lib/deterministicTextLayout.ts:1763-1823`。
- 四个面：① 无提前终止（内层扫到 `atoms.length`，候选对 O(n²) 而非 O(n·L)；`model.min > targetWidth × 1.1` 后 break 是安全的）；② 同一候选重复求解 2–3 遍（`lineAdjustmentModel`（含 40 轮二分）→ `lineCanSatisfyVisibleCorridors` 再一次 `adjustWidths` → `materializeLine` 内部再跑一遍二分）；③ 未入选候选急切物化（`:1802`，绝大多数被丢弃）；④ `[line, ...tail.lines]` 对每个可行候选 O(n) 拷贝，可改链式 `{ line, tail }`。
- 收益：长段落排版重算预计降一个数量级；编辑热路径。**→ v1.9.0 配 profile**

### P2 光标每移动一格整棵 App 树重渲染
- 位置：`components/Editor/Editor.tsx:236-276`（`reportEditorState` 每次新对象字面量）+ `App.tsx:2215-2217`（裸 setState）。
- 修法：上报前浅比较 bail out（ref 持有上次值），或 App 端函数式 setState 比较。**→ v1.8.2 已实现并发版**：Editor 侧 `lastReportedRef` 持有上次三态，`sameImageState/sameTextSelectionState/sameHistoryState` 逐字段比较，值未变不回调 App（`Editor.tsx` reportEditorState）。

### P3 每次击键全部 Preview 页重渲染 + ref 回调每帧脱挂重挂
- 位置：`App.tsx:2249-2272`（内联 ref/回调）+ `Preview.tsx:276`（无 memo）。
- 修法：`memo(Preview)` + 回调/ref 工厂稳定化。与 P2 合并做收益最大。**→ v1.8.2 已实现并发版**：`memo(forwardRef(Preview))`；App 侧 `getPageRefCallback` 按页序缓存 ref 回调、`handleSelectCanvasImage/handleClearCanvasSelection/handleCommitCanvasImage/recordRecentAction` 全部 useCallback 固定。真实浏览器回归双向滚动联动/开关/图片选择全过。

### P4 每次击键同步全文 stringify + 写 localStorage WAL（两个维度独立发现）
- 位置：`App.tsx:929-940` + `lib/documentStore.ts:560-582`。
- 修法：WAL 写入纳入短防抖（如 200ms），保留 visibilitychange/pagehide 同步兜底——崩溃保护窗口几乎不变，按键路径成本归零。**→ v1.8.2 已实现并发版**：`WAL_DEBOUNCE_MS=200` + `walTimerRef`，定时器带 recoveryId 守卫防复活已清除 WAL；`clearAutosaveTimer` 同步清 WAL 计时器；visibilitychange/pagehide 同步兜底原样保留。真实浏览器验证：防抖后 WAL 真实写入、900ms 自动保存清 WAL 路径不变、编辑后立即刷新内容不丢。

### P5 导出基线校准逐 atom 写读交替，强制逐字素 reflow
- 位置：`lib/deterministicTypography.ts:872-885`。同文件 `:783-786` 已有"批量写后统一读"的正确范式可沿用。**→ v1.9.0**

### P6 `collectAllCss()` + `getUserFontFaceCss()` 每页每次尝试全量重算
- 位置：`lib/exportPng.ts:223`。数百 KB 字符串 × 30 页 × 最多 3 次 retry；导出批内 CSS 不可能变。批开头算一次经 options 透传。**→ v1.8.2 已实现并发版**：新增 `buildExportBatchCss()`（collectAllCss + 用户字体 @font-face），`RenderPageOptions.cssText` 透传；`exportDelivery` 的 `writeDirectoryPlan`/`executeZipExport` 批开头各算一次。onclone 注入策略不变，缺省单页路径自行现算语义一致。

### P7 基线 probe 未按 (font, lineHeight) 去重
- 位置：`lib/deterministicTypography.ts:749-808`（每字素一个 probe；同 font+lineHeight 基线必然相同，去重后每块 1–3 个）；`lineBaseline`（`:696-742`）同理可缓存。**→ v1.9.0**

### P8 其他小项
- 启动全量加载所有草稿正文 + 活动草稿读两遍：`lib/documentStore.ts:410-417` + `App.tsx:816-819`（最小改动：从 list 结果取 activeId，省一次读+parse）。
- `breakGroupWidths` 三元里 `widthModel(...)` 求值两次：`lib/deterministicTextLayout.ts:1403-1410`。
- 非 justify 贪心路径在合法性判定前构建 widthModel：`:1713-1719`。
- `freezeOpticalListMarkerGeometry` decorate 后紧跟 refresh 冗余：`lib/opticalTypography.ts:598-604`。
- Preview 无依赖数组 effect 每渲染重挂全局监听（疑漏写 `[]`）：`Preview.tsx:684-697`。
- `customize()` 每渲染生成 14 个新 handler（未来 Inspector memo 的障碍）：`App.tsx:1375-1385`。
- `resolveAsset` 同 assetId 多节点各查一次 IDB，可 Map 记忆化（收益微）。

---

## 三、可维护性 / 死代码

### M1 `exportPages` 遗留管线（约 50 行）——保障降级的平行路径
- 位置：`lib/exportPng.ts:1-2,133,342-390`。零调用；无清单、无 warning 白名单、文件名规则与现行相悖，误接上会静默不一致。连带：JSZip 导入仅它使用、`triggerDownload` 与 `exportDelivery.ts:340` 逐字重复、`:133` 与 `:365-369` 注释失实。`suggestFilename` 仍在用须保留。**→ v1.8.2 已实现并发版**：`exportPages`/`triggerDownload`/JSZip 导入已删，`:133` 失实注释改为指向 renderPagePngBlob 交付层；`suggestFilename` 保留；exportPng.test 本就未引用 exportPages，无测试改动。
### M2 预检门控逻辑两处分叉
- `lib/exportReadiness.ts:237-248` `assertExportReadiness` 生产已死（仅自身测试引用）；`App.tsx:1984-1990` 内联复制同一套 blocking/warning 规则。让 App 复用或删除死版本并把测试对准真实路径。**→ v1.8.2 已实现并发版**：死版本 `assertExportReadiness` 删除，改为纯门控 `assertNoBlockingExportIssues(issues, { allowWarnings })`；App 导出闸门把 Canvas 探针/已知资源/字体恢复问题 concat 进 issues 后调用同一实现；测试改走真实路径（checkExportReadiness + 门控组合），语义完全不变。
### M3 FNV-1a hash 三处复制
- `deterministicTextLayout.ts:1912-1917` / `deterministicTypography.ts:618-625` / round-to-milli 逻辑两份（`opticalTypography.ts:76-79`、`deterministicTextLayout.ts:1888-1890`）。快照 hash 是"预览=导出"契约核心，分叉即最难排查的 mismatch。抽 ~15 行共享模块。
### M4 带说明书的陷阱：`clearTypographyMetricsCache(family)` 分支
- `lib/typographyMetrics.ts:456-466`：按单 family 匹配永远失败（缓存存完整 font stack），`fontRegistry.ts:18-23` 已知并绕开，但 API 和 JSDoc 还在教人用。删参数与分支。
### M5 已弃用 option 字段
- `lib/deterministicTextLayout.ts:61-68`（`punctuationPreferredEm`/`otherGapMaxEm`）：`resolveOptions` 不读；"兼容旧快照"理由不成立（快照序列化不含 options）；测试 `:988` 传参有误导性。
### M6 其他死代码 / 小项
- `EditorHandle.setImageWidth`（`Editor.tsx:107,466`）、`ImageState.src/assetId`（`Editor.tsx:75-76,249-254`）、`EditorPane.initialContent`（`Editor.tsx:130`）均无消费方。
- `App.tsx:330-331` 注释失实（Toolbar 已不接收 imageState）。
- `handleExport` 四个位置布尔参数应改 options 对象：`ExportDialog.tsx:238-243`（典型误读点 `:618`）。
- put 路径双重完整校验：`documentStore.ts:485` + `:394`。
- `findAssetById` 靠数组引用同一性分发语义（传副本即静默失败）：`builtinAssets.ts:57-63`。
- `normalizePageBreakJson` 非 doc 根可返回 `null as T`（潜伏）：`pageBreak.ts:198-202`。
- `materializeBlock` 约 280 行五种职责（`deterministicTypography.ts:1129-1406`），建议随功能改动顺带拆，不单独动。
- `handleEditorUpdate` 闭包新鲜度依赖 Tiptap v3 每渲染刷新 handler 的行为（`App.tsx:670-686`），建议补注释明示。

### M7 App.tsx 拆分路线（2344 → 约 1100 行，低风险五步）
1. `useWriterLease()`（`App.tsx:734-800`，约 70 行，零外部依赖）——第一刀；
2. `useThemeCssVars()`（`:1788-1826`，纯副作用约 40 行）；
3. `useResourceRecovery()`（`:509-548 + 1037-1225 + 1519-1534`，约 300 行；与 applyTheme 共享的 `themeApplyRevisionRef` 以回调 `invalidateThemeApply()` 注入）；
4. `useDraftPersistence()`（约 600 行，收益最大；入参收敛为 editorRef/documentStyleRef/publicationRef + hydrateDocument + writerLeaseState + content 信号）；
5. `runExport()` 纯函数（`:1879-2071`，约 190 行无状态编排）。
不建议现在做：17 个样式 useState 合并 reducer（触碰面太大）。

---

## 四、核验过的放心项（重要，防止重复排查）

- 导出：续写 token 只在弹窗生命周期存活、`completed` 仅在 `close()` 成功后入列、清单一致性（同一 `exportedAt` 重建 plan）、渲染层 `assertPageExportable` + onclone 三重硬校验、离屏 stage finally 必移除。
- 持久化：WAL 生命周期闭环（写前清 v1 → 按 id+recoveryId 精确清除 → 删除先 discard 再 delete）；启动恢复四分支仲裁自洽；写队列串行化覆盖主路径、绕过队列的 put 均先 flush；V1→V2 迁移只读不回写；损坏/未来版本记录跳过不删；quota 有专门处理。
- 引擎：emergency 分级、快照封印、基线偏移上限执行一致；`distributeUniformly` 最小容量封顶是有意取舍；重复 seal 幂等；导出路径 `recalibrateOnLateFonts: false` + seal 顺序正确。
- React：历史快捷键的 stale-closure 防护（`historyShortcutSafetyRef`）是教科书级；`persistDocument` 队列 + 删除等待排空正确；Preview 手势 Escape/pointer capture/卸载还原闭环完整；`documentScrollSync` 纯映射层无发现；ImportDialog 请求失效模式覆盖完整。
- 导入解析全程 escapeHtml、不透传原始 HTML/远程图；`hr.page-break` 根层不变量 JSON/DOM 双路径一致维护。

---

## 五、版本编排

| 版本 | 内容 |
|---|---|
| **v1.8.1 修复版** | R1 fontSize clamp、R2 Canvas fallback fail-closed、R3 中断根因透出、R4 DOMParser、R6 分隔线 `-{3,}`、R8 rafRef 清零、荧光笔默认透明度 50%→25%（ROADMAP P2） |
| **v1.8.2 性能版** | P2+P3 渲染性能三连、P4 WAL 防抖、P6 collectAllCss 缓存；顺手删 M1 死管线、M2 门控分叉。**2026-08-13 已全部实现并完成双轨发布闭环（公告 om_x100b68fef232dca0de2af09d3045f55）**：四门禁全绿（tsc/Vitest 41 文件 412 测试/ESLint/build），真实浏览器自查 23/23（打字/荧光笔/图片选择/12 页打字/撤销重做/双向滚动联动与开关/WAL 三路径/console 0），脚本与截图在 scratchpad/v182；`app/package.json` 已 bump 1.8.2 |
| **v1.9.0** | 字体本地化（原计划）+ P1 DP 求解器 + P5/P7 基线批量化（配 profile） |
| 随功能版顺带 | M7 App.tsx 拆分、M3 hash 合并、R5 打开草稿冗余落盘、其余小项 |
| 待产品拍板 | R7 英文段落 justify 弹性（或明示为产品边界） |
