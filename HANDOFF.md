# 小红书排版编辑器 · Handoff 文档

> 给下一个会话窗口的 Claude 看的项目交接文档。
> 🌐 **生产 URL：Cloudflare `https://xhs-poster-editor.l-yanjunnn.workers.dev`｜大陆通道 `https://xhsposter.tshzchen.cn`**
> 最后更新：2026-08-12（本地 v1.7.1「确定性排版修复版」已完成实现、自动测试、最小回归与真实 19 页导出；尚未提交、推送、部署、打 tag、归档或发送公告。当前线上稳定版仍为 v1.7.0。旧版全文在 git 历史，`git log -- HANDOFF.md` / `git show <commit>:HANDOFF.md` 可考古）

---

## 0. 现状快照（30 秒接手）

| 项 | 值 |
|---|---|
| 线上版本 | **v1.7.0**。发布提交/tag 为 `87a2d89` / `v1.7.0`；Cloudflare 与 OSS/CDN 均加载 `assets/index-BKYNhwYN.js` + `assets/index-BVsea9B1.css`。JS SHA-256 `fbfafa1ec17407fc9886b7d7e74977d7622324275106949219d9c3b202b60dfc`，CSS SHA-256 `39a1a1dbc10c2debdfb209ad5b68b42ee686a9bfb9cfa62563627fb3bcd71c13`，两入口与 `archive/dist-v1.7.0/` 发布归档完全一致 |
| 本地候选 | **v1.7.1，待用户验收，未发布**。已用共享行级快照替换浏览器/html2canvas 各自排版；非末行绝对对齐，标点按实际墨迹求解双侧净空、连续标点共享边界、行末按可见右缘悬挂，标点→汉数/拉丁边界→统一汉缝三阶段求解；逐字素真实 baseline、跨行下划线/荧光笔矩形、精确字体预检和导出硬门禁已接入。验证报告：`docs/v1.7.1/V1.7.1-VALIDATION.md` |
| 本地归档 | 当前完整构建在 `app/dist/`；v1.7.0 不可覆盖核心快照在 `archive/dist-v1.7.0/`（9.5M，排除字体 3337 个，清单见 `FONTS-MANIFEST.txt`）；v1.5.1 / v1.5.0 / v1.4.1 / v1.4.0 归档继续保留，完整复原走对应 tag + `bash ci.sh` |
| 状态 | **线上 v1.7.0 双轨稳定**。导入文稿、同一可编辑新草稿、独立发布文案、17/18/19+ 边界、一次完整目录/ZIP 导出、自选页码、同会话续写剩余页和中文正文两端对齐均已进入生产；精确 tag `v1.7.0` 固定在 `87a2d89` |
| 当前迭代 | **本地 v1.7.1 已可供验收**。自动测试、类型检查、ESLint、构建、最小排版样例和真实 19 页完整导出均通过；抽查页 1/2/3/5/19 均为原生 2160×3600 PNG。未经用户再次明确同意，不提交、不推送、不部署、不打 tag、不归档、不发公告。原生长文、字体全集本地化/减重/字重档位/结构化封面、37+ 上传分组整体重均衡与跨刷新目录续写继续延期 |
| v1.7.0 发布闭环 | **2026-08-11 全部完成**：Cloudflare + OSS/CDN 双轨加载同一构建；两入口 18/19 页导入、19 页真实 ZIP、1/2/5 页旧链、三旧主题、用户字体、撤销重做和 2160×3600 输出全绿；Cloudflare 另完成 5 页原生目录写入；`archive/dist-v1.7.0/` 已生成。旧企业租户 `default` 的「Claude聊天助手」已向刘彦君既有发布会话发送公告，消息 `om_x100b6887b2a35ca8b4a99575b534996` |
| v1.5.1 发布闭环 | **2026-08-11 全部完成**：`main` 与精确 `v1.5.1` tag 已推送，Cloudflare + OSS/CDN 双轨加载同一构建；两入口的 1/2/5 页、公考 Cover/Inner、标题字形、旧三主题、用户字体、2160×3600 导出和不依赖 dev hook 的 WP1–WP4 生产 UI 冒烟全绿；归档已生成。19:04 CST 使用飞书旧企业租户 `default` 的「Claude聊天助手」机器人发送专业公告至刘彦君 1v1，消息 `om_x100b6884555fe8b4b16098c17098e27` 已回读确认 |
| v1.5.0 发布闭环 | **2026-08-11 全部完成**：15:48 CST 完成 `main` / 精确 tag 推送、Cloudflare + OSS/CDN 双轨上线、两入口 1/2/5 页公考矩阵及旧三主题/用户字体深回归；16:10 CST 使用飞书旧企业租户的既有机器人将 `docs/RELEASE-v1.5.0.md` 专业公告发送至刘彦君 1v1 私聊并回读确认；Markdown 导入/自动编排继续顺延 |
| 技术栈 | Vite + React 19 + TS + Tailwind v4 + shadcn/ui + Tiptap 3 |
| 部署 | **双轨**。轨一：Cloudflare Workers，`git push origin main` 自动 build+deploy（1–3 分钟），不要碰后台；轨二：阿里云 OSS+CDN 大陆通道 `https://xhsposter.tshzchen.cn`，`bash tools/deploy-oss.sh`。**双轨发版纪律：每版两轨都必须推**（沃林发圈工具欠费停服事故教训） |
| 仓库 | https://github.com/l-yanjunnn/xhs-poster-editor （public，main） |
| 本地 | `/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/`，React 工作目录在 `app/` |
| 测试基线 | v1.7.0 正式版：Vitest **37 文件 / 292 测试**、`tsc -b`、ESLint、Vite build 全绿；新增解析、17/18/19+、范围归一、无丢页/重复页、单文件夹/单 ZIP、清单、目录中断/清单失败续写、超长 UTF-8 文件名、同名普通文件碰撞、发布文案兼容与两端对齐断言。两个生产入口分别通过 18/19 页导入与约 196 MB 的 19 页真实 ZIP，旧链 1/2/5 页、三旧主题、用户字体、撤销重做与标题边界回归全绿；Cloudflare 另完成 5 页真实目录写入，5 张 PNG 与清单完整；两入口 console/page error 均为 0 |
| v1.7.1 本地门禁 | Vitest **40 文件 / 385 测试**、`tsc -b`、ESLint、Vite build 全绿；最小样例严格指标：行末误差 0、汉缝行内最大偏差 0、混排 baseline 差 0、标点墨迹完整覆盖、双侧可见净空逐边界合规、普通文字夹冒号左右差 0、行末连续标点联合求解与可见右缘误差 0、跨行下划线逐行存在；双引号内侧首选 0.18em（下限 0.14em）、外侧首选 0.22em（下限 0.16em），逗号/顿号文字前距下限 0.15em；预览/导出像素配对的行列 lag 均为 0，H2 竖条顶部差 0、bbox 最大差 1px。真实 19 页 19/19 导出，206 行 / 90 条两端对齐行全部通过 |
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
6. **字体**：核心字体（思源黑/宋全档）走 fontsource npm 包（unicode-range 分片按需加载，大陆稳）；ZCOOL/Ma Shan Zheng/Long Cang/LXGW 走 CDN；用户自定义字体走 FontFace API + IndexedDB。苹方简因版权不能嵌
7. **主题（原「模板」）**：可复用视觉方案继续统一叫主题；扁平 JSON schema；**只存 assetId 不存 blob URL**（blob URL session-bound，刷新失效，是老模板功能翻车根因）。v1.5 用户口中的「公考模板」按**内置页面角色主题**落地，`contentJSON: null`，套用时不覆盖正文；只有未来确定要携带正文骨架/字段槽位时，才拆独立 `PosterTemplate`
8. **画布**：真实 9:15（1080×1800），导出 scale 2（2160×3600）；首图只在预览叠加中心 3:4 裁切参考，源图尺寸不变
9. **分页**：手动 `<hr class="page-break">`（Tiptap HorizontalRule 全部配置为分页符）；装饰分隔线是独立 `Divider` 节点（`hr.divider`）
10. **部署**：Cloudflare Workers Static Assets + GitHub auto-deploy，build 走 `bash ci.sh`
11. **旧 MVP**：`editor.html` + `assets/` + `demo.html` 保留作参考，不再维护
12. **页面角色底图**：v1.5 保留 `bgAssetId` 的旧语义（默认/内页底图），只新增 `coverBgAssetId` 作首页覆盖；页角色永远由当前页序推导，不存逐页背景数组
13. **封面语义色**：v1.5 用 `coverTitleColor` / `coverSubtitleColor` 作为 Theme/草稿样式，不写进 Tiptap 文字 mark；副标题严格定义为首图第一个 H1 后紧邻的第一个正文段，不得误染全篇正文
14. **工具可见性**：用户要求正文编辑工具全部常驻；不再使用「更多」、动态收纳或横向滚动。左栏继续固定桌面宽度，用稳定两行分组承载；右侧高级字体等设置仍可渐进展开，不在此要求内
15. **分页结构不变量**：`hr.page-break` 必须是 Tiptap `doc` 的直接子节点；工具栏插入、粘贴、草稿/恢复载入都不得留下 `li > hr.page-break` 等嵌套分页。`splitIntoPages` 继续只切顶层分页；禁止用 CSS 拉宽伪修复，也禁止递归搜 HR 后粗暴切 HTML
16. **v1.7 导入事务**：「导入文稿」固定在顶栏全局动作区；解析确认使用覆盖式大 Dialog。解析本身不碰当前草稿，用户确认后先落盘一个完整的新 `EditorDocumentV2`，再切换 UI。导入结果是普通 Tiptap 草稿，必须可继续手动编辑、分页、撤销和自动保存
17. **发布文案独立语义**：专用结构中 `# 正文` 以下内容写入草稿可选 `publication` 元数据，只在右栏独立卡片显示/编辑/复制，不混入成品页，不随选择页码复制，不自动添加“上篇 / 下篇”。沿用可选 V2 字段而非强升 V3，优先保证旧版能继续看到导入正文
18. **普通图文兼容线不是编辑器上限**：高置信兼容线集中在 `productConfig.ts` 的 `ORDINARY_POST_IMAGE_LIMIT`，当前为 18；它只控制提示和全部超限确认。超过后仍完整生成一个草稿、允许手动调整和一次完整导出，不截断、不缩字、不改写、不默认拆草稿；原生长文是另一平台管线，本版不接入
19. **v1.7 导出交付**：主路径为用户选择父目录后创建一个独立子文件夹，内部逐页生成/关闭文件，最后写 `导出清单.json`；不支持目录写入时回退为一个兼容 ZIP，ZIP 也只有一个顶层文件夹，不按 18 张拆包。范围输入与缩略图多选共用原稿页码；图片名为 `01_主题_cover.png` / `02_主题_inner.png`，重复导出追加 `-02` / `-03`。目录中断仅在同一页面会话内续写剩余页
20. **中文正文两端对齐**：左侧 Tiptap 编辑区可保留 CSS `text-align: justify` 作为输入反馈；成品画布必须由 `deterministicTextLayout.ts` 生成行级 x/box/gap 并封印快照，预览与导出复用这一份几何，不再依赖浏览器/html2canvas 的 `text-justify` 行为。H1/H2/H3 保持自然起始对齐。列表与引用仍保留自己的项目符号/竖线结构，必须在真实 1080×1800 画布目检标点、长英文/数字、粗体、软换行和段尾

