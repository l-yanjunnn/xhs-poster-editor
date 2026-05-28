# 导出 PNG 多页 race condition 复现工具

详细背景见 `HANDOFF.md` 的「🚨 待修：导出 PNG 多页串行 race condition」章节。

## 三个脚本

### `test_prod.py` ⭐ 复现 bug 的标准路径
直接命中 Cloudflare prod URL（走系统 proxy 模拟真实跨网络），5 轮导出，dump 每张 PNG 尺寸。坏 PNG 表现为非 2160×3840 尺寸。

```bash
# 前提：用户 macOS 上有 proxy 跑在 127.0.0.1:7897（如 ClashX）
python3 tools/export-race-repro/test_prod.py
```

### `test_slow_local.py` 本地慢网络模拟
启动 `cd app && ./node_modules/.bin/vite preview --port 4173 --strictPort` 后跑。playwright route 拦截 `builtin-assets/*` 加 800ms 延迟。

**注意**：本地慢网络复现性弱于 prod-via-proxy。本会话发现 800ms 延迟下 0/25 PNG 坏，没成功本地复现 race，所以**接手 Claude 不要把"本地通过"当成"prod 通过"**——必须 deploy 后跑 `test_prod.py` 才算真验证。

### `verify_export_bug.py` 本地快网络基线
最简单的 localhost 5 轮导出 + 尺寸校验。用于 sanity check（确认本地代码至少能编译运行）。

## 推荐工作流

1. 先跑 `test_prod.py` 建 baseline，确认能复现 race（坏 PNG > 0）
2. 应用修法（HANDOFF 里的 `width: 1080, height: 1920`）
3. 本地 `verify_export_bug.py` 确保没引入回归
4. `git commit && git push`，等 Cloudflare deploy（~3min）
5. 再跑 `test_prod.py`，确认 0 坏 PNG
6. 让用户在自己浏览器实测一次
