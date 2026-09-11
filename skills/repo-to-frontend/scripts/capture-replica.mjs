/** Capture observed DOM and pixels. Never reads reference node coordinates. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const executingTool={name:'capture-replica',sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),nodeVersion:process.version};

// Resolve existing ancestors too: outputDir may not exist yet, or may be a junction.
function canonicalPath(filename){
 let ancestor=path.resolve(filename);const suffix=[];
 while(!fs.existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('UNRESOLVABLE_PATH:'+filename);suffix.unshift(path.basename(ancestor));ancestor=parent}
 return path.join(fs.realpathSync.native(ancestor),...suffix);
}
const pathKey=filename=>process.platform==='win32'?filename.toLowerCase():filename;
function sameFile(a,b){
 if(pathKey(canonicalPath(a))===pathKey(canonicalPath(b)))return true;
 if(!fs.existsSync(a)||!fs.existsSync(b))return false;
 const sa=fs.statSync(a),sb=fs.statSync(b);return sa.ino!==0&&sa.dev===sb.dev&&sa.ino===sb.ino;
}
function captureOutputs(outputDir,protectedFiles){
 const output=canonicalPath(outputDir);
 const files=['current.png','actual.json'].map(name=>path.join(output,name));
 const validate=()=>{
  if(pathKey(canonicalPath(output))!==pathKey(output))throw Error('OUTPUT_DIRECTORY_CHANGED');
  for(const filename of files){
   for(const protectedFile of protectedFiles)if(sameFile(filename,protectedFile))throw Error('OUTPUT_PATH_COLLISION:'+filename);
   // Never follow a pre-existing leaf symlink (including a dangling one).
   try{if(fs.lstatSync(filename).isSymbolicLink())throw Error('OUTPUT_SYMLINK_REFUSED:'+filename)}catch(e){if(e.code!=='ENOENT')throw e}
  }
 };
 validate();
 for(const filename of files)if(fs.existsSync(filename))throw Error('OUTPUT_EXISTS: choose a new stage/round outputDir: '+filename);
 fs.mkdirSync(output,{recursive:true});validate();
 return {protect(filenames){protectedFiles.push(...filenames);validate()},write(name,bytes){
  if(!['current.png','actual.json'].includes(name))throw Error('INVALID_OUTPUT_NAME');
  validate();const destination=path.join(output,name),temporary=path.join(output,'.capture-'+crypto.randomUUID()+'.tmp');
  try{
   fs.writeFileSync(temporary,bytes,{flag:'wx'});validate();
   // Publish a complete file without replacing a concurrently created result.
   try{fs.linkSync(temporary,destination)}catch(e){if(e.code==='EEXIST')throw Error('OUTPUT_EXISTS: '+destination);throw e}
  }
  finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
 }};
}

export async function measurePage(page,stateProbes=[]){
 return page.evaluate(probes=>{
  const nodes=[],relations=[],unmapped=[],measurementErrors=[];
  const box=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};
  const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return !e.closest('defs,script,style,template')&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&e.getClientRects().length>0&&(r.width>0||r.height>0)&&r.right>=0&&r.bottom>=0&&r.left<innerWidth&&r.top<innerHeight};
  const shapeTags=['path','line','rect','circle','ellipse','polyline','polygon'];
  const whitespaceText=(raw,whiteSpace)=>{
   if(['pre','pre-wrap','break-spaces'].includes(whiteSpace))return raw;
   const normalized=raw.replace(/\r\n?/g,'\n');
   if(whiteSpace==='pre-line')return normalized.split('\n').map(s=>s.replace(/[\t\f ]+/g,' ').replace(/^ +| +$/g,'')).join('\n');
   return normalized.replace(/[\t\n\f ]+/g,' ').replace(/^ +| +$/g,'');
  };
  const textOf=e=>{
   const rawText=e.textContent??'';
   // innerText on a native closed select includes options that are not displayed.
   const displayText=e.tagName==='SELECT'&&!e.multiple&&e.size<=1
    ?Array.from(e.selectedOptions,o=>whitespaceText(o.label,'normal')).join('')
    :typeof e.innerText==='string'?e.innerText:whitespaceText(rawText,getComputedStyle(e).whiteSpace);
   return {rawText,displayText,text:displayText};
  };
  const textLayout=e=>{
   // Native controls paint internal text outside a reliable DOM text-node Range.
   if(['INPUT','SELECT','TEXTAREA'].includes(e.tagName))return {textBounds:null,lineBoxes:null,textGeometry:{kind:'unavailable',reason:'native-control-internal-text'}};
   const bounds=[],lineBoxes=[],walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let textNode;
   while((textNode=walker.nextNode())){
    const parent=textNode.parentElement;if(!parent||!visible(parent)||parent.closest('input,select,textarea'))continue;
    const range=document.createRange();range.selectNodeContents(textNode);
    const rects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0);
    if(!rects.length)continue;
    const r=range.getBoundingClientRect();bounds.push(r);
    lineBoxes.push(...rects.map(r=>[r.x,r.y,r.width,r.height]));
   }
   let textBounds=null;
   if(bounds.length){const left=Math.min(...bounds.map(r=>r.left)),top=Math.min(...bounds.map(r=>r.top));textBounds=[left,top,Math.max(...bounds.map(r=>r.right))-left,Math.max(...bounds.map(r=>r.bottom))-top]}
   // These are layout fragments, not glyph ink. Mixed inline runs can yield
   // multiple fragments on one visual line; do not treat array length as line count.
   return {textBounds,lineBoxes,textGeometry:{kind:'range-layout-boxes-not-ink',fragments:'text-node-client-rects',coordinateSpace:'viewport-css-px'}};
  };
  const kind=e=>e.dataset.r2fType||(e.tagName==='IMG'?'image':shapeTags.includes(e.localName)?'shape':['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.tagName)?'control':e.childElementCount?'region':'text');
  const properties=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopColor','borderTopStyle','borderRadius','opacity','textAlign','whiteSpace','paddingTop','paddingRight','paddingBottom','paddingLeft','boxShadow','fill','stroke','strokeWidth','strokeLinecap','strokeLinejoin','strokeDasharray','markerStart','markerEnd','transform'];
  for(const e of document.querySelectorAll('[data-r2f-id]')){
   if(!visible(e))continue;
   const style=getComputedStyle(e),id=e.dataset.r2fId,type=kind(e),parent=e.parentElement?.closest('[data-r2f-id]')?.dataset.r2fId??null;
   const attributes={};
   for(const k of ['d','points','viewBox','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','fill-rule','clip-rule','marker-start','marker-end','type','placeholder','aria-label','aria-expanded','aria-selected','role'])if(e.hasAttribute(k))attributes[k]=e.getAttribute(k);
   for(const k of ['markerStart','markerEnd']){
    const match=style[k].match(/#([^"')]+)["']?\)/);if(!match)continue;
    const marker=document.getElementById(match[1]);
    if(!marker){measurementErrors.push('MARKER_DEFINITION_NOT_FOUND:'+id);continue}
    const serialize=node=>({tag:node.localName,attributes:Object.fromEntries(Array.from(node.attributes).filter(a=>!a.name.startsWith('data-')&&a.name!=='id').sort((a,b)=>a.name.localeCompare(b.name)).map(a=>[a.name,a.value])),style:Object.fromEntries(['fill','stroke','strokeWidth','strokeLinecap','strokeLinejoin','opacity'].map(p=>[p,getComputedStyle(node)[p]])),children:Array.from(node.children).map(serialize)});
    attributes[k+'Definition']=JSON.stringify(serialize(marker));
   }
   if(['INPUT','SELECT','TEXTAREA'].includes(e.tagName)){attributes.value=e.value;if(e.type==='checkbox'||e.type==='radio')attributes.checked=e.checked}
   const node={id,parent,type,bbox:box(e),style:Object.fromEntries(properties.map(k=>[k,style[k].replace(/url\(["']?[^#)]*#([^"')]+)["']?\)/g,'url(#$1)')])),attributes,selector:'[data-r2f-id='+JSON.stringify(id)+']'};
   if(type==='text'||type==='control')Object.assign(node,textOf(e),textLayout(e));
   if(e.tagName==='IMG')node.assetUrl=e.currentSrc||e.src;
   nodes.push(node);
   if(e.dataset.r2fFrom||e.dataset.r2fTo){
    let anchors=null;
    try{const transform=e.getScreenCTM();const length=e.getTotalLength();anchors=[0,length].map(l=>{const p=e.getPointAtLength(l);const v=new DOMPoint(p.x,p.y).matrixTransform(transform);return [v.x,v.y]})}catch{measurementErrors.push('UNMEASURED_RELATION:'+id)}
    const start=style.markerStart!=='none',end=style.markerEnd!=='none';
    const observedPath=e.localName==='line'?`M ${e.x1.baseVal.value} ${e.y1.baseVal.value} L ${e.x2.baseVal.value} ${e.y2.baseVal.value}`:e.getAttribute('d')||e.getAttribute('points')||null;
    relations.push({id,from:e.dataset.r2fFrom??null,to:e.dataset.r2fTo??null,direction:start&&end?'bidirectional':end?'directed':start?'reverse':'undirected',anchors,path:observedPath});
   }
  }
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let t;
  while((t=walker.nextNode())){
   const e=t.parentElement;if(!e||!visible(e))continue;
   const rawText=t.textContent,displayText=whitespaceText(rawText,getComputedStyle(e).whiteSpace);if(!displayText)continue;
   const range=document.createRange();range.selectNodeContents(t);const r=range.getBoundingClientRect();
   if(r.width>0&&r.height>0&&!e.hasAttribute('data-r2f-id'))unmapped.push({type:'text',rawText,displayText,text:displayText,tag:e.localName,bbox:[r.x,r.y,r.width,r.height]});
  }
  for(const e of document.querySelectorAll('path,line,rect,circle,ellipse,polyline,polygon,img,input,select,button,textarea'))if(visible(e)&&!e.hasAttribute('data-r2f-id'))unmapped.push({type:kind(e),tag:e.localName,bbox:box(e)});
  for(const e of document.querySelectorAll('body *')){
   if(!visible(e))continue;
   if(e.shadowRoot)measurementErrors.push('SHADOW_DOM_REQUIRES_ADAPTER:'+e.localName);
   if(e.localName==='iframe'||e.localName==='canvas')measurementErrors.push('SURFACE_REQUIRES_ADAPTER:'+e.localName);
   for(const pseudo of ['::before','::after']){const s=getComputedStyle(e,pseudo);if(!['none','normal'].includes(s.content)&&s.display!=='none')measurementErrors.push('PSEUDO_REQUIRES_GEOMETRY_ADAPTER:'+(e.dataset.r2fId||e.localName)+pseudo)}
  }
  const state={},stateText={};
  for(const p of probes){const e=document.querySelector(p.selector);if(!e){state[p.key]=null;measurementErrors.push('STATE_PROBE_NOT_FOUND:'+p.key);continue}if(p.read==='text')stateText[p.key]=textOf(e);state[p.key]=p.read==='value'?e.value:p.read==='text'?stateText[p.key].displayText:p.read==='checked'?e.checked:p.read==='visible'?visible(e):e.getAttribute(p.read)}
  return {nodes,relations,state,stateText,inventory:{unmapped,complete:measurementErrors.length===0},measurementErrors,environment:{userAgent:navigator.userAgent,dpr:devicePixelRatio,scroll:[scrollX,scrollY],fontDeclarations:Array.from(document.fonts).map(f=>({family:f.family,status:f.status}))}};
 },stateProbes);
}

export async function comparePngBuffers(reference,current,threshold,sharp){
 if(!Number.isInteger(threshold)||threshold<0||threshold>255)throw Error('pixelThreshold must be an integer between 0 and 255');
 const a=await sharp(reference).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const b=await sharp(current).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const sameSize=a.info.width===b.info.width&&a.info.height===b.info.height;
 const result={referenceSha256:sha(reference),actualSha256:sha(current),threshold,sameSize,referenceDimensions:[a.info.width,a.info.height],actualDimensions:[b.info.width,b.info.height],changedPixels:null,mae:null,algorithm:'RGBA absolute channel difference; changed if any channel > threshold; no scaling/cropping/masking'};
 if(!sameSize)return result;
 let changed=0,sum=0;
 for(let i=0;i<a.data.length;i+=4){let different=false;for(let c=0;c<4;c++){const d=Math.abs(a.data[i+c]-b.data[i+c]);sum+=d;if(d>threshold)different=true}if(different)changed++}
 return {...result,changedPixels:changed,mae:sum/a.data.length};
}

export async function captureReplica(config,{chromium,sharp,configPath},baseDir=process.cwd()){
 const resolve=p=>path.resolve(baseDir,p);
 if(!config.url||!config.referenceImage||!config.outputDir||!config.viewport)throw Error('url, referenceImage, outputDir and viewport are required');
 const v=config.viewport;
 if(![v.width,v.height,v.dpr].every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid viewport');
 const referencePath=resolve(config.referenceImage);
 const inputUrl=new URL(config.url);
 const output=captureOutputs(resolve(config.outputDir),[referencePath,...(configPath?[path.resolve(configPath)]:[]),...(inputUrl.protocol==='file:'?[fileURLToPath(inputUrl)]:[])]);
 const reference=fs.readFileSync(referencePath);
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:v.width,height:v.height},deviceScaleFactor:v.dpr,reducedMotion:'reduce',colorScheme:config.colorScheme||'light'});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  const responseBodies=new Map();
  page.on('response',response=>{
   if(!/^https?:/.test(response.url())||response.request().resourceType()!=='image')return;
   if(response.status()>=300&&response.status()<400)return;
   const observation=response.body().then(body=>({sha256:sha(body)}),error=>({sha256:null,error:String(error)}));
   const aliases=new Set();
   for(let request=response.request();request;request=request.redirectedFrom()){const key=new URL(request.url());key.hash='';aliases.add(key.href)}
   for(const alias of aliases){const records=responseBodies.get(alias)||[];records.push(observation);responseBodies.set(alias,records)}
  });
  await page.goto(config.url,{waitUntil:'load'});
  if(config.readySelector)await page.locator(config.readySelector).waitFor({state:'visible',timeout:10000});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>null)));});
  await page.evaluate(([x,y])=>scrollTo(x,y),config.scroll||[0,0]);
  const animationFreeze=await page.evaluate(()=>{
   const animations=document.getAnimations(),failures=[];
   for(const a of animations)try{const end=a.effect?.getComputedTiming().endTime;a.pause();a.currentTime=Number.isFinite(end)?end:0}catch(e){failures.push(String(e))}
   return {strategy:'finite-end-infinite-start-paused',count:animations.length,failures};
  });
  if(animationFreeze.failures.length)errors.push('ANIMATION_FREEZE_FAILED');
  const measured=await measurePage(page,config.stateProbes||[]);
  const ready=await page.evaluate(()=>({fontReady:document.fonts.status==='loaded',imagesReady:Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)}));
  const current=await page.screenshot({animations:'allow',fullPage:false});
  const after=await measurePage(page,config.stateProbes||[]);
  const imageUrls=await page.evaluate(()=>Array.from(document.images,i=>i.currentSrc||i.src));
  output.protect([...measured.nodes,...after.nodes].filter(n=>n.assetUrl).map(n=>n.assetUrl).concat(imageUrls).filter(url=>url.startsWith('file:')).map(url=>fileURLToPath(url)));
  const stabilityKeys=['nodes','relations','state','stateText','inventory','environment'];
  const changed=stabilityKeys.filter(key=>JSON.stringify(measured[key])!==JSON.stringify(after[key]));
  if(changed.length)errors.push('CAPTURE_UNSTABLE:'+changed.join(','));
  const runningAnimations=await page.evaluate(()=>document.getAnimations().some(a=>a.playState==='running'));
  if(runningAnimations)errors.push('CAPTURE_UNSTABLE:running-animation');
  for(const n of measured.nodes.filter(n=>n.type==='image')){
   try{
    const u=new URL(n.assetUrl);
    if(u.protocol==='file:'){n.assetSha256=sha(fs.readFileSync(fileURLToPath(u)));n.assetHashSource='file-bytes'}
    else if(u.protocol==='data:'){const split=n.assetUrl.indexOf(',');n.assetSha256=sha(n.assetUrl.slice(0,split).endsWith(';base64')?Buffer.from(n.assetUrl.slice(split+1),'base64'):Buffer.from(decodeURIComponent(n.assetUrl.slice(split+1))));n.assetHashSource='data-url-bytes'}
    else if(['http:','https:'].includes(u.protocol)){
     u.hash='';const records=await Promise.all(responseBodies.get(u.href)||[]);
     if(!records.length||records.some(r=>!r.sha256)||new Set(records.map(r=>r.sha256)).size!==1)throw Error(records.find(r=>r.error)?.error||'Missing or ambiguous image response body');
     n.assetSha256=records[0].sha256;n.assetHashSource='browser-response-body';
    }else throw Error('Unsupported asset protocol:'+u.protocol);
   }catch(e){n.assetSha256=null;n.assetHashSource=null;n.assetHashError=String(e);errors.push('ASSET_HASH_NOT_OBSERVED:'+n.id)}
  }
  const pixels=await comparePngBuffers(reference,current,config.pixelThreshold??0,sharp);
  const actual={schemaVersion:1,referenceSha256:sha(reference),viewport:v,...measured,capture:{...ready,animationFreeze,stability:{checked:stabilityKeys,changed},errors:[...new Set([...errors,...measured.measurementErrors,...after.measurementErrors])],screenshotSha256:sha(current),dimensions:pixels.actualDimensions},pixels,capturedAt:new Date().toISOString(),browserVersion:browser.version(),sourceConfigSha256:sha(Buffer.from(JSON.stringify(config)))};
  output.write('current.png',current);
  actual.tool=executingTool;
  output.write('actual.json',JSON.stringify(actual,null,2));
  return actual;
 }finally{await browser.close()}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);const flag=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1]};
  if(args.includes('--help')){console.log('node capture-replica.mjs --config capture.json [--playwright-module absolute/package/path] [--sharp-module absolute/package/path]');}
  else{
   const configFile=flag('--config');if(!configFile)throw Error('--config is required');
   const require=createRequire(path.resolve(process.cwd(),'package.json'));
   const {chromium}=require(flag('--playwright-module')||process.env.R2F_PLAYWRIGHT_MODULE||'playwright');const sharp=require(flag('--sharp-module')||process.env.R2F_SHARP_MODULE||'sharp');
   const config=JSON.parse(fs.readFileSync(configFile,'utf8').replace(/^\uFEFF/,''));const a=await captureReplica(config,{chromium,sharp,configPath:path.resolve(configFile)},path.dirname(path.resolve(configFile)));
   console.log(JSON.stringify({status:'CAPTURED_NOT_ACCEPTED',nodes:a.nodes.length,unmapped:a.inventory.unmapped.length,errors:a.capture.errors,changedPixels:a.pixels.changedPixels}));
  }
 }catch(e){console.error(String(e));process.exitCode=2}
}
