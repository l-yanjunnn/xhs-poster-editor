# v1.9.0「引擎提速版」发布说明

> 2026-08-13。需求源：`docs/CODE-REVIEW-2026-08-13.md` §五版本编排（P1/P5/P7 + 并入 M7/M3/R5）+ 用户 2026-08-13 拍板（教程重写）。性能证据全文见 `docs/PERF-BASELINE-2026-08-13.md`。

## 用户可感知的变化

1. **长文档编辑不再卡**：11 页文档打字帧延迟中位数 382ms → **71ms**（5.4×）；5 页 102ms → 83ms。根源是断行求解器重写（下表）。
2. **全新 5 页使用教程**：默认内容全面更新——覆盖公考·山水卷主题、导入文稿、发布文案卡片、目录导出、滚动联动；修复了旧教程第 3 页自带排版超限、全新用户"导出全部"要走强制导出的问题，现在开箱一键干净导出。
3. **打开草稿不再"看一眼就重排"**：只打开不编辑的草稿不再刷新保存时间，草稿列表顺序不受影响（R5）。
4. **首屏字体请求减重**：LXGW 文楷从包入口 6 份分片 CSS 收敛到实际使用的 2 份（400/700 非 mono）。

## 引擎优化（P1 / P5 / P7）

| 场景 | before | after | 加速 |
|---|---|---|---|
| 求解器 · 中文 100 字 | 67 ms | 15 ms | 4.4× |
| 求解器 · 中文 500 字 | 6 593 ms | 74 ms | 89× |
| 求解器 · 中文 2000 字 | 428 401 ms（7.1 分钟） | 307 ms | **1 393×** |
| 求解器 · 中英混排 500 字素 | 2 824 ms | 72 ms | 39× |

- **P1**：DP 断行求解器三改——按 `model.min` 单调性提前终止候选扫描、候选链式存储（免逐候选数组拷贝）、物化推迟到最优链重建（每行一次）。**等价性验证**：新旧实现对 6 组语料（含 hardNoBreak 短语、标点密集、单字符）逐字节输出相等 + 快照 hash 相等；预览=导出契约不受影响。
- **P5**：导出基线校准写读分相，逐字素 reflow → 整批一次。
- **P7**：基线 probe 按 (font, line-height, 盒高) 类去重，逐字素 → 每块 1–3 个。
- 端到端导出时长持平（≈35s/5 页，html2canvas 光栅化与 ZIP 打包主导）；ZIP 字节数逐样本一致，为输出等价旁证。

## 工程质量（M3 / M7 / R5 根因）

- **M3**：FNV-1a hash 实为 **4 处**拷贝（审查列 3 处，`exportPng.ts` 另有 1 处）+ 毫像素取整 2 处，全部收敛到 `src/lib/stableHash.ts`，单测钉死输出位。
- **M7**：App.tsx 五步拆分完成，2344 → **1286 行**。新增 `useWriterLease` / `useThemeCssVars` / `useResourceRecovery` / `useDraftPersistence` / `runExport`。`hydrateDocument`、`activeDraftRef`、`handleEditorUpdate` 按跨域耦合现实留在 App（文件内有注释）。
- **R5 根因**：Editor 挂载 effect 会在 onUpdate 回调身份变化时重放当前 HTML，旧回调依赖 draftReady 翻转导致重放落在非 hydrating 窗口误标 dirty。已改为读 ref 的恒定身份回调 + 落盘守卫（新建空草稿首次落盘保留）。

## 验证证据

- 四门禁：tsc / **Vitest 42 文件 417 测试**（+5 stableHash）/ ESLint / build 全绿
- 真实浏览器（本地生产构建，headless Chromium）：
  - `test_prod_deep.py`：v1.9.0 构建三主题导出像素 + 用户字体全绿
  - `test_v180_local.py` + `test_v180_longdoc_local.py`：5 页与 19 页滚动联动门禁全绿
  - `test_r5.py`：草稿持久化 5 场景（新建首存 / 纯打开零落盘 ×2 / 编辑落盘）全绿
  - 新教程：5 页 layout issues 全空、导出对话框直通无警告、console 0
- 性能复跑方式与轮数约定见 `docs/PERF-BASELINE-2026-08-13.md` §三

## 明确不包含

- 结构化封面槽位（视觉 demo 已获用户确认方向，另立功能版实施）
- R7 英文长段落 justify 弹性（用户拍板 mark，待真实需求）
- 字体本地化后续刀（npm 化 / Google Fonts 本地化）、跨刷新目录续写等按 ROADMAP 排期
