# 返回菜单的转场性能修复 — 2026-10-11

用户报告从其他页面返回首页菜单时中央标题动画卡顿，并批准延迟欢迎屏初始化、合并缓存重建的修复方案。本次只调整波纹和文字扰动的启动、暂停及缓存调度；保留既有视觉、转场方向与时序、菜单定位和当前未提交改动。

## 原因与修改

欢迎屏和菜单属于同一入口页。之前返回菜单时也立即挂载波纹场，同步生成标题与正文的 Canvas 位图、像素掩膜及扰动网格，然后才收到离屏通知并暂停。字体就绪、首次尺寸通知以及恢复运行还会重复构建缓存。这些主线程工作与中央标题入场重叠，原开发服务采样出现 258–295ms 长任务。

- WelcomeWaves 在入口滚动恢复和 React StrictMode 的探测清理之后检查可见性。欢迎屏离屏、完全变暗、文档隐藏或遮罩忙碌时不初始化波纹。直接返回菜单不创建波纹场；滚回欢迎屏后才启动一次。
- 已启动的场在转场期间暂停，结束后按可见性恢复；保留原场与缓存，不重播线条入场，也不积累后台时间。新增的帧请求只用于合并可见性/尺寸事件，没有第二个持续动画时钟。
- 字体和 ResizeObserver 引起的尺寸更新合并到一次帧请求。字体已经加载时不再追加 ready 回调重建。
- 文字缓存以文案、字体、字距、颜色、相对位置、尺寸和 DPR 为依据。相同布局直接复用，真实字体事件或几何变化仍重建。保持原来的原生文字、选择/复制、触控和减少动态效果回退。

## 同机对比

测试使用当前开发服务、无界面 Chrome、DPR=1，先访问菜单并等待字体，再从历史页点击返回。测量的是主线程任务和 requestAnimationFrame 间隔，不代表显示器实际帧率；生产模式性能未单独采样，生产构建已通过。

| 场景                       | 修改前：最长主线程任务 | 修改后：≥50ms 长任务 | 修改后：最长帧回调间隔 |
| -------------------------- | ---------------------- | -------------------- | ---------------------- |
| English，1366 × 768，两次  | 295ms / 258ms          | 0 / 0                | 12.1ms / 6.2ms         |
| 中文，1366 × 768，两次     | 未单独采样             | 0 / 0                | 12.2ms / 6.2ms         |
| English，2555 × 1225，两次 | 271ms / 278ms          | 0 / 0                | 12.1ms / 12.2ms        |

6 次回程的波纹启动和 getImageData 读取次数均为 0；全部完成六阶段转场，菜单最终 scrollY 分别为 768 / 1225。修改前 1366 × 768 的两次回程各有 56 次像素读取、两次波纹启动；最大帧间隔为 363.7ms / 302.9ms。

修改后的结构化样本保存在 [entry-transition-performance.json](entry-transition-performance.json)。前次定位记录和完整逐帧样本保存在本机 Codex 可视化目录；本页的数据是本次验证结果。

## 回归与交付

- `npm --prefix web run test -- --run`：45 文件、238 项通过。保留原分隔线几何和观察器清理测试，新增离屏延迟、StrictMode 单次启动、转场暂停/恢复、隐藏文档及待执行帧取消验证。
- `$env:PW_REUSE_SERVER='1'; npm --prefix web run test:e2e -- welcome-deferred.spec.ts entry-scroll.spec.ts welcome-waves.spec.ts welcome-title.spec.ts welcome-description.spec.ts entry-transition.spec.ts --reporter=line`：Chromium 1366 × 768，26 项通过。覆盖中英文回程零初始化、滚回欢迎屏单次启动、重复尺寸事件复用缓存、真实布局变化重建、标题与正文扰动及恢复、原生字形一致性、字体事件、语言、DPR、触控、减少动态效果、首页滚动与完整四页转场。
- `npm --prefix web run typecheck -- --incremental false`、`npm --prefix web run lint -- --max-warnings 0`、`npm --prefix web run format:check`、`npm --prefix web run i18n:check`、`npm --prefix web run build`：通过，ESLint 零警告。
- Impeccable 对本次 UI 实现手动检测一次，结果 `[]`。最终 diff 检查通过；无后端、API、数据库、依赖或移动端验收变更。

原 [转场记录](entry-transition.md) 的中英文阶段截图和 [English](videos/entry-transition-en.webm) / [中文](videos/entry-transition-zh-CN.webm) 完整录屏已随回归刷新。实际标题的基准位置和最终位置保持相等，转场时序及字形没有变化。源代码、像素与交互回归复核结论：ship。
