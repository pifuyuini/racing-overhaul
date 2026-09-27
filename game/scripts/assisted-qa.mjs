import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const dir = process.env.QA_ARTIFACT_DIR;
if (!dir) throw Error('QA_ARTIFACT_DIR must point to the marked task directory.');
const base = process.env.QA_BASE_URL ?? 'http://10.10.10.1:5173';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [],
  checks = [],
  races = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
const shot = async (name) =>
  page.screenshot({ path: path.join(dir, name + '.jpg'), type: 'jpeg', quality: 80 });
const get = () =>
  page.evaluate(() => {
    const s = window.__PAWPRINT_TEST__.snapshot(),
      r = s.racers[0];
    return {
      phase: s.phase,
      time: s.elapsed,
      progress: r.progress,
      laps: r.laps,
      speed: r.speed,
      rank: s.standings.findIndex((v) => v.id === 0) + 1,
      nitro: r.nitro,
      nitroTime: r.nitroTime,
      nitroUses: r.nitroUses,
      perfect: r.perfectActions,
      actions: r.successfulActions,
      item: r.item,
      lane: r.targetLane,
      actionKind: r.actionKind,
      actionTime: r.actionTime,
      route: s.route,
      interaction: s.interaction,
      finish: r.finishTime,
      lapTimes: r.lapTimes,
      stats: window.__PAWPRINT_TEST__.stats(),
    };
  });
