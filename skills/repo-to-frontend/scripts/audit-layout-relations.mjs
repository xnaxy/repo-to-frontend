/** Read-only main-document probes; supplied relations are not a complete visual contract. */
export async function auditLayoutRelations(page, contract) {
 if(!Array.isArray(contract)||!contract.length)throw Error('RELATIONS_REQUIRED');
 const ids=new Set();
 for(const p of contract){
  if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id))throw Error('INVALID_OR_DUPLICATE_ID');
  ids.add(p.id);
  if(!['containment','separation','alignment','weight'].includes(p.kind))throw Error('INVALID_KIND');
  const names=p.kind==='separation'?['a','b']:p.kind==='alignment'?['container']:p.kind==='weight'?['selector']:['container','selector'];
  if(names.some(k=>typeof p[k]!=='string'||!p[k]))throw Error('SELECTOR_REQUIRED');
  if(p.kind==='alignment'&&(!['x','y'].includes(p.axis)||!Array.isArray(p.members)||!p.members.length||p.members.some(s=>typeof s!=='string'||!s)))throw Error('INVALID_ALIGNMENT');
  for(const k of ['tolerance','minGap'])if(p[k]!==undefined&&(!Number.isFinite(p[k])||p[k]<0))throw Error('INVALID_'+k);
  if(p.kind==='alignment'&&!Number.isFinite(p.targetOffset))throw Error('TARGET_OFFSET_REQUIRED');
  if(p.containerBox!==undefined&&!['content','border'].includes(p.containerBox))throw Error('INVALID_CONTAINER_BOX');
  if(p.minGaps!==undefined&&(p.kind!=='alignment'||!p.minGaps||typeof p.minGaps!=='object'||Array.isArray(p.minGaps)||Object.entries(p.minGaps).some(([k,v])=>!['top','right','bottom','left'].includes(k)||!Number.isFinite(v)||v<0)))throw Error('INVALID_MIN_GAPS');
  if(p.kind==='weight'&&(!Number.isFinite(p.expected)||p.expected<1||p.expected>1000))throw Error('INVALID_WEIGHT');
 }
 await page.evaluate(async()=>{await document.fonts.ready});
 const results=await page.evaluate(probes=>{
  const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
  const reject=(status,reason)=>{throw Object.assign(new Error(reason),{status})};
  function supportedGeometry(e){
   for(let a=e;a;a=a.parentElement){const s=getComputedStyle(a);if(['transform','scale','rotate','translate'].some(k=>s[k]&&s[k]!=='none')||(s.zoom&&s.zoom!=='1'&&s.zoom!=='normal'))reject('UNSUPPORTED','transformed-or-zoomed-layout');}
  }
  function one(selector){
   const matches=document.querySelectorAll(selector);
   if(matches.length!==1)reject(matches.length?'AMBIGUOUS':'MISSING',selector);
   const e=matches[0],b=e.getBoundingClientRect();
   if(!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||!b.width||!b.height)reject('HIDDEN',selector);
   supportedGeometry(e);
   return e;
  }
  function inner(e){const b=rect(e.getBoundingClientRect()),s=getComputedStyle(e);b.left+=parseFloat(s.borderLeftWidth)+parseFloat(s.paddingLeft);b.right-=parseFloat(s.borderRightWidth)+parseFloat(s.paddingRight);b.top+=parseFloat(s.borderTopWidth)+parseFloat(s.paddingTop);b.bottom-=parseFloat(s.borderBottomWidth)+parseFloat(s.paddingBottom);b.width=b.right-b.left;b.height=b.bottom-b.top;return b;}
  function textRects(e){
   if(e.matches('input,textarea,select,svg')||e.querySelector('input,textarea,select,svg,iframe')||e.shadowRoot)reject('UNSUPPORTED','native-svg-shadow-or-frame');
   const elements=[e,...e.querySelectorAll('*')];
   for(const el of elements){supportedGeometry(el);if(getComputedStyle(el).display==='contents')reject('UNSUPPORTED','display-contents');}
   if(elements.some(el=>el.shadowRoot||['::before','::after'].some(p=>{const c=getComputedStyle(el,p).content;return c&&!['none','normal','""'].includes(c)})))reject('UNSUPPORTED','generated-or-shadow-content');
   const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),out=[];
   for(let n=walker.nextNode();n;n=walker.nextNode()){
    if(!n.textContent.trim())continue;
    const el=n.parentElement;if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
    const range=document.createRange();range.selectNodeContents(n);out.push(...Array.from(range.getClientRects()).filter(r=>r.width&&r.height).map(rect));
   }
   if(!out.length)reject('NO_TEXT','no-observable-text');return out;
  }
  return probes.map(p=>{try{
   const r={id:p.id,kind:p.kind,status:'PASS_RELATION'},t=p.tolerance??0;
   if(p.kind==='containment'){
    const container=one(p.container),e=one(p.selector);if(!container.contains(e))reject('INVALID_RELATION','text-not-descendant');
    r.containerBox=p.containerBox??'content';r.container=r.containerBox==='border'?rect(container.getBoundingClientRect()):inner(container);r.fragments=textRects(e);
    r.overflow={left:Math.max(0,...r.fragments.map(b=>r.container.left-b.left)),right:Math.max(0,...r.fragments.map(b=>b.right-r.container.right)),top:Math.max(0,...r.fragments.map(b=>r.container.top-b.top)),bottom:Math.max(0,...r.fragments.map(b=>b.bottom-r.container.bottom))};
    if(Object.values(r.overflow).some(v=>v>t))r.status='FAIL';
   }else if(p.kind==='separation'){
    const a=one(p.a),b=one(p.b);if(a.contains(b)||b.contains(a))reject('INVALID_RELATION','ancestor-pair');
    r.a=rect(a.getBoundingClientRect());r.b=rect(b.getBoundingClientRect());
    const x=Math.max(r.a.left-r.b.right,r.b.left-r.a.right),y=Math.max(r.a.top-r.b.bottom,r.b.top-r.a.bottom);
    r.overlap=x<0&&y<0;r.gap=Math.hypot(Math.max(0,x),Math.max(0,y));
    if(r.overlap||r.gap+t<(p.minGap??0))r.status='FAIL';
   }else if(p.kind==='alignment'){
    const container=one(p.container);r.containerBox=p.containerBox??'content';r.container=r.containerBox==='border'?rect(container.getBoundingClientRect()):inner(container);const boxes=p.members.map(s=>rect(one(s).getBoundingClientRect()));
    r.group={left:Math.min(...boxes.map(b=>b.left)),top:Math.min(...boxes.map(b=>b.top)),right:Math.max(...boxes.map(b=>b.right)),bottom:Math.max(...boxes.map(b=>b.bottom))};
    const [lo,hi]=p.axis==='x'?['left','right']:['top','bottom'];r.offset=(r.group[lo]+r.group[hi]-r.container[lo]-r.container[hi])/2;
    r.gaps={left:r.group.left-r.container.left,right:r.container.right-r.group.right,top:r.group.top-r.container.top,bottom:r.container.bottom-r.group.bottom};
    if(Math.abs(r.offset-p.targetOffset)>t)r.status='FAIL';
    if(Object.entries(p.minGaps??{}).some(([side,min])=>r.gaps[side]+t<min))r.status='FAIL';
   }else{
    const e=one(p.selector);r.actual=Number(getComputedStyle(e).fontWeight);r.expected=p.expected;r.actualFontVerified=false;
    if(r.actual!==p.expected)r.status='FAIL';
   }
   return r;
  }catch(e){return {id:p.id,kind:p.kind,status:e.status||'ERROR',reason:e.message}}});
 },contract);
 return {status:'RELATION_OBSERVATIONS_NOT_ACCEPTANCE',results,
  limitations:['Only supplied main-document relations; no reference completeness check.','Range boxes are not glyph ink. Native text, generated content, display:contents, transforms and shadow content need separate evidence.','Alignment measures supplied member border boxes, not automatically all visible descendants.','CSS weight does not verify actual font face; use audit-fonts and screenshots.']};
}
