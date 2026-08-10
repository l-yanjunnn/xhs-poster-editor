# 小红书排版编辑器 · Handoff 文档

> 给下一个会话窗口的 Claude 看的项目交接文档。
> 🌐 **生产 URL：https://xhs-poster-editor.l-yanjunnn.workers.dev**
> 最后更新：2026-08-10（全面重构：现状优先结构 + SOP 固化。旧版全文在 git 历史，`git log -- HANDOFF.md` / `git show <commit>:HANDOFF.md` 可考古）

---

## 0. 现状快照（30 秒接手）

| 项 | 值 |
|---|---|
| 版本 | **v1.2.0**（发版史见 git tag，页面预览区信息条显示当前版本，部署后看线上版本号确认生效） |
| 状态 | **稳定已上线**。Export PNG v8 终局（离屏渲染 + onclone 注入全量 CSS），prod 实测 3 主题各 5/5 全 OK |
| 技术栈 | Vite + React 19 + TS + Tailwind v4 + shadcn/ui + Tiptap 3 |
| 部署 | **双轨**。轨一：Cloudflare Workers，`git push origin main` 自动 build+deploy（1–3 分钟），不要碰后台；轨二：阿里云 OSS+CDN 大陆通道 `https://xhsposter.tshzchen.cn`，`bash tools/deploy-oss.sh`。**双轨发版纪律：每版两轨都必须推**（沃林发圈工具欠费停服事故教训） |
| 仓库 | https://github.com/l-yanjunnn/xhs-poster-editor （public，main） |
| 本地 | `/Users/a0000/Nutstore Files/Claude_YJ/Scripts-脚本工具集/xhs-poster-小红书排版/`，React 工作目录在 `app/` |
| 测试基线 | vitest 31/31 绿，tsc -b 绿（2026-08-10 核验） |
| 定位 | 小红书 9:16 长图排版工具，给非技术用户开箱即用。阶段 A：纯静态站点（无登录无后端） |

**新会话第一步**：读完本文件；改导出相关代码前必读 §5；动手前扫一遍 §6 坑手册的相关域。

**Codex 接手说明**：用户计划将后续迭代转到 Codex 执行。本文件即唯一交接源——Codex 与 Claude Code 共享工作区记忆桥（AGENTS.md），流程/坑/版本纪律全在本文件，照 §2 SOP 执行即可。`codex exec` 需 `--skip-git-repo-check`。E2E 钩子：dev 模式下 `window.__editor`（Tiptap 实例）和 `window.__test`（pageToPngCanvas / registerFontFromBlob / getUserFontFaceCss）可用。

---

## 1. 关键决策（已拍板，不要推翻）

1. **SaaS 层次**：A（纯静态站点），后续再考虑 B（Supabase）/ C（付费 SaaS）
2. **包管理器**：pnpm（不是 npm/yarn/bun）
3. **UI 组件库**：shadcn/ui（Nova preset，Radix 底层），base color = neutral
4. **CSS**：Tailwind v4（@tailwindcss/vite 插件，配置在 `src/index.css` 的 `@theme` 块，无 tailwind.config.js）
5. **富文本**：Tiptap 3.x，**不要换**
6. **字体**：核心字体（思源黑/宋全档）走 fontsource npm 包（unicode-range 分片按需加载，大陆稳）；ZCOOL/Ma Shan Zheng/Long Cang/LXGW/Inter 走 CDN；用户自定义字体走 FontFace API + IndexedDB。苹方简因版权不能嵌
7. **主题（原「模板」）**：概念统一叫主题；扁平 JSON schema；**只存 assetId 不存 blob URL**（blob URL session-bound，刷新失效，是老模板功能翻车根因）
8. **画布**：1080×1920，导出 scale 2（2160×3840）
9. **分页**：手动 `<hr class="page-break">`（Tiptap HorizontalRule 全部配置为分页符）；装饰分隔线是独立 `Divider` 节点（`hr.divider`）
10. **部署**：Cloudflare Workers Static Assets + GitHub auto-deploy，build 走 `bash ci.sh`
11. **旧 MVP**：`editor.html` + `assets/` + `demo.html` 保留作参考，不再维护

