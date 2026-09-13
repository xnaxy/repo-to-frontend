#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInputBinding } from './verify-replica.mjs';
import { auditImageContract, stateSheetDeclaration, validateStateSheet, validRect } from './audit-image-contract.mjs';
import { readVisualPackage, validateGenerationRequest } from './prepare-visual-package.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const list = value => Array.isArray(value) ? value : [];
const dimensions = ['state', 'coverage', 'structure', 'content', 'appearance', 'interaction'];
const sameTarget = (a, b) => a && b && a.pageId === b.pageId && a.stateId === b.stateId && ['width', 'height', 'deviceScaleFactor'].every(key => a.viewport?.[key] === b.viewport?.[key]);

// Preserve legacy bytes for tasks without a package; adopted packages bind reviews.
export const deliveryReferenceDigest = input => sha(JSON.stringify(Object.hasOwn(input ?? {}, 'visualPackage')
  ? {references:list(input?.references),visualPackage:input.visualPackage}
  : list(input?.references)));

// This aggregates evidence; it does not independently judge images or authenticate user messages.
export function checkDelivery(input, read = path => readFileSync(path)) {
  const blockers = [], differences = [], backendVerification = [];
  const block = (code, id = '') => blockers.push({ code, id });
  const parse = entry => JSON.parse(read(entry.path).toString('utf8').replace(/^\uFEFF/, ''));
  // Malformed negative evidence must never become an empty, successful list.
  const reportList = (report, field, owner, required = false) => {
    if (Array.isArray(report[field])) return report[field];
    if (required || Object.hasOwn(report, field)) block('INVALID_REPORT_LIST', `${owner}/${field}`);
    return [];
  };
  const evidence = (entry, id) => {
    if (!entry?.path || !/^[a-f0-9]{64}$/i.test(entry.sha256 ?? '')) {
      block('MISSING_EVIDENCE', id); return false;
    }
    try {
      if (sha(read(entry.path)) !== entry.sha256.toLowerCase()) {
        block('STALE_EVIDENCE', id); return false;
      }
      return true;
    } catch { block('UNREADABLE_EVIDENCE', id); return false; }
  };
  if (!input || input.schemaVersion !== 1) block('INVALID_SCHEMA');
  const refs = list(input?.references), pages = list(input?.pages);
  let visualPackage;
  if (input && Object.hasOwn(input, 'visualPackage')) {
    try {
      visualPackage = readVisualPackage(input.visualPackage, read).output;
      if (visualPackage.scope !== input.scope || visualPackage.pages.length !== refs.length || visualPackage.pages.some(p => !refs.some(r => r.id === p.id))) block('VISUAL_PACKAGE_SCOPE_MISMATCH');
    } catch { block('VISUAL_PACKAGE_NOT_CURRENT'); }
  }
  if (!refs.length) block('NO_REFERENCE_SCOPE');
  const ids = refs.map(ref => ref.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) block('INVALID_REFERENCE_IDS');
  for (const ref of refs) { evidence(ref.image, `reference:${ref.id}`); validateStateSheet(ref, block); }
  const implementation = list(input?.implementation);
  if (!implementation.length) block('MISSING_IMPLEMENTATION');
  for (const item of implementation) evidence(item, 'implementation');
  const mode = input?.mode ?? 'reference';
  if (!['reference', 'strict', 'redesign'].includes(mode)) block('INVALID_MODE');
  if (mode === 'redesign') {
    const authority = input?.layoutChange;
    if (authority?.actor !== 'user' || authority?.explicitLayoutChange !== true || !authority?.quote?.trim()) block('UNAUTHORIZED_MODE_CHANGE');
    evidence(authority?.evidence, 'layout-change');
  }
  const referenceDigest = deliveryReferenceDigest(input);
  const implementationDigest = sha(JSON.stringify(implementation));
  if (!['visual-only','backend-product'].includes(input?.scope)) block('MISSING_DELIVERY_SCOPE');
  if (visualPackage && input.scope === 'visual-only') {
    for (const ref of refs) {
      try { validateGenerationRequest(visualPackage.pages.find(p=>p.id===ref.id),ref.generation,read); }
      catch { block('INVALID_GENERATION_BINDING',ref.id); }
    }
  }
  if (input?.scope === 'backend-product') {
    const valid = [evidence(input.imageAudit?.input,'image-audit-input'), evidence(input.imageAudit?.result,'image-audit-result')].every(Boolean);
    if (valid) {
      try {
        const auditInput = parse(input.imageAudit.input), saved = parse(input.imageAudit.result), current = auditImageContract(auditInput,read);
        if (auditInput.visualPackage || input.visualPackage) {
          if (!visualPackage || auditInput.visualPackage?.input?.sha256 !== input.visualPackage?.input?.sha256 || auditInput.visualPackage?.output?.sha256 !== input.visualPackage?.output?.sha256) block('VISUAL_PACKAGE_AUDIT_MISMATCH');
        }
        if (current.status !== 'READY_FOR_REPLICA' || saved.status !== 'READY_FOR_REPLICA' || saved.inputDigest !== current.inputDigest) block('IMAGE_CONTRACT_NOT_READY');
        if (current.images.length !== refs.length || current.images.some(image => !refs.some(ref => ref.id === image.id && ref.image.sha256 === image.image?.sha256))) block('IMAGE_SET_MISMATCH');
        for (const image of current.images) {
          const ref = refs.find(ref => ref.id === image.id);
          if (JSON.stringify(stateSheetDeclaration(image)) !== JSON.stringify(stateSheetDeclaration(ref))) block('STATE_SHEET_CONTRACT_MISMATCH', image.id);
        }
        const coverage = list(input.backendCoverage);
        if (new Set(coverage.map(row=>row.requirementId)).size !== coverage.length) block('DUPLICATE_BACKEND_COVERAGE');
        for (const req of current.requirements) {
          const row = coverage.find(row=>row.requirementId === req.id && row.capabilityId === req.capabilityId && row.pageId === req.pageId);
          if (!row?.selector || !evidence(row?.verification,`backend:${req.id}`)) { block('BACKEND_NOT_IMPLEMENTED',req.id); continue; }
          const check = parse(row.verification);
          let fragmentBound = true;
          const sheet = current.images.find(image => image.id === req.pageId && image.kind === 'state-sheet');
          if (sheet) {
            const fragment = list(sheet.fragments).find(fragment => fragment.id === req.fragmentId);
            const actual = list(pages.find(page => page.id === req.pageId)?.fragments).find(actual => actual.id === req.fragmentId);
            fragmentBound = !!fragment && !!actual?.screenshot && row.fragmentId === req.fragmentId && row.regionId === req.regionId && sameTarget(row.target, req.target) && check.fragmentId === req.fragmentId && check.regionId === req.regionId && sameTarget(check.target, req.target) && check.fragmentDigest === sha(JSON.stringify(fragment)) && check.referenceDigest === referenceDigest && check.screenshotSha256 === actual.screenshot.sha256;
          }
          const verified = fragmentBound && check.status === 'PASS' && check.requirementId === req.id && check.capabilityId === req.capabilityId && check.pageId === req.pageId && check.selector === row.selector && check.implementationDigest === implementationDigest && check.imageAuditDigest === current.inputDigest && ['LIVE','MOCK','STATIC'].includes(check.integration);
          if (!verified) block('BACKEND_VERIFICATION_NOT_PASSED',req.id);
          backendVerification.push({requirementId:req.id,status:verified?'PASS':'BLOCKED',integration:check.integration??'UNKNOWN',liveBackend:verified?(check.integration==='LIVE'?'PASS_REPORTED':'NOT_RUN'):'NOT_VERIFIED'});
        }
        for (const row of coverage) if (!current.requirements.some(req=>req.id===row.requirementId)) block('UNEXPECTED_BACKEND_COVERAGE',row.requirementId);
      } catch { block('INVALID_IMAGE_OR_BACKEND_REPORT'); }
    }
  }
  const reviewRegions = (expected, review, owner, requireFindings = false) => {
    const observed = list(review.regions);
    if (!expected.length || new Set(expected).size !== expected.length || expected.some(id => typeof id !== 'string' || !id)) block('MISSING_REGION_INVENTORY', owner);
    if (new Set(observed.map(region => region.id)).size !== observed.length) block('DUPLICATE_REGION', owner);
    for (const region of observed) if (!expected.includes(region.id)) block('UNEXPECTED_REGION', `${owner}/${region.id}`);
    for (const id of expected) {
      const region = observed.find(value => value.id === id);
      if (!region) { block('UNVERIFIED_REGION', `${owner}/${id}`); continue; }
      for (const dimension of dimensions) {
        const status = region[dimension];
        if (status === 'FAIL') differences.push({ code: dimension.toUpperCase(), id: `${owner}/${id}` });
        else if (status !== 'PASS') block('UNVERIFIED_' + dimension.toUpperCase(), `${owner}/${id}`);
      }
    }
    for (const finding of reportList(review, 'findings', owner, requireFindings)) if (finding.resolved !== true) differences.push({ code: 'OPEN_FINDING', id: `${owner}/${finding.id ?? 'unknown'}` });
  };
  const reviewSheet = (ref, page) => {
    if (mode === 'strict') block('STRICT_STATE_SHEET_UNSUPPORTED', ref.id);
    const expected = list(ref.fragments), actual = list(page.fragments);
    if (new Set(actual.map(fragment => fragment?.id)).size !== actual.length) block('DUPLICATE_FRAGMENT', ref.id);
    for (const fragment of actual) if (!expected.some(value => value?.id === fragment?.id)) block('UNEXPECTED_FRAGMENT', `${ref.id}/${fragment?.id}`);
    for (const fragment of expected) {
      const owner = `${ref.id}/${fragment?.id}`, actualFragment = actual.find(value => value?.id === fragment?.id);
      if (!actualFragment) { block('UNVERIFIED_FRAGMENT', owner); continue; }
      const valid = [evidence(actualFragment.screenshot, `screenshot:${owner}`), evidence(actualFragment.capture, `capture:${owner}`), evidence(actualFragment.review, `review:${owner}`)].every(Boolean);
      if (!valid) continue;
      try {
        const capture = parse(actualFragment.capture), review = parse(actualFragment.review), fragmentDigest = sha(JSON.stringify(fragment));
        for (const report of [capture, review]) {
          if (report.schemaVersion !== 1 || report.referenceId !== ref.id || report.fragmentId !== fragment.id || report.fragmentDigest !== fragmentDigest || report.referenceDigest !== referenceDigest || report.implementationDigest !== implementationDigest) block('STALE_FRAGMENT_BINDING', owner);
          if (!sameTarget(report.target, fragment.target)) block('FRAGMENT_TARGET_MISMATCH', owner);
        }
        if (capture.source !== 'browser' || capture.original !== true || !/^https?:\/\/[^\s]+$/.test(capture.url ?? '')) block('NOT_ORIGINAL_BROWSER_CAPTURE', owner);
        if (capture.screenshotSha256 !== actualFragment.screenshot.sha256 || review.reviewScreenshotSha256 !== actualFragment.screenshot.sha256 || review.captureSha256 !== actualFragment.capture.sha256) block('STALE_REVIEW_SCREENSHOT', owner);
        const viewport = fragment.target?.viewport;
        const size = { width: viewport?.width * viewport?.deviceScaleFactor, height: viewport?.height * viewport?.deviceScaleFactor };
        if (!validRect(capture.actualRect, size) || capture.actualRect.width !== fragment.sourceRect?.width || capture.actualRect.height !== fragment.sourceRect?.height) block('INCOMPARABLE_FRAGMENT_RECT', owner);
        if (review.sameViewport !== true || review.sameState !== true) block('STATE_NOT_EQUIVALENT', owner);
        if (review.originalAndActualViewed !== true) block('COMPARISON_NOT_VIEWED', owner);
        const reviewDifferences = reportList(review, 'differences', owner), reviewBlockers = reportList(review, 'blockers', owner);
        if (review.status === 'FAIL' || reviewDifferences.length) differences.push({ code: 'FRAGMENT_REVIEW_FAILED', id: owner });
        else if (review.status !== 'PASS') block('FRAGMENT_REVIEW_NOT_PASSED', owner);
        if (reviewBlockers.length) block('FRAGMENT_REVIEW_NOT_PASSED', owner);
        reviewRegions(list(fragment.regions), review, owner, true);
      } catch { block('INVALID_FRAGMENT_REPORT', owner); }
    }
    for (const finding of reportList(page, 'findings', ref.id)) if (finding.resolved !== true) differences.push({ code: 'OPEN_FINDING', id: `${ref.id}/${finding.id ?? 'unknown'}` });
  };
  if (new Set(pages.map(page => page.id)).size !== pages.length) block('DUPLICATE_PAGE');
  for (const page of pages) if (!ids.includes(page.id)) block('UNEXPECTED_PAGE', page.id);
  for (const ref of refs) {
    const page = pages.find(page => page.id === ref.id);
    if (!page) { block('UNVERIFIED_REFERENCE', ref.id); continue; }
    if (ref.kind === 'state-sheet') { reviewSheet(ref, page); continue; }
    evidence(page.screenshot, `screenshot:${ref.id}`);
    evidence(page.review, `review:${ref.id}`);
    if (page.referenceDigest !== referenceDigest || page.implementationDigest !== implementationDigest) block('STALE_PAGE_BINDING', ref.id);
    if (page.reviewScreenshotSha256 !== page.screenshot?.sha256) block('STALE_REVIEW_SCREENSHOT', ref.id);
    if (page.sameViewport !== true || page.sameState !== true) block('STATE_NOT_EQUIVALENT', ref.id);
    if (page.originalAndActualViewed !== true) block('COMPARISON_NOT_VIEWED', ref.id);
    // Every reference region must be named before implementation; an empty table is not coverage.
    // P2/P3 labels and "non-blocking" prose cannot cancel a known visual mismatch.
    reviewRegions(list(ref.regions), page, ref.id);
    if (mode === 'strict') {
      const valid = [
        evidence(page.contractEvidence, `contract:${ref.id}`),
        evidence(page.contractReference, `contract-reference:${ref.id}`),
        evidence(page.contractActual, `contract-actual:${ref.id}`),
      ].every(Boolean);
      if (valid) {
        try {
          const parse = entry => JSON.parse(read(entry.path).toString('utf8').replace(/^\uFEFF/, ''));
          const report = parse(page.contractEvidence), original = parse(page.contractReference), actual = parse(page.contractActual);
          const strictBlockers = reportList(report, 'blockers', ref.id), strictDifferences = reportList(report, 'differences', ref.id);
          if (report.status !== 'PASS_CONTRACT' || strictBlockers.length || strictDifferences.length) block('STRICT_CONTRACT_NOT_PASSED', ref.id);
          const binding = createInputBinding(original, actual);
          if (!binding || ['algorithm', 'referenceSha256', 'actualSha256'].some(key => report.inputBinding?.[key] !== binding[key])) block('STALE_STRICT_BINDING', ref.id);
          if (original.referenceImage?.sha256 !== ref.image.sha256 || actual.referenceSha256 !== ref.image.sha256 || actual.capture?.screenshotSha256 !== page.screenshot.sha256) block('STRICT_IMAGE_MISMATCH', ref.id);
        } catch { block('INVALID_STRICT_REPORT', ref.id); }
      }
    }
  }
  return {
    status: blockers.length ? 'BLOCKED' : differences.length ? 'FAIL' : 'PASS_SCOPED',
    mode, referenceDigest, implementationDigest, blockers, differences, backendVerification,
    scope: ids,
    limitation: 'Evidence aggregation only. PASS_SCOPED is not a fidelity percentage, user acceptance, or proof of unseen states. Review assertions require independent verification.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath || resolve(inputPath) === resolve(outputPath)) {
    console.error('Usage: node check-delivery.mjs input.json new-result.json (different paths)'); process.exitCode = 2;
  } else {
    try {
      const result = checkDelivery(JSON.parse(readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '')));
      writeFileSync(outputPath, JSON.stringify(result, null, 2), { flag: 'wx' });
      console.log(result.status);
      process.exitCode = result.status === 'PASS_SCOPED' ? 0 : result.status === 'FAIL' ? 1 : 2;
    } catch (error) { console.error(error.message); process.exitCode = 2; }
  }
}
