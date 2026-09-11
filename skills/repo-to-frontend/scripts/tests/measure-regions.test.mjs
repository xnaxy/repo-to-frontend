import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const moduleURL=new URL('../measure-regions.mjs',import.meta.url);
const frame=(width=4,height=3)=>({width,height,data:new Uint8Array(width*height*4).fill(255)});
async function api(){expect(fs.existsSync(moduleURL),'regional diagnostic module exists').toBe(true);return import(moduleURL.href);}

test('localizes a one-pixel difference without averaging unaffected regions',async()=>{
 const {measureRegions}=await api();const reference=frame(),actual=frame();actual.data[(1*4+2)*4]=155;
 const report=measureRegions(reference,actual,[{id:'left',bbox:[0,0,2,3]},{id:'right',bbox:[2,0,2,3]}]);
 expect(report.status).toBe('REGIONAL_DIAGNOSTICS_NOT_ACCEPTANCE');
 expect(report.regions[0]).toMatchObject({changedPixels:0,mae:0,pixelCount:6});
 expect(report.regions[1]).toMatchObject({changedPixels:1,pixelCount:6,maxChannelDifference:100});
 expect(report.regions[1].mae).toBeCloseTo(100/24);
});
test('threshold affects changed count but does not discard raw error',async()=>{
 const {measureRegions}=await api();const reference=frame(),actual=frame();actual.data[3]=245;
 const report=measureRegions(reference,actual,[{id:'one',bbox:[0,0,1,1]}],10);
 expect(report.regions[0]).toMatchObject({changedPixels:0,mae:2.5,maxChannelDifference:10});
});
test.each([
 [{id:'bad',bbox:[-1,0,2,2]}],
 [{id:'bad',bbox:[0,0,5,2]}],
 [{id:'bad',bbox:[0.5,0,2,2]}],
 [{id:'hole',bbox:[0,,1,1]}],
 [{id:'bad',bbox:[0,0,0,2]}],
 [{id:'bad',bbox:[0,0,2,2]},{id:'bad',bbox:[1,1,2,2]}],
 []
])('rejects invalid or ambiguous region inventory %#',async(...args)=>{
 const {measureRegions}=await api();const regions=args.filter(v=>v&&typeof v==='object'&&'id'in v);
 expect(()=>measureRegions(frame(),frame(),regions)).toThrow();
});
test('refuses rescaling, mismatched dimensions and malformed buffers',async()=>{
 const {measureRegions}=await api();const regions=[{id:'a',bbox:[0,0,2,2]}];
 expect(()=>measureRegions(frame(),frame(3,4),regions)).toThrow(/dimensions/i);
 expect(()=>measureRegions({...frame(),data:new Uint8Array(1)},frame(),regions)).toThrow(/RGBA/i);
 expect(()=>measureRegions(frame(),frame(),regions,-1)).toThrow(/threshold/i);
});
test('protects original inputs including a hard-link output alias',async()=>{
 const {assertOutputDistinct}=await api();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r2f-region-test-'));
 const input=path.join(dir,'input.json'),alias=path.join(dir,'alias.json');
 try{fs.writeFileSync(input,'[]');fs.linkSync(input,alias);
  expect(()=>assertOutputDistinct(input,[input])).toThrow(/input/i);
  expect(()=>assertOutputDistinct(alias,[input])).toThrow(/input/i);
  expect(()=>assertOutputDistinct(path.join(dir,'new','report.json'),[input])).not.toThrow();
 }finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
});
test('CLI records input byte bindings and refuses input overwrite',async()=>{
 const {runCLI}=await api();const require=createRequire(import.meta.url);
 const sharpModule=process.env.R2F_SHARP_MODULE||'sharp';const sharp=require(sharpModule);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r2f-region-cli-'));
 try{
  const reference=path.join(dir,'ref.png'),actual=path.join(dir,'actual.png'),regions=path.join(dir,'regions.json'),out=path.join(dir,'report.json');
  await sharp({create:{width:2,height:2,channels:4,background:'#ffffff'}}).png().toFile(reference);
  fs.copyFileSync(reference,actual);fs.writeFileSync(regions,JSON.stringify([{id:'a',bbox:[0,0,2,2]}]));
  const argv=['--reference-image',reference,'--actual-image',actual,'--regions',regions,'--out',out];
  if(process.env.R2F_SHARP_MODULE)argv.push('--sharp-module',sharpModule);
  const report=await runCLI(argv);expect(report.regions[0].changedPixels).toBe(0);
  expect(report.inputBinding.referenceImageSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.parse(fs.readFileSync(out,'utf8')).inputBinding).toEqual(report.inputBinding);
  argv[7]=reference;await expect(runCLI(argv)).rejects.toThrow(/input/i);
  await expect(runCLI(['--wat','bad'])).rejects.toThrow(/arguments/i);
 }finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
});
