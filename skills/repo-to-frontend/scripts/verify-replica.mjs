#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const NODE_TYPES = new Set(['region', 'text', 'icon', 'shape', 'control', 'image']);
const executingTool={name:'verify-replica',sha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),nodeVersion:process.version};
const TEXT_STYLE = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color'];
const HASH = /^[a-f0-9]{64}$/i;
const own = (object, key) => Object.hasOwn(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonnegative = value => finite(value) && value >= 0;
const positiveInteger = value => Number.isInteger(value) && value > 0;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const hashEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(finite);
const bboxValid = value => vector(value, 4) && value[2] >= 0 && value[3] >= 0;

function jsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (finite(value)) return true;
  if ((!record(value) && !Array.isArray(value)) || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Object.values(value).every(child => jsonValue(child, ancestors));
  ancestors.delete(value);
  return valid;
}

// Canonical JSON v1: UTF-8, sorted object keys, preserved array order, JSON
// primitive encoding, no whitespace. Bind parsed values, not file formatting.
function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + Array.from(value, child => child === undefined ? 'null' : canonicalJson(child)).join(',') + ']';
  if (record(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

export function createInputBinding(reference, actual) {
  if (!jsonValue(reference) || !jsonValue(actual)) return null;
  const digest = value => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
  return { algorithm: 'sha256-canonical-json-v1', referenceSha256: digest(reference), actualSha256: digest(actual) };
}

function reportFor(differences, blockers, counts = {}, inputBinding = null) {
  return {
    schemaVersion: 1,
    status: blockers.length ? 'BLOCKED' : differences.length ? 'FAIL' : 'PASS_CONTRACT',
    scope: 'provided-contract-and-bound-evidence',
    tool: executingTool,
    inputBinding,
    differences,
    blockers,
    counts,
  };
}

/**
 * Validate supplied evidence, never infer missing reference facts.
 * A passing result verifies this contract, not the provenance of caller-supplied evidence.
 */
export function verifyReplica(reference, actual) {
  const inputBinding = createInputBinding(reference, actual);
  const differences = [];
  const blockers = [];
  const issue = (list, code, path, message, expected = null, observed = null) => {
    list.push({ code, path, message, expected, actual: observed });
  };
  const block = (...args) => issue(blockers, ...args);
  const differ = (...args) => issue(differences, ...args);
  const required = (object, key, path) => {
    if (!own(object, key)) {
      block('SCHEMA_REQUIRED', path + '.' + key, 'Required evidence is absent.');
      return false;
    }
    return true;
  };
  const requireObject = (object, key, path) => {
    if (!required(object, key, path)) return {};
    if (!record(object[key])) {
      block('SCHEMA_OBJECT_INVALID', path + '.' + key, 'Expected an object.');
      return {};
    }
    return object[key];
  };
  const requireArray = (object, key, path) => {
    if (!required(object, key, path)) return [];
    if (!Array.isArray(object[key])) {
      block('SCHEMA_ARRAY_INVALID', path + '.' + key, 'Expected an array.');
      return [];
    }
    return object[key];
  };
  const checkHash = (object, key, path, missingCode) => {
    if (!own(object, key)) {
      block(missingCode ?? 'SCHEMA_REQUIRED', path + '.' + key, 'Required SHA256 evidence is absent.');
      return false;
    }
    if (typeof object[key] !== 'string' || !HASH.test(object[key])) {
      block(missingCode ?? 'HASH_INVALID', path + '.' + key, 'Expected a hexadecimal SHA256 digest.');
      return false;
    }
    return true;
  };
  const compare = (code, path, expected, observed, message) => {
    if (!isDeepStrictEqual(expected, observed)) differ(code, path, message, expected, observed);
  };

  if (!record(reference)) block('SCHEMA_ROOT_INVALID', 'reference', 'Reference must be an object.');
  if (!record(actual)) block('SCHEMA_ROOT_INVALID', 'actual', 'Actual must be an object.');
  if (!record(reference) || !record(actual)) return reportFor(differences, blockers, {}, inputBinding);

  for (const [side, contract] of [['reference', reference], ['actual', actual]]) {
    if (contract.schemaVersion !== 1) block('SCHEMA_VERSION_UNSUPPORTED', side + '.schemaVersion', 'Only schemaVersion 1 is supported.', 1, contract.schemaVersion ?? null);
    if (!jsonValue(contract)) block('SCHEMA_NON_JSON_VALUE', side, 'Evidence must contain finite JSON values without cycles.');
  }

  const image = requireObject(reference, 'referenceImage', 'reference');
  const referenceHashValid = checkHash(image, 'sha256', 'reference.referenceImage');
  for (const key of ['width', 'height']) {
    required(image, key, 'reference.referenceImage');
    if (!positiveInteger(image[key])) block('REFERENCE_DIMENSIONS_INVALID', 'reference.referenceImage.' + key, 'Image dimensions must be positive integers.');
  }
  const actualHashValid = checkHash(actual, 'referenceSha256', 'actual');
  if (referenceHashValid && actualHashValid && !hashEqual(image.sha256, actual.referenceSha256)) {
    block('REFERENCE_HASH_MISMATCH', 'actual.referenceSha256', 'Actual evidence belongs to another reference image.', image.sha256, actual.referenceSha256);
  }

  const viewports = {};
  for (const [side, contract] of [['reference', reference], ['actual', actual]]) {
    const viewport = requireObject(contract, 'viewport', side);
    viewports[side] = viewport;
    for (const key of ['width', 'height', 'dpr']) required(viewport, key, side + '.viewport');
    if (!positiveInteger(viewport.width) || !positiveInteger(viewport.height) || !finite(viewport.dpr) || viewport.dpr <= 0) {
      block('VIEWPORT_INVALID', side + '.viewport', 'Viewport requires positive integer CSS dimensions and a positive finite DPR.');
    }
    const state = requireObject(contract, 'state', side);
    if (!Object.keys(state).length || !jsonValue(state)) block('STATE_EVIDENCE_EMPTY', side + '.state', 'Explicit nonempty state evidence is required, including a static-state marker when appropriate.');
  }
  compare('VIEWPORT_MISMATCH', 'viewport', reference.viewport, actual.viewport, 'CSS viewport or DPR differs.');
  compare('STATE_MISMATCH', 'state', reference.state, actual.state, 'Data or interaction state differs.');
  if (positiveInteger(image.width) && positiveInteger(image.height)
      && positiveInteger(viewports.reference.width) && positiveInteger(viewports.reference.height) && finite(viewports.reference.dpr)) {
    const expected = [Math.round(viewports.reference.width * viewports.reference.dpr), Math.round(viewports.reference.height * viewports.reference.dpr)];
    if (!isDeepStrictEqual([image.width, image.height], expected)) {
      block('REFERENCE_CANVAS_MISMATCH', 'reference.referenceImage', 'Reference image dimensions do not match the declared CSS viewport and DPR.', expected, [image.width, image.height]);
    }
  }

  const coverage = requireObject(reference, 'coverage', 'reference');
  for (const key of ['status', 'reviewedBy', 'unresolved']) required(coverage, key, 'reference.coverage');
  if (coverage.status !== 'complete') block('COVERAGE_INCOMPLETE', 'reference.coverage.status', 'Independent reference coverage is not complete.');
  if (!nonempty(coverage.reviewedBy)) block('COVERAGE_REVIEWER_MISSING', 'reference.coverage.reviewedBy', 'An independent reviewer identity is required.');
  if (!Array.isArray(coverage.unresolved) || coverage.unresolved.length) block('COVERAGE_UNRESOLVED', 'reference.coverage.unresolved', 'Reference coverage contains unresolved or unknown evidence.');

  const exceptions = requireArray(reference, 'exceptions', 'reference');
  if (exceptions.length) block('EXCEPTIONS_REQUIRE_NEW_CONTRACT', 'reference.exceptions', 'Pending or confirmed corrections require a new reference contract; they cannot pass the original image contract.');

  const tolerances = requireObject(reference, 'tolerances', 'reference');
  for (const key of ['geometryPx', 'maxChangedPixels', 'pixelThreshold']) required(tolerances, key, 'reference.tolerances');
  if (!nonnegative(tolerances.geometryPx)
      || !Number.isInteger(tolerances.maxChangedPixels) || tolerances.maxChangedPixels < 0
      || !Number.isInteger(tolerances.pixelThreshold) || tolerances.pixelThreshold < 0 || tolerances.pixelThreshold > 255) {
    block('TOLERANCE_INVALID', 'reference.tolerances', 'Geometry tolerance must be nonnegative; changed-pixel allowance an integer; pixel threshold an integer in [0,255].');
  }
  if (positiveInteger(image.width) && positiveInteger(image.height) && tolerances.maxChangedPixels > image.width * image.height) {
    block('TOLERANCE_INVALID', 'reference.tolerances.maxChangedPixels', 'Changed-pixel allowance exceeds the image area.');
  }
  const geometryTolerance = nonnegative(tolerances.geometryPx) ? tolerances.geometryPx : 0;

  function validateNodes(contract, side) {
    const nodes = requireArray(contract, 'nodes', side);
    if (!nodes.length) block('NODES_EMPTY', side + '.nodes', 'An empty atom inventory cannot establish completeness.');
    const map = new Map();
    for (const [index, node] of nodes.entries()) {
      const path = side + '.nodes[' + index + ']';
      if (!record(node)) {
        block('NODE_INVALID', path, 'Node must be an object.');
        continue;
      }
      if (!nonempty(node.id)) block('NODE_ID_INVALID', path + '.id', 'Node requires a nonempty stable ID.');
      else if (map.has(node.id)) block('DUPLICATE_NODE_ID', path + '.id', 'Node IDs must be unique.', node.id, node.id);
      else map.set(node.id, node);
      if (!own(node, 'parent') || (node.parent !== null && !nonempty(node.parent))) block('PARENT_INVALID', path + '.parent', 'Parent must explicitly be null or a node ID.');
      if (!NODE_TYPES.has(node.type)) block('NODE_TYPE_INVALID', path + '.type', 'Unsupported or absent atom type.');
      if (!bboxValid(node.bbox)) block('NODE_BBOX_INVALID', path + '.bbox', 'BBox requires four finite CSS coordinates and nonnegative width/height.');
      if (!record(node.style) || !Object.keys(node.style).length) {
        block('NODE_STYLE_MISSING', path + '.style', 'Every node needs nonempty style evidence.');
      } else if (!Object.values(node.style).every(value => nonempty(value) || finite(value))) {
        block('NODE_STYLE_INVALID', path + '.style', 'Style values must be nonempty strings or finite numbers.');
      }
      if (node.type === 'text') {
        if (typeof node.text !== 'string') block('TEXT_MISSING', path + '.text', 'Text nodes need an exact string, including intentional whitespace.');
        if (!record(node.style) || TEXT_STYLE.some(key => !own(node.style, key) || !(nonempty(node.style[key]) || finite(node.style[key])))) {
          block('TEXT_STYLE_INCOMPLETE', path + '.style', 'Text must specify fontFamily, fontSize, fontWeight, lineHeight and color.');
        }
      } else if (own(node, 'text') && typeof node.text !== 'string') block('TEXT_INVALID', path + '.text', 'Supplied text must be an exact string.');
      if (['icon', 'shape', 'control'].includes(node.type) && (!record(node.attributes) || !Object.keys(node.attributes).length)) {
        block('NODE_ATTRIBUTES_MISSING', path + '.attributes', 'Icons, shapes and controls need explicit geometry or control attributes.');
      }
      if (own(node, 'attributes') && (!record(node.attributes) || !jsonValue(node.attributes)
          || Object.entries(node.attributes).some(([key, value]) => value === null || (['d', 'points', 'path'].includes(key) && !nonempty(value))))) {
        block('NODE_ATTRIBUTES_INVALID', path + '.attributes', 'Attributes must contain known JSON values and nonempty declared geometry; empty HTML boolean attributes are valid.');
      }
      if (node.type === 'image') checkHash(node, 'assetSha256', path, 'ASSET_HASH_MISSING');
      else if (own(node, 'assetSha256')) checkHash(node, 'assetSha256', path);
      if (side === 'reference') {
        if (!['measured', 'estimated', 'unknown'].includes(node.confidence)) block('REFERENCE_CONFIDENCE_INVALID', path + '.confidence', 'Every reference region and atom needs a declared confidence.');
        if (node.confidence === 'unknown') block('REFERENCE_CONFIDENCE_UNKNOWN', path + '.confidence', 'Unknown reference geometry cannot support a passing contract.');
        if (!nonnegative(node.uncertaintyPx)) block('REFERENCE_UNCERTAINTY_INVALID', path + '.uncertaintyPx', 'Reference uncertainty must be explicitly nonnegative.');
        else if (node.uncertaintyPx > geometryTolerance) block('REFERENCE_UNCERTAINTY_EXCEEDS_TOLERANCE', path + '.uncertaintyPx', 'Reference uncertainty exceeds the comparison tolerance.', geometryTolerance, node.uncertaintyPx);
      } else {
        if (own(node, 'confidence') && !['measured', 'estimated', 'unknown'].includes(node.confidence)) block('ACTUAL_CONFIDENCE_INVALID', path + '.confidence', 'Supplied actual confidence must be valid.');
        if (node.confidence === 'unknown') block('ACTUAL_CONFIDENCE_UNKNOWN', path + '.confidence', 'Explicitly unknown actual geometry cannot pass.');
        if (own(node, 'uncertaintyPx') && !nonnegative(node.uncertaintyPx)) block('ACTUAL_UNCERTAINTY_INVALID', path + '.uncertaintyPx', 'Supplied actual uncertainty must be nonnegative.');
        else if (own(node, 'uncertaintyPx') && node.uncertaintyPx > geometryTolerance) block('ACTUAL_UNCERTAINTY_EXCEEDS_TOLERANCE', path + '.uncertaintyPx', 'Actual uncertainty exceeds the comparison tolerance.', geometryTolerance, node.uncertaintyPx);
      }
    }
    for (const [id, node] of map) {
      if (nonempty(node.parent) && !map.has(node.parent)) block('PARENT_NOT_FOUND', side + '.nodes.' + id + '.parent', 'Parent ID is not in this inventory.');
      const seen = new Set([id]);
      let current = node;
      while (current && nonempty(current.parent) && map.has(current.parent)) {
        if (seen.has(current.parent)) {
          block('PARENT_CYCLE', side + '.nodes.' + id + '.parent', 'Parent ancestry contains a cycle.');
          break;
        }
        seen.add(current.parent);
        current = map.get(current.parent);
      }
    }
    if (![...map.values()].some(node => NODE_TYPES.has(node.type) && node.type !== 'region')) {
      block('LEAF_NODES_EMPTY', side + '.nodes', 'Region boundaries alone are not a visual atom inventory.');
    }
    return map;
  }

  const referenceNodes = validateNodes(reference, 'reference');
  const actualNodes = validateNodes(actual, 'actual');
  for (const [id, expected] of referenceNodes) {
    const observed = actualNodes.get(id);
    const path = 'nodes.' + id;
    if (!observed) {
      differ('NODE_MISSING', path, 'Reference atom has no actual counterpart.', id, null);
      continue;
    }
    compare('NODE_TYPE_MISMATCH', path + '.type', expected.type, observed.type, 'Atom type changed.');
    compare('PARENT_MISMATCH', path + '.parent', expected.parent, observed.parent, 'Atom moved to a different parent region.');
    if (bboxValid(expected.bbox) && bboxValid(observed.bbox)
        && expected.bbox.some((coordinate, index) => Math.abs(coordinate - observed.bbox[index]) > geometryTolerance)) {
      differ('BBOX_MISMATCH', path + '.bbox', 'Position or size exceeds the declared CSS-pixel tolerance.', expected.bbox, observed.bbox);
    }
    if (own(expected, 'text') || own(observed, 'text')) compare('TEXT_MISMATCH', path + '.text', expected.text ?? null, observed.text ?? null, 'Exact text, numeric display, unit or whitespace changed.');
    // Opt in only with independently established, compatible layout boxes.
    // Image ink bounds are not DOM Range geometry and must never be compared here.
    if (own(expected, 'textBounds') || own(expected, 'textGeometry')) {
      const compatible = node => record(node.textGeometry)
        && node.textGeometry.kind === 'range-layout-boxes-not-ink'
        && node.textGeometry.coordinateSpace === 'viewport-css-px';
      if (!compatible(expected)) {
        block('TEXT_GEOMETRY_KIND_INVALID', path + '.textGeometry', 'Reference must identify viewport CSS Range layout geometry, not image ink.');
      } else if (!bboxValid(expected.textBounds)) {
        block('TEXT_GEOMETRY_REFERENCE_INVALID', path + '.textBounds', 'Independent reference text layout bounds are missing or invalid.');
      } else if (!compatible(observed) || !bboxValid(observed.textBounds)) {
        block('TEXT_GEOMETRY_UNAVAILABLE', path + '.textBounds', 'Compatible measured text layout is unavailable; element bounds cannot substitute.');
      } else if (expected.textBounds.some((value, index) => Math.abs(value - observed.textBounds[index]) > geometryTolerance)) {
        differ('TEXT_BOUNDS_MISMATCH', path + '.textBounds', 'Text layout position or extent differs despite the element box.', expected.textBounds, observed.textBounds);
      }
    }
    for (const [field, code] of [['style', 'STYLE_MISMATCH'], ['attributes', 'ATTRIBUTE_MISMATCH']]) {
      const left = record(expected[field]) ? expected[field] : {};
      const right = record(observed[field]) ? observed[field] : {};
      for (const key of Object.keys(left)) {
        compare(code, path + '.' + field + '.' + key, left[key] ?? null, right[key] ?? null, 'A reference-declared property differs or is missing from the actual evidence.');
      }
    }
    if ((own(expected, 'assetSha256') || own(observed, 'assetSha256')) && !hashEqual(expected.assetSha256, observed.assetSha256)) {
      differ('ASSET_HASH_MISMATCH', path + '.assetSha256', 'Image asset bytes differ.', expected.assetSha256 ?? null, observed.assetSha256 ?? null);
    }
  }
  for (const id of actualNodes.keys()) if (!referenceNodes.has(id)) differ('NODE_EXTRA', 'nodes.' + id, 'Actual atom is absent from the reference inventory.', null, id);

  function validateRelations(contract, side, nodes) {
    const relations = requireArray(contract, 'relations', side);
    const map = new Map();
    for (const [index, relation] of relations.entries()) {
      const path = side + '.relations[' + index + ']';
      if (!record(relation)) {
        block('RELATION_INVALID', path, 'Relation must be an object.');
        continue;
      }
      if (!nonempty(relation.id)) block('RELATION_ID_INVALID', path + '.id', 'Relation requires a stable ID.');
      else if (map.has(relation.id)) block('DUPLICATE_RELATION_ID', path + '.id', 'Relation IDs must be unique.');
      else map.set(relation.id, relation);
      for (const endpoint of ['from', 'to']) {
        if (!nonempty(relation[endpoint]) || !nodes.has(relation[endpoint])) block('RELATION_ENDPOINT_NOT_FOUND', path + '.' + endpoint, 'Relation endpoint must identify an inventoried node.');
      }
      if (!['directed', 'reverse', 'bidirectional', 'undirected'].includes(relation.direction)) block('RELATION_DIRECTION_INVALID', path + '.direction', 'Relation direction must be directed, reverse, bidirectional or undirected.');
      if (!Array.isArray(relation.anchors) || relation.anchors.length !== 2 || !relation.anchors.every(anchor => vector(anchor, 2))) block('RELATION_ANCHORS_INVALID', path + '.anchors', 'Two measured endpoint anchors are required.');
      if (!nonempty(relation.path)) block('RELATION_PATH_MISSING', path + '.path', 'An actual visible path description is required.');
    }
    return map;
  }
  const referenceRelations = validateRelations(reference, 'reference', referenceNodes);
  const actualRelations = validateRelations(actual, 'actual', actualNodes);
  for (const [id, expected] of referenceRelations) {
    const observed = actualRelations.get(id);
    const path = 'relations.' + id;
    if (!observed) {
      differ('RELATION_MISSING', path, 'Reference relation has no actual counterpart.', id, null);
      continue;
    }
    compare('RELATION_ENDPOINT_MISMATCH', path + '.endpoints', [expected.from, expected.to], [observed.from, observed.to], 'Endpoints or their order differ.');
    compare('RELATION_DIRECTION_MISMATCH', path + '.direction', expected.direction, observed.direction, 'Directedness differs.');
    compare('RELATION_PATH_MISMATCH', path + '.path', expected.path, observed.path, 'Visible route description differs.');
    if (Array.isArray(expected.anchors) && expected.anchors.length === 2 && expected.anchors.every(anchor => vector(anchor, 2))
        && Array.isArray(observed.anchors) && observed.anchors.length === 2 && observed.anchors.every(anchor => vector(anchor, 2))
        && expected.anchors.some((anchor, i) => anchor.some((coordinate, j) => Math.abs(coordinate - observed.anchors[i][j]) > geometryTolerance))) {
      differ('RELATION_ANCHOR_MISMATCH', path + '.anchors', 'Relation anchors exceed the CSS-pixel tolerance.', expected.anchors, observed.anchors);
    }
  }
  for (const id of actualRelations.keys()) if (!referenceRelations.has(id)) differ('RELATION_EXTRA', 'relations.' + id, 'Actual relation is absent from the reference inventory.', null, id);

  const inventory = requireObject(actual, 'inventory', 'actual');
  for (const key of ['complete', 'unmapped']) required(inventory, key, 'actual.inventory');
  if (inventory.complete !== true) block('INVENTORY_INCOMPLETE', 'actual.inventory.complete', 'Actual visual inventory is not complete.');
  if (!Array.isArray(inventory.unmapped) || inventory.unmapped.length) block('INVENTORY_UNMAPPED', 'actual.inventory.unmapped', 'Actual visual elements remain unmapped.');

  const capture = requireObject(actual, 'capture', 'actual');
  for (const key of ['fontReady', 'imagesReady', 'errors', 'dimensions']) required(capture, key, 'actual.capture');
  if (capture.fontReady !== true) block('FONTS_NOT_READY', 'actual.capture.fontReady', 'Font readiness was not confirmed.');
  if (capture.imagesReady !== true) block('IMAGES_NOT_READY', 'actual.capture.imagesReady', 'Image decoding was not confirmed.');
  if (!Array.isArray(capture.errors) || capture.errors.length) block('CAPTURE_ERRORS', 'actual.capture.errors', 'Capture has errors or absent error evidence.');
  const captureHashValid = checkHash(capture, 'screenshotSha256', 'actual.capture');
  const captureDimensionsValid = Array.isArray(capture.dimensions) && capture.dimensions.length === 2 && capture.dimensions.every(positiveInteger);
  if (!captureDimensionsValid) block('CAPTURE_DIMENSIONS_INVALID', 'actual.capture.dimensions', 'Screenshot dimensions must be two positive integers.');
  else {
    compare('CAPTURE_DIMENSIONS_MISMATCH', 'actual.capture.dimensions', [image.width, image.height], capture.dimensions, 'Reference and screenshot have different pixel dimensions; resizing is not implicit.');
    if (positiveInteger(viewports.actual.width) && positiveInteger(viewports.actual.height) && finite(viewports.actual.dpr)) {
      compare('CAPTURE_VIEWPORT_MISMATCH', 'actual.capture.dimensions', [Math.round(viewports.actual.width * viewports.actual.dpr), Math.round(viewports.actual.height * viewports.actual.dpr)], capture.dimensions, 'Screenshot dimensions disagree with actual CSS viewport and DPR.');
    }
  }

  const pixels = requireObject(actual, 'pixels', 'actual');
  const pixelReferenceValid = checkHash(pixels, 'referenceSha256', 'actual.pixels');
  const pixelActualValid = checkHash(pixels, 'actualSha256', 'actual.pixels');
  if (referenceHashValid && pixelReferenceValid && !hashEqual(image.sha256, pixels.referenceSha256)) block('PIXEL_REFERENCE_HASH_MISMATCH', 'actual.pixels.referenceSha256', 'Pixel comparison used another reference image.');
  if (captureHashValid && pixelActualValid && !hashEqual(capture.screenshotSha256, pixels.actualSha256)) block('PIXEL_ACTUAL_HASH_MISMATCH', 'actual.pixels.actualSha256', 'Pixel comparison is not bound to this screenshot.');
  for (const key of ['threshold', 'changedPixels', 'mae']) required(pixels, key, 'actual.pixels');
  if (!Number.isInteger(pixels.threshold) || pixels.threshold < 0 || pixels.threshold > 255) block('PIXEL_THRESHOLD_INVALID', 'actual.pixels.threshold', 'Threshold must be an integer in [0,255].');
  if (pixels.threshold !== tolerances.pixelThreshold) block('PIXEL_THRESHOLD_MISMATCH', 'actual.pixels.threshold', 'Pixel comparison threshold differs from the contract.', tolerances.pixelThreshold ?? null, pixels.threshold ?? null);
  if (!Number.isInteger(pixels.changedPixels) || pixels.changedPixels < 0 || !nonnegative(pixels.mae) || pixels.mae > 255
      || (captureDimensionsValid && pixels.changedPixels > capture.dimensions[0] * capture.dimensions[1])) {
    block('PIXEL_EVIDENCE_INVALID', 'actual.pixels', 'Changed-pixel count and MAE must be finite, nonnegative and physically bounded.');
  } else {
    if ((pixels.changedPixels > 0 && pixels.mae === 0)
        || (pixels.threshold === 0 && pixels.changedPixels === 0 && pixels.mae !== 0)
        || (hashEqual(pixels.referenceSha256, pixels.actualSha256) && (pixels.changedPixels !== 0 || pixels.mae !== 0))) {
      block('PIXEL_EVIDENCE_INCONSISTENT', 'actual.pixels', 'Pixel statistics contradict each other or identical image hashes.');
    }
    if (nonnegative(tolerances.maxChangedPixels) && pixels.changedPixels > tolerances.maxChangedPixels) {
      differ('PIXEL_DIFFERENCE', 'actual.pixels.changedPixels', 'Changed pixels exceed the allowance.', tolerances.maxChangedPixels, pixels.changedPixels);
    }
  }
  return reportFor(differences, blockers, { referenceNodes: referenceNodes.size, actualNodes: actualNodes.size, referenceRelations: referenceRelations.size, actualRelations: actualRelations.size }, inputBinding);
}

function cli(argv) {
  const options = {};
  const allowed = new Set(['--reference', '--actual', '--out']);
  let argumentError = false;
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !nonempty(value) || value.startsWith('--') || own(options, key)) argumentError = true;
    else options[key] = value;
  }
  let report;
  let outputPathVerified=false;
  const commandBlock = (code, message) => reportFor([], [{ code, path: 'cli', message, expected: null, actual: null }]);
  if (argumentError || [...allowed].some(key => !own(options, key))) {
    report = commandBlock('CLI_ARGUMENTS_INVALID', 'Usage: --reference file --actual file --out file');
    delete options['--out'];
  } else {
    try {
      const output=resolve(options['--out']);
      const pathKey=p=>process.platform==='win32'?p.toLowerCase():p;
      const canonical=p=>existsSync(p)?realpathSync.native(p):join(realpathSync.native(dirname(p)),basename(p));
      const collision=['--reference','--actual'].some(key=>{
        const input=resolve(options[key]);
        if(pathKey(canonical(input))===pathKey(canonical(output)))return true;
        if(!existsSync(input)||!existsSync(output))return false;
        const a=statSync(input),b=statSync(output);return a.ino!==0&&a.dev===b.dev&&a.ino===b.ino;
      });
      if(collision){report=commandBlock('OUTPUT_OVERWRITES_INPUT','Output aliases an input file.');delete options['--out'];}
      else if(existsSync(output)&&lstatSync(output).isSymbolicLink()){report=commandBlock('OUTPUT_SYMLINK_REFUSED','Output must not follow a symlink.');delete options['--out'];}
      else outputPathVerified=true;
      const parse = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
      if(!report)report = verifyReplica(parse(options['--reference']), parse(options['--actual']));
    } catch (error) {
      report = commandBlock('INPUT_READ_ERROR', String(error.message));
      // Ambiguous path or unreadable input: report to stdout, never risk an output write.
      if(!outputPathVerified)delete options['--out'];
    }
  }
  if (options['--out']) {
    let temporary;
    try {
      const output=resolve(options['--out']);temporary=join(realpathSync.native(dirname(output)),'.verify-'+randomUUID()+'.tmp');
      writeFileSync(temporary,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
      renameSync(temporary,output);
    } catch (error) {
      report.blockers.push({ code: 'OUTPUT_WRITE_ERROR', path: 'cli.out', message: String(error.message), expected: null, actual: null });
      report.status = 'BLOCKED';
    } finally {if(temporary&&existsSync(temporary))unlinkSync(temporary)}
  }
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exitCode = report.status === 'PASS_CONTRACT' ? 0 : report.status === 'FAIL' ? 1 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli(process.argv.slice(2));
