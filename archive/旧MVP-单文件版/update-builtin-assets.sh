#!/bin/bash
# 把 source/ 里的原图压缩 + base64 嵌入到 assets/builtin-assets.js
# 添加新内置素材时：
#   1. 把图片丢进 source/
#   2. 在下面的两个数组里加一行
#   3. 运行本脚本：bash tools/update-builtin-assets.sh

set -e
cd "$(dirname "$0")/.."

# ============ 在这里维护内置素材清单 ============
# 格式："id|name|filename"
BACKGROUNDS=(
  "builtin-bg-xuan|宣纸|bg-xuan-paper.png"
)
LOGOS=(
  "builtin-logo-cat|猫圈|logo-cat-ring.png"
)
# ===============================================

OUT="assets/builtin-assets.js"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo "// 内置素材（base64 编码，避免依赖外部文件加载）" > "$OUT"
echo "// 由 tools/update-builtin-assets.sh 从 source/ 目录生成，请勿手动编辑" >> "$OUT"
echo "window.BUILTIN_ASSETS = {" >> "$OUT"

# —— 背景图 ——
echo "  backgrounds: [" >> "$OUT"
for entry in "${BACKGROUNDS[@]}"; do
  IFS='|' read -r id name file <<< "$entry"
  src="source/$file"
  if [ ! -f "$src" ]; then echo "❌ 缺少 $src"; exit 1; fi
  echo "  压缩 $file ..."
  sips -s format jpeg -s formatOptions 88 "$src" --out "$TMP/bg.jpg" > /dev/null
  b64=$(base64 -i "$TMP/bg.jpg" | tr -d '\n')
  echo "    { id: \"$id\", name: \"$name\", src: \"data:image/jpeg;base64,$b64\" }," >> "$OUT"
done
echo "  ]," >> "$OUT"

# —— Logo ——
echo "  logos: [" >> "$OUT"
for entry in "${LOGOS[@]}"; do
  IFS='|' read -r id name file <<< "$entry"
  src="source/$file"
  if [ ! -f "$src" ]; then echo "❌ 缺少 $src"; exit 1; fi
  echo "  缩放 $file 到 360×360 ..."
  sips -Z 360 "$src" --out "$TMP/logo.png" > /dev/null
  b64=$(base64 -i "$TMP/logo.png" | tr -d '\n')
  echo "    { id: \"$id\", name: \"$name\", src: \"data:image/png;base64,$b64\" }," >> "$OUT"
done
echo "  ]" >> "$OUT"

echo "};" >> "$OUT"

size=$(du -h "$OUT" | awk '{print $1}')
echo ""
echo "✅ 已生成 $OUT ($size)"
echo "   背景：${#BACKGROUNDS[@]} 张，Logo：${#LOGOS[@]} 张"
