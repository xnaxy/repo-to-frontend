# 可执行严格复刻合同

配合locked-image-reconstruction.md使用。工具不生成设计、不替代理解，也不自动认证任意图片1:1；它让可观察的不一致无法因主观总分被忽略。适用于已授权修改的前端，或已有标注页面的只读审计。

## 文件与顺序

1. 原图与原资产保留；先独立提取 `reference-contract.json`，冻结其文件哈希及依据。逐区域完整性复核写入附属账本。
2. 实现按id标记原子/容器，写 `capture.json` 描述URL、视口和状态探针。参考坐标不传给采集函数。
3. `capture-replica.mjs` 从真实浏览器提取 `actual.json` 和 `current.png`，自行读取两张PNG计算差异。
4. `verify-replica.mjs` 比较合同与实际，输出具体路径/原因；按关卡修复后重新采集。
5. `review-replica.mjs` 生成可双击审核页，点选节点显示两侧框与差异；人工/独立代理逐区看图及局部裁片，实际操作交互，未完成项不能因脚本绿而通过。

参考JSON是独立审图的表达，不是让代理从实际DOM自动生成的一份“自证”。只有明确可信的原设计源或受控工具测试夹具才允许从该源提取期望；这不是图片盲测，报告须区分。

## 运行

检查可用Node、Playwright/Chromium和sharp；不存在时在任务允许范围内配置依赖或报告NOT_RUN，不自动改全局环境。Skill本身不捆绑浏览器和node_modules。已有依赖可传绝对模块目录，无需再次安装。

```sh
node scripts/capture-replica.mjs --config /absolute/task/capture.json --playwright-module /absolute/node_modules/playwright --sharp-module /absolute/node_modules/sharp
node scripts/verify-replica.mjs --reference /absolute/task/reference-contract.json --actual /absolute/task/capture/actual.json --out /absolute/task/verification.json
node scripts/review-replica.mjs --reference /absolute/task/reference-contract.json --actual /absolute/task/capture/actual.json --reference-image /absolute/task/reference.png --current-image /absolute/task/capture/current.png --verification /absolute/task/verification.json --out /absolute/task/review.html
```

路径按实际环境替换。Playwright/sharp也可由当前项目常规依赖解析，届时省略两个module参数。采集只做导航/读DOM/截图，不替用户提交表单；所需初始状态优先通过已确认的只读深链接或用户授权的交互准备。

`capture.json`（路径相对该配置文件）：

```json
{
  "url": "http://127.0.0.1:3000/example.html",
  "referenceImage": "reference.png",
  "outputDir": "capture/full-r1",
  "viewport": {"width": 960, "height": 640, "dpr": 1},
  "colorScheme": "light",
  "scroll": [0, 0],
  "readySelector": "[data-r2f-id='page']",
  "stateProbes": [{"key": "selected", "selector": "#filter", "read": "value"}],
  "pixelThreshold": 0
}
```

stateProbes从实际控件读取value、checked、visible、text或指定属性（如aria-expanded），不是复制期望state。纯静态页也选真实可观察状态标识，例如标题的text，不能凭空填static通过。HTTP(S)图像必须用浏览器实际收到的响应体哈希；磁盘同名文件、URL、查询前路径不是传输字节证明。无法可靠观察则记录null和错误。本地file/data按实际资产字节计算。

采集前检查参考/配置/输出路径碰撞，禁止current.png或actual.json覆盖输入或既有采集结果。遇到OUTPUT_EXISTS应使用新的阶段/轮次目录，不删除旧证据来重跑。发布文件使用不替换已有文件的操作，写入期间出现同名结果也拒绝覆盖；失败可能留下部分本轮结果，保留并另开一轮。自写浏览器测试也须按轮次保存截图，内置工具不能保护绕过它的page.screenshot固定路径。CLI自动传可信配置路径；程序调用captureReplica(config, {chromium, sharp, configPath}, baseDir)时传configPath以保护配置源文件。测量与截图之间冻结动画并检查前后状态/节点稳定性；不稳定标CAPTURE_UNSTABLE，不能拿两种状态的证据混合验收。时间/随机数据仍由参考状态合同明确，不假定冻结CSS等于冻结业务状态。

当前冻结策略为有限动画末帧、无限动画起始帧并暂停，记录为finite-end-infinite-start-paused。参考若是其他时间帧，应显式适配冻结点，不把不同帧拿来验同图。前后测量稳定不是不可分割的原子截图证明。

## 标注与采集范围

```html
<section data-r2f-id="item" data-r2f-type="region">
  <span data-r2f-id="item.price" data-r2f-type="text">12.00</span>
  <span data-r2f-id="item.unit" data-r2f-type="text">元</span>
</section>
<path data-r2f-id="flow.a-b" data-r2f-from="flow.a"
      data-r2f-to="flow.b" d="M20 40H100" marker-end="url(#arrow)">
</path>
```

