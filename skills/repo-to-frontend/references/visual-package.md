# 从事实到实际调用的共享设计包

适用于新设计、多状态图集或需继续追踪选型的任务。它落实视觉配方整合，不另造批准流程；单纯分析不生图，已有旧图复刻不强制重新设计。已有任务未使用本包时保留原合同兼容，不能把删除包字段当作通过检查的方法。

## 各阶段只补自己的信息

| 阶段 | 写入与消费 |
|---|---|
| analyze | 源码证据与能力/数据/关系/状态；附读者任务和内容形态，未知标明；不从模板反推事实 |
| brief | 复用能力合同，补准确显示文字、各图布局、共享视觉变量、选型理由与少量有来源素材 |
| image | 组装逐图prompt，实际原样发送并记录引用图；全图集审查后修受影响图，再核包与图审 |
| build | 核包当前性与已有关口；从最终参考提取DOM文字、数据图形、交互与素材，不重新选风格 |
| verify | 核源→要求→实际prompt→图→DOM/请求/状态及图间风格；运行图审和交付检查，不以包CURRENT代替视觉PASS |
| 总入口 | 保存包的文件证据并继承运行状态、两个审核开关和实际阶段范围 |

新增设计任务在brief/image构建设计包；只有锁定旧图或不涉及设计时可沿用既有交接，记录不适用理由。所选阶段之外的缺输入仍按stage-handoff处理，不自动补跑。

## 输入与命令

运行 `node <shared>/scripts/prepare-visual-package.mjs input.json new-package.json`，输出不可覆盖；检查当前性用 `node <shared>/scripts/prepare-visual-package.mjs --check input.json package.json`。文件证据均为实际字节SHA256和路径，相对路径按执行目录解析。

input.json：

```text
schemaVersion: 1
contract: {path,sha256}
catalog: {path,sha256}
direction: {profile:{artifact,task,density,referenceLocked?},recipeId,reason}
style: {typography,palette,spacing,components}
pages: [{id,viewport:{width,height},layout,text:[],references:[],assets:[],repairInstructions?}]
```

- contract复用image-capability-contract.json的scope/pages/capabilities/sourceEvidence。expected包含全部字段语义、允许动作及结果、关系边和状态，不能只摘名字；工具不会发现源码中没写进合同的能力。无后端内容用scope=visual-only、pages、requirements、sourceEvidence，不伪造capabilities；requirements仍为id/pageId/kind/expected。
- catalog在本次产物目录冻结visual-recipes.json快照，记录来源及哈希；这是任务数据，不复制整套Skill。以后安装库升级不改变旧任务快照，也不自动要求旧图重设计。
- direction复用 [选型规则](visual-direction.md)。命中时选择实际候选ID；NO_MATCH及REFERENCE_LOCKED使用recipeId:null，理由必填。锁定时每页必须有实际引用图片。
- 新设计的默认栅格提示采用可观察的相对层级、区域结构与色彩角色，前端再测最终参考的实际几何；用户或已有合同明确的像素/精度要求仍保留，无法达到就报告阻塞。执行者提出的精确实验要求若失败要保留失败记录，另定新实验并重新调用，不能事后给旧图换标准追记通过。
- style四项均为具体字符串，例如字体层级、颜色角色、间距和共享组件边界；不能留模板变量。所有页共用该对象；每页layout解释内容如何布局，不用它偷换公共样式。
- pages恰好覆盖合同物理图集，不能只放准备画的页面。text是允许上图的完整业务文字（含标题、单位、数字及结果条件）；布局/实现说明不写进text。requirements自动完整注入各自prompt；执行者仍需反查text是否漏译合同，不把字符串存在当语义一致。
- references是实际编辑/风格参考的文件证据。assets每项为`{file:{path,sha256},usage,provenance:{path,sha256}}`，记录素材用途和授权/来源依据；“有来源文件”本身不证明获准使用，需实际核对。没有素材时用空数组，不下载全库。
- repairInstructions仅记录本图需要修的全部问题，有该字段必须提供当前图引用。公共style/合同改变时重建所有受影响图的prompt与审查；未变化的页可按现有图审规则复用同SHA记录。

输出PREPARED含逐图prompt/promptSha256、requirementIds、referenceInputs、assets、styleDigest及合同/选型摘要。从pages提取prompt原样发送；实际工具能力/模型要求按imagegen规则，不用包中的文字冒充已传引用图或指定模型证明。

## 实际调用记录及图审

把同一个文件证据对`visualPackage:{input:{path,sha256},output:{path,sha256}}`写入run-state、图审input与delivery-input。使用对象合并保留已有其他字段，不能重建运行状态来关闭审核。

有包的visual-only交付在references各项增加generation.request；backend-product仍放图审images各项，由交付重跑图审。两者均检查实际请求，不把无后端任务留作绕过路径。

每次调用完成保留实际请求记录JSON：`{tool,prompt,referenceInputs:[{path,sha256}]}`。prompt取所发字符串；referenceInputs按实际调用顺序列编辑图/风格图及所附素材。若提供多个图片须按工具机制全部传入；工具不能满足时先按原工具规则处理，不能伪写记录。图审每张image增加`generation:{request:{path,sha256}}`。

图审核包重算、合同/公共style、逐图实际请求prompt与全部引用证据；交付再核包与图审同版。实际调用日志只作为可追溯记录，程序不能鉴定日志真实性或理解图片。需保留工具真实返回、模型可确认范围和实际看图记录，禁止为了获得CURRENT或READY而补造请求。

3.4采用包时用check-delivery.mjs导出的deliveryReferenceDigest(input)计算referenceDigest：SHA256(JSON.stringify({references,visualPackage}))；无包旧任务保留SHA256(JSON.stringify(references))。采集/审查统一调用该函数，不手写旧公式；删除包字段会改变摘要，旧页面/片段审查随之失效。不能重造证据来伪装旧任务，工具也不鉴定整套伪造记录。

包CURRENT只表示当前输入可重建相同输出。源文件、合同、准确文字、选型快照、布局、共享style、素材或记录prompt变化都会使相应绑定失效。修改后另存版本，再实际生成/审查受影响图；不能只重算摘要保留旧审查。图片/语义合同变化时，继续执行 [图片审核与阶段交接](stage-handoff.md)，旧同意不能移到新图集。

## 复刻与完整验收

实现前核最终图集、合同、包与图审；提取主区域及最复杂区域做真实DOM校准。文字保持可选取，图表根据真实数据绘制，控件触发真实合同动作；照片/插图按素材处理，不用整图贴底冒充前端。图中出现未批准营销数字、客户评价或按钮时回图审，不把它补成后端。

verify逐页核六维，并横向比较公共字体层级、颜色角色、间距、同名组件及状态切换后的布局。差异写实际finding，不能用每页“各自好看”覆盖风格漂移；检查器不自动从像素测风格。除已声明可变数据外，样本恢复应恢复参考状态；新数据和无参考视口单独记录功能/可读性，不冒称参考视觉一致。

完整流程验证至少包含真实来源读取、实际图像调用、原图对照浏览器截图与实际请求/状态；只跑工具fixture或图片实验时标明未覆盖的阶段。复用原 [交付汇总](reference-fidelity.md) 与 [迁移验证](skill-transfer-validation.md)，不新增第二套视觉通过标准。
