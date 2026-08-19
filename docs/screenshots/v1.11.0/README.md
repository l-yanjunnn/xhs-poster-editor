# v1.11.0 封面副标题微排版·本地视觉标定

> 状态：**用户已于 2026-08-19 锁定本组视觉值并授权走上线闭环**。`standard` 锁为 v1.10.2 原视觉；本目录是发布前的 write-once 本地证据。

## 目录口径

- `standard-baseline-v1.10.2-real-fixture/`：权威 standard 基线。使用真实副标题「看起来」高分和「实际高分」是两件事情，包含 3 版式的画布截图、2160×3600 PNG 和 sealed geometry manifest。
- `standard-baseline-v1.10.2/`：开工时的 canned 文案像素基线，保留作辅助证据；对照时以上述 real-fixture 目录为准。
- `candidate-real-fixture-v1/`：公考主题 3 版式 × 3 档候选，共 9 张画布截图和 9 张 2160×3600 PNG。`manifest.json` 记录字距、atom 几何、折行、snapshot 与像素比较。
- `nonpublic-minimal-white-v1/`：旧主题「极简白」的三档回归。其旧 standard 本来就是零字距，所以 compact 与 standard 可以相同，未为制造差异引入负字距。

高分辨率 PNG、单张截图与原始 manifest 作为 write-once 本机证据保留；Git 只纳入轻量联系表、本说明和可复跑脚本，避免让 129 MB 可再生图片膨胀仓库历史。

## 已锁定值

| 版式 | compact | standard | relaxed |
|---|---:|---:|---:|
| 普通 / 居中 | `0em` | 不新增覆盖，继承 v1.10.2 | `0.08em` |
| kicker | `0.10em` | 不新增覆盖，继承 v1.10.2 `0.18em` | `0.26em` |

`standard` 不新增 CSS 覆盖，继承 v1.10.2 在不同主题/版式中的原有值。联系表：

- `candidate-real-fixture-v1/contact-sheet-preview.png`
- `candidate-real-fixture-v1/contact-sheet-png.png`
- `nonpublic-minimal-white-v1/contact-sheet-preview.png`

修正 RGBA 比较器后的发布口径：standard 的 sealed geometry、snapshot 和画布截图与 v1.10.2 严格相同；2160×3600 PNG 只允许最多 0.003% 像素发生 1 色阶的跨运行抗锯齿量化波动。生产标定中的差异点全部位于字形边缘，副标题几何与画布截图均无差异。早期 write-once manifest 中 RGBA `getbbox()` 的默认 alpha-only 结果不作发布断言，以修正后脚本复跑为准。

## 可复跑门禁

```bash
python3 tools/export-race-repro/test_v1110_state_local.py \
  --url http://127.0.0.1:4173/

python3 tools/export-race-repro/test_v1110_cover_subtitle_local.py \
  --url http://127.0.0.1:4173/

python3 tools/export-race-repro/test_v1110_nonpublic_local.py \
  --candidate-url http://127.0.0.1:4173/ \
  --baseline-url http://127.0.0.1:4172/
```

脚本使用本机 stable Chrome（Playwright `channel="chrome"`）。视觉输出目录是 write-once；需重采时应换新目录，不覆盖已有证据。

## 锁值备注

- 左叠排和居中海报的三档差异故意保持克制。
- 长真实副标题在 kicker standard 中的窄栏多行是 v1.10.2 原视觉，不是本轮回归；compact 会明显收拢，relaxed 仍保留窄栏特征。
