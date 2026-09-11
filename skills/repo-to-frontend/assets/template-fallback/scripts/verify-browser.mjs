import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TEMPLATE_BROWSER_MODULE || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidencePath = resolve(root, 'verification');
await mkdir(evidencePath, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = { browser: browser.version(), protocol: 'file:', network: 'offline', states: [], errors: [], externalRequests: [] };

try {
  for (const [name, width, height, layout] of [
    ['sidebar-desktop', 1280, 900, 'sidebar'],
    ['top-desktop', 1280, 900, 'top'],
    ['sidebar-mobile', 390, 844, 'sidebar'],
    ['top-mobile', 390, 844, 'top'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, offline: true });
    const page = await context.newPage();
    page.on('pageerror', (error) => evidence.errors.push(`${name}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') evidence.errors.push(`${name}: ${message.text()}`);
    });
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) evidence.externalRequests.push(request.url());
    });
    await page.goto(`${pathToFileURL(resolve(root, 'index.html')).href}#layout=${layout}`);
    await page.locator('h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('body').getAttribute('data-layout'), layout);
    const metrics = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      documentWidth: document.documentElement.scrollWidth,
      // file: origins can render CSS while denying CSSOM rule inspection.
      stylesheets: [...document.styleSheets].map((sheet) => ({ href: sheet.href })),
      tablerPrimary: getComputedStyle(document.documentElement).getPropertyValue('--tblr-primary').trim(),
      imageCount: document.querySelectorAll('[data-major-image-slot] img, [data-major-image-slot] svg').length,
      main: (() => { const r = document.querySelector('main').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; })(),
      nav: (() => { const r = document.querySelector('nav').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; })(),
    }));
    assert.ok(metrics.documentWidth <= width, `${name}: document horizontal overflow`);
    assert.ok(metrics.stylesheets.some((sheet) => sheet.href.includes('tabler-1.5.0')));
    assert.ok(metrics.tablerPrimary);
    assert.equal(metrics.imageCount, 0);
    await page.screenshot({ path: resolve(evidencePath, `${name}.png`), fullPage: true, animations: 'disabled' });
    await page.locator('[data-open-evidence="C02"]').click();
    assert.equal(await page.locator('#evidence-view').isVisible(), true);
    assert.equal(await page.locator('#evidence-C02').evaluate((element) => element.open), true);
    if (name === 'sidebar-desktop') await page.screenshot({ path: resolve(evidencePath, 'evidence-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: '返回报告正文' }).click();
    assert.equal(await page.locator('#report-view').isVisible(), true);
    const otherLayout = layout === 'top' ? 'sidebar' : 'top';
    await page.locator(`[data-layout-value="${otherLayout}"]`).click();
    assert.equal(await page.locator('body').getAttribute('data-layout'), otherLayout);
    evidence.states.push({ name, layout, ...metrics, evidenceNavigation: 'PASS', layoutSwitch: 'PASS' });
    await context.close();
  }
  assert.deepEqual(evidence.externalRequests, []);
  assert.deepEqual(evidence.errors, []);
  evidence.result = 'PASS';
} finally {
  await browser.close();
  await writeFile(resolve(evidencePath, 'browser.json'), `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(JSON.stringify({ result: evidence.result, states: evidence.states.length, externalRequests: evidence.externalRequests.length, errors: evidence.errors.length }));
