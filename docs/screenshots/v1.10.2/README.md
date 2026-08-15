# v1.10.2 目检与回归材料

> 状态：v1.10.2 已于 2026-08-16 完成双轨发布。发布提交/tag 为 `0b2d6468c9f8aa4db9cdf6d88533b7eaff47f267` / `v1.10.2`；本目录保留发布前用户目检时看过的图片。

| 文件 | 目检重点 |
|---|---|
| `01-dialog-cta-1366x650.png` | 1366×650 视口中的弹窗裁切图：头部和底部 CTA 固定可见，中间结果区独立滚动 |
| `02-continuation-terminal.png` | 公考主题跨页续段：上一页末行铺满版心 |
| `03-true-paragraph-terminal.png` | 公考主题真段尾对照：保持自然左对齐，不被误拉满 |
| `04-code-block-canvas.png` | 公考主题画布：长中文、URL、无断点 token 与手工空白均在 Code 块内换行 |
| `05-code-block-export.png` | 公考主题 PNG 导出对照（原始回归产物 2160×3600，此处缩为 600×1000 便于审阅） |
| `06-code-block-dark-canvas.png` | 深夜黑旧主题画布回归 |
| `07-code-block-dark-export.png` | 深夜黑 PNG 导出对照（原始回归产物 2160×3600，此处缩为 600×1000） |

自动化几何证据：续段末行 `right=target=840`、`residual=0`；真段尾 `777.2 < 888`，旧主题真段尾 `697.2 < 920`。本地 Chromium 回归均为 0 console/page error。

上线后，Cloudflare 与大陆通道均通过 `test_prod_deep.py`、低视口弹窗、跨页续段和 Code 块换行回归。两个入口加载同一份 JS/CSS 构建。

可重复运行的脚本位于：

- `tools/export-race-repro/test_v1102_dialog_viewport.py`
- `tools/export-race-repro/test_continuation_local.py`
- `tools/export-race-repro/test_continuation_prod.py`
- `tools/export-race-repro/test_code_block_wrap_local.py`
- `tools/export-race-repro/test_code_block_wrap_prod.py`
