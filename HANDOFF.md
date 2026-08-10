# 小红书排版编辑器 · Handoff 文档

> 给下一个会话窗口的 Claude 看的项目交接文档。
> 🌐 **生产 URL：Cloudflare `https://xhs-poster-editor.l-yanjunnn.workers.dev`｜大陆通道 `https://xhsposter.tshzchen.cn`**
> 最后更新：2026-08-10（v1.3.0 上线闭环完成。旧版全文在 git 历史，`git log -- HANDOFF.md` / `git show <commit>:HANDOFF.md` 可考古）

---

## 0. 现状快照（30 秒接手）

| 项 | 值 |
|---|---|
| 线上版本 | **v1.3.0**。正式代码提交 `a12d159`，tag `v1.3.0`；Cloudflare 与 OSS/CDN 均加载 `assets/index-v0W3nzMj.js`，包内版本号已核验 |
| 本地候选 | 父级便捷预览副本：`/Users/a0000/Nutstore Files/Claude_YJ/小红书排版编辑器-v1.3.0-本地候选版/`，双击目录内 `.command` 启动器即可打开；正式归档见 `archive/dist-v1.3.0/` |
| 状态 | **v1.3.0 双轨稳定在线**。9:15、首图 3:4 裁切参考、文字可靠性与真实草稿均已发布；继续保持手动分页 |
| 技术栈 | Vite + React 19 + TS + Tailwind v4 + shadcn/ui + Tiptap 3 |
| 部署 | **双轨**。轨一：Cloudflare Workers，`git push origin main` 自动 build+deploy（1–3 分钟），不要碰后台；轨二：阿里云 OSS+CDN 大陆通道 `https://xhsposter.tshzchen.cn`，`bash tools/deploy-oss.sh`。**双轨发版纪律：每版两轨都必须推**（沃林发圈工具欠费停服事故教训） |
| 仓库 | https://github.com/l-yanjunnn/xhs-poster-editor （public，main） |
| 本地 | `/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/`，React 工作目录在 `app/` |
| 测试基线 | v1.3.0：vitest 62/62、tsc -b、ESLint、build、diff-check、`test_v130_local.py` 全绿；2026-08-10 20:25 CST 双生产入口 `test_prod_deep.py` 均通过（三主题单页、2160×3600、自定义字体），Cloudflare `test_prod.py` 连续 5 轮 × 5 页共 25 张均为 2160×3600 |
| 定位 | 小红书 9:15（3:5）长图排版工具，给非技术用户开箱即用。阶段 A：纯静态站点（无登录无后端） |

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
8. **画布**：真实 9:15（1080×1800），导出 scale 2（2160×3600）；首图只在预览叠加中心 3:4 裁切参考，源图尺寸不变
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
   ./node_modules/.bin/vitest run    # 单测（当前 62 个，<1s）
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
6. **归档**：`bash tools/archive-release.sh` → `archive/dist-vX.Y.Z/`（对齐发圈工具文件管理法：历史版本永留 archive/，同版本拒绝覆盖；归档=应用核心 ~6MB，字体走 manifest + git tag 复原）
7. 更新 HANDOFF §0 版本行 + USAGE.md（如用户可感知的功能变化）
8. **公告草稿发刘彦君私聊**（含工具网址 + 本版变化摘要），用户确认后自行转发

与沃林工具的差异：本项目是 git 仓库，「每版新文件不覆盖」由 git 天然保证，无需复制文件。

**阿里云大陆通道架构**（2026-08-10 搭建，复刻发圈工具）：OSS bucket `xhs-poster-editor`（cn-shenzhen，public-read，SPA 404→index）→ CDN 加速域名 `xhsposter.tshzchen.cn`（回源 OSS）→ AliDNS CNAME。部署 = `tools/deploy-oss.sh`（hashed assets 长缓存 immutable、index 等 no-cache、自动刷新 CDN index）。凭据：本机 ossutil / aliyun CLI（与发圈工具同账号）。

