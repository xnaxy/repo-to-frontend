#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const imageReviewContext = input => digest(JSON.stringify({contractSha256:input?.contract?.sha256,styleAnchorSha256:input?.styleAnchor?.sha256,styleInstructions:input?.styleInstructions}));
const array = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' && value.trim().length > 0;
export function auditImageContract(input, read = path => readFileSync(path)) {
  const blockers = [], issues = [], requirements = [];
  const block = (code, id = '') => blockers.push({ code, id });
  const checkFile = (entry, id) => {
    if (!entry?.path || !/^[a-f0-9]{64}$/i.test(entry.sha256 ?? '')) { block('MISSING_EVIDENCE', id); return null; }
    try { const bytes = read(entry.path); if (digest(bytes) !== entry.sha256.toLowerCase()) { block('STALE_EVIDENCE', id); return null; } return bytes; }
    catch { block('UNREADABLE_EVIDENCE', id); return null; }
  };
  const unique = (items, key, label) => {
    const ids = items.map(item => item?.[key]);
    if (ids.some(id => !text(id)) || new Set(ids).size !== ids.length) block('INVALID_IDS', label);
  };
  if (input?.schemaVersion !== 1) block('INVALID_SCHEMA');
  const bytes = checkFile(input?.contract, 'contract');
  let contract = {};
  if (bytes) { try { contract = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { block('INVALID_CONTRACT'); } }
  const capabilities = array(contract.capabilities), pages = array(contract.pages), images = array(input?.images);
  if (!capabilities.length || !pages.length || contract.scope !== 'backend-product') block('EMPTY_OR_INVALID_CONTRACT');
  if (!array(contract.sourceEvidence).length) block('MISSING_BACKEND_EVIDENCE');
  for (const entry of array(contract.sourceEvidence)) checkFile(entry, 'backend-source');
  unique(capabilities, 'id', 'capabilities'); unique(pages, 'id', 'pages'); unique(images, 'id', 'images');
  checkFile(input?.styleAnchor, 'style-anchor');
  if (!text(input?.styleInstructions)) block('MISSING_STYLE_INVARIANTS');
  for (const cap of capabilities) {
    if (cap.presentation === 'internal') {
      const represented = array(cap.representedBy);
      if (!text(cap.reason) || !represented.length || represented.some(id => !capabilities.some(c => c.id === id && c.presentation === 'visible' && array(c.requirements).length))) block('UNREPRESENTED_INTERNAL_CAPABILITY', cap.id);
      continue;
    }
    if (cap.presentation !== 'visible' || !array(cap.requirements).length) block('UNMAPPED_CAPABILITY', cap.id);
    for (const req of array(cap.requirements)) {
      if (!pages.some(p => p.id === req.pageId) || !['action', 'data', 'state', 'result'].includes(req.kind) || !text(req.expected)) block('INVALID_REQUIREMENT', req.id);
      requirements.push({ ...req, capabilityId: cap.id });
    }
  }
  unique(requirements, 'id', 'requirements');
  const issue = (pageId, code, expected, observed = '', requirementId = null) => issues.push({ pageId, code, requirementId, expected, observed });
  for (const page of pages) {
    const image = images.find(value => value.id === page.id);
    if (!image) { issue(page.id, 'MISSING_IMAGE', '生成本页面/状态的独立参考图'); continue; }
    checkFile(image.image, `image:${page.id}`); checkFile(image.review, `review:${page.id}`);
    if (image.reviewedImageSha256 !== image.image?.sha256 || image.inventoryComplete !== true || image.viewed !== true) block('INCOMPLETE_IMAGE_REVIEW', page.id);
    if (image.reviewContextDigest !== imageReviewContext(input)) block('STALE_REVIEW_CONTEXT', page.id);
    if (image.styleStatus === 'DRIFT') issue(page.id, 'STYLE_DRIFT', input.styleInstructions, image.styleObserved ?? '');
    else if (image.styleStatus !== 'MATCH') block('UNVERIFIED_STYLE', page.id);
    const observed = array(image.elements); unique(observed, 'id', `elements:${page.id}`);
    for (const req of requirements.filter(req => req.pageId === page.id)) {
      const matches = observed.filter(el => el.kind !== 'decoration' && el.requirementId === req.id && el.capabilityId === req.capabilityId);
      if (!matches.length) issue(page.id, 'MISSING_BACKEND_CONTENT', req.expected, '', req.id);
      else if (matches.length !== 1) block('AMBIGUOUS_REQUIREMENT_MAPPING', req.id);
    }
    for (const el of observed) {
      if (el.kind === 'decoration') continue;
      const req = requirements.find(req => req.id === el.requirementId && req.capabilityId === el.capabilityId && req.pageId === page.id);
      if (!req) issue(page.id, 'UNSUPPORTED_IMAGE_CONTENT', '删除无后端依据的内容，不新增接口迎合图片', el.observed ?? el.id);
      else if (el.status === 'MISMATCH' || el.kind !== req.kind) issue(page.id, 'CONTRACT_MISMATCH', req.expected, el.observed ?? '', req.id);
      else if (el.status !== 'MATCH') block('UNRESOLVED_IMAGE_CONTENT', el.id);
    }
  }
  for (const image of images) if (!pages.some(page => page.id === image.id)) issue(image.id, 'UNPLANNED_IMAGE', '先核实该页面范围，不把图片新增追认为后端能力');
  const contractProblem = blockers.some(b => ['INVALID_CONTRACT','EMPTY_OR_INVALID_CONTRACT','MISSING_BACKEND_EVIDENCE','UNREPRESENTED_INTERNAL_CAPABILITY','UNMAPPED_CAPABILITY','INVALID_REQUIREMENT'].includes(b.code) || b.id === 'contract' || b.id === 'backend-source');
  const status = contractProblem ? 'BLOCKED_CONTRACT' : blockers.length ? 'AUDIT_INCOMPLETE' : issues.length ? 'REPAIR_IMAGES' : 'READY_FOR_REPLICA';
  return {
    schemaVersion: 1, status, inputDigest: digest(JSON.stringify(input)), contractSha256: input?.contract?.sha256,
    images: images.map(image => ({ id: image.id, image: image.image })), requirements,
    blockers, issues,
    feedback: {
      readyToSend: status === 'REPAIR_IMAGES',
      affectedImageIds: [...new Set(issues.map(item => item.pageId))],
      styleAnchor: input?.styleAnchor, styleInstructions: input?.styleInstructions,
      issues,
      instructions: '整轮审查完成后一次整理全部问题。使用原图与风格锚点按原风格修正受影响图片，保持未涉问题的布局、字体层级、配色、密度和正确内容；不创建后端不支持的能力。每张图的实际请求必须带入相关问题的具体期望与观察值。返回后重新检查全部要求及新回归，不能只勾掉旧问题。',
    },
    limitation: 'Checks supplied contract and human visual inventory, not automatic image understanding or backend discovery. READY_FOR_REPLICA is not user image approval or frontend completion.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination || resolve(source) === resolve(destination)) throw Error('Usage: node audit-image-contract.mjs input.json new-round-result.json');
    const result = auditImageContract(JSON.parse(readFileSync(source, 'utf8').replace(/^\uFEFF/, '')));
    writeFileSync(destination, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(result.status); process.exitCode = result.status === 'READY_FOR_REPLICA' ? 0 : result.status === 'REPAIR_IMAGES' ? 1 : 2;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
