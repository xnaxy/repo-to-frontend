#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInputBinding } from './verify-replica.mjs';
import { auditImageContract } from './audit-image-contract.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const list = value => Array.isArray(value) ? value : [];
const dimensions = ['state', 'coverage', 'structure', 'content', 'appearance', 'interaction'];

// This aggregates evidence; it does not independently judge images or authenticate user messages.
export function checkDelivery(input, read = path => readFileSync(path)) {
  const blockers = [], differences = [], backendVerification = [];
  const block = (code, id = '') => blockers.push({ code, id });
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
  if (!refs.length) block('NO_REFERENCE_SCOPE');
  const ids = refs.map(ref => ref.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) block('INVALID_REFERENCE_IDS');
  for (const ref of refs) evidence(ref.image, `reference:${ref.id}`);
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
  const referenceDigest = sha(JSON.stringify(refs));
  const implementationDigest = sha(JSON.stringify(implementation));
  if (!['visual-only','backend-product'].includes(input?.scope)) block('MISSING_DELIVERY_SCOPE');
  if (input?.scope === 'backend-product') {
    const valid = [evidence(input.imageAudit?.input,'image-audit-input'), evidence(input.imageAudit?.result,'image-audit-result')].every(Boolean);
    if (valid) {
      try {
        const parse = entry => JSON.parse(read(entry.path).toString('utf8').replace(/^\uFEFF/,''));
        const auditInput = parse(input.imageAudit.input), saved = parse(input.imageAudit.result), current = auditImageContract(auditInput,read);
        if (current.status !== 'READY_FOR_REPLICA' || saved.status !== 'READY_FOR_REPLICA' || saved.inputDigest !== current.inputDigest) block('IMAGE_CONTRACT_NOT_READY');
        if (current.images.length !== refs.length || current.images.some(image => !refs.some(ref => ref.id === image.id && ref.image.sha256 === image.image?.sha256))) block('IMAGE_SET_MISMATCH');
        const coverage = list(input.backendCoverage);
        if (new Set(coverage.map(row=>row.requirementId)).size !== coverage.length) block('DUPLICATE_BACKEND_COVERAGE');
        for (const req of current.requirements) {
          const row = coverage.find(row=>row.requirementId === req.id && row.capabilityId === req.capabilityId && row.pageId === req.pageId);
          if (!row?.selector || !evidence(row?.verification,`backend:${req.id}`)) { block('BACKEND_NOT_IMPLEMENTED',req.id); continue; }
          const check = parse(row.verification);
          const verified = check.status === 'PASS' && check.requirementId === req.id && check.capabilityId === req.capabilityId && check.pageId === req.pageId && check.selector === row.selector && check.implementationDigest === implementationDigest && check.imageAuditDigest === current.inputDigest && ['LIVE','MOCK','STATIC'].includes(check.integration);
          if (!verified) block('BACKEND_VERIFICATION_NOT_PASSED',req.id);
          backendVerification.push({requirementId:req.id,status:verified?'PASS':'BLOCKED',integration:check.integration??'UNKNOWN',liveBackend:verified?(check.integration==='LIVE'?'PASS_REPORTED':'NOT_RUN'):'NOT_VERIFIED'});
        }
        for (const row of coverage) if (!current.requirements.some(req=>req.id===row.requirementId)) block('UNEXPECTED_BACKEND_COVERAGE',row.requirementId);
      } catch { block('INVALID_IMAGE_OR_BACKEND_REPORT'); }
    }
  }
  if (new Set(pages.map(page => page.id)).size !== pages.length) block('DUPLICATE_PAGE');
  for (const page of pages) if (!ids.includes(page.id)) block('UNEXPECTED_PAGE', page.id);
  for (const ref of refs) {
    const page = pages.find(page => page.id === ref.id);
    if (!page) { block('UNVERIFIED_REFERENCE', ref.id); continue; }
    evidence(page.screenshot, `screenshot:${ref.id}`);
    evidence(page.review, `review:${ref.id}`);
    if (page.referenceDigest !== referenceDigest || page.implementationDigest !== implementationDigest) block('STALE_PAGE_BINDING', ref.id);
    if (page.reviewScreenshotSha256 !== page.screenshot?.sha256) block('STALE_REVIEW_SCREENSHOT', ref.id);
    if (page.sameViewport !== true || page.sameState !== true) block('STATE_NOT_EQUIVALENT', ref.id);
    if (page.originalAndActualViewed !== true) block('COMPARISON_NOT_VIEWED', ref.id);
    // Every reference region must be named before implementation; an empty table is not coverage.
    const expected = list(ref.regions), observed = list(page.regions);
    if (!expected.length || new Set(expected).size !== expected.length || expected.some(id => typeof id !== 'string' || !id)) block('MISSING_REGION_INVENTORY', ref.id);
    if (new Set(observed.map(region => region.id)).size !== observed.length) block('DUPLICATE_REGION', ref.id);
    for (const region of observed) if (!expected.includes(region.id)) block('UNEXPECTED_REGION', `${ref.id}/${region.id}`);
    for (const id of expected) {
      const region = observed.find(value => value.id === id);
      if (!region) { block('UNVERIFIED_REGION', `${ref.id}/${id}`); continue; }
      for (const dimension of dimensions) {
        const status = region[dimension];
        if (status === 'FAIL') differences.push({ code: dimension.toUpperCase(), id: `${ref.id}/${id}` });
        else if (status !== 'PASS') block('UNVERIFIED_' + dimension.toUpperCase(), `${ref.id}/${id}`);
      }
    }
    // P2/P3 labels and "non-blocking" prose cannot cancel a known visual mismatch.
    for (const finding of list(page.findings)) {
      if (finding.resolved !== true) differences.push({ code: 'OPEN_FINDING', id: `${ref.id}/${finding.id ?? 'unknown'}` });
    }
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
          if (report.status !== 'PASS_CONTRACT' || list(report.blockers).length || list(report.differences).length) block('STRICT_CONTRACT_NOT_PASSED', ref.id);
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