---

## 2. 固定开发工作流（SOP）

每次改动按此流程走，不跳步：

1. **动工前**：扫 §6 坑手册相关域；架构级改动先向用户交代方案再动手
2. **改码**（遵守 §7 不要做的事）
3. **本地验证三连**：
   ```bash
   cd app
   ./node_modules/.bin/tsc -b        # 类型检查
   ./node_modules/.bin/vitest run    # 单测（31 个，<1s）
   ./node_modules/.bin/vite build    # 构建
   ```
4. **UI 改动**：`vite preview` + Playwright 截图自查 → 用户目检确认后再部署
5. **部署**：`git push origin main`，等 1–3 分钟自动上线
6. **⚠️ 凡碰导出路径（exportPng.ts / canvas.css / Preview）**：部署后**必须在 prod URL 上 playwright 实测**（三主题 × 多页，采样像素而不是肉眼看图）。本地 preview 永远复现不了 prod 的 iframe CSS 问题，v1~v7 八轮全吃过这个亏。回归脚本：`tools/export-race-repro/`（test_prod.py 需系统 proxy 127.0.0.1:7897）
7. **收尾**：更新本文件 §0 现状快照（+涉及的章节）；里程碑级进展同步 `WorkLog-Obsidian/3-Projects/xhs-poster-小红书排版编辑器.md`

### 版本与上线闭环（2026-08-10 起，对齐沃林发圈工具工作流）

**版本号**：语义化三段 `主.次.修`，单一来源 = `app/package.json` 的 `version` 字段（构建时注入页面信息条显示，部署后看线上版本号即确认生效）。

- **主**：架构级/破坏性变更（如换导出库、数据 schema 迁移）
- **次**：新功能、功能恢复
- **修**：bug 修复、文案、纯文档不发版

**每次发版固定闭环**（顺序不跳步）：

1. bump `app/package.json` version
2. 本地验证三连 + UI 改动 Playwright 截图自查
3. **用户目检确认**后才部署
4. `git push origin main`（= Cloudflare 轨）+ `bash tools/deploy-oss.sh`（= 阿里云轨，**每版必推，不允许只推一轨**）+ `git tag vX.Y.Z && git push --tags`
5. 导出路径改动：prod URL playwright 实测（§2 第 6 步）
6. 更新 HANDOFF §0 版本行 + USAGE.md（如用户可感知的功能变化）
7. **公告草稿发刘彦君私聊**（含工具网址 + 本版变化摘要），用户确认后自行转发

与沃林工具的差异：本项目是 git 仓库，「每版新文件不覆盖」由 git 天然保证，无需复制文件。

**阿里云大陆通道架构**（2026-08-10 搭建，复刻发圈工具）：OSS bucket `xhs-poster-editor`（cn-shenzhen，public-read，SPA 404→index）→ CDN 加速域名 `xhsposter.tshzchen.cn`（回源 OSS）→ AliDNS CNAME。部署 = `tools/deploy-oss.sh`（hashed assets 长缓存 immutable、index 等 no-cache、自动刷新 CDN index）。凭据：本机 ossutil / aliyun CLI（与发圈工具同账号）。

**HANDOFF 纪律**（本次重构的起因）：「当前状态」只允许存在于 §0 一处。历史章节不要留「当前 prod」字样——2026-08 审查时发现 v5 章节还标着「当前 prod 状态」而实际已是 v8，两处「当前」互相矛盾。临时脚本一律放进 `tools/`（进 git），不要引用 `/tmp/` 路径——/tmp 会被系统清掉（test_prod.py 曾经只活在 /tmp，已丢过一次）。

---

## 3. 功能清单（现状）