const saveReport = async (passed = false) =>
  writeFile(
    path.join(dir, 'assisted-browser-report.json'),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        browser: browser.version(),
        passed,
        checks,
        errors,
        races,
      },
      null,
      2,
    ),
  );
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '出发，去兜个风' }).waitFor();
  await shot('assisted-home-1920');
  await page.getByRole('button', { name: '出发，去兜个风' }).click();
  check(
    'assisted selected by default',
    (await page
      .locator('[data-action="driving"][data-id="assisted"]')
      .getAttribute('aria-pressed')) === 'true',
  );
  await shot('assisted-setup-1920');
  await page.locator('[data-action="difficulty"][data-id="hard"]').click();
  await page.getByRole('button', { name: '驶上发车线' }).click();
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].speed > 15);
  check('accelerates without W', (await get()).time > 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].lane > 4);
  check('one keyboard press selects and keeps a lane', (await get()).lane === 1);
  await page.locator('.lane-controls [data-action="drive-left"]').click();
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].lane < -4);
  check('mouse route controls drive the same system', (await get()).lane === -1);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].nitroUses === 1);
  await shot('assisted-nitro-1920');
  await page.keyboard.press('Escape');
  const paused = await get();
  await page.evaluate(() => window.__PAWPRINT_TEST__.step(120));
  check(
    'pause freezes energy, timer and action state',
    await page.evaluate((before) => {
      const s = window.__PAWPRINT_TEST__.snapshot(),
        r = s.racers[0];
      return (
        s.elapsed === before.time &&
        r.nitro === before.nitro &&
        r.nitroTime === before.nitroTime &&
        r.actionTime === before.actionTime
      );
    }, paused),
  );
  await page.getByRole('button', { name: '继续比赛' }).click();
  await page.evaluate(() => window.__PAWPRINT_TEST__.giveItem('shield'));
  await page.locator('.item-control').click();
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].shield > 0);
  checks.push('clicking item button activates shield');
  await page.waitForFunction(
    () => window.__PAWPRINT_TEST__.snapshot().interaction?.perfect,
    {},
    { timeout: 25000, polling: 25 },
  );
  await page.keyboard.press('KeyF');
  await page.waitForFunction(
    () => window.__PAWPRINT_TEST__.snapshot().racers[0].perfectActions === 1,
  );
  await page.waitForTimeout(240);
  await shot('assisted-bridge-action-1920');
  checks.push('real-time F key triggers a perfect bridge action');
  await page.waitForFunction(
    () => {
      const p = window.__PAWPRINT_TEST__.snapshot().interaction;
      return p && p.distance < -9 && p.available;
    },
    {},
    { polling: 20, timeout: 30000 },
  );
  await page.locator('#interaction-hint').filter({ hasText: '已过最佳点' }).waitFor();
  checks.push('late interaction asks for immediate action instead of getting closer');
  await page.evaluate(() => {
    const r = window.__PAWPRINT_TEST__.snapshot().racers[0];
    r.stun = 2;
    r.speed = 5;
  });
  await page.locator('#interaction-hint').filter({ hasText: '受击恢复中' }).waitFor();
  check(
    'stun disables unavailable nitro and interactions',
    (await page.locator('[data-action="nitro"]').isDisabled()) &&
      (await page.locator('#action-button').isDisabled()),
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await shot('assisted-race-1366');
  check(
    'desktop controls fit viewport',
    await page.locator('.drive-dock').evaluate((el) => {
      const b = el.getBoundingClientRect();
      return b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight;
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('heading', { name: '海风等你一下。' }).waitFor();
  checks.push('window blur pauses assisted mode');
  await page.getByRole('button', { name: '重新发车' }).click();
  const fresh = await get();
  check(
    'restart resets charge and action counters',
    fresh.time === 0 && fresh.nitro === 60 && fresh.nitroUses === 0 && fresh.perfect === 0,
  );
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().phase === 'racing');
  console.log('Full passive hard race started');
  await page.evaluate(() => window.__PAWPRINT_TEST__.resetMetrics());
  await page.waitForFunction(
    () => window.__PAWPRINT_TEST__.snapshot().phase === 'finished',
    {},
    { timeout: 210000, polling: 500 },
  );
  const passive = await get();
  races.push({ style: 'no input', ...passive });
  await saveReport();
  check(
    'real-time no-input hard race completes',
    passive.laps === 3 && passive.nitroUses === 0 && passive.actions === 0,
  );
  await page.getByRole('button', { name: '再来一局' }).waitFor();
  await shot('assisted-passive-results-1366');
  console.log(
    'Passive finish ' +
      JSON.stringify({
        time: passive.time,
        rank: passive.rank,
        frameMs: passive.stats.averageFrameMs,
      }),
  );
  await page.getByRole('button', { name: '再来一局' }).click();
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().phase === 'racing');
  console.log('Full active hard race started');
  let routeShot = false,
    actionShot = false,
    deadline = Date.now() + 210000;
  while (Date.now() < deadline) {
    const s = await get();
    if (s.phase === 'finished') break;
    assert.equal(s.phase, 'racing');
    if (s.route && s.lane !== 1) await page.keyboard.press('ArrowRight');
    else if (!s.route && s.lane !== 0) await page.keyboard.press('ArrowUp');
    if (s.interaction?.perfect) await page.keyboard.press('KeyF');
    if (s.nitro >= 30 && s.nitroTime < 0.05) await page.keyboard.press('Space');
    if (s.item) await page.keyboard.press('KeyE');
    if (s.route && !routeShot) {
      await shot('assisted-route-choice-1366');
      routeShot = true;
    }
    if (s.actionKind === 'spin' && s.actionTime > 0.6 && !actionShot) {
      await shot('assisted-spin-1366');
      actionShot = true;
    }
    await page.waitForTimeout(90);
  }
  const active = await get();
  races.push({ style: 'player decisions', ...active });
  await saveReport();
  check(
    'active decisions complete a faster real-time race',
    active.phase === 'finished' && active.time < passive.time * 0.94,
  );
  check(
    'nine track interactions are available through the race',
    active.actions >= 8 && active.perfect >= 7,
  );
  await page.getByRole('button', { name: '再来一局' }).waitFor();
  await shot('assisted-active-results-1366');
  console.log(
    'Active finish ' +
      JSON.stringify({
        time: active.time,
        rank: active.rank,
        perfect: active.perfect,
        frameMs: active.stats.averageFrameMs,
      }),
  );
  await page.getByRole('button', { name: '返回海湾' }).click();
  await page.getByRole('button', { name: '出发，去兜个风' }).click();
  await page.locator('[data-action="mode"][data-id="time"]').click();
  await page.locator('[data-action="character"][data-id="penguin"]').click();
  await shot('assisted-setup-1366');
  await page.getByRole('button', { name: '驶上发车线' }).click();
  await page.locator('.item-control').waitFor({ state: 'hidden' });
  check('time trial hides item control', await page.locator('.item-control').isHidden());
  await page.evaluate(() => window.__PAWPRINT_TEST__.step(15000));
  await page.getByRole('button', { name: '再来一局' }).waitFor();
  check('assisted time trial records three laps', (await get()).lapTimes.length === 3);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('pawprint-paradise-v1')));
  check(
    'records are saved under assisted namespaces',
    save.records['assisted:time:penguin']?.race > 0 &&
      save.records['assisted:race:panda']?.race > 0,
  );
  await page.getByRole('button', { name: '返回海湾' }).click();
  await page.getByRole('button', { name: '出发，去兜个风' }).click();
  await page.locator('[data-action="driving"][data-id="manual"]').click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '出发，去兜个风' }).click();
  check(
    'driving preference survives reload',
    (await page
      .locator('[data-action="driving"][data-id="manual"]')
      .getAttribute('aria-pressed')) === 'true',
  );
  await page.locator('[data-action="driving"][data-id="assisted"]').click();
  await page.locator('[data-action="home"]').first().click();
  await page.setViewportSize({ width: 575, height: 900 });
  await shot('assisted-home-narrow');
  check(
    'narrow preview menu has no overflow',
    await page.evaluate(() => document.documentElement.scrollWidth === innerWidth),
  );
  check('no runtime or shader errors', errors.length === 0);
  const report = {
    recordedAt: new Date().toISOString(),
    browser: browser.version(),
    passed: true,
    checks,
    errors,
    races,
  };
  await writeFile(path.join(dir, 'assisted-browser-report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      checks: checks.length,
      errors,
      races: races.map((r) => ({
        style: r.style,
        time: r.time,
        rank: r.rank,
        perfect: r.perfect,
        stats: r.stats,
      })),
    }),
  );
} catch (error) {
  await saveReport();
  await shot('assisted-failure');
  console.error(
    JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 2000) }),
  );
  throw error;
} finally {
  await browser.close();
}
