# Logo 本地候选验收

仅访问回环本地地址；Chrome 使用独立临时 context，文案全是合成稿，不操作用户浏览器资料。

- `logo-flow.py`：开发服务 4197；全规则 / 逐页 / 分页 / 撤销 / 模板 / 草稿 / 刷新 / 三主题两位置真实 ZIP / 窄屏。
- `outside-review.py`：rc.2 构建预览 4198；三档位置、9 张实际 PNG、5 px 间隙、内页不变、隐藏/显示、撤销/重做、刷新、键盘、模板缩略图与应用、窄屏。新证据独立保存在 `evidence/rc2/`。
- `build-review.py`：构建预览 4198；通过真实粘贴进入，无 dev hook；键盘控制、截图、两组真实 ZIP 与每张 PNG 逐字节比对、刷新。
- `legacy-compat.py`：只读 v1.13.0 构建 4199 对比开发候选 4197；隔离 IDB 合成旧稿、顶部布局和隐藏兼容。几何容差 0.05 画布像素（缩放坐标浮点舍入），非布局位移容忍。
- `narrow.py`：4199 / 4198 比较 900 / 600 / 390px。原产品最小宽度 1280px，验收为不新增溢出，不声称完整手机编辑器。
- `export-freshness.py`：4197；封面显隐变化使旧成品失效，文字快照保持不变。

运行：`python3 tools/logo-candidate/<脚本>.py`（本机 Python 已有 playwright/Pillow；浏览器 channel 为 Chrome）。证据保存在隔离任务的 `evidence/`。开发服务启动文件位于任务目录 `checks/dev-server.mjs`；构建预览使用任务目录 `START-LOCAL.command`。历史对照服务仅只读原仓库 `app/dist`，不会修改它。

独立重渲染存在极少量单通道 1 级抗锯齿差异；同一次生成的成品预览与实际下载仍必须逐字节相同。Chrome 的个别多 context 清理可能在全部断言和证据保存后挂住；本轮 legacy 对比已保存通过证据，随后中止了浏览器清理。不要将清理问题写为产品失败或漏过产品断言。
