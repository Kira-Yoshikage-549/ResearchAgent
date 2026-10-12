# 研究流程转场补齐 — 2026-10-11

按用户批准的方案，复用现有 GSAP 和纸幕，补齐任务与报告的进出以及实时研究首次显示报告的衔接。保持首页滚动、Canvas 扰动、菜单字符、四页完整标题转场和阶段加载的原有实现；报告标签、论文详情、Zen 和追问交互保持现状。

## 动作与边界

| 场景                                                 | 方向与动作                         | 时长                                            |
| ---------------------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| 创建成功、重试成功、活动任务返回、历史或侧栏打开任务 | 纸幕右侧覆盖，提交路由，再向左揭幕 | 180ms power2.in + 暂留 400ms + 240ms power3.out |
| 任务或报告返回菜单、历史                             | 从右覆盖，向左揭幕                 | 180ms + 暂留 400ms + 240ms                      |
| 任务或报告进入新建研究、设置或另一任务               | 正向纸幕                           | 180ms + 暂留 400ms + 240ms                      |
| 已显示实时研究后首次取得可展示报告                   | 现有可视内容区从上向下裁切揭开     | 320ms power3.out                                |

跨页纸幕沿用 `#FAF9F4`，没有中央大标题、逐词正文或逐段延迟。四页完整转场继续使用原有六阶段和标题动画，二者共用一个导航锁。

完全覆盖后提交路由，纸幕至少暂留 400ms。暂留结束且目标任务主区域挂载后揭幕，允许原有加载和错误状态正常显示；返回菜单等待现有 `menuReady` 滚动定位，保留 `scroll:false`。暂留与挂载等待并行，挂载等待最多 5 秒，超时后释放交互。结束时聚焦可见标题，加载或错误状态聚焦主区域，使用 `preventScroll`。

同任务链接忽略，修饰键和新标签保留 Next Link 原生行为。创建失败保持原反馈和草稿。减少动态效果直接切换；历史操作、语言变化、配置门禁、隐藏、卸载和中断释放遮罩、计时器和交互锁。

报告揭幕依附现有任务内容区和查询结果，不重新挂载 Provider、不改报告显示条件或事件流。只消费本次挂载中的第一次报告到达；直接打开、刷新、切换标签不重播。输入框聚焦、文本选中、后台或导航忙碌时直接显示且不补播；保留被替换的实时内容中的选区状态。自动揭幕不调整焦点或滚动，输入、滚动、窗口变化和动画异常均恢复原有裁切样式。

## 桌面证据

以下截图和完整录屏来自实际 Chromium，1366 × 768，使用模拟任务与事件，原始文件未经视觉编辑。

| 状态         | English                                             | 中文                                                     |
| ------------ | --------------------------------------------------- | -------------------------------------------------------- |
| 实时研究     | [EN](screenshots/research-transition-live-en.png)   | [中文](screenshots/research-transition-live-zh-CN.png)   |
| 报告揭幕采样 | [EN](screenshots/research-transition-reveal-en.png) | [中文](screenshots/research-transition-reveal-zh-CN.png) |
| 报告完成     | [EN](screenshots/research-transition-report-en.png) | [中文](screenshots/research-transition-report-zh-CN.png) |
| 返回历史     | [EN](screenshots/research-transition-return-en.png) | [中文](screenshots/research-transition-return-zh-CN.png) |

完整交互录屏：[English](videos/research-transition-en.webm)、[中文](videos/research-transition-zh-CN.webm)。包括历史进入、正向返回菜单、原有完整转场、新任务创建、实时到报告、报告标签和返回历史。移动端截图验收不在本轮范围内。

## 验证记录

- `npm --prefix web run test -- --run --maxWorkers=2`：50 文件、295 项全部通过。包含导航锁、覆盖后提交、镜像方向、菜单定位等待、同任务与修饰键、慢加载、5 秒超时、减少动态效果、报告单次消费、输入/选区/后台跳过、焦点/滚动保持以及中断和启动异常恢复。与生产构建并行的一次运行中，两个原有欢迎物理测试超出默认 5 秒；构建结束后限制并发重跑全套通过，未改测试超时或原动效。
- 复用开发服务执行 `research-transition.spec.ts entry-transition.spec.ts entry-scroll.spec.ts next-scroll.spec.ts menu-character-swap.spec.ts menu-first-entrance.spec.ts stage-loading.spec.ts research-focus.spec.ts report-navigation.spec.ts research-input.spec.ts deepseek-settings.spec.ts welcome-deferred.spec.ts welcome-title.spec.ts welcome-description.spec.ts`：55 个桌面场景，54 项通过；旧中文首页标题场景捕获 Next.js 的 `Router action dispatched before initialization`，新增 7 项均通过。
- 构建后用独立 `next start --hostname 127.0.0.1 --port 3001`，设置 `PW_REUSE_SERVER=1`、`E2E_WEB_PORT=3001`，复核 `research-transition.spec.ts welcome-title.spec.ts stage-loading.spec.ts research-focus.spec.ts report-navigation.spec.ts`：20/20 通过，中文首页错误未复现。最终修补异常清理后，新转场、报告标签/导航/Zen、阶段加载、追问草稿和单一 SSE 均再次通过。55 个不同场景均取得通过结果。
- `npm --prefix web run typecheck -- --incremental false`、`lint -- --max-warnings 0`、`format:check`、`i18n:check`、`build`：通过。构建仍提示原菜单字符 CSS 的 4 条 `::highlight` 解析警告；对应源文件未改动，菜单浏览器回归通过。
- 新增 UI 文件的 Impeccable 手动检测一次，结果 `[]`；最终源代码与差异复核通过。

初次实施的两批集中视觉复核：先检查中英文实时页、报告和回程布局；最后确认报告裁切采样与完整原始录屏的采样帧。纸幕覆盖时裁切符合方向，揭幕完成后文字完整且保持原位置，标题未出现逐词或逐段延迟。可视内容裁切之外的工作区框架未新增动画。未发现需修正的排版变化；短动画启动异常的保护已在第二次确认前补齐。当前录屏在下述时长与方向调整后刷新，为 25fps、1366 × 768，英文 10.84 秒、中文 11.00 秒，保留完整原始交互；该视觉复核不代表真实研究后端或所有硬件的性能测试。

验收结论：ship。本轮没有新增依赖、后端、API、数据库或持续动画循环；原任务 Provider 与请求机制保持原位。浏览器验证使用模拟接口和事件，不创建真实研究任务。回归测试自动刷新的旧截图、录屏和时间数据已恢复，本轮仅保留新增流程的证据。

## 时长与方向调整 — 2026-10-12

按用户明确选择“返回也统一为正向”，所有短转场均从右覆盖、向左揭幕，包括任务或报告返回菜单、历史。时序统一为覆盖 180ms、完全遮罩暂留至少 400ms、揭幕 240ms，总计至少 820ms；挂载与暂留并行，目标未就绪时继续保持遮罩。原四页完整标题转场和 320ms 报告揭幕保持现状。

46 项相关单元测试通过；7 项独立生产预览浏览器场景通过，中英文进入和返回均验证了最短暂留，原完整转场、慢加载、重试、减少动态效果与单次报告揭幕也通过。TypeScript、lint、格式和生产构建通过。中英文截图及完整录屏已刷新。

2026-10-12 顶部栏补充：History ↔ Settings 也复用相同的正向短转场，覆盖 180ms、暂留至少 400ms、揭幕 240ms。菜单与新建研究相关的完整标题转场保持现状。详见 [单独验收记录](history-settings-transition.md)。