id不能重用，parent由实际DOM最近的带id祖先推导。文字、控制和SVG路径都应独立标注；只给整张表/父容器加id无法覆盖未标注子文本/路径。type为region/text/icon/shape/control/image；未指定时工具按DOM推断，复杂组件应显式标注。

`bbox`始终是元素盒，不是字形墨迹。文本另有rawText、displayText/text，以及Range测得的textBounds/lineBoxes；同一视觉行可能有多个片段，不能把lineBoxes.length当总行数。原生input/select/textarea内部文字几何不可可靠量测时为null并标明，不能拿外框当字宽。单选下拉的可见文字只取选中label，完整选项留在原始文本；空白按实际white-space处理，pre中的空格不trim。

2.6可选文字布局门禁：参考节点声明 `textBounds:[x,y,w,h]` 及 `textGeometry:{kind:"range-layout-boxes-not-ink",coordinateSpace:"viewport-css-px"}` 时，逐坐标按geometryPx比较实际Range盒。缺测量、不兼容类型、无效盒均BLOCKED，偏移为TEXT_BOUNDS_MISMATCH。必须有独立原设计/测量来源；仅图像墨迹不能填写为Range盒，也不能从actual回填预期。未声明时此项未测，不自动代表文本布局通过。lineBoxes片段仍需人工核对，不声称自动证明换行、字形或遮挡正确。

关系锚点从SVG getPointAtLength和屏幕变换取得；from/to标注只说明声称的连接对象，还须核几何锚点和图中真实依附。direction支持directed（终点箭头）、reverse（起点箭头）、bidirectional、undirected；SVG line规范成M/L路径。箭头方向从marker实际样式读取，marker定义的形状附在边属性；自绘箭头、连线合并、Canvas图表等需新增适配器，不要捏造同样格式的结果。

当前采集器只对当前视口的普通DOM/SVG进行直接测量。不穷尽光栅字形、闭合Shadow DOM、跨域iframe、Canvas、复杂遮挡/裁切或伪元素独立几何；检测到不支持表面/伪元素会阻断。未检测到也不等于全覆盖。`fontReady`只代表加载状态，实际字体身份仍需浏览器字体记录/可信资产及视觉核对。不要把采集条数当原图完整性证明。

## reference-contract.json 结构（schemaVersion 1）

以下是字段说明而非可直接填空的自动PASS模板；所有期望必须有独立依据。

| 字段 | 必需内容 |
|---|---|
| schemaVersion | 1 |
| referenceImage | sha256、原PNG width/height |
| viewport | CSS width/height、dpr；同PNG尺寸关系需成立 |
| state | 非空对象，精确对应探针读数；期望来源是参考状态 |
| coverage | status: complete或partial、reviewedBy、unresolved数组；partial/未解决阻断 |
| tolerances | geometryPx、maxChangedPixels、pixelThreshold；事先冻结，不能为通过调大 |
| nodes | 非空、唯一ID数组；每项id/parent/type/bbox/confidence/uncertaintyPx/style |
| relations | 无可见关系时空数组；否则每项id/from/to/direction/anchors/path |
| exceptions | 语义/来源冲突账本；非空意味着旧参考尚不能无例外通过 |

bbox为[x,y,width,height] CSS坐标。confidence是measured/estimated/unknown，uncertaintyPx不得大于几何容差；UNKNOWN阻断。纯图像人工估计标estimated，不伪装measured。完整性评审记录另外列出所有主区和未展开族，reviewedBy不是自动认证。

所有节点style为非空可观察期望集；text还须有精确text和fontFamily/fontSize/fontWeight/lineHeight/color。icon/shape有非空attributes（SVG d/viewBox/描边等）；image有真实assetSha256。原样资产与外观未知时明确阻断，不随意替代。字符串、单位、小数位逐节点比较。

实际nodes有同样的测量字段，但不带原图置信度。期望所列样式/属性逐键比较；浏览器附加默认样式不自动当多出的视觉节点。新增/丢失节点、边则双向检查。检查器不判断手写期望是否遗漏了关键样式，仍需区域图像与独立覆盖复核。

实际还需：referenceSha256、inventory.complete/unmapped、capture.fontReady/imagesReady/errors/screenshotSha256/dimensions、pixels.referenceSha256/actualSha256/threshold/changedPixels/mae。采集器会从真实文件生成；不手填零差异、空错误或true来凑通过。

## 判定与输出

- **CAPTURED_NOT_ACCEPTED**：采集脚本执行成功；不是验收。
- **BLOCKED**（检查器退出2）：信息缺失、不支持、未知、覆盖不完整、未决/已确认但仍偏离旧图的例外等；差异可同时列出。
- **FAIL**（退出1）：给定证据可比较但存在内容/结构/几何/像素差。
- **PASS_CONTRACT**（退出0）：给定合同及绑定证据满足。还须独立图像、参考清单完整性和交互检查，不能自动写“完全复刻”。

