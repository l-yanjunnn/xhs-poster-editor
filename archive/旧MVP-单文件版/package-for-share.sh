#!/bin/bash
# 打包一份只含运行所需文件的分发包，给别人用
# 输出：~/Desktop/xhs-poster-share-YYYYMMDD.zip

set -e
cd "$(dirname "$0")/.."

DATE=$(date +%Y%m%d-%H%M)
PKG_NAME="xhs-poster-$DATE"
OUT_DIR=~/Desktop/$PKG_NAME
ZIP_PATH=~/Desktop/$PKG_NAME.zip

rm -rf "$OUT_DIR" "$ZIP_PATH"
mkdir -p "$OUT_DIR/assets"

# 只复制运行所需的文件，不带原图/工具脚本
cp editor.html             "$OUT_DIR/"
cp assets/builtin-assets.js "$OUT_DIR/assets/"
cp USAGE.md                "$OUT_DIR/" 2>/dev/null || true

cd ~/Desktop
zip -rq "$PKG_NAME.zip" "$PKG_NAME"
rm -rf "$OUT_DIR"

size=$(du -h "$ZIP_PATH" | awk '{print $1}')
echo "✅ 已打包：$ZIP_PATH ($size)"
echo ""
echo "把这个 zip 发给别人，他们解压后双击 editor.html 即可使用。"
open ~/Desktop
