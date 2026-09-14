# v1.13.0 · 内页微调与裁切确认

发布进行中；当前用户已授权上线闭环。

- 内页新增 ±360 px 位置滑杆（步长 1 px），保留默认 / 顶部 / 居中。只移动当前页内容，Logo 原位；支持拖动撤销重做、草稿保存和模板继承。点击顶部或居中恢复对应固定位置。
- 底部排版参考线保持当前主题原定留白高度，不随内容位置变化。
- 超出画布时保留强制导出，先展示受影响页面、裁切边界放大图与实际 PNG；再次确认后导出同一批图片。主题留白与封面安全区仍为普通警告。实际丢字、字体失败、压缩或重叠仍需修正。

本地候选已通过 505 单测及实际 PNG/ZIP 验收。生产结果待补。

入口：https://xhsposter.tshzchen.cn ／ https://xhs-poster-editor.l-yanjunnn.workers.dev

使用说明：https://icnyqonxxzop.feishu.cn/docx/SFDddCFb3o8T5VxP2wBcb0XXndd