| 模块 | 内容 |
|---|---|
| 编辑器（Tiptap） | H1/H2/H3、正文、引用、代码块、列表、加粗、下划线、撤销重做、插入图片、分页符、分隔线 |
| 顶部工具栏 | 主题下拉（内置/我的）、叠色 6 档、H1/H2/H3/正文字体独立选择、H1/H2/H3 加粗 toggle、H1 宽度 4 档、正文字号 5 档（联动标题）、间距密度 4 档、图片宽度 5 档、Logo 策略 4 种、参考线 toggle |
| 画布 | 多页 9:16 预览（40% 缩放）、首页 `.page--first` 4:3 安全区适配、普通页 9:15 出血适配、页码角标 |
| 主题库 | 内置 3（雅致/极简白/深夜黑）+ 用户主题（IndexedDB `xhs-poster-themes`），9:16 真图缩略图，可含正文快照 |
| 素材库 | 背景/Logo/图片三 tab × 内置/上传，IndexedDB `xhs-poster` 存 Blob |
| 字体库 | 拖拽上传 ttf/otf/woff/woff2/ttc，IndexedDB `xhs-poster-fonts`，FontFace 注册，启动时全量恢复 |
| 导出 | 单页 PNG / 多页 zip，重命名弹窗（默认取首个 H1），同名自动追 -2/-3 序号，scale 2 |
| 默认内容 | 5 页「使用教程」样张，开箱即见全功能演示 |

组件/模块地图见 §4 文件结构。各功能的实现细节和历史演进：`git log --oneline` + 对应 commit 的 HANDOFF 版本。

---

## 4. 仓库结构与开发命令

```
xhs-poster-小红书排版/
├── wrangler.jsonc        ← Workers 配置（assets = app/dist + SPA fallback）
├── ci.sh                 ← CI build（直调 binary 绕过 pnpm script runner，别改回 pnpm build）
├── package.json / .npmrc ← CI 兼容用（packageManager 字段 + frozen-lockfile=false）
├── HANDOFF.md            ← 本文件
├── README.md / USAGE.md  ← 开发者文档 / 用户说明
├── editor.html demo.html assets/  ← 旧 MVP，只读参考
├── source/               ← 内置素材原图，只读
├── tools/
│   ├── export-race-repro/       ← 导出回归验证脚本（test_prod.py ⭐）
│   ├── package-for-share.sh     ← 旧 MVP 打包（已过时，线上分发用 URL）
│   └── update-builtin-assets.sh ← 旧 MVP base64 素材生成（已过时）
└── app/
    ├── public/builtin-assets/   ← 内置背景/Logo
    └── src/
        ├── App.tsx              ← 主状态机：state → CSS vars、主题应用/保存、导出编排
        ├── components/
        │   ├── ui/              ← shadcn（button/dialog/tabs/select）
        │   ├── Editor/          ← Tiptap + 编辑工具栏（forwardRef 暴露命令式 API）
        │   ├── Preview/         ← 9:16 单页画布
        │   ├── Toolbar/         ← 顶部全局控件
        │   ├── AssetLibrary/ FontLibrary/ ThemeLibrary/ ThemePreview/ ExportDialog/
        ├── lib/                 ← 纯逻辑层（有单测的都在这）
        │   ├── themes.ts themeStore.ts    ← 主题模型 + IndexedDB
        │   ├── assetStore.ts fontStore.ts fontRegistry.ts fontPresets.ts
        │   ├── splitPages.ts fontSize.ts density.ts canvas.ts builtinAssets.ts
        │   └── exportPng.ts     ← ⚠️ 改前必读 §5
        └── styles/canvas.css editor.css
```

```bash
cd app
./node_modules/.bin/vite              # dev server（不要用 pnpm dev，被 msw 卡）
./node_modules/.bin/tsc -b            # 类型检查
./node_modules/.bin/vitest run        # 单测一次
./node_modules/.bin/vitest            # 单测 watch
pnpm test / pnpm test:watch           # 同上（依赖 workspace 配置正常）
pnpm add <pkg>                        # 装依赖（遇 ERR_PNPM_UNEXPECTED_STORE 见 §6）
pnpm dlx shadcn@latest add <comp>     # 加 shadcn 组件
```

---

## 5. Export PNG：v8 架构 + 战史（改导出前必读）

### v8 现行架构（exportPng.ts）

两层修法叠加，缺一不可：

