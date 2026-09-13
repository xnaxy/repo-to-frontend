import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { imageFixture } from './fixtures/image-contract.mjs';
import { prepareVisualPackage } from '../prepare-visual-package.mjs';
import { auditImageContract, imageReviewContext } from '../audit-image-contract.mjs';
import { checkDelivery, deliveryReferenceDigest } from '../check-delivery.mjs';
function fixture(){
  const f=imageFixture();
  const design={schemaVersion:1,contract:f.input.contract,catalog:f.file('catalog',readFileSync(new URL('../../references/visual-recipes.json',import.meta.url),'utf8')),direction:{profile:{artifact:'ui',task:'operate',density:'medium'},recipeId:'task-workspace',reason:'task input and result'},style:{typography:'sans',palette:'white and blue',spacing:'24px',components:'same frame'},pages:f.contract.pages.map(p=>({id:p.id,viewport:{width:1200,height:800},layout:'form and result',text:['合成样例'],references:[],assets:[]}))};
  const pack=prepareVisualPackage(design,f.read);
  f.input.styleInstructions=pack.styleInstructions;
  f.input.visualPackage={input:f.file('design',design),output:f.file('package',pack)};
  for(const image of f.input.images){image.generation={request:f.file(image.id+'.request',{tool:'image_gen.imagegen',prompt:pack.pages.find(p=>p.id===image.id).prompt,referenceInputs:[]})};image.reviewContextDigest=imageReviewContext(f.input);}
  return {...f,design,pack};
}
it('accepts a current package only alongside actual image review evidence',()=>{
  const f=fixture();expect(auditImageContract(f.input,f.read).status).toBe('READY_FOR_REPLICA');
  f.input.images[0].viewed=false;expect(auditImageContract(f.input,f.read).status).toBe('AUDIT_INCOMPLETE');
});
it('rejects missing, shortened or substituted recorded prompts',()=>{
  for(const variant of ['missing','shortened','wrong']){
    const f=fixture();if(variant==='missing')delete f.input.images[0].generation;
    else f.input.images[0].generation.request=f.file('different',{tool:'image_gen.imagegen',prompt:variant==='shortened'?'just draw cards':'wrong',referenceInputs:[]});
    expect(auditImageContract(f.input,f.read).blockers.some(b=>b.code==='INVALID_GENERATION_BINDING')).toBe(true);
  }
});
it('rejects changes to recipe snapshot even when old images still match their own hashes',()=>{
  const f=fixture();f.file('catalog','changed');expect(auditImageContract(f.input,f.read).blockers.some(b=>b.code==='VISUAL_PACKAGE_NOT_CURRENT')).toBe(true);
});
it('delivery does not ignore an explicitly supplied invalid design package',()=>{
  const f=fixture();const result=checkDelivery({schemaVersion:1,scope:'visual-only',visualPackage:{input:f.file('broken','{}'),output:f.input.visualPackage.output}},f.read);
  expect(result.blockers.some(b=>b.code==='VISUAL_PACKAGE_NOT_CURRENT')).toBe(true);
});
it('keeps legacy image review without a package compatible',()=>{
  const f=imageFixture();expect(auditImageContract(f.input,f.read).status).toBe('READY_FOR_REPLICA');
});

function visualDelivery(){
  const f=fixture();f.contract.scope='visual-only';f.contract.requirements=f.contract.capabilities.flatMap(c=>c.requirements??[]);delete f.contract.capabilities;f.updateContract();f.design.contract=f.input.contract;
  const pack=prepareVisualPackage(f.design,f.read);
  const input={schemaVersion:1,scope:'visual-only',visualPackage:{input:f.file('design',f.design),output:f.file('package',pack)},references:f.input.images.map(i=>({id:i.id,image:i.image,regions:['main'],generation:{request:f.file(i.id+'.request',{tool:'image_gen.imagegen',prompt:pack.pages.find(p=>p.id===i.id).prompt,referenceInputs:[]})}})),implementation:[f.file('implementation')],pages:[]};
  const binding=checkDelivery(input,f.read);
  input.pages=input.references.map(r=>({id:r.id,screenshot:f.file(r.id+'.screen'),review:f.file(r.id+'.review'),reviewScreenshotSha256:f.file(r.id+'.screen').sha256,referenceDigest:binding.referenceDigest,implementationDigest:binding.implementationDigest,sameViewport:true,sameState:true,originalAndActualViewed:true,regions:[{id:'main',state:'PASS',coverage:'PASS',structure:'PASS',content:'PASS',appearance:'PASS',interaction:'PASS'}],findings:[]}));
  return {...f,input,pack};
}
it('accepts visual-only package with bound generation requests',()=>{const f=visualDelivery();expect(checkDelivery(f.input,f.read).status).toBe('PASS_SCOPED');});
it('exposes the exact digest used by delivery capture bindings',()=>{const f=visualDelivery();expect(deliveryReferenceDigest(f.input)).toBe(checkDelivery(f.input,f.read).referenceDigest);});
it('rejects deleting the package from an already bound backend image review',()=>{const f=fixture();delete f.input.visualPackage;expect(auditImageContract(f.input,f.read).blockers.some(b=>b.code==='STALE_REVIEW_CONTEXT')).toBe(true);});
it.each(['missing','prompt','reference'])('rejects visual-only %s generation evidence',variant=>{
  const f=visualDelivery();if(variant==='missing')delete f.input.references[0].generation;
  else f.input.references[0].generation.request=f.file('bad-request',{tool:'image_gen.imagegen',prompt:variant==='prompt'?'short':f.pack.pages[0].prompt,referenceInputs:variant==='reference'?[f.file('wrong-reference')]:[]});
  expect(checkDelivery(f.input,f.read).blockers.some(b=>b.code==='INVALID_GENERATION_BINDING')).toBe(true);
});
it('does not let deleting a stale package reuse the existing page reviews',()=>{
  const f=visualDelivery();f.file('catalog','changed');expect(checkDelivery(f.input,f.read).status).toBe('BLOCKED');delete f.input.visualPackage;
  expect(checkDelivery(f.input,f.read).blockers.some(b=>b.code==='STALE_PAGE_BINDING')).toBe(true);
});
it('binds visual-only review to package changes even with the same reference bytes',()=>{
  const f=visualDelivery();f.design.style.palette='red';const pack=prepareVisualPackage(f.design,f.read);f.input.visualPackage={input:f.file('design',f.design),output:f.file('package',pack)};
  for(const r of f.input.references)r.generation.request=f.file(r.id+'.request',{tool:'image_gen.imagegen',prompt:pack.pages.find(p=>p.id===r.id).prompt,referenceInputs:[]});
  expect(checkDelivery(f.input,f.read).blockers.some(b=>b.code==='STALE_PAGE_BINDING')).toBe(true);
});
