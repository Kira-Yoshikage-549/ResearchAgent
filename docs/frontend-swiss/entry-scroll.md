# 合并入口与滚动动画验收

2026-10-11，用户审核 Generous Branding 首屏到第二屏的实际动效后，授权以“变暗＋20% 纵向视差”替换欢迎页的挤压效果。欢迎与菜单继续共用 ResearchEntryPage；根路由默认欢迎，workspace 默认菜单，会话内进入过菜单则根路由也定位菜单。

## 动画机制

参考：[Generous Branding](https://generousbranding.com/)。浏览器读取到参考首屏内容使用 `opacity: calc(1 - var(--progress) * 1.25)`，内容容器使用 `translate3d(0, calc(var(--progress) * 20%), 0)`；首屏底层为黑色，高度保持 100svh。

本项目中，欢迎分区保留自然布局高度 H 并裁切溢出，底色为黑色。设滚动距离 S，p = clamp(S/H, 0, 1)，完整米白内容层应用 translateY(0.2 × H × p) 和 opacity=max(0, 1−1.25p)。没有 scaleY：标题、文字、Canvas 和按钮保留原始尺寸，一起渐隐到黑色底层。菜单正常从下方进入，顶部为 H−S。停止滚动时亮度与视差保持当前值，上滑直接恢复，不加入时长动画、滚轮劫持或吸附。

H=768、S=384 时，内容层高度仍为 768，视口顶部约为 −307.2，不透明度为 0.375，菜单顶部为 384。S 达到 80% 首屏高度后内容层完全透明且禁用鼠标点击；达到 H 时保持既有离屏隐藏状态。键盘聚焦首屏控件会立即返回欢迎顶部并恢复亮度。减少动态效果使用普通滚动、完整亮度和无视差。

菜单行展开保持既有机制：GSAP ScrollTrigger 在行顶边经过视口高度 85% 时切换 data-revealed。编号、标签和箭头整体从 translateX(-10%) 归位（1s，cubic-bezier(.86,0,.07,1)）；87% 不透明的米白遮罩从右侧原点 scaleX(1) 到 0（1.2s，cubic-bezier(.645,.045,.355,1)），从左到右显示黑色。分割线与点击范围固定，停止滚动后行的时间动画继续播放，上滑从当前状态反向衔接。键盘聚焦解除遮罩和横移。欢迎页渐隐和菜单临时灰色是本次用户授权的入口动效配色例外。

## 兼容行为

NEXT 采用参考网站右下角按钮的较缓下滑：1.5 秒，easeInOutQuint（GSAP `power4.inOut`），先缓慢起步、中段加速、末段缓停。参数来自参考站公开的 [a-scroll 组件脚本](https://generousbranding.com/wp-content/themes/generous-theme/build/js/9697-a45f3723dae679a4e85e.js)，其中下滑 `duration: 1.5`，缓动函数为 p<0.5 时 16p⁵，否则 1−(−2p+2)⁵/2。本项目使用现有 GSAP 的 ScrollToPlugin，仅在点击 NEXT 时接管滚动；欢迎页亮度、视差与菜单展开继续由实际滚动位置驱动。滚轮、触摸、滚动键或拖动滚动条可中断动画并取消目的地焦点；重复点击从当前位置重启，不叠加动画。语言切换及组件卸载取消进行中的动画。开启减少动态效果时直接到达菜单；动画中开启该选项也会立即完成。

菜单 Research Agent 保留原有的平滑返回。语言切换沿用 scroll:false 和短期会话位置快照。菜单就位且滚动停止 120ms 后才启用 API Key 检查；overlay 门禁保留入口组件、Canvas 和滚动位置。路由、存储键、Hook 返回接口、后端及数据库契约保持兼容。

Canvas 使用固定布局尺寸，指针坐标根据实际平移后的显示矩形转换。现有欢迎分区可见性观察、离屏和页面隐藏暂停、DPR 上限、噪声、弹簧、标题变形、原生文字回退及资源清理继续沿用。没有增加动画循环、绘制频率限制、依赖或逐帧分辨率重建。

## 当前桌面截图

全部为实际项目在 Chromium 1366 × 768 下生成的原生 PNG，没有裁切或放大。

| 状态     | 英文                                         | 中文                                              | 验收点                             |
| -------- | -------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| 首页顶部 | [EN](screenshots/entry-dark-top-en.png)      | [中文](screenshots/entry-dark-top-zh-CN.png)      | 初始排版和亮度                     |
| 半屏变暗 | [EN](screenshots/entry-dark-middle-en.png)   | [中文](screenshots/entry-dark-middle-zh-CN.png)   | 原始尺寸、0.375 不透明度、20% 视差 |
| 完全变黑 | [EN](screenshots/entry-dark-black-en.png)    | [中文](screenshots/entry-dark-black-zh-CN.png)    | 剩余首屏为黑色，菜单仍为米白       |
| 菜单就位 | [EN](screenshots/entry-dark-menu-en.png)     | [中文](screenshots/entry-dark-menu-zh-CN.png)     | 菜单展开、波纹暂停                 |
| 反向恢复 | [EN](screenshots/entry-dark-reverse-en.png)  | [中文](screenshots/entry-dark-reverse-zh-CN.png)  | 恢复对应位置的亮度和视差           |
| 回到顶部 | [EN](screenshots/entry-dark-restored-en.png) | [中文](screenshots/entry-dark-restored-zh-CN.png) | 快速往返后完整恢复                 |

此前的 entry-squeeze-middle.png 仅为被替换实现的历史截图，不再用于当前验收。菜单行遮罩的历史截图仍描述保留的行展开机制。

## 验证记录

2026-10-11，本次最终验证全部通过：

- `npm --prefix web run test -- --run`：43 文件、224 项单元测试通过。
- `npm --prefix web run test:e2e -- entry-scroll.spec.ts welcome.spec.ts welcome-waves.spec.ts welcome-title.spec.ts entry-transition.spec.ts`：Chromium 1366 × 768，23 项通过（1.4 分钟）。覆盖中英文几何与亮度、停止与反向、快速往返、指针坐标和 Canvas 分辨率、语言位置、键盘恢复、动态切换减少动态效果、NEXT/返回、会话记忆、受限存储、配置门禁和 Canvas 不可用。
- `npm --prefix web run typecheck -- --incremental false`、`npm --prefix web run lint -- --max-warnings 0`、`npm --prefix web run format:check`、`npm --prefix web run build` 全部通过；ESLint 零警告。
- Impeccable 手动检测一次，目标为入口滚动逻辑、欢迎页 CSS 和波纹组件，结果 `[]`；源代码 diff 检查通过，无遗留调试输出。
- 12 张桌面截图集中视觉复核通过，PNG 原始尺寸均为 1366 × 768，复制前后 SHA256 一致。顶部与恢复后的排版一致，半屏标题和波纹保持原始尺寸，完全变黑只影响欢迎分区，菜单正常展开。没有追加视觉修正。
- 内置浏览器实际滚动补充确认：H=720、S=360 时内容高度=720、顶部=−288、不透明度=0.375、菜单顶部=360；Home 返回后 S=0、不透明度=1。此项为交互确认，桌面截图验收仍以上述 1366 × 768 为准。

标题回归去掉了既有的全局 `Math.random = () => 0.5` 测试替身。对照运行中，该替身使 NEXT 的 React 点击处理没有执行；恢复真实随机数后，键盘进入菜单、标题恢复与字形快照验证均通过。产品事件处理逻辑未作额外修改。

源代码和完整交互路径复核结论：`ship`。现有 PRODUCT.md、DESIGN.md 和表面设计记录已同步最新动效；这三份文件沿用项目已有的 Git 忽略规则。

配置与历史请求在浏览器测试中拦截；验收不写入实际 API 密钥，不运行真实研究任务。移动端截图匹配不属于本次范围。

## NEXT 较缓下滑验收 — 2026-10-11

- `npm --prefix web run test:e2e -- next-scroll.spec.ts --reporter=line`：新增 4 项全部通过，1366 × 768。实际 rAF 采样验证中英文均为缓起步、中段加速、缓停；375ms 时进度不足 8%，750ms 时为 30%–70%，1125ms 时超过 93%，到达时间超过 1200ms。验证最终菜单位置、焦点、路由、滚轮/按键/触摸事件/外部滚动位置变化中断、重复点击、键盘 NEXT 和动态切换减少动态效果。
- 首次与新增场景合并运行时，`entry-scroll.spec.ts` 和 `welcome.spec.ts` 的 10 项既有入口回归全部通过。新增采样测试初次失败是结束后首页按钮已隐藏，角色选择器默认排除隐藏元素；改为包含隐藏按钮后，上述 4 项最终通过。产品动画逻辑未因此改动。
- `npm --prefix web run test -- --run --maxWorkers=2`：45 文件、238 项全部通过。入口组件现有 GSAP 测试替身同步支持 `to`，焦点验证显式模拟到达。首次不限并发运行另外出现两项计算密集测试的 5 秒超时，限制为两名测试 worker 后完整通过，没有改动物理/波纹逻辑或超时阈值。
- TypeScript、ESLint 零警告、4 个本次相关文件的 Prettier 检查、源代码 diff 检查通过。
- 本次中英文原生截图为 Chromium 在 1366 × 768 下捕获的后半段下滑帧；没有重绘、裁切或放大。截图和录像复制前后 SHA256 一致。截图：[中文](screenshots/next-scroll-middle-zh-CN.png)、[EN](screenshots/next-scroll-middle-en.png)。实际点击录像：[中文](videos/next-scroll-zh-CN.webm)、[EN](videos/next-scroll-en.webm)。录像为 Playwright 默认缩放记录；截图用于桌面几何验收。集中视觉检查通过，没有追加视觉修改。
- 内置浏览器补充触发并确认菜单标题焦点。其后台检查期间帧回调约每秒一次，GSAP 时间补偿使播放变长；最终正常完成。这是检查环境的后台帧节流，正常 Chromium 的时长以上述采样为准。临时浏览器诊断、事件监听和滚动方法包装已还原。

最终源代码和交互复核结论：`ship`。PRODUCT.md、DESIGN.md 和表面设计记录同步了 NEXT 的新节奏；已有未提交工作保留，未提交或推送。