1. **离屏渲染**（v7 引入）：deep clone `.page` 到 body 直接子节点的 fixed 屏外 stage（无 transform 祖先），bbox 天然 = 1080×1920。预览的 `transform: scale(0.4)` 与导出彻底解耦，源 DOM 零修改
2. **onclone 注入全量 CSS**（v8 引入）：html2canvas-pro 把 cloned DOM 放进 about:blank iframe 截图，prod 上 iframe 跨域加载 `<link>` stylesheet 会被 CORS 拦掉 → cloned doc 裸渲染。修法：`collectAllCss()` 把 `document.styleSheets` 全部 cssRules 转 text 注入 cloned doc `<head>`，同时拷贝 `:root` 的 inline CSS vars。对未来新主题/新素材天然鲁棒（全量复制，不依赖具体类名）

辅助机制：img 解码等待（5s 兜底）、`document.fonts.ready`、`hasRaceArtifact` 检测 + retry ×2（v5 遗留，v8 下基本不触发，留作兜底）、下载 60s 后才 revoke blob URL。

### 战史一览（v1~v8，细节看对应 commit 的 HANDOFF）

| 版本 | 思路 | 结局 |
|---|---|---|
| v1~v4.1 | 各种 onclone 改 transform/尺寸 | 全部失败：onclone 晚于 bbox 测量 |
| v5 | race 检测 + retry | 96% 缓解，不根治 |
| v6 | 截图前临时清源 DOM transform | 本地全绿，prod 非雅致主题仍坏 |
| v7 | 离屏渲染解耦预览/导出 | 修了 bbox，但 prod 上 CSS 进不了 iframe |
| v8 | v7 + onclone 注入全量 CSS | **终局**。prod 实测 3 主题各 5/5 |

### 铁律（八轮血泪）

- **本地 vite preview ≠ Cloudflare prod**。导出路径的任何修法，只有 prod URL 上 playwright 实测通过才能 claim 修好
- **像素采样 > 肉眼看图**：透明像素和坏布局肉眼看着相似，根因完全不同。采 4 角 + 中心 RGBA
- **不要在导出流程里修改源 React DOM**（img.src、inline data URL、批量锁尺寸都试过，race 概率反升）；闭包 + finally 恢复的临时改是唯一例外
- **要在导出里排除视觉元素**（如参考线）：用真实 DOM 子节点 + onclone `remove()`，**不要**用 `::before/::after`——html2canvas 处理伪元素早于 onclone
- `width/height` option 只控 canvas 尺寸，不控渲染区域（渲染区域由 bbox 决定）
- 雅致主题曾长期掩盖 bug：它有 `<img class="bg">`，CSS 全失效时视觉上仍"差不多对"。**测导出必须覆盖极简白/深夜黑**（纯 CSS 背景，一坏就暴露）

### 已知遗留

- ~~Step 12 加的导出进度回调（`exportPages` 第三参 + ExportDialog 显示 `3 / 6`）在 v7 重写时被静默丢弃~~ ✅ 2026-08-10 已恢复
- `hasRaceArtifact` + retry 在 v8 下属于死保险。副作用：右缘纯黑的自定义背景会每页白跑 3 遍渲染（导出时间 ×3）。2026-08-10 审查建议删除，暂保留观察

### ~~🐛 已知 bug~~ ✅ v1.2.0 已修（2026-08-10）

1. ~~**用户上传字体不参与导出渲染**~~：fontRegistry 注册时同存 `Map<family, blobURL>`（`getUserFontFaceCss()`），exportPng 的 onclone 把用户字体 `@font-face` 追加进注入 CSS，并 `await clonedDoc.fonts.ready`（3s 兜底）。本地像素对比验证：用户字体 vs 默认字体导出差异 10.4 万暗像素（字体真实生效）
2. ~~**「包含正文」主题里的插图存的是 blob URL**~~：image 节点加 `assetId` attribute（`data-asset-id`），applyTheme 时 `resolveContentImages()` 按 id 从 IndexedDB 重新 resolve src（纯遍历逻辑 `mapContentImages` 有单测）。注意：v1.2.0 之前保存的含插图旧主题无 assetId，无法修复，需重新保存