HTTPS：CAS 免费 DV 证书（CertId 26549959，2026-08-10 签发，1 年期，联系人刘彦君 19303019049）。**续期流程**：`aliyun cas CreateCertificateRequest`（ValidateType DNS）→ `DescribeCertificateState` 拿 `_dnsauth` TXT 值 → AliDNS 加 TXT → 签发后 `aliyun cdn SetCdnDomainSSLCertificate --CertType cas --CertId <新ID> --SSLProtocol on` → 删 TXT。坑：新 OSS bucket 默认 `BlockPublicAccess=true` 会压掉 public-read ACL，要先 `put-bucket-public-access-block` 关掉再设 ACL；CAS API 必须显式 `--endpoint cas.aliyuncs.com --region cn-hangzhou`。

**HANDOFF 纪律**（本次重构的起因）：「当前状态」只允许存在于 §0 一处。历史章节不要留「当前 prod」字样——2026-08 审查时发现 v5 章节还标着「当前 prod 状态」而实际已是 v8，两处「当前」互相矛盾。临时脚本一律放进 `tools/`（进 git），不要引用 `/tmp/` 路径——/tmp 会被系统清掉（test_prod.py 曾经只活在 /tmp，已丢过一次）。

---

## 3. 功能清单（现状）

| 模块 | 内容 |
|---|---|
| 编辑器（Tiptap） | H1/H2/H3、正文、引用、代码块、列表、加粗、下划线、选中短语不拆行（≤12 字）、撤销重做、插入图片、手动分页符、分隔线；粘贴/恢复时保守清理中文粗体边界异常空格 |
| 顶部工具栏 | 主题下拉（内置/我的）、叠色 6 档、H1/H2/H3/正文字体独立选择、H1/H2/H3 加粗 toggle、H1 宽度 4 档、正文字号 5 档（联动标题）、间距密度 4 档、图片宽度 5 档、Logo 策略 4 种、草稿状态/管理、裁切参考 toggle |
| 画布 | 多页真实 9:15 预览（40% 缩放）、首页中心 3:4 裁切参考（上下遮罩 + 橙线，仅预览）、页码角标 |
| 草稿库 | IndexedDB `xhs-poster-documents` 保存完整 Tiptap JSON + 15 项样式/素材 id；900ms 自动保存、同步 WAL 保护立即关页、刷新恢复、另存/切换/删除；写入串行，并用浏览器原子 Web Lock 让第二标签页只读，防旧快照覆盖新编辑 |
| 主题库 | 内置 3（雅致/极简白/深夜黑）+ 用户主题（IndexedDB `xhs-poster-themes`），9:15 真图缩略图；v1.3 起新主题只存样式，历史含正文主题仍可兼容打开 |
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
├── archive/              ← 版本归档（发圈工具管理法：历史版本永留此处不覆盖）
│   ├── dist-vX.Y.Z/             ← 每版构建产物核心快照（archive-release.sh 生成）
│   └── 旧MVP-单文件版/           ← editor.html + demo.html + base64 素材 + 旧打包脚本
├── source/               ← 内置素材原图，只读
├── tools/
│   ├── deploy-oss.sh            ← 阿里云轨部署
│   ├── archive-release.sh       ← 发版归档
│   └── export-race-repro/       ← 导出回归脚本（test_prod_deep.py ⭐ / test_prod.py）
└── app/
    ├── public/builtin-assets/   ← 内置背景/Logo
    └── src/
        ├── App.tsx              ← 主状态机：state → CSS vars、主题应用/保存、导出编排
        ├── components/
        │   ├── ui/              ← shadcn（button/dialog/tabs/select）
        │   ├── Editor/          ← Tiptap + 编辑工具栏（forwardRef 暴露命令式 API）
        │   ├── Preview/         ← 9:15 单页画布 + 首页 3:4 裁切参考
        │   ├── DraftLibrary/    ← 草稿另存、切换、删除
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

