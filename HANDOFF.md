# 小红书排版编辑器 · Handoff 文档

> 给下一个会话窗口的 Claude 看的项目交接文档。
> **当前进度：Step 2 脚手架完成**（Vite + React + TS + Tailwind v4 + shadcn/ui + Tiptap），最小可运行版本已跑通，等价功能逐步从 `editor.html` 迁过来。
> 最后更新：2026-05-21

> 📌 版本历史由 git 管理：`git log -- HANDOFF.md` 查所有改动；`git show <commit>:HANDOFF.md` 看某次提交时的版本。不需要手动 v1/v2/v3 命名。

---

## 项目位置

```
本地：/Users/a0000/Nutstore Files/Claude_YJ/Scripts-脚本工具集/xhs-poster-小红书排版/
GitHub：https://github.com/l-yanjunnn/xhs-poster-editor （public，main 分支）
React 项目：app/    ← Step 2 的工作目录
```

## 项目目标

一个**小红书风格 9:16 长图排版工具**，给非技术用户开箱即用：
- 写文字 → 选样式 → 一键导出 PNG
- 用户：刘彦君（用户本人）+ 其他需要做小红书内容的非技术人员
- 商业定位：SaaS 工具，**目前阶段 A：纯静态站点**（无登录、无后端）

## 关键设计决策（已拍板，不要推翻）

1. **SaaS 层次**：选了 A（纯静态站点），后续再考虑 B（Supabase）或 C（完整付费 SaaS）
2. **包管理器**：pnpm（不是 npm/yarn/bun）。开发前需 `brew install pnpm`
3. **UI 组件库**：shadcn/ui（Nova preset，Radix UI 底层）。base color = neutral。lib/utils.ts 已写 cn()
4. **CSS 框架**：Tailwind CSS v4（用 @tailwindcss/vite 插件，配置在 src/index.css 的 `@theme` 块里，不再有 tailwind.config.js）
5. **富文本编辑器**：Tiptap 3.x（@tiptap/react + @tiptap/starter-kit），**不要换**
6. **字体方案**：CSS `local()` 优先 + CDN webfont 回退。**不嵌入字体文件**（苹方简因苹果版权也不能嵌；思源宋/黑 OFL 开源但 +20–40MB 不值）
7. **本地字体调用**（用户自定义像素字体等）：拖拽上传 `.ttf/.otf` → FontFace API 注册 → IndexedDB 持久化。**Step 后续做 FontLibrary**
8. **模板功能**：用户验证 MVP 阶段时已删除（保存/恢复不稳定）。重做时必须用扁平 JSON schema + 全状态序列化 + 单测验证 round-trip
9. **画布尺寸**：1080×1920（默认），导出 scale: 2
10. **分页**：手动 `<hr class="page-break">`，后续加自动分页
11. **目录结构**：`editor.html`（旧 MVP，保留参考）+ `assets/`（旧 base64 内置素材）+ `source/`（开发用原图）+ `app/`（React 重构）+ `tools/`（打包脚本）
12. **部署目标**：Cloudflare Pages（Step 8）

## 当前已完成功能（Step 2）

### 顶部全局工具栏（src/components/Toolbar/）
| 控件 | 状态 | 实现 |
|---|---|---|
| 主题预设（宣纸/极简白/深夜黑） | ✅ | `THEMES` 切换时一次性应用整套预设 |
| 叠色 6 档 | ✅ | `OVERLAY_MAP` → CSS var |
| 大标题字体 | ✅ | `DISPLAY_FONTS`，optgroup 分组 + 跨平台 ✓/✗ 标记 |
| 正文字体 | ✅ | `BODY_FONTS` 同上 |
| Logo 策略（每页/首页/首尾/不显示） | ✅ | 单页阶段只区分显/不显 |
| H1 宽度（50%/66%/80%/100%） | ✅ | `--h1-max-width` CSS var |
| 正文字号 5 档（联动 H1/H2/H3） | ✅ | `computeFontSizeVars()` |
| 间距密度 4 档 | ✅ | `DENSITY_MAP` 注入到 :root |

### Tiptap 编辑器（src/components/Editor/Editor.tsx）
- StarterKit（H1/H2/H3、正文、引用、代码块、列表、分隔线、加粗、撤销、重做）
- 屏幕样式与画布同字体族但缩小到 16px 可读字号

### 9:16 画布预览（src/components/Preview/Preview.tsx）
- 缩放 40% 显示，token 完全沿用 editor.html 名字
- 内置宣纸背景 + 猫圈 Logo（`public/builtin-assets/`）
- 空段落用零宽空格撑高度（修复空行不同步问题）