### ⚠️ 待验证疑点（v1.2.0 发现，未处理）

- **CDN 字体（ZCOOL/马善政/Long Cang/LXGW/Inter）在 prod 导出里可能同样回退**：Google Fonts stylesheet 跨域读不到 `cssRules`，被 `collectAllCss()` 跳过；iframe 里 `<link>` 重新加载在 prod 是否成功未验证。验证方法：prod 上 H1 选 ZCOOL 快乐体导出，与预览对比。若坏，治本 = §8 的「其余字体本地化」（fontsource 化后进 styleSheets 自然被覆盖）

---

## 6. 坑手册（按域分类，动手前扫相关域）

### pnpm / CI / Cloudflare

- **`pnpm dev` 卡死**：msw（shadcn Nova preset 带来的）有 ignored build script。绕过：直接 `./node_modules/.bin/vite`
- **`ERR_PNPM_UNEXPECTED_STORE`**：brew pnpm 11（store v11）vs `packageManager: pnpm@9`（corepack，store v3）冲突。装包时临时删 `app/package.json` 的 `packageManager` 字段，装完恢复。不要改全局 store-dir
- **Cloudflare CI 四连坑**（都已在仓库配置里修好，别动）：无根 package.json 被识别为 Worker（→ wrangler.jsonc）；被当 pnpm monorepo（→ `--ignore-workspace`）；CI pnpm 版本读不懂 lockfile v9（→ packageManager 字段 + frozen-lockfile=false）；`pnpm run` 触发 workspace 检测（→ ci.sh 直调 binary）
- **Cloudflare「Retry build」重跑的是旧 commit**，不是 main HEAD。要新代码必须 push（无改动就 `git commit --allow-empty -m "trigger"`）
- **build 排查顺序**：错误尾部 `pnpm help install`（依赖阶段）还是 `pnpm help run`（workspace 阶段）→ build log 的 commit 是不是 main HEAD → "resolved 1, downloaded 0" = pnpm 版本 → "packages field missing" = workspace 检测 → "ci.sh: No such file" = 旧 commit
- **TS 6 废弃 baseUrl**：paths 直接写 `"@/*": ["./src/*"]`

### shadcn / Radix

- `DialogContent` 默认 `sm:max-w-sm`（384px），要宽必须带 prefix 传 `sm:max-w-3xl`
- `DialogContent` 是 grid 但没设列，内部 `w-full` 失效 → 必传 `grid-cols-1`
- `Tabs` 源码的 `data-horizontal:flex-col` 永远不匹配（Radix 实际设 `data-orientation`）→ 每个 `<Tabs>` 显式加 `className="flex-col"`；改源码的治本写法是 `data-[orientation=horizontal]:flex-col`
- Radix Select 用 `onValueChange`；value 必须非空字符串（脱离主题用 `__custom__` sentinel）
- Dialog a11y：`ui/dialog.tsx` 已内置默认 sr-only Description，新 Dialog 可传 `description` prop

### Tiptap

- `Node` 从 `@tiptap/react` re-export 引，**不要**从 `@tiptap/core`（没装、也没 hoist）
- `setContent` 传 doc JSON 时用 `as never` 绕类型（v3 泛型签名不友好），报类型错先查这
- 空段落 `<p></p>` 画布高度为 0：CSS 用 `p:empty::before { content: '​' }` + min-height 撑
- 自定义 Node 的 `parseHTML` 加 `priority: 1000` 才能抢在 StarterKit 前匹配（Divider vs HorizontalRule）

### 字体 / 样式

- Tailwind v4 preflight 清掉 `ul/ol` 的 list-style，显示列表处必须显式声明 `disc`/`decimal`（canvas.css 和 editor.css 都要）
- 主题预设里的字体值必须**直接引用** fontPresets 某个 option 的 value——手写新 stack 会让 select 匹配不上静默回退第一项（踩过两次）
- 用户字体：先 `registerFontFromBlob` 成功才存 IndexedDB（防坏字体入库）；fontRegistry 重注册先 delete 旧 FontFace
- `fileNameToFamily` 类字符串清洗：trim 一律放最前（`$` 锚定正则对尾部空格不匹配，先 replace 后 trim 会漏）

