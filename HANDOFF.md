# 小红书排版编辑器 · Handoff 文档

> 给下一个会话窗口的 Claude 看的项目交接文档。
> **当前进度：Step 10 首图 4:3 适配 + 参考线工具 + 分隔线恢复 + 导出修复 + 默认教程**
> 最后更新：2026-05-28（首页中心 4:3 安全区适配；参考线 toggle；Divider 节点恢复淡虚线；ExportDialog 同名序号记忆 + 60s revoke 防文件损坏；DEFAULT_CONTENT 改成 4 页使用教程）
>
> 🌐 **生产 URL：https://xhs-poster-editor.l-yanjunnn.workers.dev**

## ✅ 已解决（部署后自动好）：dev 环境 file picker 不弹

**素材库 / 字体库的「选择文件」按钮**：dev server 下点击不弹 Finder（拖拽 work），但**生产环境（Cloudflare 部署后）自动正常**。2026-05-24 用户在线上发现 picker 完全可用。

### 可能根因（未实证，按概率排序）

1. 🥇 **React StrictMode 双调用**：dev 下 StrictMode 让 effect/handler 双跑，`input.click()` 被快速触发两次，第二次被浏览器认为不是 user gesture，吞掉 picker。production build 禁用 StrictMode 双调用
2. 🥈 **Vite HMR 客户端干扰**：dev server 注入的 WebSocket client / overlay 在 Radix Portal 层级里干扰 user gesture 时序
3. 🥉 **浏览器扩展拦截 localhost** 上某些 file API

### 教训（重要）

> **dev 行为 ≠ prod 行为**。Radix Portal 这类涉及 DOM 层级 + user gesture 的功能，dev 下卡住时**先 build 一次 production 跑 `pnpm preview` 看是否还卡**——可能根本不是代码问题，而是 dev server 的副作用。

下次类似怪事：先 `cd app && ./node_modules/.bin/vite build && ./node_modules/.bin/vite preview` 复现一遍，再去深挖。

> 📌 版本历史由 git 管理：`git log -- HANDOFF.md` 查所有改动；`git show <commit>:HANDOFF.md` 看某次提交时的版本。不需要手动 v1/v2/v3 命名。

---

## 项目位置

```
本地：/Users/a0000/Nutstore Files/Claude_YJ/Scripts-脚本工具集/xhs-poster-小红书排版/
GitHub：https://github.com/l-yanjunnn/xhs-poster-editor （public，main 分支）
线上：https://xhs-poster-editor.l-yanjunnn.workers.dev （Cloudflare Workers Static Assets）
React 项目：app/    ← Step 2 的工作目录
```

> **以后改代码只需 `git push origin main`，Cloudflare 自动 build + deploy，1-3 分钟后线上更新。不要再去 Cloudflare 后台手动操作。**

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
6. **字体方案**：CSS `local()` 优先 + fontsource npm 包（思源黑/宋全 7 档，2026-05-24 起本地化）+ CDN webfont（ZCOOL/Ma Shan Zheng/Long Cang/LXGW/Inter）回退。**核心字体走 fontsource**（按 unicode-range 分片，浏览器按需拉分片 woff2，不会一次性 +20–40MB；大陆访问稳）。苹方简因苹果版权仍不能嵌
7. **本地字体调用**（用户自定义像素字体等）：拖拽上传 `.ttf/.otf` → FontFace API 注册 → IndexedDB 持久化。**Step 后续做 FontLibrary**
8. **模板功能**：用户验证 MVP 阶段时已删除（保存/恢复不稳定）。重做时必须用扁平 JSON schema + 全状态序列化 + 单测验证 round-trip
9. **画布尺寸**：1080×1920（默认），导出 scale: 2
10. **分页**：手动 `<hr class="page-break">`，后续加自动分页
11. **目录结构**：`editor.html`（旧 MVP，保留参考）+ `assets/`（旧 base64 内置素材）+ `source/`（开发用原图）+ `app/`（React 重构）+ `tools/`（打包脚本）
12. **部署目标**：Cloudflare Workers Static Assets（Pages 2025 后被合并到 Workers）。CI/CD 走 GitHub auto-deploy，build script 是 `bash ci.sh`

## 当前已完成功能

### 顶部全局工具栏（src/components/Toolbar/）
| 控件 | 状态 | 实现 |
|---|---|---|
| 主题（雅致/极简白/深夜黑 + 用户保存） | ✅ | `BUILTIN_THEMES` + IndexedDB 用户主题；shadcn Select 分组下拉；右侧「主题」按钮开 ThemeLibrary Modal |
| 叠色 6 档 | ✅ | `OVERLAY_MAP` → CSS var |
| H1/H2/H3 字体独立 | ✅ | `DISPLAY_FONTS`，shadcn SelectGroup 分组 + 跨平台 ✓/✗ 标记 |
| 正文字体 | ✅ | `BODY_FONTS` 同上 |
| Logo 策略（每页/首页/首尾/不显示） | ✅ | App 按页计算 `shouldShowLogo(i, total)` |
| H1 宽度（50%/66%/80%/100%） | ✅ | `--h1-max-width` CSS var |
| 正文字号 5 档（联动 H1/H2/H3） | ✅ | `computeFontSizeVars()` |
| 间距密度 4 档 | ✅ | `DENSITY_MAP` 注入到 :root |
| 多页画布 + 分页符 | ✅ | Tiptap hr 注入 `class="page-break"`；`splitIntoPages` 切页 |
| 主题库 Modal（含 9:16 真图缩略图） | ✅ | `ThemeLibrary.tsx` + `ThemePreview.tsx` |
| 导出 PNG（含重命名弹窗，单页 PNG / 多页 zip） | ✅ | `ExportDialog.tsx` + `lib/exportPng.ts`（html2canvas-pro + jszip） |

### Tiptap 编辑器（src/components/Editor/Editor.tsx）
- StarterKit（H1/H2/H3、正文、引用、代码块、无序列表、有序列表、分隔线、加粗、撤销、重做）
- 屏幕样式与画布同字体族但缩小到 16px 可读字号

### 9:16 画布预览（src/components/Preview/Preview.tsx）
- 缩放 40% 显示，token 完全沿用 editor.html 名字
- 内置宣纸背景 + 猫圈 Logo（`public/builtin-assets/`）
- 空段落用零宽空格撑高度（修复空行不同步问题）

