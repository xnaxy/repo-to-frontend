# 按图实现的缺省合同与收口

适用于生成图或外部图已经选定后要求实现，包括“开始实现”“产品前端”“接现有后端”。这些措辞没有授权重新设计。缺省 `reference`：保持参考的区域顺序、列关系、首屏信息、图形类型和视觉编码；明确逐像素要求为 `strict`；只有用户明确允许改变布局才为 `redesign`。不要求用户重复说“严格”才能保住选定设计。参考字体未知可披露近似，不能因此把整个页面改成模板。

模式在实现前写入 `run-state.json.delivery.mode`，连同用户原话/消息定位、所选图集指纹和例外。验收者从用户依据复核，不从作者的“设计提升”标签推导授权。接后端、开启功能、自动继续、语义纠错、图片审核关闭均不构成重排授权；无新增用户决定沿用原模式。没有图片而只要求设计的任务不适用本文件。

产品数据会变化时读取 [参考样本与正式数据](data-generalization.md)：样图状态用于视觉校准，合同内新数据按已声明规则适应。严格的文本/几何锁定不要求把样图数值写死；新状态分别验语义与可读性。

## 先证明一个区域，再扩展

从最复杂参考页提取主区域树：id、原图bbox及测量不确定性、父区、列/上下顺序、首屏可见内容、表格列及可见行、图表类型、系列颜色/图例/值标注、常驻与弹出状态。所有参考页先有主区域清单，不从实现倒推期望。复杂区域再按 locked-image-reconstruction.md 拆叶节点；普通模式不强制把所有正文拆成原子坐标。

保存不可覆盖的 `calibration/r1/`：参考局部、真实DOM/SVG、相同视口截图、差异清单及可恢复代码。先核主区域，再核文本/图表。在以下任一条件存在时不得推广公共组件或批量页面：换了图形类型/系列编码、参考同屏内容被推到屏外、常驻表改成按钮后内容、两栏变一栏、用一句观察代替指标栏。功能齐备或更好看不抵消这些差异。逐项修复后才能扩展；具体坐标和容差属于该参考合同，不是通用常量。

`reference` 模式也要实际并排看原图和截图，检查状态、覆盖、结构、内容、外观、交互六维。图表需按原图核轴、系列、图例、数值标注；正常的数据修正只改有证据的节点，不能连带换布局。`strict` 另执行严格采集/像素合同；不把普通模式的结构通过冒称像素一致。

## 必须运行的交付汇总

build自验与verify收口都运行 `node <shared>/scripts/check-delivery.mjs delivery-input.json delivery-result-rN.json`，输出使用新路径。它补上现有采集/几何检查之上的图集覆盖和模式门槛，不代替采集器、视觉判断或用户授权核验。

输入schemaVersion=1；路径相对执行工作目录或使用绝对路径。每个证据对象为 `{path,sha256}`，SHA256取实际文件字节。

输入必须有scope：无后端的视觉任务为visual-only，后端产品为backend-product。后者同时按[图片功能闭环](image-contract-loop.md)提供当前imageAudit输入/报告和backendCoverage，缺失或过期阻断；不能用visual-only规避用户要求的后端覆盖。

- `mode`：reference/strict/redesign，省略为reference。redesign额外记录 `layoutChange:{actor:'user',explicitLayoutChange:true,quote,evidence}`，evidence指向实际用户决定记录；作者自己的规格不是授权。
- `references`：普通整页参考从选定完整图集取得 `{id,image:{path,sha256},regions:[区域id...]}`，不可只放实现者已做好页面。状态摘录板使用下方显式 `kind:'state-sheet'` 声明。独立核对候选图集完整性；程序不知道未提供的参考是否存在。
- `implementation`：所有参与当前页面的源码/样式/资源证据对象；用可恢复提交或补丁保存历史。不要只列入口HTML。
- `pages`：每个普通整页参考id恰有一项，包含 `id,screenshot,review,reviewScreenshotSha256,referenceDigest,implementationDigest,sameViewport,sameState,originalAndActualViewed,regions,findings`。digest分别为 `SHA256(JSON.stringify(references))` 与 `SHA256(JSON.stringify(implementation))`；数组顺序固定，review绑定实际截图SHA。review是实际原图对比记录，截图由浏览器产生，不手填成功。
- 每个region为 `{id,state,coverage,structure,content,appearance,interaction}`，六维取PASS/FAIL/UNKNOWN/NOT_RUN等；静态区域interaction核查“确为静态且无被遗漏控件”后可PASS，不能靠省略豁免。findings含id、resolved；存在未解决项即FAIL，不受P2/P3或non-blocking标签抵消。已授权差异仍对原图保留，不能改写原图一致；若用户改变验收目标，另存可追溯合同版本，保留旧结果。
- strict还需 `contractEvidence`、`contractReference`、`contractActual` 三个文件证据，分别是现有严格检查器报告及其原始参考/实际输入。汇总器读取真实报告状态和inputBinding，并核图片指纹；调用方填写contractStatus不能覆盖报告。六维人工断言、用户决定与区域清单真实性需审查，工具仅验证所给文件的绑定和收口逻辑，不能防止作者伪造整个证据包。

负面结果字段不得用对象、字符串或null代替数组。普通页和状态板页的 `findings` 保留省略兼容性，但提供时必须为数组；严格报告的可选 `blockers/differences` 也必须在提供时为数组。格式错误返回 `INVALID_REPORT_LIST` / BLOCKED，不能被当成“没有问题”。

