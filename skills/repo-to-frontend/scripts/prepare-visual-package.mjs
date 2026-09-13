import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRecipes } from './select-visual-recipe.mjs';
import { validateStateSheet } from './state-sheet-contract.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const check = (condition, message) => { if (!condition) throw Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value, label) => check(typeof value === 'string' && value.trim() && !/\{\{[^}]*\}\}|\b(?:TODO|TBD)\b|原文未公开/.test(value), `Unresolved ${label}`);
function ids(items, label) {
  check(Array.isArray(items) && items.length > 0, `Missing ${label}`);
  items.forEach(x => nonempty(x?.id, label));
  check(new Set(items.map(x => x.id)).size === items.length, `Duplicate ${label}`);
}
function textList(value, label) { check(Array.isArray(value) && value.length > 0, `Missing ${label}`); value.forEach(x=>nonempty(x,label)); }
function file(entry, read) {
  check(object(entry) && typeof entry.path === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256 ?? ''), 'Invalid file evidence');
  const bytes = read(entry.path); check(sha(bytes) === entry.sha256, `Stale evidence: ${entry.path}`); return bytes;
}
const json = (entry, read) => JSON.parse(file(entry, read).toString('utf8').replace(/^\uFEFF/, ''));

// Assemble existing facts and design variables; do not discover or invent facts.
export function prepareVisualPackage(input, read = path=>readFileSync(path)) {
  check(object(input) && input.schemaVersion === 1, 'Invalid package input');
  const contract = json(input.contract, read), catalog = json(input.catalog, read);
  check(object(contract) && ['backend-product','visual-only'].includes(contract.scope), 'Invalid content scope');
  check(Array.isArray(contract.sourceEvidence) && contract.sourceEvidence.length > 0, 'Missing source evidence');
  contract.sourceEvidence.forEach(entry=>file(entry,read));
  ids(contract.pages,'contract pages'); ids(input.pages,'design pages');
  check(input.pages.length === contract.pages.length && input.pages.every(p=>contract.pages.some(c=>c.id===p.id)), 'Page coverage mismatch');
  let requirements;
  if (contract.scope === 'backend-product') {
    ids(contract.capabilities,'capabilities');
    requirements=[];
    for(const cap of contract.capabilities) {
      if(cap.presentation === 'internal') {
        nonempty(cap.reason,'internal reason');
        check(Array.isArray(cap.representedBy)&&cap.representedBy.length>0&&cap.representedBy.every(id=>contract.capabilities.some(c=>c.id===id&&c.presentation==='visible')), 'Unrepresented internal capability');
      } else {
        check(cap.presentation==='visible','Invalid capability presentation');ids(cap.requirements,'capability requirements');
        requirements.push(...cap.requirements.map(r=>({...r,capabilityId:cap.id})));
      }
    }
  } else requirements=contract.requirements;
  ids(requirements,'requirements');
  for(const r of requirements) { nonempty(r.expected,'requirement content');check(contract.pages.some(p=>p.id===r.pageId)&&['action','data','state','result'].includes(r.kind),'Invalid requirement'); }
  check(object(input.direction),'Missing direction');nonempty(input.direction.reason,'selection reason');
  const selection=selectRecipes(catalog,input.direction.profile);
  const recipe=selection.candidates.find(r=>r.id===input.direction.recipeId);
  if(selection.status==='CANDIDATES') check(!!recipe,'Recipe does not match profile');
  else check(input.direction.recipeId===null,'No recipe allowed for unmatched or locked reference');
  check(object(input.style),'Missing style');
  for(const key of ['typography','palette','spacing','components'])nonempty(input.style[key],key);
  check(Object.keys(input.style).every(key=>['typography','palette','spacing','components'].includes(key)),'Unknown style variable');
  const styleInstructions=Object.entries(input.style).map(([k,v])=>`${k}: ${v}`).join('\n');
  const pages=input.pages.map(page=>{
    nonempty(page.layout,'layout');textList(page.text,'exact text');
    check(object(page.viewport)&&['width','height'].every(k=>Number.isInteger(page.viewport[k])&&page.viewport[k]>0),'Invalid viewport');
    check(Array.isArray(page.references)&&Array.isArray(page.assets),'Missing reference/asset lists');
    page.references.forEach(entry=>file(entry,read));
    if(selection.status==='REFERENCE_LOCKED'||page.repairInstructions!==undefined)check(page.references.length>0,'Locked/edit page requires reference image');
    if(page.repairInstructions!==undefined)nonempty(page.repairInstructions,'repair instructions');
    for(const asset of page.assets){file(asset.file,read);file(asset.provenance,read);nonempty(asset.usage,'asset usage');}
    const reqs=requirements.filter(r=>r.pageId===page.id);check(reqs.length>0,'Page without requirements');
    const declaration=contract.pages.find(p=>p.id===page.id);
    validateStateSheet(declaration, (code,id)=>{throw Error(`${code}: ${id}`);}, reqs.map(r=>r.id));
    if(declaration.kind==='state-sheet') check(page.viewport.width===declaration.imageSize.width&&page.viewport.height===declaration.imageSize.height,'State sheet viewport must match imageSize');
    const sections=[
      `生成一张${page.viewport.width}×${page.viewport.height}平面界面/图文设计图。只输出本图，业务依据仅来自下列合同。`,
      `【共享视觉约定：布局指令，不是业务正文】\n${styleInstructions}\n本图布局：${page.layout}`,
      ...(recipe?[`【可选结构建议：不能覆盖事实、状态或精确文字】\n${recipe.layout.join('\n')}\n${recipe.avoid.join('\n')}`]:[]),
      `【完整内容及状态合同：编号不画入业务界面；除明确的可见文字外作为设计约束】\n${reqs.map(r=>`[${r.id}; ${r.kind}] ${r.expected}`).join('\n')}`,
      `【允许显示的准确业务文字】\n${page.text.map(t=>JSON.stringify(t)).join('\n')}\n不得自行补写未提供的业务条件、宣传数字或结果解释。`,
      ...(declaration.kind==='state-sheet'?[`【状态片段声明：状态互斥，外部编号不属于产品】\n${JSON.stringify(declaration)}`]:[]),
      ...(page.assets.length?[`【已提供素材的使用范围】\n${page.assets.map(a=>a.usage).join('\n')}`]:[]),
      ...(page.references.length?[`使用随调用提供的参考图保持正确内容与视觉体系；实际引用列表在包的referenceInputs字段，文字提及不代表已传图。`]:[]),
      ...(page.repairInstructions?[`【本轮局部修正；保持其余正确内容】\n${page.repairInstructions}`]:[]),
      '不得删减要求来套模块数量；不添加合同没有的控件、客户证言或素材。文字/单位/缺失值/关系方向必须准确。多状态共用上述视觉约定。生成后仍需实际逐图核对，提示词完整不证明图像正确。',
    ];
    const prompt=sections.join('\n\n');
    return {id:page.id,viewport:structuredClone(page.viewport),requirementIds:reqs.map(r=>r.id),prompt,promptSha256:sha(prompt),referenceInputs:structuredClone(page.references),assets:structuredClone(page.assets)};
  });
  return {schemaVersion:1,status:'PREPARED',scope:contract.scope,inputDigest:sha(JSON.stringify(input)),contractSha256:input.contract.sha256,catalogSha256:input.catalog.sha256,styleDigest:sha(styleInstructions),styleInstructions,selection:{status:selection.status,recipeId:recipe?.id??null,catalogContentSha256:selection.catalogSha256,reason:input.direction.reason},pages,limitation:'Prepared prompts are not image review, user approval, tool-call evidence or frontend completion.'};
}

