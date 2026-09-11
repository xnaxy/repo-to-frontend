import { describe, it, expect } from 'vitest';
import { auditImageContract, digest, imageReviewContext } from '../audit-image-contract.mjs';
import { checkDelivery } from '../check-delivery.mjs';
import { imageFixture } from './fixtures/image-contract.mjs';

const hash = value => digest(JSON.stringify(value));
const region = id => ({ id, state: 'PASS', coverage: 'PASS', structure: 'PASS', content: 'PASS', appearance: 'PASS', interaction: 'PASS' });
function setup(scope = 'backend-product') {
  const f = imageFixture();
  const sheet = { id: 'shared-states', kind: 'state-sheet', imageSize: { width: 1000, height: 800 }, fragments: [
    { id: 'waiting', sourceRect: { x: 10, y: 40, width: 400, height: 200 }, target: { pageId: 'submit', stateId: 'pending', viewport: { width: 1200, height: 900, deviceScaleFactor: 1 } }, requirementIds: ['I1'], regions: ['message'] },
    { id: 'success', sourceRect: { x: 10, y: 300, width: 400, height: 200 }, target: { pageId: 'result', stateId: 'completed', viewport: { width: 1200, height: 900, deviceScaleFactor: 1 } }, requirementIds: ['R1'], regions: ['value'] },
  ] };
  f.contract.pages = [sheet];
  for (const capability of f.contract.capabilities) for (const req of capability.requirements ?? []) req.pageId = sheet.id;
  f.updateContract();
  const image = f.file('states.png');
  f.input.images = [{ id: sheet.id, image, review: f.file('states-review'), reviewedImageSha256: image.sha256, reviewContextDigest: imageReviewContext(f.input), viewed: true, inventoryComplete: true, styleStatus: 'MATCH', elements: sheet.fragments.map((fragment, index) => ({ id: fragment.id, fragmentId: fragment.id, regionId: fragment.regions[0], capabilityId: 'B' + (index + 1), requirementId: fragment.requirementIds[0], kind: index ? 'result' : 'action', status: 'MATCH', observed: index ? '1万元' : '已受理' })) }];
  const audit = auditImageContract(f.input, f.read);
  const reference = { ...structuredClone(sheet), image };
  const delivery = { schemaVersion: 1, scope, references: [reference], implementation: [f.file('code')], imageAudit: { input: f.file('audit-input', f.input), result: f.file('audit-result', audit) }, pages: [{ id: sheet.id, status: 'PASS', fragments: [] }], backendCoverage: [] };
  const referenceDigest = hash(delivery.references), implementationDigest = hash(delivery.implementation);
  for (const fragment of reference.fragments) {
    const fragmentDigest = hash(fragment), screenshot = f.file(fragment.id + '-original-screen');
    const capture = f.file(fragment.id + '-capture', { schemaVersion: 1, source: 'browser', original: true, url: 'http://localhost/' + fragment.target.pageId, referenceId: sheet.id, fragmentId: fragment.id, target: fragment.target, screenshotSha256: screenshot.sha256, referenceDigest, implementationDigest, fragmentDigest, actualRect: { x: 100, y: 150, width: 400, height: 200 } });
    const review = f.file(fragment.id + '-review', { schemaVersion: 1, status: 'PASS', referenceId: sheet.id, fragmentId: fragment.id, fragmentDigest, target: fragment.target, referenceDigest, implementationDigest, reviewScreenshotSha256: screenshot.sha256, captureSha256: capture.sha256, sameViewport: true, sameState: true, originalAndActualViewed: true, regions: fragment.regions.map(region), findings: [] });
    delivery.pages[0].fragments.push({ id: fragment.id, screenshot, capture, review });
    const req = audit.requirements.find(req => req.id === fragment.requirementIds[0]);
    const row = { requirementId: req.id, capabilityId: req.capabilityId, pageId: sheet.id, fragmentId: fragment.id, regionId: fragment.regions[0], target: fragment.target, selector: '#' + req.id };
    delivery.backendCoverage.push({ ...row, verification: f.file(req.id + '-verify', { ...row, status: 'PASS', implementationDigest, referenceDigest, imageAuditDigest: audit.inputDigest, fragmentDigest, screenshotSha256: screenshot.sha256, integration: 'MOCK' }) });
  }
  const rewrite = (entry, mutate) => { const value = JSON.parse(f.read(entry.path)); mutate(value); return f.file(entry.path, value); };
  const updateAudit = () => { f.updateContract(); f.input.images[0].reviewContextDigest = imageReviewContext(f.input); delivery.imageAudit = { input: f.file('audit-input', f.input), result: f.file('audit-result', auditImageContract(f.input, f.read)) }; };
  return { ...f, sheet, reference, delivery, rewrite, updateAudit };
}
const codes = result => result.blockers.map(value => value.code);

