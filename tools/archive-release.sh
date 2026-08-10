#!/usr/bin/env bash
# 发版归档（对齐沃林发圈工具的文件管理法：历史版本永留 archive/，不覆盖）
#
# 归档内容 = dist 的应用核心（html/js/css/svg/内置图，~6MB），排除 fontsource
# 字体分片（~108MB，内容哈希命名跨版本不变；完整复原走 git tag 重建）。
# 排除的字体文件清单写进 FONTS-MANIFEST.txt 备查。
#
# 用法：发版后（build 完成、版本号已 bump）执行 bash tools/archive-release.sh

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json; print(json.load(open('app/package.json'))['version'])")
DEST="archive/dist-v${VERSION}"
DIST=app/dist

[ -f "$DIST/index.html" ] || { echo "❌ $DIST 不存在，先构建"; exit 1; }
# 版本管理铁律：同版本已归档就拒绝覆盖（改了东西必须 bump 版本号）
[ -e "$DEST" ] && { echo "❌ $DEST 已存在。归档不覆盖——改动请先 bump 版本号"; exit 1; }

mkdir -p "$DEST"
# 拷应用核心，排除字体
(cd "$DIST" && find . -type f ! -name "*.woff" ! -name "*.woff2" | while read -r f; do
  mkdir -p "../../$DEST/$(dirname "$f")"
  cp "$f" "../../$DEST/$f"
done)
# 字体清单（文件名即内容哈希，配合 git tag 可精确复原）
(cd "$DIST" && find . -type f \( -name "*.woff" -o -name "*.woff2" \) | sort) > "$DEST/FONTS-MANIFEST.txt"
echo "git tag: v${VERSION}（完整复原：git checkout v${VERSION} && bash ci.sh）" >> "$DEST/FONTS-MANIFEST.txt"

SIZE=$(du -sh "${DEST}" | cut -f1)
NFONTS=$(grep -c woff "${DEST}/FONTS-MANIFEST.txt" || true)
echo "✅ 已归档 ${DEST} (${SIZE}, 排除字体 ${NFONTS} 个另见 manifest)"
