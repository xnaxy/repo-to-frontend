import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const here=path.dirname(fileURLToPath(import.meta.url));
const modulePath=path.resolve(here,'../capture-replica.mjs');
const require=createRequire(path.resolve(process.cwd(),'package.json'));
const {chromium}=require(process.env.R2F_PLAYWRIGHT_MODULE||'playwright');
const sharp=require(process.env.R2F_SHARP_MODULE||'sharp');
let browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true})});
afterAll(async()=>{await browser?.close()});
async function api(){expect(fs.existsSync(modulePath)).toBe(true);return import(modulePath)}
async function pageFor(html){const page=await browser.newPage({viewport:{width:800,height:500}});await page.setContent(html);return page}
const temporary=[];
afterEach(()=>{for(const dir of temporary.splice(0))fs.rmSync(dir,{recursive:true,force:true})});
async function fixture(html='<p data-r2f-id="label">Stable</p>'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r2f-capture-'));temporary.push(dir);
 fs.writeFileSync(path.join(dir,'reference.png'),await sharp({create:{width:800,height:500,channels:4,background:'white'}}).png().toBuffer());
 return {dir,config:{url:'data:text/html,'+encodeURIComponent(html),referenceImage:'reference.png',outputDir:'out',viewport:{width:800,height:500,dpr:1}}};
}
function interceptedChromium(beforeScreenshot=async()=>{},beforePage=()=>{}){
 return {async launch(options){const instance=await chromium.launch(options);const originalNewPage=instance.newPage.bind(instance);instance.newPage=async options=>{const page=await originalNewPage(options);beforePage(page);const screenshot=page.screenshot.bind(page);page.screenshot=async options=>{await beforeScreenshot(page,options);return screenshot(options)};return page};return instance}};
}