---

## 2. 固定开发工作流（SOP）

每次改动按此流程走，不跳步：

1. **动工前**：扫 §6 坑手册相关域；架构级改动先向用户交代方案再动手
2. **改码**（遵守 §7 不要做的事）
3. **本地验证三连**：
   ```bash
   cd app
   ./node_modules/.bin/tsc -b        # 类型检查
   ./node_modules/.bin/vitest run    # 单测
   ./node_modules/.bin/vite build    # 构建
   ```
4. **UI 改动**：`vite preview` + Playwright 截图自查 → 用户目检确认后再部署
5. **部署**：`git push origin main`，等 1–3 分钟自动上线
6. **⚠️ 凡碰导出路径（exportPng.ts / canvas.css / Preview）**：部署后**必须在 prod URL 上 playwright 实测**（三主题 × 多页，采样像素而不是肉眼看图）。本地 preview 永远复现不了 prod 的 iframe CSS 问题，v1~v7 八轮全吃过这个亏。回归脚本：`tools/export-race-repro/test_v150_prod.py` + `test_prod_deep.py`（Cloudflare 入口需系统 proxy 127.0.0.1:7897）
7. **收尾**：更新本文件 §0 现状快照（+涉及的章节）；里程碑级进展同步 `WorkLog-Obsidian/3-Projects/xhs-poster-小红书排版编辑器.md`

### 版本与上线闭环（2026-08-10 起，对齐沃林发圈工具工作流）

**版本号**：语义化三段 `主.次.修`，单一来源 = `app/package.json` 的 `version` 字段（构建时注入页面信息条显示，部署后看线上版本号即确认生效）。

- **主**：架构级/破坏性变更（如换导出库、不向后兼容的数据 schema 迁移）
- **次**：新功能、功能恢复
- **修**：bug 修复、文案、纯文档不发版

**每次发版固定闭环**（顺序不跳步）：

1. bump `app/package.json` version
2. 本地验证三连 + UI 改动 Playwright 截图自查
3. **用户目检确认**后才部署
4. `git push origin main`（= Cloudflare 轨）+ `bash tools/deploy-oss.sh`（= 阿里云轨，**每版必推，不允许只推一轨**）+ `git tag vX.Y.Z && git push origin refs/tags/vX.Y.Z`（只推本版精确 tag）
5. 导出路径改动：prod URL playwright 实测（§2 第 6 步）
6. **归档**：`bash tools/archive-release.sh` → `archive/dist-vX.Y.Z/`（对齐发圈工具文件管理法：历史版本永留 archive/，同版本拒绝覆盖；核心体积以当版构建为准，v1.5.0 为 9.5M，字体走 manifest + git tag 复原）
7. 更新 HANDOFF §0 版本行 + USAGE.md（如用户可感知的功能变化）
8. **发版公告必须专业、完整**（含工具网址 + 本版变化摘要 + 必要注意事项），使用**飞书旧企业租户的机器人**发到刘彦君私聊，用户确认后再自行转发；发送前仍须核对租户、机器人和接收人身份

与沃林工具的差异：本项目是 git 仓库，「每版新文件不覆盖」由 git 天然保证，无需复制文件。

**阿里云大陆通道架构**（2026-08-10 搭建，复刻发圈工具）：OSS bucket `xhs-poster-editor`（cn-shenzhen，public-read，SPA 404→index）→ CDN 加速域名 `xhsposter.tshzchen.cn`（回源 OSS）→ AliDNS CNAME。部署 = `tools/deploy-oss.sh`（hashed assets 长缓存 immutable、index 等 no-cache、自动刷新 CDN index）。凭据：本机 ossutil / aliyun CLI（与发圈工具同账号）。

HTTPS：CAS 免费 DV 证书（CertId 26549959，2026-08-10 签发，1 年期，联系人刘彦君 19303019049）。**续期流程**：`aliyun cas CreateCertificateRequest`（ValidateType DNS）→ `DescribeCertificateState` 拿 `_dnsauth` TXT 值 → AliDNS 加 TXT → 签发后 `aliyun cdn SetCdnDomainSSLCertificate --CertType cas --CertId <新ID> --SSLProtocol on` → 删 TXT。坑：新 OSS bucket 默认 `BlockPublicAccess=true` 会压掉 public-read ACL，要先 `put-bucket-public-access-block` 关掉再设 ACL；CAS API 必须显式 `--endpoint cas.aliyuncs.com --region cn-hangzhou`。

**HANDOFF 纪律**（本次重构的起因）：「当前状态」只允许存在于 §0 一处。历史章节不要留「当前 prod」字样——2026-08 审查时发现 v5 章节还标着「当前 prod 状态」而实际已是 v8，两处「当前」互相矛盾。临时脚本一律放进 `tools/`（进 git），不要引用 `/tmp/` 路径——/tmp 会被系统清掉（test_prod.py 曾经只活在 /tmp，已丢过一次）。

---

## 3. 功能清单（现状）

