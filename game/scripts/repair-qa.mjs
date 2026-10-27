import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = process.env.QA_ARTIFACT_DIR;
if (!dir) throw new Error('QA_ARTIFACT_DIR must point to the marked task directory.');
assert.equal(
  path.resolve(process.env.TMPDIR ?? ''),
  path.resolve(dir),
  'TMPDIR must point to the same task directory as QA_ARTIFACT_DIR.',
);
await access(path.join(dir, '.codex-tmp'));
const base = process.env.QA_BASE_URL ?? 'http://localhost:5173/';
const report = {
  recordedAt: new Date().toISOString(),
  url: base,
  passed: false,
  focus: [],
  widths: [],
  storage: [],
  errors: [],
  warnings: [],
};
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1366, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (error) => report.errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') report.errors.push(message.text());
  if (message.type() === 'warning') report.warnings.push(message.text());
});

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '出发，去兜个风' }).click();
  const changes = [
    ['character', 'fox', 'keyboard'],
    ['difficulty', 'hard', 'keyboard'],
    ['driving', 'manual', 'keyboard'],
    ['mode', 'time', 'keyboard'],
    ['character', 'penguin', 'mouse'],
    ['mode', 'race', 'mouse'],
    ['difficulty', 'easy', 'mouse'],
    ['driving', 'assisted', 'mouse'],
    ['mode', 'time', 'mouse'],
  ];
  for (const [action, id, via] of changes) {
    const target = page.locator('[data-action="' + action + '"][data-id="' + id + '"]');
    if (via === 'keyboard') {
      await target.focus();
      await page.keyboard.press('Enter');
    } else {
      await target.click();
    }
    const result = await page.evaluate(
      ({ action, id }) => {
        const element = document.activeElement;
        return {
          action,
          id,
          focusedAction: element?.getAttribute('data-action'),
          focusedId: element?.getAttribute('data-id'),
          pressed: element?.getAttribute('aria-pressed'),
        };
      },
      { action, id },
    );
    report.focus.push({ ...result, via });
    assert.equal(result.focusedAction, action, action + ' keeps focus after ' + via);
    assert.equal(result.focusedId, id, id + ' keeps focus after ' + via);
    assert.equal(result.pressed, 'true', id + ' is selected after ' + via);
  }

  await page.getByRole('button', { name: '驶上发车线' }).click();
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().phase === 'racing');
  await page.evaluate(() => window.__PAWPRINT_TEST__.step(15000));
  await page.getByRole('button', { name: '再来一局' }).waitFor();

  for (const width of [320, 575, 700]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.evaluate(() => {
      const panel = document.querySelector('.results-panel');
      return {
        width: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        panelClientWidth: panel.clientWidth,
        panelScrollWidth: panel.scrollWidth,
        lapCount: document.querySelectorAll('.lap-result').length,
        fields: ['.result-times', '.record-badge', '.drive-result'].map((selector) => {
          const element = document.querySelector(selector);
          const bounds = element?.getBoundingClientRect();
          const style = element ? getComputedStyle(element) : null;
          return {
            selector,
            text: element?.textContent,
            rendered: !!(
              bounds?.width &&
              bounds.height &&
              style.display !== 'none' &&
              style.visibility !== 'hidden'
            ),
            inViewport: !!(
              bounds &&
              bounds.left >= 0 &&
              bounds.right <= innerWidth &&
              bounds.top >= 0 &&
              bounds.bottom <= innerHeight
            ),
            bounds: bounds
              ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
              : null,
          };
        }),
      };
    });
    report.widths.push(result);
    await page.screenshot({
      path: path.join(dir, 'repair-time-results-' + width + '.png'),
      fullPage: true,
    });
  }
  for (const result of report.widths) {
    assert.equal(result.pageWidth, result.width, 'page horizontal overflow at ' + result.width);
    assert.ok(
      result.panelScrollWidth <= result.panelClientWidth,
      'panel horizontal overflow at ' + result.width,
    );
    assert.equal(result.lapCount, 3, 'three lap times at ' + result.width);
    for (const field of result.fields) {
      assert.ok(field.rendered, field.selector + ' rendered at ' + result.width);
      assert.ok(field.inViewport, field.selector + ' in viewport at ' + result.width);
    }
    assert.match(result.fields[0].text, /完赛用时.*\d:\d{2}\.\d{3}.*最佳单圈.*\d:\d{2}\.\d{3}/);
    assert.match(result.fields[1].text, /新的个人纪录/);
    assert.match(result.fields[2].text, /氮气.*完美互动/);
  }
  for (const fixture of [
    { name: 'records-string', records: 'damaged' },
    { name: 'records-number', records: 42 },
    { name: 'record-fields-missing', records: { 'assisted:time:panda': {} } },
  ]) {
    const context = await browser.newContext({ viewport: { width: 575, height: 900 } });
    const storagePage = await context.newPage();
    const result = { name: fixture.name, passed: false, errors: [] };
    report.storage.push(result);
    storagePage.on('pageerror', (error) => result.errors.push(error.message));
    await context.addInitScript(({ records }) => {
      const key = 'pawprint-paradise-v1';
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify({ records }));
      }
    }, fixture);
    try {
      await storagePage.goto(base, { waitUntil: 'networkidle' });
      await storagePage.getByRole('button', { name: '出发，去兜个风' }).click();
      await storagePage.locator('[data-action="mode"][data-id="time"]').click();
      await storagePage.getByRole('button', { name: '驶上发车线' }).click();
      await storagePage.waitForFunction(
        () => window.__PAWPRINT_TEST__.snapshot().phase === 'racing',
      );
      await storagePage.evaluate(() => window.__PAWPRINT_TEST__.step(15000));
      await storagePage.getByRole('button', { name: '再来一局' }).waitFor();
      assert.equal(await storagePage.locator('.result-times').isVisible(), true);
      assert.equal(await storagePage.locator('.lap-result').count(), 3);
      const finishText = await storagePage.locator('.result-times strong').first().textContent();
      assert.match(finishText, /^\d+:\d{2}\.\d{3}$/);
      const record = await storagePage.evaluate(
        () =>
          JSON.parse(localStorage.getItem('pawprint-paradise-v1')).records['assisted:time:panda'],
      );
      assert.ok(Number.isFinite(record.lap) && record.lap > 0, fixture.name + ' saves a valid lap');
      assert.ok(
        Number.isFinite(record.race) && record.race > 0,
        fixture.name + ' saves a valid race',
      );
      await storagePage.screenshot({
        path: path.join(dir, 'repair-storage-' + fixture.name + '.png'),
        fullPage: true,
      });
      await storagePage.reload({ waitUntil: 'networkidle' });
      await storagePage.getByRole('button', { name: '出发，去兜个风' }).click();
      await storagePage.locator('[data-action="mode"][data-id="time"]').click();
      const reloaded = await storagePage.evaluate(
        () =>
          JSON.parse(localStorage.getItem('pawprint-paradise-v1')).records['assisted:time:panda'],
      );
      assert.deepEqual(reloaded, record, fixture.name + ' survives reload');
      const savedTime = await storagePage
        .locator('.option-help')
        .filter({ hasText: '晴浪海湾' })
        .textContent();
      assert.ok(savedTime.includes(finishText), fixture.name + ' displays the saved race time');
      assert.deepEqual(result.errors, [], fixture.name + ' has no page errors');
      Object.assign(result, { passed: true, finishText, record, reloaded });
    } catch (error) {
      await storagePage.screenshot({
        path: path.join(dir, 'repair-storage-' + fixture.name + '-failure.png'),
        fullPage: true,
      });
      throw error;
    } finally {
      await context.close();
    }
  }

  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(
    JSON.stringify({
      passed: report.passed,
      focusChecks: report.focus.length,
      resultWidths: report.widths.map((result) => result.width),
      storageCases: report.storage.length,
      errors: report.errors,
      warnings: report.warnings,
    }),
  );
} catch (error) {
  report.failure = error.stack;
  await page.screenshot({ path: path.join(dir, 'repair-failure.png'), fullPage: true });
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(dir, 'repair-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