export function checkVisualPackage(input, saved, read = path=>readFileSync(path)) {
  try { const current=prepareVisualPackage(input,read);return {status:JSON.stringify(current)===JSON.stringify(saved)?'CURRENT':'STALE',inputDigest:current.inputDigest}; }
  catch(error) {return {status:'BLOCKED',reason:error.message};}
}

// Evidence adapter shared by image review and delivery aggregation.
export function readVisualPackage(evidence, read = path=>readFileSync(path)) {
  const input=json(evidence?.input,read), output=json(evidence?.output,read);
  check(checkVisualPackage(input,output,read).status==='CURRENT','Visual package is not current');
  return {input,output};
}

// Both content scopes bind actual request strings and ordered file references.
export function validateGenerationRequest(planned, generation, read = path=>readFileSync(path)) {
  check(object(planned),'Missing planned page');
  const request=json(generation?.request,read),expected=[...planned.referenceInputs,...planned.assets.map(a=>a.file)];
  nonempty(request.tool,'generation tool');
  check(request.prompt===planned.prompt,'Generation prompt mismatch');
  check(Array.isArray(request.referenceInputs)&&request.referenceInputs.length===expected.length,'Generation references mismatch');
  request.referenceInputs.forEach((entry,i)=>{file(entry,read);check(entry.sha256===expected[i].sha256,'Generation reference mismatch');});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2),verify=args[0]==='--check';if(verify)args.shift();
    check(args.length===2&&resolve(args[0])!==resolve(args[1]),'Usage: prepare-visual-package.mjs [--check] input.json package.json');
    const input=JSON.parse(readFileSync(args[0],'utf8').replace(/^\uFEFF/,''));
    const result=verify?checkVisualPackage(input,JSON.parse(readFileSync(args[1],'utf8'))):prepareVisualPackage(input);
    if(!verify)writeFileSync(args[1],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(result.status);process.exitCode=verify&&result.status!=='CURRENT'?2:0;
  }catch(error){console.error(error.message);process.exitCode=2;}
}