### 字体库 Modal（src/components/FontLibrary/FontLibrary.tsx）
- 工具栏「大标题」「正文」字体下拉**旁边**的 ⚙ 齿轮按钮触发（不是右上角统一入口）
- 拖拽 ttf/otf/woff/woff2/ttc 上传（⚠️ 「选择字体文件」按钮点击不弹 picker，见顶部「已知 bug」）
- 卡片列表：每张卡用对应 `font-family` 渲染 "AaBb 你好 1234" 样张
- 用户字体走 `lib/fontStore.ts` → IndexedDB（**单独 DB** `xhs-poster-fonts`，store=`user-fonts`）
  - keyPath = `family`，同名上传**直接覆盖**（put 语义）
  - 默认 family = 文件名去后缀
  - **为什么单独 DB**：素材库的 `xhs-poster` DB 已经 v1，加字体 store 就得 bump 版本 + 写 migration。单独 DB 干净，没有依赖
- `lib/fontRegistry.ts` 用 `FontFace API` 注册到 `document.fonts`
  - 内部维护 `Map<family, FontFace>`，重注册时先 `document.fonts.delete(old)` 再 add 新的，避免同 family 出现多个 FontFace
  - `loadAllUserFonts()` 在 App 启动 useEffect 里跑一次，把 IndexedDB 所有字体注册回去
- Toolbar 字体下拉新增「我的字体」optgroup，value = `"${family}", sans-serif`（带 fallback）
- 上传流程：先 `registerFontFromBlob`，失败则不存 IndexedDB（防止存了一个加载不了的坏字体）

### 素材库 Modal（src/components/AssetLibrary/AssetLibrary.tsx）
- 工具栏右侧「素材库」按钮触发
- 双层 Tabs：一级（背景 / Logo / 贴纸）× 二级（内置 / 我的上传）
- 内置素材来自 `lib/builtinAssets.ts`（BUILTIN_BACKGROUNDS/BUILTIN_LOGOS）
- 用户上传走 `lib/assetStore.ts` → IndexedDB（DB_NAME=`xhs-poster`，store=`user-assets`）
  - 存 Blob 原样（不转 base64，节省 33% 体积）
  - 取用时 `URL.createObjectURL()` 给 `<img src>`，带缓存避免内存泄漏
- 拖拽上传（⚠️ 「选择文件」按钮点击不弹 picker，见顶部「已知 bug」）
- 选用后画布同步更新（`setBgSrc` / `setLogoSrc`）
- ~~贴纸 Tab~~ 2026-05-24 已删除：用户暂时不需要画布自由拖放，YAGNI

### 仓库根结构（CI/CD 相关）
```
xhs-poster-小红书排版/
├── wrangler.jsonc              ← Cloudflare Workers 配置（assets directory + SPA fallback）
├── ci.sh                       ← CI build 脚本（绕过 pnpm script runner）
├── package.json                ← 最小根 package.json，含 packageManager 字段
├── .npmrc                      ← frozen-lockfile=false
├── HANDOFF.md                  ← 本文件
├── editor.html                 ← 旧 MVP，保留参考
├── assets/                     ← 旧 base64 内置素材
├── source/                     ← 开发用原图，只读
├── tools/                      ← 打包脚本（暂未启用）
└── app/                        ← React 项目（详见下）
```

### 文件结构（app/）
```
app/
├── public/
│   └── builtin-assets/
│       ├── bg-xuan-paper.png
│       └── logo-cat-ring.png
├── src/
│   ├── components/
│   │   ├── ui/                      ← shadcn 组件（button/dialog/tabs/select）
│   │   ├── Editor/Editor.tsx        ← Tiptap + 工具栏（forwardRef 暴露 setContent/getJSON）
│   │   ├── Preview/Preview.tsx      ← 9:16 画布单页
│   │   ├── Toolbar/Toolbar.tsx      ← 顶部全局选择器（shadcn Select）+ 主题/素材库按钮
│   │   ├── AssetLibrary/AssetLibrary.tsx  ← 素材库 Modal
│   │   ├── FontLibrary/FontLibrary.tsx    ← 字体库 Modal
│   │   ├── ThemeLibrary/ThemeLibrary.tsx  ← 主题库 Modal（Tabs 内置/我的 + 保存表单）
│   │   ├── ThemePreview/ThemePreview.tsx  ← 主题 9:16 真图缩略图
│   │   └── ExportDialog/ExportDialog.tsx  ← 导出 PNG 重命名弹窗
│   ├── lib/
│   │   ├── themes.ts                ← Theme 接口 + BUILTIN_THEMES + OVERLAY_MAP + 选项
│   │   ├── themeStore.ts            ← IndexedDB 用户主题增删查（独立 DB xhs-poster-themes）
│   │   ├── density.ts               ← DENSITY_MAP
│   │   ├── fontSize.ts              ← FS_RATIOS + computeFontSizeVars
│   │   ├── fontPresets.ts           ← 字体下拉列表（内置）
│   │   ├── canvas.ts                ← 画布尺寸常量
│   │   ├── splitPages.ts            ← 按 hr.page-break 切多页（纯函数）
│   │   ├── builtinAssets.ts         ← 内置背景/Logo 列表
│   │   ├── assetStore.ts            ← IndexedDB 用户素材增删查（+ getUserAssetById）
│   │   ├── fontStore.ts             ← IndexedDB 用户字体增删查（独立 DB）
│   │   ├── fontRegistry.ts          ← FontFace API 注册 + 启动加载
│   │   ├── exportPng.ts             ← html2canvas-pro 截图 + jszip 打包 + suggestFilename
│   │   └── utils.ts                 ← cn()
│   ├── styles/
│   │   ├── canvas.css               ← 画布 + token + 主题 class
│   │   └── editor.css               ← Tiptap 屏幕样式
│   ├── App.tsx                      ← 主应用，state → CSS vars + 主题应用/保存
│   ├── main.tsx
│   └── index.css                    ← Tailwind v4 + shadcn neutral 主题
├── index.html                       ← Google Fonts + LXGW + Inter CDN
├── components.json                  ← shadcn 配置
├── package.json                     ← React 19 / Tiptap 3 / Tailwind 4 / Radix + packageManager: pnpm@9.15.0
├── .npmrc                           ← frozen-lockfile=false（CI 兼容用）
├── tsconfig.{json,app.json,node.json}
└── vite.config.ts                   ← @tailwindcss/vite + @/ alias
```

## Step 2 中遇到的坑（避免下个会话重踩）