describe('state-sheet fragments are references for real product states', () => {
  it('accepts independently captured real states without requiring a fake board product page', () => { const f = setup(); expect(checkDelivery(f.delivery, f.read).status).toBe('PASS_SCOPED'); });
  it('retains physical image and logical backend requirement identifiers', () => { const f = setup(); const result = auditImageContract(f.input, f.read); expect(result.status).toBe('READY_FOR_REPLICA'); expect(result.images[0].image).toEqual(f.reference.image); expect(result.images[0].fragments).toEqual(f.reference.fragments); expect(result.requirements.map(req => [req.id, req.pageId])).toEqual([['I1', 'shared-states'], ['R1', 'shared-states']]); });
  it.each(['missing', 'duplicate', 'unexpected'])('blocks %s fragment evidence despite a sheet-level PASS', variant => { const f = setup('visual-only'); const page = f.delivery.pages[0]; if (variant === 'missing') page.fragments.pop(); if (variant === 'duplicate') page.fragments.push(page.fragments[0]); if (variant === 'unexpected') page.fragments.push({ ...page.fragments[0], id: 'invented' }); expect(codes(checkDelivery(f.delivery, f.read))).toContain(variant === 'missing' ? 'UNVERIFIED_FRAGMENT' : variant === 'duplicate' ? 'DUPLICATE_FRAGMENT' : 'UNEXPECTED_FRAGMENT'); });
  it('reads failed region checks from the review even if caller and report summaries say PASS', () => { const f = setup('visual-only'), row = f.delivery.pages[0].fragments[0]; row.regions = [region('message')]; row.review = f.rewrite(row.review, review => { review.regions[0].content = 'FAIL'; }); expect(checkDelivery(f.delivery, f.read).status).toBe('FAIL'); });
  it.each(['target-page', 'target-state', 'viewport', 'not-original', 'not-browser', 'rectangle', 'size', 'missing-capture', 'missing-review', 'screenshot', 'code', 'region', 'unknown', 'not-viewed', 'finding'])('blocks invalid %s evidence', variant => {
    const f = setup('visual-only'), row = f.delivery.pages[0].fragments[0];
    if (['target-page', 'target-state', 'viewport', 'not-original', 'not-browser', 'rectangle', 'size'].includes(variant)) {
      row.capture = f.rewrite(row.capture, capture => { if (variant === 'target-page') capture.target.pageId = 'other'; if (variant === 'target-state') capture.target.stateId = 'success'; if (variant === 'viewport') capture.target.viewport.width = 600; if (variant === 'not-original') capture.original = false; if (variant === 'not-browser') capture.source = 'composite'; if (variant === 'rectangle') capture.actualRect.x = 1200; if (variant === 'size') capture.actualRect.width = 300; });
      row.review = f.rewrite(row.review, review => { review.captureSha256 = row.capture.sha256; });
    }
    if (variant === 'missing-capture') delete row.capture;
    if (variant === 'missing-review') delete row.review;
    if (variant === 'screenshot') row.screenshot = f.file('replaced-screen');
    if (variant === 'code') f.delivery.implementation = [f.file('changed-code')];
    if (['region', 'unknown', 'not-viewed', 'finding'].includes(variant)) row.review = f.rewrite(row.review, review => { if (variant === 'region') review.regions = []; if (variant === 'unknown') review.regions[0].state = 'UNKNOWN'; if (variant === 'not-viewed') review.originalAndActualViewed = false; if (variant === 'finding') review.findings = [{ id: 'difference', resolved: false }]; });
    expect(checkDelivery(f.delivery, f.read).status).toBe(variant === 'finding' ? 'FAIL' : 'BLOCKED');
  });
  it('invalidates old per-fragment reports after changing the source rectangle', () => { const f = setup('visual-only'); f.reference.fragments[0].sourceRect.x += 1; expect(codes(checkDelivery(f.delivery, f.read))).toContain('STALE_FRAGMENT_BINDING'); });
  it('blocks strict state sheets instead of pretending page pixel contracts apply', () => { const f = setup('visual-only'); f.delivery.mode = 'strict'; expect(codes(checkDelivery(f.delivery, f.read))).toContain('STRICT_STATE_SHEET_UNSUPPORTED'); });
  it('still requires user layout authorization for state sheets in redesign mode', () => { const f = setup('visual-only'); f.delivery.mode = 'redesign'; expect(codes(checkDelivery(f.delivery, f.read))).toContain('UNAUTHORIZED_MODE_CHANGE'); f.delivery.layoutChange = { actor: 'user', explicitLayoutChange: true, quote: '允许重排', evidence: f.file('message') }; expect(checkDelivery(f.delivery, f.read).status).toBe('PASS_SCOPED'); });
  it.each(['rectangle', 'target', 'requirement', 'region', 'duplicate', 'overlap', 'downgrade'])('rejects invalid %s declarations in the image audit', variant => { const f = setup(); const fragment = f.sheet.fragments[0]; if (variant === 'rectangle') fragment.sourceRect.width = 2000; if (variant === 'target') fragment.target.pageId = f.sheet.id; if (variant === 'requirement') fragment.requirementIds = []; if (variant === 'region') fragment.regions = []; if (variant === 'duplicate') f.sheet.fragments.push(fragment); if (variant === 'overlap') f.sheet.fragments[1].sourceRect = { ...fragment.sourceRect }; if (variant === 'downgrade') delete f.sheet.kind; f.updateAudit(); expect(auditImageContract(f.input, f.read).status).not.toBe('READY_FOR_REPLICA'); });
  it('rejects an image requirement assigned to the wrong fragment or region', () => { for (const key of ['fragmentId', 'regionId']) { const f = setup(); f.input.images[0].elements[0][key] = 'wrong'; expect(codes(auditImageContract(f.input, f.read))).toContain('INVALID_FRAGMENT_ELEMENT'); } });
  it('rejects a delivery declaration that differs from the approved physical image contract', () => { const f = setup(); f.reference.fragments[0].target.stateId = 'invented'; expect(codes(checkDelivery(f.delivery, f.read))).toContain('STATE_SHEET_CONTRACT_MISMATCH'); });
  it.each(['fragmentId', 'regionId', 'target', 'fragmentDigest', 'referenceDigest', 'screenshotSha256'])('binds backend verification to actual fragment %s', field => { const f = setup(), row = f.delivery.backendCoverage[0]; row.verification = f.rewrite(row.verification, report => { delete report[field]; }); expect(codes(checkDelivery(f.delivery, f.read))).toContain('BACKEND_VERIFICATION_NOT_PASSED'); });
  it('does not accept a conventional whole-page PASS as state-sheet fragment coverage', () => { const f = setup('visual-only'); const page = f.delivery.pages[0]; delete page.fragments; Object.assign(page, { screenshot: f.file('fake-board-screen'), review: f.file('fake-board-review'), sameState: true, sameViewport: true, originalAndActualViewed: true, regions: [region('message'), region('value')] }); expect(codes(checkDelivery(f.delivery, f.read))).toContain('UNVERIFIED_FRAGMENT'); });
  it.each(['state', 'coverage', 'structure', 'content', 'appearance', 'interaction'])('cannot mask the fragment %s failure with a PASS summary', dimension => { const f = setup('visual-only'), row = f.delivery.pages[0].fragments[0]; row.review = f.rewrite(row.review, review => { review.regions[0][dimension] = 'FAIL'; }); expect(checkDelivery(f.delivery, f.read).status).toBe('FAIL'); });
  it.each(['duplicate-region', 'extra-region', 'same-state', 'same-viewport', 'review-blocked', 'review-target', 'capture-json', 'review-json'])('blocks malformed or non-equivalent %s', variant => { const f = setup('visual-only'), row = f.delivery.pages[0].fragments[0]; if (variant === 'capture-json') row.capture = f.file('invalid-capture', '{'); else if (variant === 'review-json') row.review = f.file('invalid-review', '{'); else row.review = f.rewrite(row.review, review => { if (variant === 'duplicate-region') review.regions.push(review.regions[0]); if (variant === 'extra-region') review.regions.push(region('unexpected')); if (variant === 'same-state') review.sameState = false; if (variant === 'same-viewport') review.sameViewport = false; if (variant === 'review-blocked') review.blockers = [{ code: 'NOT_RUN' }]; if (variant === 'review-target') review.target.stateId = 'wrong'; }); expect(checkDelivery(f.delivery, f.read).status).toBe('BLOCKED'); });
  it('does not let a forged saved image PASS override an invalid fragment contract', () => { const f = setup(); f.sheet.fragments[0].requirementIds = ['R1']; f.updateAudit(); const result = auditImageContract(f.input, f.read); f.delivery.imageAudit.result = f.file('forged-audit', { ...result, status: 'READY_FOR_REPLICA', blockers: [] }); expect(codes(checkDelivery(f.delivery, f.read))).toContain('IMAGE_CONTRACT_NOT_READY'); });
  it('requires a new image review after changing only the excerpt rectangle', () => { const f = setup(); f.sheet.fragments[0].sourceRect.x += 1; f.updateContract(); expect(codes(auditImageContract(f.input, f.read))).toContain('STALE_REVIEW_CONTEXT'); });
  it('rejects sheet fragments downgraded into a conventional delivery reference', () => { const f = setup(); delete f.reference.kind; expect(codes(checkDelivery(f.delivery, f.read))).toContain('INVALID_REFERENCE_KIND'); expect(codes(checkDelivery(f.delivery, f.read))).toContain('STATE_SHEET_CONTRACT_MISMATCH'); });
  for (const field of ['findings', 'blockers', 'differences']) {
    it.each([{ code: 'KNOWN_MISMATCH', id: 'value', resolved: false }, 'KNOWN_MISMATCH', null])(`rejects malformed fragment review ${field}: %j even with a current evidence SHA`, value => {
      const f = setup('visual-only'), row = f.delivery.pages[0].fragments[0];
      row.review = f.rewrite(row.review, review => { review[field] = value; });
      const result = checkDelivery(f.delivery, f.read);
      expect(result.status).toBe('BLOCKED');
      expect(codes(result)).toContain('INVALID_REPORT_LIST');
    });
  }
  it('requires an explicit fragment findings array', () => { const f = setup('visual-only'), row = f.delivery.pages[0].fragments[0]; row.review = f.rewrite(row.review, review => { delete review.findings; }); expect(codes(checkDelivery(f.delivery, f.read))).toContain('INVALID_REPORT_LIST'); });
  it.each([{ id: 'known-mismatch', resolved: false }, 'KNOWN_MISMATCH', null])('rejects malformed state-sheet page findings: %j', value => { const f = setup('visual-only'); f.delivery.pages[0].findings = value; expect(codes(checkDelivery(f.delivery, f.read))).toContain('INVALID_REPORT_LIST'); });
  it('accepts explicit empty negative arrays while keeping optional fields optional', () => { const f = setup('visual-only'), row = f.delivery.pages[0].fragments[0]; row.review = f.rewrite(row.review, review => { review.blockers = []; review.differences = []; }); f.delivery.pages[0].findings = []; expect(checkDelivery(f.delivery, f.read).status).toBe('PASS_SCOPED'); });
});
