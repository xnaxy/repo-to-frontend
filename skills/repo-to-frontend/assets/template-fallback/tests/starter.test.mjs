import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reuse an existing Vitest/jsdom project without adding runtime dependencies.
const runtimePackage = process.env.TEMPLATE_TEST_PACKAGE || resolve(process.cwd(), 'package.json');
const { JSDOM } = createRequire(runtimePackage)('jsdom');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = (name) => existsSync(resolve(root, name)) ? readFileSync(resolve(root, name), 'utf8') : '';
function load() {
  const dom = new JSDOM(file('index.html'), { url: 'file:///template-fallback/index.html', runScripts: 'outside-only' });
  dom.window.eval(file('starter.js'));
  return dom;
}

describe('offline Tabler fallback starter', () => {
  it('ships the actual pinned Tabler stylesheet with matching provenance', () => {
    const dom = load();
    const stylesheet = dom.window.document.querySelector('link[href="vendor/tabler-1.5.0.min.css"]');
    expect(stylesheet, 'The official local Tabler stylesheet must be loaded').not.toBeNull();
    const css = file('vendor/tabler-1.5.0.min.css');
    expect(css.length).toBeGreaterThan(100000);
    expect(css).toContain('--tblr-');
    const provenance = JSON.parse(file('provenance.json') || '{}');
    expect(provenance.version).toBe('1.5.0');
    expect(provenance.files?.css?.sha256).toBe(createHash('sha256').update(css).digest('hex'));
    expect(file('vendor/LICENSE.tabler')).toContain('Permission is hereby granted');
    dom.window.close();
  });

  it('uses local render resources and a classic script so file URLs need no server', () => {
    const dom = load();
    const doc = dom.window.document;
    expect(doc.querySelector('script[src="starter.js"]'), 'A local classic script is required').not.toBeNull();
    expect(doc.querySelector('script[type="module"]')).toBeNull();
    for (const element of doc.querySelectorAll('[src], link[rel="stylesheet"]')) {
      const resource = element.getAttribute('src') || element.getAttribute('href');
      expect(resource).not.toMatch(/^(https?:)?\/\//i);
      expect(existsSync(resolve(root, resource)), `Missing local resource: ${resource}`).toBe(true);
    }
    expect(file('starter.js')).not.toMatch(/\b(fetch|XMLHttpRequest)\b/);
    dom.window.close();
  });

  it('labels local example content and presents an empty major-image slot honestly', () => {
    const dom = load();
    const doc = dom.window.document;
    expect(doc.querySelector('h1')?.textContent || '').toContain('示例');
    expect(doc.querySelector('[data-major-image-slot]')?.textContent || '').toContain('尚未提供');
    expect(doc.querySelector('[data-major-image-slot] img, [data-major-image-slot] svg')).toBeNull();
    expect(doc.querySelector('#sample-table tbody tr')).not.toBeNull();
    dom.window.close();
  });

  it('switches between top and sidebar layouts without losing the sample table', () => {
    const dom = load();
    const doc = dom.window.document;
    expect(doc.body.dataset.layout).toBe('sidebar');
    const originalRows = doc.querySelector('#sample-table')?.textContent;
    doc.querySelector('[data-layout-value="top"]')?.click();
    expect(doc.body.dataset.layout).toBe('top');
    expect(doc.querySelector('[data-layout-value="top"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(doc.querySelector('[data-layout-value="sidebar"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(doc.querySelector('#sample-table')?.textContent).toBe(originalRows);
    doc.querySelector('[data-layout-value="sidebar"]')?.click();
    expect(doc.body.dataset.layout).toBe('sidebar');
    expect(doc.querySelector('[role="status"]')?.textContent).toContain('侧栏报告');
    dom.window.close();
  });

  it('opens the real local evidence view from a table evidence link and returns', () => {
    const dom = load();
    const doc = dom.window.document;
    expect(doc.querySelector('#evidence-view')?.hidden).toBe(true);
    doc.querySelector('[data-open-evidence="C01"]')?.click();
    expect(doc.querySelector('#report-view')?.hidden).toBe(true);
    expect(doc.querySelector('#evidence-view')?.hidden).toBe(false);
    expect(doc.querySelector('#evidence-C01')?.open).toBe(true);
    expect(doc.querySelector('#evidence-C01')?.textContent).toContain('本地合成示例');
    doc.querySelector('[data-view-value="report"]')?.click();
    expect(doc.querySelector('#report-view')?.hidden).toBe(false);
    dom.window.close();
  });

  it('keeps every visible anchor target available locally', () => {
    const dom = load();
    const doc = dom.window.document;
    const targets = [...doc.querySelectorAll('a[href^="#"]')];
    expect(targets.length).toBeGreaterThan(0);
    for (const anchor of targets) {
      expect(doc.getElementById(anchor.getAttribute('href').slice(1))).not.toBeNull();
    }
    dom.window.close();
  });
});
