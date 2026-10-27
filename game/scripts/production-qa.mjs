import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const dir = process.env.QA_ARTIFACT_DIR;
const base = process.env.QA_BASE_URL ?? 'http://localhost:4173/';
const origin = new URL(base).origin;
if (!dir) throw new Error('QA_ARTIFACT_DIR required');
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [],
  external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().startsWith('http') && !r.url().startsWith(origin + '/')) external.push(r.url());
});
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => typeof window.__PAWPRINT_TEST__), 'undefined');
  await page.getByRole('button', { name: '出发，去兜个风' }).click();
  await page.locator('[data-id="penguin"]').click();
  await page.getByRole('button', { name: '驶上发车线' }).click();
  await page.locator('#countdown').filter({ hasText: 'GO!' }).waitFor();
  await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) > 60);
  assert.equal(await page.locator('.lane-controls').isVisible(), true);
  assert.equal(await page.locator('.nitro-control').isVisible(), true);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () =>
      document
        .querySelector('.lane-controls [data-action="drive-right"]')
        .getAttribute('aria-pressed') === 'true',
  );
  await page.keyboard.press('Space');
  await page.locator('#nitro-title').filter({ hasText: '正在冲刺' }).waitFor();
  const rendering = await page.evaluate(() => {
    const gl = document.querySelector('#world').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      viewport: [innerWidth, innerHeight],
      quality: JSON.parse(localStorage.getItem('pawprint-paradise-v1')).settings.quality,
    };
  });
  await page.screenshot({
    path: path.join(dir, 'production-driving.jpg'),
    type: 'jpeg',
    quality: 70,
  });
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: '海风等你一下。' }).waitFor();
  await page.getByRole('button', { name: '返回主菜单' }).click();
  await page.getByRole('button', { name: '出发，去兜个风' }).waitFor();
  await page.screenshot({ path: path.join(dir, 'production-home.jpg'), type: 'jpeg', quality: 70 });
  assert.equal(errors.length, 0);
  assert.equal(external.length, 0);
  const blockedPage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  blockedPage.on('pageerror', (error) => errors.push(error.message));
  await blockedPage.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage access denied', 'SecurityError');
      },
    });
  });
  await blockedPage.goto(base, { waitUntil: 'networkidle' });
  await blockedPage.getByRole('button', { name: '出发，去兜个风' }).click();
  await blockedPage.getByRole('button', { name: '驶上发车线' }).click();
  await blockedPage.locator('#countdown').filter({ hasText: 'GO!' }).waitFor();
  assert.equal(errors.length, 0);
  await blockedPage.close();
  const report = {
    recordedAt: new Date().toISOString(),
    browserVersion: browser.version(),
    blockedStorageStillPlayable: true,
    url: base,
    rendering,
    productionTestApiAbsent: true,
    automaticAcceleration: true,
    keyboardLaneAndNitro: true,
    pauseAndReturn: true,
    noExternalRequests: true,
    errors,
  };
  await writeFile(path.join(dir, 'production-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
