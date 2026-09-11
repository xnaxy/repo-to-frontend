#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInputBinding } from './verify-replica.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finitePositive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sameHash = (left, right) => typeof left === 'string' && typeof right === 'string' && left.toLowerCase() === right.toLowerCase();
const dimensionsEqual = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === 2 && right.length === 2 && left.every((value, index) => value === right[index]);

function pngInfo(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
    throw new Error('只接受本地 PNG 的 base64 dataURL；不读取远程图片或 SVG。');
  }
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('PNG 文件头无效，不能确定图片尺寸。');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) throw new Error('PNG 物理尺寸必须大于零。');
  return { width, height, sha256: sha(bytes) };
}

function comparisonMetadata(reference, actual, imageInfo) {
  const warnings = [];
  const sides = {};
  for (const side of ['reference', 'actual']) {
    const contract = side === 'reference' ? reference : actual;
    const image = imageInfo[side];
    const viewport = object(contract.viewport) ? contract.viewport : {};
    const valid = finitePositive(viewport.width) && finitePositive(viewport.height) && finitePositive(viewport.dpr);
    if (!valid) warnings.push(side + ' 的 CSS 视口或 DPR 未知。');
    const dpr = finitePositive(viewport.dpr) ? viewport.dpr : 1;
    sides[side] = { ...image, dpr, cssWidth: image.width / dpr, cssHeight: image.height / dpr, viewport };
    if (valid && !dimensionsEqual([image.width, image.height], [Math.round(viewport.width * dpr), Math.round(viewport.height * dpr)])) {
      warnings.push(side + ' PNG物理尺寸与 CSS视口 × DPR 不一致。');
    }
  }
  if (!dimensionsEqual([imageInfo.reference.width, imageInfo.reference.height], [imageInfo.actual.width, imageInfo.actual.height])) warnings.push('两张PNG物理尺寸不同。');
  if (reference.viewport?.dpr !== actual.viewport?.dpr) warnings.push('两边 DPR 声明不同。');
  if (reference.viewport?.width !== actual.viewport?.width || reference.viewport?.height !== actual.viewport?.height) warnings.push('两边 CSS视口尺寸不同。');
  if (!dimensionsEqual([reference.referenceImage?.width, reference.referenceImage?.height], [imageInfo.reference.width, imageInfo.reference.height])) warnings.push('原图合同尺寸与实际原图PNG不同或未知。');
  if (!dimensionsEqual(actual.capture?.dimensions, [imageInfo.actual.width, imageInfo.actual.height])) warnings.push('capture.dimensions 与当前PNG尺寸不同或未知。');
  for (const [expected, observed, name] of [
    [imageInfo.reference.sha256, reference.referenceImage?.sha256, '原图合同'],
    [imageInfo.reference.sha256, actual.referenceSha256, 'actual.referenceSha256'],
    [imageInfo.reference.sha256, actual.pixels?.referenceSha256, '像素证据原图'],
    [imageInfo.actual.sha256, actual.capture?.screenshotSha256, '当前截图'],
    [imageInfo.actual.sha256, actual.pixels?.actualSha256, '像素证据当前图'],
  ]) if (!sameHash(expected, observed)) warnings.push(name + ' 哈希与嵌入图片不一致或未知。');
  return { ...sides, overlayAllowed: warnings.length === 0, warnings };
}

function checkVerificationBinding(reference, actual, verification) {
  const expected = createInputBinding(reference, actual);
  const supplied = verification.inputBinding;
  if (!object(supplied) || !supplied.algorithm || !supplied.referenceSha256 || !supplied.actualSha256) {
    return { valid: false, code: 'VERIFICATION_BINDING_MISSING', message: '核验报告缺少完整输入绑定，不能用于当前合同与采集。请对这两份输入重新运行检查器。' };
  }
  if (!expected || supplied.algorithm !== expected.algorithm
      || !sameHash(supplied.referenceSha256, expected.referenceSha256) || !sameHash(supplied.actualSha256, expected.actualSha256)) {
    return { valid: false, code: 'VERIFICATION_INPUT_MISMATCH', message: '核验报告的输入绑定与当前合同或采集不一致，原报告状态不能用于本次审核。请对这两份输入重新运行检查器。' };
  }
  return { valid: true, code: 'VERIFICATION_INPUTS_BOUND', message: '核验报告与当前两份JSON输入绑定一致。此检查用于发现混用或过期报告，不证明证据不可伪造。' };
}