1. **pnpm 启动时卡在 deps check**：msw（shadcn nova preset 拉来的）有 ignored build script，导致 `pnpm dev` 在 install check 阶段失败。**绕过方法**：直接 `./node_modules/.bin/vite` 启动。**长期方案**：跑 `pnpm approve-builds` 选 msw，或者改 package.json 加 `pnpm.onlyBuiltDependencies`
2. **TS 6 废弃了 `baseUrl`**：paths 别名直接写 `"@/*": ["./src/*"]`，不要加 baseUrl
3. **shadcn Nova preset 是完整 landing 模板**：会生成 App.tsx + App.css 示例和 src/assets/，需要手动清掉。也没自动生成 lib/utils.ts，得自己补
4. **Tiptap 空段落 `<p></p>` 在画布上高度为 0**：CSS 加 `.content p:empty::before { content: '​' }` 和 `min-height: calc(var(--fs-body) * var(--lh-body))` 撑高度
5. **Tailwind v4 preflight 把 `ul/ol` 的 `list-style` 清成 `none`**：所有显示列表的地方都要主动声明 `list-style: disc`（ul）和 `list-style: decimal`（ol），否则有序/无序列表的视觉一模一样。canvas.css 和 editor.css 都要管

## 素材库 Modal 踩到的坑（shadcn 配置问题，未来用 Dialog/Tabs 都会撞）

6. **shadcn `DialogContent` 默认 `max-w-sm` 太窄**：默认 className 含 `sm:max-w-sm`（384px）。传 `max-w-3xl` 无 prefix 被 `sm:` 覆盖。**修法**：传 `sm:max-w-3xl`
7. **shadcn `DialogContent` 是 `display: grid` 但没设 grid-template-columns**：CSS Grid 默认 implicit column 是 `auto`（按 max-content 算），导致内部 `w-full` 失效，子元素按 content 撑开。**修法**：传 `grid-cols-1` 让 cell 占满 1fr
8. **shadcn `Tabs` 的 `data-horizontal:flex-col` 永远不匹配**：tabs.tsx 写的是 `data-horizontal:flex-col`，但 Radix Tabs Root 实际设的属性是 `data-orientation="horizontal"`。这个 Tailwind 选择器在期待 `data-horizontal` 属性，所以**永远不会激活**。结果：Tabs 默认是 `flex row` 而不是 column，TabsList 和 TabsContent 在横向挤压，整个 Modal 内容塌成一团。**修法**：每个 `<Tabs>` 显式加 `className="flex-col"`。**如果以后改 tabs.tsx 源码**，把 `data-horizontal:flex-col` 改成 `data-[orientation=horizontal]:flex-col` 才是治本

## 2026-05-24 下半场新增：Step 6 分页符 + 多页画布 + 主题库

### Step 6：分页符 + 多页画布
- **方案：所有 hr 即分页符**（YAGNI——小红书工具里装饰分隔线用空行就够了）
- `Editor.tsx`：StarterKit 配置 `horizontalRule.HTMLAttributes: { class: 'page-break' }`，所有 hr 自动带 class；工具栏按钮 `setHorizontalRule()` 即插入分页；按钮文案改「↓ 插入分页 ↓」；DEFAULT_CONTENT 加了示例分页让用户一开始就看到效果
- `lib/splitPages.ts`：新建。纯函数，用 DOMParser 把 HTML 按 hr.page-break 切成 `string[]`。边界：空输入 → `['']`；连续分页 → 中间产生空页（保留用户意图，不自动合并）
- `App.tsx`：`pages = useMemo(splitIntoPages(content))`；遍历渲染多个 `<Preview>`；新增 `shouldShowLogo(i, total)` 实现 every/first/first-last/none 四种 Logo 策略
- `Preview.tsx`：单页时隐藏页码角标（pageTotal > 1 才显示 "1 / N"）；接收 `pageIndex/pageTotal` props

### 主题库（替换原本的「主题预设」下拉）
- **概念统一**：没有「模板」这个词，所有「打包好的样式快照」都叫主题
- **数据模型**（`lib/themes.ts`）：扁平 `Theme` 接口含 `id/name/isBuiltin/createdAt + 所有样式字段 + 可选 contentJSON`。**关键设计：只存 `bgAssetId`/`logoAssetId`，不存 blob URL**——因为 user-asset 的 blob URL session-bound，刷新就失效（这是上次模板功能不稳定的根因）。apply 时通过 `getUserAssetById` 或 `findAssetById(BUILTIN_*)` 反查 src
- **内置 3 个主题**（`BUILTIN_THEMES`）：雅致（=DEFAULT_THEME，id=`builtin-elegant`，App 启动加载）/ 极简白 / 深夜黑。**历史记录**：曾有「自定义-雅致 + 宣纸」两个样式相同的内置主题，已合并为「雅致」单一项
- **存储**（`lib/themeStore.ts`）：独立 IndexedDB `xhs-poster-themes` / store=`user-themes` / keyPath=`id`。put 语义（同 id 覆盖）。round-trip 已在浏览器验证通过（含嵌套 contentJSON）
- **UI**（`components/ThemeLibrary/ThemeLibrary.tsx`）：Modal + Tabs（内置/我的）。卡片用主题自身的 `fontH1`/`fontBody` 渲染 "Aa 你好 / 正文样张"，含正文的主题加角标提示。我的 tab 顶部有「保存当前样式为新主题」表单：name input + 「包含正文」checkbox + 保存按钮
- **应用主题逻辑**（`App.tsx::applyTheme`）：异步函数（要 resolve assetId → src）。把所有字段写回 state；如果 theme.contentJSON 非 null，调 `editorRef.current?.setContent(contentJSON)`
- **保存主题逻辑**（`App.tsx::saveCurrentAsTheme`）：打包当前 state 成 Theme 对象（含 `editorRef.current?.getJSON()` 如果勾选包含正文）写入 IndexedDB
- **「脱离主题」检测**：App 用 `customize(setter)` 包装所有 Toolbar setter——用户改任何样式 → `setCurrentThemeId(null)`。applyTheme 末尾会 `setCurrentThemeId(theme.id)`。ThemeLibrary 卡片用 `currentThemeId` 显示「已应用」高亮
- **Editor 命令式 API**（`Editor.tsx`）：从函数组件改为 `forwardRef<EditorHandle>` 暴露 `setContent` / `getJSON`，方便 App 在 apply 主题和 save 主题时操作 editor 内容
- **AssetLibrary 接口变更**：`onPickBackground` / `onPickLogo` 改为传 `Asset` 而不是 `string`，App 端能同时拿到 `id`（存主题用）和 `src`（渲染用）。**调用方需要同步更新**
- **Toolbar 接口变更**：移除 `theme` / `onTheme` props 和「主题」select Group；新增 `onOpenThemeLibrary` prop，右侧加蓝色「主题」按钮（与「素材库」并列）
- **新 IndexedDB 工具**：`assetStore.ts` 加 `getUserAssetById(id)` 跨 kind 单查