| 模块 | 内容 |
|---|---|
| 编辑器（Tiptap） | H1/H2/H3、正文、引用、代码块、列表、加粗、下划线、选中短语不拆行（≤12 字）、固定 `#7B3B8B` 正文荧光笔（透明度 0%–100%）、撤销重做、插入图片、手动分页符、分隔线；工具栏固定两行全部常驻；导入后的自动编排结果仍是同一个普通可编辑 Tiptap 文档；正文段落中文两端对齐、最后一行自然靠左，标题不强制拉伸 |
| 顶部全局栏 | 版本、撤销/重做、草稿保存状态与管理、**导入文稿**、裁切参考、排版参考、磁吸和唯一强 CTA「导出 PNG」；对象样式不再挤在顶栏 |
| 中央成品画布 | 多页真实 9:15 预览（自适应缩放）；是唯一图片直接操作面：点击选图、四角等比缩放、顶部抓手左/中/右对齐、常用宽度与位置磁吸、Option/Alt 临时旁路、Esc/取消回滚；公考主题按当前页序自动路由 Cover/Inner；H2 竖线和有序列表序号按真实字形中线校准；裁切/版心参考和页码角标均只属编辑层 |
| 右侧上下文检查器 | 顶部固定独立「发布文案」卡片，与当前草稿一起保存且不受对象选择影响；其下页面态显示主题、背景、Logo、字体和全局排版；文字态显示排版、短语不拆与荧光笔；图片态只显示对齐、宽度、替换、删除和溢出提示 |
| 最近操作 | 显示本会话最近 3–5 条已提交动作，不持久化、不另造历史系统；一次图片手势只生成一条动作与一个 undo 事务 |
| 草稿库 | IndexedDB `xhs-poster-documents` 保存完整 Tiptap JSON + V2 样式/双底图/语义色资产 id + 可选发布文案元数据；900ms 自动保存、同步 WAL 保护立即关页、刷新恢复、另存/切换/删除；导入先原子创建新草稿再切换；严格兼容 V1/V2 旧草稿，写入串行，并用浏览器原子 Web Lock 让第二标签页只读 |
| 主题库 | 内置 4（雅致/极简白/深夜黑/公考·山水卷）+ 用户主题（IndexedDB `xhs-poster-themes`），9:15 真图缩略图；公考主题只套用双底图与样式，不覆盖正文；历史含正文主题仍可兼容打开 |
| 素材库 | 背景/Logo/图片三 tab × 内置/上传，IndexedDB `xhs-poster` 存 Blob |
| 字体库 | 拖拽上传 ttf/otf/woff/woff2/ttc，IndexedDB `xhs-poster-fonts`，FontFace 注册，启动时全量恢复 |
| 导出 | 18 张只作普通图文上传兼容提示，不是导出上限；可一次导出全部或用范围输入 + 缩略图选择原稿页码。主路径写入一个独立文件夹，兼容路径为一个单顶层目录 ZIP；逐页 scale 2 输出、清单最后落盘、重复导出 `-02/-03`、目录中断可续剩余页；发布文案不进入导出包 |
| 资源可靠性 | 图片、字体、主题按资源局部降级，原位说明原因并支持重试；缺图仍保留文档结构和可恢复入口，不要求刷新或清空编辑内容 |
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
        │   ├── Editor/          ← Tiptap + 编辑工具栏；ImageExtension / TextHighlight 维护语义属性
        │   ├── Preview/         ← 9:15 多页画布 + 图片直接操作覆盖层 + 裁切/排版/磁吸辅助层
        │   ├── Inspector/       ← 页面 / 文字 / 图片三态上下文检查器
        │   ├── DraftLibrary/    ← 草稿另存、切换、删除
        │   ├── Toolbar/         ← 顶部全局动作与状态
        │   ├── AssetLibrary/ FontLibrary/ ThemeLibrary/ ThemePreview/ ExportDialog/
        ├── lib/                 ← 纯逻辑层（有单测的都在这）
        │   ├── themes.ts themeStore.ts    ← 主题模型 + IndexedDB
        │   ├── assetStore.ts fontStore.ts fontRegistry.ts fontPresets.ts
        │   ├── typographyMetrics.ts opticalTypography.ts opticalListMarkers.ts
        │   │                       ← v1.5 真实字形测量、标题竖线/列表序号光学中线校准
        │   ├── splitPages.ts fontSize.ts density.ts canvas.ts builtinAssets.ts
        │   ├── imageModel.ts textHighlight.ts exportReadiness.ts resolveAsset.ts
        │   └── exportPng.ts     ← ⚠️ 改前必读 §5
        └── styles/canvas.css editor.css workspace.css
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

## 5. Export PNG：v8 基座 + v1.5 字形校准层 + 战史（改导出前必读）

### 当前仓库架构（exportPng.ts + exportPlan.ts + exportDelivery.ts）

v1.7 在既有像素渲染基座上新增交付编排层，不改 html2canvas 的核心渲染策略：

1. `exportPlan.ts` 只负责纯规划：17/18/19+ 状态、原稿页码范围、补零文件名、单文件夹名称、碰撞后缀与 `导出清单.json`
2. `exportDelivery.ts` 负责实际落盘：目录模式逐页渲染/写入/`close()`，清单最后写；中断生成差集续写 token。兼容模式只生成一个 ZIP 和一个顶层文件夹
3. `ExportDialog` 必须在用户点击的同步手势链最前调用目录/保存 picker；支持时让用户在系统弹窗选择位置和名称，不支持目录写入时明确回退 ZIP
4. `exportPng.ts` 暴露单页 `renderPagePngBlob` 供交付层顺序调用；旧 `exportPages` 保留兼容测试，但 App 的正式路径已走新规划/交付层

两层 v8 导出基座之上，v1.5.0 又增加了真实字形校准层：

1. **离屏渲染**（v7 引入）：deep clone `.page` 到 body 直接子节点的 fixed 屏外 stage（无 transform 祖先），bbox 由画布常量固定为 1080×1800。预览的 `transform: scale(0.4)` 与导出彻底解耦，源 DOM 零修改
2. **onclone 注入全量 CSS**（v8 引入）：html2canvas-pro 把 cloned DOM 放进 about:blank iframe 截图，prod 上 iframe 跨域加载 `<link>` stylesheet 会被 CORS 拦掉 → cloned doc 裸渲染。修法：`collectAllCss()` 把 `document.styleSheets` 全部 cssRules 转 text 注入 cloned doc `<head>`，同时拷贝 `:root` 的 inline CSS vars。对未来新主题/新素材天然鲁棒（全量复制，不依赖具体类名）
3. **真实字形中线校准**（v1.5.0；v1.7.1 收敛为共享快照）：`typographyMetrics.ts` 通过 canvas 的 `actualBoundingBoxAscent/Descent` 按实际字体、字号、字重和每个 grapheme 测量可见字形；`opticalTypography.ts` 在预览事务中校准 H2 竖条与列表 marker，并在列表列宽变化时先重物化再封存。导出不再重算 H2/marker，只对离屏副本做逐 atom 的 html2canvas baseline 适配，然后原样克隆同一 sealed snapshot；源 React DOM 始终零修改

辅助机制：img 解码等待（5s 兜底）、`document.fonts.ready`、字体注册表 revision/缓存失效、异步校准 abort guard、`hasRaceArtifact` 检测 + retry ×2（v5 遗留，v8 下基本不触发，留作兜底）、下载 60s 后才 revoke blob URL。

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

- **CDN 字体（ZCOOL/马善政/Long Cang/LXGW）在 prod 导出里可能同样回退**：Google Fonts stylesheet 跨域读不到 `cssRules`，被 `collectAllCss()` 跳过；iframe 里 `<link>` 重新加载在 prod 是否成功未验证。V1.7.1 会在缺字时阻止导出并显示字体问题，但治本仍是 §8 的「其余字体本地化」（fontsource 化后进 styleSheets 自然被覆盖）
- 这是下一窗口的 **Gate 0 诊断项**，目前只是疑点，不得写成已确认 bug：若只确认单一生产导出缺陷，优先评估 `v1.5.1`；若同时实施字体本地化、字重档位与性能优化，再正式立项 `v1.6.0`

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

## 8. v1.4 冻结验收基线与 v1.5 执行规格

### v1.4.0–v1.4.1「桌面交互与可靠性版」（2026-08-10 已完成并双轨上线）

参考只读源：`/Users/a0000/Nutstore Files/Claude_YJ/Wallin-发圈工具/` v12.3。学习其**交互原则**，不要复制全局变量、命令式 DOM 或单 Canvas 架构；本项目继续保留 React + Tiptap + 现有分页/导出引擎。

桌面 UI/UX 初始提案：[`xhs-editor-v1.4-ui-baseline-v1.png`](docs/design/v1.4.0/xhs-editor-v1.4-ui-baseline-v1.png)；最终本地验收截图：[`三栏工作台`](docs/design/v1.4.0/xhs-editor-v1.4-local-shell-v1.png)、[`图片选中态`](docs/design/v1.4.0/xhs-editor-v1.4-local-image-selected-v1.png)、[`导出成品`](docs/design/v1.4.0/xhs-editor-v1.4-local-export-page-v1.png)。用户已目检确认视觉通过；v1.4.1 只修正默认教程文案，不改变该视觉与交互基线。以下内容作为 V1.4 冻结验收基线保留；线上现状与证据只看 §0。

**本版已作为一套能力整体交付：**

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

**架构边界（已落实，后续继续遵守）：**

- V1.4 延续 Tiptap block image node，并在 `src / assetId / width` 上新增 `imageId / align`；继续用百分比 `width` 与 `height:auto`。历史 `width:null` 仍表示「原大小」，第一次拖动缩放时才转成百分比
- 第一阶段做**流式文档里的横向磁吸**，不保存自由 `x / y / height / transform`，不做纵向磁吸；正文顺序和纵向占位仍由文档流决定
- 先抽出独立 Image Extension，正式 `renderHTML` 始终保持单个根级 `<img>`。若左侧是主编辑面，再使用 React NodeView；若中央画布是主编辑面，则使用 React 覆盖层和映射桥，不在左侧再做第二套手柄。两条路线都必须在拖动时只改临时状态，`pointerup` 一次性提交属性，`pointercancel / Esc / 失焦` 可回滚
- 不要直接启用 Tiptap 自带像素 resize：编辑区、1080 画布、40% 预览是三套尺度，必须继续存百分比
- 预览与导出必须继续同源：选框、手柄、磁吸线和参考线都是可剥离编辑层；正式布局数据只能来自 Tiptap / ThemeConfig，不能从 Preview DOM 反向猜取
- 荧光笔使用独立 Tiptap mark，颜色与透明度作为语义属性分开保存，例如 `color: '#7B3B8B' / opacity: 0.5`，渲染时再组合成背景色；不要只把临时 `rgba(...)` 写进 DOM。它必须随 JSON/HTML、草稿和复制粘贴稳定往返，旧文档无此 mark 时保持原样

**已确认的主编辑面：中央 9:15 成品画布。**

- 中央 9:15 成品画布直接选图、缩放与吸附；左侧负责正文录入和结构编辑，右侧负责所选对象参数
- 稳定 `imageId`、复制粘贴去重、`Preview imageId → Tiptap node position` 映射及预览比例坐标换算是 v1.4 必做；中央画布是唯一图片直接操作面，左侧不得再维护第二套独立选框/拖动状态
- Tiptap 始终是唯一数据源，Preview DOM 不得成为持久数据源；若实装后需要改变主编辑面，必须先让用户看截图确认，不能在开发中自行退回双套交互

