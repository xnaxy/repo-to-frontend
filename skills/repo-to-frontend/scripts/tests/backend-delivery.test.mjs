import {describe,it,expect} from 'vitest';
import {imageFixture} from './fixtures/image-contract.mjs';
import {auditImageContract,digest,imageReviewContext} from '../audit-image-contract.mjs';
import {checkDelivery} from '../check-delivery.mjs';
function setup(){
  const f=imageFixture(), audit=auditImageContract(f.input,f.read);
  const input={schemaVersion:1,scope:'backend-product',mode:'reference',references:f.input.images.map(i=>({id:i.id,image:i.image,regions:['main']})),implementation:[f.file('code')],imageAudit:{input:f.file('audit-input',f.input),result:f.file('audit-result',audit)},pages:[],backendCoverage:[]};
  const referenceDigest=digest(JSON.stringify(input.references)),implementationDigest=digest(JSON.stringify(input.implementation));
  input.pages=input.references.map(r=>{const screenshot=f.file(r.id+'-screen');return{id:r.id,screenshot,review:f.file(r.id+'-frontend-review'),reviewScreenshotSha256:screenshot.sha256,referenceDigest,implementationDigest,sameViewport:true,sameState:true,originalAndActualViewed:true,regions:[{id:'main',state:'PASS',coverage:'PASS',structure:'PASS',content:'PASS',appearance:'PASS',interaction:'PASS'}],findings:[]};});
  input.backendCoverage=audit.requirements.map(req=>({requirementId:req.id,capabilityId:req.capabilityId,pageId:req.pageId,selector:'#'+req.id,verification:f.file(req.id+'-verification',{status:'PASS',requirementId:req.id,capabilityId:req.capabilityId,pageId:req.pageId,selector:'#'+req.id,implementationDigest,imageAuditDigest:audit.inputDigest,integration:'MOCK'})}));
  return {...f,delivery:input};
}
describe('semantic gate survives image-to-frontend handoff',()=>{
  it('accepts matching image gate and full implemented coverage',()=>{const f=setup();expect(checkDelivery(f.delivery,f.read).status).toBe('PASS_SCOPED');});
  it('cannot omit backend mapping even when all visual regions pass',()=>{const f=setup();f.delivery.backendCoverage.pop();expect(checkDelivery(f.delivery,f.read).blockers.some(x=>x.code==='BACKEND_NOT_IMPLEMENTED')).toBe(true);});
  it('reads actual failed implementation report',()=>{const f=setup();const row=f.delivery.backendCoverage[0];row.verification=f.file('failed',{status:'FAIL'});expect(checkDelivery(f.delivery,f.read).blockers.some(x=>x.code==='BACKEND_VERIFICATION_NOT_PASSED')).toBe(true);});
  it('does not trust saved image pass after backend changes',()=>{const f=setup();f.file('backend','new');expect(checkDelivery(f.delivery,f.read).blockers.some(x=>x.code==='IMAGE_CONTRACT_NOT_READY')).toBe(true);});
  it('does not accept a regenerated image against old gate',()=>{const f=setup();f.delivery.references[0].image=f.file('replacement.png');expect(checkDelivery(f.delivery,f.read).blockers.some(x=>x.code==='IMAGE_SET_MISMATCH')).toBe(true);});
  it('rejects missing image gate regardless of user approval',()=>{const f=setup();delete f.delivery.imageAudit;f.delivery.userApproved=true;expect(checkDelivery(f.delivery,f.read).status).toBe('BLOCKED');});
  it('does not use changed code with old capability tests',()=>{const f=setup();f.delivery.implementation=[f.file('new-code')];expect(checkDelivery(f.delivery,f.read).blockers.some(x=>x.code==='BACKEND_VERIFICATION_NOT_PASSED')).toBe(true);});
  it('requires explicit task scope, not silent visual-only downgrade',()=>{const f=setup();delete f.delivery.scope;expect(checkDelivery(f.delivery,f.read).blockers.some(x=>x.code==='MISSING_DELIVERY_SCOPE')).toBe(true);});
  it('does not count decoration as backend content',()=>{const f=imageFixture();f.input.images[0].elements[0].kind='decoration';expect(auditImageContract(f.input,f.read).status).toBe('REPAIR_IMAGES');});
  it('requires new frontend tests after valid new contract and image review',()=>{const f=setup();f.contract.capabilities[1].requirements[0].expected='显示美元';f.updateContract();for(const img of f.input.images)img.reviewContextDigest=imageReviewContext(f.input);f.delivery.imageAudit={input:f.file('audit-input',f.input),result:f.file('audit-result',auditImageContract(f.input,f.read))};expect(checkDelivery(f.delivery,f.read).blockers.some(x=>x.code==='BACKEND_VERIFICATION_NOT_PASSED')).toBe(true);});
  it('rejects absent integration or incorrect capability ID',()=>{for(const field of ['integration','capabilityId']){const f=setup(),row=f.delivery.backendCoverage[0];const report=JSON.parse(f.read(row.verification.path));delete report[field];row.verification=f.file(row.verification.path,report);expect(checkDelivery(f.delivery,f.read).status).toBe('BLOCKED');}});
  it('retains the mock boundary in the final result',()=>{const f=setup();const result=checkDelivery(f.delivery,f.read);expect(result.backendVerification.every(x=>x.integration==='MOCK'&&x.liveBackend==='NOT_RUN')).toBe(true);});
});
