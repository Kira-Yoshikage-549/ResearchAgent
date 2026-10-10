# 首页 Canvas 波纹

2026-10-11：标题已在同一个 Canvas 中加入局部弹性扰动与背景透明度遮罩；两行黑色字形、灰色描边和原有背景参数保持。当前标题行为、性能和六张截图见 [首页标题扰动](home-title.md)。下文保留 2026-10-10 背景优化记录。

2026-10-10，`轻量化前端` 分支。按用户确认的规划，将 SVG 持续绘制改为 Canvas 2D＋现有折线，并取消人为帧率限制。首页排版、文字、奶油底、灰线、黑点和红色下一步按钮保留。

## 当前实现

- React 只测量首页上下分割线；原生 `a-waves` Web Component 管理动效实例和断开清理。波纹左右到页面边缘，位于页头底边与页脚顶边之间。1366 × 768 下为 y=96–704px。
- 使用透明 Canvas 2D、统一 1px `#AAA9A3` 描边、独立 `moveTo`／`lineTo` 子路径。每次描边合并最多 8 条线，避免单条超大路径的栅格化成本；每个动画帧完整绘制所有批次，不保留远处背景 30fps 分档。
- 持续动画直接使用原生 `requestAnimationFrame`。每次回调同步更新跟随黑点、弹性模拟、噪声和 Canvas；没有 60／90fps 时间门槛，不调用 `gsap.ticker.fps()`，不跳帧或突发补画。
- 保留 10px 线距、32px 纵向采样、首段起点及末端处理、0.1px 坐标取整和 32／16px 噪声幅度。1366 × 608 有 158 条线、3318 个采样点、20 次描边；2048 × 992 有 226 条线、7458 个采样点、29 次描边。没有改为 Bézier 曲线或减密。
- `noisejs` Perlin 算法、随机种子、空间系数 0.002／0.0015、时间系数 0.0125／0.005 保留。活动时钟在暂停期间停止，恢复后不积累后台时间。
- 坐标缓存和入场弧长缓存使用可复用的 `Float64Array`，不再构建 SVG 路径字符串或逐帧生成临时坐标对象。DPR 后备位图倍率上限为 2；布局和系统 DPR 变化都重设变换与描边。
- 黑点仍为 8px 黑色 CSS `::before`，使用 `translate3d`；系统指针保留。右侧两段说明保持与 Agent 一样的黑色，下一步保持 `#DA291C`，没有红色波纹或暂停／继续按钮。

## 时间与交互

黑点缓动为 `1 - 0.9^(dt / 16.667ms)`；原始鼠标速度换算到每 16.667ms 的位移单位。扰动中心与黑点一致，速度和方向来自实际鼠标移动；停止移动后保留最后的方向，避免余力突然转向。

弹性使用原站 60Hz 离散更新矩阵的分数次幂：

```text
A = [[0.99075, 1.85], [-0.004625, 0.925]]
state(dt) = A^(dt / 16.667ms) × state
```

这对应张力 0.005、摩擦 0.925 和速度倍率 2。60Hz 是运动参数的校准基准，**不是帧率上限**。恒定外力按同一矩阵的平衡位移推进；施力中心随黑点更新。每个模拟子步最多 16.667ms，一次长帧最多累计 50ms，位移仍限制在 ±100px。无外力回落在不同刷新率下保持相同轨迹。

入场继续使用 GSAP 的 0.5s 起始位置、3s `expo.out` 和从两侧向内的 0.5s `power3.inOut` 错开。GSAP 时间线保持 paused，由同一个 rAF 手动推进。Canvas 按折线弧长绘制尾段，替代 DrawSVG 的 `100%100%` → `0%100%`；完成前一秒启用扰动，完成后释放时间线。没有 DrawSVG 导入或全局 ticker 设置。

背景忽略指针事件，首页容器监听被动指针事件，标题、说明和按钮上方仍可扰动，文字选择、点击与键盘导航正常。离开区域停止施力、隐藏黑点并自然回落；触摸不显示黑点且不阻止滚动。减少动态偏好显示静态完整轮廓；隐藏／离屏取消待执行的 rAF，恢复时重置帧时间。卸载取消动画、释放时间线、观察器、偏好／DPR／输入监听和 Canvas 位图。Canvas 2D 不可用时保留前景页面的可用性。

## 来源与技术差异

