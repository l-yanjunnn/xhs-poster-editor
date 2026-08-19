# 小红书 9:15 排版编辑器

把文字 + 背景图 + Logo 排成小红书风格的 9:15（3:5）全屏长图，一键导出 2160×3600 PNG。

🌐 **当前线上版 v1.11.0**：

- Cloudflare：https://xhs-poster-editor.l-yanjunnn.workers.dev
- 大陆通道：https://xhsposter.tshzchen.cn

✅ **v1.11.0「封面副标题微排版」已于 2026-08-19 完成双轨正式发布**：发布提交/tag 为 `5c6ccf928fcb8c9b5f5b273a95005e86f3c70c32` / `v1.11.0`。右侧「封面版式」新增副标题字距「紧凑 / 标准 / 舒展」三档，只作用于首图封面副标题。普通与居中版式的紧凑 / 舒展为 `0em / 0.08em`，小字在上大字在下（kicker）为 `0.10em / 0.26em`；标准档不新增覆盖，完整继承 v1.10.2 视觉。右栏「H1 宽度」同时澄清为「全篇 H1 宽度」，行为与左侧 H1 编辑入口均未改变。两入口版本与静态资源一致，真实 Chrome、2160×3600 PNG 深回归及 3 版式×3 档矩阵全部通过；完整记录见 [`docs/RELEASE-v1.11.0.md`](docs/RELEASE-v1.11.0.md)。

✅ **v1.10.2 已于 2026-08-16 完成双轨正式发布**：发布提交/tag 为 `0b2d6468c9f8aa4db9cdf6d88533b7eaff47f267` / `v1.10.2`。Cloudflare 与大陆通道加载同一构建，两个入口的深度回归、低视口弹窗、跨页续段和 Code 块换行检查全部通过。

v1.10.0–v1.10.2 合并更新了三组用户可见功能：「公考·山水卷」封面可选三种版式和上/中/下三档位置；删除最后一份草稿后会回到完整的 5 页教程；矮视口弹窗、跨页续段对齐和 Code 块长行裁切问题已修复。合并发布说明见 [`docs/RELEASE-v1.10.2.md`](docs/RELEASE-v1.10.2.md)。

v1.7.2 于 2026-08-12 完成双轨发布：发布提交/tag 为 `3c4f567` / `v1.7.2`；Cloudflare 与大陆通道加载同一构建，并通过生产导入与导出回归。

v1.7.2 将预览与 PNG 导出改为共享同一份确定性行级快照；中文标点按相邻字形的实际可见墨迹求解左右净空，双引号、冒号、顿号和连续标点不再依赖固定半字宽或单侧压缩，行末按可见右缘透明悬挂；汉字与数字/拉丁边界、统一汉字残差、混排基线、列表序号和逐行装饰都由可测量的布局层生成。字体、基线或几何预检失败时会阻止导出并明确提示。验收材料见 [`docs/v1.7.1/V1.7.1-VALIDATION.md`](docs/v1.7.1/V1.7.1-VALIDATION.md)。

v1.7.0 在顶栏增加「导入文稿」：可导入 Markdown / 纯文本，先覆盖式确认结构、页数与发布文案，再生成一个普通、可继续手动编辑的新草稿。发布文案独立保存在右栏，不混入图片正文，也不会自动复制或增加“上/下篇”。正文段落改为适合中文的两端对齐，标题不强制拉伸。

普通图文单篇上传兼容线集中配置为 18 张：1–17 张提示可作为一篇发布，18 张提示达到当前上限，19+ 仍完整生成、完整编辑并允许一次导出。支持全部导出、自选页码范围和缩略图多选；优先写入一个独立文件夹，不支持目录写入时回退为一个兼容 ZIP，不按 18 张分包。

V1.5 的「公考·山水卷」双底图主题继续保留：第 1 页自动使用 Cover，第 2 页起使用 Inner；封面主/副标题可分别调整 HEX 色值。正文工具栏全部两行常驻，列表内插入分页会保持正确页数与连续序号；H2 竖线和有序列表序号按实际字体的可见字形自动中线对齐。

- 开发者/AI 接手：先读 **[HANDOFF.md](HANDOFF.md)**（现状、SOP、坑手册全在那）
- 后续迭代与已 Mark 需求：**[docs/ROADMAP-2026-08-12.md](docs/ROADMAP-2026-08-12.md)**
- 用户使用说明：**[USAGE.md](USAGE.md)**

## 技术栈

Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Tiptap 3，纯前端无后端。
导出用 html2canvas-pro + jszip；用户数据（草稿/发布文案/素材/字体/主题）存浏览器 IndexedDB。

## 目录结构

```
├── app/                  ← React 应用（工作目录）
├── HANDOFF.md            ← 交接文档（接手必读）
├── wrangler.jsonc ci.sh  ← Cloudflare Workers 部署配置
├── tools/                ← 部署（deploy-oss.sh）/ 归档（archive-release.sh）/ 回归脚本
├── archive/              ← 版本归档：每版 dist 核心快照 + 旧单文件 MVP（永不覆盖）
└── source/               ← 内置素材原图，只读
```

## 开发

```bash
cd app
./node_modules/.bin/vite          # dev server（不要用 pnpm dev，见 HANDOFF §6）
./node_modules/.bin/tsc -b        # 类型检查
./node_modules/.bin/vitest run    # 单测
./node_modules/.bin/vite build    # 构建
```

## 部署（双轨，每版都要推全）

- 轨一（海外）：`git push origin main` → Cloudflare 自动 build + deploy，1–3 分钟上线
- 轨二（大陆）：`bash tools/deploy-oss.sh` → 阿里云 OSS+CDN（https://xhsposter.tshzchen.cn）

不需要（也不要）去 Cloudflare 后台操作。

⚠️ 改了导出路径的代码，上线后必须在 prod URL 上实测（本地 preview 复现不了 prod 的导出 bug，详见 HANDOFF §5）。
