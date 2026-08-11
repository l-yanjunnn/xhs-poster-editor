# 小红书 9:15 排版编辑器

把文字 + 背景图 + Logo 排成小红书风格的 9:15（3:5）全屏长图，一键导出 2160×3600 PNG。

🌐 **当前线上版 v1.7.0**：

- Cloudflare：https://xhs-poster-editor.l-yanjunnn.workers.dev
- 大陆通道：https://xhsposter.tshzchen.cn

✅ **v1.7.0 已于 2026-08-11 完成双轨正式发布**：发布提交/tag 为 `87a2d89` / `v1.7.0`；Cloudflare 与大陆通道已加载同一构建，并通过生产导入与导出回归。

v1.7.0 在顶栏增加「导入文稿」：可导入 Markdown / 纯文本，先覆盖式确认结构、页数与发布文案，再生成一个普通、可继续手动编辑的新草稿。发布文案独立保存在右栏，不混入图片正文，也不会自动复制或增加“上/下篇”。正文段落改为适合中文的两端对齐，标题不强制拉伸。

普通图文单篇上传兼容线集中配置为 18 张：1–17 张提示可作为一篇发布，18 张提示达到当前上限，19+ 仍完整生成、完整编辑并允许一次导出。支持全部导出、自选页码范围和缩略图多选；优先写入一个独立文件夹，不支持目录写入时回退为一个兼容 ZIP，不按 18 张分包。

V1.5 的「公考·山水卷」双底图主题继续保留：第 1 页自动使用 Cover，第 2 页起使用 Inner；封面主/副标题可分别调整 HEX 色值。正文工具栏全部两行常驻，列表内插入分页会保持正确页数与连续序号；H2 竖线和有序列表序号按实际字体的可见字形自动中线对齐。

- 开发者/AI 接手：先读 **[HANDOFF.md](HANDOFF.md)**（现状、SOP、坑手册全在那）
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
