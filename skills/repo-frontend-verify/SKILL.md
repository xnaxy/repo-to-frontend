---
name: repo-frontend-verify
description: "Use when the user wants independent verification of an existing frontend against reference images, project contracts, and expected interactions."
---

# 前端验收

版本：3.4。可单独调用，也可由 $repo-to-frontend 编排。

先读 [共享约束](../repo-to-frontend/references/stage-common.md) 和 [交接与图片审核](../repo-to-frontend/references/stage-handoff.md)。仅依赖同级repo-to-frontend共享资源，不需要读取或执行总入口的其他阶段。安装时须配套该共享目录；缺失时明确报告，不能绕过审核或另造规则。

## 输入与停止边界

- 输入：已有前端、参考图、相关合同及运行方式。
- 输出：06-verification.md、检查证据及run-state.json；独立验收默认只读报告，不自动返修。
- 只执行本阶段；有现成上游输入就复用。缺失影响承诺的材料时说明缺口，不自行补造材料后继续，也不自动追加未选阶段。

## 阶段流程

后端产品任务执行 [图片功能闭环](../repo-to-frontend/references/image-contract-loop.md) 的最终覆盖验收：重核实际图集/合同准入，逐条核后端要求→图像→真实前端与测试证据，check-delivery.mjs使用backend-product范围。视觉相似不能弥补漏能力，功能存在也不能弥补复刻差异。

先读 [按图实现的缺省合同与收口](../repo-to-frontend/references/reference-fidelity.md)，从用户原话核验模式；“开始实现/产品前端”不能授权设计提升。逐参考核主区域顺序、同屏内容、图表类型/编码，结构失真不能降为不阻断的外观建议。最终运行check-delivery.mjs汇总当前完整图集；FAIL/BLOCKED不因单测、构建或独立代理passed改成完成。

独立调用没有先前阶段上下文时，先读 [复刻验收规则](../repo-to-frontend/references/image-to-frontend.md) 的验收部分；严格模式再读 [参考合同](../repo-to-frontend/references/locked-image-reconstruction.md) 和 [检查工具](../repo-to-frontend/references/strict-replica-tools.md)。仓库任务读取 [能力合同](../repo-to-frontend/references/project-grounding.md)，有交互读取 [交互验收](../repo-to-frontend/references/interaction-contract.md)。只执行检查部分，不因此新建或修改前端。

从反方检查：README 宣称是否真的实现？文件存在是否真的参与链路？叙述是否把相关性写成调用因果？图片是否改变了信息递进？页面是否只是视觉相似而含义错误？修正验收报告中有证据的判断错误，不建立无限审计循环；实现差异只报告，除非已有返修授权。

按project-grounding.md双向核查入口清单与能力台账、UI与后端契约。源码/配置变更后使受影响的提示词、参考和实现失效并重新核对。覆盖、契约、生图、视觉、模拟测试与真实联调分别报告；mock通过不证明真实后端可用。

执行相关测试、构建，并在真实浏览器检查桌面/窄屏、主要交互、控制台与图片对照。项目使用 Vitest 时运行最相关测试文件。没有实际执行的检查记为 `NOT_RUN`，不因源码看起来正确就判通过。

按用户实际打开方式验收。服务在线的HTTP检查不证明日后双击可用；需要离线时检查已有本地交付，真实浏览器以file地址和断网上下文检查图集→全部页面/结果态→返回、字体/图像加载、编辑与重算。保留相对资源目录并说明不可只移动HTML；主源变更后旧离线产物标过期；只有已授权构建/返修时才重建并复测，否则报告缺口。不能仅把普通ES模块入口改名为“离线”。

整套任务用逐图/结果态台账分别记录：路由、对应内容、语义检查、字体/数值检查、桌面/窄屏截图、交互结果、剩余差异。已可达、已实现、已测试、用户已接受是四种不同状态。先做代表页确定风格可以，但交付整套前必须逐项完成剩余页面；不得用两页或一次公共CSS修改推断全套质量。

严格复刻分别验收参考完整性、状态、内容/素材、父子几何、关系拓扑/锚点、实际像素、交互。内置采集器输出CAPTURED_NOT_ACCEPTED；检查器PASS_CONTRACT只表示给定合同通过，不证明参考清单无遗漏或任意项目1:1。UNKNOWN/PARTIAL、非等价状态、未决例外、缺证据阻断完整通过。必须独立逐区看图，不能用节点数、同源自生成预期、功能测试或全图平均分替代。

写 `06-verification.md` 并合并更新 `run-state.json` 的本阶段字段，保留其他阶段及未知字段：仓库提交/脏工作区、阶段状态、产物路径、图片路径/哈希、请求模型与确认模型（未知为 null）、真实检查结果、剩余问题。每次实质修改记入本次输出的 `CHANGELOG.md`；返修附原因与预防。

最终交付本次验收报告、证据与未通过项；按需引用已有产物，不补做其他阶段。没有返修授权时只报告差异。用户批准图片只表示选用参考，不表示接受最终前端。


## 阶段交接

完成本阶段必要自验后检查继承的independentReview设置；开启时按[独立子代理审查](../repo-to-frontend/references/independent-review.md)冻结产物并派发全新上下文，只返回问题/结论/证据。未决阻断问题或过期审查不能交接受影响产物；关闭只省去子代理，不省去本阶段自验。未选阶段不自动补跑，已有图片审核仍单独遵守。

视觉配方仅用于上游新设计；本阶段遵循最终参考及合同，不因配方或目录升级重新选风格。边界见 [视觉结构选型](../repo-to-frontend/references/visual-direction.md)。

消费共享设计包时追溯实际请求/最终图/DOM及数据状态；横向核公共字体、配色、间距和组件，检查模板污染与旧包沿用。见 [完整设计包交接](../repo-to-frontend/references/visual-package.md)。
