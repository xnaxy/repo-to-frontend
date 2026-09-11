import { existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const verifierUrl = new URL('../verify-replica.mjs', import.meta.url);
const verifierPath = fileURLToPath(verifierUrl);
const hash = character => character.repeat(64);
const typography = { fontFamily: 'Example Sans', fontSize: '14px', fontWeight: '400', lineHeight: '20px', color: '#172b24' };
const surface = { fill: '#ffffff', stroke: '#172b24' };

function fixture() {
  const reference = structuredClone({
    schemaVersion: 1,
    referenceImage: { sha256: hash('a'), width: 800, height: 600 },
    viewport: { width: 800, height: 600, dpr: 1 },
    state: { route: '/shop/orders', drawer: 'shipment', currency: 'CNY' },
    coverage: { status: 'complete', reviewedBy: 'independent-visual-reviewer', unresolved: [] },
    tolerances: { geometryPx: 2, maxChangedPixels: 0, pixelThreshold: 0 },
    nodes: [
      { id: 'canvas', parent: null, type: 'region', bbox: [0, 0, 800, 600], confidence: 'measured', uncertaintyPx: 0, style: surface },
      { id: 'order', parent: 'canvas', type: 'region', bbox: [20, 40, 360, 250], confidence: 'estimated', uncertaintyPx: 1, style: surface },
      { id: 'dispatch', parent: 'canvas', type: 'region', bbox: [420, 40, 360, 250], confidence: 'measured', uncertaintyPx: 0, style: surface },
      { id: 'order.amount', parent: 'order', type: 'text', bbox: [40, 80, 120, 20], confidence: 'measured', uncertaintyPx: 0, text: '¥ 128.00', style: typography },
      { id: 'order.cart', parent: 'order', type: 'icon', bbox: [180, 80, 20, 20], confidence: 'measured', uncertaintyPx: 0, style: surface, attributes: { d: 'M0 0 L10 0 L10 10 Z', fillRule: 'nonzero' } },
      { id: 'order.checkout', parent: 'order', type: 'control', bbox: [40, 150, 150, 40], confidence: 'measured', uncertaintyPx: 0, text: '确认订单', style: typography, attributes: { role: 'button', disabled: false } },
      { id: 'dispatch.truck', parent: 'dispatch', type: 'image', bbox: [440, 80, 160, 100], confidence: 'measured', uncertaintyPx: 0, style: { objectFit: 'contain' }, assetSha256: hash('c') },
      { id: 'dispatch.route', parent: 'dispatch', type: 'shape', bbox: [440, 200, 260, 20], confidence: 'measured', uncertaintyPx: 0, style: surface, attributes: { d: 'M0 10 L260 10' } },
      { id: 'order.table.price', parent: 'order', type: 'text', bbox: [220, 150, 100, 20], confidence: 'measured', uncertaintyPx: 0, text: '单价 64.00', style: typography },
    ],
    relations: [
      { id: 'order-to-dispatch', from: 'order', to: 'dispatch', direction: 'directed', anchors: [[380, 140], [420, 140]], path: 'M380 140 L420 140' },
    ],
    exceptions: [],
  });
  const actual = {
    schemaVersion: 1,
    referenceSha256: hash('a'),
    viewport: structuredClone(reference.viewport),
    state: structuredClone(reference.state),
    nodes: reference.nodes.map(({ confidence, uncertaintyPx, ...node }) => structuredClone(node)),
    relations: structuredClone(reference.relations),
    inventory: { unmapped: [], complete: true },
    capture: { fontReady: true, imagesReady: true, errors: [], screenshotSha256: hash('b'), dimensions: [800, 600] },
    pixels: { referenceSha256: hash('a'), actualSha256: hash('b'), threshold: 0, changedPixels: 0, mae: 0 },
  };
  return { reference, actual };
}

async function verify(reference, actual) {
  expect(existsSync(verifierPath), 'The requested verifier implementation must exist').toBe(true);
  const module = await import(verifierUrl.href);
  expect(typeof module.verifyReplica).toBe('function');
  return module.verifyReplica(reference, actual);
}

function expectCode(report, bucket, code) {
  expect(report[bucket].some(item => item.code === code), JSON.stringify(report)).toBe(true);
}

test('passes only the complete bound contract, without claiming image perfection', async () => {
  const { reference, actual } = fixture();
  const report = await verify(reference, actual);
  expect(report.status).toBe('PASS_CONTRACT');
  expect(report.blockers).toEqual([]);
  expect(report.differences).toEqual([]);
  expect(JSON.stringify(report)).not.toContain('PIXEL_PERFECT');
});

const mismatchCases = [
  ['missing icon', 'NODE_MISSING', ({ actual }) => actual.nodes.splice(4, 1)],
  ['extra icon', 'NODE_EXTRA', ({ actual }) => actual.nodes.push({ ...actual.nodes[4], id: 'extra-cart' })],
  ['changed numeric precision', 'TEXT_MISMATCH', ({ actual }) => { actual.nodes[3].text = '¥ 128.000000'; }],
  ['changed table unit', 'TEXT_MISMATCH', ({ actual }) => { actual.nodes[8].text = '单价 64 美元'; }],
  ['changed font size', 'STYLE_MISMATCH', ({ actual }) => { actual.nodes[3].style.fontSize = '16px'; }],
  ['changed icon path', 'ATTRIBUTE_MISMATCH', ({ actual }) => { actual.nodes[4].attributes.d = 'M0 0 L20 0'; }],
  ['changed image asset', 'ASSET_HASH_MISMATCH', ({ actual }) => { actual.nodes[6].assetSha256 = hash('d'); }],
  ['moved node', 'BBOX_MISMATCH', ({ actual }) => { actual.nodes[3].bbox[0] += 3; }],
  ['wrong parent region', 'PARENT_MISMATCH', ({ actual }) => { actual.nodes[3].parent = 'dispatch'; }],
  ['reversed arrow endpoints', 'RELATION_ENDPOINT_MISMATCH', ({ actual }) => { actual.relations[0].from = 'dispatch'; actual.relations[0].to = 'order'; }],
  ['changed direction', 'RELATION_DIRECTION_MISMATCH', ({ actual }) => { actual.relations[0].direction = 'undirected'; }],
  ['changed path', 'RELATION_PATH_MISMATCH', ({ actual }) => { actual.relations[0].path = 'M380 140 L400 160 L420 140'; }],
  ['moved arrow anchor', 'RELATION_ANCHOR_MISMATCH', ({ actual }) => { actual.relations[0].anchors[1][1] += 3; }],
  ['missing relation', 'RELATION_MISSING', ({ actual }) => { actual.relations = []; }],
  ['extra relation', 'RELATION_EXTRA', ({ actual }) => actual.relations.push({ ...actual.relations[0], id: 'second-edge' })],
  ['changed data state', 'STATE_MISMATCH', ({ actual }) => { actual.state.currency = 'USD'; }],
  ['closed instead of open drawer', 'STATE_MISMATCH', ({ actual }) => { actual.state.drawer = 'closed'; }],
  ['changed viewport', 'VIEWPORT_MISMATCH', ({ actual }) => { actual.viewport.width = 900; }],
  ['nonzero image change', 'PIXEL_DIFFERENCE', ({ actual }) => { actual.pixels.changedPixels = 1; actual.pixels.mae = 0.001; }],
];

test.each(mismatchCases)('%s fails while retaining concrete difference evidence', async (_name, code, mutate) => {
  const input = fixture();
  mutate(input);
  const report = await verify(input.reference, input.actual);
  expect(report.status).toBe('FAIL');
  expectCode(report, 'differences', code);
});

const blockedCases = [
  ['duplicate node ID', 'DUPLICATE_NODE_ID', ({ actual }) => actual.nodes.push(structuredClone(actual.nodes[3]))],
  ['duplicate edge ID', 'DUPLICATE_RELATION_ID', ({ actual }) => actual.relations.push(structuredClone(actual.relations[0]))],
  ['unknown parent', 'PARENT_NOT_FOUND', ({ actual }) => { actual.nodes[3].parent = 'missing'; }],
  ['cyclic parent graph', 'PARENT_CYCLE', ({ actual }) => { actual.nodes[0].parent = 'order'; }],
  ['unknown edge endpoint', 'RELATION_ENDPOINT_NOT_FOUND', ({ actual }) => { actual.relations[0].to = 'missing'; }],
  ['unknown reference region', 'REFERENCE_CONFIDENCE_UNKNOWN', ({ reference }) => { reference.nodes[0].confidence = 'unknown'; }],
  ['uncertainty exceeds geometry tolerance', 'REFERENCE_UNCERTAINTY_EXCEEDS_TOLERANCE', ({ reference }) => { reference.nodes[1].uncertaintyPx = 3; }],
  ['partial independent coverage', 'COVERAGE_INCOMPLETE', ({ reference }) => { reference.coverage.status = 'partial'; }],
  ['no reviewer identity', 'COVERAGE_REVIEWER_MISSING', ({ reference }) => { reference.coverage.reviewedBy = ''; }],
  ['unresolved reference leaf', 'COVERAGE_UNRESOLVED', ({ reference }) => { reference.coverage.unresolved = ['price.source']; }],
  ['unmapped actual icon', 'INVENTORY_UNMAPPED', ({ actual }) => { actual.inventory.unmapped = ['floating-help']; }],
  ['incomplete actual inventory', 'INVENTORY_INCOMPLETE', ({ actual }) => { actual.inventory.complete = false; }],
  ['wrong image contract binding', 'REFERENCE_HASH_MISMATCH', ({ actual }) => { actual.referenceSha256 = hash('d'); }],
  ['wrong pixel reference binding', 'PIXEL_REFERENCE_HASH_MISMATCH', ({ actual }) => { actual.pixels.referenceSha256 = hash('d'); }],
  ['wrong screenshot binding', 'PIXEL_ACTUAL_HASH_MISMATCH', ({ actual }) => { actual.pixels.actualSha256 = hash('d'); }],
  ['unready fonts', 'FONTS_NOT_READY', ({ actual }) => { actual.capture.fontReady = false; }],
  ['unready images', 'IMAGES_NOT_READY', ({ actual }) => { actual.capture.imagesReady = false; }],
  ['capture errors', 'CAPTURE_ERRORS', ({ actual }) => { actual.capture.errors = ['image decode failed']; }],
  ['no pixel evidence', 'SCHEMA_REQUIRED', ({ actual }) => { delete actual.pixels; }],
  ['no screenshot hash', 'SCHEMA_REQUIRED', ({ actual }) => { delete actual.capture.screenshotSha256; }],
  ['empty reference leaves', 'NODES_EMPTY', ({ reference }) => { reference.nodes = []; }],
  ['empty actual leaves', 'NODES_EMPTY', ({ actual }) => { actual.nodes = []; }],
  ['no style evidence', 'NODE_STYLE_MISSING', ({ reference }) => { delete reference.nodes[3].style; }],
  ['empty style evidence', 'NODE_STYLE_MISSING', ({ actual }) => { actual.nodes[3].style = {}; }],
  ['incomplete text font evidence', 'TEXT_STYLE_INCOMPLETE', ({ reference }) => { delete reference.nodes[3].style.fontFamily; }],
  ['missing text value', 'TEXT_MISSING', ({ reference }) => { delete reference.nodes[3].text; }],
  ['missing shape geometry', 'NODE_ATTRIBUTES_MISSING', ({ reference }) => { delete reference.nodes[4].attributes; }],
  ['missing asset evidence', 'ASSET_HASH_MISSING', ({ reference }) => { delete reference.nodes[6].assetSha256; }],
  ['empty semantic evidence', 'EXCEPTIONS_REQUIRE_NEW_CONTRACT', ({ reference }) => { reference.exceptions = [{ status: 'pending', evidence: '' }]; }],
  ['confirmed correction still needs a new reference contract', 'EXCEPTIONS_REQUIRE_NEW_CONTRACT', ({ reference }) => { reference.exceptions = [{ status: 'confirmed', evidence: 'order specification', id: 'price-fix' }]; }],
  ['missing schema version', 'SCHEMA_VERSION_UNSUPPORTED', ({ actual }) => { delete actual.schemaVersion; }],
  ['unsupported schema version', 'SCHEMA_VERSION_UNSUPPORTED', ({ reference }) => { reference.schemaVersion = 2; }],
  ['non-finite geometry', 'NODE_BBOX_INVALID', ({ actual }) => { actual.nodes[3].bbox[0] = NaN; }],
  ['negative geometry tolerance', 'TOLERANCE_INVALID', ({ reference }) => { reference.tolerances.geometryPx = -1; }],
  ['pixel threshold differs from contract', 'PIXEL_THRESHOLD_MISMATCH', ({ actual }) => { actual.pixels.threshold = 0.1; }],
  ['inconsistent pixel proof', 'PIXEL_EVIDENCE_INCONSISTENT', ({ actual }) => { actual.pixels.mae = 0.1; }],
  ['invalid SHA256', 'HASH_INVALID', ({ reference }) => { reference.referenceImage.sha256 = 'image.png'; }],
];

test.each(blockedCases)('%s blocks overstrong claims', async (_name, code, mutate) => {
  const input = fixture();
  mutate(input);
  const report = await verify(input.reference, input.actual);
  expect(report.status).toBe('BLOCKED');
  expectCode(report, 'blockers', code);
});

test('blocked evidence does not erase independently observed differences', async () => {
  const { reference, actual } = fixture();
  reference.coverage.unresolved = ['route proof'];
  actual.nodes[3].text = '¥ 129.00';
  const report = await verify(reference, actual);
  expect(report.status).toBe('BLOCKED');
  expectCode(report, 'blockers', 'COVERAGE_UNRESOLVED');
  expectCode(report, 'differences', 'TEXT_MISMATCH');
});

test('checks same physical dimensions at DPR 2 without silently resizing', async () => {
  const { reference, actual } = fixture();
  reference.viewport.dpr = actual.viewport.dpr = 2;
  reference.referenceImage.width = 1600;
  reference.referenceImage.height = 1200;
  actual.capture.dimensions = [1600, 1200];
  expect((await verify(reference, actual)).status).toBe('PASS_CONTRACT');
  actual.capture.dimensions = [800, 600];
  const failed = await verify(reference, actual);
  expect(failed.status).toBe('FAIL');
  expectCode(failed, 'differences', 'CAPTURE_DIMENSIONS_MISMATCH');
});

test('accepts measured geometry within the declared tolerance', async () => {
  const { reference, actual } = fixture();
  actual.nodes[3].bbox[0] += 2;
  actual.relations[0].anchors[1][1] += 2;
  expect((await verify(reference, actual)).status).toBe('PASS_CONTRACT');
});

test.each(['reverse', 'bidirectional'])('supports declared %s relations', async direction => {
  const { reference, actual } = fixture();
  reference.relations[0].direction = actual.relations[0].direction = direction;
  expect((await verify(reference, actual)).status).toBe('PASS_CONTRACT');
});

test.each([
  ['directed', 'reverse'],
  ['reverse', 'undirected'],
  ['bidirectional', 'reverse'],
])('a %s relation changed to %s remains a measured difference', async (expected, observed) => {
  const { reference, actual } = fixture();
  reference.relations[0].direction = expected;
  actual.relations[0].direction = observed;
  const report = await verify(reference, actual);
  expect(report.status).toBe('FAIL');
  expectCode(report, 'differences', 'RELATION_DIRECTION_MISMATCH');
});

test('fractional pixel thresholds block even when both evidence documents agree', async () => {
  const { reference, actual } = fixture();
  reference.tolerances.pixelThreshold = actual.pixels.threshold = 0.5;
  const report = await verify(reference, actual);
  expect(report.status).toBe('BLOCKED');
  expectCode(report, 'blockers', 'TOLERANCE_INVALID');
  expectCode(report, 'blockers', 'PIXEL_THRESHOLD_INVALID');
});

test('compares nested style and attribute content instead of stringifying object insertion order', async () => {
  const { reference, actual } = fixture();
  actual.nodes[3].style = Object.fromEntries(Object.entries(actual.nodes[3].style).reverse());
  actual.state = Object.fromEntries(Object.entries(actual.state).reverse());
  expect((await verify(reference, actual)).status).toBe('PASS_CONTRACT');
});

test.each([undefined, null, [], 'untrusted'])('invalid root %s is a structured blocker, never an exception', async value => {
  const { reference, actual } = fixture();
  expect((await verify(value, actual)).status).toBe('BLOCKED');
  expect((await verify(reference, value)).status).toBe('BLOCKED');
});

test('does not mutate either caller-owned contract', async () => {
  const input = fixture();
  const before = structuredClone(input);
  await verify(input.reference, input.actual);
  expect(input).toEqual(before);
});

test('permits declared content nested inside controls and icon SVGs', async () => {
  const { reference, actual } = fixture();
  for (const contract of [reference, actual]) {
    contract.nodes[3].parent = 'order.checkout';
    contract.nodes[7].parent = 'order.cart';
  }
  expect((await verify(reference, actual)).status).toBe('PASS_CONTRACT');
});

test('browser-only style and attribute keys do not invent additional atoms', async () => {
  const { reference, actual } = fixture();
  actual.nodes[3].style.display = 'inline';
  actual.nodes[3].style.paddingLeft = '0px';
  actual.nodes[5].attributes.type = 'button';
  actual.nodes[4].attributes['stroke-linecap'] = 'round';
  expect((await verify(reference, actual)).status).toBe('PASS_CONTRACT');
});

test('every property declared by the reference remains mandatory', async () => {
  const { reference, actual } = fixture();
  reference.nodes[4].attributes['stroke-linecap'] = 'square';
  const report = await verify(reference, actual);
  expect(report.status).toBe('FAIL');
  expectCode(report, 'differences', 'ATTRIBUTE_MISMATCH');
});

test('an empty HTML boolean attribute is explicit evidence, not a missing value', async () => {
  const { reference, actual } = fixture();
  reference.nodes[5].attributes.disabled = actual.nodes[5].attributes.disabled = '';
  expect((await verify(reference, actual)).status).toBe('PASS_CONTRACT');
});

test('empty SVG path evidence still blocks', async () => {
  const { reference, actual } = fixture();
  reference.nodes[4].attributes.d = actual.nodes[4].attributes.d = '';
  const report = await verify(reference, actual);
  expect(report.status).toBe('BLOCKED');
  expectCode(report, 'blockers', 'NODE_ATTRIBUTES_INVALID');
});

test('a region-only inventory cannot pretend to have audited visual leaves', async () => {
  const { reference, actual } = fixture();
  reference.nodes = [reference.nodes[0]];
  actual.nodes = [actual.nodes[0]];
  reference.relations = actual.relations = [];
  const report = await verify(reference, actual);
  expect(report.status).toBe('BLOCKED');
  expectCode(report, 'blockers', 'LEAF_NODES_EMPTY');
});

test.each([
  ['confidence', 'unknown', 'ACTUAL_CONFIDENCE_UNKNOWN'],
  ['uncertaintyPx', 3, 'ACTUAL_UNCERTAINTY_EXCEEDS_TOLERANCE'],
])('explicitly uncertain actual %s evidence cannot pass', async (field, value, code) => {
  const { reference, actual } = fixture();
  actual.nodes[0][field] = value;
  const report = await verify(reference, actual);
  expect(report.status).toBe('BLOCKED');
  expectCode(report, 'blockers', code);
});

test.each(['PASS_CONTRACT', 'FAIL', 'BLOCKED'])('CLI writes the same structured %s report and a meaningful exit code', async wanted => {
  const { reference, actual } = fixture();
  if (wanted === 'FAIL') actual.nodes[3].text = '¥ 129.00';
  if (wanted === 'BLOCKED') actual.capture.fontReady = false;
  await verify(reference, actual);
  const dir = mkdtempSync(join(tmpdir(), 'replica-contract-test-'));
  try {
    const referencePath = join(dir, 'reference.json');
    const actualPath = join(dir, 'actual.json');
    const outPath = join(dir, 'report.json');
    writeFileSync(referencePath, JSON.stringify(reference));
    writeFileSync(actualPath, JSON.stringify(actual));
    const child = spawnSync(process.execPath, [verifierPath, '--reference', referencePath, '--actual', actualPath, '--out', outPath], { encoding: 'utf8', windowsHide: true });
    expect(child.status, child.stderr).toBe(wanted === 'PASS_CONTRACT' ? 0 : wanted === 'FAIL' ? 1 : 2);
    expect(JSON.parse(readFileSync(outPath, 'utf8')).status).toBe(wanted);
    expect(JSON.parse(child.stdout).status).toBe(wanted);
  } finally {
    for (const filename of readdirSync(dir)) unlinkSync(join(dir, filename));
    rmdirSync(dir);
  }
});

test('CLI rejects malformed JSON with a machine-readable blocker', async () => {
  expect(existsSync(verifierPath)).toBe(true);
  const dir = mkdtempSync(join(tmpdir(), 'replica-contract-test-'));
  try {
    const referencePath = join(dir, 'reference.json');
    const actualPath = join(dir, 'actual.json');
    const outPath = join(dir, 'report.json');
    writeFileSync(referencePath, '{');
    writeFileSync(actualPath, '{}');
    const child = spawnSync(process.execPath, [verifierPath, '--reference', referencePath, '--actual', actualPath, '--out', outPath], { encoding: 'utf8', windowsHide: true });
    expect(child.status).toBe(2);
    expectCode(JSON.parse(readFileSync(outPath, 'utf8')), 'blockers', 'INPUT_READ_ERROR');
  } finally {
    for (const filename of readdirSync(dir)) unlinkSync(join(dir, filename));
    rmdirSync(dir);
  }
});

test('every verifier report binds the executing module version', async()=>{
 const {reference,actual}=fixture();const report=await verify(reference,actual);
 expect(report.tool?.name).toBe('verify-replica');expect(report.tool?.sha256).toMatch(/^[a-f0-9]{64}$/);
});

test('reports bind both JSON inputs with explicit canonical serialization', async () => {
  const reference = { z: ['first', 'second'], a: { z: 2, a: 1 } };
  const actual = { state: 'observed' };
  const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
  const report = await verify(reference, actual);
  expect(report.inputBinding).toEqual({
    algorithm: 'sha256-canonical-json-v1',
    referenceSha256: digest('{"a":{"a":1,"z":2},"z":["first","second"]}'),
    actualSha256: digest('{"state":"observed"}'),
  });
  const reordered = await verify({ a: { a: 1, z: 2 }, z: ['first', 'second'] }, actual);
  expect(reordered.inputBinding).toEqual(report.inputBinding);
});

test.each(['reference', 'actual'])('changing %s input changes its report binding', async side => {
  const input = fixture();
  const before = await verify(input.reference, input.actual);
  expect(before.inputBinding?.[side + 'Sha256']).toMatch(/^[a-f0-9]{64}$/);
  input[side].nodes[3].text = '¥ 129.00';
  const after = await verify(input.reference, input.actual);
  expect(after.inputBinding[side + 'Sha256']).not.toBe(before.inputBinding[side + 'Sha256']);
});

test.each(['missing-argument', 'hardlink'])('CLI cannot overwrite frozen input via %s', mode => {
  const dir=mkdtempSync(join(tmpdir(),'replica-collision-test-'));
  try{
    const referencePath=join(dir,'reference.json'),actualPath=join(dir,'actual.json'),outPath=join(dir,'alias.json');
    const frozen='{"frozen":"do not overwrite"}';writeFileSync(referencePath,frozen);writeFileSync(actualPath,'{}');
    let args;
    if(mode==='hardlink'){linkSync(referencePath,outPath);args=['--reference',referencePath,'--actual',actualPath,'--out',outPath]}
    else args=['--reference',referencePath,'--out',referencePath];
    const child=spawnSync(process.execPath,[verifierPath,...args],{encoding:'utf8',windowsHide:true});
    expect(child.status).toBe(2);expect(readFileSync(referencePath,'utf8')).toBe(frozen);
  }finally{for(const filename of readdirSync(dir))unlinkSync(join(dir,filename));rmdirSync(dir)}
});


test('detects moved text even when its container and styles match', async () => {
  const {reference, actual} = fixture();
  reference.nodes[3].textBounds = [40, 80, 74, 18];
  reference.nodes[3].textGeometry = {kind: 'range-layout-boxes-not-ink', coordinateSpace: 'viewport-css-px'};
  actual.nodes[3].textBounds = [47, 80, 74, 18];
  actual.nodes[3].textGeometry = {...reference.nodes[3].textGeometry};
  const report = await verify(reference, actual);
  expectCode(report, 'differences', 'TEXT_BOUNDS_MISMATCH');
});
test('missing measured text evidence blocks a declared text layout', async () => {
  const {reference, actual} = fixture();
  reference.nodes[3].textBounds = [40, 80, 74, 18];
  reference.nodes[3].textGeometry = {kind: 'range-layout-boxes-not-ink', coordinateSpace: 'viewport-css-px'};
  const report = await verify(reference, actual);
  expectCode(report, 'blockers', 'TEXT_GEOMETRY_UNAVAILABLE');
});
test('refuses ink-to-layout comparison and untyped text boxes', async () => {
  for (const kind of ['ink', undefined]) {
    const {reference, actual} = fixture();
    reference.nodes[3].textBounds = [40, 80, 74, 18];
    reference.nodes[3].textGeometry = {kind, coordinateSpace: 'viewport-css-px'};
    const report = await verify(reference, actual);
    expectCode(report, 'blockers', 'TEXT_GEOMETRY_KIND_INVALID');
  }
});
test('accepts compatible measured text and refuses invalid or fragmented unknown boxes', async () => {
  const {reference, actual} = fixture();
  reference.nodes[3].textBounds = [40, 80, 74, 18];
  reference.nodes[3].textGeometry = {kind: 'range-layout-boxes-not-ink', coordinateSpace: 'viewport-css-px'};
  Object.assign(actual.nodes[3], {textBounds:[41, 80, 74, 18], textGeometry:{...reference.nodes[3].textGeometry}});
  expect((await verify(reference, actual)).status).toBe('PASS_CONTRACT');
  actual.nodes[3].textBounds = [40, 80, -1, 18];
  expectCode(await verify(reference, actual), 'blockers', 'TEXT_GEOMETRY_UNAVAILABLE');
});

test('cannot accept sparse text geometry as a measured zero difference', async () => {
  const {reference,actual}=fixture();
  reference.nodes[3].textBounds=[40,80,74,18];
  reference.nodes[3].textGeometry={kind:'range-layout-boxes-not-ink',coordinateSpace:'viewport-css-px'};
  actual.nodes[3].textGeometry={...reference.nodes[3].textGeometry};
  actual.nodes[3].textBounds=new Array(4);
  expectCode(await verify(reference,actual),'blockers','TEXT_GEOMETRY_UNAVAILABLE');
});
