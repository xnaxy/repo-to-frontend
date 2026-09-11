# 变更记录

## 2026-09-08

- 根据既有原生 JS 页面与有界任务约定，选择“官方核心 CSS + 独立 HTML 外壳”，提供侧栏报告及顶部导航；设计与适配范围记于 README。
- 先新增 `tests/starter.test.mjs`：本地官方 CSS 与来源哈希、file URL 所需经典脚本、本地资源存在性、示例内容与空图 slot、布局切换、真实证据视图及本地锚点。首次和校正断言后的实现前运行均为 6 项预期失败。
- 从固定 npm 发布版取得未经修改的 Tabler 1.5.0 CSS（691,465 bytes）；npm 包没有 LICENSE 文件，改从对应正式标签的提交读取官方 MIT LICENSE（1,090 bytes）。版本、URL、SHA-256 记入 provenance.json。
- 新增 index.html、starter.css、starter.js：使用真实 Tabler card/table/button 样式；报告正文和证据视图使用同一份本地示例；切换布局不重建内容；证据按钮打开对应 details 并移动焦点。未引入 React、Tabler JS、图表库或网络数据请求。
- 主要图 slot 明确显示尚未提供，保留接入既有图的空间；页面不生成图示，也不将模板降级记成生图/复刻完成。
- 6 项定向 Vitest 在实现后通过；新增真实浏览器验收脚本，以断网 file 地址验证桌面与手机四种状态、证据往返和布局切换，记录 0 外部请求、0 控制台/页面错误及截图。
- 修正验收探针：file origin 不允许读取 stylesheet.cssRules，改为路径与计算样式验证；截图冻结 CSS 动画以避免捕获按钮状态切换过程。没有修改页面资源或浏览器安全设置来绕过限制。
- 补全 README 使用/适配步骤、测试运行方式、资源体积说明、VERIFICATION.md 与生成的验证证据。