1. **离屏渲染**（v7 引入）：deep clone `.page` 到 body 直接子节点的 fixed 屏外 stage（无 transform 祖先），bbox 由画布常量固定为 1080×1800。预览的 `transform: scale(0.4)` 与导出彻底解耦，源 DOM 零修改
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
- ❌ 不要重写/维护旧 MVP（已入档 `archive/旧MVP-单文件版/`，只读）；不要动 `archive/` 里的任何历史版本（归档永不覆盖，改动=新版本号新归档）
- ❌ 不要碰 `source/` 原图
- ❌ 不要换 Tiptap；不要用原生 `<select>`（macOS Chrome popup 字号巨大）
- ❌ 主题数据不要存 blob URL，只存 assetId
- ❌ 不要动 Cloudflare 后台 build 配置；不要在仓库根加 `pnpm-workspace.yaml`（CI 会覆盖成空）；不要把 build command 改回 `pnpm build`
- ❌ 不要把用户素材转 base64 存 localStorage（用 IndexedDB Blob）
- ❌ 导出流程不要修改源 React DOM；排除视觉元素不要用伪元素（见 §5 铁律）
- ❌ 不要引用 `/tmp/` 下的脚本路径进文档——脚本进 `tools/`

---

## 8. 下一版本与后续候选

### v1.4.0「桌面交互与可靠性版」（2026-08-10 用户拍板；新窗口执行）

参考只读源：`/Users/a0000/Nutstore Files/Claude_YJ/Wallin-发圈工具/` v12.3。学习其**交互原则**，不要复制全局变量、命令式 DOM 或单 Canvas 架构；本项目继续保留 React + Tiptap + 现有分页/导出引擎。

桌面 UI/UX 提案 v1：[`docs/design/v1.4.0/xhs-editor-v1.4-ui-baseline-v1.png`](docs/design/v1.4.0/xhs-editor-v1.4-ui-baseline-v1.png)。这是下一版的视觉与交互基线，不是已经完成的产品截图。用户于 2026-08-10 确认「暂时觉得不错」，v1.4 按此方向开工，细节仍可在实装截图后微调。

**本版必须作为一套能力同时完成，不能拆成互不衔接的几个按钮：**

1. **图片选中与直接缩放**：点击主编辑面中的正文图片出现清晰选中框与缩放手柄；拖手柄等比缩放，宽度限制 10%–100%；一次拖动只形成一次撤销记录和一次草稿更新
2. **图片语义对齐**：每张图片独立支持左 / 中 / 右对齐，不再只有全局宽度档；旧图片无 `align` 时按 `left` 兼容，不能改变历史草稿外观。对齐可由上下文按钮或专用横向抓手触发；若做整图横拖，松手时只能落到 `left / center / right`，未吸附则回滚，绝不产生自由坐标
3. **磁吸对齐**：磁吸是对齐/缩放过程的默认辅助，不是孤立的工具模式。位置目标至少包含内容区左边界、画布中心线和内容区右边界；缩放目标包含 33% / 50% / 66% / 75% / 100% 宽度档。缩放手柄只改 `width`，吸中才显示蓝色临时对齐线，继续拖远即可脱开，`Option/Alt` 临时关闭磁吸
4. **版心参考线**：在现有首图 3:4「裁切参考」之外新增独立的「排版参考」开关，显示内容区左右边界、中心线和上下安全线；裁切参考 / 排版参考 / 磁吸三个状态彼此独立
5. **编辑层不进成品**：若左侧 Tiptap 是主编辑面，NodeView 选框与手柄不得序列化；若中央画布是主编辑面，React 选框、手柄、版心参考线和磁吸线统一作为可剥离覆盖层，进入 `.page` 的节点使用真实 DOM + `data-preview-only`。导出 PNG 必须主动剥离，不能使用难以排除的伪元素
6. **完整可靠性闭环**：对齐与尺寸写入 Tiptap JSON，草稿另存/恢复、撤销重做、手动分页、多页 ZIP、三主题和 2160×3600 导出全部保持一致；图片变大导致本页溢出时只提示，不在本版偷偷加入自动分页
7. **桌面编辑器外壳重排**：全局动作在顶部、正文编辑在左、9:15 成品画布居中、当前对象属性在右。顶部只保留版本、撤销重做、草稿状态、参考线和导出；字体、图片等参数按当前选中对象进入右侧上下文检查器
8. **轻量最近操作与状态反馈**：显示最近 3–5 条本会话已提交动作，例如「插入图片 / 居中对齐 / 调整为 66%」；一次手势只生成一次动作。它只帮助用户理解刚才发生了什么，不持久化、不支持任意回跳，也不另造一套历史系统；真正撤销/重做继续复用 Tiptap 历史
9. **普通用户可恢复的失败路径**：字体、图片或主题资源缺哪个只降级哪个，原地给出原因与重试，不得要求用户刷新后丢失编辑内容；导出前统一检查资源是否就绪，加载中就等待，失败时给明确的重试或继续入口
10. **主次操作与按需加载**：导出是唯一强文字 CTA；次级动作允许图标化但必须有中文提示和清楚禁用原因。图片面板等重功能在用户选中对象或打开面板后再预热，避免首屏为暂时不用的功能付出成本
11. **正文荧光笔**：只对用户当前选中的文字应用，不影响整段或后续输入；本版只提供固定基色 `#7B3B8B`，不加入调色盘。透明度使用 0%–100% 无极滑杆，默认 50%，界面实时显示当前百分比；未选中文字时禁用并提示「请先选中文字」

