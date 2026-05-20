# 小红书 9:16 排版编辑器

把文字 + 背景图 + Logo 排成小红书风格的 9:16 长图，一键导出 PNG。

## 文件夹结构

```
xhs-poster-小红书排版/
├── editor.html              ← 主编辑器（双击即用）
├── demo.html                ← Step 1 静态参考（视觉调试用，可忽略）
├── README.md                ← 本文档（开发者看的）
├── USAGE.md                 ← 用户使用说明（发给别人时一起打包）
│
├── assets/
│   └── builtin-assets.js    ← 内置素材（base64 嵌入的宣纸 + 猫圈）
│
├── source/                  ← 原图备份（开发用，不必发给别人）
│   ├── bg-xuan-paper.png
│   └── logo-cat-ring.png
│
└── tools/
    ├── update-builtin-assets.sh  ← 添加 / 更新内置素材
    └── package-for-share.sh      ← 一键打包分发版到桌面
```

## 给别人用怎么办

```bash
bash tools/package-for-share.sh
```

会在桌面生成 `xhs-poster-YYYYMMDD.zip`，发给对方即可。
解压后双击 `editor.html`，无需安装、无需联网即可用。

## 怎么添加内置素材（给所有用户）

1. 把图片丢进 `source/` 目录
2. 编辑 `tools/update-builtin-assets.sh`，在数组里加一行：
   ```
   "builtin-bg-XXX|显示名|文件名.png"
   ```
3. 运行：
   ```bash
   bash tools/update-builtin-assets.sh
   ```
4. 刷新 `editor.html` 即可在「🖼️ 背景库」/「🐱 Logo 库」里看到

## 技术栈

- 纯前端单页应用，无后端
- contenteditable + execCommand 富文本编辑
- 设计 Token 走 CSS 变量
- 模板/用户素材存 localStorage
- html2canvas 导出 PNG，JSZip 打包
- 支持 File System Access API 选保存路径（Chrome/Edge）

## 已知限制

- 用户上传的素材和模板存在浏览器本地，清缓存会丢失
- 字体目前用系统字 + 霞鹜文楷 Web Font，其它字体待扩展
- 分页靠手动「⎯ 分页符 ⎯」按钮，未自动测量