### Step 6 + 主题库埋了一个坑要注意
- **Tiptap setContent 类型签名**：`editor.commands.setContent(c as never)` 用了 `as never` 绕过 TS 严格泛型。Tiptap v3 的 `setContent` 签名很复杂，传 plain object（doc JSON）和 string（HTML）都接受，但 TS 类型推断不友好。如果未来 setContent 报类型错，先检查这里

### 主题库二轮迭代（同日 2026-05-24）
- **真图缩略图**：`components/ThemePreview/ThemePreview.tsx`。1:1 复用 canvas.css 样式，外层固定缩略尺寸 + overflow hidden，内层保持 1080×1920 用 transform scale 缩小。**CSS vars 通过 inline style 注入到本地容器**（不污染 :root，所以多张缩略图各自独立显示自己的主题）。assetId → src 异步 resolve（builtin 走静态表，user 走 IndexedDB）。Demo 内容固定为示例排版（H1 + 段落 + H2 + 段落 + H3 + 引用 + 列表），与 DEFAULT_CONTENT 第一页内容对齐，让缩略图看起来像真实排版
- **下拉栏回归**：Toolbar 重新加上「主题」select（删了一次又恢复，UX 反馈是「Modal 卡片选 + 顶栏快速切」两个入口都要）。SelectGroup 分组 内置 / 我的；用户脱离主题时显示「（自定义）」disabled 占位
- **userThemes 单一来源**：之前 ThemeLibrary 自己 `listUserThemes`，现在 App 集中持有 `userThemes` state + `reloadUserThemes` callback，同时供 Toolbar 下拉和 ThemeLibrary 卡片用。ThemeLibrary 通过 `onReload` 通知 App 刷新

### Step 7：导出 PNG zip（含重命名弹窗）
- **依赖**：`html2canvas-pro`（原版不支持 oklch；shadcn theme 用了 oklch，必须 pro 版本）+ `jszip`
- **`lib/exportPng.ts`**：
  - `pageToPngBlob(page)`：scale=2 渲染 2160×3840；**`onclone` 钩子撤掉 `.page-wrapper` 的 `transform:scale(0.4)`**（不撤的话截到的是缩放后的小图，这是预览缩放的副作用）
  - `triggerDownload(blob, filename)`：**必须 `document.body.appendChild(a)` 再 `a.click()`**——detached `<a>` 在某些浏览器会被吞下载，是经典坑（第一次实现没 append，用户反馈不下载，定位到这个原因）
  - `exportPages(pages, name)`：单页直下 `${name}.png`，多页打 `${name}.zip`，包内文件命名 `${name}-1.png` ~ `${name}-N.png`
  - `suggestFilename(html)`：DOMParser 提取首个 H1 文本作为默认名，过滤掉 `\/:*?"<>|`，截 40 字；无 H1 回退到今日日期 YYYY-MM-DD
  - 截图前 `await document.fonts.ready` 等 webfont 加载完，否则会截到 fallback 字体
- **`components/ExportDialog/ExportDialog.tsx`**：shadcn Dialog；文件名输入（autoFocus，Enter 触发导出）；显示「将导出 N 页为 xxx.zip」提示；exporting 期间 disable 取消按钮、按钮文案「导出中…」
- **`Preview` 改 forwardRef**：暴露内部 `.page` DOM 给 App 端 `pageRefs`；App 通过 ref callback 收集多页节点传给 `exportPages`
- **Toolbar 右上角加绿色「导出 PNG」按钮**（与「主题」「素材库」并列）
- **验证方式**：MCP playwright 被锁住，改用本地 Python playwright 跑无头脚本 (`/tmp/verify_export.py`)，确认真触发下载、文件名正确、zip 内 UTF-8 flag 设了（Finder 能正常解中文名）、PNG 2160×3840 高清渲染

### Toolbar 下拉换 shadcn Select（解决 macOS Chrome 原生 select dropdown 字号巨大）
- **问题**：macOS Chrome 原生 `<select>` 的 popup 字号由系统控制（看上去像开了老人模式），无法用 CSS 调小。HANDOFF 早就标记为下一步候选
- **方案**：装 `@radix-ui/react-select`，自己写 `components/ui/select.tsx`（shadcn 标准模板，内联 SVG 图标避免 lucide-react v1 版本问题）
- **Toolbar 重写**：所有原生 `<select>` 改用 Radix Select。抽出 `SimpleSelect`（平铺单组）和 `FontSelect`（分组）两个小封装。原生 `<optgroup>` → `<SelectGroup>` + `<SelectLabel>`
- **API 差异**：Radix 用 `onValueChange` 而不是 `onChange`；value 必须是非空字符串（用 `__custom__` 作脱离主题的 sentinel）；disabled SelectItem 不影响选中态显示
- **验证**：popup 现在 128px 宽、13px 字号，与 trigger 视觉一致

## 2026-05-24 上半场新增改动（在 Step 2 之后）

### 思源黑 / 思源宋 全 7 档本地化（fontsource）
- `pnpm add @fontsource/noto-sans-sc @fontsource/noto-serif-sc`
- `src/main.tsx` 顶部 import 全权重（Sans: 100/200/300/400/500/600/700/800/900；Serif: 200/300/400/500/600/700/800/900）
- `index.html` 删掉 Google Fonts 里的 `Noto+Sans+SC`/`Noto+Serif+SC` query param，保留 ZCOOL/Ma Shan Zheng/Long Cang/LXGW/Inter
- **为什么不放 public/fonts/ 而用 fontsource**：手动子集化要装 fonttools，且要自己管 unicode-range；fontsource 已经把分片做好了（每权重 ~100 个 woff2 分片），浏览器按 unicode-range 只下载实际用到的字符所在分片，Vite 打包时 hash + 缓存友好
- **font-display: swap**：所有 @font-face 默认 swap，所以会先 fallback 后真字体（轻微 FOUT 但不阻塞首屏）

### 删除贴纸功能（YAGNI）
- `AssetLibrary.tsx` 的 KindTab 从 `'background' | 'logo' | 'sticker'` 变成 `'background' | 'logo'`
- 移除占位 sticker `TabsContent` 和相关防御代码（`kind === 'sticker'` 短路）
- 任何时候用户想加装饰，先把图合进背景里

