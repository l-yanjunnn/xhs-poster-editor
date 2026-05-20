# 小红书排版编辑器 · Handoff 文档

> 给下一个会话窗口的 Claude 看的项目交接文档。
> 当前进度：MVP 完成（editor.html 单文件版），准备进入 Step 2（React + Vite 重构）。
> 最后更新：2026-05-20

---

## 项目位置

```
本地：/Users/a0000/Nutstore Files/Claude_YJ/Scripts-脚本工具集/xhs-poster-小红书排版/
GitHub：https://github.com/l-yanjunnn/xhs-poster-editor （public，main 分支）
```

## 项目目标

一个**小红书风格 9:16 长图排版工具**，给非技术用户开箱即用：
- 写文字 → 选样式 → 一键导出 PNG
- 用户：刘彦君（用户本人）+ 其他需要做小红书内容的非技术人员
- 商业定位：SaaS 工具，**目前阶段 A：纯静态站点**（无登录、无后端）
- 给别人用的方式：打包整个文件夹发送，对方双击 `editor.html` 即用

## 关键设计决策（已拍板，不要推翻）

1. **SaaS 层次**：选了 A（纯静态站点），后续再考虑 B（Supabase）或 C（完整付费 SaaS）
2. **编辑器形态**：用户最初要 WYSIWYG，MVP 阶段先用 contenteditable + execCommand 顶上。**Step 2 重构时切到 Tiptap**
3. **字体方案**：B（CDN webfont）。Google Fonts + jsDelivr 镜像加载，跨平台一致。**不嵌入字体文件**
4. **模板功能**：用户验证后**已删除**（保存/恢复不稳定）。**Step 2 重做模板时必须用扁平 JSON schema + 全状态序列化 + 单测验证 round-trip**
5. **画布尺寸**：1080×1920（默认），导出 scale: 2
6. **分页**：手动 `<hr class="page-break">`。Step 6 加自动分页
7. **目录结构**：`editor.html`（主）+ `assets/builtin-assets.js`（base64 内置素材）+ `source/`（开发用原图）+ `tools/`（打包脚本）
8. **打包分发**：跑 `tools/package-for-share.sh` 在桌面生成 zip

## 当前已完成功能

| 功能 | 实现位置 | 状态 |
|---|---|---|
| 9:16 画布渲染 | `editor.html` 的 `.page` | ✅ |
| contenteditable 富文本编辑 | `editor.html` 的 `.editor` | ✅ |
| 工具栏：H1/H2/H3/正文/引用/代码/列表/分隔/分页符/加粗/撤销 | `.editor-toolbar` | ✅ |
| 实时预览 + 缩放 40% 显示 | `renderPreview()` | ✅ |
| 主题预设（宣纸/极简白/深夜黑）| `THEMES` 对象 + `applyTheme()` | ✅ |
| 叠色（盖背景图保证可读）| `applyOverlay()` | ✅ |
| Logo 策略（每页/首页/首尾/不显示）| `logoFor()` | ✅ |
| H1 宽度（50%/66%/80%/100%）| `--h1-max-width` | ✅ |
| 正文字号（5 档，联动 H1/H2/H3）| `applyFontSize()` + `FS_RATIOS` | ✅ |
| 间距密度（紧凑/标准/宽松/超宽松）| `applyDensity()` + `DENSITY_MAP` | ✅ |
| 字体选择器（webfont 跨平台）| `select-font-display/body` | ✅ |
| 素材库 Modal（背景/Logo 增删查）| `openLibrary()` + `renderLibrary()` | ✅ |
| 内置素材 base64 嵌入 | `assets/builtin-assets.js` | ✅ |
| 导出 PNG zip（文件名 + 选保存路径）| `exportAllPages()` | ✅ |

## 已知问题 / 已删除功能

| 问题 | 原因 | 处理 |
|---|---|---|
| 模板保存不还原（"假模板"）| `currentTemplate()` 漏存 bgSrc/logoSrc，UI 下拉框不同步 | **已删除整个模板模块**。Step 4 重做 |
| 字体在 Windows 上回退 | macOS 系统字 PingFang/Songti Windows 没有 | 主推 webfont（Noto Serif/Sans SC、霞鹜文楷、站酷、马善政、龙藏），下拉标注「跨平台 ✓/✗」 |
| Google Fonts 国内偶尔慢 | CDN 不稳 | 备用：jsDelivr fontsource 镜像（未实施，遇到再换）|
| `text-wrap: pretty` 导致 H1 看似只占 50% | 浏览器为了避免末行孤儿主动缩短每行 | 已去掉 |

## 文件结构

