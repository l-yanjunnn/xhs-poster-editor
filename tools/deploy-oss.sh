#!/usr/bin/env bash
# 阿里云 OSS 大陆通道部署（双轨之二；轨道一 = git push 触发 Cloudflare）
# 双轨发版纪律：每个版本两轨都必须推，不允许只推一轨（沃林发圈工具欠费停服事故的教训）
#
# 前提：本机 ossutil 2.x 已配置（沃林同账号）；先跑 ci/build 保证 app/dist 是最新构建
# 用法：bash tools/deploy-oss.sh

set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET=oss://xhs-poster-editor
DIST=app/dist

[ -f "$DIST/index.html" ] || { echo "❌ $DIST 不存在，先 cd app && ./node_modules/.bin/vite build"; exit 1; }

# 1. 带 hash 的静态资源：长缓存 immutable（内容变了文件名就变，可放心）
ossutil cp -r "$DIST/assets" "$BUCKET/assets" -f -u \
  --cache-control "public, max-age=31536000, immutable"

# 2. 其余（index.html / favicon / builtin-assets 等无 hash 文件）：no-cache 强制回源验证
ossutil cp -r "$DIST" "$BUCKET/" -f -u --exclude "assets/*" \
  --cache-control "no-cache"

# 3. 刷新 CDN 的 index（其余文件靠 no-cache/immutable 语义，无需全量刷新）
aliyun cdn RefreshObjectCaches --ObjectPath "https://xhsposter.tshzchen.cn/index.html" --ObjectType File >/dev/null 2>&1 \
  && echo "✅ CDN index.html 已刷新" || echo "⚠️ CDN 刷新失败（域名未就绪时属正常），手动：aliyun cdn RefreshObjectCaches"

echo "✅ OSS 部署完成：https://xhsposter.tshzchen.cn"
echo "   验证：curl -s https://xhsposter.tshzchen.cn | grep -o 'index-[^\"]*\.js'（比对本地 dist）"