**桌面操作界面基线（已实装）：**

- 桌面端学习沃林的层级：**全局动作在顶部、正文编辑在左、成品画布居中、当前对象属性在右**。顶部只留版本/撤销重做/草稿状态/参考线/导出等全局动作，不再横向塞满所有字体和图片参数
- 右侧改为上下文检查器：未选对象时显示页面/主题；选中文字时显示排版与荧光笔；选中图片时只显示对齐、宽度、替换、删除。高级项按需展开，不让非设计用户一次看到全部控制
- 画布上的悬停轮廓、选中框、手柄、临时蓝线与状态文案必须明确区分「可点 / 已选 / 正在吸附」；禁用项要直接说明原因
- 悬停、选中、吸附、保存中、已保存、保存失败六类状态必须有可区分的反馈；不能只靠 toast，也不能让提示遮住画布
- 保持「受控自由度」：优先左中右、宽度档位、磁吸和安全边界，不把 Figma / Adobe 的自由坐标、旋转和复杂图层能力搬进本版

**v1.4.0 冻结测试矩阵：**旧草稿兼容；非法宽度/对齐归一化；`getJSON → setContent → getHTML` 后仍是单个 `<img>` 且分页不变；`resolveContentImages` 后 `width / align / assetId` 不丢；左中右与缩放在编辑器/预览/导出三处一致；缩放不触发节点重排；一次手势一次 undo 且 redo 可恢复；磁吸阈值与 Alt 旁路；Esc/失焦/pointer cancel 回滚；多图只改选中项；第二页图片不改变分页；刷新/另存恢复；资源缺失的局部降级与原地重试；导出就绪检查；所有辅助层、最近操作和溢出提示不进导出；`imageId` 复制粘贴去重、第二页映射与预览比例坐标换算。荧光笔另测：只命中选区、默认 50%、0%/100% 边界、连续调节、撤销重做、JSON/HTML 往返、草稿恢复，以及编辑器/预览/PNG 三处颜色与透明度一致。执行结果见 §0。

### v1.4.0 从沃林吸收什么、明确不照搬什么

1. **吸收**：画布优先、全局动作与对象动作分层、明确选中态、命中才出现的磁吸线、一次手势一次撤销、命名操作反馈、资源局部降级、原地重试、导出就绪防线、按意图加载、受控自由度、预览与导出同源
2. **不照搬**：Wallin 的全局变量、命令式 DOM、单 Canvas、自由 `x/y`、图片旋转、中心正方形裁切区、固定 4% 边距、右键/字母快捷键主路径，以及「最近导出即草稿」
3. **完整可点击回跳的修改时间线暂不做**：Tiptap 没有现成动作标签与任意回跳能力，为它另造持久快照系统会把图片交互版本拖成历史系统重构；v1.4 先用轻量最近操作 + 原生撤销重做验证价值
4. **独立自诊断页暂不做**：本版先完成资源就绪检查、局部降级和原地重试；只有真实故障数据证明需要时，再建设完整自诊断页

### v1.5.0「公考双底图模板版」（2026-08-11 已双轨上线）

#### 需求与产品定义

1. Markdown 导入、结构解析、自动编排和自动分页全部顺延，v1.5 不顺手做任何其中能力
2. 新增一套内置公考视觉模板，用户可见名称暂定 **「公考·山水卷」**：第 1 页固定用 Cover，第 2 页及以后统一用 Inner
3. 本轮的「模板」只是**有封面/内页角色的视觉主题**：套用到当前草稿，不替换正文、不新建草稿、不引入独立模板库。这是对当前 Theme 链路的最小、可兼容扩展
4. 页面角色只由当前页序决定：1 页时只用 Cover；2/5/任意多页时为 `[Cover, Inner, Inner…]`；增删分页后实时重算，不存「第 3 页用什么」这类易失效状态

#### 版本化设计输入（已实装，仍是唯一素材源）

| 角色 | 项目内设计原图 | 尺寸 / Alpha | SHA-256 |
|---|---|---|---|
| Cover（仅第 1 页） | [`docs/design/v1.5.0/public-exam-cover-v1.png`](docs/design/v1.5.0/public-exam-cover-v1.png) | 1080×1800 / 无 | `33228831119ffced8e96785015231ad751a7ec190dfaafd0a21d474e52e2b89c` |
| Inner（第 2 页起） | [`docs/design/v1.5.0/public-exam-inner-v1.png`](docs/design/v1.5.0/public-exam-inner-v1.png) | 1080×1800 / 无 | `613d1b4c56da3ac2a38161cc8f7751f0fc38decf806e96130020754c44707401` |

- 两份项目内文件是用户 Downloads 原件的无损副本，尺寸、Alpha 和 hash 已核对；后续不再依赖 Downloads 路径
- 已无损复制进 `app/public/builtin-assets/`，文件名为 `bg-public-exam-landscape-cover-v1.png` / `bg-public-exam-landscape-inner-v1.png`，稳定 ID 为 `builtin-bg-public-exam-landscape-cover-v1` / `builtin-bg-public-exam-landscape-inner-v1`
- 这两张是不可拆对的模板资产；日后修图必须新增 `v2` 文件名和 assetId，禁止覆盖同名文件，避免 Cloudflare/CDN 缓存混版
- 原图已是精确 9:15，页面内按原位全画布显示；不做 CSS 位移、缩放或二次裁切

**新增设计/问题证据（只作开发参考，不随应用发布）：**

- [`public-exam-title-colors-reference-v1.png`](docs/design/v1.5.0/public-exam-title-colors-reference-v1.png)：用户给定主/副标题精确色值的快照，2086×2168，SHA-256 `56d2d09189c778c9f190200703d8c345d46684dd73f34b0960a622ce3be5f986`
- [`editor-toolbar-more-current-v1.png`](docs/design/v1.5.0/editor-toolbar-more-current-v1.png)：v1.4.1 左侧正文工具被固定收进「更多」的问题快照，3456×2168，SHA-256 `30c22a68a6b0dced665a3f05743bc7b9817556eae8e435e46428cf2a967a8b56`
- [`list-page-break-nested-current-v1.png`](docs/design/v1.5.0/list-page-break-nested-current-v1.png)：v1.4.1 在无序列表内插入分页时，分页线跟随列表缩进且右侧仍不切页的问题快照，3334×1832（带 Alpha），SHA-256 `421105d75de068d7b54409c42fc1aae718a9236c35ef378b1f7fb18c5469ec2d`
- `typography-optical-public-exam-preview-v1/v2/v3.png` 与 `typography-optical-public-exam-export-v1/v2/v3.png`：「提出对策题」标题竖线和有序列表序号的真实字形中线校准迭代证据；v3 为最终用户目检版，v1/v2 保留为不可覆盖的迭代记录

#### 视觉基线（首次实装参数，以用户截图验收为准）

**Cover：**

- 纸张为暖象牙色，山水约从 `y=1300` 进入、`y=1450` 后变重；小红书中心 3:4 裁切区为 `y=180…1620`，船恰好落在下裁切边缘，只能当装饰，不承载语义
- 正式文字安全盒：`x=120…960 / y=340…1180`；建议主标题左对齐、最多 3 行，钩子/副标题最多 2–3 行，不让任何关键信息压到 `y≥1250`
- 初始 token：`--page-padding-x: 120px`、`--page-padding-top: 340px`、`--page-padding-bottom: 620px`、H1 宽度 `80%`。主标题用 Noto Serif SC/700，正文基准 40px 时 H1 沿用现有 90px 比例；先看真实样稿，不为凑更大标题强行改全局字号系统

**Inner：**

- 顶部紫线位于约 `y=82…83 / x=46…1034`，抽样色 `#8A4B7C`；它已烘进底图，不得再用 CSS 画第二条顶线
- 正文安全盒：`x=96…984 / y=180…1500`，即初始 token 为 `--page-padding-x: 96px`、`--page-padding-top: 180px`、`--page-padding-bottom: 300px`；底部山形从约 `y=1550` 进入，正文和图片不得侵入
- 正文 Noto Sans SC 40px、行高沿用 1.85，初始间距用 `normal`；H2 使用 Noto Serif SC/700。装不下就手动分页，不缩小到 36px 以下，不挤进山形区
- 多页页码不再放底部山中：Cover 隐藏页码，Inner 的 `2 / N` 移到顶线下方右侧（初始值 `top: 112px; right: 96px`）

**共通视觉：**

- 封面主标题正式色为 `#6D136C`，封面副标题正式色为 `#5A465F`；Inner 正文仍用 `#2D292B`，次级/引用文字可用 `#5F5659`，主题强调色用底图紫 `#8A4B7C`；正文荧光笔仍保持已冻结的 `#7B3B8B`
- `overlay: none`，不加浅膜/深膜，避免洗掉纸纹、山水和紫线；引用底色可用 `rgba(123,59,139,.08)`
- 默认 `logoStrategy: none`；现有猫 Logo 与公考视觉不匹配，不得为了复用旧默认而放到每页
- 新增 `theme-public-exam-landscape` 承担正文/强调色、安全盒和页码位置；封面主/副标题颜色来自可编辑的 Theme 字段，不在 class 里硬编码。参考线应跟随新 padding，并继续属于纯编辑层

