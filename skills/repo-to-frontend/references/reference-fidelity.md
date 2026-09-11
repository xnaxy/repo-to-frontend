# 按图实现的缺省合同与收口

适用于生成图或外部图已经选定后要求实现，包括“开始实现”“产品前端”“接现有后端”。这些措辞没有授权重新设计。缺省 `reference`：保持参考的区域顺序、列关系、首屏信息、图形类型和视觉编码；明确逐像素要求为 `strict`；只有用户明确允许改变布局才为 `redesign`。不要求用户重复说“严格”才能保住选定设计。参考字体未知可披露近似，不能因此把整个页面改成模板。

模式在实现前写入 `run-state.json.delivery.mode`，连同用户原话/消息定位、所选图集指纹和例外。验收者从用户依据复核，不从作者的“设计提升”标签推导授权。接后端、开启功能、自动继续、语义纠错、图片审核关闭均不构成重排授权；无新增用户决定沿用原模式。没有图片而只要求设计的任务不适用本文件。

## 先证明一个区域，再扩展

从最复杂参考页提取主区域树：id、原图bbox及测量不确定性、父区、列/上下顺序、首屏可见内容、表格列及可见行、图表类型、系列颜色/图例/值标注、常驻与弹出状态。所有参考页先有主区域清单，不从实现倒推期望。复杂区域再按 locked-image-reconstruction.md 拆叶节点；普通模式不强制把所有正文拆成原子坐标。

保存不可覆盖的 `calibration/r1/`：参考局部、真实DOM/SVG、相同视口截图、差异清单及可恢复代码。先核主区域，再核文本/图表。在以下任一条件存在时不得推广公共组件或批量页面：换了图形类型/系列编码、参考同屏内容被推到屏外、常驻表改成按钮后内容、两栏变一栏、用一句观察代替指标栏。功能齐备或更好看不抵消这些差异。逐项修复后才能扩展；具体坐标和容差属于该参考合同，不是通用常量。

`reference` 模式也要实际并排看原图和截图，检查状态、覆盖、结构、内容、外观、交互六维。图表需按原图核轴、系列、图例、数值标注；正常的数据修正只改有证据的节点，不能连带换布局。`strict` 另执行严格采集/像素合同；不把普通模式的结构通过冒称像素一致。

## 必须运行的交付汇总

build自验与verify收口都运行 `node <shared>/scripts/check-delivery.mjs delivery-input.json delivery-result-rN.json`，输出使用新路径。它补上现有采集/几何检查之上的图集覆盖和模式门槛，不代替采集器、视觉判断或用户授权核验。

输入schemaVersion=1；路径相对执行工作目录或使用绝对路径。每个证据对象为 `{path,sha256}`，SHA256取实际文件字节。

输入必须有scope：无后端的视觉任务为visual-only，后端产品为backend-product。后者同时按[图片功能闭环](image-contract-loop.md)提供当前imageAudit输入/报告和backendCoverage，缺失或过期阻断；不能用visual-only规避用户要求的后端覆盖。

- `mode`：reference/strict/redesign，省略为reference。redesign额外记录 `layoutChange:{actor:'user',explicitLayoutChange:true,quote,evidence}`，evidence指向实际用户决定记录；作者自己的规格不是授权。
- `references`：从选定完整图集取得 `{id,image:{path,sha256},regions:[区域id...]}`，不可只放实现者已做好页面。独立核对候选图集完整性；程序不知道未提供的参考是否存在。
- `implementation`：所有参与当前页面的源码/样式/资源证据对象；用可恢复提交或补丁保存历史。不要只列入口HTML。
- `pages`：每个参考id恰有一项，包含 `id,screenshot,review,reviewScreenshotSha256,referenceDigest,implementationDigest,sameViewport,sameState,originalAndActualViewed,regions,findings`。digest分别为 `SHA256(JSON.stringify(references))` 与 `SHA256(JSON.stringify(implementation))`；数组顺序固定，review绑定实际截图SHA。review是实际原图对比记录，截图由浏览器产生，不手填成功。
- 每个region为 `{id,state,coverage,structure,content,appearance,interaction}`，六维取PASS/FAIL/UNKNOWN/NOT_RUN等；静态区域interaction核查“确为静态且无被遗漏控件”后可PASS，不能靠省略豁免。findings含id、resolved；存在未解决项即FAIL，不受P2/P3或non-blocking标签抵消。已授权差异仍对原图保留，不能改写原图一致；若用户改变验收目标，另存可追溯合同版本，保留旧结果。
- strict还需 `contractEvidence`、`contractReference`、`contractActual` 三个文件证据，分别是现有严格检查器报告及其原始参考/实际输入。汇总器读取真实报告状态和inputBinding，并核图片指纹；调用方填写contractStatus不能覆盖报告。六维人工断言、用户决定与区域清单真实性需审查，工具仅验证所给文件的绑定和收口逻辑，不能防止作者伪造整个证据包。

退出0=`PASS_SCOPED`：仅输入范围达标；退出1=`FAIL`：存在差异；退出2=`BLOCKED`：缺证据/状态不等价/过期/模式授权缺失。后两者均不得写视觉完成或将选中build/verify标完成。测试、安装、HTTP成功、代理通过分别报告，不能覆盖此状态。声明用户接受仍需用户实际接受；没有参考的响应式与业务状态另报功能验证。

Skill优化的有效性按 skill-transfer-validation.md 用同条件新上下文前向对照检验，不能把这个汇总器抓错能力称为复刻质量提升。