### 文件结构（app/）
```
app/
├── public/
│   └── builtin-assets/
│       ├── bg-xuan-paper.png
│       └── logo-cat-ring.png
├── src/
│   ├── components/
│   │   ├── Editor/Editor.tsx        ← Tiptap + 工具栏
│   │   ├── Preview/Preview.tsx      ← 9:16 画布
│   │   └── Toolbar/Toolbar.tsx      ← 顶部全局选择器
│   ├── lib/
│   │   ├── themes.ts                ← THEMES + OVERLAY_MAP + 选项
│   │   ├── density.ts               ← DENSITY_MAP
│   │   ├── fontSize.ts              ← FS_RATIOS + computeFontSizeVars
│   │   ├── fontPresets.ts           ← 字体下拉列表
│   │   ├── canvas.ts                ← 画布尺寸常量
│   │   ├── builtinAssets.ts         ← 内置背景/Logo 列表
│   │   └── utils.ts                 ← cn()
│   ├── styles/
│   │   ├── canvas.css               ← 画布 + token + 主题 class
│   │   └── editor.css               ← Tiptap 屏幕样式
│   ├── App.tsx                      ← 主应用，state → CSS vars
│   ├── main.tsx
│   └── index.css                    ← Tailwind v4 + shadcn neutral 主题
├── index.html                       ← Google Fonts + LXGW + Inter CDN
├── components.json                  ← shadcn 配置
├── package.json                     ← React 19 / Tiptap 3 / Tailwind 4
├── tsconfig.{json,app.json,node.json}
└── vite.config.ts                   ← @tailwindcss/vite + @/ alias
```

## Step 2 中遇到的坑（避免下个会话重踩）

1. **pnpm 启动时卡在 deps check**：msw（shadcn nova preset 拉来的）有 ignored build script，导致 `pnpm dev` 在 install check 阶段失败。**绕过方法**：直接 `./node_modules/.bin/vite` 启动。**长期方案**：跑 `pnpm approve-builds` 选 msw，或者改 package.json 加 `pnpm.onlyBuiltDependencies`
2. **TS 6 废弃了 `baseUrl`**：paths 别名直接写 `"@/*": ["./src/*"]`，不要加 baseUrl
3. **shadcn Nova preset 是完整 landing 模板**：会生成 App.tsx + App.css 示例和 src/assets/，需要手动清掉。也没自动生成 lib/utils.ts，得自己补
4. **Tiptap 空段落 `<p></p>` 在画布上高度为 0**：CSS 加 `.content p:empty::before { content: '​' }` 和 `min-height: calc(var(--fs-body) * var(--lh-body))` 撑高度

## 用户偏好（重要）

- **行为准则**：诚实优先、不偷懒、做不到直说，先查自身再考虑外部因素
- **响应风格**：简短直接，不要冗长解释
- **决策方式**：用 AskUserQuestion 给出选项，**第一个标推荐**
- **代码风格**：写中文注释解释 WHY，不写 WHAT
- **测试**：UI 改动后用 Playwright MCP 截图，自己先看一眼再让用户验证
- **不要做的事**：不要做用户未要求的功能；不要为「以后可能用得上」加抽象层；不要瞎补 try/catch；不要写没人看的 README
- **打包/分发优先级低**：用户当前在做开发，先不操心 `tools/package-for-share.sh` 等分发产物
- **终端统一使用 iTerm2**

## 开发命令速查

```bash
cd app
./node_modules/.bin/vite              # 启动 dev server（绕过 pnpm 的 deps check）
./node_modules/.bin/tsc -b            # 类型检查
pnpm dlx shadcn@latest add <comp>     # 加 shadcn 组件（button/dialog/select 等）
pnpm add <pkg>                        # 加依赖（pnpm 本体没问题）
```

## 下一步候选（按用户提到的优先级，未拍板）

1. **素材库 Modal**：用户上传自定义背景/Logo，存 IndexedDB（最贴近原版功能缺口）
2. **字体库**：拖拽上传 `.ttf/.otf` → FontFace API → IndexedDB 持久化（之前讨论的需求）
3. **分页符 → 多页画布**（Step 6）：Tiptap 加自定义 HorizontalRule 扩展（class=page-break），App 层 splitIntoPages
4. **shadcn Select 替换原生 select**：视觉打磨
5. **导出 PNG zip**（Step 7）：html2canvas + jszip，导出前调 `document.fonts.ready` 等字体加载完
6. **部署 Cloudflare Pages**（Step 8）

## 新会话开场建议

```
我在接手一个小红书排版编辑器项目（Vite + React + TS + Tailwind v4 + shadcn/ui + Tiptap），之前的会话上下文太长开了新窗口。
请先读 HANDOFF.md 了解全部背景：

/Users/a0000/Nutstore Files/Claude_YJ/Scripts-脚本工具集/xhs-poster-小红书排版/HANDOFF.md

读完后我们继续做下一步——我会告诉你想做「下一步候选」里的哪一项。
```

## 不要做的事

- ❌ 不要重写 `editor.html`（旧 MVP，保留作参考）
- ❌ 不要做用户没要求的功能（YAGNI）
- ❌ 不要装 Tiptap 之外的富文本编辑器
- ❌ 不要碰 `source/` 的原图，只读
- ❌ 不要修改旧版 `assets/builtin-assets.js`（旧 MVP 用的 base64 嵌入版本，React 重构不用了）
- ❌ 不要重新装 npm/yarn，统一 pnpm
- ❌ 不要尝试用 `pnpm dev` 启动（被 msw 卡），用 `./node_modules/.bin/vite`
