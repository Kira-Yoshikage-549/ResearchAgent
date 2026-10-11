# 四页遮罩转场 — 2026-10-11

## 范围与视觉约定

按用户批准的计划实施：菜单（首页滚动菜单和 `/workspace`）、新建研究、历史记录、设置之间的站内链接使用同一个全屏遮罩，包括返回菜单、History ↔ Settings 和历史页进入新建研究。当前页链接不播放。保留首页滚动、行展开和 Canvas 动效；语言切换、浏览器前进后退、刷新和研究任务/报告导航继续直接执行。

参考 [Generous Branding](https://generousbranding.com/work/?view=sector) 的曲线和逐词裁切节奏，横向方向、阶段顺序和字号以用户计划为准。遮罩完全不透明，使用现有 `--color-page`（#FAF9F4）；中央名称用现有 Inter / Research Agent Han 字体，黑色 700、144px、居中，长名称按词换行。中央名称为 New Research / History / Settings，中文为菜单对应名称；返回菜单为 Choose your next step / 选择下一步。

| 阶段       | 动作                                           | 时长与曲线             |
| ---------- | ---------------------------------------------- | ---------------------- |
| covering   | 空白遮罩右侧进入，100% → 0                     | 1000ms，CustomEase     |
| center-in  | 完全覆盖后才提交路由；中央名称从下方逐词上升   | 600ms / 词，power3.out |
| holding    | 中央名称保持完整可见，等待目标实际标题就绪     | 至少 150ms             |
| center-out | 中央名称逐词向下退出裁切区                     | 600ms / 词，power3.in  |
| title-in   | 目标页面实际 h1 / 菜单 h2 在原位置逐词上升     | 600ms / 词，power3.out |
| uncovering | 实际标题保持原位，遮罩在其下方继续左移至 −100% | 1000ms，CustomEase     |

逐词间隔 80ms，总错开最多 240ms。基础总时长 3950ms，随词数增加至约 4670ms，另外等待路由/数据就绪。CustomEase 原始路径：

```text
M0,0 C0.19,0 0.322,0.062 0.381,0.165 0.544,0.448 0.523,0.713 0.569,0.813 0.617,0.919 0.734,1 1,1
```

## 实现与恢复

扩展已有 EntryTransitionProvider 和 EntryTransitionLink，复用已安装的 GSAP，无新依赖。EntryTransitionTitle 直接注册实际标题；活动任务视图使用任务标题。保持标题的语义、可访问名称、字号和布局，播放后恢复普通文字。英文保留原始空白并按词切分；中文使用 Intl.Segmenter，缺失时整段显示。

播放期间页面内容 inert，遮罩接收指针，拦截 wheel、touchmove 和普通键盘操作；重复导航不会创建第二个动画。保留原有滚动条几何，允许入口逻辑完成程序化定位。返回菜单使用路由 scroll:false，避免 Next.js 默认滚动覆盖现有菜单定位。播放结束后聚焦目标标题，preventScroll:true。

路由提交失败、目标标题 5 秒仍未就绪、配置门禁阻塞、popstate、语言变化、卸载或切换到减少动态效果时，清理 GSAP、计时器和遮罩并恢复交互。初始减少动态效果直接导航。数据较慢时中央名称保持可见；超时释放后迟到的数据仍可正常使用。

## 桌面证据

截图和录屏由实际 Chromium 页面在 1366 × 768 下生成，未编辑。覆盖/揭幕截图记录动画中的采样帧；标题截图在揭幕开始时拍摄。标题 bounds 与直接进入页面时的基准逐项相等，完成后再次验证相等并确认焦点。

| 阶段         | English                                      | 中文                                              |
| ------------ | -------------------------------------------- | ------------------------------------------------- |
| 遮罩移入     | [EN](screenshots/transition-cover-en.png)    | [中文](screenshots/transition-cover-zh-CN.png)    |
| 中央名称     | [EN](screenshots/transition-center-en.png)   | [中文](screenshots/transition-center-zh-CN.png)   |
| 实际标题就位 | [EN](screenshots/transition-title-en.png)    | [中文](screenshots/transition-title-zh-CN.png)    |
| 左移揭幕     | [EN](screenshots/transition-uncover-en.png)  | [中文](screenshots/transition-uncover-zh-CN.png)  |
| 完成         | [EN](screenshots/transition-complete-en.png) | [中文](screenshots/transition-complete-zh-CN.png) |

完整交互录屏：[English](videos/entry-transition-en.webm)、[中文](videos/entry-transition-zh-CN.webm)，包含首页键盘进入菜单、新建研究完整转场和返回菜单。

视觉复核：全屏纸色覆盖、中央名称居中、逐词裁切无字形截断、实际标题在揭幕时保持原位、完成后布局无跳动。已修复返回菜单的默认滚动冲突。保持项目桌面验收范围，未增加移动端截图要求。

## 验证记录

- `npm --prefix web run test -- --run`：44 文件、234 项通过。包括阶段顺序、覆盖前禁止导航、标题等待、重复点击、路由异常、超时、配置阻塞、历史打断、语言变化、卸载、滚动/键盘解锁、减少动态效果和研究任务直接导航。
- `$env:PW_REUSE_SERVER='1'; npm --prefix web run test:e2e -- entry-transition.spec.ts --reporter=line`：8 个场景。最终实现中的 7 项通过，活动任务用例补齐模拟响应必填字段后用 `--grep 'real active'` 定向重跑通过。中英文完整六阶段、首页滚动菜单进入、四页全部链接、返回定位、当前页忽略、历史/语言直接导航、活动任务实际标题、迟到响应恢复均已验证。
- `$env:PW_REUSE_SERVER='1'; npm --prefix web run test:e2e -- entry-scroll.spec.ts research-input.spec.ts deepseek-settings.spec.ts --reporter=line`：9 项通过。验证原首页滚动与键盘恢复、语言位置、减少动态效果、研究表单与配置门禁。
- `npm --prefix web run typecheck -- --incremental false`、`npm --prefix web run lint -- --max-warnings 0`、`npm --prefix web run format:check`、`npm --prefix web run i18n:check`、`npm --prefix web run build`：通过。
- 默认增量 typecheck 曾因已有 tsconfig.tsbuildinfo 写入 EPERM 失败；关闭增量后通过，未修改缓存权限。生产构建的 TypeScript 检查也通过。
- Impeccable 对此次修改的 UI 文件手动检测一次，结果 `[]`；最终源代码 diff 检查通过。设计复核结论：ship。

浏览器用例复用当前开发服务，转场接口均使用模拟响应；研究输入回归拦截任务创建，配置测试拦截密钥保存。当前未提交的欢迎页和滚动改动保留，本次无后端、API、数据库或依赖变化。

## 回程性能修复 — 2026-10-11

用户发现返回菜单时卡顿，批准延迟欢迎屏波纹/文字扰动初始化和合并缓存重建。现实现仅在欢迎屏可见且遮罩空闲时启动；已有波纹在遮罩期间暂停。相同文案、字体、布局和 DPR 复用缓存，真实变化正常重建。同机 6 次回程测量的波纹初始化、像素读取和 ≥50ms 长任务均为 0；238 项单元和 26 项浏览器回归通过。此轮阶段截图和完整录屏已刷新。[性能对比与验证记录](entry-transition-performance.md)。