function mountReview(payload) {
  const { reference, actual, verification, images, metadata, verificationBinding } = payload;
  const byId = id => document.getElementById(id);
  const array = value => Array.isArray(value) ? value : [];
  const printable = value => JSON.stringify(value, null, 2);
  const bboxValid = value => Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) && value[2] >= 0 && value[3] >= 0;
  const groups = nodes => {
    const map = new Map();
    array(nodes).forEach((node, index) => {
      if (!node || typeof node.id !== 'string' || !node.id) return;
      if (!map.has(node.id)) map.set(node.id, []);
      map.get(node.id).push({ node, index });
    });
    return map;
  };
  const original = groups(reference.nodes);
  const current = groups(actual.nodes);
  const ids = [...new Set([...original.keys(), ...current.keys()])];
  const errors = [...array(verification.blockers), ...array(verification.differences)];
  const state = { selected: ids.find(id => original.get(id)?.[0]?.node.type !== 'region') ?? ids[0] ?? null, scale: 1 };
  const status = !verificationBinding.valid ? 'BLOCKED' : ['BLOCKED', 'FAIL', 'PASS_CONTRACT'].includes(verification.status) ? verification.status : 'UNKNOWN';
  byId('verification-status').textContent = status + (status === 'PASS_CONTRACT' ? ' · 仅给定合同检查通过' : ' · 本次审核有效状态');
  byId('verification-status').dataset.status = status;
  byId('verification-binding').textContent = verificationBinding.code + ' · ' + verificationBinding.message;
  byId('verification-binding').dataset.valid = String(verificationBinding.valid);
  byId('full-report').textContent = printable(verification);
  byId('canvas-metadata').textContent = ['reference', 'actual'].map(side => {
    const info = metadata[side];
    return (side === 'reference' ? '原图' : '当前') + ': PNG ' + info.width + ' × ' + info.height + '物理像素；DPR ' + info.dpr + '；显示 ' + info.cssWidth + ' × ' + info.cssHeight + ' CSS px';
  }).join('\n');
  const duplicates = [...original, ...current].filter(([, rows]) => rows.length > 1).map(([id]) => id);
  const missingIds = array(reference.nodes).filter(node => !node?.id).length + array(actual.nodes).filter(node => !node?.id).length;
  byId('coverage-limits').textContent = [
    '覆盖声明: ' + String(reference.coverage?.status ?? 'UNKNOWN') + '；独立复核身份: ' + String(reference.coverage?.reviewedBy ?? 'UNKNOWN'),
    '未解决原图项: ' + printable(reference.coverage?.unresolved ?? 'UNKNOWN'),
    '实际采集完整性: ' + String(actual.inventory?.complete ?? 'UNKNOWN') + '；未映射项: ' + printable(actual.inventory?.unmapped ?? 'UNKNOWN'),
    '语义例外: ' + printable(reference.exceptions ?? 'UNKNOWN'),
    '重复ID: ' + printable(duplicates) + '；缺失ID记录数: ' + missingIds,
    '原图状态: ' + printable(reference.state ?? 'UNKNOWN') + '\n当前状态: ' + printable(actual.state ?? 'UNKNOWN'),
    '本页没有重新执行像素计算、采集或独立复核；unknown、estimated及未审项保留。哈希绑定只约束输入，不证明证据不可伪造。',
  ].join('\n');
  const overlayOption = byId('view-mode').querySelector('option[value="overlay"]');
  overlayOption.disabled = !metadata.overlayAllowed;
  byId('overlay-warning').textContent = metadata.overlayAllowed ? '叠加条件：图片尺寸、CSS视口、DPR与哈希绑定相容。此条件不是像素一致结论。' : '禁止叠加：' + metadata.warnings.join(' ') + ' 请使用并排或单图入口；不会静默拉伸对齐。';
  byId('overlay-warning').dataset.blocked = String(!metadata.overlayAllowed);

  function relatedErrors(id) {
    const nodePaths = [
      ...array(original.get(id)).map(row => 'reference.nodes[' + row.index + ']'),
      ...array(current.get(id)).map(row => 'actual.nodes[' + row.index + ']'),
      'nodes.' + id,
    ];
    for (const [side, contract] of [['reference', reference], ['actual', actual]]) {
      array(contract.relations).forEach((relation, index) => {
        if (relation.from === id || relation.to === id) nodePaths.push('relations.' + relation.id, side + '.relations[' + index + ']');
      });
    }
    return errors.filter(error => nodePaths.some(prefix => error.path === prefix || String(error.path ?? '').startsWith(prefix + '.') || String(error.path ?? '').startsWith(prefix + '[')));
  }

  function showDetails() {
    byId('selected-id').textContent = state.selected ?? '没有可选择的稳定ID';
    for (const [side, map] of [['reference', original], ['actual', current]]) {
      const rows = map.get(state.selected);
      byId(side + '-detail').textContent = rows?.length ? printable(rows.length === 1 ? rows[0].node : { duplicateId: true, records: rows.map(row => row.node) }) : 'MISSING · 该侧没有对应节点。';
    }
    const relevant = relatedErrors(state.selected);
    byId('difference-detail').textContent = relevant.length ? printable(relevant) : '没有直接绑定此ID的错误条目；这不代表此原子已通过视觉复核。请同时查看全局报告。';
  }

  function listAtoms() {
    const search = byId('atom-search').value.toLocaleLowerCase();
    const visible = ids.filter(id => [id, ...array(original.get(id)), ...array(current.get(id))].map(value => typeof value === 'string' ? value : String(value.node.text ?? '') + ' ' + String(value.node.type ?? '')).join(' ').toLocaleLowerCase().includes(search));
    const list = byId('atom-list');
    list.replaceChildren();
    for (const id of visible) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.atomId = id;
      button.setAttribute('aria-pressed', String(id === state.selected));
      button.textContent = id + ' · ' + String(original.get(id)?.[0]?.node.type ?? current.get(id)?.[0]?.node.type ?? 'UNKNOWN')
        + (original.has(id) && current.has(id) ? '' : original.has(id) ? ' · 当前MISSING' : ' · 原图MISSING');
      button.addEventListener('click', () => select(id));
      list.append(button);
    }
    byId('atom-count').textContent = visible.length + ' / ' + ids.length + ' 个稳定ID；记录不等于已审核。';
  }

  function select(id) {
    state.selected = id;
    listAtoms();
    showDetails();
    renderStage();
  }

  function fitStage() {
    const stage = byId('stage');
    const naturalWidth = Number(stage.dataset.width) || 1;
    const naturalHeight = Number(stage.dataset.height) || 1;
    const available = byId('stage-scroll').clientWidth || Math.max(280, window.innerWidth - 360);
    state.scale = byId('scale-mode').value === 'native' ? 1 : Math.min(1, Math.max(0.05, (available - 24) / naturalWidth));
    stage.style.transform = 'scale(' + state.scale + ')';
    byId('stage-shell').style.width = naturalWidth * state.scale + 'px';
    byId('stage-shell').style.height = naturalHeight * state.scale + 'px';
    byId('scale-value').textContent = (state.scale * 100).toFixed(1) + '% · 框坐标保持CSS px';
  }

  function addBoxes(canvas, side, map) {
    const layer = document.createElement('div');
    layer.className = 'boxes';
    layer.hidden = !byId('show-boxes').checked;
    for (const [id, rows] of map) {
      for (const { node } of rows) {
        if (!bboxValid(node.bbox)) continue;
        const box = document.createElement('div');
        box.className = 'atom-box ' + side + (id === state.selected ? ' selected' : '') + (node.confidence === 'unknown' ? ' unknown' : '');
        box.dataset.boxSide = side;
        box.dataset.atomId = id;
        box.style.left = node.bbox[0] + 'px';
        box.style.top = node.bbox[1] + 'px';
        box.style.width = node.bbox[2] + 'px';
        box.style.height = node.bbox[3] + 'px';
        box.title = side + ' ' + id + ' · ' + String(node.confidence ?? '实际采集');
        layer.append(box);
      }
    }
    canvas.append(layer);
  }

  function makePane(sides) {
    const primary = sides[0];
    const info = metadata[primary];
    const pane = document.createElement('section');
    pane.className = 'image-pane';
    pane.style.width = info.cssWidth + 'px';
    const title = document.createElement('div');
    title.className = 'image-label';
    title.textContent = sides.length === 2 ? '透明叠加 · 原图蓝框 / 当前橙框' : primary === 'reference' ? '原图 · 蓝框' : '当前 · 橙框';
    const canvas = document.createElement('div');
    canvas.className = 'image-canvas';
    canvas.style.width = info.cssWidth + 'px';
    canvas.style.height = info.cssHeight + 'px';
    for (const side of sides) {
      const image = document.createElement('img');
      image.className = side === 'reference' ? 'reference-image' : 'actual-image';
      image.alt = side === 'reference' ? '原始参考PNG，仅用于审核' : '当前网页PNG，仅用于审核';
      image.draggable = false;
      image.src = side === 'reference' ? images.reference : images.current;
      image.style.width = metadata[side].cssWidth + 'px';
      image.style.height = metadata[side].cssHeight + 'px';
      image.style.opacity = sides.length === 2 && side === 'actual' ? String(Number(byId('overlay-opacity').value) / 100) : '1';
      image.addEventListener('error', () => {
        metadata.overlayAllowed = false;
        overlayOption.disabled = true;
        byId('overlay-warning').textContent = '禁止叠加：浏览器无法解码其中一张嵌入PNG。图片内容未成功核验。';
        byId('overlay-warning').dataset.blocked = 'true';
        if (byId('view-mode').value === 'overlay') {
          byId('view-mode').value = 'side-by-side';
          renderStage();
        }
      });
      canvas.append(image);
    }
    for (const side of sides) addBoxes(canvas, side, side === 'reference' ? original : current);
    canvas.addEventListener('click', event => {
      const bounds = canvas.getBoundingClientRect();
      const point = [(event.clientX - bounds.left) / state.scale, (event.clientY - bounds.top) / state.scale];
      const hits = [];
      for (const side of sides) {
        for (const [id, rows] of side === 'reference' ? original : current) {
          for (const { node } of rows) {
            if (!bboxValid(node.bbox)) continue;
            const [x, y, width, height] = node.bbox;
            if (point[0] >= x && point[0] <= x + width && point[1] >= y && point[1] <= y + height) hits.push({ id, area: width * height });
          }
        }
      }
      hits.sort((a, b) => a.area - b.area);
      if (hits.length) select(hits[0].id);
    });
    pane.append(title, canvas);
    return pane;
  }

  function renderStage() {
    let mode = byId('view-mode').value;
    if (mode === 'overlay' && !metadata.overlayAllowed) {
      mode = 'side-by-side';
      byId('view-mode').value = mode;
    }
    const stage = byId('stage');
    stage.replaceChildren();
    let width;
    let height;
    if (mode === 'side-by-side') {
      stage.append(makePane(['reference']), makePane(['actual']));
      width = metadata.reference.cssWidth + metadata.actual.cssWidth + 24;
      height = Math.max(metadata.reference.cssHeight, metadata.actual.cssHeight) + 28;
    } else {
      const side = mode === 'current' ? 'actual' : 'reference';
      stage.append(makePane(mode === 'overlay' ? ['reference', 'actual'] : [side]));
      width = metadata[side].cssWidth;
      height = metadata[side].cssHeight + 28;
    }
    stage.dataset.width = String(width);
    stage.dataset.height = String(height);
    stage.style.width = width + 'px';
    stage.style.height = height + 'px';
    byId('overlay-opacity').disabled = mode !== 'overlay';
    fitStage();
  }

  byId('atom-search').addEventListener('input', listAtoms);
  byId('view-mode').addEventListener('change', renderStage);
  byId('scale-mode').addEventListener('change', fitStage);
  byId('overlay-opacity').addEventListener('input', () => {
    const currentImage = document.querySelector('.actual-image');
    if (currentImage && byId('view-mode').value === 'overlay') currentImage.style.opacity = String(Number(byId('overlay-opacity').value) / 100);
  });
  byId('show-boxes').addEventListener('change', () => document.querySelectorAll('.boxes').forEach(layer => { layer.hidden = !byId('show-boxes').checked; }));
  window.addEventListener('resize', fitStage);
  listAtoms();
  showDetails();
  renderStage();
}

