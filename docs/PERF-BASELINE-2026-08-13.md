# 性能基线（2026-08-13）— v1.9.0 P1/P5/P7 优化 before 数据

> **这是 v1.9.0 三项引擎优化（P1 DP 断行求解器、P5 导出基线校准逐 atom 写读交替、P7 基线 probe 未按 (font, lineHeight) 去重，编号见 `docs/CODE-REVIEW-2026-08-13.md` §二）优化前的 before 基线。优化后用同一脚本复跑对比。**
>
> - before 代码基线：git commit `1a2ea19`（v1.8.2）
> - 机器环境：Apple M1 Max / macOS 26.1 / Node v24.13.0 / Python 3.9.6 + Playwright 1.57.0（headless Chromium）
> - 基准脚本：`tools/perf/solver-bench.mjs`（P1 微基准）、`tools/perf/browser-baseline.py`（真实浏览器打字/导出）

---

## 一、P1 断行求解器微基准（node 侧）

**测法**：`tools/perf/solver-bench.mjs` 直接对 `solveDeterministicTextLayout`（`app/src/lib/deterministicTextLayout.ts`，零依赖纯函数）计时，Node 24 原生 strip-types 直接 import `.ts`。输入 atom 用生产同款 `classifyLayoutGrapheme` 分类；参数向 `deterministicTextLayout.test.ts` 真实用法看齐：justify（默认 `justifyWrappedLines=true`）、版心 888px、字号 44（em=advance=44px，标点 ink 取该测试文件里 Chromium+Noto Sans SC 的实测值等比放大）。行高 1.85 不进求解器（它只解宽度方向）。求解器不碰 Canvas/DOM，node 数字只反映算法开销，与浏览器内相对比例一致。

**轮数说明**：优化前 2000 字单轮已达 ~7 分钟，跑满 20 轮需数小时，故该 case 降为 n=3（warmup 1）如实标注；其余 case n≥20。100/500 字样本内部方差极小（p95/median ≈ 1.04），n=3 的中位数仍可信。

### before（`1a2ea19`，2026-08-13 本机实测）

| case | atoms | 断出行数 | median | p95 | 轮数 |
|---|---|---|---|---|---|
| 中文段落 ~100 字 | 100 | 5 | **67.10 ms** | 78.46 ms | n=30, warmup=5 |
| 中文段落 ~500 字 | 500 | 24 | **6 593.44 ms** | 6 862.52 ms | n=20, warmup=2 |
| 中文段落 ~2000 字 | 2000 | 94 | **428 401 ms（≈7.1 分钟）** | 430 132 ms | n=3, warmup=1 |
| 中英混排 ~500 字素 | 500 | 15 | **2 824.43 ms** | 2 941.24 ms | n=20, warmup=2 |

超线性增长明显（100→500 字：~98×；500→2000 字：~65×），与 CODE-REVIEW §二 P1 的四个机理（候选对 O(n²) 无提前终止、同一候选重复求解 2–3 遍、未入选候选急切物化、尾部 O(n) 拷贝）一致。

### after（P1 求解器优化，v1.9 实施会话复跑，日志 `tools/perf/solver-bench-after-p1.log`）

| case | median | p95 | vs before |
|---|---|---|---|
| 中文段落 ~100 字 | 15.08 ms | 20.43 ms | ~4.4× |
| 中文段落 ~500 字 | 74.13 ms | 75.42 ms | ~89× |
| 中文段落 ~2000 字 | 307.46 ms | 309.88 ms | ~1 393× |
| 中英混排 ~500 字素 | 71.52 ms | 75.73 ms | ~39× |

断出行数与 before 完全一致（5/24/94/15）。**等价性验证**：由 v1.9 实施会话执行的新旧实现输出差分，6 组语料全部 bytesEqual + hashEqual（该验证在实施会话完成，本文档转述其结论；本会话核实了 after 日志原件在 `tools/perf/solver-bench-after-p1.log`）。

---

## 二、真实浏览器基线（headless Chromium，本地 vite preview，before 构建）

**测法**：`tools/perf/browser-baseline.py`。构建 `1a2ea19` 的 dist 起 `vite preview`（本次实测端口 4175），Playwright headless Chromium 打开默认 5 页使用教程文档。所有页面内插桩仅经 `page.evaluate` 注入（rAF 时间戳 + 捕获阶段 beforeinput 监听），不落盘到源码。

⚠️ 浏览器侧 **after 数字尚未采集**——本表全部为 before；优化上线后用同一脚本对新构建复跑。

### 打字帧延迟（P1 编辑热路径）

点进 Tiptap 正文末尾，`keyboard.type` 逐字输入 30 个中文字符（键间隔 120ms）；每次击键的延迟 = 捕获阶段 beforeinput 时间戳到下一个 rAF 回调的间隔（即该键同步 reflow 把帧阻塞了多久）。CJK 输入走 insertText、无 keydown，故以 beforeinput 为击键标记。

| 场景 | 样本 | median | p95 | max |
|---|---|---|---|---|
| 5 页教程文档 | 30 击键 | **101.5 ms** | 111.5 ms | 123.4 ms |
| 11 页长文档（教程 + 插入分页撑长） | 30 击键¹ | **382.4 ms** | 457.4 ms | 460.7 ms |