### 下载 / 文件

- `triggerDownload` 必须 `document.body.appendChild(a)` 再 click（detached `<a>` 会被吞）
- `URL.revokeObjectURL` 至少延迟 60s（大 zip 真实写盘需要时间，1s revoke 会截断文件：下载条目在但文件损坏）
- 同名下载被 macOS 静默重命名 `xxx 2.png`，用户以为没更新 → ExportDialog 用 `usedNamesRef` 自动追 -2/-3

### 环境差异

- **dev ≠ prod（本地方向）**：dev server 下 file picker 不弹（StrictMode/HMR 副作用），prod 正常。涉 user gesture / Portal 的怪事先 build + preview 复现再深挖
- **本地 ≠ prod（远端方向）**：见 §5 铁律第一条

---

## 7. 不要做的事（速查）

- ❌ 不要做用户没要求的功能（YAGNI）；不要为「以后可能用」加抽象层；不要瞎补 try/catch
- ❌ 不要重写/维护 `editor.html`、`assets/builtin-assets.js`、`demo.html`（旧 MVP 只读）
- ❌ 不要碰 `source/` 原图
- ❌ 不要换 Tiptap；不要用原生 `<select>`（macOS Chrome popup 字号巨大）
- ❌ 主题数据不要存 blob URL，只存 assetId
- ❌ 不要动 Cloudflare 后台 build 配置；不要在仓库根加 `pnpm-workspace.yaml`（CI 会覆盖成空）；不要把 build command 改回 `pnpm build`
- ❌ 不要把用户素材转 base64 存 localStorage（用 IndexedDB Blob）
- ❌ 导出流程不要修改源 React DOM；排除视觉元素不要用伪元素（见 §5 铁律）
- ❌ 不要引用 `/tmp/` 下的脚本路径进文档——脚本进 `tools/`

---

## 8. 下一步候选（未拍板；2026-08-10 用户确认：以下均放后续新窗口做，不与 bug 修复混版本）

0. **阿里云 OSS 双轨部署**（用户已点名要做）：对齐沃林发圈工具的大陆通道方案（surge/CF + OSS 双轨）。届时启用发圈工具的**双轨发版纪律：每版两轨都必须推**，ossutil 2.x 缓存头用 `--cache-control`。参考记忆 `project_wallin_moments_tool`
1. **其余字体本地化**：ZCOOL / Ma Shan Zheng / Long Cang 仍走 Google Fonts，大陆卡就 fontsource 化；**顺带根治 §5 的 CDN 字体导出疑点**
2. **标题字重下拉**：`h1Bold` boolean → `h1Weight: 100–900`（fontsource 已载 9 档）
3. **图片对齐**（左/中/右）与**拖拽手柄缩放**（档位不够用时）
4. **PWA**（vite-plugin-pwa，可安装到 Dock）
5. **自定义域名**（~¥80/年）
6. **字体冗余清理**：删 fontsource 的 .woff 只留 .woff2，dist 体积约减半（115MB → ~60MB）
7. **Tauri 打包** macOS .app
8. **自动分页**（段落不跨页）——老 roadmap 里的 Step 6 原始愿望，一直没做
9. **hasRaceArtifact/retry 简化**（v8 稳定运行数月后可清）

---

## 9. 用户偏好

- 诚实优先、不偷懒、做不到直说；先查自身再怪外部
- 响应简短直接；关键决策用 AskUserQuestion 给选项，第一个标推荐
- 中文注释解释 WHY 不写 WHAT
- UI 改动 Playwright 截图自查后再交用户目检
- 版本管理：迭代不覆盖原文件（全局记忆规则）
- 终端统一 iTerm2

---

## 10. 新会话开场建议

```
我在继续做小红书排版编辑器项目（已上线 Cloudflare）。请先读 HANDOFF：

/Users/a0000/Nutstore Files/Claude_YJ/Scripts-脚本工具集/xhs-poster-小红书排版/HANDOFF.md

读完告诉我你理解的现状，然后我们做 <目标>。
```