```
xhs-poster-小红书排版/                    总 2.9MB
├── editor.html                ← 主编辑器（双击即用，~50KB）
├── demo.html                  ← Step 1 静态参考（可忽略）
├── README.md                  ← 开发者文档
├── USAGE.md                   ← 用户使用说明（打包时一起发）
├── HANDOFF.md                 ← 本文档
│
├── assets/
│   └── builtin-assets.js      ← 内置素材 base64（676KB）
│
├── source/                    ← 开发用原图（不发给用户）
│   ├── bg-xuan-paper.png      宣纸背景
│   └── logo-cat-ring.png      猫圈 Logo
│
└── tools/
    ├── update-builtin-assets.sh  ← 添加内置素材后跑
    └── package-for-share.sh      ← 一键打包到桌面
```

## 用户偏好（重要）

- **行为准则**：诚实优先、不偷懒、做不到直说，先查自身再考虑外部因素
- **响应风格**：简短直接，不要冗长解释
- **决策方式**：用 AskUserQuestion 给出选项，**第一个标推荐**
- **代码风格**：写中文注释解释 WHY，不写 WHAT
- **测试**：UI 改动后用 `open` 命令打开浏览器让用户验证
- **不要做的事**：不要做用户未要求的功能；不要为「以后可能用得上」加抽象层；不要瞎补 try/catch；不要写没人看的 README

## Step 2 计划（你接下来要做的）

> ⚠️ 在开始前，先**读完 editor.html**，理解所有现有功能，然后用 AskUserQuestion 跟用户确认下面这些点：

### 2.1 技术栈选型
- **推荐**：Vite + React + TypeScript + Tailwind CSS
- 理由：用户最终要做 SaaS，React 生态成熟；Vite HMR 快；TS 防止类型错误（之前的模板 bug 部分就是没类型）
- **不推荐**：Vue（用户更熟悉 React 系？需要确认）、Next.js（静态站点用不上 SSR）

### 2.2 目录结构（建议）
```
src/
├── App.tsx                  ← 主应用，加载主题、提供 Context
├── components/
│   ├── Editor/              ← Tiptap 编辑器
│   ├── Preview/             ← 9:16 画布 + 多页渲染
│   ├── Toolbar/             ← 顶部工具栏（主题/字体/字号/间距等）
│   └── AssetLibrary/        ← 素材库 Modal
├── hooks/
│   ├── useTheme.ts          ← 主题切换 + 持久化
│   ├── usePagination.ts     ← 分页算法（Step 6）
│   └── useExport.ts         ← 导出逻辑
├── lib/
│   ├── themes.ts            ← 主题预设（从 editor.html 迁移）
│   ├── density.ts
│   ├── fontSize.ts
│   └── builtinAssets.ts
└── styles/
    ├── tokens.css           ← 设计 token（CSS 变量）
    └── canvas.css           ← .page 内的 block 样式
```

### 2.3 关键迁移点
- **设计 token CSS 变量保持不变**，只改组件层
- **THEMES 对象搬到 `lib/themes.ts`**，做类型约束
- **素材库**：localStorage → 暂时不动；Step 后期考虑 IndexedDB（解决 5MB 上限）

### 2.4 部署（Step 8）
- **Cloudflare Pages**（推荐）：免费、国内访问稳定、自动 HTTPS
- 或 Vercel：开发体验最好但国内偶尔慢

## TaskList 状态

```
#1. [completed] Step 1: 静态排版验证（demo.html）
#2. [pending]   Step 2: 项目脚手架（Vite + React + TypeScript）  ← 你来做
#3. [completed] Step 3: 字体系统 + 字体选择器
#4. [pending]   Step 4: 模板系统（官方 + 用户）
#5. [completed] MVP 编辑器（editor.html 单文件版）
#6. [pending]   Step 6: 分页算法（段落不跨页）
#7. [pending]   Step 7: 导出 PNG（html2canvas）+ 导出参数面板
#8. [pending]   Step 8: 部署到 Vercel/Cloudflare Pages
#9. [pending]   Step 9: Puppeteer 后端高质量导出（可选）
```

## 新会话开场建议

到新会话窗口后，把这段话发给 Claude：

```
我在接手一个小红书排版编辑器项目，之前的会话上下文太长开了新窗口。
请先读这个项目的 HANDOFF.md 了解全部背景：

/Users/a0000/Nutstore Files/Claude_YJ/Scripts-脚本工具集/xhs-poster-小红书排版/HANDOFF.md

读完之后，我们继续做 Step 2：把 editor.html 重构成 Vite + React + TypeScript 项目。
开始之前请用 AskUserQuestion 跟我确认 2.1 的技术栈选型，特别是 React vs Vue。
```

## 重要：不要做的事

- ❌ 不要从零重写所有功能——把 editor.html 现有逻辑搬过去就行
- ❌ 不要重新做模板功能（除非用户明确要求）
- ❌ 不要为「未来可能需要」加抽象，YAGNI
- ❌ 不要装 Tiptap 之外的富文本编辑器（之前讨论过，Tiptap 已拍板）
- ❌ 不要碰 `source/` 目录的原图，只读
- ❌ 不要修改 `assets/builtin-assets.js`，它是构建产物（要改去改 `tools/update-builtin-assets.sh`）