像素算法：同尺寸RGBA逐通道绝对差，任一通道大于pixelThreshold算一个改变像素；不缩放、裁切、掩码或对齐。MAE是诊断值而非准确率。0阈值/0改变像素只支持这一环境、视口、状态的光栅相同；非零容差不能称0像素差。大背景不得抵消关键局部错误。

脚本不能防止调用者伪造JSON或改原图，因此另存原图/合同/代码/截图哈希和修改日志，并由独立审查验证。未知字体、原图错误和不支持表面不能靠填字段解决。停止时保留实际FAIL/BLOCKED；用户接受单独登记。
采集与检查报告的tool字段记录模块载入时的文件SHA256和Node版本；配置和浏览器版本另有记录。Skill正文与实现代码指纹由调用者在运行入口保存，不用结束时最新版本替代过去证据。旧合同若确有提取错误，须有原图或可信源的独立理由并另存版本，不能为了让脚本通过改合同。

审核生成器只嵌入本地PNG与JSON，离线可用；原图/当前/并排/叠加、搜索点选、显示/隐藏框和CSS原尺寸/适应宽度均可切换。物理PNG尺寸、CSS视口、DPR或哈希不相容时禁叠加，不静默拉伸。原图只用于此审核页，不进入业务页面实现。原始字节和合同状态不因生成报告而改变，输出不能覆盖输入。
核验报告还必须绑定本次reference与actual JSON内容；审核页验证此绑定，缺失或失配时有效状态为BLOCKED并保留原报告供检查。旧报告不能沿用到新截图、合同或采集。JSON内容指纹用于发现意外混用/过期，不防止人为重算指纹后伪造证据；原PNG哈希绑定和独立审查仍不可省略。
报告inputBinding为{algorithm: "sha256-canonical-json-v1", referenceSha256, actualSha256}；两个JSON解析值按对象键排序、数组顺序保留、JSON基本值编码、无空白后取UTF-8 SHA256，不是原文件字节哈希。旧版无绑定报告须重跑检查器，不能手补绑定；参考原文件的冻结哈希另存。

实现依据：[Playwright截图参数](https://playwright.dev/docs/api/class-page#page-screenshot)的动画禁用行为会推进有限动画，不能先量测再让截图改变状态；[Response.body](https://playwright.dev/docs/api/class-response#response-body)用于取得响应字节；[Document.getAnimations](https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations)提供动画对象。以上API本身不保证完整参考提取或复刻成功。

## 测试Skill，而不是仅测试一页

### 局部校准的分区诊断

风险区域先行时，使用`scripts/measure-regions.mjs`比较同坐标的局部，不将画布其他空白算入该区域表现。先从原图冻结`regions.json`，内容为数组，例如`[{"id":"panel","bbox":[100,80,240,160]}]`；坐标是原PNG的整数物理像素，不是CSS像素，DPR转换需有依据。原图与截图尺寸必须相同。

```sh
node scripts/measure-regions.mjs --reference-image /absolute/reference.png --actual-image /absolute/current.png --regions /absolute/regions.json --out /absolute/region-diagnostics.json --sharp-module /absolute/node_modules/sharp
```

工具输出每区改变像素、RGBA平均绝对误差、最大通道差和输入文件摘要。CLI阈值固定0，不缩放、移位配准或掩码；按sRGB RGBA解码并记录只取首帧。范围之外、重复ID、非整数坐标或不同图像尺寸会拒绝。区域可重叠，但不能累加或汇总成准确率。

结果永远是`REGIONAL_DIAGNOSTICS_NOT_ACCEPTANCE`：不验证区域是否遗漏，不校验文本/关系/字体或隐含状态，不改变原有检查器的FAIL/BLOCKED。交付整页仍需全页检查。原图、截图和区域文件的哈希均绑定，输出不得覆盖它们；用于诊断而非证明输入未被人为伪造。依赖与采集器共用sharp，Skill不捆绑依赖。

定向测试为`scripts/tests/measure-regions.test.mjs`，使用与采集测试相同的`R2F_SHARP_MODULE`。核对实际执行的文件清单与预期一致；过滤条件未匹配的测试为NOT_RUN，不能只看命令退出0。

运行最相关Vitest文件：scripts/tests/capture-replica.test.mjs、scripts/tests/verify-replica.test.mjs、scripts/tests/review-replica.test.mjs；采集测试需要浏览器和sharp，支持R2F_PLAYWRIGHT_MODULE/R2F_SHARP_MODULE指定已有模块；审核测试需要jsdom，可用REVIEW_TEST_PACKAGE_ROOT指定现有依赖项目根。依赖测试工具来自调用项目，Skill不改其package.json。

变异应包括：删/换图标，改字/精度/单位，反边/无箭头/错锚点，父区移位，漏子节点/重复ID，面板状态不同，未知字体/未载入资产，改参考哈希，空覆盖或伪全局均值。至少有独立于当前案例的结构；跨项目成功率须留出样本实测，不能从这些合成反例反推。
