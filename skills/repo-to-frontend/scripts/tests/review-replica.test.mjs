import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { verifyReplica } from '../verify-replica.mjs';

const require = createRequire(join(process.env.REVIEW_TEST_PACKAGE_ROOT ?? process.env.INIT_CWD ?? process.cwd(), 'package.json'));
const { JSDOM } = require('jsdom');
const toolUrl = new URL('../review-replica.mjs', import.meta.url);
const toolPath = fileURLToPath(toolUrl);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(width, height, value = 255) {
  const chunk = (name, data) => {
    const body = Buffer.concat([Buffer.from(name), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.alloc(width * 4 + 1, value);
  row[0] = 0;
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

function fixture(dpr = 1) {
  const original = png(800 * dpr, 600 * dpr);
  const current = png(800 * dpr, 600 * dpr, 254);
  const reference = {
    schemaVersion: 1,
    referenceImage: { sha256: digest(original), width: 800 * dpr, height: 600 * dpr },
    viewport: { width: 800, height: 600, dpr },
    state: { route: '/orders', drawer: 'shipment' },
    coverage: { status: 'complete', reviewedBy: 'Independent review', unresolved: [] },
    tolerances: { geometryPx: 2, maxChangedPixels: 0, pixelThreshold: 0 },
    nodes: [
      { id: 'orders', parent: null, type: 'region', bbox: [0, 0, 800, 600], confidence: 'measured', uncertaintyPx: 0, style: { backgroundColor: '#fff' } },
      { id: 'order.total', parent: 'orders', type: 'text', bbox: [40, 80, 100, 20], confidence: 'estimated', uncertaintyPx: 1, text: '¥ 128.00', style: { fontFamily: 'Example Sans', fontSize: '14px', fontWeight: '400', lineHeight: '20px', color: '#172b24' } },
      { id: 'shipment.icon', parent: 'orders', type: 'icon', bbox: [220, 100, 24, 24], confidence: 'measured', uncertaintyPx: 0, style: { fill: 'none' }, attributes: { d: 'M0 0 L24 24' } },
    ],
    relations: [],
    exceptions: [],
  };
  const actual = {
    schemaVersion: 1,
    referenceSha256: digest(original),
    viewport: structuredClone(reference.viewport),
    state: structuredClone(reference.state),
    nodes: structuredClone(reference.nodes),
    relations: [],
    inventory: { complete: true, unmapped: [] },
    capture: { fontReady: true, imagesReady: true, errors: [], screenshotSha256: digest(current), dimensions: [800 * dpr, 600 * dpr] },
    pixels: { referenceSha256: digest(original), actualSha256: digest(current), threshold: 0, changedPixels: 480000 * dpr * dpr, mae: 1 },
  };
  const verification = verifyReplica(reference, actual);
  const images = { reference: 'data:image/png;base64,' + original.toString('base64'), current: 'data:image/png;base64,' + current.toString('base64') };
  return { reference, actual, verification, images, original, current };
}

function passingFixture() {
  const input = fixture();
  input.current = input.original;
  input.images.current = input.images.reference;
  input.actual.capture.screenshotSha256 = input.actual.pixels.actualSha256 = digest(input.original);
  input.actual.pixels.changedPixels = input.actual.pixels.mae = 0;
  input.verification = verifyReplica(input.reference, input.actual);
  return input;
}

async function rendered(input = fixture()) {
  expect(existsSync(toolPath), 'The requested review generator must exist').toBe(true);
  const { renderReview } = await import(toolUrl.href);
  return renderReview(input.reference, input.actual, input.verification, input.images);
}

async function page(input = fixture()) {
  return new JSDOM(await rendered(input), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'file:///local-review.html' });
}

function change(window, id, value) {
  const field = window.document.getElementById(id);
  field.value = value;
  field.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function select(window, id) {
  const button = [...window.document.querySelectorAll('#atom-list button')].find(element => element.dataset.atomId === id);
  expect(button, 'Atom button ' + id).toBeTruthy();
  button.click();
}

test('labels the output as an audit tool and limits the meaning of PASS_CONTRACT', async () => {
  const input = passingFixture();
  const dom = await page(input);
  const text = dom.window.document.body.textContent;
  expect(text).toContain('审查工具');
  expect(text).toContain('PASS_CONTRACT');
  expect(text).toContain('不代表原图像素完全一致');
  expect(text).toContain('并非复刻结果');
  dom.window.close();
});

test.each(['reference', 'actual'])('an old PASS report cannot accept changed %s inputs', async side => {
  const input = passingFixture();
  const originalReport = structuredClone(input.verification);
  expect(originalReport.status).toBe('PASS_CONTRACT');
  input[side].nodes[1].text = '¥ 129.00';
  expect(verifyReplica(input.reference, input.actual).status).toBe('FAIL');
  const dom = await page(input);
  expect(dom.window.document.getElementById('verification-status').dataset.status).toBe('BLOCKED');
  expect(dom.window.document.getElementById('verification-binding').textContent).toContain('VERIFICATION_INPUT_MISMATCH');
  expect(JSON.parse(dom.window.document.getElementById('full-report').textContent)).toEqual(originalReport);
  expect(input.verification).toEqual(originalReport);
  dom.window.close();
});

test('a report without input binding is blocked and preserved for inspection', async () => {
  const input = passingFixture();
  delete input.verification.inputBinding;
  const dom = await page(input);
  expect(dom.window.document.getElementById('verification-status').dataset.status).toBe('BLOCKED');
  expect(dom.window.document.getElementById('verification-binding').textContent).toContain('VERIFICATION_BINDING_MISSING');
  expect(JSON.parse(dom.window.document.getElementById('full-report').textContent).status).toBe('PASS_CONTRACT');
  dom.window.close();
});

test.each(['PASS_CONTRACT', 'FAIL', 'BLOCKED'])('a matching bound %s report retains its status', async status => {
  const input = status === 'PASS_CONTRACT' ? passingFixture() : fixture();
  if (status === 'BLOCKED') input.actual.capture.fontReady = false;
  input.verification = verifyReplica(input.reference, input.actual);
  expect(input.verification.status).toBe(status);
  const dom = await page(input);
  expect(dom.window.document.getElementById('verification-status').dataset.status).toBe(status);
  expect(dom.window.document.getElementById('verification-binding').dataset.valid).toBe('true');
  expect(JSON.parse(dom.window.document.getElementById('full-report').textContent)).toEqual(input.verification);
  dom.window.close();
});

test('untrusted exact text, styles and reviewer names remain text rather than executable HTML', async () => {
  const input = fixture();
  const attack = '</script><script>window.injected = true</script><img src=x onerror="window.injected=true">';
  input.reference.nodes[1].text = input.actual.nodes[1].text = attack;
  input.reference.coverage.reviewedBy = attack;
  input.reference.nodes[1].style.fontFamily = attack;
  const dom = await page(input);
  select(dom.window, 'order.total');
  expect(dom.window.injected).toBeUndefined();
  expect(JSON.parse(dom.window.document.getElementById('reference-detail').textContent).text).toBe(attack);
  expect(dom.window.document.querySelectorAll('script')).toHaveLength(1);
  expect([...dom.window.document.images].every(image => image.src.startsWith('data:image/png;base64,'))).toBe(true);
  dom.window.close();
});

test('missing actual atoms remain selectable and explicitly missing', async () => {
  const input = fixture();
  input.actual.nodes.splice(2, 1);
  input.verification.differences.push({ code: 'NODE_MISSING', path: 'nodes.shipment.icon', message: 'Missing icon' });
  const dom = await page(input);
  select(dom.window, 'shipment.icon');
  expect(dom.window.document.getElementById('actual-detail').textContent).toContain('MISSING');
  expect(dom.window.document.getElementById('difference-detail').textContent).toContain('NODE_MISSING');
  expect(dom.window.document.querySelector('[data-box-side="reference"][data-atom-id="shipment.icon"]')).toBeTruthy();
  expect(dom.window.document.querySelector('[data-box-side="actual"][data-atom-id="shipment.icon"]')).toBeNull();
  dom.window.close();
});

test('atom search matches ID and exact displayed content', async () => {
  const dom = await page();
  const search = dom.window.document.getElementById('atom-search');
  search.value = '128.00';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const buttons = [...dom.window.document.querySelectorAll('#atom-list button')];
  expect(buttons).toHaveLength(1);
  expect(buttons[0].dataset.atomId).toBe('order.total');
  search.value = 'shipment';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  expect(dom.window.document.querySelector('#atom-list button').dataset.atomId).toBe('shipment.icon');
  dom.window.close();
});

test('selection draws separate reference and actual CSS-pixel rectangles and exposes matching errors', async () => {
  const input = fixture();
  input.actual.nodes[1].bbox = [43, 84, 120, 22];
  input.verification.differences.push({ code: 'BBOX_MISMATCH', path: 'nodes.order.total.bbox', message: 'Moved' });
  const dom = await page(input);
  select(dom.window, 'order.total');
  const original = dom.window.document.querySelector('[data-box-side="reference"][data-atom-id="order.total"]');
  const current = dom.window.document.querySelector('[data-box-side="actual"][data-atom-id="order.total"]');
  expect([original.style.left, original.style.top, original.style.width, original.style.height]).toEqual(['40px', '80px', '100px', '20px']);
  expect([current.style.left, current.style.top, current.style.width, current.style.height]).toEqual(['43px', '84px', '120px', '22px']);
  expect(dom.window.document.getElementById('difference-detail').textContent).toContain('BBOX_MISMATCH');
  dom.window.close();
});

test('DPR 2 divides PNG physical size but never doubles node CSS coordinates', async () => {
  const dom = await page(fixture(2));
  change(dom.window, 'view-mode', 'overlay');
  select(dom.window, 'order.total');
  const image = dom.window.document.querySelector('.reference-image');
  const box = dom.window.document.querySelector('[data-box-side="reference"][data-atom-id="order.total"]');
  expect(image.style.width).toBe('800px');
  expect(image.style.height).toBe('600px');
  expect(box.style.left).toBe('40px');
  expect(dom.window.document.querySelector('#view-mode option[value="overlay"]').disabled).toBe(false);
  expect(dom.window.document.getElementById('canvas-metadata').textContent).toContain('1600');
  expect(dom.window.document.getElementById('canvas-metadata').textContent).toContain('DPR 2');
  dom.window.close();
});

test('mismatched PNG physical dimensions disable misleading overlay but keep single views', async () => {
  const input = fixture();
  const other = png(790, 600);
  input.images.current = 'data:image/png;base64,' + other.toString('base64');
  input.actual.capture.screenshotSha256 = input.actual.pixels.actualSha256 = digest(other);
  input.actual.capture.dimensions = [790, 600];
  const dom = await page(input);
  expect(dom.window.document.querySelector('#view-mode option[value="overlay"]').disabled).toBe(true);
  expect(dom.window.document.getElementById('overlay-warning').textContent).toContain('尺寸');
  change(dom.window, 'view-mode', 'overlay');
  expect(dom.window.document.getElementById('view-mode').value).not.toBe('overlay');
  change(dom.window, 'view-mode', 'current');
  expect(dom.window.document.querySelector('.actual-image')).toBeTruthy();
  dom.window.close();
});

test('different DPR declarations do not pass merely because CSS viewport dimensions match', async () => {
  const input = fixture();
  const other = png(1600, 1200);
  input.images.current = 'data:image/png;base64,' + other.toString('base64');
  input.actual.viewport.dpr = 2;
  input.actual.capture.screenshotSha256 = input.actual.pixels.actualSha256 = digest(other);
  input.actual.capture.dimensions = [1600, 1200];
  const dom = await page(input);
  expect(dom.window.document.querySelector('#view-mode option[value="overlay"]').disabled).toBe(true);
  expect(dom.window.document.getElementById('overlay-warning').textContent).toContain('DPR');
  dom.window.close();
});

test('overlay opacity, native size and hide-box controls work without a server', async () => {
  const dom = await page();
  change(dom.window, 'view-mode', 'overlay');
  const opacity = dom.window.document.getElementById('overlay-opacity');
  opacity.value = '30';
  opacity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  expect(dom.window.document.querySelector('.actual-image').style.opacity).toBe('0.3');
  change(dom.window, 'scale-mode', 'native');
  expect(dom.window.document.getElementById('stage').style.transform).toBe('scale(1)');
  const show = dom.window.document.getElementById('show-boxes');
  show.checked = false;
  show.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  expect([...dom.window.document.querySelectorAll('.boxes')].every(layer => layer.hidden)).toBe(true);
  expect(dom.window.document.querySelector('script[src], link[href]')).toBeNull();
  dom.window.close();
});

test('unknown confidence and incomplete coverage are not silently accepted', async () => {
  const input = fixture();
  input.reference.nodes[0].confidence = 'unknown';
  input.reference.coverage.status = 'partial';
  input.reference.coverage.unresolved = ['shipment.signature'];
  input.verification = { schemaVersion: 1, status: 'BLOCKED', differences: [], blockers: [{ code: 'REFERENCE_CONFIDENCE_UNKNOWN', path: 'reference.nodes[0].confidence', message: 'Unknown region' }] };
  const dom = await page(input);
  select(dom.window, 'orders');
  expect(dom.window.document.getElementById('coverage-limits').textContent).toContain('partial');
  expect(dom.window.document.getElementById('reference-detail').textContent).toContain('unknown');
  expect(dom.window.document.getElementById('difference-detail').textContent).toContain('REFERENCE_CONFIDENCE_UNKNOWN');
  dom.window.close();
});

test('rejects remote or SVG image payloads instead of requesting external resources', async () => {
  const input = fixture();
  input.images.reference = 'https://example.invalid/reference.png';
  await expect(rendered(input)).rejects.toThrow(/PNG|本地|data/i);
  input.images.reference = 'data:image/svg+xml,<svg onload="alert(1)"/>';
  await expect(rendered(input)).rejects.toThrow(/PNG|本地|data/i);
});

test('rendering preserves all caller-owned inputs', async () => {
  const input = fixture();
  const before = structuredClone(input);
  await rendered(input);
  expect(input.reference).toEqual(before.reference);
  expect(input.actual).toEqual(before.actual);
  expect(input.verification).toEqual(before.verification);
  expect(input.images).toEqual(before.images);
});

function writeInputs(dir, input) {
  const files = {
    '--reference': join(dir, 'reference.json'), '--actual': join(dir, 'actual.json'),
    '--reference-image': join(dir, 'reference.png'), '--current-image': join(dir, 'current.png'),
    '--verification': join(dir, 'verification.json'),
  };
  writeFileSync(files['--reference'], JSON.stringify(input.reference));
  writeFileSync(files['--actual'], JSON.stringify(input.actual));
  writeFileSync(files['--reference-image'], input.original);
  writeFileSync(files['--current-image'], input.current);
  writeFileSync(files['--verification'], JSON.stringify(input.verification));
  return files;
}

function cleanup(dir) {
  for (const filename of readdirSync(dir)) unlinkSync(join(dir, filename));
  rmdirSync(dir);
}

test('CLI produces a local self-contained HTML file and preserves every input', async () => {
  const input = fixture();
  await rendered(input);
  const dir = mkdtempSync(join(tmpdir(), 'replica-review-test-'));
  try {
    const files = writeInputs(dir, input);
    const before = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, digest(readFileSync(file))]));
    const out = join(dir, 'review.html');
    const child = spawnSync(process.execPath, [toolPath, ...Object.entries(files).flat(), '--out', out], { encoding: 'utf8', windowsHide: true });
    expect(child.status, child.stderr + child.stdout).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('data:image/png;base64,');
    expect(readFileSync(out, 'utf8')).toContain('审查工具');
    for (const [key, file] of Object.entries(files)) expect(digest(readFileSync(file))).toBe(before[key]);
  } finally { cleanup(dir); }
});

test.each(['--reference', '--actual', '--reference-image', '--current-image', '--verification'])('CLI refuses to overwrite %s', async target => {
  const input = fixture();
  await rendered(input);
  const dir = mkdtempSync(join(tmpdir(), 'replica-review-test-'));
  try {
    const files = writeInputs(dir, input);
    const before = digest(readFileSync(files[target]));
    const child = spawnSync(process.execPath, [toolPath, ...Object.entries(files).flat(), '--out', files[target]], { encoding: 'utf8', windowsHide: true });
    expect(child.status).toBe(2);
    expect(JSON.parse(child.stdout).errors.some(error => error.code === 'OUTPUT_OVERWRITES_INPUT')).toBe(true);
    expect(digest(readFileSync(files[target]))).toBe(before);
  } finally { cleanup(dir); }
});
