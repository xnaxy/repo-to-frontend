# 后端 → 图片闭环 → 完整复刻

适用于以现有后端为依据生成产品前端的工作流（scope=backend-product）。图像语义闭环是必要自验，不是可选图片批准或独立代理审查。仅生图任务通过后仍停止；用户提供旧图且明确要求保留原貌的历史复刻保留原有例外协议，不把该特例用于绕过本流程。

## 先固定覆盖分母

从已核验的后端能力合同导出 `image-capability-contract.json`，逐条记录 B能力→页面/状态→可见字段、动作、结果与边界。分母来自源码入口/注册/激活配置及用户范围，不从已画图片反推。所有范围内用户可用能力和必要状态都有落点，包括权限、开关、异步等待/成功/失败、缺失值与结果详情；不能以“太复杂，写代码时补”漏画。

用户指定代表页时保留其能力范围依据，另列样本和数据形态的验证范围；不将代表对象名单变成产品支持名单。生图合同标明哪些是参考样本值、哪些随正式数据变化，按 [参考样本与正式数据](data-generalization.md) 交接字段口径与适应规则；不要求给每个合法对象或日期另画一页。

从完整字段语义表逐条核对到生图要求和实际发送的prompt，不能只把名称、样例数字摘成一份更窄的审核清单。排序、期间、窗口、单位与缺失规则等跨页面约束也须进入对应requirement的expected；共享状态板中的合成例表执行相同规则。记录每条约束的原始依据及对应要求，未映射或互相矛盾时先补齐/澄清，再生图。后续字段合同修订时重查所有受影响的主图和状态片段，不只审刚编辑的图片；旧清单全部MATCH不能覆盖完整合同中漏掉的约束。

内部worker、存储、鉴权检查等通过对应可见能力的状态/结果体现，不强迫为私有函数、数据库字段或秘密生成控件。内部项必须绑定真实可见能力及依据；范围外项须有用户范围依据。装饰不需要后端接口；模拟样例需标明，不把模拟成功认作真实能力。只知道接口存在不够，必须核输入、权限、输出、状态和副作用。

互斥状态分别映射，不要求等待、成功和失败同时出现在一张产品截图中。共用组件可用一张带明确状态编号的摘录板呈现，并在合同记录各片段对应的实际页面/区域及复用条件；状态板和外部编号不是新增产品功能。成功态图片不能证明其他状态已画出，换一批正常数据也不要求逐对象生图；后者按已声明的数据可变项验收。

## 每一轮的顺序

先区分语义准入与栅格几何精度。文字、数值标注、单位、日期、系列对应、正负和业务状态须与合同一致；图形另核共同尺度、数量、显著比例、排序及峰谷，不能以“示意图”掩盖误导。原图尺寸与抗锯齿会使近值不可区分，记录测量不确定性，不能把观察到的边缘误差临时变成未经约定的逐像素数值通过线。若用户需要精确数值几何，在生成前确定可验证的表达与精度合同；已约定的标准不得因模型难修而放宽。普通语义通过仍披露细微几何残差，不称像素精确；正式数据绘图须独立验证数值映射，不能以今后代码会纠正为理由放过当前图中的真实语义错误。

