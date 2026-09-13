# 阶段组合、断点交接与图片审核

本协议适用于总入口及五个独立入口；是Skill执行约束，不是应用内设置页面或后台拦截器。另有默认关闭的[independentReview独立子代理审查](independent-review.md)，与下述imageReview互不覆盖；主代理自验→可选阶段独立审查→交接，image审查完成后仍须遵循已开启的用户选图关卡。

## 选阶段与交接

后端产品任务还有强制[图片功能闭环](image-contract-loop.md)：image阶段当前图集零未决后才交接build；build写任何前端前重核。run-state.json保存imageContractLoop的input/result文件及摘要、round、status和受影响图，旧结论不按文件名继承。该自验与independentReview、imageReview是三个独立条件，关闭用户批准或代理审查不关闭它；用户批准也不能覆盖未通过的语义审查。

build/verify交接还须遵循[按图实现合同](reference-fidelity.md)。图片选定是视觉依据，不只是灵感；“同意开始”不等于授权设计提升。保存delivery.mode及用户依据，运行check-delivery.mjs；视觉FAIL/BLOCKED必须传播至受影响阶段，不得由其他阶段或有限审查的passed覆盖。

阶段顺序：analyze → brief → image → build → verify。单独调用只执行所选阶段；组合按依赖顺序执行。缺少输入先查用户提供材料和同一任务输出；无法补齐时说明所缺，不自动追加未选阶段。用户明确要全流程即执行全部，已有有效产物可复用；独立图片复刻不要求仓库解析。未选阶段记NOT_SELECTED，不能记完成。

每阶段更新同一输出目录的run-state.json，保留未知字段及其他阶段记录，不用新文件覆盖上游事实。记录artifact的实际路径/哈希、仓库/合同指纹、已选阶段、完成/阻塞/未执行状态及缺口。跨上下文交接必须可读到这些实际文件；文件名相同不证明版本相同。旧3.0产物可在核对路径/指纹后接续，不要求重做。

图片审核状态在同一任务及输出目录内继承，不因单独调用build重置。只在新任务没有明确开关、没有待继承状态时默认false；自然语言“开启图片审核/先让我选图”设true，“关闭图片审核/这次不用等我确认图片”设false，记录用户决定。普通“继续”“尽快”“自主完成”不覆盖已开启的审核。状态丢失但会话曾开启审核时恢复true，不能借文件缺失跳过。独立任务不继承其他项目的同意。

## 图片审核关卡：紧邻前端实现之前

关卡同时适用于本次生成图和用户提供图。先完成图片生成/选集、实际查看、语义核对与审核资料，再检查开关；事实矛盾或关键能力未知仍按project-grounding阻塞，用户同意选图不解除这些问题。

- **关闭（默认）**：imageReview.enabled=false，status=disabled。若用户已要求复刻且输入就绪，直接继续，不增加确认问题；不写userApproved=true，不伪造用户接受。
- **开启**：展示当前拟用的全部图片或可访问图集，逐项列pageId/stateId、版本、实际路径及SHA256，并说明已知语义纠错和剩余差异。保存image-review.md，确认摘要绑定候选图集与相关语义合同/例外版本；不要只给未展示的文件名要求批准。
- 无当前有效同意时设status=pending及build状态WAITING_IMAGE_APPROVAL，明确问“是否使用这一版图片开始前端复刻？”。在说明中指出这是用户开启的图片审核并链接本协议。结束本轮等待用户回复，或保持输入请求待答；静默、超时、预选选项、工具调用成功、模型自行审查都不算同意。可以继续不依赖批准的取证与文档整理，不能写前端源码、CSS、组件、脚手架或启动构建型子任务。
- 用户明确同意当前展示的具体版本/图集后，保存其实际回复或消息定位、批准的候选摘要与时间（可得时），设status=approved；再次核对磁盘图片和合同摘要后执行已授权的build，不重复询问。同一已展示图集后无歧义的“用这版开始”可作为同意；“不错，但再改一下”不是同意。
- 用户拒绝则status=rejected，不开始复刻；按修改意见生成/选择新候选再审。用户撤回同意，后续实现暂停；不删除已有成果。图集增删、替换、同路径覆盖、任一图片内容或相关语义合同/例外变化，原批准变为stale，必须重新展示并等待。仅路径移动且图片及合同摘要相同可保留批准，记录新路径与核验结果。
- 多图默认审核整个本次build候选集。只有用户明确允许分批实施时，才按已批准pageId/stateId执行；未批图不得混入。批准不自动授权原本未选择的复刻阶段，也不代表最终前端验收通过。

## 状态最小示例

以下只是初始结构；artifact和批准记录应填本次真实值，不把示例当实际证据。candidateDigest计算基于有序的pageId/stateId/图片SHA256及相关合同/例外摘要，避免文件同名或版本标签复用造成误批。没有合同的独立图输入明确记not-provided及已知实现约束摘要，不伪造合同。

```json
{
  "workflowVersion": "3.4",
  "selectedStages": ["image", "build", "verify"],
  "independentReview": {
    "enabled": false,
    "decisionEvidence": null,
    "stages": {}
  },
  "imageReview": {
    "enabled": false,
    "status": "disabled",
    "candidateDigest": null,
    "candidates": [],
    "approvedDigest": null,
    "approvalEvidence": null
  },
  "stages": {}
}
```

开启且status不是approved、摘要不匹配或缺少可追溯用户同意时，一律不能开始build；修复状态并取得同意，不用伪填approved消除阻塞。关闭开关是用户明确改变设置，与批准某张图片分别记账。

新设计的visualPackage证据按 [共享设计包](visual-package.md) 合并保存；包版本变化先核受影响prompt/图审及合同，再执行本协议的批准失效规则。CURRENT不改变任何阶段或用户批准状态。