#### 封面主/副标题颜色与修改交互（v1.5 新增需求）

| 语义角色 | 正式色值 | RGB | 暖纸底 `#FBF2E6` 对比度 |
|---|---|---|---|
| 封面主标题 | `#6D136C` | `109, 19, 108` | 约 `9.67:1` |
| 封面副标题 | `#5A465F` | `90, 70, 95` | 约 `7.65:1` |

1. **语义定义必须唯一**：主标题 = 首图 `.content` 内第一个 H1；副标题 = 该 H1 后**紧邻**的第一个 `p`。建议选择器为 `.page--first .content > h1:first-of-type` 与 `.page--first .content > h1:first-of-type + p`；不用 H2 冒充副标题，不将全篇正文染成灰紫
2. **产品入口**：在右侧「页面与主题」主卡中增加始终可见的「封面文字颜色」组，不收进「高级字体设置」。两行分别为「主标题」/「副标题」，每行显示实时色块 + `#RRGGBB` 输入，并提供「恢复模板色」
3. **输入规则**：只接受六位 HEX，内部统一规范化为大写 `#RRGGBB`；当前值合法时实时预览，`Enter`/失焦提交；非法值原位提示且不写入 App state/草稿/CSS，不允许任意 CSS 字符串注入
4. **状态与预览**：有效修改走现有 `customize`，主题下拉显示「自定义样式」，并进入 autosave/WAL/另存草稿/保存用户主题。中央成品画布是权威实时预览，ThemePreview 与 PNG 导出使用同一组语义 token
5. **本轮的边界**：v1.5 只做封面主/副标题两个**主题级**颜色，不引入 Tiptap `TextStyle/Color` mark，不做逐字/任意选区颜色。否则 inline color 会压过主题、扩大复制粘贴/清除/混合选区/撤销语义，也会再次挤压左侧工具栏

#### 正文编辑工具全部常驻（v1.5 新增需求）

当前「更多」不是响应式自动收纳：`Editor.tsx` 将代码块/分隔线/分页/图片/短语不拆永久写在 Radix DropdownMenu 里，`editor.css` 的 `overflow: hidden` 还会静默裁掉超宽内容。左栏在 1280/1440/1536 桌面宽度下约为 400/450/480px，所有工具硬塞单行必然超宽，因此固定两行是稳定方案：

```text
第 1 行·文字格式  [正文 ▾] [代码块] [B] [I] [U] [无序] [有序] [引用]
第 2 行·结构插入  [分隔线] [分页] [图片] [短语不拆]
状态提示·固定高度  例：「短语不拆：请先选中 1–12 个字符」
```

1. **稳定分组**：两行共用一个外边框/圆角；第 2 行用 1px 顶分隔线与极浅底色标明「会改变文档结构」的动作，四个按钮等分宽度。不用 `flex-wrap` 随机漂移，不横向滚动，不再生成任何「更多」入口
2. **文字与命中面**：第 1 行沿用紧凑图标按钮，但必须有中文 tooltip/`aria-label`；第 2 行必须显示图标 + 「分隔线/分页/图片/短语不拆」短文字，不能为了塞一行退化成难猜的纯图标。所有按钮保持至少 32px 高度与清晰 focus ring
3. **代码块去重不改语义**：代码块属于 block type，放在第 1 行作快捷按钮；段落 Select 仍能显示 `CODE` 当前状态，不破坏旧文档。可以保留 Select 中的代码块选项，但不能再作为唯一入口
4. **不可用状态仍可理解**：「短语不拆」无选区、超过 12 字或 H1 宽度不容纳时仍占位显示；用 `aria-disabled` + no-op 保持可聚焦，用固定高度的直接提示 + `aria-describedby` 说明原因，不要让用户先猜为什么点不了
5. **键盘与可访问性**：外层与两行用 `role="group"` + 中文 `aria-label`，保留原生 Tab/Shift+Tab 顺序和 Enter/Space；本轮不贸然声明 `role="toolbar"`，除非同时实现 APG 要求的 roving tabindex + 方向键。toggle 继续用 `aria-pressed`，插入动作不伪装 toggle
6. **布局变化边界**：工具栏高度预计从约 64px 增到 96–110px，只压缩本来就独立纵向滚动的正文区，不改左栏宽度、不侵占中央成品画布、不产生整页滚动。用户要求的「不收纳」仅指左侧正文工具，右侧高级字体设置仍保持渐进展开

#### 列表内分页可靠性（v1.5 新增缺陷，发版阻断）

**现象与根因已定位：**

- 用户在无序列表的项内点「插入分页」后，左侧蓝色分页线缩进到列表内，中央画布页数不增加，内容继续溢出安全区；有序列表、嵌套列表与 blockquote 内都有同类结构风险
- `Editor.tsx` 现在直接调用 `editor.chain().focus().setHorizontalRule().run()`。Tiptap `horizontalRule` 是普通 block，`listItem` 又允许 `paragraph block*`，所以会合法生成 `li > ... > hr.page-break`；JSON 往返还会稳定保存这个坏结构
- `splitIntoPages.ts` 只遍历 `root.children`，仅把顶层 `hr.page-break` 当分页边界。因此「线缩进」和「不分页」是同一个文档结构错误，不是两个 CSS 小问题

**产品语义与实现边界：**

1. 新增专用的 `insertRootPageBreak` 命令（名称可调整），固定两行工具栏的「分页」只调该命令，不再直接调 `setHorizontalRule()`
2. 普通段落/标题保留现有按光标位置切分的手感。在列表中点分页时，以**当前最外层列表项结束处**为安全边界：当前项和其嵌套内容留在前页，后续同级项作为同类列表在新页继续；光标在最后一项时就在整个列表之后分页。不在一个 bullet 的行内文字中间动刀
3. 列表空项中点分页时，消费该空项并在原边界插入顶层分页，不留空圆点/空编号。在列表项开头点分页时放在该项之前；非空列表项中部/末尾则按上述安全边界放在完整当前项之后
4. 有序列表拆成前/后两段时，后段必须保留连续序号（通过 `start` 或等价模型属性）；无序列表保留嵌套层级、marks 和段落顺序
5. blockquote 不得留下嵌套分页；按当前引用块的安全边界插入顶层分页。codeBlock 等现在已能生成顶层分页的节点不得回退
6. 命令用一个 ProseMirror transaction 完成，点一次「分页」只产生一次 undo；插入后 selection 落到新页的第一个可编辑位置，用户可继续输入
7. 在既有 `normalizeIncomingContent`/草稿 hydrate 边界增加纯 JSON 归一化，并在 paste transform 边界拦截新嵌套分页；将历史草稿、WAL 恢复、外部 setContent/粘贴中的嵌套分页升格为顶层边界，保留可见文本、列表类型/顺序和分页数；归一化不进入历史栈，不让用户第一次撤销又恢复坏结构
8. 优先抽出 Editor 与单测共用的生产 extensions factory，避免测试仍用「普通 StarterKit」而漏掉真实 page-break schema/命令。可用「顶层专用 PageBreak schema + 安全插入/清理」建立双重保障，但只改 schema 不足以清理空列表项和有序列表 `start`
9. `splitIntoPages` 保持顶层线性切分，作为简单可审核的消费端。不得只把嵌套线用负 margin 拉宽，不得用正则/递归 DOM 遇到 HR 就切字符串，也不得在 Preview 层二次猜测列表语义

#### 最小架构方案（不新造 `PosterTemplate`）

1. **Theme 字段**：保留 `bgAssetId` 为「默认/内页底图」，新增 `coverBgAssetId?: string` 为首页 override。旧主题没有该字段时 fallback 到 `bgAssetId`；判断必须用 `typeof value === 'string'`，因为显式 `''` 代表纯色封面，不能被 `||` 错误覆盖
2. **语义色字段**：Theme 与草稿 style 新增 `coverTitleColor` / `coverSubtitleColor`，只存规范化六位 HEX。App 分别注入 `--c-cover-title` / `--c-cover-subtitle`；`theme-public-exam-landscape` 不得在 class 内硬写这两个 CSS 变量，否则会压过用户的颜色控件
3. **内置主题**：新增 `builtin-public-exam-landscape`，`bgAssetId = Inner`、`coverBgAssetId = Cover`、`coverTitleColor = '#6D136C'`、`coverSubtitleColor = '#5A465F'`、`contentJSON = null`。应用时只写入样式/资产快照，不调用 `editor.setContent`
4. **草稿兼容**：草稿正式升为 `EditorDocumentV2`，style 一次显式保存 `coverBgAssetId / coverTitleColor / coverSubtitleColor`；parser 同时严格接受 V1/V2。V1 读取时 `coverBgAssetId = bgAssetId`，两个颜色按旧 `themeClass` 的原主色迁移（雅致 `#1A1A1A`、极简白 `#111111`、深夜黑 `#F0F0F0`），不得把所有旧草稿默认染成公考紫。IndexedDB object store 无需升级；WAL 使用 v2 key，v2 优先、兼容读 v1
5. **用户主题兼容**：Theme 库现在没有 schemaVersion，因此在读取/应用边界 normalize 旧主题；旧主题的双底图和两个颜色都按上述规则补全，新保存用户主题必须显式保留全部四项
6. **App 状态与资源**：新增 cover id/src 与两个封面颜色 state；hydrate、capture/autosave、applyTheme、save theme、retryResources 全链路携带。Cover/Inner 并行 resolve 后再通过现有 revision guard 原子提交，不得出现「新 Cover + 旧 Inner」的混搭；主题切换时两个颜色也必须一次替换，不留旧值
7. **按页路由**：`pages.map` 仅做 `index === 0 ? coverBgSrc : bgSrc`，Preview 仍只接收「本页底图」，不理解整套模板。导出继续 clone 每个 `.page`，不改写 `exportPng.ts` 架构；两个颜色通过既有 CSS/根变量注入路径自然进入导出
8. **现有背景入口**：用户在素材库点选普通背景时，同时把 Cover/Inner 设为该素材，恢复「全篇同一背景」旧语义并脱离当前主题。v1.5 不新增分别编辑首页/内页的入口
9. **主题库交互**：继续使用现有主题库和右侧主题下拉；「公考·山水卷」卡片主缩略图显示 Cover，增加简短「首图 + 内页」标识。ThemePreview 必须注入两个封面色；因为不替换正文，不需要危险操作确认弹窗
10. **缺资源降级**：问题文案分别叫「首图背景」/「内页背景」，可单独重试。对应页先回退到另一张已解析底图，两张都缺时才回退纯色；1 页文档未使用 Inner，Inner 缺失不得单独阻断导出

