# History ↔ Settings 顶部切换 — 2026-10-12

顶部栏 History 与 Settings 的互相切换复用现有短纸幕：从右覆盖、向左揭幕，覆盖 180ms `power2.in`、完全遮罩暂留至少 400ms、揭幕 240ms `power3.out`，总计至少 820ms。目标未就绪时继续等待现有挂载信号。

完全覆盖后提交路由；不显示中央大标题，不拆分或移动目标标题。结束后按现有机制聚焦目标标题，使用 `preventScroll`，导航滚动仍遵循原行为。沿用共享导航锁、异常与中断清理、5 秒挂载超时和减少动态效果时的直接切换。同页点击保持原位，链接的原生修饰键行为保持现状。

本次只改变 History ↔ Settings 的模式选择。菜单与这些页面之间、新建研究相关的完整标题转场，任务与报告短转场及自动报告揭幕保持现状。无布局、边栏、数据请求、文案、翻译或依赖变更。

截图和完整录屏由本地生产预览中的 Playwright 直接生成，使用模拟设置与历史接口，未创建真实研究任务。桌面视口 1366 × 768；未进行图片编辑或录屏剪辑。

28 项导航单元测试、5 项相关生产浏览器场景通过；单测确认 180／400／240ms、覆盖后提交、共享锁、原生标题与结束焦点，浏览器确认中英文双向切换、至少 400ms 暂留（观测容差 30ms）、同页点击、减少动态效果，以及原菜单和新建研究转场。生产构建（含 TypeScript）、lint、格式与差异空白检查通过。一次集中截图复核未发现标题裁切或布局偏移；同一会话最终验收结论：ship。

- [英文设置](screenshots/history-settings-settings-en.png) / [英文历史](screenshots/history-settings-history-en.png) / [英文暂留](screenshots/history-settings-hold-en.png)
- [中文设置](screenshots/history-settings-settings-zh-CN.png) / [中文历史](screenshots/history-settings-history-zh-CN.png) / [中文暂留](screenshots/history-settings-hold-zh-CN.png)
- [英文完整录屏](videos/history-settings-transition-en.webm) / [中文完整录屏](videos/history-settings-transition-zh-CN.webm)