1. **完整审查当前图集。** 实际逐图查看。图→合同核每个业务字段、控件、数字/单位、图形编码、权限和状态是否有依据；合同→图核全部要求是否在正确页面/状态可见。登记难辨、缺失、虚构、错配、风格漂移及跨图不一致。未审完时不得把局部问题当作整轮反馈发出。
2. **汇总所有问题再反馈。** 写 `image-audit/rN/input.json`、审查记录和工具报告；每项含图id、区域/节点、观察值、后端要求、具体改法及影响图。对所有问题一次形成修图包，再按受影响图片分别调用图像工具，不必重生无关图片；多图不能把每发现一个问题就散发请求当作完整审核。
3. **保持原风格修图。** 每次实际调用带上待修原图、原风格锚点、需要修复的全部相关问题，以及锁定的配色、字体层级、网格、密度、图形编码与正确内容。图像工具不读取本地合同路径：把安全的具体字段/状态要求写进实际prompt。先在本地汇总全问题，再按图分发，避免泄露源码、密钥或不必要业务数据。记录工具真实引用参数与请求；不能只在报告写“已反馈”。使用工具可用的参考机制，区分风格锚点与编辑对象；无法同时引用全部必要图片时按工具约束拆分，不能把文字里提到图片当作已传图片。
4. **新图重新全检。** 另存rN+1，保存原图、提示词、调用结果及SHA。对修过的图重新核全部要求、对整套图重新核覆盖和共享内容/风格回归，不仅关闭旧问题。未改图可复用同SHA的逐图视觉清单，但每轮重新做图集总核对；修改公共合同或风格时重审所有受影响图。
5. **零未决才准入。** 运行 `audit-image-contract.mjs`。只有当前文件与合同绑定且全部要求通过的READY_FOR_REPLICA允许进入下一关。已知错误、遗漏、难辨/未知、风格未核实不能用“纠错清单”“到HTML再补”或用户同意冲掉。继续修图直至通过；不设“修一次/两轮后自动通过”。工具失败、合同未知、预算/能力受限或相同问题不收敛时记录真实阻塞并定位原因，不无限盲重发或伪报完成。调用超时先查结果避免重复生成；用户限制优先。

图片审核开启时，闭环及已开启独立审查完成后展示最终整个候选集，取得对当前摘要的同意，再写前端。关掉图片审核只省用户选图关卡；不省语义闭环。图集/合同换版使相应准入与批准失效；路径迁移且字节/逻辑相同可核验继承。

## 复刻不再进行第二次设计

build在源码、样式、脚手架写入前重跑当前图像审查输入，核对实际图集与合同，遵守图片批准。以修正后的最终图完整复刻：保留区域关系、首屏内容、图形类型、编码、密度、真实文本与控件，按reference-fidelity.md先校准再扩展。不能复制错误数据，也不能为接后端自行重排；若此时发现新语义矛盾，返回受影响图的闭环并使旧准入失效，不能本地偷偷改图意。

实现后核 B→图像要求→真实路由/组件/DOM→请求/响应/状态→验收证据。每个可见要求都需实现，不以菜单名、静态占位或mock成功冒充接入。真实后端不可达时保留NOT_RUN，清楚区分已实现的适配层、模拟合同测试和真实联调。最终同时满足图像语义准入、完整视觉复刻和前后端映射，才可声明对应范围完成。

## 可执行的文件合同

命令：`node <shared>/scripts/audit-image-contract.mjs image-audit/rN/input.json image-audit/rN/result.json`。输出路径不可覆盖。工具检查绑定/覆盖/状态并生成全问题feedback，不自动理解图片或发送请求；实际看图、事实判断、调用图像工具是执行者职责。

所有文件证据为 `{path,sha256}`，SHA256取文件字节。相对路径按命令执行目录解析，推荐绝对路径。