#### v1.5 明确不做

- 不做 Markdown 导入、自动分页、自动缩字或自动编排
- 不做根据画布高度自动推测分页；本轮只保证用户手动点击的分页在普通段落和列表中都真正生效
- 不新建 `PosterTemplate`、模板市场、用户自建/分享模板，不赠送或替换正文骨架
- 不做独立的封面眉题/主标题/钩子字段槽位；本轮继续编辑普通 Tiptap 流式文档
- 不做任意选区/逐字颜色，不引入 `TextStyle/Color` mark；两个封面颜色是 Theme/草稿样式，不改写 Tiptap JSON
- 不做任意逐页背景、最后一页专属背景、自由图层/x-y 或背景位置调整
- 不添加未获授权的国徽、政府/机构 Logo 或「官方背书」视觉；底图只使用本次用户交付素材
- 不重写已稳定的 Tiptap、Preview 或导出引擎，不借机做 PWA/手机端/产品壳

#### 验收矩阵

**模型/兼容：**

- V1 旧草稿迁移后 Cover/Inner 都等于原 `bgAssetId`，外观不变；V2 双底图经过 autosave、WAL、刷新、另存、切换后不丢
- 旧用户主题缺 `coverBgAssetId` 时全页仍使用原背景；公考主题保存再应用仍是成对底图；应用任一旧内置主题后所有页恢复同背景
- 主题套用不修改 Tiptap JSON/分页符、不产生跨草稿 undo；快速切换主题/草稿/背景时，旧异步 resolve 不得回写新状态

**封面颜色/语义：**

- 应用公考主题后，Cover 第一个 H1 的 computed color 精确为 `rgb(109, 19, 108)`，紧邻副标题 p 精确为 `rgb(90, 70, 95)`；ThemePreview、中央画布与 2160×3600 PNG 一致
- 副标题选择器只命中首图第一个 H1 的紧邻 p；其他正文、Inner 页、H2/H3、引用和荧光笔不得误染
- 两个 HEX 修改、「恢复模板色」、主题切换、autosave/WAL/刷新/另存/用户主题往返都要测；非法/不完整 HEX 不落盘、不产生 CSS 注入、不清空正文
- V1 三个旧主题迁移后标题/紧邻段落像素外观不变；切换主题时不得残留上一主题的封面颜色

**正文工具栏/可访问性：**

- 1280×800、1440×900、1536×1024 三档保持完全一致的两行布局；段落 Select 外的 11 个按钮全部在首屏，「代码块/插入分隔线/插入分页/插入图片/短语不拆」均是直接按钮；DOM 中不再存在 accessible name 「更多结构工具」
- 工具栏不横向滚动、不裁切、不用省略号，实测 `scrollWidth <= clientWidth`；最后一个「短语不拆」文字、focus ring 和固定提示行完整可见，整页不增加滚动
- 代码块 active/toggle；装饰分隔线不分页；分页立即改变页数和 Cover/Inner 路由；图片直达素材库 image tab；短语不拆在无选区/1–12 字/超长/H1 超宽/已激活解除五种状态都正确。可撤销动作继续一次产生一个 undo 事务
- 只用 Tab/Shift+Tab 可按视觉顺序访问全部控件，Enter/Space 生效；屏幕阅读器可读出两个分组、中文按钮名、pressed/disabled 状态与「短语不拆」禁用原因，点击后不丢当前选区/编辑器焦点

**手动分页/列表结构：**

- 普通段落/标题光标中部、空段落、无序列表、有序列表、列表首/中/尾项、空列表项、两层嵌套列表、blockquote 和 codeBlock 分别插入；每次后 `page-break` 均为 `doc` 直接子节点，不存在任何 `ul/ol/blockquote hr.page-break`
- 列表中段分页后，前后文字、marks、嵌套层级不丢不重，不留空 `ul/ol/li` 或幽灵圆点；有序列表要分别覆盖 `start=1` 和 `start=4`，后段序号连续而不重置；单次插入可一次 undo/redo 往返
- 用 v1.4.1 可产生的 `li > hr.page-break` JSON 构造旧草稿、WAL 恢复和外部 setContent/粘贴样例；载入后自动归一化且不污染 undo，再保存/刷新/JSON 往返不复发
- 每次插入或归一化后，`splitIntoPages(editor.getHTML()).length` 立即增加预期页数，中央画布不再把后续文字挤出安全区；公考主题的页角色同步变为 `[Cover, Inner…]`
- 单页 PNG/多页 ZIP 的页数、顺序和 2160×3600 尺寸与画布一致；保留既有「连续分页产生空页、首/尾分页保留空页、divider 不分页」语义

**页角色/可靠性：**

- 1 页只显示 Cover（Inner 可按现有资源策略预载）；2 页为 `[Cover, Inner]`；5 页为 `[Cover, Inner, Inner, Inner, Inner]`；手动插入/删除分页后立即重算。文档开头就有 page-break 时，空的 page 0 仍是 Cover，不做隐式跳页
- Cover/Inner 分别缺失、分别重试、双缺失、同 assetId 去重都要测；单页缺 Inner 可导出，多页缺 Inner 进导出预检
- 参考线在两种页角色上准确跟随安全盒；选框、参考线、裁切遮罩不进导出

**视觉/导出：**

- 本地用至少 2 页的公考真实样稿验证 Cover 标题层级、Inner 正文可读性、3:4 裁切参考、顶线不重复、无猫 Logo、页码不压山；1280/1440/1536 三档桌面宽度都截图
- 单页 PNG 和多页 ZIP 每张都是 2160×3600；通过 DOM src 顺序 + 底部特征像素确认第 1 页真的是 Cover、第 2–N 页真的是 Inner，不只靠肉眼看相似纸色
- 打开/关闭首图裁切参考后，导出成品 hash 不变；底图无叠膜、无 CSS 位移/二次裁切，Inner 顶线只有原图一条
- 既有雅致/极简白/深夜黑、自定义背景/字体、正文图片和荧光笔均回归，`test_v140_local.py` 继续全绿，新增 v1.5 双底图回归脚本/单测

#### v1.5 打包策略：一次对外发布，分区实现/验收

**默认结论：这四类需求合并为一个 v1.5.0，但禁止做成一个大提交或一口气改完才测。**

- 公考双底图依赖可靠手动分页，否则 Cover/Inner 页角色本身无法验收；两行工具栏又会把「分页」从更多菜单提到明面，不能让一个更容易点到的按钮仍保留已知坏路径
- 合并为一个用户版本，只需一次 V1→V2 迁移、一轮完整导出验收、一次双轨部署和一份专业公告；内部用独立工作包/提交又能让问题可定位、可回退
- 只有当公考模板明显延期，或线上分页缺陷需要立即止血时，才把「列表安全分页」先独立发为 **v1.4.2**，再发 v1.5.0；不得把多个不同构建都叫 v1.5.0

#### 实施完成记录与发布闭环

1. **WP1·分页可靠性 ✅**：`b4e9088` 实现顶层安全分页，`fbb9c03` 补强粘贴/恢复等内容边界的根层不变量；无序/有序/嵌套列表分页已回归
2. **WP2·工具可见性 ✅**：`faf109a` 将正文工具栏改为固定两行常驻，删除「更多」主路径，并通过第一轮用户目检
3. **WP3·数据/资源基础 ✅**：`b15fecf` 完成 V1→V2 草稿兼容、Theme normalize、Cover/Inner 双资源、封面语义色与原子解析
4. **WP4·公考视觉闭环 ✅**：`589694f` 接入页序路由、内置资产、「公考·山水卷」、专属 CSS、两个 HEX 控件、资源降级和导出预检
5. **WP4.1·真实字形光学对齐 ✅**：`86a5949` 完成 H2 标题与竖线、有序列表序号与首行文字的中线校准；覆盖预览、ThemePreview、html2canvas 导出、字体冷加载/切换、混合字体和可访问列表语义。最终 v3 预览/导出已获用户视觉确认
6. **WP5·联合回归 ✅**：32 文件 / 217 单测、tsc、ESLint、build、diff-check、`test_v150_local.py` 和真实 Chromium 多字体/多字号像素校验全绿；独立审计无 P0/P1/P2 或阻断项
7. **发布闭环 ✅**：用户于 2026-08-11 明确授权「可以发布」；`227b0da` 将版本升至 v1.5.0 并补齐生产回归脚本。Cloudflare + OSS/CDN 双轨部署同一 `index-D0LqeUgP.js` / `index-BQdpJR0I.css`，tag `v1.5.0` 已推送；两入口的 1/2/5 页背景、主/副标题色、列表分页、字形中线、旧三主题与用户字体回归全绿，`archive/dist-v1.5.0/` 已按不覆盖原则归档；16:10 CST 已按 §2 第 8 步核对旧企业租户/机器人/接收人并发送专业公告，私聊回读成功。**v1.5.0 当前无未完成步骤**