### 状态摘录板的片段交接

状态板是包含多个互斥状态的物理设计图。保留整图的 `id` 与 `image` 文件SHA，不创建一个用于展示状态板的产品页，也不把多张截图拼成整板假截图。`reference` 支持下述逐片段证据；`redesign` 仍需已有的用户布局授权；`strict` 对状态板返回 `STRICT_STATE_SHEET_UNSUPPORTED` / BLOCKED，片段六维通过不等于像素合同通过。

状态板参考声明为 `{id,kind:'state-sheet',image,imageSize:{width,height},fragments:[...]}`。每个片段完整格式如下（数字仅说明字段，必须按实际图测量）：

```json
{
  "id": "pending-message",
  "sourceRect": {"x": 10, "y": 40, "width": 400, "height": 200},
  "target": {
    "pageId": "submit",
    "stateId": "pending",
    "viewport": {"width": 1200, "height": 900, "deviceScaleFactor": 1}
  },
  "requirementIds": ["R_PENDING"],
  "regions": ["message"]
}
```

`sourceRect` 是整张设计图中的原始像素范围，外部状态编号不需复制进产品；`imageSize` 是该设计图尺寸。`target.pageId/stateId` 标识真实产品页面及状态，pageId 不能等于状态板id；viewport 单独约定真实浏览器的CSS宽高和DPR，并非设计整图尺寸。当前范围只支持不重叠、整像素的片段，源矩形须位于设计图内；片段ID、requirements和regions均非空且去重，所有要求在该板的片段间恰好映射一次。无后端视觉任务也先登记视觉要求ID；不要为它发明后端能力。backend-product 的声明还须与图片合同完全一致，逐要求、逐区域映射见 [图片功能闭环](image-contract-loop.md)。

状态板在 `pages` 中仅留一项 `{id:物理参考id,fragments:[{id:片段id,screenshot,capture,review}],findings:[]}`，三个证据均为 `{path,sha256}`。每个声明片段恰有一项，不能靠整页PASS、漏片段、重复片段或另加片段补齐。`screenshot` 是该真实页面/状态的未修改浏览器原始视口截图；保留原始文件，局部对比使用元数据中的范围，不另造“实际截图”。

`capture` 是实际采集记录JSON，完整字段为：

```text
schemaVersion: 1
source: 'browser'
original: true
url: 实际HTTP(S)产品页面地址
referenceId: 物理参考id
fragmentId: 片段id
target: 与该片段target完全一致
screenshotSha256: 原始截图文件SHA
referenceDigest: SHA256(JSON.stringify(references))
implementationDigest: SHA256(JSON.stringify(implementation))
fragmentDigest: SHA256(JSON.stringify(该片段完整声明))
actualRect: {x,y,width,height}
```

`actualRect` 是原始浏览器截图中真实组件的像素范围；必须位于 viewport×DPR 内，并与 sourceRect 等宽高。两张整图不要求同尺寸。当前不支持任意缩放、拼图、截图后改字或全页滚动长图；无法获得上述可比范围时保持BLOCKED，先调整真实采集/比较约定。不同采集约定或源矩形都属于合同换版，不能只改报告摘要继承旧审查。

`review` 必须是实际逐片段看图形成的JSON，包含 `schemaVersion:1,status,referenceId,fragmentId,target,referenceDigest,implementationDigest,fragmentDigest,reviewScreenshotSha256,captureSha256,sameViewport,sameState,originalAndActualViewed,regions,findings`。status 为PASS/FAIL/BLOCKED；captureSha256绑定实际采集JSON字节；其余绑定对应上述真实文件与当前声明，三个比较布尔值均须true。regions使用上方相同六维格式，完整覆盖该片段regions；findings登记全部未解决差异。汇总器读取这个文件中的逐区域结果；调用方或文件的总PASS不能覆盖任一FAIL、UNKNOWN、缺项或未决finding。截图、代码、图集、矩形、目标状态或采集记录变化后须重新采集/审查，旧绑定阻断。

片段review的 `findings` 是必填数组，无问题也显式写 `[]`；可选 `blockers/differences` 若存在也须为数组。漏填findings或将这些字段写成对象、字符串、null均BLOCKED，即使重新计算报告文件SHA和总状态为PASS也不能绕过。

工具仅检查所给声明与证据的内容、状态和文件绑定，不识别图片内容，也不鉴定浏览器来源的真伪。文件中的 `original:true` 不能代替实际采集；它不证明所有片段已被如实登记、目标页面真的存在或截图真的处于所声明状态。执行者必须保存原始采集与看图事实，不能伪造整包JSON以得到PASS_SCOPED。共享组件一次片段对比只覆盖其声明目标，不能顺带声称所有复用页面/未见状态通过。

退出0=`PASS_SCOPED`：仅输入范围达标；退出1=`FAIL`：存在差异；退出2=`BLOCKED`：缺证据/状态不等价/过期/模式授权缺失。后两者均不得写视觉完成或将选中build/verify标完成。测试、安装、HTTP成功、代理通过分别报告，不能覆盖此状态。声明用户接受仍需用户实际接受；没有参考的响应式与业务状态另报功能验证。

Skill优化的有效性按 skill-transfer-validation.md 用同条件新上下文前向对照检验，不能把这个汇总器抓错能力称为复刻质量提升。