describe('independent browser measurement',()=>{
 it.each(['current.png','actual.json'])('refuses to overwrite earlier %s evidence; a new round uses a new directory',async filename=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();
  fs.mkdirSync(path.join(dir,'out'));const previous=Buffer.from('earlier capture evidence');
  fs.writeFileSync(path.join(dir,'out',filename),previous);
  await expect(captureReplica(config,{chromium,sharp},dir)).rejects.toThrow(/OUTPUT_EXISTS/);
  expect(fs.readFileSync(path.join(dir,'out',filename))).toEqual(previous);
 });
 it('preserves another capture result created after the initial output check',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();
  const previous=Buffer.from('concurrent capture evidence');
  const intercepted=interceptedChromium(async()=>fs.writeFileSync(path.join(dir,'out','current.png'),previous,{flag:'wx'}));
  await expect(captureReplica(config,{chromium:intercepted,sharp},dir)).rejects.toThrow(/OUTPUT_EXISTS/);
  expect(fs.readFileSync(path.join(dir,'out','current.png'))).toEqual(previous);
  expect(fs.readdirSync(path.join(dir,'out'))).toEqual(['current.png']);
 });
 it('reads actual text, styles and geometry from the browser',async()=>{
  const {measurePage}=await api();const page=await pageFor('<p data-r2f-id="price" style="position:absolute;left:73px;top:24px;margin:0;font-size:18px">12.00</p>');
  const actual=await measurePage(page,[]);expect(actual.nodes[0].text).toBe('12.00');expect(actual.nodes[0].bbox[0]).toBe(73);expect(actual.nodes[0].style.fontSize).toBe('18px');await page.close();
 });
 it('finds untagged visible leaves even inside a tagged region',async()=>{
  const {measurePage}=await api();const page=await pageFor('<section data-r2f-id="box" data-r2f-type="region"><p>Forgotten text</p><svg width="20" height="20"><path d="M0 0L20 20" stroke="black"/></svg></section>');
  const a=await measurePage(page,[]);expect(a.inventory.unmapped.some(x=>x.type==='text')).toBe(true);expect(a.inventory.unmapped.some(x=>x.type==='shape')).toBe(true);await page.close();
 });
 it('reads state through observed controls, not copied expected values',async()=>{
  const {measurePage}=await api();const page=await pageFor('<input data-r2f-id="qty" id="qty" value="3">');
  const a=await measurePage(page,[{key:'quantity',selector:'#qty',read:'value'}]);expect(a.state).toEqual({quantity:'3'});await page.close();
 });
 it('measures edge anchors and direction from actual SVG geometry and markers',async()=>{
  const {measurePage}=await api();const page=await pageFor('<style>body{margin:0}</style><svg width="200" height="100"><defs><marker id="arrow" markerWidth="5" markerHeight="5"><path d="M0 0L5 2L0 4"/></marker></defs><path data-r2f-id="edge" data-r2f-from="a" data-r2f-to="b" d="M10 20L90 20" stroke="black" marker-end="url(#arrow)"/></svg>');
  const a=await measurePage(page,[]);expect(a.relations[0]).toMatchObject({id:'edge',from:'a',to:'b',direction:'directed',path:'M10 20L90 20',anchors:[[10,20],[90,20]]});await page.close();
 });
 it('reports missing state probes and ignores display-none content as visible inventory',async()=>{
  const {measurePage}=await api();const page=await pageFor('<p style="display:none">Hidden</p>');const a=await measurePage(page,[{key:'open',selector:'#absent',read:'aria-expanded'}]);
  expect(a.state.open).toBe(null);expect(a.inventory.unmapped).toEqual([]);expect(a.measurementErrors.length).toBeGreaterThan(0);await page.close();
 });
 it('captures arrowhead geometry hidden in SVG marker definitions',async()=>{
  const {measurePage}=await api();const page=await pageFor('<svg width="200" height="100"><defs><marker id="arrow" markerWidth="5" markerHeight="5"><path d="M0 0L5 2L0 4Z"/></marker></defs><path data-r2f-id="edge" d="M10 20L90 20" stroke="black" marker-end="url(#arrow)"/></svg>');
  const a=await measurePage(page,[]);expect(a.nodes[0].attributes.markerEndDefinition).toContain('M0 0L5 2L0 4Z');
  await page.locator('marker path').evaluate(e=>e.setAttribute('d','M0 0L5 5'));
  const b=await measurePage(page,[]);expect(b.nodes[0].attributes.markerEndDefinition).not.toBe(a.nodes[0].attributes.markerEndDefinition);await page.close();
 });
 it.each(['pre','pre-wrap','break-spaces'])('preserves raw and displayed whitespace for %s and text state probes',async whiteSpace=>{
  const {measurePage}=await api();const raw='  A\t B  \n C  ';const page=await pageFor('<div data-r2f-id="code" id="code" style="white-space:'+whiteSpace+'"></div>');await page.locator('#code').evaluate((e,t)=>e.textContent=t,raw);
  const a=await measurePage(page,[{key:'code',selector:'#code',read:'text'}]);expect(a.nodes[0]).toMatchObject({rawText:raw,displayText:raw,text:raw});expect(a.state.code).toBe(raw);await page.close();
 });
 it('collapses only CSS collapsible whitespace, retaining nonbreaking spaces',async()=>{
  const {measurePage}=await api();const page=await pageFor('<p data-r2f-id="normal">  A\t B\n C&nbsp; </p><p data-r2f-id="lines" style="white-space:pre-line"> A \t B \n C </p>');
  const a=await measurePage(page,[]);expect(a.nodes[0]).toMatchObject({rawText:'  A\t B\n C\u00a0 ',displayText:'A B C\u00a0',text:'A B C\u00a0'});expect(a.nodes[1].text).toBe('A B\nC');await page.close();
 });
 it('serializes line relation geometry into a canonical path',async()=>{
  const {measurePage}=await api();const page=await pageFor('<svg width="200" height="100"><line data-r2f-id="edge" data-r2f-from="a" data-r2f-to="b" x1="10" y1="20" x2="90" y2="20" stroke="black"/></svg>');
  const a=await measurePage(page,[]);expect(a.relations[0].path).toBe('M 10 20 L 90 20');await page.close();
 });
 it('measures only the selected display label of a closed single select',async()=>{
  const {measurePage}=await api();const page=await pageFor('<select data-r2f-id="mode" id="mode"><option value="hidden">Hidden option</option><option selected value="chosen" label="Chosen label">Internal option text</option></select>');
  const a=await measurePage(page,[{key:'modeLabel',selector:'#mode',read:'text'}]);expect(a.nodes[0]).toMatchObject({rawText:'Hidden optionInternal option text',displayText:'Chosen label',text:'Chosen label',attributes:{value:'chosen'}});expect(a.state.modeLabel).toBe('Chosen label');await page.close();
 });
 it('keeps an input value and placeholder in attributes, not descendant text',async()=>{
  const {measurePage}=await api();const page=await pageFor('<input data-r2f-id="query" value="Actual value" placeholder="Hint">');const a=await measurePage(page,[]);
  expect(a.nodes[0]).toMatchObject({rawText:'',displayText:'',text:'',attributes:{value:'Actual value',placeholder:'Hint'}});await page.close();
 });
 it('separates a short text Range from its 300px block element box',async()=>{
  const {measurePage}=await api();const page=await pageFor('<p data-r2f-id="short" style="width:300px;margin:0;font:16px/24px monospace">Short</p>');const a=await measurePage(page,[]);const n=a.nodes[0];
  expect(n.bbox[2]).toBe(300);expect(n.textBounds).toHaveLength(4);expect(n.textBounds[2]).toBeGreaterThan(0);expect(n.textBounds[2]).toBeLessThan(100);expect(n.lineBoxes).toHaveLength(1);expect(n.textGeometry.kind).toBe('range-layout-boxes-not-ink');await page.close();
 });
 it('collects separate Range line fragments when text wraps across lines',async()=>{
  const {measurePage}=await api();const page=await pageFor('<p data-r2f-id="wrapped" style="width:120px;margin:0;font:16px/24px monospace">Alpha Beta Gamma Delta Epsilon Zeta</p>');const a=await measurePage(page,[]);const n=a.nodes[0];
  expect(n.bbox[2]).toBe(120);expect(n.lineBoxes).toBeInstanceOf(Array);expect(n.lineBoxes.length).toBeGreaterThan(1);expect(new Set(n.lineBoxes.map(r=>r[1])).size).toBeGreaterThan(1);expect(n.textBounds[3]).toBeGreaterThan(n.lineBoxes[0][3]);expect(n.lineBoxes.every(r=>r[2]>0&&r[2]<=120)).toBe(true);await page.close();
 });
 it.each(['<input value="Value">','<select><option>Label</option></select>','<textarea>Value</textarea>'])('does not invent Range text geometry for a native control: %s',async html=>{
  const {measurePage}=await api();const page=await pageFor(html.replace(/^<([a-z]+)/,'<$1 data-r2f-id="native"'));const a=await measurePage(page,[]);
  expect(a.nodes[0]).toMatchObject({textBounds:null,lineBoxes:null,textGeometry:{kind:'unavailable',reason:'native-control-internal-text'}});await page.close();
 });
});
describe('capture integrity',()=>{
 it('rejects reference/output collisions before browser launch',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();fs.renameSync(path.join(dir,'reference.png'),path.join(dir,'current.png'));config.referenceImage='current.png';config.outputDir='.';
  let launches=0;await expect(captureReplica(config,{sharp,chromium:{launch(){launches++;throw Error('LAUNCHED')}}},dir)).rejects.toThrow(/OUTPUT_PATH_COLLISION/);expect(launches).toBe(0);expect(fs.existsSync(path.join(dir,'current.png'))).toBe(true);
 });
 it('protects the supplied configuration file from an actual.json overwrite',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();fs.mkdirSync(path.join(dir,'out'));const configPath=path.join(dir,'out','actual.json');fs.writeFileSync(configPath,'source-config');
  await expect(captureReplica(config,{sharp,configPath,chromium:{launch(){throw Error('LAUNCHED')}}},dir)).rejects.toThrow(/OUTPUT_PATH_COLLISION/);expect(fs.readFileSync(configPath,'utf8')).toBe('source-config');
 });
 it('protects a local page URL from output overwrite before browser launch',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();fs.mkdirSync(path.join(dir,'out'));const input=path.join(dir,'out','actual.json');fs.writeFileSync(input,'<p>Input document</p>');config.url=pathToFileURL(input).href;
  await expect(captureReplica(config,{sharp,chromium:{launch(){throw Error('LAUNCHED')}}},dir)).rejects.toThrow(/OUTPUT_PATH_COLLISION/);expect(fs.readFileSync(input,'utf8')).toBe('<p>Input document</p>');
 });
 it('protects observed local image assets before writing any output',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();fs.mkdirSync(path.join(dir,'out'));const asset=path.join(dir,'out','current.png');const bytes=await sharp({create:{width:4,height:4,channels:4,background:'blue'}}).png().toBuffer();fs.writeFileSync(asset,bytes);const input=path.join(dir,'page.html');fs.writeFileSync(input,'<img data-r2f-id="image" src="out/current.png">');config.url=pathToFileURL(input).href;
  await expect(captureReplica(config,{sharp,chromium},dir)).rejects.toThrow(/OUTPUT_PATH_COLLISION|OUTPUT_EXISTS/);expect(fs.readFileSync(asset)).toEqual(bytes);expect(fs.existsSync(path.join(dir,'out','actual.json'))).toBe(false);
 });
 it('resolves directory junctions before checking protected output collisions',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();fs.mkdirSync(path.join(dir,'real'));fs.renameSync(path.join(dir,'reference.png'),path.join(dir,'real','current.png'));fs.symlinkSync(path.join(dir,'real'),path.join(dir,'alias'),'junction');config.referenceImage='real/current.png';config.outputDir='alias';
  await expect(captureReplica(config,{sharp,chromium:{launch(){throw Error('LAUNCHED')}}},dir)).rejects.toThrow(/OUTPUT_PATH_COLLISION/);
 });
 it('rejects protected hardlink aliases before browser launch',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();fs.mkdirSync(path.join(dir,'out'));fs.linkSync(path.join(dir,'reference.png'),path.join(dir,'out','current.png'));
  await expect(captureReplica(config,{sharp,chromium:{launch(){throw Error('LAUNCHED')}}},dir)).rejects.toThrow(/OUTPUT_PATH_COLLISION/);
 });
 it.runIf(process.platform==='win32')('treats Windows path case variants as the same protected file',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();fs.renameSync(path.join(dir,'reference.png'),path.join(dir,'CURRENT.PNG'));config.referenceImage='CURRENT.PNG';config.outputDir='.';
  await expect(captureReplica(config,{sharp,chromium:{launch(){throw Error('LAUNCHED')}}},dir)).rejects.toThrow(/OUTPUT_PATH_COLLISION/);
 });
 it('freezes animation before measurement and screenshots without advancing it',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture('<style>@keyframes move{from{transform:translateX(0)}to{transform:translateX(200px)}}</style><div data-r2f-id="moving" style="width:40px;height:40px;background:blue;animation:move 3600s linear forwards"></div>');
  let screenOptions,atScreenshot;const a=await captureReplica(config,{sharp,chromium:interceptedChromium(async(page,options)=>{screenOptions=options;atScreenshot=await page.locator('[data-r2f-id]').boundingBox();expect(await page.evaluate(()=>document.getAnimations().every(a=>a.playState!=='running'))).toBe(true)})},dir);
  expect(screenOptions.animations).toBe('allow');expect(a.nodes[0].bbox).toEqual([atScreenshot.x,atScreenshot.y,atScreenshot.width,atScreenshot.height]);expect(a.capture.errors).toEqual([]);
  expect(a.tool.sha256).toBe(crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'));
 });
 it.each(['text','geometry','state'])('blocks a %s mutation between measurement and screenshot',async kind=>{
  const {captureReplica}=await api();const {dir,config}=await fixture('<p data-r2f-id="label">Stable</p><input data-r2f-id="qty" id="qty" value="1">');config.stateProbes=[{key:'quantity',selector:'#qty',read:'value'}];
  const a=await captureReplica(config,{sharp,chromium:interceptedChromium(async page=>{await page.evaluate(kind=>{if(kind==='text')document.querySelector('p').textContent='Changed';if(kind==='geometry')document.querySelector('p').style.marginLeft='40px';if(kind==='state')document.querySelector('input').value='2'},kind)})},dir);
  expect(a.capture.errors.some(e=>e.startsWith('CAPTURE_UNSTABLE'))).toBe(true);
 });
 it.each([false,true])('hashes actual HTTP response bytes rather than disk assets (redirect=%s)',async redirect=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();const served=await sharp({create:{width:4,height:4,channels:4,background:'blue'}}).png().toBuffer();fs.writeFileSync(path.join(dir,'image.png'),Buffer.from('not the served asset'));
  const server=http.createServer((req,res)=>{if(req.url==='/image.png'&&redirect){res.writeHead(302,{Location:'/final.png'});res.end()}else if(req.url==='/image.png'||req.url==='/final.png'){res.writeHead(200,{'Content-Type':'image/png'});res.end(served)}else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<img data-r2f-id="image" src="/image.png">')}else{res.writeHead(204);res.end()}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{config.url='http://127.0.0.1:'+server.address().port+'/';config.assetRoot='.';const a=await captureReplica(config,{chromium,sharp},dir);expect(a.nodes[0].assetSha256).toBe(crypto.createHash('sha256').update(served).digest('hex'));expect(a.capture.errors).not.toContain('ASSET_HASH_NOT_OBSERVED:image')}
  finally{await new Promise(resolve=>server.close(resolve))}
 });
 it('records null/error when browser HTTP response bytes cannot be observed',async()=>{
  const {captureReplica}=await api();const {dir,config}=await fixture();const served=await sharp({create:{width:4,height:4,channels:4,background:'blue'}}).png().toBuffer();
  const server=http.createServer((req,res)=>{if(req.url==='/image.png'){res.writeHead(200,{'Content-Type':'image/png'});res.end(served)}else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<img data-r2f-id="image" src="/image.png">')}else{res.writeHead(204);res.end()}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const unavailable=interceptedChromium(undefined,page=>{const on=page.on.bind(page);page.on=(event,callback)=>on(event,event==='response'?response=>callback(new Proxy(response,{get(target,key){if(key==='body')return async()=>{throw Error('Body unavailable')};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}})):callback)});
  try{config.url='http://127.0.0.1:'+server.address().port+'/';const a=await captureReplica(config,{chromium:unavailable,sharp},dir);expect(a.nodes[0]).toMatchObject({assetSha256:null,assetHashSource:null});expect(a.nodes[0].assetHashError).toContain('Body unavailable');expect(a.capture.errors).toContain('ASSET_HASH_NOT_OBSERVED:image')}
  finally{await new Promise(resolve=>server.close(resolve))}
 });
});
describe('native pixel comparison',()=>{
 it('distinguishes an exact image and one changed pixel without an accuracy percentage',async()=>{
  const {comparePngBuffers}=await api();const pixels=Buffer.alloc(4*4*4,255);const a=await sharp(pixels,{raw:{width:4,height:4,channels:4}}).png().toBuffer();pixels[0]=0;const b=await sharp(pixels,{raw:{width:4,height:4,channels:4}}).png().toBuffer();
  expect((await comparePngBuffers(a,a,0,sharp)).changedPixels).toBe(0);expect((await comparePngBuffers(a,b,0,sharp)).changedPixels).toBe(1);expect(await comparePngBuffers(a,b,0,sharp)).not.toHaveProperty('accuracy');
 });
 it('rejects dimension mismatch instead of rescaling',async()=>{
  const {comparePngBuffers}=await api();const a=await sharp({create:{width:4,height:4,channels:4,background:'white'}}).png().toBuffer();const b=await sharp({create:{width:8,height:4,channels:4,background:'white'}}).png().toBuffer();
  const r=await comparePngBuffers(a,b,0,sharp);expect(r.sameSize).toBe(false);expect(r.changedPixels).toBe(null);
 });
});
