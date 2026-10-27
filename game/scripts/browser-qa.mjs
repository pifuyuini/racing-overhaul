import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const artifactDir = process.env.QA_ARTIFACT_DIR;
if (!artifactDir) throw new Error('Set QA_ARTIFACT_DIR to the marked task temporary directory.');
await mkdir(artifactDir, { recursive: true });
const base = process.env.QA_BASE_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  downloadsPath: path.join(artifactDir, 'downloads'),
  tracesDir: path.join(artifactDir, 'traces'),
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const shot = async (name) => page.screenshot({ path: path.join(artifactDir, name + '.png') });
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '出发，去兜个风' }).waitFor();
  await shot('01-home-1920');
  await page.getByRole('button', { name: '出发，去兜个风' }).click();
  await page.locator('[data-action="driving"][data-id="manual"]').click();
  await page.locator('[data-action="character"][data-id="fox"]').click();
  check(
    'character selection',
    (await page.locator('[data-id="fox"]').getAttribute('aria-pressed')) === 'true',
  );
  await shot('02-character-1920');
  await page.getByRole('button', { name: '驶上发车线' }).click();
  await page.waitForFunction(() => window.__PAWPRINT_TEST__?.snapshot().phase === 'racing');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].speed > 14);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].driftCharge > 0.8);
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].boost > 0);
  checks.push('keyboard drift produces boost');
  await shot('03-driving-1920');
  await page.keyboard.press('Escape');
  check('pause screen', await page.getByRole('heading', { name: '海风等你一下。' }).isVisible());
  const pausedTime = await page.evaluate(() => window.__PAWPRINT_TEST__.snapshot().elapsed);
  await page.evaluate(() => window.__PAWPRINT_TEST__.step(120));
  check(
    'pause freezes simulation',
    (await page.evaluate(() => window.__PAWPRINT_TEST__.snapshot().elapsed)) === pausedTime,
  );
  await page.getByRole('button', { name: '继续比赛' }).click();
  for (const item of ['boost', 'shield', 'water', 'banana']) {
    await page.evaluate((item) => window.__PAWPRINT_TEST__.giveItem(item), item);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].item === null);
    checks.push('keyboard item ' + item);
  }
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].recovery > 0);
  checks.push('keyboard recovery');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '重新发车' }).click();
  check(
    'restart resets race',
    await page.evaluate(() => window.__PAWPRINT_TEST__.snapshot().elapsed === 0),
  );
  await page.evaluate(() => {
    window.__PAWPRINT_TEST__.autoDrive(true);
    window.__PAWPRINT_TEST__.step(15000, undefined, true);
  });
  await page.getByRole('button', { name: '再来一局' }).waitFor({ timeout: 20000 });
  await shot('04-results-1920');
  check(
    'race completes three laps',
    await page.evaluate(() => window.__PAWPRINT_TEST__.snapshot().racers[0].lapTimes.length === 3),
  );
  await page.getByRole('button', { name: '返回海湾' }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('[data-setting="sound"]').uncheck();
  await page.locator('[data-setting="quality"]').selectOption('low');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  check(
    'settings persist',
    !(await page.locator('[data-setting="sound"]').isChecked()) &&
      (await page.locator('[data-setting="quality"]').inputValue()) === 'low',
  );
  await page.locator('[data-setting="quality"]').selectOption('medium');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: '出发，去兜个风' }).click();
  await page.locator('[data-action="mode"][data-id="time"]').click();
  await shot('05-time-trial-1366');
  await page.getByRole('button', { name: '驶上发车线' }).click();
  check(
    'time trial has no rivals or items',
    await page.evaluate(() => {
      const s = window.__PAWPRINT_TEST__.snapshot();
      return s.racers.length === 1 && s.boxes.length === 0;
    }),
  );
  await page.evaluate(() => window.__PAWPRINT_TEST__.step(15000, undefined, true));
  await page.getByRole('button', { name: '再来一局' }).waitFor({ timeout: 20000 });
  await shot('06-time-results-1366');
  checks.push('time trial results');
  await page.getByRole('button', { name: '返回海湾' }).click();
  await shot('07-home-1366');
  const geometryCounts = [];
  for (let cycle = 0; cycle < 2; cycle++)
    for (const character of ['panda', 'capybara', 'fox', 'penguin']) {
      await page.getByRole('button', { name: '出发，去兜个风' }).click();
      await page.locator('[data-action="character"][data-id="' + character + '"]').click();
      await page.locator('[data-action="mode"][data-id="race"]').click();
      await page.getByRole('button', { name: '驶上发车线' }).click();
      await page.locator('[data-action="pause"]').click();
      await page.getByRole('button', { name: '返回主菜单' }).click();
      await page.waitForFunction(() => window.__PAWPRINT_TEST__.stats().geometries > 0);
      geometryCounts.push(await page.evaluate(() => window.__PAWPRINT_TEST__.stats().geometries));
    }
  check(
    'character changes release GPU geometry',
    Math.max(...geometryCounts.slice(4)) <= Math.max(...geometryCounts.slice(0, 4)) + 5,
  );
  check(
    'no horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth),
  );
  check('no runtime or shader errors', errors.length === 0);
  await writeFile(
    path.join(artifactDir, 'browser-report.json'),
    JSON.stringify({ checks, errors, geometryCounts }, null, 2),
  );
  console.log(JSON.stringify({ checks: checks.length, errors, artifactDir }));
} catch (error) {
  await shot('failure');
  console.error(
    JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 2000) }),
  );
  throw error;
} finally {
  await browser.close();
}
