import { digest, imageReviewContext } from '../../audit-image-contract.mjs';
export function imageFixture() {
  const files = new Map();
  const file = (path, value = path) => { const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)); files.set(path, bytes); return {path,sha256:digest(bytes)}; };
  const contract = {scope:'backend-product',sourceEvidence:[file('backend')],pages:[{id:'submit'},{id:'result'}],capabilities:[
    {id:'B1',presentation:'visible',requirements:[{id:'I1',pageId:'submit',kind:'action',expected:'提交后显示已受理，不显示完成'}]},
    {id:'B2',presentation:'visible',requirements:[{id:'R1',pageId:'result',kind:'result',expected:'展示结果数值及单位'}]},
    {id:'worker',presentation:'internal',representedBy:['B2'],reason:'后台处理通过结果状态体现'},
  ]};
  const input={schemaVersion:1,contract:file('contract',contract),styleAnchor:file('anchor'),styleInstructions:'保持青色、两栏、紧凑数据密度',images:contract.pages.map((p,i)=>{const image=file(p.id+'.png');return{id:p.id,image,review:file(p.id+'.review'),reviewedImageSha256:image.sha256,viewed:true,inventoryComplete:true,styleStatus:'MATCH',elements:[{id:p.id+'-element',capabilityId:'B'+(i+1),requirementId:i===0?'I1':'R1',kind:i===0?'action':'result',status:'MATCH',observed:i===0?'已受理':'1万元'}]};})};
  for(const image of input.images) image.reviewContextDigest=imageReviewContext(input);
  return {input,contract,files,file,read:path=>{if(!files.has(path))throw Error('missing');return files.get(path);},updateContract:()=>{input.contract=file('contract',contract);}};
}