### Dialog a11y 默认 Description
- `ui/dialog.tsx` 的 `DialogContent` 加 `description?: React.ReactNode` prop，默认 `'对话框内容'`
- 内部用 `<VisuallyHidden.Root asChild><DialogPrimitive.Description>` 包裹（Radix 官方 a11y 隐藏方案，比 sr-only class 稳）
- 现有 AssetLibrary / FontLibrary 不用改，警告自动消失。新建 Dialog 可传 `description="字体库说明"` 给更具体的 sr-only 文本
- 调用方仍可在 children 里自己写 `<DialogDescription>` 显式视觉描述（aria-describedby 会包含两个 id，screen reader 都读，无副作用）

### File picker label htmlFor 重构（未解决 bug，记录在「已知 bug」）
- `AssetLibrary.tsx` 和 `FontLibrary.tsx` 都从 `ref.click()` + hidden input 改成 `useId()` + `<Button asChild><label htmlFor={id}>...</label></Button>` + sr-only input
- 改完后 picker 仍然不弹（拖拽 work）。根因未定位，下次需要在浏览器 DevTools Console 配合诊断

### Tiptap 下划线扩展
- `pnpm add @tiptap/extension-underline`，`Editor.tsx` extensions 加 `Underline`，工具栏加「下划线」按钮（`editor.chain().focus().toggleUnderline().run()`）
- 渲染出 `<u>` 标签，Tailwind preflight 不动 u 但两个 CSS 文件都补了显式声明：
  - `editor.css`：`.tiptap-editor u { text-decoration: underline }`
  - `canvas.css`：`.content u { text-decoration: underline; text-underline-offset: 0.18em; text-decoration-thickness: 0.06em }`（offset/thickness 是高分辨率画布的视觉调优）

### 大标题字体拆分为 H1 / H2 / H3 独立可选
- `themes.ts` `Theme` 接口的 `fontDisplay` 拆成 `fontH1` / `fontH2` / `fontH3` 三个字段；三个主题预设都改为分别赋值
- `canvas.css` 字体 var 从 `--font-display` 拆成 `--font-h1` / `--font-h2` / `--font-h3`，画布 h1/h2/h3 各引用各自 var
- `App.tsx` state、`applyTheme`、useEffect var 注入、Toolbar props 全部跟着拆三份
- `Toolbar.tsx` 把原「大标题」一个 `<Group>` 拆成「H1 / H2 / H3」三个 Group；字体下拉抽成 `FontSelect` 子组件 DRY 化
- H1/H2/H3 三个下拉都用 `DISPLAY_FONTS` 选项；正文用 `BODY_FONTS`
- 默认值：H1=H2=思源宋；H3=思源黑（与 body 同字体保留原层级）；body=思源黑

### ⚠️ 顺手修了一个 select value 不同步 bug
- 老 bug：`themes.ts` 主题预设里 `fontBody = '"PingFang SC", "Noto Sans SC", sans-serif'`，但 `BODY_FONTS` 选项里没有这个 stack（只有 PingFang 单独的 `"PingFang SC", sans-serif` 和思源黑的 `"Noto Sans SC", ..., "PingFang SC", sans-serif`）。原生 select 在 value 找不到匹配 option 时**自动回退到第一个 option**，结果 UI 显示「思源黑体」但 CSS var 是 PingFang stack
- 这个 bug 在 fontDisplay 拆分前没人发现，因为只影响 body 下拉。拆出 H3 之后立刻又触发了一遍（H3 默认值原本是 BODY_PINGFANG，DISPLAY_FONTS 也没匹配）
- 修复：把所有主题预设的 `fontBody` / `fontH3` 默认值统一改为 `DISPLAY_SANS = '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif'`（即 BODY_FONTS[0] / DISPLAY_FONTS[1] 的 value），让 select 能匹配上
- 视觉变化：macOS 上默认正文从「苹方简」变成「思源黑体」（fontsource 本地化），紧凑度略松、字形更开放但都是无衬线，差异小可接受
- **教训**：今后所有主题预设的字体默认值，必须**直接引用** fontPresets 里某个 option 的 value（或者写测试断言两边对得上），不能手写一个新 stack

## Step 8：Cloudflare 部署 + CI/CD 上线（2026-05-24 凌晨）

🌐 **https://xhs-poster-editor.l-yanjunnn.workers.dev**

### 架构

**Cloudflare Workers Static Assets**（Pages 2025 后被合并到 Workers 体系）。GitHub auto-deploy 已配通：`git push origin main` → Cloudflare webhook 触发 → 1-3 分钟自动上线。

> ✅ **以后改代码只需 push，不需要再去 Cloudflare 后台。**

### 新增的部署相关文件（仓库根，**不在 app/**）

| 文件 | 作用 |
|---|---|
| `wrangler.jsonc` | Workers 配置，`assets.directory = ./app/dist`，`not_found_handling: single-page-application` |
| `ci.sh` | CI build 脚本，直接调 binary 绕过 pnpm script runner |
| `package.json` | 仓库根最小 package.json，含 `packageManager: pnpm@9.15.0` |
| `.npmrc` | `frozen-lockfile=false`，CI 兼容用 |
| `app/.npmrc` | 同上（双份保险） |
| `app/package.json` | 加了 `packageManager` 和 `engines.node: >=20` 字段 |

### Cloudflare 后台配置（已设好不要动）

- Build command: `bash ci.sh`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Production branch: `main`
- Non-production branch builds: Enabled

### 踩坑总结（每个对应一个 CI 反直觉默认）

1. **Cloudflare 把无 root package.json 的项目识为 Worker** → 加 `wrangler.jsonc` 声明这是 Static Assets 模式
2. **CI 自动当 pnpm monorepo**（看到 app/ 有 package.json 但仓库根没有，注入空 `pnpm-workspace.yaml`）→ pnpm install 加 `--ignore-workspace`
3. **CI 默认 pnpm 老版本读不懂 lockfileVersion 9.0**（症状：`resolved 1, downloaded 0`）→ `packageManager` 字段 + `frozen-lockfile=false`
4. **`pnpm build` 在执行 script 前还会查 workspace 配置** → 写 `ci.sh` 直接调 `./node_modules/.bin/tsc && ./node_modules/.bin/vite build`，完全绕过 pnpm script runner
5. **Cloudflare 「Retry build」按钮重跑当前 build 的旧 commit**，不是 main HEAD → `git commit --allow-empty -m "trigger"` push 空 commit 触发 auto-build

