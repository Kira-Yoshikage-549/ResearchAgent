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

## 菜单标题低频字符替换验收 — 2026-10-11

按用户最新确认，将菜单标题 `Choose your next step` / `选择下一步` 的节奏调整为：每隔 **2–5 秒**随机选择 **1–4 个不同的非空白字素同时运动**，各字符独立选择上下方向，概率各 50%。每次仍为 1 秒，采用 [Wodniack 参考样式](https://wodniack.dev/_astro/index.MJ9FiCyD.css) 的 `cubic-bezier(.86,0,.07,1)`；位移为一个字符窗口高度，轮次间隔按开始时间计算。优先选择上一轮未选中的位置；中文字符数量不足时补足，单轮内不会重复位置。仅菜单启用 `EntryTransitionTitle.idleCharacterSwap`，默认关闭，由 `menuReady` 控制。

保留完整原始文本和既有 h2、ID、96px / 700 字体、96px 行高、-0.04em 字距、颜色、位置、可访问名称与焦点。`Intl.Segmenter` 提供字素及 UTF-16 偏移，DOM Range 测量字符窗口。原生完整文本始终参与布局与选择；动画时用 CSS Custom Highlight 暂时隐藏本轮选中范围，每个字符窗口的两个完整文本副本只绘制自身字素，保留真实 kerning 和换行。最多四个绝对定位窗口 `aria-hidden`、不可选择、无指针交互；各自动画结束后清理对应副本和范围，暂停时一次清理整轮。窗口使用完整字体范围高度覆盖下伸字母与汉字，横向预留 1px 绘制边界。API 缺失或测量失败显示原生静态标题。

使用一个低频 timeout 和 CSS 位移，只有字体、尺寸变化后的合并测量请求使用一次 rAF，没有持续动画循环、Canvas 或新增依赖。菜单就位、标题完整可见、字体准备好、页面前台、转场空闲时，通常等待 2–5 秒首次播放；当前标签页第一次下滑进入菜单另有下述立即播放例外。同轮字符先完成准备再一起启动，下轮定时在本轮开始时设置。离屏、后台、配置弹窗的 aria-hidden / inert、转场或减少动态效果立即取消计时和所有当前运动；恢复后重新等待，不补播。语言切换、卸载清理定时器、帧请求、Highlight、观察器和监听器。转场仍使用现有按词升降，其他标题保持原行为。

验证结果：

- `npm --prefix web run test -- --run --maxWorkers=2`：46 文件、249 项通过。其中 11 项菜单单元测试覆盖中英文与复合字素、随机 1–4 个唯一位置、独立方向、跨轮优先避开旧位置、2–5 秒开始间隔、逐字符结束、整轮暂停恢复、字体/尺寸重测、语言更新、StrictMode、失败回退与卸载清理。
- `PW_REUSE_SERVER=1` 下运行 `menu-character-swap.spec.ts next-scroll.spec.ts`：10 项全部通过，真实 Chromium，1366 × 768。覆盖上下 CSS 轨迹（横向位移为零）、1–4 字符同轮启动、1 秒时长、连续间隔、静止恢复、原生选择和实际 Ctrl+C 剪贴板内容、完整可访问名称、Next 下滑、菜单返回、语言切换、遮罩按词转场、键盘焦点、配置弹窗与减少动态效果。本次针对节奏调整重跑这两个浏览器套件；既有入口与遮罩转场的完整回归记录保留在前文及对应验收文档。
- `npm --prefix web run typecheck -- --incremental false`、ESLint 零警告和相关源文件/验收记录的 Prettier 检查通过。关闭增量写入仅为避开本机不可写的 `tsconfig.tsbuildinfo` 缓存；完整路由生成和类型检查照常执行。
- 标题盒维持 1270 × 96px，位置 (48, 144)，中英文均单行。整轮结束后的标题与开始前原生标题逐像素一致；上下采样帧保留邻字和页面位置。紧字距的 Highlight 边界在动画起始帧可能有少量抗锯齿色值差异，测试限定每个运动字符最多 60 个像素，不涉及尺寸、换行或静止字形变化。六张全视口截图集中复核通过，下伸字母与汉字的静止字形完整。

最终自然播放样本记录三个完整轮次，使用真实 `animationstart` / `animationend`，没有暂停、改方向或替换随机数：

| 语言 | 每轮字符数 | 两次轮次开始间隔 | 字符实际时长   | 同轮启动最大差值 |
| ---- | ---------- | ---------------- | -------------- | ---------------- |
| EN   | 4 → 1 → 2  | 3.843 / 3.963 秒 | 0.994–1.000 秒 | 0.2ms            |
| 中文 | 1 → 1 → 2  | 3.473 / 3.612 秒 | 0.994 秒       | 0.1ms            |

CSS 时长声明为 1 秒；事件采样受浏览器帧时间影响。英文第一轮同时包含三个向上字符和一个向下字符，确认各字符方向独立。原始时间记录：[EN](menu-character-timing-en.json)、[中文](menu-character-timing-zh-CN.json)，按轮次保存字符位置、方向与开始/结束时间。

截图：[EN 静止](screenshots/menu-character-static-en.png)、[向上](screenshots/menu-character-up-en.png)、[向下](screenshots/menu-character-down-en.png)；[中文静止](screenshots/menu-character-static-zh-CN.png)、[向上](screenshots/menu-character-up-zh-CN.png)、[向下](screenshots/menu-character-down-zh-CN.png)。上下截图为真实 Chromium CSS 动画 500ms 采样，本轮所有字符方向由验收场景显式切换；连续随机节奏与自然录像另行验证。

自然播放短录像：[EN](videos/menu-character-swap-en.webm)、[中文](videos/menu-character-swap-zh-CN.webm)。六张 PNG 和两段 WebM 均为本机 Chromium 原生 1366 × 768，未重绘、裁切或缩放；录像只记录正常随机播放。截图来源为项目真实字体与 CSS，没有外部位图素材。配置接口使用本地测试替身，没有写入真实密钥或运行研究任务。移动匹配不属于本次范围。

源代码、交互路径与集中视觉复核结论：`ship`。PRODUCT.md、DESIGN.md 和表面设计记录已同步。保留所有已有未提交工作，包括先前回归生成的旧遮罩截图/录像；未提交或推送。

### 当前标签页首次下滑立即替换 — 2026-10-11

按用户补充要求，当前标签页首次从欢迎页下滑进入菜单后，等待三个按钮的平移及纸色遮罩揭示全部结束，立即播放一轮正常的 1–4 字符并行替换。该轮仍为 1 秒，上下方向独立随机；从这轮开始按 2–5 秒的开始间隔继续播放。之后从其他页面返回菜单、再次从欢迎页下滑、语言切换或刷新已访问标签页，均走原有随机等待，不重复立即首轮。

复用现有标签页 `WELCOME_SESSION_KEY`，不新增存储项。`useEntryScroll` 在首次初始化时记录欢迎页资格，以一次性回调交给菜单标题；Next 记录访问状态不会提前消耗已记录的资格。直接进入 workspace 或恢复已完成的标签页没有立即首轮。菜单就位和标题播放条件仍须满足；通过按钮实际 `Animation.finished` 等待整个入场序列，不使用估计时长。初次 ResizeObserver 通知若尺寸与已测量结果一致则忽略，避免误取消该序列；真实尺寸变化和字体变化仍重新测量。

后台、离屏、遮挡、转场、减少动态效果或卸载会作废待播放首轮。按钮动画被取消时改为通常等待；恢复后不补播立即首轮。Promise 完成回调核对播放代次与可播放状态，旧序列不会在卸载、语言切换或重新进入后突然启动。字体、尺寸测量、原生字形、选择复制、可访问名称和现有按词遮罩转场保持原机制。

本次最终验证：

- 完整单元套件：46 文件、255 项通过。菜单组件 15 项、入口组件 8 项，新增覆盖全部按钮完成后立即首轮、正常后续间隔、StrictMode 一次领取、标签页访问状态、直接菜单入口、后台取消、卸载清理、按钮取消、减少动态效果和初次重复尺寸通知。
- `menu-first-entrance.spec.ts`：3 项通过；英文使用 Next 的真实缓慢下滑，中文使用真实鼠标滚轮。验证首轮紧接最后一个按钮完成、随机 1–4 字符、下一轮 2–5 秒、从研究页返回后的正常等待，以及首次配置弹窗遮挡后恢复仍正常等待。
- `menu-character-swap.spec.ts next-scroll.spec.ts entry-scroll.spec.ts --grep-invert '(native geometry|natural playback)'`：11 项通过。回归下滑节奏、中断/重复 Next、按钮揭示与反向播放、语言位置、菜单返回、按词遮罩转场、焦点、配置弹窗与减少动态效果。本轮共 14 项真实 1366 × 768 Chromium 检查；已有并行字符几何截图和自然三轮录像继续保留。
- 完整类型检查、ESLint 零警告和相关源文件/记录的 Prettier 检查通过。新增两张开始瞬间截图集中检查，标题布局与按钮位置维持既有视觉；录像和事件记录验证动态顺序。

| 语言 | 最后按钮完成到首轮开始 | 首轮到下一轮 | 从研究页返回后的等待 |
| ---- | ---------------------- | ------------ | -------------------- |
| EN   | 5.7ms                  | 2.745 秒     | 4.656 秒             |
| 中文 | 4.6ms                  | 2.200 秒     | 4.220 秒             |

原始事件记录：[EN](menu-first-entrance-timing-en.json)、[中文](menu-first-entrance-timing-zh-CN.json)。截图：[EN 首轮开始](screenshots/menu-first-entrance-en.png)、[中文首轮开始](screenshots/menu-first-entrance-zh-CN.png)。连续原生录像：[EN，25.72 秒](videos/menu-first-entrance-en.webm)、[中文，23.72 秒](videos/menu-first-entrance-zh-CN.webm)，均为 1366 × 768，包含首次下滑、立即首轮、后续随机轮次及从研究页返回；没有暂停、修改随机数、重绘、裁切或缩放。

本次代码、交互与集中视觉复核结论：`ship`。设计记录已同步；所有既有未提交改动保留，未提交或推送。
