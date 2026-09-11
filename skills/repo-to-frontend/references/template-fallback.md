# 成熟模板作为降级路径

当用户允许设计提升，且自定义视觉质量不足、预算/工具受限，或明确希望成熟模板时使用。严格图片复刻不能被模板静默替代；生图阻塞也不会因模板可运行而变成已生成。记录 `mode: TEMPLATE_FALLBACK`、触发原因和保留/变化的合同。

## 最小可执行方案

本 Skill 已附 [离线 Tabler starter](../assets/template-fallback/index.html)：官方 Tabler 1.5.0 核心 CSS 原样保存，MIT 声明与版本/哈希在同目录 `provenance.json` 和 `vendor/LICENSE.tabler`。本地制作了侧栏报告、顶部导航两种外壳；**是两种布局共用示例内容，不是两套完整业务系统**。不含图表平台、账号、远程字体或图库。该版本是本次验证快照，不声称永远最新。

执行：
1. 复制 `assets/template-fallback/` 的 index.html、starter.css、starter.js、provenance.json、vendor/ 到本次输出的独立frontend目录。不要复制 tests、verification、node_modules 或验证脚本。保留来源与许可。无需安装依赖，原始starter双击即可打开。
2. 按阅读任务选择侧栏报告或顶部导航，删除无关示例；将已核实文稿ID映射到章节、主图、表格、输入/结果/证据。替换示例内容时仍使用已有模型，不抄模板假数。主要图空位必须填合法图或真实DOM/SVG，未填时标为未完成，不能拿空slot交付完整解释页。
3. 复用项目现有状态与计算函数，实现全部交互/路由，保留缺失/零/口径冲突规则。高密度分析不能降级成几个KPI卡片。精确内容用DOM，原图只能做参考/合法装饰。
4. 加入自己的测试与实际桌面/窄屏截图；检查许可证、无效链接、加载失败与外部依赖。普通跨文件ES模块/fetch需本地HTTP服务；若要双击运行，应另行打包内联模块/数据，并在真实file地址与断网上下文验证所有入口和资源，不能仅改名或沿用旧宣称。starter的旧测试不代表适配后的产物通过。

## 栈与内容选择

| 既有环境 / 缺口 | 可核实的项目 | 使用边界 |
|---|---|---|
| 原生HTML、报告/数据工具 | [Tabler](https://github.com/tabler/tabler) | 多页/多布局；用本Skill附带的最小starter或固定版所需页面。第三方插件许可不由核心MIT覆盖。 |
| 已有Tailwind | [Flowbite Admin](https://github.com/themesberg/flowbite-admin-dashboard) | 免费仓库多页及sidebar/stacked；不自动拥有Pro模板。不要为取一个页面引入整个Hugo/Webpack链。 |
| 已有React/Next，多套数据模板 | [Tremor官方模板集合](https://blocks.tremor.so/templates) | 当前集合六个独立仓库，Overview有四类dashboard路由；[现行许可](https://blocks.tremor.so/license)与具体文件复核。只选择一套适配，不自动迁栈。 |
| 已有React，缺局部组件 | [shadcn官方blocks](https://ui.shadcn.com/blocks) | 区块不是全部整站；第三方同名商品另核许可。 |
| Astro叙述型门户 | [AstroWind](https://github.com/arthelokyo/astrowind) | 多homes/landing；原onwidget地址发生重定向。采用前重新核实维护者、提交、依赖。 |

核实于2026-09-08；不把星数、框架版本和免费条款永久写死。用源码路由核验「多套」，用所复制文件的许可核验授权。TailAdmin免费React仓库当时只有一个dashboard，Pro的七套不能算进免费能力。Tremor旧README曾称commercial，现行LICENSE与官网已不同，遇冲突以具体版本与一手许可核实，不能只引用搜索摘要。

## 降级不降低的门槛

内容/单位/归属正确、关系明确、所有约定页面可达、交互真实、原图不冒充DOM、缺失状态诚实。可以牺牲像素一致与原创外壳，但必须记录差异，保留待用户审阅状态。模板许可证不自动授权其照片、品牌标志、第三方图表库。
