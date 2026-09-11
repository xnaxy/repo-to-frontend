# Tabler 离线降级 starter

设计约定（2026-09-08）：使用同一份本地示例内容，提供侧栏报告和顶部导航两种布局；报告与证据视图可切换。主要图保持明确的空 slot，等待项目已有且来源明确的图，不生成示意图。所有运行资源均为相对路径、经典脚本，支持双击 `index.html`。复用官方 Tabler 1.5.0 核心 CSS；自有样式仅处理解释页面结构。无需 React、构建器、服务器或账号。

此设计对应已指定的有界实现：比较完整模板项目迁移、复制 HTML 外壳和另造组件系统后，采用复制外壳，因为它能复用现有原生内容与交互，且新增运行依赖最少。它不替代生图，也不表示严格复刻已完成。

## 使用

1. 复制整个目录到目标项目自己的输出目录；保留 `vendor/`、`provenance.json` 和 `vendor/LICENSE.tabler`。
2. 双击 `index.html` 即可离线打开。右上角切换侧栏报告/顶部导航；地址末尾加 `#layout=top` 可直接打开顶部导航。目录按钮切换报告/证据；表格的 C01、C02 按钮打开对应本地证据。
3. 在 HTML 中按已核实文稿替换标题、正文、表格和证据详情；保留稳定编号及控件约定。图像准备好后再替换 `[data-major-image-slot]` 的空态，使用本地图片与准确替代文本，并记录来源。
4. 通过 `starter.css` 调整解释页面结构；不要改动 `vendor/tabler-1.5.0.min.css`，如需升级请重新核实许可、版本、体积与哈希。

此目录是可被 Codex 复制并按内容契约适配的静态 starter，没有通用生成器。已有项目可以保留自己的数据/演算逻辑，只适配页面结构。实际项目需要自己补齐完整章节与交互；两种布局共用同一份内容，它们不是两套独立的完整应用。

## 资源

| 文件 | 用途 |
|---|---|
| `index.html` | 本地示例、主要图空位、表格与证据详情 |
| `starter.css` | 两种布局及窄屏处理 |
| `starter.js` | 布局切换、视图切换、打开证据和焦点管理 |
| `vendor/tabler-1.5.0.min.css` | 官方 Tabler 核心样式，**691,465 bytes（约 675.3 KiB）** |
| `vendor/LICENSE.tabler` | 对应发布版的官方 MIT 许可 |
| `provenance.json` | 发布版、来源 URL、提交和 SHA-256 |
| `tests/starter.test.mjs` | 六项定向 Vitest 测试 |
| `scripts/verify-browser.mjs` | file 地址、断网、桌面/手机浏览器检查 |
| `VERIFICATION.md`、`verification/` | 已执行的检查结果、截图与浏览器证据 |

官方 CSS 未裁剪，代价是约 675 KiB 的本地样式文件；它是本 starter 的主要体积来源。未引入 Tabler JavaScript、ApexCharts 等插件、远程字体、示例图片或 source map。CSS 内置的 data URI 图标是上游控件样式，不是为主要图生成的内容。

## 重跑检查

测试不影响双击使用；验证工具不属于页面运行依赖。可使用任一已有的 Vitest + jsdom 项目，不需要在此目录安装平台。从该测试项目的目录运行，将两个占位路径替换为实际绝对路径：

```powershell
$env:TEMPLATE_TEST_PACKAGE = '<已有测试项目>/package.json'
npx vitest run '<本starter目录>/tests/starter.test.mjs' --root '<本starter目录>' --reporter=dot --globals
```

浏览器检查需要已有 Playwright 与 Chromium；`TEMPLATE_BROWSER_MODULE` 可指向已经安装的 Playwright 模块目录，未设置时按普通 Node 模块规则查找：

```powershell
$env:TEMPLATE_BROWSER_MODULE = '<已有运行环境>/node_modules/playwright'
node '<本starter目录>/scripts/verify-browser.mjs'
```

运行后会更新本目录 `verification/` 中的截图与 `browser.json`。桌面使用 1280×900、手机使用 390×844、DPR=1；页面仍以 file URL、浏览器断网状态读取本地资源。窄屏表格在卡片内横向滚动，整页不横向溢出。

## 实施步骤与自检

- [x] 固定内容与两种外壳边界，先写六项行为/资源测试。
- [x] 确认实现前的六项测试全部因功能缺失而失败。
- [x] 获取固定官方核心 CSS 与发布提交对应的 MIT 许可，记录哈希。
- [x] 实现最小 HTML、布局覆盖样式与经典脚本，再跑相关 Vitest。
- [x] 使用真实浏览器以离线 file URL 核实四种布局/尺寸状态并查看截图。
- [x] 对抗性复核：无图仍显示缺失、数字标示合成、证据入口有实际结果、不同布局不重复/丢失内容。

当前工作区不是 Git 仓库，因此没有新增分支或提交；变更轨迹记于 CHANGELOG.md。
