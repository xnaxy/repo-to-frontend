# 公开图片、图标与品牌标志

先问素材承担什么任务：机制关系用证据驱动的DOM/SVG；通用动作用图标；真实品牌用有来源的标志；摄影/插画只补充确有需要的视觉。图库图片不是仓库事实证据。不得为显得高级而加入无关照片或自制近似商标。

## 按用途路由（2026-09-08核实；采用时复查）

| 类型 | 优先来源 | 采用条件 |
|---|---|---|
| 通用界面图标 | 已有统一库 → [Lucide](https://lucide.dev/license) → [Iconify](https://iconify.design/docs/api/)内一个许可清晰的集合 | Lucide保留ISC及适用Feather MIT声明；Iconify各图标集独立许可。用固定版本、按需本地打包，不混合画风。无需专用素材API key。 |
| 品牌标志 | 用户/仓库适用资产 → 品牌官方媒体包 → [Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md) | 项目CC0不代表每个品牌图标都CC0。复查单图source/license/guidelines与用途；缺字段=未知。商标权、颜色比例/留白、背书限制仍独立。不能确认则用品牌名称文字。 |
| 摄影 | 适用本地资产 → [Pexels](https://www.pexels.com/terms-of-service/)小量选图 → 条件符合的[Unsplash](https://unsplash.com/api-terms) | Pexels API需key；禁止未经许可系统/大批量复制和独立素材式分发。普通许可与API条件分别核实。Unsplash API必须返回URL热链、署名、上报选用/下载事件；其非自动化体验要求使其不适合作为默认全自动采图路径。 |
| 插画/具体对象图片 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) → [Openverse](https://docs.openverse.org/terms_of_service.html)检索后回原站 | Commons逐文件核实作者/CC许可/修改和相同方式共享等条件。Openverse是索引不是授权方，不抓取catalog；筛选结果不免除原站单件复核。NC/ND并非任意商用/修改。 |

公开访问不等于可商业使用、批量同步或自由再分发。照片中的肖像、品牌、艺术作品等第三方权利另查；Commons外的Wikipedia fair-use图片不能按Commons规则采用。API密钥不进入前端、素材清单或日志，不注册账号或借用他人密钥绕过缺口。

离线交付只选择许可允许本地保存的素材；不能为了统一资产目录下载Unsplash API图片再自托管。按[API文档](https://unsplash.com/documentation)与[体验规范](https://help.unsplash.com/en/articles/2511256-guideline-high-quality-authentic-experiences)核实具体流程资格，不以有key替代条件检查。外链加载失败时用已许可本地替代或文字，不伪造网址。

## 每项目的素材记录

建立 `assets-manifest.json`，记录实际选用而不是镜像整个素材库：

```json
{
  "id": "asset-id",
  "kind": "photo|illustration|ui-icon|brand-logo|font",
  "purpose": "具体页面位置和用途",
  "provider": "实际来源",
  "sourcePageUrl": "实际单件来源页",
  "author": "实际作者或null",
  "version": "固定软件包版本或null",
  "license": {"name": "实际许可", "url": "原始许可页", "noticeFile": "本地声明或null", "checkedAt": "日期", "decision": "eligible-for-stated-use|needs-review|excluded"},
  "attribution": {"text": "要求的署名或null", "placement": "实际位置或null"},
  "brandGuidelinesUrl": null,
  "thirdPartyRights": "not-relevant|needs-review|evidence-recorded",
  "delivery": {"mode": "local-file|package-import|api-hotlink", "path": null, "url": null, "sha256": null, "downloadTrackingCompletedAt": null},
  "presentation": {"alt": "按实际用途", "width": null, "height": null, "modifications": null}
}
```

未知填null，不编作者/许可；根据素材及用途核实decision，不能按provider自动批准。需公开署名时清单不能代替页面署名。实际本地素材核验MIME/尺寸/哈希并等待图片解码；SVG做安全检查，不注入未知脚本。只提取必要图标而非加载整库。字体也须记录许可与浏览器真实加载，不能仅看CSS声明。
