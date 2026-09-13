import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareVisualPackage, checkVisualPackage } from '../prepare-visual-package.mjs';
const sha = x => createHash('sha256').update(x).digest('hex');
function fixture() {
  const files = new Map();
  const put = (path, value) => { const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)); files.set(path, bytes); return {path,sha256:sha(bytes)}; };
  const contract={scope:'backend-product',sourceEvidence:[put('source','verified fixture')],pages:[{id:'main'},{id:'empty'}],capabilities:[{id:'B1',presentation:'visible',requirements:Array.from({length:12},(_,i)=>({id:'R'+i,pageId:i<10?'main':'empty',kind:'data',expected:'字段 '+i+'：单位m³；缺失不能补零'}))}]};
  const input={schemaVersion:1,contract:put('contract',contract),catalog:put('catalog',readFileSync(new URL('../../references/visual-recipes.json',import.meta.url),'utf8')),direction:{profile:{artifact:'ui',task:'compare',density:'dense'},recipeId:'analytical-workbench',reason:'compare values'},style:{typography:'中文无衬线；正文20px',palette:'white background; blue data',spacing:'24px gutters',components:'same table and chart frame'},pages:contract.pages.map(p=>({id:p.id,viewport:{width:1536,height:1024},layout:'图表在上表格在下',text:['合成数据','同比：暂无数据'],references:[],assets:[]}))};
  return {input,contract,put,files,read:path=>{if(!files.has(path))throw Error('missing');return files.get(path);}};
}
describe('fact-bound visual package',()=>{
  it.each(['valid','empty','dimensions','coverage','target'])('validates state-sheet %s before generation',variant=>{
    const f=fixture(),page=f.contract.pages[0];Object.assign(page,{kind:'state-sheet',imageSize:{width:1536,height:1024},fragments:[{id:'fragment',sourceRect:{x:0,y:0,width:1536,height:1024},target:{pageId:'actual',stateId:'loaded',viewport:{width:1536,height:1024,deviceScaleFactor:1}},regions:['main'],requirementIds:f.contract.capabilities[0].requirements.filter(r=>r.pageId===page.id).map(r=>r.id)}]});
    if(variant==='empty')page.fragments=[];if(variant==='dimensions')f.input.pages[0].viewport.width=800;if(variant==='coverage')page.fragments[0].requirementIds.pop();if(variant==='target')page.fragments[0].target.pageId=page.id;
    f.input.contract=f.put('contract',f.contract);if(variant==='valid')expect(prepareVisualPackage(f.input,f.read).status).toBe('PREPARED');else expect(()=>prepareVisualPackage(f.input,f.read)).toThrow();
  });
  it('carries all twelve requirements, units and missing-value rules into exact per-page prompts',()=>{
    const f=fixture(),p=prepareVisualPackage(f.input,f.read);
    expect(p.status).toBe('PREPARED');expect(p.pages.flatMap(x=>x.requirementIds)).toHaveLength(12);
    for(const r of f.contract.capabilities[0].requirements) expect(p.pages.find(p=>p.id===r.pageId).prompt).toContain(r.expected);
    expect(p.pages.every(p=>p.prompt.includes('同比：暂无数据')&&p.prompt.includes(f.input.style.palette))).toBe(true);
    expect(p.pages[0].prompt).not.toContain('verified fixture');
  });
  it('does not invent business copy from a layout and keeps input immutable',()=>{
    const f=fixture(),before=JSON.stringify(f.input),p=prepareVisualPackage(f.input,f.read);
    expect(p.pages[0].prompt).not.toContain('10M+');expect(JSON.stringify(f.input)).toBe(before);
  });
  it.each(['missing','extra','duplicate'])('rejects %s page coverage',kind=>{
    const f=fixture();if(kind==='missing')f.input.pages.pop();else f.input.pages.push({...f.input.pages[0],id:kind==='extra'?'other':'main'});
    expect(()=>prepareVisualPackage(f.input,f.read)).toThrow();
  });
  it('rejects missing requirements and duplicated IDs',()=>{
    for(const mutate of [c=>c.capabilities[0].requirements=[],c=>c.capabilities[0].requirements[1].id='R0',c=>c.capabilities[0].requirements[0].pageId='other']){
      const f=fixture();mutate(f.contract);f.input.contract=f.put('contract',f.contract);expect(()=>prepareVisualPackage(f.input,f.read)).toThrow();
    }
  });
  it('requires resolved style variables, valid viewport and an explicit selection reason',()=>{
    for(const mutate of [i=>i.style.palette='',i=>i.style.typography='{{font}}',i=>i.pages[0].viewport.width=-1,i=>i.direction.reason='',i=>i.pages[0].text=null]){
      const f=fixture();mutate(f.input);expect(()=>prepareVisualPackage(f.input,f.read)).toThrow();
    }
  });
  it('allows NO_MATCH without fallback, rejects a mismatched recipe',()=>{
    const f=fixture();f.input.direction.profile={artifact:'brand-board',task:'compare',density:'dense'};f.input.direction.recipeId=null;
    expect(prepareVisualPackage(f.input,f.read).selection.status).toBe('NO_MATCH');
    f.input.direction.recipeId='brand-system';expect(()=>prepareVisualPackage(f.input,f.read)).toThrow();
  });
  it('requires actual reference evidence when locked; never applies a new recipe',()=>{
    const f=fixture();f.input.direction={profile:{referenceLocked:true},recipeId:null,reason:'existing reference'};
    expect(()=>prepareVisualPackage(f.input,f.read)).toThrow();
    f.input.pages.forEach(p=>p.references=[f.put(p.id+'.png','image')]);
    const p=prepareVisualPackage(f.input,f.read);expect(p.selection.status).toBe('REFERENCE_LOCKED');expect(p.pages[0].referenceInputs).toHaveLength(1);
  });
  it('rejects absent asset provenance and binds actual assets',()=>{
    const f=fixture();f.input.pages[0].assets=[{file:f.put('asset','bytes'),usage:'illustration'}];expect(()=>prepareVisualPackage(f.input,f.read)).toThrow();
    f.input.pages[0].assets[0].provenance=f.put('rights','user supplied');const p=prepareVisualPackage(f.input,f.read);expect(checkVisualPackage(f.input,p,f.read).status).toBe('CURRENT');
    f.put('asset','changed');expect(checkVisualPackage(f.input,p,f.read).status).toBe('BLOCKED');
  });
  it('invalidates changed facts, prompt, layout, shared style or catalog snapshot',()=>{
    for(const change of ['source','prompt','style','layout','catalog']){
      const f=fixture(),p=prepareVisualPackage(f.input,f.read);
      if(change==='source'||change==='catalog')f.put(change,'changed');
      if(change==='prompt')p.pages[0].prompt+=' invented action';
      if(change==='style')f.input.style.palette='red';
      if(change==='layout')f.input.pages[0].layout='other';
      expect(checkVisualPackage(f.input,p,f.read).status).not.toBe('CURRENT');
    }
  });
  it('supports standalone content without fabricating backend capabilities',()=>{
    const f=fixture();f.contract.scope='visual-only';f.contract.requirements=f.contract.capabilities[0].requirements;delete f.contract.capabilities;f.input.contract=f.put('contract',f.contract);
    const p=prepareVisualPackage(f.input,f.read);expect(p.scope).toBe('visual-only');expect(p.pages.flatMap(x=>x.requirementIds)).toHaveLength(12);
  });
});
