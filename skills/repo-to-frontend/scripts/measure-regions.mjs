import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const modulePath=fileURLToPath(import.meta.url);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const moduleSha256=digest(fs.readFileSync(modulePath));

/** Same-coordinate diagnostics only. No rescaling, matching, masks or acceptance. */
export function measureRegions(reference,actual,regions,threshold=0){
 for(const frame of [reference,actual]){
  if(!Number.isSafeInteger(frame?.width)||frame.width<=0||!Number.isSafeInteger(frame?.height)||frame.height<=0)throw new Error('Invalid frame dimensions');
  if(!(frame.data instanceof Uint8Array)||frame.data.length!==frame.width*frame.height*4)throw new Error('Expected exact RGBA byte buffer');
 }
 if(reference.width!==actual.width||reference.height!==actual.height)throw new Error('Image dimensions differ; no rescaling permitted');
 if(!Number.isInteger(threshold)||threshold<0||threshold>255)throw new Error('threshold must be an integer from 0 to 255');
 if(!Array.isArray(regions)||!regions.length)throw new Error('Nonempty region inventory required');
 const seen=new Set();
 for(const region of regions){
  if(typeof region?.id!=='string'||!region.id.trim()||seen.has(region.id))throw new Error('Region IDs must be nonempty and unique');
  seen.add(region.id);
  if(!Array.isArray(region.bbox)||region.bbox.length!==4||![...region.bbox].every(Number.isSafeInteger))throw new Error('Region bbox requires four integer physical-pixel coordinates');
  const[x,y,w,h]=region.bbox;
  if(x<0||y<0||w<=0||h<=0||x+w>reference.width||y+h>reference.height)throw new Error(`Region outside image: ${region.id}`);
 }
 const results=regions.map(({id,bbox})=>{
  const[x,y,w,h]=bbox;let changedPixels=0,total=0,maxChannelDifference=0;
  for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++){
   const offset=(row*reference.width+col)*4;let changed=false;
   for(let channel=0;channel<4;channel++){
    const delta=Math.abs(reference.data[offset+channel]-actual.data[offset+channel]);
    total+=delta;maxChannelDifference=Math.max(maxChannelDifference,delta);if(delta>threshold)changed=true;
   }
   if(changed)changedPixels++;
  }
  return{id,bbox:[...bbox],pixelCount:w*h,changedPixels,mae:total/(w*h*4),maxChannelDifference};
 });
 return{status:'REGIONAL_DIAGNOSTICS_NOT_ACCEPTANCE',coordinateSpace:'physical-pixels',dimensions:[reference.width,reference.height],threshold,regions:results,warning:'Selected regions do not establish reference coverage or whole-page acceptance. No aggregate accuracy score.'};
}

export function assertOutputDistinct(output,inputs){
 const resolved=path.resolve(output);
 const identity=p=>{
  let existing=path.resolve(p);const suffix=[];
  while(!fs.existsSync(existing)){suffix.unshift(path.basename(existing));const next=path.dirname(existing);if(next===existing)break;existing=next;}
  const canonical=path.join(fs.realpathSync(existing),...suffix);
  return process.platform==='win32'?canonical.toLowerCase():canonical;
 };
 for(const input of inputs){
  if(identity(resolved)===identity(input))throw new Error('Output must not overwrite an input');
  if(fs.existsSync(resolved)&&fs.existsSync(input)){
   const a=fs.statSync(resolved),b=fs.statSync(input);
   if(a.dev===b.dev&&a.ino===b.ino)throw new Error('Output aliases an input');
  }
 }
}

export async function runCLI(argv){
 const allowed=new Set(['--reference-image','--actual-image','--regions','--out','--sharp-module']);const options={};
 for(let i=0;i<argv.length;i+=2){if(!allowed.has(argv[i])||!argv[i+1]||argv[i+1].startsWith('--')||options[argv[i]])throw new Error('Invalid or duplicate arguments');options[argv[i]]=argv[i+1];}
 for(const key of ['--reference-image','--actual-image','--regions','--out'])if(!options[key])throw new Error(`Missing ${key}`);
 const inputs=['--reference-image','--actual-image','--regions'].map(k=>path.resolve(options[k]));
 const output=path.resolve(options['--out']);assertOutputDistinct(output,[...inputs,modulePath]);
 const bytes=inputs.map(p=>fs.readFileSync(p));const regions=JSON.parse(bytes[2].toString('utf8'));
 const require=createRequire(import.meta.url),sharp=require(options['--sharp-module']?path.resolve(options['--sharp-module']):'sharp');
 const decode=async bytes=>{const {data,info}=await sharp(bytes,{animated:false}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});if(info.channels!==4)throw new Error('Decoder did not produce RGBA');return{width:info.width,height:info.height,data};};
 const [reference,actual]=await Promise.all(bytes.slice(0,2).map(decode));
 const report={...measureRegions(reference,actual,regions),inputBinding:{referenceImageSha256:digest(bytes[0]),actualImageSha256:digest(bytes[1]),regionsFileSha256:digest(bytes[2])},tool:{moduleSha256,node:process.version},decode:'sRGB RGBA; first frame only'};
 // Recheck immediately before writing; not a guarantee against hostile concurrent filesystem mutation.
 assertOutputDistinct(output,[...inputs,modulePath]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));return report;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{const report=await runCLI(process.argv.slice(2));console.log(JSON.stringify({status:report.status,regions:report.regions.length}));}
 catch(error){console.error(error.message);process.exitCode=2;}
}