¹ 长文档轮次原始样本 n=60：测量注入脚本二次 evaluate 导致每击键被两个重复监听各记一次（两条时间戳相差微秒级），有效击键 30 次，median/p95 不受影响。

交叉验证：5 页场景另有三次独立运行——本会话两次与 solver-bench 同机并行（102.5/112.6、104.7/119.5）、主会话一次重复运行（105.0/114.4，日志 `tools/perf/browser-baseline-before.log`）——与无争抢的 101.5/111.5 一致，说明并行争抢对该数字影响 <5%。

60fps 帧预算 16.7ms：before 状态 5 页文档每次击键已丢 ~6 帧，11 页文档丢 ~23 帧。

### 导出耗时（P5/P7 导出基线校准热路径）

UI 走真实导出：导出 PNG → 选兼容 ZIP（init script 置 `showSaveFilePicker=undefined`，对齐 `tools/export-race-repro/test_v170_import_export_ui.py` 的可观测 download 套路）→ 点「导出全部 5 张」。默认教程文稿会触发排版预检 warning（第 3 页两行超限，教程内容自带，非测量伪影；预检本身 48ms），故实际触发点是「按当前预览强制导出」，计时从该点击到 browser download 落盘完成。此段覆盖 P5（逐 atom 写读交替强制 reflow）与 P7（基线 probe 未按 (font, lineHeight) 去重）所在的逐页基线校准 + html2canvas 渲染 + ZIP 打包全链路。本项在 solver-bench 退出后无 CPU 争抢时段测得。

| 场景 | 总耗时 | 折合每页 | 产物 |
|---|---|---|---|
| 5 页教程全部导出（兼容 ZIP，2160×3600） | **34 891 ms** | ~7.0 s/页 | ZIP 52.8 MB，console 0 错误 |

---

## 三、复跑方式

```bash
# P1 微基准（node ≥23，直接跑）
node tools/perf/solver-bench.mjs

# 浏览器基线（先构建再起 preview；注意 preview 实际端口输出）
cd app && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build
./node_modules/.bin/vite preview --port 4173 &
python3 -u tools/perf/browser-baseline.py http://localhost:<实际端口>/
# 只测导出：加 --export-only
```

注意事项：轮数配置保持与本文一致（尤其 2000 字 case 的 n=3）再对比；`tools/perf/diagnose-export-dialog.py` 是导出 Dialog 状态诊断脚本，排查导出不触发 download 时用。

---

## 四、after 实测（v1.9.0 实施会话补记，2026-08-13 晚）

实施范围：P1（提前终止 + 链式候选 + 延迟物化）、P5（校准写读分相）、P7（基线 probe 按 (font, line-height, 盒高) 类去重）、R5（纯打开零落盘）。同脚本、同轮数、同机复跑。

### P1 求解器微基准（node 侧，同 solver-bench.mjs）

| case | before median | after median | 加速 |
|---|---|---|---|
| 中文 ~100 字 | 67.1 ms | 15.1 ms | 4.4× |
| 中文 ~500 字 | 6 593 ms | 74.1 ms | 89× |
| 中文 ~2000 字 | 428 401 ms | **307 ms** | **1 393×** |
| 中英混排 ~500 字素 | 2 824 ms | 71.5 ms | 39× |

日志：`tools/perf/solver-bench-after-p1.log`。500→2000 字 after 侧为近线性扩展（74→307 ms）。

**等价性验证**（快照 hash 是「预览=导出」契约核心，故除 417 项单测外另做差分）：从 git HEAD 提取优化前实现，6 组语料（cjk-100/cjk-500/mixed-300/hardNoBreak 短语/单字符/标点密集）新旧求解结果**逐字节相等且 snapshotHash 相等**。

### 浏览器 after（同 browser-baseline.py，构建 index-DHgLkki-）

| 指标 | before | after | 变化 |
|---|---|---|---|
| 打字帧延迟 · 5 页教程 median | 101.5 ms | **83.3 ms** | −18% |
| 打字帧延迟 · 11 页长文档 median | 382.4 ms | **71.2 ms** | **5.4×，长文档打字卡顿消除** |
| 打字帧延迟 · 11 页长文档 p95 | 457.4 ms | 79.2 ms | 5.8× |
| 5 页全部导出（兼容 ZIP） | 34 891 ms | 32 912 / 35 064 / 36 964 ms（3 样本） | 持平（噪声内） |

导出端到端由 html2canvas 光栅化与 ZIP 打包主导，P5/P7 的收益体现在预览/封存路径（计入打字延迟改善），端到端导出时长无显著变化；ZIP 字节数三样本一致（52 796 KB），为输出等价旁证。日志：`tools/perf/browser-baseline-after.log`。

### R5 真实浏览器回归

新建草稿首次落盘 / 纯打开零落盘（revision、updatedAt 均不变）/ 编辑后正常落盘 / 编辑保存后再纯打开零落盘，4 场景全过，console 0。根因补记：Editor 挂载 effect 会在 onUpdate 回调身份变化时重放当前 HTML，旧 handleEditorUpdate 依赖 draftReady 翻转导致重放落在非 hydrating 窗口误标 dirty；已改为读 ref 的恒定身份回调。
