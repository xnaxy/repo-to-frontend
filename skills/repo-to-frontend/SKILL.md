---
name: repo-to-frontend
description: "Use when the user wants an end-to-end or selected-stage repository-to-frontend workflow, including repository explanation, UI image generation and reconstruction, or managing this skill suite."
---

# 仓库到前端：总入口

工作流版本：3.3。总入口负责选阶段、版本交接、图片审核和可选独立子代理审查；详细执行内容已拆到五个独立Skill。共享引用、脚本与素材继续由本目录维护，保留3.0项目准确性及2.9视觉能力，不复制成五套规则。

先读 [共享约束](references/stage-common.md) 和 [交接与图片审核](references/stage-handoff.md)。只加载本次需要的阶段入口及其相关引用，不把全部阶段重新塞入上下文。总入口和阶段入口可分别调用，阶段入口依赖本目录的共享资源；六个目录配套安装。

## 可调用入口

| 阶段 | 调用名与说明 | 主要交付 |
|---|---|---|
| 解析 | [$repo-analyze](../repo-analyze/SKILL.md) | 仓库覆盖地图、后端能力合同 |
| 简报 | [$repo-design-brief](../repo-design-brief/SKILL.md) | 叙述文稿、页面简报、交互合同 |
| 生图 | [$repo-image-design](../repo-image-design/SKILL.md) | 生图prompt、实际设计图及版本证据 |
| 复刻 | [$repo-frontend-build](../repo-frontend-build/SKILL.md) | Codex实现prompt、视觉规格、前端及必要验证 |
| 验收 | [$repo-frontend-verify](../repo-frontend-verify/SKILL.md) | 独立验收报告及差异证据 |

## 编排

3.3在简报/生图增加按任务筛选的 [视觉结构辅助](references/visual-direction.md)，保留事实、状态与固定参考优先级；解析阶段不加载配方，复刻/验收不重新设计。

后端产品全流程必读 [图片功能闭环](references/image-contract-loop.md)：完整图集双向核对后端，汇总全部问题按原风格修图并重新全检，零未决后才复刻。图像审查与最终后端覆盖均有可执行关口，不能以原图加纠错清单放行。

选定参考图后进入build/verify必读 [按图实现的缺省合同与收口](references/reference-fidelity.md)：未明确授权重排时默认保留参考设计。共享check-delivery.mjs的视觉结论与功能/安装结论分开，未达标不将全流程记为完成。

1. 依据用户意图确定阶段；仅解析、仅生图或仅验收不得自动扩展。全流程按上表顺序执行，已有有效产物直接交接。组合阶段缺少输入时说明缺口，不静默补跑未选阶段。
2. 读取被选阶段的SKILL.md并执行其指令。五个阶段是可调用能力，不意味着要新建Codex任务或启动子代理。
3. 仓库范围/事实/契约和图片版本通过run-state.json交接；每阶段只更新自身及必要共享字段。复刻完成仍须做必要测试，独立验收入口不替代实现者自验。
4. 在前端实现前执行图片审核关卡。默认关闭；用户开启后展示候选图片并等待对该版本的明确同意，未经同意不得写前端。具体状态、跨阶段继承、换图失效及多图批准见 [交接与图片审核](references/stage-handoff.md)。
5. 独立子代理审查默认关闭；开启时按[独立审查协议](references/independent-review.md)在每个已选阶段自验后、交接前派发新上下文只读审查。继承设置并绑定事实/产物版本；不能以自审或旧报告冒充。与图片审核互不替代。
6. 交付本次所选阶段的实际产物和状态；未选、未运行、阻塞和完成分别记录，不把Skill安装成功称为项目全链路成功。

用户要求真实对接前端时，按[对接路径](references/backend-integration.md)复用实际客户端并记录真实旅程验证；出现阶段能力缺口时按[工具路由](references/github-toolkit.md)选用，不默认安装全部GitHub项目。

## 调用示例

- `$repo-analyze 解析这个仓库，只输出覆盖地图和能力合同。`
- `$repo-design-brief 根据已有解析结果生成文稿和设计简报。`
- `$repo-image-design 根据这份简报生成设计图，不做前端。`
- `$repo-frontend-build 使用这张图复刻前端，开启图片审核。`
- `$repo-frontend-verify 检查已有前端与参考图、能力合同是否一致，只报告问题。`
- `$repo-to-frontend 执行解析和简报两个阶段。`
- `$repo-to-frontend 用已有简报执行生图、复刻和验收，开启图片审核。`
- `$repo-to-frontend 执行全流程。`（新任务默认不等图片确认；同任务已开启的审核仍继承。）

- `$repo-to-frontend 为这个项目执行全流程，交付真实后端对接前端，开启独立子代理审查。`
- `$repo-frontend-build 继续当前版本，关闭独立子代理审查。`（不改变图片审核设置。）

这里的阶段选择和审核开关是自然语言Skill配置，不是新增应用设置或后台自动运行服务。
