# 导出 PNG 回归验证脚本

历史背景：导出 PNG 曾有 html2canvas-pro 引发的 race / CSS 失效 bug，历经 v1~v8 八轮修法，
v8（离屏渲染 + onclone 注入全量 CSS）已根治。完整战史见 `HANDOFF.md` §5。

**这些脚本现在的用途**：改动导出路径（exportPng.ts / canvas.css / Preview）后的**回归验证**。

## 三个脚本

### `test_prod.py` ⭐ 部署后必跑
直接命中 Cloudflare prod URL（走系统 proxy 模拟真实跨网络），多轮导出，dump 每张 PNG 尺寸。

```bash
# 前提：macOS 上有 proxy 跑在 127.0.0.1:7897（如 ClashX）
python3 tools/export-race-repro/test_prod.py
```

坏图特征：非 2160×3840 尺寸，或角落像素 alpha=0（CSS 未应用）。判断用像素采样，别肉眼看图。

### `test_slow_local.py` 本地慢网络模拟
先起 `cd app && ./node_modules/.bin/vite preview --port 4173 --strictPort`，脚本用 playwright route 给素材加 800ms 延迟。复现力弱于 prod。

### `verify_export_bug.py` 本地快网络 sanity check
最简单的 localhost 多轮导出 + 尺寸校验，确认代码至少能跑。

## 回归验证工作流（改导出代码后）

1. 本地三连（tsc / vitest / build）+ `verify_export_bug.py` sanity check
2. `git push origin main`，等 Cloudflare deploy（~3 分钟）
3. 跑 `test_prod.py`：**必须覆盖极简白 / 深夜黑**（纯 CSS 背景主题，CSS 失效立刻暴露；雅致有背景图会掩盖问题）
4. 全绿后让用户在自己浏览器实测一次

⚠️ 铁律：**本地通过 ≠ prod 通过**。v1~v7 每一轮都是本地全绿、prod 翻车。只有 prod URL 实测才算数。
