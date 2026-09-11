import {createRequire} from 'node:module';
import {auditLayoutRelations} from '../audit-layout-relations.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.R2F_PLAYWRIGHT_MODULE || 'playwright');
let browser,page;
beforeAll(async()=>{browser=await chromium.launch();page=await browser.newPage({viewport:{width:800,height:600}})});
afterAll(async()=>browser?.close());
beforeEach(async()=>{await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}#box{position:absolute;left:100px;top:100px;width:200px;height:120px;border:1px solid;padding:10px}#text{display:block;width:100%;white-space:nowrap;font:20px Arial}#badge{position:absolute;left:90px;top:100px;width:30px;height:30px}#group{position:absolute;left:130px;top:180px;width:80px;height:30px}#label{font-weight:400}</style><div id="box"><span id="text">This very long text is outside its own container</span></div><div id="badge">1</div><div id="group">group</div><b id="label">指标</b>`)});
test('finds actual text overflow even when span box fits; clipped text still fails',async()=>{
 const contract=[{id:'text',kind:'containment',container:'#box',selector:'#text'}];
 let r=await auditLayoutRelations(page,contract);expect(r.results[0]?.status).toBe('FAIL');expect(r.results[0].overflow.right).toBeGreaterThan(0);
 await page.addStyleTag({content:'#text{overflow:hidden}'});r=await auditLayoutRelations(page,contract);expect(r.results[0].status).toBe('FAIL');
 await page.evaluate(()=>document.querySelector('#text').textContent='Short');
 r=await auditLayoutRelations(page,contract);expect(r.results[0].status).toBe('PASS_RELATION');
});
test('separation distinguishes collision, touching, and required spacing',async()=>{
 const c=[{id:'badge',kind:'separation',a:'#badge',b:'#box',minGap:6}];
 let r=await auditLayoutRelations(page,c);expect(r.results[0]?.status).toBe('FAIL');
 await page.addStyleTag({content:'#badge{left:70px}'});r=await auditLayoutRelations(page,c);expect(r.results[0].status).toBe('FAIL');
 await page.addStyleTag({content:'#badge{left:64px}'});r=await auditLayoutRelations(page,c);expect(r.results[0].status).toBe('PASS_RELATION');
});
test('uses whole content group position rather than heading alone',async()=>{
 const c=[{id:'center',kind:'alignment',container:'#box',members:['#group'],axis:'y',targetOffset:0,tolerance:1}];
 let r=await auditLayoutRelations(page,c);expect(r.results[0]?.status).toBe('FAIL');expect(r.results[0].offset).toBe(35);
 await page.addStyleTag({content:'#group{top:145px}'});r=await auditLayoutRelations(page,c);expect(r.results[0].status).toBe('PASS_RELATION');
});
test('records per-fragment CSS weight but does not claim actual bold font',async()=>{
 const c=[{id:'weight',kind:'weight',selector:'#label',expected:700}];
 let r=await auditLayoutRelations(page,c);expect(r.results[0]?.status).toBe('FAIL');
 await page.addStyleTag({content:'#label{font-weight:700}'});r=await auditLayoutRelations(page,c);expect(r.results[0].status).toBe('PASS_RELATION');expect(r.results[0].actualFontVerified).toBe(false);
});
test('missing ambiguous hidden and native text never pass',async()=>{
 await page.setContent('<div id="box"><span hidden id="hide">x</span><i>x</i><i>y</i><input id="input" value="42"></div>');
 const r=await auditLayoutRelations(page,[{id:'missing',kind:'weight',selector:'#absent',expected:400},{id:'many',kind:'weight',selector:'i',expected:400},{id:'hidden',kind:'weight',selector:'#hide',expected:400},{id:'native',kind:'containment',container:'#box',selector:'#input'}]);
 expect(r.results.map(x=>x.status)).toEqual(['MISSING','AMBIGUOUS','HIDDEN','UNSUPPORTED']);
});
test('invalid contracts are rejected before measurement',async()=>{
 await expect(auditLayoutRelations(page,[])).rejects.toThrow('RELATIONS_REQUIRED');
 await expect(auditLayoutRelations(page,[{id:'a',kind:'weight',selector:'#label',expected:700},{id:'a',kind:'weight',selector:'#label',expected:700}])).rejects.toThrow('INVALID_OR_DUPLICATE_ID');
 await expect(auditLayoutRelations(page,[{id:'a',kind:'alignment',container:'#box',members:['#group'],axis:'y'}])).rejects.toThrow('TARGET_OFFSET_REQUIRED');
 await expect(auditLayoutRelations(page,[{id:'a',kind:'separation',a:'#badge',b:'#box',minGap:-1}])).rejects.toThrow('INVALID_minGap');
});
test('explicit asymmetric alignment is allowed and unknown transformations fail closed',async()=>{
 let c=[{id:'offset',kind:'alignment',container:'#box',members:['#group'],axis:'y',targetOffset:35,tolerance:0}];
 expect((await auditLayoutRelations(page,c)).results[0].status).toBe('PASS_RELATION');
 await page.addStyleTag({content:'#group{transform:scale(1.2)}'});
 expect((await auditLayoutRelations(page,c)).results[0].status).toBe('UNSUPPORTED');
});
test('generated content and unrelated containment do not get a clean result',async()=>{
 await page.addStyleTag({content:'#text::after{content:"extra"}'});
 let c=[{id:'pseudo',kind:'containment',container:'#box',selector:'#text'},{id:'unrelated',kind:'containment',container:'#box',selector:'#label'},{id:'nested',kind:'separation',a:'#box',b:'#text'}];
 expect((await auditLayoutRelations(page,c)).results.map(x=>x.status)).toEqual(['UNSUPPORTED','INVALID_RELATION','INVALID_RELATION']);
});
test('display contents visible long text cannot be silently skipped',async()=>{
 await page.setContent('<div id="box" style="width:100px;height:100px"><div id="text">ok<span style="display:contents;white-space:nowrap">This very long text is outside its own container</span></div></div>');
 const r=await auditLayoutRelations(page,[{id:'c',kind:'containment',container:'#box',selector:'#text'}]);
 expect(r.results[0].status).toBe('UNSUPPORTED');
});
test('independent scale cannot bypass the transform guard',async()=>{
 await page.setContent('<div id="box" style="position:absolute;left:200px;top:200px;width:200px;height:100px;padding:40px;scale:2;transform-origin:top left"><span id="text" style="position:relative;left:-10px">Short</span></div>');
 const r=await auditLayoutRelations(page,[{id:'c',kind:'containment',container:'#box',selector:'#text'}]);
 expect(r.results[0].status).toBe('UNSUPPORTED');
});
test('centered content still fails explicit minimum top and bottom breathing room',async()=>{
 await page.addStyleTag({content:'#group{top:111px;height:98px}'});
 const c=[{id:'breathing',kind:'alignment',container:'#box',members:['#group'],axis:'y',targetOffset:0,tolerance:0,minGaps:{top:8,bottom:8}}];
 expect((await auditLayoutRelations(page,c)).results[0].status).toBe('FAIL');
 await page.addStyleTag({content:'#group{top:119px;height:82px}'});
 expect((await auditLayoutRelations(page,c)).results[0].status).toBe('PASS_RELATION');
});
test('reference border inset and CSS content inset are distinct measurement contracts',async()=>{
 await page.addStyleTag({content:'#group{top:107px;height:106px}'});
 const base={id:'box',kind:'alignment',container:'#box',members:['#group'],axis:'y',targetOffset:0,tolerance:0,minGaps:{top:6,bottom:6}};
 expect((await auditLayoutRelations(page,[base])).results[0].status).toBe('FAIL');
 expect((await auditLayoutRelations(page,[{...base,containerBox:'border'}])).results[0].status).toBe('PASS_RELATION');
});
