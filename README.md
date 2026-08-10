# 小红书 9:16 排版编辑器

把文字 + 背景图 + Logo 排成小红书风格的 9:16 长图，一键导出 PNG。

🌐 **线上版（推荐）**：https://xhs-poster-editor.l-yanjunnn.workers.dev

- 开发者/AI 接手：先读 **[HANDOFF.md](HANDOFF.md)**（现状、SOP、坑手册全在那）
- 用户使用说明：**[USAGE.md](USAGE.md)**

## 技术栈

Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Tiptap 3，纯前端无后端。
导出用 html2canvas-pro + jszip；用户数据（素材/字体/主题）存浏览器 IndexedDB。

## 目录结构

```
├── app/                  ← React 应用（工作目录）
├── HANDOFF.md            ← 交接文档（接手必读）
├── wrangler.jsonc ci.sh  ← Cloudflare Workers 部署配置
├── tools/export-race-repro/  ← 导出回归验证脚本
├── editor.html demo.html assets/  ← 旧单文件 MVP，只读参考，不再维护
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

## 部署

`git push origin main` → Cloudflare 自动 build + deploy，1–3 分钟上线。
不需要（也不要）去 Cloudflare 后台操作。

⚠️ 改了导出路径的代码，上线后必须在 prod URL 上实测（本地 preview 复现不了 prod 的导出 bug，详见 HANDOFF §5）。