完整复盘见 `Vault-InfoTech/07_对话录/2026-05-24_小红书排版器Cloudflare部署实战.md`
方法论笔记见 `Vault-InfoTech/02_核心概念/持续部署CI-CD.md`

## Step 9：标题加粗 toggle + 编辑器插入图片（2026-05-24）

### 标题加粗 toggle（轻便方案）
- **决策**：不做字重下拉，三个标题各加一个 B toggle 按钮（粗/常规二态）。覆盖 90% 场景，UI 最轻。未来需要 ExtraLight/Black 等精细字重再升级（fontsource 已载入 9 档）
- **数据模型**（`themes.ts`）：`Theme` 接口加 `h1Bold` / `h2Bold` / `h3Bold` boolean 字段。所有内置主题默认 true，保持现有视觉
- **CSS var**（`canvas.css`）：新增 `--fw-h1` / `--fw-h2` / `--fw-h3`（默认 700/700/600 保 fallback）。`.content h1/h2/h3` 的 `font-weight` 改用 var
- **注入**（`App.tsx::useEffect`）：state 写 `--fw-hN` 为 `700` 或 `400`
- **UI**（`Toolbar.tsx::BoldToggle`）：新增组件，三个标题 Group 内 FontSelect 旁边一个 B 按钮，蓝高亮 = 加粗中。**正文 Group 不加 B**（编辑器内部有 `<strong>` 处理 inline 加粗，正文整段不需要全局 toggle）
- **主题序列化**：applyTheme / saveCurrentAsTheme 都跟着加三个字段；customize 包装 `setH1Bold` 等让用户点击后脱离当前主题
- **editor.css 同步**：`.tiptap-editor h1/h2/h3` 也改用 `var(--fw-hN, fallback)`，编辑器和画布字重保持一致

### 编辑器插入图片
- **新依赖**：`@tiptap/extension-image`（3.23.6）。安装时遇到 store 冲突坑见下文
- **Tiptap 配置**（`Editor.tsx`）：`Image.configure({ inline: false, allowBase64: true })`。inline=false 让图片成为 block 节点，跟段落/标题流式排版对齐
- **EditorHandle 加 `insertImage(src)`**：用 `editor.chain().focus().setImage({ src }).run()`
- **素材库 image kind**（`AssetLibrary.tsx`）：
  - `KindTab` 加 `'image'`，新增第三个 Tab「图片」
  - `Props` 加 `onPickImage?` 和 `initialKind?`（让上游可指定打开时落到哪个 tab）
  - `useEffect` 监听 `p.initialKind` 切 kind
  - image kind 自动跳到「我的上传」（`BUILTIN_IMAGES = []` 空，省一次点击）
  - image kind 不参与「当前选中高亮」（src 为空）
- **App.tsx 连线**：
  - 新增 `assetLibInitialKind` state
  - 编辑器工具栏「🖼 插入图片」按钮 → App 把 `assetLibInitialKind` 设为 `'image'` + 打开素材库
  - 主题/Logo 按钮触发素材库时 `assetLibInitialKind` 设回 `undefined`，保持默认 background tab
  - `handlePickImage(asset)` → `editorRef.current?.insertImage(asset.src)`
- **样式**：`canvas.css` 加 `.content img { max-width: 100%; height: auto; display: block; border-radius: 8px }`；`editor.css` 同步加 img 样式 + `ProseMirror-selectednode` 选中蓝框
- **AssetKind 加 'image'**（`assetStore.ts`）：保留旧 `'sticker'` 类型不影响已有数据

### 装包踩坑：pnpm corepack store 冲突
- **症状**：`pnpm add @tiptap/extension-image` 报 `ERR_PNPM_UNEXPECTED_STORE`，node_modules 是 store v11（brew 装的 pnpm 11.1.3），但 `packageManager: pnpm@9.15.0` 字段让 corepack 切到 pnpm 9，9 用 store v3
- **绕过**：临时删除 `app/package.json` 的 `packageManager` 字段 → 直接用 brew 的 pnpm 11 跑 `pnpm install --ignore-workspace` → 装完恢复字段
- **教训**：corepack + brew pnpm 双装是矛盾来源。`packageManager` 字段必须保留给 CI 用，本地装包时临时去掉是最简洁路径

### 验证方式
- `./node_modules/.bin/tsc -b` 通过 + `vite build` 通过
- 起 `vite preview --port 4173`，playwright MCP：
  - 看到 H1/H2/H3 三个 B 按钮（默认 pressed=true，蓝高亮）
  - 点 H1 B 按钮后 `computedStyle(.content h1).fontWeight = 400`，CSS var `--fw-h1 = 400`
  - 编辑器工具栏「🖼 插入图片」点击 → 素材库自动开到 image tab + 「我的上传」
  - 程序化上传 logo-cat-ring.png 走 IndexedDB → 卡片显示 → 点卡片 → 编辑器和右侧画布都渲染出 525px 自然宽度图片

### 图片宽度下拉（顶部 Toolbar）
- **位置**：顶部全局工具栏「H1 宽度」旁边，与其它宽度/字号控件并列
  - 第一版做在编辑器内部 toolbar 是设计错误：用户的 mental model 是「跟 H1 宽度类似」，那就该在同一行。改到顶部
- **5 档**：原大小 / 33% / 50% / 75% / 100%
  - 「原大小」= 清空 `width` attribute，回到 CSS `max-width: 100%` 兜底（小图原大小，大图等比缩到 100% 内容区）
  - 其它百分比 = 写入 image 节点的 `width` attribute → 渲染为 `<img style="width: 50%">`
- **Tiptap 扩展**：`Image.extend({ addAttributes })` 加 `width` attribute，`renderHTML` 把 `width` 输出到 style，`parseHTML` 从 `element.style.width` 反序列化（重新打开/setContent 时保留）
- **状态同步**：
  - Editor 通过 `onSelectionUpdate` + `onUpdate` 双钩子上抛 `ImageState = { active, width }` 给 App
  - App 持有 `imageState` state，传给 Toolbar 渲染
  - Toolbar 下拉的 onChange 通过 `onImageWidth(width)` 回调 → App → `editorRef.current?.setImageWidth(width)`
  - EditorHandle 加 `setImageWidth(width: string | null)` 暴露给 App
