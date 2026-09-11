---
name: repo-analyze
description: "Use when the user wants repository analysis, coverage auditing, or backend capability contracts without generating images or frontend code."
---

# 仓库解析

版本：3.2。可单独调用，也可由 $repo-to-frontend 编排。

先读 [共享约束](../repo-to-frontend/references/stage-common.md) 和 [交接与图片审核](../repo-to-frontend/references/stage-handoff.md)。仅依赖同级repo-to-frontend共享资源，不需要读取或执行总入口的其他阶段。安装时须配套该共享目录；缺失时明确报告，不能绕过审核或另造规则。

## 输入与停止边界

- 输入：仓库路径或固定远程版本；用户目标和范围。
- 输出：01-repository-map.md、02-backend-frontend-contract.md。UI尚未设计时B/E先完成，C/U/I映射由简报阶段补齐，不编造页面。
- 只执行本阶段；有现成上游输入就复用。缺失影响承诺的材料时说明缺口，不自行补造材料后继续，也不自动追加未选阶段。

## 阶段流程

后端产品全流程的能力分母须能支持 [图片功能闭环](../repo-to-frontend/references/image-contract-loop.md)：区分用户可见能力及必要状态、内部机制对应的可见结果，不从已有图片或页面反推覆盖。只解析时输出该映射，不自动执行生图。

读取 [references/repository-reading.md](../repo-to-frontend/references/repository-reading.md) 和 [references/project-grounding.md](../repo-to-frontend/references/project-grounding.md)。固定提交或记录本地未提交差异，先建立全部已发现入口/子系统的覆盖台账，再追踪核心能力。代表链路只用于解释；未获取模块、动态配置与未读范围必须说明对交付的影响，不能把“打包全部文本”当成“理解整个仓库”。

产出 `01-repository-map.md`：架构说明、核心链路、关键文件与行号、证据/推断/未知、已读与未读范围。

产出 `02-backend-frontend-contract.md`：后端如何接收、校验、处理、存储并输出，以及前端各数据/动作/状态如何对应。记录能力B→证据E→内容C→区块U/交互I映射、权限/配置、异步与错误、精度及真实调用/静态解释/模拟的区别。没有后端的项目不虚构API。


## 阶段交接

完成本阶段必要自验后检查继承的independentReview设置；开启时按[独立子代理审查](../repo-to-frontend/references/independent-review.md)冻结产物并派发全新上下文，只返回问题/结论/证据。未决阻断问题或过期审查不能交接受影响产物；关闭只省去子代理，不省去本阶段自验。未选阶段不自动补跑，已有图片审核仍单独遵守。
