import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.R2F_PLAYWRIGHT_MODULE||'playwright');
let browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true})});
afterAll(async()=>{await browser?.close()});
async function audit(page,probes){expect(fs.existsSync(new URL('../audit-fonts.mjs',import.meta.url))).toBe(true);return (await import('../audit-fonts.mjs')).auditRenderedFonts(page,probes)}
async function fixture(html){const p=await browser.newPage();await p.setContent(html);return p}
it('distinguishes a nonexistent CSS family from the font actually rendering glyphs',async()=>{
 const p=await fixture('<p id="x" style="font-family:R2F_NONEXISTENT_FONT_2026,monospace">12.75</p>');
 expect(await p.evaluate(()=>document.fonts.check('16px R2F_NONEXISTENT_FONT_2026'))).toBe(true);
 const a=await audit(p,[{id:'number',selector:'#x'}]);
 expect(a.status).toBe('FONT_OBSERVATIONS_NOT_ACCEPTANCE');
 expect(a.probes[0].runs[0].declaredFamily).toContain('R2F_NONEXISTENT');
 expect(a.probes[0].runs[0].fonts.length).toBeGreaterThan(0);
 expect(a.probes[0].runs[0].fonts.every(f=>f.familyName!=='R2F_NONEXISTENT_FONT_2026'&&f.glyphCount>0)).toBe(true);
 await p.close();
});
it('records nested text owners separately so a parent does not stand in for its subtitle',async()=>{
 const p=await fixture('<p id="x" style="font-family:serif">Revenue <small style="font-family:monospace">12.00</small></p>');
 const a=await audit(p,[{id:'title',selector:'#x'}]);
 expect(a.probes[0].runs.map(r=>r.text.trim())).toEqual(['Revenue','12.00']);
 expect(a.probes[0].runs[0].evidenceScope).toBe('SUBTREE_NOT_DIRECT_TEXT');
 expect(a.probes[0].runs[1].evidenceScope).toBe('TEXT_LEAF');
 expect(a.probes[0].runs[1].fonts.length).toBeGreaterThan(0);
 expect(a.probes[0].runs[0].declaredFamily).not.toBe(a.probes[0].runs[1].declaredFamily);
 await p.close();
});
it('reports absent and ambiguous selectors rather than auditing an arbitrary node',async()=>{
 const p=await fixture('<p>A</p><p>B</p>');const a=await audit(p,[{id:'absent',selector:'#no'},{id:'many',selector:'p'}]);
 expect(a.probes.map(x=>x.status)).toEqual(['MISSING','AMBIGUOUS']);await p.close();
});
it('uses CDP evidence for native input text instead of its empty textContent',async()=>{
 const p=await fixture('<input id="x" value="80.000000">');const a=await audit(p,[{id:'input',selector:'#x'}]);
 expect(a.probes[0].status).toBe('OBSERVED');
 expect(a.probes[0].runs[0].text).toBe('80.000000');
 expect(a.probes[0].runs[0].evidenceScope).toBe('NATIVE_CONTROL_CDP');
 expect(a.probes[0].runs[0].fonts.some(f=>f.glyphCount>0)).toBe(true);await p.close();
});
it('excludes hidden text and records rendered SVG text',async()=>{
 const p=await fixture('<div id="x"><span style="display:none">hidden</span><svg width="100" height="40"><text x="2" y="25">42</text></svg></div>');
 const a=await audit(p,[{id:'svg',selector:'#x'}]);expect(a.probes[0].runs.map(r=>r.text)).toEqual(['42']);await p.close();
});
it('does not mutate the page and labels generated content unsupported',async()=>{
 const p=await fixture('<style>#x::before{content:"prefix"}</style><p id="x">value</p>');const before=await p.content();
 const a=await audit(p,[{id:'pseudo',selector:'#x'}]);expect(a.probes[0].unsupported.some(x=>x.reason==='generated-content')).toBe(true);expect(await p.content()).toBe(before);await p.close();
});
it('rejects duplicate probe identity and invalid selectors are structured errors',async()=>{
 const p=await fixture('<p>x</p>');await expect(audit(p,[{id:'x',selector:'p'},{id:'x',selector:'p'}])).rejects.toThrow('DUPLICATE_PROBE');
 const a=await audit(p,[{id:'bad',selector:'['}]);expect(a.probes[0].status).toBe('ERROR');await p.close();
});
it('does not silently omit visible text owned by display contents',async()=>{
 const p=await fixture('<div id="x"><span>Visible sibling</span><span style="display:contents">Visible contents text</span></div>');
 const a=await audit(p,[{id:'contents',selector:'#x'}]);
 expect(a.probes[0].status).toBe('PARTIAL');
 expect(a.probes[0].unsupported.some(x=>x.reason==='display-contents-text')).toBe(true);
 await p.close();
});
it('reports unavailable CDP without substituting declared CSS as evidence',async()=>{
 const a=await audit({url:()=> 'about:blank',context:()=>({newCDPSession:async()=>{throw Error('CDP unsupported')}})},[{id:'x',selector:'p'}]);
 expect(a.status).toBe('UNAVAILABLE');expect(a.probes).toEqual([]);
});
it('keeps empty, placeholder and password controls explicitly unsupported',async()=>{
 const p=await fixture('<div id="x"><input placeholder="Example"><input type="password" value="PRIVATE_TEST_VALUE"></div>');
 const a=await audit(p,[{id:'controls',selector:'#x'}]);
 expect(a.probes[0].status).toBe('PARTIAL');expect(a.probes[0].unsupported).toHaveLength(2);
 expect(JSON.stringify(a)).not.toContain('PRIVATE_TEST_VALUE');await p.close();
});