### 后续版本路线（v1.5.0、v1.5.1 与 v1.7.0 均已上线）

| 范围 | 当前状态 | 进度 | 下一门禁 |
|---|---|---:|---|
| v1.5.0 公考双底图模板版 | 已全部闭环 | **100%** | 只响应真实线上反馈；应用代码问题走新补丁版本，不移动 `v1.5.0` tag |
| v1.5.1 高频编辑修复 | 已全部闭环 | **100%** | 只响应真实线上反馈；应用代码问题走新补丁版本，不移动 `v1.5.1` tag |
| v1.6.0 视觉资产质量版 | 候选，尚未立项 | **0%** | 先完成 §5 CDN 字体生产预览/导出 A/B、字体请求/体积/性能盘点和字重兼容方案，再由用户确认范围与验收标准 |
| v1.7.0 导入文稿与完整导出 | 已全部闭环 | **100%** | 只响应真实线上反馈；后续修复使用新补丁版本，不移动 `v1.7.0` tag |

1. **v1.4.1 桌面交互与可靠性版（已上线）**：图片直接操作、等比缩放、左中右对齐、磁吸、排版参考线、正文荧光笔、桌面编辑器外壳、轻量最近操作、草稿与导出可靠性，以及上述沃林 UX 原则；补丁版同步默认 5 页教程
2. **v1.5.0 公考双底图模板版（2026-08-11 已完成并双轨上线）**：第 1 页 Cover、第 2 页起 Inner，公考专属安全盒/页码，封面主标题 `#6D136C` + 副标题 `#5A465F` 及可修改 HEX 控件，正文工具全部常驻，列表内分页保持顶层且真正切页，标题竖线/列表序号按真实字形中线对齐，旧草稿/主题兼容、资源恢复与高清导出闭环
3. **v1.5.1 高频编辑修复（2026-08-11 已双轨上线）**：全局但焦点安全的 Command/Ctrl+Z、Shift+Command/Ctrl+Z / Ctrl+Y；H1–H3 整段语义提示、跨段选区端点归一化、禁用产品未承诺的 H4–H6 快捷入口；用户确认右侧 Demo 后，公考 Cover 建议内容区已改为 `x=120/960、y=300/1500`，内页与旧主题不动，复杂网格仍明确否决。自动测试、视觉自查、用户目检、双轨生产回归、精确 tag 与不可覆盖归档均已完成
4. **v1.6.0 视觉资产与结构化封面版（候选，先诊断再立项）**：标题字重档位、ZCOOL / Ma Shan Zheng / Long Cang 等字体本地化、字体冗余清理、预览/导出一致性、加载性能和结构化封面槽位。封面与正文继续同屏连续预览；先做主标题/副标题 + 三套高质量版式 + 有限位置调整，暂不做任意自由文本框；不引入面向用户的复杂网格系统
5. **v1.7.0 导入文稿与完整导出版（2026-08-11 已双轨上线）**：Markdown / 纯文本导入、覆盖式解析确认、同一可编辑新草稿、右栏独立发布文案、普通文稿 `---` 全局确认、17/18/19+ 上传兼容提示、一次完整目录/ZIP 导出、自选页码、导出清单、同会话续写剩余页和中文正文两端对齐。图片资源映射、原生长文、37+ 上传分组整体重均衡不在本次范围
6. **v1.8.0 交付与诊断版（按需要）**：PWA 安装、部署/资源诊断、稳定运行后简化 `hasRaceArtifact/retry`；Tauri macOS `.app` 只在确有离线桌面分发需求时再评估，不与 PWA 同时默认开工
7. **v2.0.0 运营机器产品壳**：项目首页、素材入口、历史作品、工作流导航等全局 UI/UX 与信息架构更新；只换产品壳和工作流，不重写已经稳定的排版、草稿与导出引擎
8. **独立内容模板，不预占版本号**：只有出现明确的「带正文骨架/封面字段槽位/页类型」需求后，才设计 `PosterTemplate`；Theme 继续管视觉 token，Template 才管内容结构，二者不混在一个模型里
9. **远期候选：手机端，不预占版本号**：当前不做。桌面功能稳定且出现明确移动场景后，再学习沃林的「共享引擎 + 独立手机壳」，单独设计底部抽屉、触控命中、双指手势与微信保存链路；绝不把桌面侧栏直接压缩到手机

---

## 9. 用户偏好

- 诚实优先、不偷懒、做不到直说；先查自身再怪外部
- 响应简短直接；关键决策用 AskUserQuestion 给选项，第一个标推荐
- 中文注释解释 WHY 不写 WHAT
- UI 改动 Playwright 截图自查后再交用户目检
- 正文编辑的高频/重要工具要直接可见，不收进「更多」；宁可稳定分成两行，也不隐藏或横向滚动
- 版本管理：迭代不覆盖原文件（全局记忆规则）
- 发版公告要写得专业；通过飞书旧企业租户机器人发到刘彦君私聊，发送前核对身份
- 终端统一 iTerm2

---

## 10. v1.5.1 已确认范围与新会话开场

### 用户已确认的产品判断

1. **封面与正文不得互相隔离**：继续使用同一编辑器、同一连续成品画布，用户始终能比较首图和内页的一致性。
2. **暂不做自由文本框**：后续使用结构化主标题/副标题槽位，配左对齐叠排、居中海报、小字在上大字在下三套高质量版式，并只开放有限位置调整。
3. **复杂网格已否决，参考线保持简洁**：完整收敛结论见 `docs/GRID-SYSTEM-DIAGNOSIS-2026-08-11.md`。只保留左/中/右/上/下五条线；封面左右继续 `x=120/960`，内页不动。用户已目检确认右侧 Demo 与最终成品：上下为 `y=300/1500`，等于在首图 3:4 可见区 `y=180…1620` 内上下各留 120px；现已随 v1.5.1 上线。不要再实施 6 栏、模块或可见基线网格。
4. **字体名称已解释清楚**：UI 里的“思源黑体/思源宋体”就是 CSS 中的 `Noto Sans SC / Noto Serif SC`，不是消失了；两者是中日韩字体，不是只服务英文。`serif / sans-serif` 是通用回退类别。main.tsx 现导入 Noto Sans 9 档 + Noto Serif 8 档，而 UI 标题只有二态字重，冗余清理与 CDN 本地化归 v1.6，不混进补丁。

### v1.5.1 本地工作包

- **WP1 · 全局 undo/redo**：修复编辑器失焦、点击顶栏或画布后 Command/Ctrl+Z 不工作。ProseMirror 内继续交给 Tiptap；input/textarea/contenteditable、组合输入、弹窗、只读状态和画布手势不得被全局 handler 抢走；只有命令实际成功才 `preventDefault`。
- **WP2 · 标题整段语义**：H1/H2/H3 是块级节点，同一段里的自动换行或 Shift+Enter 软换行必然一起变化；UI 必须写明“标题作用于整段；Enter 分段，Shift+Enter 只换行”。修复选区端点落在上一段末尾时相邻两段一起变化，并补跨段/边界回归。
- **WP3 · 标题范围**：StarterKit 只启用 H1–H3，移除隐藏的 Command/Ctrl+Option/Alt+4…6 入口，避免产生下拉框无法识别的 H4–H6。
- **WP4 · 封面上下安全区（用户已确认，已本地实施）**：左右维持 `x=120/960`，只把公考封面上下从 `y=340/1180` 扩为 `y=300/1500`，内页和旧主题不动；参考层保持五条简洁线，标签用“建议内容区”，提示为“重要文字尽量放在线内；背景图片可以铺满整页。参考线不会导出。”；真实 padding、溢出判断、旧草稿/页数/导出回归已同步。

### v1.5.1 本地完成记录（用户目检已通过）