/** Local, self-contained inspection aid. It does not produce or modify a replica. */
export function renderReview(reference, actual, verification, images) {
  if (![reference, actual, verification, images].every(object)) throw new Error('合同、核验报告和本地PNG dataURL集合必须是对象。');
  const imageInfo = { reference: pngInfo(images.reference), actual: pngInfo(images.current) };
  const metadata = comparisonMetadata(reference, actual, imageInfo);
  const verificationBinding = checkVerificationBinding(reference, actual, verification);
  const payload = JSON.stringify({ reference, actual, verification, images, metadata, verificationBinding })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>复刻合同审查工具</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7f8;color:#192b33;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}header{padding:20px 24px;background:white;border-bottom:1px solid #d6dee2}h1{font-size:22px;margin:0 0 8px}h2{font-size:15px;margin:0 0 10px}p{margin:6px 0}.disclaimer{color:#594411;background:#fff4d6;padding:10px 14px;border-radius:6px}#verification-status{display:inline-block;padding:4px 10px;border:1px solid #9aaeb8;border-radius:5px;font-weight:700}#verification-status[data-status="BLOCKED"]{color:#8b3d27;background:#fff0eb}#verification-status[data-status="FAIL"]{color:#8b561b;background:#fff4e5}#verification-status[data-status="PASS_CONTRACT"]{color:#205e4d;background:#edf6f1}.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding:14px 24px;background:white;border-bottom:1px solid #d6dee2}.toolbar label{display:flex;align-items:center;gap:7px}select,input[type="search"]{font:inherit;padding:6px 8px;border:1px solid #aabcc5;border-radius:4px;background:white}input[type="range"]{width:120px}button{font:inherit;cursor:pointer}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #3d76b3;outline-offset:2px}.workspace{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;padding:16px 24px}aside,.viewer,.detail-panel{background:white;border:1px solid #d6dee2;border-radius:6px;padding:14px}aside{align-self:start}#atom-search{width:100%}#atom-count{color:#64777f;font-size:12px}#atom-list{display:grid;gap:6px;max-height:470px;overflow:auto;margin-top:12px}#atom-list button{text-align:left;overflow-wrap:anywhere;background:#f7fafb;border:1px solid #dce5e8;border-radius:4px;padding:8px}#atom-list button[aria-pressed="true"]{background:#e4edf8;border-color:#396ea5}#canvas-metadata{white-space:pre-wrap;font-size:12px;color:#566c76}#overlay-warning{padding:9px 10px;background:#edf4f7;border-radius:4px;margin:10px 0;font-size:12px}#overlay-warning[data-blocked="true"]{background:#fff0e8;color:#8a3d20}#stage-scroll{overflow:auto;background:#e6ecef;min-height:200px;max-height:65vh;padding:12px}#stage-shell{position:relative}#stage{position:absolute;left:0;top:0;display:flex;gap:24px;align-items:start;transform-origin:0 0}.image-pane{flex:none;margin:0}.image-label{height:28px;font-size:12px;font-weight:650}.image-canvas{position:relative;overflow:hidden;background:white}.image-canvas img{display:block;position:absolute;left:0;top:0;max-width:none}.boxes{position:absolute;inset:0;pointer-events:none}.boxes[hidden]{display:none}.atom-box{position:absolute;border:1px solid;pointer-events:none;opacity:.22}.atom-box.reference{border-color:#2567c5}.atom-box.actual{border-color:#df6b20}.atom-box.selected{border-width:2px;opacity:1;background:#2567c514}.atom-box.actual.selected{background:#df6b2014}.atom-box.unknown{border-style:dotted}.details{padding:0 24px 24px}.details-title{font-size:16px;margin:4px 0 12px;overflow-wrap:anywhere}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}pre{font:12px/1.55 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin:0;max-height:360px;overflow:auto}.limits{margin-top:14px;padding:14px;background:white;border:1px solid #d6dee2;border-radius:6px}summary{cursor:pointer;font-weight:650;margin-bottom:8px}#coverage-limits{max-height:none}#scale-value{font-size:12px;color:#566c76}@media(max-width:800px){.workspace{grid-template-columns:1fr;padding:12px}.detail-grid{grid-template-columns:1fr}.details{padding:0 12px 16px}#atom-list{max-height:160px}.toolbar{padding:12px}header{padding:16px}}
</style></head><body>
<header><h1>复刻合同审查工具</h1><p id="verification-status"></p><p id="verification-binding" role="status"></p><p class="disclaimer">这是只读审查工具，并非复刻结果。PASS_CONTRACT 不代表原图像素完全一致。图片仅用于审核，不是网页实现。</p></header>
<div class="toolbar">
<label>显示方式<select id="view-mode"><option value="side-by-side">并排查看</option><option value="reference">原图</option><option value="current">当前</option><option value="overlay">透明叠加</option></select></label>
<label>缩放<select id="scale-mode"><option value="fit">适应宽度</option><option value="native">原尺寸（CSS 1:1）</option></select></label>
<label>当前图透明度<input id="overlay-opacity" type="range" min="0" max="100" value="50"></label>
<label><input id="show-boxes" type="checkbox" checked>显示节点框</label><span id="scale-value"></span>
</div>
<main><div class="workspace"><aside aria-label="原子目录"><h2>按稳定ID核对</h2><label for="atom-search">搜索ID、类型或内容</label><input id="atom-search" type="search" placeholder="例如：金额或节点ID"><p id="atom-count"></p><div id="atom-list"></div></aside>
<section class="viewer" aria-label="图片对照"><p id="canvas-metadata"></p><p id="overlay-warning" role="status"></p><div id="stage-scroll"><div id="stage-shell"><div id="stage"></div></div></div></section></div>
<section class="details" aria-label="所选原子详情"><h2 class="details-title">当前选择：<span id="selected-id"></span></h2><div class="detail-grid">
<section class="detail-panel"><h2>原图合同 · 内容/坐标/样式</h2><pre id="reference-detail"></pre></section>
<section class="detail-panel"><h2>当前实测 · 内容/坐标/样式</h2><pre id="actual-detail"></pre></section>
<section class="detail-panel"><h2>关联差异与阻断项</h2><pre id="difference-detail"></pre></section></div>
<section class="limits"><h2>覆盖限制与状态</h2><pre id="coverage-limits"></pre></section>
<details class="limits"><summary>完整核验报告（原样呈现）</summary><pre id="full-report"></pre></details></section></main>
<script>(${mountReview.toString()})(${payload});</script></body></html>`;
}

function localPath(path) {
  if (typeof path !== 'string' || !path || /^[a-z][a-z\d+.-]*:\/\//i.test(path) || path.startsWith('\\\\') || path.startsWith('//')) {
    const error = new Error('只允许本地文件路径；不下载网络资源。');
    error.code = 'LOCAL_INPUT_REQUIRED';
    throw error;
  }
  return resolve(path);
}

function canonicalPath(path) {
  const result = existsSync(path) ? realpathSync(path) : join(realpathSync(dirname(path)), basename(path));
  return process.platform === 'win32' ? result.toLowerCase() : result;
}

function runCli(argv) {
  const keys = ['--reference', '--actual', '--reference-image', '--current-image', '--verification', '--out'];
  const options = {};
  try {
    for (let index = 0; index < argv.length; index += 2) {
      if (!keys.includes(argv[index]) || !argv[index + 1] || argv[index + 1].startsWith('--') || Object.hasOwn(options, argv[index])) throw new Error('参数缺失、重复或未知。');
      options[argv[index]] = localPath(argv[index + 1]);
    }
    if (keys.some(key => !options[key])) throw new Error('用法：--reference file --actual file --reference-image ref.png --current-image current.png --verification file --out review.html');
    const output = canonicalPath(options['--out']);
    const outputStat = existsSync(options['--out']) ? statSync(options['--out']) : null;
    for (const key of keys.filter(key => key !== '--out')) {
      const inputStat = statSync(options[key]);
      if (output === canonicalPath(options[key]) || (outputStat && inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino)) {
        const error = new Error('审核页输出不能覆盖参考合同、当前采集、图片或核验报告。');
        error.code = 'OUTPUT_OVERWRITES_INPUT';
        throw error;
      }
    }
    const parse = key => JSON.parse(readFileSync(options[key], 'utf8').replace(/^\uFEFF/, ''));
    const images = {
      reference: 'data:image/png;base64,' + readFileSync(options['--reference-image']).toString('base64'),
      current: 'data:image/png;base64,' + readFileSync(options['--current-image']).toString('base64'),
    };
    const html = renderReview(parse('--reference'), parse('--actual'), parse('--verification'), images);
    writeFileSync(options['--out'], html, 'utf8');
    process.stdout.write(JSON.stringify({ ok: true, reviewOnly: true, out: options['--out'] }) + '\n');
    process.exitCode = 0;
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: 'BLOCKED', errors: [{ code: error.code ?? 'REVIEW_GENERATION_ERROR', message: String(error.message) }] }) + '\n');
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli(process.argv.slice(2));
