# 小红书 9:15 排版编辑器

把文字 + 背景图 + Logo 排成小红书风格的 9:15（3:5）全屏长图，一键导出 2160×3600 PNG。

🌐 **线上版 v1.4.1**：

- Cloudflare：https://xhs-poster-editor.l-yanjunnn.workers.dev
- 大陆通道：https://xhsposter.tshzchen.cn

V1.4 采用「左侧正文编辑 + 中央成品画布 + 右侧上下文检查器」三栏工作台；图片可直接在中央画布缩放、对齐与磁吸，正文支持固定紫色荧光笔。

- 开发者/AI 接手：先读 **[HANDOFF.md](HANDOFF.md)**（现状、SOP、坑手册全在那）
- 用户使用说明：**[USAGE.md](USAGE.md)**

## 技术栈

Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Tiptap 3，纯前端无后端。
导出用 html2canvas-pro + jszip；用户数据（草稿/素材/字体/主题）存浏览器 IndexedDB。

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
