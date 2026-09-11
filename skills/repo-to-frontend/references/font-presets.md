# 默认字体、字号与安装

本Skill提供用户选择的中文字体配置：黑体SimHei、楷体KaiTi、微软雅黑Microsoft YaHei、宋体SimSun；未另指定时中文默认微软雅黑，英文和数字统一Times New Roman。严格复刻若用户明确指定这套规范，记录为字体覆盖例外；否则先遵循参考合同，不以默认规范偷偷改原图。新用户的明确字体选择优先。

CSS可采用 `font-family: "Times New Roman", "Microsoft YaHei", sans-serif`，拉丁字体在前使英文数字优先匹配，中文使用后续字体。切换中文配置只改变第二项；表单控件显式继承font，SVG text也应一致。不要逐字符切span；只有需要单独字号/字重的连续片段才拆分。希腊文、数学符号、中文标点及缺字回退另验，不保证每个Unicode字符都由Times New Roman支持。

四种中文配置是选择项，不是同时使用四种字体的要求。不要以微软雅黑替代后仍标“黑体已使用”。依照font-and-raster-calibration.md用真实字符及CDP分别验证普通与粗体、中文与英数，字体不可用时明确MISSING，不能只靠document.fonts.check()。

可复制`assets/font-presets.css`到页面资源目录并引入，在页面根元素使用`class="r2f-fonts" data-r2f-cjk="yahei"`；其他值为`heiti`、`kaiti`、`songti`。该资源只提供字体族配置，不改变字号、布局或全页字重；已有规则显式覆盖font-family时需检查层叠，不能认为引入文件就全部生效。它不包含字体文件，也不自动安装或联网。

## 安装与携带

1. Windows先在“设置 → 个性化 → 字体”查询；也可只读系统/当前用户Fonts注册表确认登记，但登记不是浏览器实际采用证明。
2. 缺少字体时，通过Microsoft Store、Windows对应语言的可选字体功能或权利人授权字体文件获取。对合法获得的字体文件，在字体设置页拖入安装，或使用系统字体预览安装功能；安装后重启需要的浏览器进程再测。不要从任意下载站抓取同名字体，不修改系统全局字体替换表。
3. 这些Windows字体不能因为本机有文件就复制进Skill或网页分发。默认包提供配置与检查方法，不附字体二进制。跨系统要么用户安装其合法许可字体，要么在用户允许时使用明确标注的替代；Times New Roman缺失且用户要求固定时，保持未满足状态，不把serif回退叫作同款。
4. 只有获得允许网页嵌入的许可才使用项目fonts目录与@font-face，固定文件哈希、weight/style、来源与许可。安装在Codex主机不等于查看网页的另一台设备也有字体。交付说明运行条件。

## 字号不需要安装

字号是CSS尺寸，不是字体资源。参考图按CSS像素校准字号、行高和基线；若用户给pt，CSS中1pt=96/72px，但中文“小四/五号”等习惯名需明确对应pt后再转换。不要把OCR字框高度直接当font-size。以页面角色定义可调字号变量，不规定任意图片都用同一套大小；最终按原图和用户阅读要求验证。

官方依据：[Windows字体管理](https://support.microsoft.com/en-us/windows/experience/personalization/manage-fonts-in-windows)、[Windows字体再分发说明](https://learn.microsoft.com/en-us/typography/fonts/font-faq)。