**架构边界（新窗口不要走错）：**

- 当前图片已经是 Tiptap block node，保存 `src / assetId / width`；推荐只新增 `align: left | center | right`，继续用百分比 `width` 与 `height:auto`。历史 `width:null` 仍表示「原大小」，第一次拖动缩放时才转成百分比
- 第一阶段做**流式文档里的横向磁吸**，不保存自由 `x / y / height / transform`，不做纵向磁吸；正文顺序和纵向占位仍由文档流决定
- 先抽出独立 Image Extension，正式 `renderHTML` 始终保持单个根级 `<img>`。若左侧是主编辑面，再使用 React NodeView；若中央画布是主编辑面，则使用 React 覆盖层和映射桥，不在左侧再做第二套手柄。两条路线都必须在拖动时只改临时状态，`pointerup` 一次性提交属性，`pointercancel / Esc / 失焦` 可回滚
- 不要直接启用 Tiptap 自带像素 resize：编辑区、1080 画布、40% 预览是三套尺度，必须继续存百分比
- 预览与导出必须继续同源：选框、手柄、磁吸线和参考线都是可剥离编辑层；正式布局数据只能来自 Tiptap / ThemeConfig，不能从 Preview DOM 反向猜取
- 荧光笔使用独立 Tiptap mark，颜色与透明度作为语义属性分开保存，例如 `color: '#7B3B8B' / opacity: 0.5`，渲染时再组合成背景色；不要只把临时 `rgba(...)` 写进 DOM。它必须随 JSON/HTML、草稿和复制粘贴稳定往返，旧文档无此 mark 时保持原样

**已确认的主编辑面：中央 9:15 成品画布。**

- 中央 9:15 成品画布直接选图、缩放与吸附；左侧负责正文录入和结构编辑，右侧负责所选对象参数
- 稳定 `imageId`、复制粘贴去重、`Preview imageId → Tiptap node position` 映射及预览比例坐标换算是 v1.4 必做；中央画布是唯一图片直接操作面，左侧不得再维护第二套独立选框/拖动状态
- Tiptap 始终是唯一数据源，Preview DOM 不得成为持久数据源；若实装后需要改变主编辑面，必须先让用户看截图确认，不能在开发中自行退回双套交互

**桌面操作界面基线：本版编码范围，不再只停留在线框图：**

- 桌面端学习沃林的层级：**全局动作在顶部、正文编辑在左、成品画布居中、当前对象属性在右**。顶部只留版本/撤销重做/草稿状态/参考线/导出等全局动作，不再横向塞满所有字体和图片参数
- 右侧改为上下文检查器：未选对象时显示页面/主题；选中文字时显示排版与荧光笔；选中图片时只显示对齐、宽度、替换、删除。高级项按需展开，不让非设计用户一次看到全部控制
- 画布上的悬停轮廓、选中框、手柄、临时蓝线与状态文案必须明确区分「可点 / 已选 / 正在吸附」；禁用项要直接说明原因
- 悬停、选中、吸附、保存中、已保存、保存失败六类状态必须有可区分的反馈；不能只靠 toast，也不能让提示遮住画布
- 保持「受控自由度」：优先左中右、宽度档位、磁吸和安全边界，不把 Figma / Adobe 的自由坐标、旋转和复杂图层能力搬进本版

