# 首页标题扰动与背景分离

2026-10-11，按用户确认的方案实现。首页保留 1366 × 768 桌面排版、Inter 144px 两行黑色品牌文字、20px 说明、奶油背景和红色下一步。新效果仅作用于欢迎页。

## 行为与渲染

- 标题网格使用背景同一 rAF、缓动指针、速度、方向和时间归一化弹簧矩阵。施力半径 175px，强度为背景的 0.08；每个顶点的二维位移长度上限 8px。指针远离时没有新外力，余力自然回落；标题不随 Perlin 噪声持续漂移。
- 用 DOM 实际字距、字重、文本范围和字体基线缓存两行字形。24px 网格只绘制有字形的区域；未变形时直接使用缓存。网格裁切适量重叠，避免三角形之间的抗锯齿细缝。
- 同一 Canvas 的绘制顺序是全场灰线、背景透明度遮罩、黑色字形。遮罩以两行实际字形范围外扩 12px，中心保留约 30% 灰线强度，36px 内平滑恢复。两个范围合并取最大遮罩强度，交叠处不会重复消去波纹。没有描边、阴影、可见背景色渐变或额外控制。
- 保留原生 h1、两个 span、可访问名称和原来的布局尺寸。仅缓存成功时隐藏原生文字的可见填充；文字选择恢复原生显示和复制。减少动态、触摸与 Canvas 不可用时保留原生标题；减少动态和触摸仍保留背景分离。
- 字体加载、窗口尺寸、DPR、恢复可见时重建缓存；DPR 上限 2。标题引用沿 WelcomeWaves → a-waves → mountWelcomeWaves 传递。卸载释放字形、遮罩、选择和字体监听；隐藏及离屏共用原有暂停机制。没有新增依赖、后台 API 或路由。

## 验证与截图

41 项相关单元/组件测试通过；20 项生产版 Chrome 桌面浏览器测试通过。新增覆盖字形真实黑色像素变化、远处静止、回落后像素恢复、原生选择/复制、背景中心透明度、减少动态切换、触摸、Canvas 不可用、字体事件、DPR 上限、语言切换、菜单往返和稳定标题布局；资源测试确认移除选择/字体监听、卸载后忽略延迟字体 Promise，以及重连后保留标题引用。业务接口使用 mock，没有发起真实研究。

类型检查（关闭不可写的旧增量缓存）、ESLint、翻译一致性、改动文件格式及生产构建通过。本目录六张图片是 Playwright 直接生成的 1366 × 768 截图，没有图像编辑。

| 状态     | 中文                                              | 英文                                           |
| -------- | ------------------------------------------------- | ---------------------------------------------- |
| 静态     | [中文静态](screenshots/title-static-zh-CN.png)    | [英文静态](screenshots/title-static-en.png)    |
| 局部扰动 | [中文扰动](screenshots/title-disturbed-zh-CN.png) | [英文扰动](screenshots/title-disturbed-en.png) |
| 回落     | [中文回落](screenshots/title-returned-zh-CN.png)  | [英文回落](screenshots/title-returned-en.png)  |

验证服务使用临时 3100 端口，与现有 3000 服务分开；3000 上当前页面也经只读检查确认返回 200、标题 Canvas 呈现正常、波纹运行且没有页面错误。

## 性能证据

本机 Chrome headless、1366 × 768、DPR 1、生产构建、噪声种子 0.5、同一连续鼠标轨迹。每版三次约 10 秒。新增绘制段由主 Canvas 外层 save/restore 包围，测量包含遮罩、网格变换、裁切及绘字；弹簧更新和首次字形缓存不在该段内，另以整个页面的 ScriptDuration/TaskDuration 记录总成本。

| 指标                                |            修改前 |          最终实现 |
| ----------------------------------- | ----------------: | ----------------: |
| rAF 回调频率（三次平均）            |          165.05/s |          164.98/s |
| 帧间隔 P95（三次）                  | 6.1 / 6.1 / 6.2ms | 6.2 / 6.2 / 6.1ms |
| 新增标题绘制 P95（三次）            |                无 | 0.6 / 0.6 / 0.6ms |
| 新增标题绘制最大值（三次）          |                无 | 0.9 / 0.9 / 0.9ms |
| 每 10 秒 ScriptDuration（三次平均） |            2.050s |            3.002s |
| 每 10 秒 TaskDuration（三次平均）   |            2.561s |            4.244s |
| 超过 25ms 的帧间隔（三次总计）      |                 0 |                 0 |

新增绘制 P95 低于 2ms 优化目标。总脚本和任务时间增加，帧间隔基本一致；不能据此宣称总 CPU 降低、实际显示 165fps 或输入延迟得到改善。这是固定合成轨迹的 headless 回调测量，不等同于用户显示器的真实呈现帧数。

原始前后数据在本地 `web/artifacts/home-title/performance-before.json` 与 `performance-after.json`；可按需运行 `welcome-title-performance.spec.ts` 复现当前实现，默认跳过，避免普通 CI 自动进行 30 秒性能采样。

```powershell
# 仓库根目录；验证服务启动在独立终端，验证完成后关闭。
npm --prefix web run build
npm --prefix web run start -- --hostname 127.0.0.1 --port 3100

# 另一个终端
$env:PW_REUSE_SERVER = "1"
$env:E2E_WEB_PORT = "3100"
npm --prefix web run test:e2e -- welcome-title.spec.ts welcome-waves.spec.ts welcome.spec.ts entry-transition.spec.ts welcome-physics.spec.ts --reporter=line
$env:WAVE_TITLE_BENCHMARK = "recheck"
npm --prefix web run test:e2e -- welcome-title-performance.spec.ts --reporter=line
Remove-Item Env:WAVE_TITLE_BENCHMARK
Remove-Item Env:PW_REUSE_SERVER
Remove-Item Env:E2E_WEB_PORT
npm --prefix web run test -- --run features/welcome/wave-title.test.ts features/welcome/wave-field.test.ts features/welcome/wave-element.test.ts components/welcome/welcome-waves.test.tsx components/welcome/welcome-page.test.tsx components/entry/entry-transition-provider.test.tsx
npm --prefix web run typecheck -- --incremental false
npm --prefix web run lint
npm --prefix web run i18n:check
```

## 完成复核

两次集中桌面视觉检查，一批网格拼接修正后确认；同一会话内自行复核。两种语言的静态、扰动和回落保持原排版，标题附近灰线明显减弱，黑色字形清晰；前景操作、选择、可访问语义和降级保持可用。移动端视觉匹配不属于本次范围。复核 verdict：`ship`，性能结论仅限上面的测量范围。
