---
name: repo-image-design
description: "Use when the user wants UI reference images from an existing design brief, including multiple page states, without building the frontend."
---

# 设计生图

版本：3.4。可单独调用，也可由 $repo-to-frontend 编排。

先读 [共享约束](../repo-to-frontend/references/stage-common.md) 和 [交接与图片审核](../repo-to-frontend/references/stage-handoff.md)。仅依赖同级repo-to-frontend共享资源，不需要读取或执行总入口的其他阶段。安装时须配套该共享目录；缺失时明确报告，不能绕过审核或另造规则。

## 输入与停止边界

- 输入：设计简报与相关事实/交互合同；独立视觉任务可使用用户明确的内容。
- 输出：04-image-prompt.md、实际参考图及哈希/调用记录；不自动创建前端。
- 只执行本阶段；有现成上游输入就复用。缺失影响承诺的材料时说明缺口，不自行补造材料后继续，也不自动追加未选阶段。

## 阶段流程

新设计先按 [视觉结构选型](../repo-to-frontend/references/visual-direction.md) 选择与任务匹配的结构，并记录选择依据与目录摘要；已有固定参考则保留原设计。结构建议不得缩减事实、控件或必要状态。

现有后端产品任务先执行 [图片功能闭环](../repo-to-frontend/references/image-contract-loop.md)。图集全部审查完才汇总反馈，保持原风格重生受影响图并重新全检，直到当前版本READY_FOR_REPLICA；未知/失败保留阻塞，不以固定修图次数或待前端纠错清单交接。

读取 [references/image-to-frontend.md](../repo-to-frontend/references/image-to-frontend.md) 的“生成”部分。使用当前可用的图片生成能力；若安装了 `imagegen`，读取并遵循其工具路由。用户明确要求 `gpt-image-2`，不能偷偷换模型，也不能把无法确认的工具底层模型记为已验证。

保存 `04-image-prompt.md`、实际生成的 `reference-v1.png`（保留实际格式）和调用模式/模型证明。没有图像工具或图像调用失败时标记 `BLOCKED_IMAGE`；指定模型不可用或无法满足严格模型确认时标记 `BLOCKED_IMAGE_MODEL`（图像阶段阻塞的具体原因）。文稿和提示词仍可交付，但文案骨架不算完成按图复刻。不把 SVG、HTML 截图或旧演示图冒充本次模型生成结果。

生图prompt必须直接带入影响界面的实际字段、单位、允许动作、权限/配置和生命周期约束。返回图逐项反查能力合同，不把模型新增按钮追认为需求。将事实包与选定图片清单交接给复刻阶段；不在本阶段写前端。

用户要整套图表，或复杂项目的核心问题无法在一张图中清楚表达时，先读取 [references/chart-suite.md](../repo-to-frontend/references/chart-suite.md)，生成图表清单、关联关系与共享内容/设计标记，再逐图生成。单张总览不能冒充整套。每张生图prompt都要包含该图可交互控件、触发后具体内容及目标状态，不能只把行为写在另一份文档里。用户只测试生图到前端时可采用明确标注的合成数据，不补做未要求的仓库分析。

先完成下述本阶段自验及可选独立审查。若后续已选择复刻且图片审核开启，再按共享协议展示完整候选集并等待同意；仅生图任务交付图片即停，不因审核同意而自动追加复刻。


分析型产品在生图前应用 [分析任务与视觉品质](../repo-to-frontend/references/design-quality.md)：展开实际数据到图形的映射，并分别检查语义正确性、信息密度与研究任务可完成度。数据丰富的主态与缺失子态分别设计，不把空态验证当作分析主界面验证。

## 阶段交接

完成本阶段必要自验后检查继承的independentReview设置；开启时按[独立子代理审查](../repo-to-frontend/references/independent-review.md)冻结产物并派发全新上下文，只返回问题/结论/证据。未决阻断问题或过期审查不能交接受影响产物；关闭只省去子代理，不省去本阶段自验。未选阶段不自动补跑，已有图片审核仍单独遵守。

新设计先核共享设计包，逐图原样发送已组装prompt并记录实际引用；图审绑定实际请求与包。修图另存受影响页版本，完整复查后交接。见 [完整设计包交接](../repo-to-frontend/references/visual-package.md)。
