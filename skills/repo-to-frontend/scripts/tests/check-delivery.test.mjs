import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { checkDelivery } from '../check-delivery.mjs';
import { createInputBinding } from '../verify-replica.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const ref = path => ({ path, sha256: sha(path) });
const read = path => Buffer.from(path);
function fixture() {
  const input = { schemaVersion: 1, scope: 'visual-only', references: [{ id: 'report', image: ref('image'), regions: ['metrics', 'chart', 'table'] }], implementation: [ref('code')], pages: [] };
  const binding = checkDelivery(input, read);
  input.pages.push({ id: 'report', screenshot: ref('screen'), review: ref('review'), reviewScreenshotSha256: sha('screen'), referenceDigest: binding.referenceDigest, implementationDigest: binding.implementationDigest, sameViewport: true, sameState: true, originalAndActualViewed: true,
    regions: ['metrics', 'chart', 'table'].map(id => ({ id, state: 'PASS', coverage: 'PASS', structure: 'PASS', content: 'PASS', appearance: 'PASS', interaction: 'PASS' })), findings: [] });
  return input;
}
describe('delivery evidence cannot promote unrelated passes into faithful reconstruction', () => {
  it('accepts only the bound reviewed scope', () => expect(checkDelivery(fixture(), read).status).toBe('PASS_SCOPED'));
  it('defaults to reference mode without requiring the words strict or 1:1', () => expect(checkDelivery(fixture(), read).mode).toBe('reference'));
  it('rejects self-selected redesign even if all checks pass', () => { const x=fixture(); x.mode='redesign'; expect(checkDelivery(x,read).blockers.some(b=>b.code==='UNAUTHORIZED_MODE_CHANGE')).toBe(true); });
  it('allows explicit evidenced user redesign', () => { const x=fixture(); x.mode='redesign'; x.layoutChange={actor:'user',explicitLayoutChange:true,quote:'允许重排',evidence:ref('message')}; expect(checkDelivery(x,read).status).toBe('PASS_SCOPED'); });
  it('does not accept a missing approved state', () => { const x=fixture(); x.references.push({id:'account',image:ref('account'),regions:['form']}); expect(checkDelivery(x,read).blockers.some(b=>b.code==='UNVERIFIED_REFERENCE')).toBe(true); });
  it('rejects empty evidence', () => expect(checkDelivery({},read).status).toBe('BLOCKED'));
  it('detects replaced images at the same path', () => { const x=fixture(); expect(checkDelivery(x,p=>p==='image'?Buffer.from('changed'):read(p)).blockers.some(b=>b.code==='STALE_EVIDENCE')).toBe(true); });
  it('detects changed implementation bindings', () => { const x=fixture(); x.implementation=[ref('new code')]; expect(checkDelivery(x,read).blockers.some(b=>b.code==='STALE_PAGE_BINDING')).toBe(true); });
  it('detects new screenshot with old review', () => { const x=fixture(); x.pages[0].screenshot=ref('new screen'); expect(checkDelivery(x,read).blockers.some(b=>b.code==='STALE_REVIEW_SCREENSHOT')).toBe(true); });
  it('rejects summary shell instead of result state', () => { const x=fixture(); x.pages[0].sameState=false; expect(checkDelivery(x,read).status).toBe('BLOCKED'); });
  it('rejects missing metrics despite no overflow and working charts', () => { const x=fixture(); x.pages[0].regions.shift(); expect(checkDelivery(x,read).blockers.some(b=>b.code==='UNVERIFIED_REGION')).toBe(true); });
  it('fails chart replacement, first-screen displacement, or missing labels independently', () => { for(const dim of ['structure','coverage','appearance','content']) { const x=fixture(); x.pages[0].regions[1][dim]='FAIL'; expect(checkDelivery(x,read).status).toBe('FAIL'); } });
  it('does not forgive a P3 visual difference', () => { const x=fixture(); x.pages[0].findings=[{id:'ratio',priority:'P3',blocking:false,resolved:false}]; expect(checkDelivery(x,read).status).toBe('FAIL'); });
  it.each([{id:'known-mismatch',resolved:false}, 'KNOWN_MISMATCH', null])('rejects malformed ordinary page findings: %j', value => { const x=fixture(); x.pages[0].findings=value; const result=checkDelivery(x,read); expect(result.status).toBe('BLOCKED'); expect(result.blockers.some(b=>b.code==='INVALID_REPORT_LIST')).toBe(true); });
  it('keeps omitted ordinary page findings compatible', () => { const x=fixture(); delete x.pages[0].findings; expect(checkDelivery(x,read).status).toBe('PASS_SCOPED'); });
  it('keeps unknown fonts and incomplete comparison unverified', () => { const x=fixture(); x.pages[0].regions[0].appearance='UNKNOWN'; expect(checkDelivery(x,read).status).toBe('BLOCKED'); });
  it('cannot replace visual review with a functional pass', () => { const x=fixture(); delete x.pages[0].review; x.functionalTestsPassed=85; expect(checkDelivery(x,read).status).toBe('BLOCKED'); });
  it('rejects duplicate region rows and unexpected states', () => { const x=fixture(); x.pages[0].regions.push(x.pages[0].regions[0]); x.pages.push({...x.pages[0],id:'unapproved'}); expect(checkDelivery(x,read).status).toBe('BLOCKED'); });
  it('requires strict contract evidence in addition to manual pass claims', () => { const x=fixture(); x.mode='strict'; x.pages[0].contractStatus='PASS_CONTRACT'; expect(checkDelivery(x,read).status).toBe('BLOCKED'); });
  it('reads strict report status and binds actual contract inputs', () => {
    for (const variant of ['valid','FAIL','BLOCKED','stale','wrong-image']) {
      const x=fixture(); x.mode='strict'; const p=x.pages[0];
      const original={referenceImage:{sha256:sha('image')}};
      const actual={referenceSha256:sha('image'),capture:{screenshotSha256:sha(variant==='wrong-image'?'other':'screen')}};
      const report={status:['FAIL','BLOCKED'].includes(variant)?variant:'PASS_CONTRACT', inputBinding:createInputBinding(original,actual)};
      if(variant==='stale') report.inputBinding.actualSha256=sha('stale');
      const files={original:JSON.stringify(original),actual:JSON.stringify(actual),report:JSON.stringify(report)};
      const entry=path=>({path,sha256:sha(files[path])});
      Object.assign(p,{contractStatus:'PASS_CONTRACT',contractEvidence:entry('report'),contractReference:entry('original'),contractActual:entry('actual')});
      const result=checkDelivery(x,path=>files[path]===undefined?read(path):Buffer.from(files[path]));
      expect(result.status).toBe(variant==='valid'?'PASS_SCOPED':'BLOCKED');
    }
  });
  for (const field of ['blockers','differences']) {
    it.each([{code:'KNOWN_MISMATCH'}, 'KNOWN_MISMATCH', null])(`rejects malformed strict report ${field}: %j with otherwise valid bindings`, value => {
      const x=fixture(); x.mode='strict'; const page=x.pages[0];
      const original={referenceImage:{sha256:sha('image')}};
      const actual={referenceSha256:sha('image'),capture:{screenshotSha256:sha('screen')}};
      const report={status:'PASS_CONTRACT',inputBinding:createInputBinding(original,actual),[field]:value};
      const files={original:JSON.stringify(original),actual:JSON.stringify(actual),report:JSON.stringify(report)};
      const entry=path=>({path,sha256:sha(files[path])});
      Object.assign(page,{contractEvidence:entry('report'),contractReference:entry('original'),contractActual:entry('actual')});
      const result=checkDelivery(x,path=>files[path]===undefined?read(path):Buffer.from(files[path]));
      expect(result.status).toBe('BLOCKED');
      expect(result.blockers.some(b=>b.code==='INVALID_REPORT_LIST')).toBe(true);
    });
  }
});