1. **WP1 · 全局 undo/redo ✅**：新增焦点安全的 window 快捷键路由，仅在 Tiptap 失焦且历史命令成功时阻止默认行为；ProseMirror、input/textarea/select/contenteditable、IME、Dialog/Radix popup、只读标签页和画布手势均有回归。
2. **WP2 · 标题整段语义 ✅**：工具栏常驻提示“标题作用于整段；Enter 分段，Shift+Enter 只换行”；段落样式命令统一归一化选区端点，覆盖正向、反向、两个空端点、真跨段、标题转正文、Enter 和 Shift+Enter。
3. **WP3 · 标题范围 ✅**：StarterKit heading schema 只接受 H1–H3，明确吸收 Command/Ctrl+Option/Alt+4…6 而不创建节点；旧 HTML/JSON 中的 H4–H6 窄化迁移为 H3，避免不可识别节点。
4. **WP4 · 封面建议内容区 ✅**：仅把公考 Cover 改为 `x=120/960、y=300/1500`，Inner 保持 `x=96/984、y=180/1500`，旧主题不动；保留五条简洁线，中线更淡且使用虚线，标签/提示均位于仅预览层。
5. **验证证据**：Vitest 34 文件 / 253 测试、`tsc -b`、ESLint、Vite build、diff-check 全绿；`test_v151_local.py` 的真实 Chromium 焦点/选区矩阵与 `test_v150_local.py` 深回归全绿，参考层开关前后导出像素 SHA-256 一致；本地生产构建 `test_prod_deep.py` 三旧主题/用户字体全绿；1280×800、1440×900、1536×1024、标题菜单展开态和 safe-area Cover/Inner 的生产构建截图已自查，保存在 `docs/design/v1.5.1/`。
6. **边界与门禁**：仅实施用户确认的 WP1–WP4；复杂网格、内页/旧主题安全区、字体本地化/减重、字重档位、结构化封面和 Markdown 均未实施；`app/package.json` 为 `1.5.1`。用户目检、双轨发布、生产回归、精确 tag 与归档已经完成。
7. **发布证据**：发布提交/tag 为 `dd137f1` / `v1.5.1`；两入口与归档的 JS SHA-256 为 `97e669cc…e105a7`，CSS 为 `7d57c152…9efecb7c`。`archive/dist-v1.5.1/` 为 9.5M，排除字体 3337 个；`v1.5.0` tag 未移动。19:04 CST 已使用飞书旧企业租户 `default` 的「Claude聊天助手」机器人将专业公告发送至刘彦君 1v1，消息 `om_x100b6884555fe8b4b16098c17098e27` 已回读确认；本版本无未完成步骤。

### 快捷键文档（已写入 USAGE/发布说明）

- 全局：撤销 `Command/Ctrl+Z`；重做 `Shift+Command/Ctrl+Z`，Windows 兼容 `Ctrl+Y`；`Esc` 取消画布手势；拖图时 `Option/Alt` 临时关闭磁吸。
- 编辑器内：粗体 `Command/Ctrl+B`、斜体 `Command/Ctrl+I`、下划线 `Command/Ctrl+U`、硬换行 `Shift+Enter`、段落/标题 `Command/Ctrl+Option/Alt+0…3`、有序/无序列表 `Command/Ctrl+Shift+7/8`、列表层级 `Tab / Shift+Tab`。
- 现有但界面未公开的 inline code / strike / code block 快捷键在写说明前应决定保留还是移除，不能把偶然继承的 StarterKit 行为直接当产品承诺。

## 11. v1.7.0 正式发布记录

### 已确认并实现

1. 顶栏「导入文稿」支持 `.md` / `.txt`、拖放和粘贴；真实 18 页 fixture 与 19+ fixture 均可一键载入。解析确认不会改动当前草稿，确认后完整生成一个新草稿
2. 专用 `# 封面` / `# 正文` 结构将发布文案放入右栏独立卡片；普通文稿的 `---` 只做一次全局确认。解析不改写原文，19+ 不截断、不缩字、不拆草稿
3. 导入的新草稿进入现有 Tiptap / IndexedDB / undo / autosave 链，真实浏览器已输入测试文字并确认自动保存，再用撤销恢复原文；不是不可编辑快照
4. 17/18/19+ 精确状态由集中配置生成。18 张文案固定为“18 张，达到当前普通图文单篇上限”；19 张文案为“共 19 张，超过普通图文单篇上限 18 张；仍会完整生成”
5. 19+ 可一次完整导出；全部模式增加二次确认，但不会禁止。目录模式写入一个独立文件夹；兼容 ZIP 也只有一个顶层目录。另保留范围输入和缩略图多选，不连续选择仍用原稿页码
6. 图片命名为 `01_[主题]_cover.png` / `02_[主题]_inner.png`，页码按总页数至少补两位；文件夹含主题、范围、张数和北京时间。重复导出追加 `-02/-03`，清单记录源页、文件名、交付方式与 18 张兼容判断
7. 目录写入中断后，同一页面会话可在原文件夹只继续剩余页；成功 `close()` 才算已完成，`导出清单.json` 最后写入。浏览器不支持目录写入时使用一个兼容 ZIP
8. 正文段落在左侧和 1080×1800 成品画布保持中文两端对齐，最后一行自然靠左；H1/H2/H3 不强制拉伸。列表、引用、长文本和粗体已目检
9. 文档主题与 ZIP 名按 UTF-8 字节安全截断，避免操作系统 255-byte 路径段失败；若目标位置已有同名普通文件，也会继续尝试 `-02/-03`，不覆盖旧文件

### 验证证据

- 自动化：Vitest 37 文件 / 292 测试、TypeScript、ESLint、Vite build 全绿
- 浏览器：真实点击 18 页和 19 页全流程；19 页第 19 张存在；范围 `1-3, 5, 19` 选出 5 张，取消第 5 页后归一为 `1-3, 19`；`0, 20` 显示越界错误并禁用导出
- 真实交付：`test_v170_import_export_ui.py` 已在两个生产入口分别下载约 196 MB 的 19 页兼容 ZIP；唯一顶层目录，PNG `01..19` 无丢失/重复、均为 2160×3600，manifest `sourcePages=1..19`，console/page error 均为 0
- 旧链回归：`test_v150_prod.py`、`test_prod_deep.py` 与 `test_v151_prod.py` 已在两个生产入口跑通 1/2/5 页 ZIP、列表分页、三旧主题、用户字体、2160×3600 像素、字形中线、撤销重做与标题边界
- 生产目录写入：Cloudflare 生产页面通过 Chrome 原生目录权限完成一次 5 页导出；一个独立文件夹内有连续编号的 5 张 2160×3600 PNG 与最后写入的 `导出清单.json`，manifest 为 `deliveryMode=directory`、`sourcePages=1..5`
- 正式构建：两个生产入口、本地与 `archive/dist-v1.7.0/` 均使用 `assets/index-BKYNhwYN.js` / `assets/index-BVsea9B1.css`；JS SHA-256 `fbfafa1ec17407fc9886b7d7e74977d7622324275106949219d9c3b202b60dfc`，CSS SHA-256 `39a1a1dbc10c2debdfb209ad5b68b42ee686a9bfb9cfa62563627fb3bcd71c13`
- 版式：实际 DOM 画布为 1080×1800；正文计算样式 `justify / text-align-last:left / inter-character`，标题 `start / auto`；页面无横向溢出
- 控制台：两个生产入口的 console error / page error 均为 0
- 截图：`docs/screenshots/v1.7.0/01-import-18-review.png` 至 `06-export-19-selection.png`

### 发布闭环

- 发布提交/tag：`87a2d89` / `v1.7.0`；tag 已推送且不得移动
- Cloudflare Workers 与阿里云 OSS/CDN 已双轨上线，两个入口加载同一构建
- `archive/dist-v1.7.0/` 已按不覆盖原则归档（9.5M；字体 3337 个另见 `FONTS-MANIFEST.txt`）
- 旧企业租户 `default`、应用 `cli_a92bb2ebb1795bd2`「Claude聊天助手」已核对；正式公告发送至刘彦君既有发布会话，API 回执消息 `om_x100b6887b2a35ca8b4a99575b534996`

### 明确未做 / 延后

- 不接入小红书原生长文管线；18 不是所有内容类型的统一上限
- 不混入 v1.6 字体本地化、字体减重、字重档位或结构化封面
- 37+ 页的上传分组与“整体重新均衡”只做标记；当前导出无需分批，仍是一个目录/ZIP
- 目录中断续写 token 只在同一页面会话有效；刷新后跨会话恢复留待后续可靠性版本
- 兼容 ZIP 需要在浏览器内存中汇总后再打包；19 页 fixture 的实际 ZIP 约 196 MB，因此支持目录写入时继续默认推荐逐页写入独立文件夹
- 旧 v1.5.1 若在回滚后重新编辑导入草稿，旧代码可能丢掉可选 `publication` 元数据；Tiptap 图片正文仍可见。这是本次已接受并记录的窄回滚权衡

### 新任务开场提示

```
继续小红书排版编辑器。线上稳定版为 v1.7.0；发布提交/tag 为 `87a2d89` / `v1.7.0`，Cloudflare 与大陆通道已加载相同构建并完成生产回归，`archive/dist-v1.7.0/` 已生成。后续应用修复必须新开版本，不移动既有 tag。开始前请先读：

/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/AGENTS.md（若存在）
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/CLAUDE.md（若存在）
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/HANDOFF.md
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/README.md
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/docs/RELEASE-v1.7.0.md
/Users/a0000/Nutstore Files/Claude_YJ/xhs-poster-小红书排版/docs/screenshots/v1.7.0/

v1.5.0、v1.5.1 与 v1.7.0 的 tag 均已固定，不重做、不移动。延期范围仍为：原生长文、v1.6 字体本地化/减重/字重档位/结构化封面、37+ 上传分组整体重均衡、跨刷新目录续写。新需求先重新定版本范围与生产门禁。
```
