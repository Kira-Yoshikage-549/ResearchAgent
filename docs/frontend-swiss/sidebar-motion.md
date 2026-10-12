# Codex 风格侧栏开合

2026-10-12，桌面验收尺寸 1366 × 768。

## 动效和布局

左右侧栏及报告任务覆盖层统一使用 300ms、bounce 0.1 的轻弹簧节奏。复用 GSAP，以 5ms 间隔预采样 61 个曲线点，不增加运行时依赖。开合从当前数值继续，快速反向不会跳回起点。

外层轨道为左栏、24px 间隙、正文、24px 间隙、右栏。外侧仍为 48px。侧栏内容固定原宽度、分别贴左／右边缘，通过视口裁切和透明度开合；文字不缩放。正文终态继续使用 7／9／10／12 列子栅格。

| 展开状态           |  正文起点 |   正文宽度 | 正文列数 |
| ------------------ | --------: | ---------: | -------: |
| 左右均展开         | 263.667px |  730.833px |        7 |
| 仅右栏展开         |      48px |    946.5px |        9 |
| 仅左栏展开         | 263.667px | 1054.333px |       10 |
| 左右均收起／禅模式 |      48px |     1270px |       12 |

报告阅读时左栏一直占据原位置。任务导航覆盖目录，开合覆盖层不改变正文宽度。目录在其他报告标签及覆盖期间保留挂载；覆盖层完全退场后才恢复目录显隐、交互与焦点。使用原生 `hidden` 控制目录显隐，并在提交后的下一帧恢复焦点，避免立即退场时向仍不可见的按钮聚焦。

所有侧栏保持挂载。关闭动作立即设置 `inert`／`aria-hidden`，退场结束才设置 `hidden`；保留滚动位置、上下文标签、论文选择及追问草稿。开合按钮通过 `aria-expanded`／`aria-controls` 关联稳定的面板 ID。

首次加载、持久化恢复、页面切换、禅模式、后台隐藏及减少动态效果直接收尾到目标状态。后台退场取消恢复焦点的意图，返回前台后不重放。卸载及反向会清理 GSAP tween、媒体查询和可见性监听；焦点恢复帧与 ResizeObserver 同样会清理。原有状态来源、左栏持久化规则、任务流 Provider、路由和公共接口保持一致。

## 参考与曲线来源

只读检查本机 Codex 26.1007.2314.0 的已安装前端资源，左侧任务栏开关使用 spring、duration 0.3、bounce 0.1。原生参考窗口没有被自动化操作或录制；验收录屏来自本项目浏览器。

[Motion 官方 spring 文档](https://motion.dev/docs/spring)说明了时间采样接口。项目常量按 duration-based spring 的解析式生成，阻尼比 `z = 0.9`，时间单位为秒：

```text
d = 0.3
s = sqrt(1 - z*z)
w = -log(0.001 * s / z) / (d * z)
p(t) = 1 - exp(-z*w*t) * (z/s * sin(w*s*t) + cos(w*s*t))
```

每 5ms 取一点，末点设为精确的 1，运行时只作线性插值。保留约 0.15% 的轻微回弹，透明度限制在 0 到 1。来源为 Motion 的 MIT 弹簧算法；没有引入 Motion 包。

## 验证

- 51 个文件、304 项单元测试通过；侧栏相关 24 项覆盖当前进度反向、立即禁止交互、退场隐藏、目录跨标签保留、立即退场焦点、后台与减少动态效果收尾、导航切换、启动失败及资源清理。
- 中英文浏览器检查左右独立及同时开合、中途反向、报告覆盖层、论文选择、禅模式、刷新恢复。原生 rAF 中采到至少 3 个不同中间宽度；退场期间内容宽度误差小于 1px，完成后面板隐藏。7／9／10／12 列终态误差不超过 1px。
- 正文滚动 360px、目录滚动 90px、追问草稿及论文选择在开合后保留。模拟任务流开合期间始终只有一条连接，没有因侧栏开关重连。
- API／SSE 使用隔离演示栈及测试数据；上述验证不代表运行过真实付费研究。

| 命令                                                                                                                                                                            | 结果                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm --prefix web run test -- --run --maxWorkers=2`                                                                                                                             | 304 项通过；默认并发曾使两项既有 Canvas／物理测试超过 5s，降低并发后通过，未修改时限                            |
| `npm --prefix web run test:e2e -- sidebar-motion.spec.ts report-navigation.spec.ts research-focus.spec.ts research-transition.spec.ts workspace-design.spec.ts --reporter=line` | 覆盖 20 项场景，19 项通过；修正旧的即时尺寸断言后，`workspace-design.spec.ts` 3 项复核全部通过，20 项均完成验收 |
| `npm --prefix web run typecheck -- --incremental false`                                                                                                                         | 通过；保留已有受写入限制的增量缓存                                                                              |
| `npm --prefix web run lint`                                                                                                                                                     | 通过                                                                                                            |
| `npm --prefix web run format:check`                                                                                                                                             | 通过                                                                                                            |
| `npm --prefix web run i18n:check`                                                                                                                                               | 通过                                                                                                            |
| `npm --prefix web run build`                                                                                                                                                    | 通过；既有菜单样式的 4 条 `::highlight` 解析警告仍存在                                                          |
| impeccable detector                                                                                                                                                             | 本次 8 个实现目标手动执行一次，返回 `[]`                                                                        |

## 截图和原速录屏

全部截图为本项目 Chrome 实际渲染，使用现有自托管字体、配色和控件，测试内容仅用于演示。没有生成或引入新的产品图片。录屏在 1366 × 768 下连续保存自动点击和键盘操作，无剪辑、变速或动画时间轴寻址。

| 状态               | 中文                                                 | 英文                                              |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------- |
| 左右展开           | [截图](screenshots/sidebar-motion-live-zh-CN.png)    | [截图](screenshots/sidebar-motion-live-en.png)    |
| 左右收起           | [截图](screenshots/sidebar-motion-closed-zh-CN.png)  | [截图](screenshots/sidebar-motion-closed-en.png)  |
| 报告任务覆盖层     | [截图](screenshots/sidebar-motion-overlay-zh-CN.png) | [截图](screenshots/sidebar-motion-overlay-en.png) |
| 论文选中／右栏恢复 | [截图](screenshots/sidebar-motion-paper-zh-CN.png)   | [截图](screenshots/sidebar-motion-paper-en.png)   |

- [中文原速录屏](videos/sidebar-motion-zh-CN.webm)
- [英文原速录屏](videos/sidebar-motion-en.webm)

最终检查结论：可交付（ship）。两轮有界视觉检查完成，原有布局、字体、配色和控件保持一致；正文及目录滚动、草稿、论文选择、焦点和任务连接的回归通过。验收仅限桌面；保留既有未提交的研究流转场实现，不改后端、数据库、API 或依赖。