- **disabled 提示**：未选中图片时下拉灰掉，**Group label 改写为「图片宽度（先选图）」**——这比单独靠 hover title 更显式；选中后变回「图片宽度」
- **SimpleSelect 加 disabled 支持**：Toolbar 已有的 SimpleSelect 封装加 disabled prop（Radix Select 原生支持）

### 给未来 Claude 的 build 排查指南（按顺序）

1. **错误尾部是 `pnpm help install` 还是 `pnpm help run`？** 前者是依赖阶段，后者是 script runner / workspace 阶段
2. **Build log 的 Branch 显示的 commit hash 是 main HEAD 吗？** 不是的话推空 commit 触发用最新代码
3. **看到 "resolved 1, downloaded 0"**：pnpm 版本问题，确认根目录和 app/ 都有 `packageManager` 字段
4. **看到 "packages field missing or empty"**：workspace 检测问题，确认 build 全程不经过 `pnpm run` / `pnpm <script>`
5. **看到 "bash: ci.sh: No such file"**：Cloudflare 在用旧 commit 跑，那时还没有 ci.sh，推空 commit 触发 auto-build

## Step 10：首图 4:3 适配 + 参考线 + 分隔线恢复 + 导出修复 + 默认教程（2026-05-28）

### 首图中心 4:3 适配（`.page--first` modifier）
- **背景**：小红书首图缩略不是「裁下方留上方」，而是**中心对齐 4:3**。9:16=1080×1920，4:3=1080×810，上下各裁 555px。安全区 y ∈ [555, 1365]。
- **方案**：CSS modifier `.page--first` override 两个 var，让首页 Logo + H1 落进安全区：
  - `--page-padding-top: 555px`（H1 顶贴安全区上沿）
  - `--logo-offset-y: 355px`（Logo→H1 间距 = 80px，与其他页一致）
- **Preview.tsx**：`pageIndex===0` 时附加 `page--first` class。
- **教训**：和用户对齐布局时数学要算清，"上方 4:3 裁切" vs "中心 4:3 裁切" 差 555px。

### 参考线工具（`.guide-v` / `.guide-h`，可 toggle）
- **位置**：左竖线 = `--page-padding-x`（80px，padding-left 内边界）；下横线 = `calc(var(--page-padding-bottom) + 50px)`（距底 170px，比 padding-bottom 120 更保守，留视觉呼吸）。
- **实现**：Toolbar「参考线」按钮 toggle `guidesOn` state → Preview 条件渲染两个 `<div class="guide guide-v/h">`。
- **🚨 大坑**：第一版用 `.page--guides::before/::after`，发现 onclone 移除 class 后 **html2canvas 仍把伪元素截到 canvas**（实测像素采样 x=80 处仍是蓝色 RGB(108,175,248)）。**根因**：html2canvas 处理伪元素时机早于 onclone 钩子。**修法**：改成真实 DOM 子节点（`<div class="guide">`），`onclone` 里 `g.remove()` 节点就生效（像素采样验证 31 个点全为背景灰）。
- **教训**：要在 html2canvas 导出时排除某些视觉元素，**用真实 DOM + onclone remove() 节点**，别用 ::before/::after。

### Divider 节点（淡虚线分隔线，与分页符分离）
- **背景**：旧 HTML 编辑器有"分隔线"功能，Tiptap 重构时丢了——StarterKit 的 HorizontalRule 被配置成分页符（`class="page-break"`），普通分隔线无处可去。
- **方案**：新建 `Divider` Node，渲染 `<hr class="divider">`，与 `<hr class="page-break">` 区分。`splitPages` 只切 hr.page-break，hr.divider 进画布走 CSS 默认 dashed 样式。
- **parseHTML priority=1000**：让 `hr.divider` 优先匹配 Divider 而不是 StarterKit 的 HorizontalRule（默认 priority=50）。
- **import 坑**：`Node` 不要从 `@tiptap/core` 引（dev 依赖没 hoist），从 `@tiptap/react` re-export 引：`import { Node } from '@tiptap/react'`。

### ExportDialog 文件名序号记忆 + 修复导出文件损坏
- **同名覆盖 bug**：用户报「二次修改后只能导出第一版」。本地复现：代码层每次导出 hash 都不同，反映最新内容。**真因**是同名下载（filename 默认取 H1，H1 不变 → 反复同名 → macOS Downloads 静默把后续重命名为 `xxx 2.png`、`xxx 3.png`，用户打开的还是第一版）。**修法**：ExportDialog 内 `useRef<Set<string>>` 记忆已用 filename，再次打开时如已用过则追加 `-2`/`-3` 序号。
- **🚨 文件损坏 bug**：用户报「Chrome 下载条目存在但点击显示不了文件」。**根因**：`exportPng.ts::triggerDownload` 中 `URL.revokeObjectURL` 在 `a.click()` 后 1 秒就 revoke，11MB PNG 还能赶上，44MB zip 经常被截断 → 下载到一半文件就坏。**修法**：revoke 延迟从 1000ms → **60000ms**。
- **教训**：blob URL 的生命周期要覆盖整个真实下载过程；Playwright 测试不踩这个坑因为它直接拷 blob 不走浏览器下载管线。

### DEFAULT_CONTENT 改成「使用教程」（4 页样张）
- 第 1 页（封面）：H1 + 副标题 + 分隔线 + 段落 + 引用 + 段落
- 第 2 页：顶部工具栏说明，覆盖 H2 + 列表 + 分隔线
- 第 3 页：编辑器排版说明，覆盖 H2 + H3 + 列表 + 引用
- 第 4 页：素材与导出，覆盖 4 个 H3 子节 + 列表 + 引用
- **作用**：新用户开箱即用即时看到完整功能演示样张；同时作为「样张+教程」两用。

### Dev 模式 editor 挂 window（方便 E2E）
- `import.meta.env.DEV && (window as any).__editor = editor` —— 控制台/Playwright 能直接 `window.__editor.commands.setContent(...)`，prod build 被 Vite tree-shake。
- 这种 dev-only 引用对 E2E 测试很顺手，可以复用到别的项目。

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