- input：`schemaVersion:1,contract,styleAnchor,styleInstructions,images`。contract指向JSON文件；styleAnchor指向保持原风格的图片；styleInstructions写具体不变量，不能只说“高级”。
- contract：`scope:'backend-product',sourceEvidence:[文件证据],pages:[{id}],capabilities:[...]`。普通page id包含唯一页面/状态标识；状态板的id标识物理设计图，真实页面/状态另由片段target指定。visible能力为 `{id,presentation:'visible',requirements:[{id,pageId,kind,expected}]}`，kind为action/data/state/result，expected具体写字段、单位、权限或状态。internal能力为 `{id,presentation:'internal',representedBy:[可见能力id],reason}`。另保留原始取证台账；JSON不替代独立源码覆盖审查。
- 每张image：`{id,image,review,reviewedImageSha256,reviewContextDigest,viewed:true,inventoryComplete:true,styleStatus:'MATCH',elements:[...]}`。review为实际审查记录；reviewContextDigest由脚本导出imageReviewContext(input)计算，绑定合同SHA、风格锚点SHA和styleInstructions，合同或风格变更后须重新实际审查；styleStatus还可DRIFT/UNKNOWN。elements逐项 `{id,capabilityId,requirementId,kind,status,observed}`；status取MATCH/MISMATCH/UNKNOWN；纯装饰kind=decoration且不能顶替业务要求。具体样例仅供schema测试，不能复制为实际事实。
- 结果：BLOCKED_CONTRACT需补后端依据；AUDIT_INCOMPLETE需完成实际审查/消除未知；REPAIR_IMAGES附全部issues及feedback，审核完整后才能发送；READY_FOR_REPLICA仅证明给定合同/图片清单已通过。新增问题再循环，不能用轮次数或旧结果冲掉。

显式状态板在 `contract.pages` 使用 `{id,kind:'state-sheet',imageSize:{width,height},fragments:[{id,sourceRect,target,requirementIds,regions}]}`，片段全部字段、矩形/视口约定及真实截图合同见 [状态片段交接](reference-fidelity.md#状态摘录板的片段交接)。保留既有requirement的id、capabilityId和物理pageId，不把片段拆成新增后端能力；该物理page的所有要求在fragments.requirementIds间恰好覆盖一次。每个业务element另需 `fragmentId,regionId`，分别匹配其要求所属片段及已声明区域；不能只在整板标MATCH而不定位片段。整板审查还要确认清单完整、编号与真实状态/复用条件正确，工具不能从像素发现漏登记的片段。

状态板声明属于合同JSON，因此变更矩形、目标或区域都会改变合同SHA及reviewContextDigest，旧图审不再有效；即使物理图片字节没变也须重新核对。图审结果保留原始整图文件SHA与要求映射，额外导出已验证的片段声明和每要求的 `fragmentId,regionId,target`，不会裁剪或生成新图。

`check-delivery.mjs`输入必须声明scope。backend-product再提供 `imageAudit:{input:文件证据,result:文件证据}` 和 `backendCoverage`。汇总器重新运行图像审查，不信调用方手填PASS，也核最终参考集与已通过图集完全对应。

backendCoverage每项 `{requirementId,capabilityId,pageId,selector,verification:文件证据}`；verification是实际执行的验证JSON，含 `{status:'PASS',requirementId,capabilityId,pageId,selector,implementationDigest,imageAuditDigest,integration}`。implementationDigest遵循reference-fidelity.md，imageAuditDigest等于当前图像审查结果inputDigest，要求改变必须重跑前端验证；integration明确MOCK/LIVE/STATIC及真实联调限制，不因mock给真实联调PASS。验证必须检查实际UI内容/请求/结果而非仅存在选择器。汇总器读取报告状态和代码绑定；不能补造报告、把图像通过当成前端已实现。visual-only用于本来没有后端契约的任务，不能给产品前端降级绕过门槛。

来自状态板的backendCoverage行和verification JSON均另外包含 `fragmentId,regionId,target`，与当前图审导出的要求映射完全对应；verification还需 `fragmentDigest,referenceDigest,screenshotSha256`，分别绑定该片段完整声明、最终物理参考集和该片段的原始实际截图。原 `pageId` 继续保留物理参考id，不能偷换为目标真实路由，真实页面/状态写入target。最终汇总器核对两侧状态板声明、要求覆盖、逐片段实际采集与六维审查；原backend验证字段与MOCK/LIVE边界仍全部执行。仅图审READY不能代替片段交付，整体PASS也不能盖过片段FAIL。

3.4新设计使用 [共享设计包](visual-package.md) 时，输入同时提供visualPackage文件证据对。图审逐图核generation.request的实际prompt及引用；交付核同版包。省略字段只兼容既有未采用包的任务，不允许删掉有问题的包来绕过新流程。