**v1.4.0 必测：**旧草稿兼容；非法宽度/对齐归一化；`getJSON → setContent → getHTML` 后仍是单个 `<img>` 且分页不变；`resolveContentImages` 后 `width / align / assetId` 不丢；左中右与缩放在编辑器/预览/导出三处一致；缩放不触发节点重排；一次手势一次 undo 且 redo 可恢复；磁吸阈值与 Alt 旁路；Esc/失焦/pointer cancel 回滚；多图只改选中项；第二页图片不改变分页；刷新/另存恢复；资源缺失的局部降级与原地重试；导出就绪检查；所有辅助层、最近操作和溢出提示不进导出；`imageId` 复制粘贴去重、第二页映射与预览比例坐标换算。荧光笔另测：只命中选区、默认 50%、0%/100% 边界、连续调节、撤销重做、JSON/HTML 往返、草稿恢复，以及编辑器/预览/PNG 三处颜色与透明度一致。

### v1.4.0 从沃林吸收什么、明确不照搬什么

1. **吸收**：画布优先、全局动作与对象动作分层、明确选中态、命中才出现的磁吸线、一次手势一次撤销、命名操作反馈、资源局部降级、原地重试、导出就绪防线、按意图加载、受控自由度、预览与导出同源
2. **不照搬**：Wallin 的全局变量、命令式 DOM、单 Canvas、自由 `x/y`、图片旋转、中心正方形裁切区、固定 4% 边距、右键/字母快捷键主路径，以及「最近导出即草稿」
3. **完整可点击回跳的修改时间线暂不做**：Tiptap 没有现成动作标签与任意回跳能力，为它另造持久快照系统会把图片交互版本拖成历史系统重构；v1.4 先用轻量最近操作 + 原生撤销重做验证价值
4. **独立自诊断页暂不做**：本版先完成资源就绪检查、局部降级和原地重试；只有真实故障数据证明需要时，再建设完整自诊断页

### 后续版本路线（仅 v1.4.0 已拍板；其余在开工前再次确认）

1. **v1.4.0 桌面交互与可靠性版（下一版）**：图片直接操作、等比缩放、左中右对齐、磁吸、排版参考线、正文荧光笔、桌面编辑器外壳、轻量最近操作、草稿与导出可靠性，以及上述沃林 UX 原则
2. **v1.5.0 文档自动编排版**：Markdown 导入、结构解析、图片资源映射、自动编排、自动分页；继续保留手动分页与人工校正，不能把自动结果变成不可修改的黑盒
3. **v1.6.0 内容模板版**：封面专属标题 + 钩子正文、模板数据结构、首个完成度高的公考官方模板；先验证一套，不承诺模板市场
4. **v1.7.0 视觉资产质量版**：标题字重档位、ZCOOL / Ma Shan Zheng / Long Cang 等字体本地化、字体冗余清理、字体与图片在预览/导出中的一致性、加载性能优化
5. **v1.8.0 交付与诊断版（按需要）**：PWA 安装、部署/资源诊断、稳定运行后简化 `hasRaceArtifact/retry`；Tauri macOS `.app` 只在确有离线桌面分发需求时再评估，不与 PWA 同时默认开工
6. **v2.0.0 运营机器产品壳**：项目首页、素材入口、历史作品、工作流导航等全局 UI/UX 与信息架构更新；只换产品壳和工作流，不重写已经稳定的排版、草稿与导出引擎
7. **远期候选：手机端，不预占版本号**：当前不做、不进 v1.4 测试矩阵。桌面功能稳定且出现明确移动场景后，再学习沃林的「共享引擎 + 独立手机壳」，单独设计底部抽屉、触控命中、双指手势与微信保存链路；绝不把桌面侧栏直接压缩到手机

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

/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/HANDOFF.md

读完告诉我你理解的现状，然后我们做 <目标>。
```
