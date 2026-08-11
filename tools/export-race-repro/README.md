# 导出 PNG 回归验证脚本

历史背景：导出 PNG 曾有 html2canvas-pro 引发的 race / CSS 失效 bug，历经 v1~v8 八轮修法，
v8（离屏渲染 + onclone 注入全量 CSS）已根治。完整战史见 `HANDOFF.md` §5。

**这些脚本现在的用途**：改动导出路径（exportPng.ts / canvas.css / Preview）后的**回归验证**。

## 主要脚本

### `test_v170_import_export_ui.py` ⭐ v1.7 导入到完整 ZIP 的本地/生产 UI 门禁

使用全新 Chromium context，只通过用户可见 UI 依次导入 18 页与 19 页示例，检查精确上限文案、完整页数和单草稿生成。随后显式选择兼容 ZIP，用真实浏览器 download 下载 19 页，断言唯一顶层目录、`01..19` PNG 无丢页/重复且均为 2160×3600，以及《导出清单.json》的 `sourcePages` 为 `1..19`。运行时会禁用 native save picker，并把 page error / console error 纳入失败条件。

```bash
# 本地：先启动 Vite
cd app
./node_modules/.bin/vite --host 127.0.0.1 --port 4174 --strictPort

# 回到仓库根目录
python3 tools/export-race-repro/test_v170_import_export_ui.py \
  http://127.0.0.1:4174/ v1.7.0

# 生产（如需代理）
python3 tools/export-race-repro/test_v170_import_export_ui.py \
  https://example.com/ v1.7.0 --proxy http://127.0.0.1:7897
```

`URL` / `EXPECTED_VERSION` / `PLAYWRIGHT_PROXY` 也可用同名环境变量传入；默认下载与 `result.json` 保存到 `/tmp/xhs-v170-import-export-ui/<UTC 时间>/`。

### `test_v140_local.py` ⭐ v1.4 桌面交互与可靠性闭环

启动 4174 本地 Vite server 后，覆盖 1536 / 1440 / 1280 三栏布局、图片无移动不提交、缩放/对齐单次 undo-redo、第二页 `imageId` 映射、Esc 回滚、图片键盘可达性、资源同步后的 undo 边界、草稿切换历史隔离、荧光笔 50% / 0% / 100% 与固定基色、辅助层隔离，以及缺图导出预检的「重新检查 / 仍然导出」。脚本使用全新浏览器 context，布局截图写入 `/tmp/xhs-v140-rc/`。

```bash
cd app
./node_modules/.bin/vite --host 127.0.0.1 --port 4174 --strictPort

# 回到仓库根目录
python3 tools/export-race-repro/test_v140_local.py http://localhost:4174/
```

### `test_v130_local.py` ⭐ v1.3 本地候选闭环

启动本地 Vite dev server 后，覆盖 9:15/3:4 裁切、导出像素、异常空格、短语不拆、草稿立即关闭恢复和双标签页单写入者接管，并把验收图写到 `/tmp/xhs-v130-rc/`。

```bash
python3 tools/export-race-repro/test_v130_local.py
```

### `test_prod.py` ⭐ 部署后必跑
直接命中 Cloudflare prod URL（走系统 proxy 模拟真实跨网络），多轮导出，dump 每张 PNG 尺寸。

```bash
# 前提：macOS 上有 proxy 跑在 127.0.0.1:7897（如 ClashX）
python3 tools/export-race-repro/test_prod.py
```

坏图特征：非 2160×3600（9:15）尺寸，或角落像素 alpha=0（CSS 未应用）。判断用像素采样，别肉眼看图。

### `test_slow_local.py` 本地慢网络模拟
先起 `cd app && ./node_modules/.bin/vite preview --port 4173 --strictPort`，脚本用 playwright route 给素材加 800ms 延迟。复现力弱于 prod。

### `verify_export_bug.py` 本地快网络 sanity check
最简单的 localhost 多轮导出 + 尺寸校验，确认代码至少能跑。

`test_prod_deep.py` 是生产环境的扩展深度回归，普通发版先跑 `test_prod.py`，出现可疑结果或改动导出机制时再补跑。

## 回归验证工作流（改导出代码后）

1. 本地三连（tsc / vitest / build）+ `verify_export_bug.py` sanity check
2. `git push origin main`，等 Cloudflare deploy（~3 分钟）
3. 跑 `test_prod.py`：**必须覆盖极简白 / 深夜黑**（纯 CSS 背景主题，CSS 失效立刻暴露；雅致有背景图会掩盖问题）
4. 全绿后让用户在自己浏览器实测一次

⚠️ 铁律：**本地通过 ≠ prod 通过**。v1~v7 每一轮都是本地全绿、prod 翻车。只有 prod URL 实测才算数。