1. ~~**素材库 Modal**~~ ✅ 2026-05-24 完成
2. ~~**字体库**~~ ✅ 2026-05-24 完成
3. ~~**核心字体本地化**：思源黑/宋 走 fontsource npm 包~~ ✅ 2026-05-24 完成
4. ~~**贴纸功能**~~ ❌ 2026-05-24 用户决定不做
5. ~~**a11y 警告清理**：DialogContent 默认 sr-only Description~~ ✅ 2026-05-24 完成
6. ~~**Tiptap 下划线扩展 + 标题字体拆分**~~ ✅ 2026-05-24 完成
7. ~~**分页符 → 多页画布**（Step 6）~~ ✅ 2026-05-24 完成
8. ~~**主题库**：保存/恢复完整样式（含可选正文）~~ ✅ 2026-05-24 完成
9. ~~**shadcn Select 替换原生 select**~~ ✅ 2026-05-24 完成（解决 macOS Chrome dropdown 字号巨大）
10. ~~**主题真图缩略图**：ThemeLibrary 卡片渲染 9:16 mini preview~~ ✅ 2026-05-24 完成
11. ~~**导出 PNG zip**（Step 7）~~ ✅ 2026-05-24 完成（html2canvas-pro + jszip + 重命名弹窗）
12. **其余字体本地化（可选）**：ZCOOL / Ma Shan Zheng / Long Cang 现在还走 Google Fonts。如果大陆访问也卡，可继续 fontsource 化
13. ~~**部署 Cloudflare Pages**（Step 8）~~ ✅ 2026-05-24 完成（Cloudflare Workers Static Assets + GitHub auto-deploy）
14. ~~**修 file picker bug**~~ ✅ 2026-05-24 自动解决（部署到生产后 picker 正常工作，dev server 副作用）
15. ~~**标题加粗 toggle**（Step 9）~~ ✅ 2026-05-24 完成（H1/H2/H3 各一个 B 按钮二态切换）
16. ~~**编辑器插入图片**（Step 9）~~ ✅ 2026-05-24 完成（Tiptap Image + 素材库 image tab）
17. **标题字重升级成下拉**（如二态不够用）：把 `h1Bold` 等 boolean 改成 `h1Weight: 100-900` 数字字段，B 按钮换成 select（fontsource 已载入 9 档思源黑）
18. ~~**图片宽度档位**~~ ✅ 2026-05-25 完成（顶部 Toolbar 下拉，5 档：原大小/33/50/75/100）
19. ~~**首图 4:3 中心适配**~~ ✅ 2026-05-28 完成（`.page--first` modifier）
20. ~~**参考线工具**~~ ✅ 2026-05-28 完成（左竖 + 下横，可 toggle，导出剥离）
21. ~~**分隔线功能恢复**~~ ✅ 2026-05-28 完成（Divider 节点，hr.divider）
22. ~~**导出文件损坏 / 同名覆盖**~~ ✅ 2026-05-28 完成（filename 序号记忆 + 60s revoke）
23. ~~**默认教程内容**~~ ✅ 2026-05-28 完成（4 页样张兼教程）
24. **图片对齐**（左/中/右）：当前默认 block 居左，可加 align attribute 支持居中/居右
20. **图片拖拽手柄缩放**（如档位不够用）：装社区 image-resize 扩展或自写 NodeView，鼠标拖四角自由调整
21. **PWA 配置**：加 `vite-plugin-pwa`，让用户能"安装到主屏幕/Dock"获得类 App 体验
16. **自定义域名**：买 `xxx.com` 绑到 Cloudflare（~¥80/年）替换默认 `*.workers.dev`
17. **字体冗余清理**：fontsource 同时生成 `.woff` + `.woff2`，现代浏览器只用 woff2，删 woff 可让 dist 体积减半（115MB → ~60MB）
18. **Tauri 打包**：把 Web 版套壳变成 macOS .app（可上架 App Store）

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
- ❌ 不要把用户上传的素材转 base64 存 localStorage（5MB 上限会爆，已经用 IndexedDB Blob 了）
- ❌ 不要直接用 shadcn 的 `<Dialog>` + `<Tabs>` 而不传 className —— 默认配置有坑（见上面坑 6–8），新 Modal 时必传 `sm:max-w-* + grid-cols-1`、新 Tabs 时必传 `flex-col`
- ❌ 不要再用原生 `<select>`（macOS Chrome popup 字号巨大），统一走 `@/components/ui/select` 里的 shadcn Select
- ❌ 主题数据里不要存 blob URL（session-bound），只存 `bgAssetId`/`logoAssetId`，apply 时再用 `resolveAssetSrc` 反查
- ❌ 不要在 Cloudflare 后台手动改 build command —— 已设好 `bash ci.sh`，配置全在仓库代码里（wrangler.jsonc + ci.sh + packageManager 字段）
- ❌ 不要点 Cloudflare 的「Retry build」期望用新代码 —— 它重跑当前 build 关联的旧 commit。要用新代码必须 push（实在没改动用 `git commit --allow-empty -m "trigger" && git push`）
- ❌ 不要在仓库根加 `pnpm-workspace.yaml` —— Cloudflare CI 会覆盖成空内容，反而失败。靠 `--ignore-workspace` flag 或 `ci.sh` 绕过即可
- ❌ 不要把 `pnpm build` 改回 build command —— pnpm 9 的 script runner 会触发 workspace 检测，必须走 `ci.sh` 里的 `./node_modules/.bin/` 直接调 binary 路径
- ❌ 本地装包遇 `ERR_PNPM_UNEXPECTED_STORE` 不要去改全局 store-dir —— 临时删 `app/package.json` 的 `packageManager` 字段，让 brew 的 pnpm 11 直接生效，装完恢复字段就行
- ❌ 不要在主题数据里硬编码 `font-weight: 700`，已经改用 `--fw-hN` CSS var；想加新标题字重档位，从 `h1Bold` boolean 升级成数字字段，别再回到 CSS 写死
- ❌ 想在导出 PNG 时排除某个视觉元素，**不要**用 `::before/::after` + onclone 改 class —— html2canvas 处理伪元素早于 onclone，class 移除后仍被截到 canvas。用真实 DOM 子节点 + onclone `remove()` 节点（参考线就是这么做的）
- ❌ `URL.revokeObjectURL` 别在 `a.click()` 后立刻 / 1 秒内 revoke —— 大 blob（如 zip 多页）真实下载需要时间，过早 revoke 会截断文件让 Chrome 下载条目可见但实际文件损坏。延迟 60s 为底线
- ❌ 不要让 ExportDialog filename 永远等于 `H1 文本`——同名下载会被 macOS Downloads 静默重命名为 `xxx 2.png`，用户以为还是第一版。已加 `usedNamesRef` 自动追 -2/-3 序号
- ❌ Tiptap `Node` 不要从 `@tiptap/core` 引（项目没装 core 包，dev 依赖也没 hoist）；从 `@tiptap/react` re-export 引：`import { Node } from '@tiptap/react'`
