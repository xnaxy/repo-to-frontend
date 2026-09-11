/** Read Chromium's rendered font evidence. Does not infer the reference font. */
export async function auditRenderedFonts(page, probes) {
 if (!Array.isArray(probes) || !probes.length) throw Error('PROBES_REQUIRED');
 const ids = new Set();
 for (const p of probes) {
  if (!p || typeof p.id !== 'string' || !p.id || typeof p.selector !== 'string' || !p.selector) throw Error('INVALID_PROBE');
  if (ids.has(p.id)) throw Error('DUPLICATE_PROBE:' + p.id);
  ids.add(p.id);
 }
 const report = {status:'FONT_OBSERVATIONS_NOT_ACCEPTANCE', url:page.url(), probes:[],
  scope:'main-document light DOM; CDP node/subtree font usage, not per-character attribution',
  limitations:['Does not identify reference-image fonts or font-file bytes.', 'Generated content, unsupported controls, shadow DOM and frames require separate evidence.', 'Font glyph counts are not character counts; do not sum overlapping probes. Native-control font evidence is not a text-layout measurement.']};
 let client;
 try {
  client = await page.context().newCDPSession(page);
  await client.send('DOM.enable'); await client.send('CSS.enable');
  await page.evaluate(async () => { await document.fonts.ready; });
  report.environment = await page.evaluate(() => ({userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],fontSetStatus:document.fonts.status}));
  const {root} = await client.send('DOM.getDocument');
  for (const probe of probes) {
   const result = {...probe, status:'OBSERVED', runs:[], unsupported:[]}; report.probes.push(result);
   try {
    const {nodeIds} = await client.send('DOM.querySelectorAll',{nodeId:root.nodeId,selector:probe.selector});
    if (nodeIds.length !== 1) {result.status=nodeIds.length?'AMBIGUOUS':'MISSING';continue;}
    const meta = await page.evaluate(selector => {
     const target=document.querySelector(selector);
     return [target,...target.querySelectorAll('*')].map(el=>{
      const style=getComputedStyle(el),box=el.getBoundingClientRect();
      const textRange=document.createRange();textRange.selectNodeContents(el);
      const contentsText=style.display==='contents'&&Array.from(textRange.getClientRects()).some(r=>r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight);
      const native=['INPUT','SELECT','TEXTAREA'].includes(el.tagName);
      const readableControl=el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&['text','search','email','url','tel','number'].includes(el.type));
      const controlText=readableControl?el.value:'';
      return {tag:el.tagName,id:el.getAttribute('data-r2f-id')||el.id||null,
       text:native?controlText:Array.from(el.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(''),hasTextDescendants:Array.from(el.children).some(c=>c.textContent.trim()),
       declaredFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,fontStretch:style.fontStretch,fontVariationSettings:style.fontVariationSettings,
       visible:el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&box.right>0&&box.bottom>0&&box.left<innerWidth&&box.top<innerHeight,
       contentsText,native,unsupportedControl:native&&(!readableControl||!controlText),shadow:!!el.shadowRoot,frame:el.tagName==='IFRAME',
       generated:['::before','::after'].some(p=>{const c=getComputedStyle(el,p).content;return c&&c!=='none'&&c!=='normal'&&c!=='""';})};
     });
    },probe.selector);
    const descendants = await client.send('DOM.querySelectorAll',{nodeId:nodeIds[0],selector:'*'});
    const allIds=[nodeIds[0],...descendants.nodeIds];
    if(allIds.length!==meta.length) throw Error('DOM_CHANGED_DURING_AUDIT');
    for(let i=0;i<meta.length;i++) {
     const m=meta[i];
     if(m.contentsText&&m.text.trim()){result.unsupported.push({index:i,id:m.id,reason:'display-contents-text'});continue;}
     if(!m.visible)continue;
     for(const [flag,reason] of [['unsupportedControl','unsupported-control-or-empty-value'],['generated','generated-content'],['shadow','shadow-dom'],['frame','frame-document']])
      if(m[flag])result.unsupported.push({index:i,id:m.id,reason});
     if(m.unsupportedControl||!m.text.trim())continue;
     const {fonts}=await client.send('CSS.getPlatformFontsForNode',{nodeId:allIds[i]});
     result.runs.push({index:i,id:m.id,tag:m.tag,text:m.text,evidenceScope:m.native?'NATIVE_CONTROL_CDP':m.hasTextDescendants?'SUBTREE_NOT_DIRECT_TEXT':'TEXT_LEAF',declaredFamily:m.declaredFamily,fontSize:m.fontSize,fontWeight:m.fontWeight,fontStretch:m.fontStretch,fontVariationSettings:m.fontVariationSettings,fonts,status:fonts.some(f=>f.glyphCount>0)?'OBSERVED':'UNKNOWN'});
    }
    if(result.unsupported.length||!result.runs.length||result.runs.some(r=>r.status==='UNKNOWN'))result.status='PARTIAL';
   } catch(e) {result.status='ERROR';result.error=String(e.message||e);}
  }
 } catch(e) {report.status='UNAVAILABLE';report.error=String(e.message||e);}
 finally {if(client)await client.detach().catch(()=>{});}
 return report;
}