波纹轮廓和初始弹性参数来源于 [Wodniack 原站上线组件](https://wodniack.dev/_astro/hoisted.BvNyQ0G_.js)，公开算法见 [Wavy Lines / SVG version / Multiple paths](https://codepen.io/wodniack/pen/abeMZXQ)，MIT 许可保留于 [wodniack-waves.txt](licenses/wodniack-waves.txt)。原站逐 GSAP tick 更新 SVG，并以固定每 tick 系数跟随和回落；本版按用户后续要求改变渲染技术和时间推进方式，因此不再宣称与原站的全部逐 tick 坐标完全一致。

[Akias 参考站源码](https://akias.asia/wavy-lines/main.js) 使用原生 rAF、Canvas 2D、50px 物理像素网格和 Bézier 曲线，没有持续 Perlin 运算或人为限帧。本版参考其 Canvas 路径，保留用户选择的现有折线密度与 Perlin 运动；参考站更少的点数和计算量不能作为本项目帧率承诺。

## Chrome 全屏测量

本机安装的 Chrome、生产构建、独立测试配置、同一全屏窗口、噪声种子 0.5、同一连续鼠标轨迹，每版三次约 10 秒。物理显示区域 2560 × 1440，系统 DPR 1.25，对应 CSS 视口 2048 × 1152；波纹区域 2048 × 992。GPU 诊断确认 NVIDIA GeForce RTX 4060 Ti，Canvas、GPU 合成与栅格化启用。

| 指标                       | SVG 局部发布基线 | 最终 Canvas（8 条线／批） |
| -------------------------- | ---------------: | ------------------------: |
| 第一次 rAF 回调频率        |          59.53/s |                   65.99/s |
| 第二次 rAF 回调频率        |          59.93/s |                   66.11/s |
| 第三次 rAF 回调频率        |          59.91/s |                   65.81/s |
| 平均 rAF 回调频率          |          59.79/s |                   65.97/s |
| 帧间隔 P95                 |           18.3ms |                    18.3ms |
| 三次采样中超过 25ms 的间隔 |                1 |                         1 |
| 平均 10 秒 ScriptDuration  |           1.842s |                    2.122s |
| 平均 10 秒 TaskDuration    |           2.232s |                    2.373s |
| 远处背景更新频率           |          约 30/s |       每次 rAF（约 66/s） |

回调频率提高约 10.3%，所有波纹均逐帧绘制；累计脚本和任务时间没有下降，P95 也没有改善。不得将其写成“总 CPU 降低”“165fps 稳定运行”或“输入延迟已解决”。这些是固定轨迹下的合成输入与回调时间，未测量显示器实际呈现帧数、端到端输入延迟，也不等同于用户现有 Chrome 配置的性能。

原规划中“一次描边整个线场”被实测否决：其全屏回调仅约 24/s，P95 43.5–48.4ms。独立栅格化探针比较 1／8／32／226 条线每批以及透明／不透明背景；8 条线每批最佳，透明度不是主要瓶颈。因此保留透明 Canvas，使用有限大小的路径批次，而非提高帧率限制或降低线条密度。探针用于定位渲染成本，不能代替上方真实运动的最终测量。

本地原始数据：`artifacts/home-waves/canvas-performance-svg-before.json`、`canvas-performance-canvas-after.json`、`canvas-performance-canvas-single-path.json` 和 `canvas-raster-probe.json`。这些运行输出不加入产品资源；临时探针测试已删除。保留可按需运行的 `web/e2e/welcome-waves-performance.spec.ts`，默认跳过，避免普通 CI 自动打开全屏 Chrome。

## 验证与截图

25 项单元／组件测试覆盖：原站固定种子端点、独立折线拓扑、8 条线描边批次、300 回调／秒下每次完整绘制且不调用 ticker 限频、黑点渐进跟随及不同刷新率一致性、扰动中心、60／120／165Hz 弹性回落一致性、快速反向移动、长帧保护、原有入场配置和部分弧长、减少动态实时切换、隐藏／离屏恢复、DPR 上限、尺寸变化、资源清理、Canvas 不可用、Web Component 重新连接和首页分割线定位。

16 项 1366 × 768 生产版 Chrome 回归覆盖中英文首页、真实 Canvas 像素／灰色描边、波纹范围、黑点、前景文字选择、按钮与键盘导航、语言／尺寸变化、减少动态、离线首页资源和离开后的卸载。业务接口使用 mock，未发起真实研究。类型、lint、翻译、改动文件格式检查和生产构建通过。

四张截图由仓库 Playwright 在本机 Chrome、生产版 `http://localhost:3000/`、1366 × 768 下直接生成，没有图像编辑：

- [中文首页](screenshots/welcome-waves-zh-CN.png)／[英文首页](screenshots/welcome-waves-en.png)
- [中文扰动](screenshots/welcome-waves-pointer-zh-CN.png)／[英文扰动](screenshots/welcome-waves-pointer-en.png)

本次没有新增位图、依赖、翻译文案、后端、路由或公共 API。正常 BAT 启动仍为 UI 3000、API 8000；验证服务只使用 3000，完成后释放本次自有测试进程，不保留 3001 预览。

复现命令（仓库根目录 PowerShell；先在 3000 启动生产版并在完成后退出）：

```powershell
npm --prefix web run build
npm --prefix web run start -- --hostname 127.0.0.1 --port 3000
# 另一终端运行；结束后关闭上面的生产测试服务。
$env:PW_REUSE_SERVER = "1"
npm --prefix web run test:e2e -- welcome-waves.spec.ts welcome.spec.ts entry-transition.spec.ts welcome-physics.spec.ts --reporter=line
$env:WAVE_BENCHMARK = "canvas-after"
npm --prefix web run test:e2e -- welcome-waves-performance.spec.ts --reporter=line
Remove-Item Env:WAVE_BENCHMARK
npm --prefix web run test -- --run features/welcome/wave-field.test.ts features/welcome/wave-element.test.ts components/welcome/welcome-waves.test.tsx components/welcome/welcome-page.test.tsx
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run i18n:check
```

## 完成复核

同一会话内单独复核，未委派独立审查者。一次集中检查发现超大路径栅格化退化；一次分批修正后确认。桌面范围依用户约定，不增加移动端截图验收。

- **persistence**：PRODUCT、DESIGN 和 surface brief 记录最终 Canvas、无帧率上限和保留的首页布局；文档、原始测量和截图完整。
- **fidelity**：原有 Inter 144px／中文思源字体、黑色说明、奶油底、红色下一步、灰色细线、分割线范围、黑点和内容保留；Canvas 抗锯齿及时间归一化属于明确记录的实现差异。
- **ceiling**：没有添加按钮、文案或装饰层；实测全屏更新频率提高且远处波纹逐帧，但 P95 不变、累计 CPU 时间未降低，均如实记录。
- **material_fixes**：单条巨大 Canvas 路径的性能退化已通过 8 条线一批修正，无遗留功能阻断项。
- **keep**：保留完整线场、即时导航、可选择文字、键盘操作、偏好切换和卸载清理。

复核 verdict：`ship`，性能结论以本页测量范围为限。
