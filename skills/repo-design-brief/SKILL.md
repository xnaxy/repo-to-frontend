---
name: repo-design-brief
description: "Use when the user wants an evidence-based narrative, page design brief, or interaction specification from existing project facts."
---

# 文稿与设计简报

版本：3.4。可单独调用，也可由 $repo-to-frontend 编排。

先读 [共享约束](../repo-to-frontend/references/stage-common.md) 和 [交接与图片审核](../repo-to-frontend/references/stage-handoff.md)。仅依赖同级repo-to-frontend共享资源，不需要读取或执行总入口的其他阶段。安装时须配套该共享目录；缺失时明确报告，不能绕过审核或另造规则。

## 输入与停止边界

- 输入：已核实的仓库地图/能力合同，或用户提供的独立内容与明确演示范围。
- 输出：02-narrative.md、03-design-brief.md；有交互时interaction-contract.json，并补齐B/E/C/U/I映射。
- 只执行本阶段；有现成上游输入就复用。缺失影响承诺的材料时说明缺口，不自行补造材料后继续，也不自动追加未选阶段。

## 阶段流程

新设计先按 [视觉结构选型](../repo-to-frontend/references/visual-direction.md) 选择与任务匹配的结构，并记录选择依据与目录摘要；已有固定参考则保留原设计。结构建议不得缩减事实、控件或必要状态。

后端产品任务按 [图片功能闭环](../repo-to-frontend/references/image-contract-loop.md) 将全部范围内可见能力和必要结果/权限状态落实到图集要求；导出image-capability-contract.json供后续双向审查，不以“以后HTML补充”省略核心功能。仅简报任务仍不追加生图。

先读 [项目事实与能力映射](../repo-to-frontend/references/project-grounding.md)，只应用简报/合同准入部分；不要求在本次执行生图或实现。

读取 [references/narrative-and-design.md](../repo-to-frontend/references/narrative-and-design.md)。以问题和设计动机串联代码：**为什么存在 → 对外承诺 → 如何分层 → 一次运行如何推进 → 数据怎样变化 → 为什么这样设计 → 边界与未知**。层次可按仓库调整，不能强行虚构每一类内容。

产出 `02-narrative.md`，开头必须有一段可独立复用的连贯文字，后附递进章节与证据。诸如 `module:a -> module:b` 只能作为索引，不能替代自然语言解读。保存稳定的内容编号（如 C01），供设计和前端引用。

产出 `03-design-brief.md`：叙述章节对应的页面区块、准确文案、关系方向、主要交互、视觉层次。默认设计的是该仓库的解释页面，不是 RepoWeaver 等工具的仪表盘。

用户要求产品对接时，以真实能力和用户旅程组织前端，不默认降为解释页面。按project-grounding.md核对覆盖与契约准入；关键未知阻断受影响页面的生图，允许其余已证实范围继续，不能宣称全项目完整。

有交互时读取 [references/interaction-contract.md](../repo-to-frontend/references/interaction-contract.md)，在生图前建立按钮/控件与结果态契约。用户要求忽略已有前端时，不读取其HTML/CSS/JS、截图和UI设计稿，不沿用它的布局或技术栈；仅从其余源码与材料提炼内容。

若用户后来要求检查现有前端，允许只读审查它以诊断差距，并记录此范围变化；独立重构仍以非前端机制与新设计为依据，不把原界面数据当作已验证源码事实。


分析型产品在生图前应用 [分析任务与视觉品质](../repo-to-frontend/references/design-quality.md)：展开实际数据到图形的映射，并分别检查语义正确性、信息密度与研究任务可完成度。数据丰富的主态与缺失子态分别设计，不把空态验证当作分析主界面验证。

## 阶段交接

完成本阶段必要自验后检查继承的independentReview设置；开启时按[独立子代理审查](../repo-to-frontend/references/independent-review.md)冻结产物并派发全新上下文，只返回问题/结论/证据。未决阻断问题或过期审查不能交接受影响产物；关闭只省去子代理，不省去本阶段自验。未选阶段不自动补跑，已有图片审核仍单独遵守。

新设计按共享设计包冻结选型快照，补齐准确业务文字、每图布局和公共视觉变量；自动组装全部要求，不重复手抄或缩减合同。见 [完整设计包交接](../repo-to-frontend/references/visual-package.md)。
