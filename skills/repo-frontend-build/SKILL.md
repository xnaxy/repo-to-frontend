---
name: repo-frontend-build
description: "Use when the user wants frontend reconstruction from supplied or generated reference images, including an optional image approval gate."
---

# 前端复刻

版本：3.2。可单独调用，也可由 $repo-to-frontend 编排。

先读 [共享约束](../repo-to-frontend/references/stage-common.md) 和 [交接与图片审核](../repo-to-frontend/references/stage-handoff.md)。仅依赖同级repo-to-frontend共享资源，不需要读取或执行总入口的其他阶段。安装时须配套该共享目录；缺失时明确报告，不能绕过审核或另造规则。

## 输入与停止边界

- 输入：实际参考图与明确实现意图；仓库任务还需事实/能力/交互合同。
- 输出：05-codex-implementation-prompt.md、05-visual-spec.md、frontend/及本次必要测试记录。
- 只执行本阶段；有现成上游输入就复用。缺失影响承诺的材料时说明缺口，不自行补造材料后继续，也不自动追加未选阶段。

## 阶段流程

后端产品任务在任何前端文件写入前执行 [图片功能闭环](../repo-to-frontend/references/image-contract-loop.md) 的build准入，重新验证当前图集READY_FOR_REPLICA及用户图片批准；未经语义闭环不能先写草稿。完整复刻最终图并逐条实现后端能力映射；新语义矛盾返回修图，不把原图+纠错清单作为本流程交接。

**在任何前端源码、组件、样式或脚手架写入之前执行共享协议的图片审核关卡。** 独立调用也不得跳过。可先取证、看图、做语义核查及准备审核文档；开启且未获同意时不得提前构建“草稿”。

按 [项目事实与交接](../repo-to-frontend/references/project-grounding.md) 保存独立可读的 `05-codex-implementation-prompt.md`；独立图片任务不补造后端。

先读 [按图实现的缺省合同与收口](../repo-to-frontend/references/reference-fidelity.md)。已选图后要求实现，缺省为reference：保留布局、层级、首屏内容和图形编码，不以“产品前端”推断用户允许重排。先做复杂区域的截图校准，通过后才推广整套；完成前运行共享check-delivery.mjs，失败/缺证据不交接为完成。模式由可追溯的用户意图决定，不能仅凭“返修”锁逐像素坐标：

- **忠实复刻**：要求1:1、完全或严格按图且未解除约束时，读 [references/locked-image-reconstruction.md](../repo-to-frontend/references/locked-image-reconstruction.md) 和 [references/strict-replica-tools.md](../repo-to-frontend/references/strict-replica-tools.md)。先冻结独立参考合同，再测实际DOM与截图，执行可失败的合同检查。参考优先于通用审美；不自动切设计提升或模板降级。
- **设计提升**：仅在用户明确允许改变参考布局时，读 [references/design-quality.md](../repo-to-frontend/references/design-quality.md)。保留内容、数据、关系与交互，重新设计阅读层次；不把提升版叫作完全复刻。仅说品质优先不覆盖已选图的结构约束。模式改变记入规格。仅视觉任务默认不重新生图，除非用户要求；已进入后端产品图片闭环的任务按其协议先更新受影响图及合同并重新审查，不用本分支绕过闭环。
- **模板降级**：读 [references/template-fallback.md](../repo-to-frontend/references/template-fallback.md) 前先核用户是否明确允许改变参考布局；使用模板内部能力但不改外观可直接实施。自定义视觉未达标或能力受限只能保留FAIL/BLOCKED，不能自行换模板布局。已授权重排的模板仍保留语义与逐图验收；非严格复刻成功。

严格复刻中的架构图、逻辑/计算树或数据图表，必须在提取和构建前读 [references/diagram-and-chart-reconstruction.md](../repo-to-frontend/references/diagram-and-chart-reconstruction.md)：空间盘点与语义追踪交叉验证，原图观察/语义结构/实现坐标分开；逐边端口、运算符、图表尺度和全部实例不能退化为组件数量。

字体、字形或细线残差明显时读取 [references/font-and-raster-calibration.md](../repo-to-frontend/references/font-and-raster-calibration.md)，先核实际渲染字体，再做有限候选与全部消费者回归；需要新字体时固定来源、许可和资源文件。

文字越界、框架重叠、内容贴边或字重遗漏时，构建前读取 [references/text-frame-relations.md](../repo-to-frontend/references/text-frame-relations.md)，按包含、相邻、内容组对齐及局部字重分别建检查。字体默认配置/安装与字号设置读取 [references/font-presets.md](../repo-to-frontend/references/font-presets.md)；用户指定字体覆盖参考时明确记录例外。

每种模式都建立文字与数值展示合同：术语、准确文案、单位、归属、有效位/小数位、舍入、缺失与零、字体来源和可证实程度。严格模式在参考状态按节点锁定displayText，不用跨页统一精度覆盖原图差异；rawValue、单位、计算值与显示字符串分开。正式数据的数值/空值/时间和规模变化按 [参考样本与正式数据](../repo-to-frontend/references/data-generalization.md) 处理，不锁死样例。图片未知字体不冒称同款；长公式采用未舍入值计算。需要图片/图标/标志时，读 [references/public-assets.md](../repo-to-frontend/references/public-assets.md)，不把公开访问等同于无许可限制。

读取同一参考的“复刻与验收”部分。先用视觉工具查看保存的参考图，再识别布局、比例、字体层级、色彩、间距、图形与响应式变化，形成 `05-visual-spec.md`，记录确切图片路径与哈希。基于**图像视觉 + 文稿语义**实现 `frontend/` 或用户指定目录，不能只凭原始提示词另做一版。

正文、数字、关系仍以仓库证据和文稿为准；图片中误生成的文字不是事实。冲突进入精确到节点的例外账本：原值、拟采用值、依据、影响与待确认状态。纠错版另建参考版本并保留原版，不能把例外删掉后声称原图1:1。用真实 HTML/组件实现内容与交互，不以整张截图作为页面替身。

独立调用同样完成与修改相关的测试、构建和浏览器检查；使用Vitest时运行最相关测试文件，失败不得声明完成。拆出验收入口不意味着本阶段可以跳过必要验证。进一步独立复核可调用 $repo-frontend-verify。


## 阶段交接

完成本阶段必要自验后检查继承的independentReview设置；开启时按[独立子代理审查](../repo-to-frontend/references/independent-review.md)冻结产物并派发全新上下文，只返回问题/结论/证据。未决阻断问题或过期审查不能交接受影响产物；关闭只省去子代理，不省去本阶段自验。未选阶段不自动补跑，已有图片审核仍单独遵守。
