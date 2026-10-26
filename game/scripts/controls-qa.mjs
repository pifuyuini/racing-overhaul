import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const dir = process.env.QA_ARTIFACT_DIR;
if (!dir || path.resolve(process.env.TMPDIR ?? '') !== path.resolve(dir)) {
  throw new Error('Set QA_ARTIFACT_DIR and TMPDIR to the same marked task directory.');
}
await access(path.join(dir, '.codex-tmp'));
const base = process.env.QA_BASE_URL ?? 'http://10.10.10.1:5173/';
const arrows =
  /[\u2190-\u21ff\u2794\u2798-\u27af\u27f0-\u27ff\u2900-\u297f\u2b00-\u2b0d\u2b45-\u2b4c\u2b60-\u2b73\u276e-\u2771\u2039\u203a\u00ab\u00bb]/u;
const report = {
  recordedAt: new Date().toISOString(),
  passed: false,
  checks: [],
  movements: [],
  rewards: [],
  resources: [],
  sourceArrows: [],
  domStages: [],
  errors: [],
  warnings: [],
};
const check = (name, value) => {
  assert.ok(value, name);
  report.checks.push(name);
};
async function scan(file) {
  const content = await readFile(file, 'utf8');
  for (const [index, line] of content.split('\n').entries()) {
    if (arrows.test(line)) report.sourceArrows.push({ file, line: index + 1, text: line.trim() });
  }
}
async function scanDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scanDirectory(file);
    else if (/\.(ts|css|html)$/.test(file)) await scan(file);
  }
}
await scanDirectory('src');
await scan('index.html');
check('source and CSS contain no text arrow glyphs', report.sourceArrows.length === 0);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1366, height: 768 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (error) => report.errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') report.errors.push(message.text());
  if (message.type() === 'warning') report.warnings.push(message.text());
});
const shot = (name) => page.screenshot({ path: path.join(dir, 'controls-' + name + '.png') });
const frame = () =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const snapshot = () => page.evaluate(() => window.__PAWPRINT_TEST__.snapshot());
async function dom(stage) {
  const text = await page.locator('body').innerText();
  check(stage + ' visible DOM contains no text arrows', !arrows.test(text));
  report.domStages.push(stage);
}
async function start(driving = 'assisted', mode = 'time', character = 'panda') {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-action="setup"]').click();
  await page.locator('[data-action="character"][data-id="' + character + '"]').click();
  await page.locator('[data-action="driving"][data-id="' + driving + '"]').click();
  await page.locator('[data-action="mode"][data-id="' + mode + '"]').click();
  await page.locator('[data-action="start"]').click();
  await page.evaluate(() => window.__PAWPRINT_TEST__.step(181));
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().phase === 'racing');
  await frame();
}
async function measure(reference = null) {
  return page.evaluate(async (reference) => {
    const { TRACK } = await import('/src/track.ts');
    const test = window.__PAWPRINT_TEST__,
      state = test.snapshot(),
      r = state.racers[0],
      center = TRACK.at(r.progress),
      camera = test.camera();
    const multiply = (a, v) =>
      [0, 1, 2, 3].map(
        (row) => a[row] * v[0] + a[row + 4] * v[1] + a[row + 8] * v[2] + a[row + 12] * v[3],
      );
    const project = (x, y, z) => {
      const v = multiply(camera.projection, multiply(camera.view, [x, y, z, 1]));
      return v[0] / v[3];
    };
    const y = TRACK.height(r.x, r.z) + 0.8;
    let fromForward = null;
    if (reference) {
      const fx = Math.sin(reference.yaw),
        fz = Math.cos(reference.yaw);
      const along = (r.x - reference.x) * fx + (r.z - reference.z) * fz;
      fromForward =
        project(r.x, y, r.z) - project(reference.x + along * fx, y, reference.z + along * fz);
    }
    return {
      phase: state.phase,
      x: r.x,
      z: r.z,
      yaw: r.yaw,
      progress: r.progress,
      delta: project(r.x, y, r.z) - project(center.x, center.y + 0.8, center.z),
      fromForward,
      drifting: r.drifting,
      charge: r.driftCharge,
      lane: r.lane,
    };
  }, reference);
}
async function advanceUntil(predicate, limit = 2000, frames = 6) {
  for (let count = 0; count < limit; count++) {
    const state = await snapshot();
    if (predicate(state)) {
      await frame();
      return state;
    }
    await page.evaluate((frames) => window.__PAWPRINT_TEST__.step(frames), frames);
    await frame();
  }
  throw new Error('Simulation setup did not reach the requested state.');
}
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await dom('home');
  await shot('home');
  await page.locator('[data-action="setup"]').click();
  await dom('setup');
  await shot('setup');
  await start();
  for (const [key, sign] of [
    ['KeyA', -1],
    ['KeyD', 1],
    ['ArrowLeft', -1],
    ['ArrowRight', 1],
    ['click-left', -1],
    ['click-right', 1],
  ]) {
    if (key.startsWith('click-'))
      await page.locator('.lane-controls [data-action="drive-' + key.slice(6) + '"]').click();
    else await page.keyboard.press(key);
    await page.waitForFunction(
      (sign) => window.__PAWPRINT_TEST__.snapshot().racers[0].lane * sign < -4,
      sign,
    );
    const after = await measure();
    check(key + ' reaches the correct actual screen side', after.delta * sign > 0.02);
    report.movements.push({ driving: 'assisted', key, sign, after });
    await shot('assisted-' + key);
  }
  for (const drift of [false, true])
    for (const [key, sign] of [
      ['KeyA', -1],
      ['KeyD', 1],
    ]) {
      await start('manual');
      await page.keyboard.down('KeyW');
      await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].speed > 14);
      const before = await measure();
      await page.keyboard.down(key);
      if (drift) await page.keyboard.down('Space');
      await page.waitForTimeout(650);
      const after = await measure(before);
      check(
        key +
          (drift ? ' drift' : ' steering') +
          ' moves on the correct side of the initial forward line',
        after.fromForward * sign > 0.02,
      );
      if (drift) check(key + ' drift has real charge', after.drifting && after.charge > 0);
      report.movements.push({ driving: 'manual', key, drift, before, after });
      await shot('manual-' + key + (drift ? '-drift' : '-steer'));
      await page.keyboard.up(key);
      await page.keyboard.up('KeyW');
      await page.keyboard.up('Space');
    }
  for (const side of ['left', 'right']) {
    await start('assisted', 'race');
    await page.evaluate(() => {
      const r = window.__PAWPRINT_TEST__.snapshot().racers[0];
      r.invulnerable = 60;
      r.item = null;
    });
    await advanceUntil((s) => s.route?.id === 'coast');
    check(
      'left route label advertises nitro',
      (await page.locator('#route-left').textContent()).includes('35'),
    );
    check(
      'right route label advertises item',
      (await page.locator('#route-right').textContent()).includes('道具'),
    );
    await page.keyboard.press(side === 'left' ? 'KeyA' : 'KeyD');
    await page.waitForFunction(
      (side) =>
        side === 'left'
          ? window.__PAWPRINT_TEST__.snapshot().racers[0].lane > 4
          : window.__PAWPRINT_TEST__.snapshot().racers[0].lane < -4,
      side,
    );
    const position = await measure();
    check(
      side + ' reward route is on its actual screen side',
      position.delta * (side === 'left' ? -1 : 1) > 0.02,
    );
    await shot('route-' + side);
    await advanceUntil((s) => s.route?.id === 'coast' && s.route.distance < 3, 300, 1);
    await page.evaluate(() => {
      const r = window.__PAWPRINT_TEST__.snapshot().racers[0];
      r.nitro = 0;
      r.item = null;
    });
    const crossing = await advanceUntil((s) => s.route?.id !== 'coast', 30, 1);
    const r = crossing.racers[0];
    check(
      side + ' advertised reward matches the actual crossing',
      side === 'left'
        ? r.nitro >= 35 && r.nitro < 37 && r.item === null
        : r.item !== null && r.nitro < 2,
    );
    report.rewards.push({ side, nitro: r.nitro, item: r.item, position });
  }
  await start();
  await page.locator('.lane-controls [data-action="drive-left"]').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().racers[0].nitroUses === 1);
  check(
    'Space uses nitro without activating the focused lane button',
    (await snapshot()).racers[0].targetLane === 0,
  );
  await advanceUntil((s) => s.interaction && !s.interaction.available);
  check('upcoming interaction is disabled', await page.locator('#action-button').isDisabled());
  check(
    'upcoming prompt state is explicit',
    (await page.locator('#interaction-state').textContent()) === '即将到达',
  );
  await page.keyboard.press('KeyF');
  check(
    'early F does not claim an interaction',
    (await snapshot()).racers[0].successfulActions === 0,
  );
  await shot('prompt-upcoming');
  await advanceUntil((s) => s.interaction?.available && !s.interaction.perfect, 300, 1);
  check(
    'available prompt is enabled',
    (await page.locator('#interaction-state').textContent()) === '现在可按' &&
      !(await page.locator('#action-button').isDisabled()),
  );
  await advanceUntil((s) => s.interaction?.perfect, 200, 1);
  check(
    'perfect prompt is explicit',
    (await page.locator('#interaction-state').textContent()) === '最佳窗口',
  );
  const blocked = await page.evaluate(() => {
    const corridor = {
      left: innerWidth * 0.32,
      right: innerWidth * 0.68,
      top: innerHeight * 0.25,
      bottom: innerHeight * 0.68,
    };
    return ['#route-panel', '#interaction-panel', '.drive-dock', '.minimap'].filter((selector) => {
      const el = document.querySelector(selector);
      if (!el || el.hidden || getComputedStyle(el).display === 'none') return false;
      const b = el.getBoundingClientRect();
      return (
        b.left < corridor.right &&
        b.right > corridor.left &&
        b.top < corridor.bottom &&
        b.bottom > corridor.top
      );
    });
  });
  check('interaction HUD leaves the forward road corridor clear', blocked.length === 0);
  await dom('race');
  await shot('compact-hud');
  await page.evaluate(() => {
    window.__PAWPRINT_TEST__.snapshot().racers[0].stun = 1;
  });
  await frame();
  check(
    'recovering prompt and nitro are disabled',
    (await page.locator('#interaction-state').textContent()) === '恢复中' &&
      (await page.locator('#action-button').isDisabled()) &&
      (await page.locator('[data-action="nitro"]').isDisabled()),
  );
  await page.evaluate(() => {
    window.__PAWPRINT_TEST__.snapshot().racers[0].stun = 0;
  });
  await advanceUntil((s) => !s.interaction, 300, 1);
  check(
    'missed prompt remains explicit',
    (await page.locator('#interaction-state').textContent()) === '已错过',
  );
  await shot('prompt-missed');
  await page.keyboard.press('Escape');
  await dom('pause');
  await page.locator('[data-action="restart"]').click();
  await page.evaluate(() => window.__PAWPRINT_TEST__.step(181));
  await frame();
  check('restart clears missed prompt', !(await page.locator('#interaction-panel').isVisible()));
  await page.evaluate(() => window.__PAWPRINT_TEST__.step(15000));
  await page.locator('[data-action="restart"]').waitFor();
  await dom('results');
  for (let cycle = 0; cycle < 2; cycle++)
    for (const character of ['panda', 'capybara', 'fox', 'penguin']) {
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.locator('[data-action="setup"]').click();
      await page.locator('[data-action="character"][data-id="' + character + '"]').click();
      const image = await page
        .locator('[data-action="character"][data-id="' + character + '"] img')
        .getAttribute('src');
      if (cycle === 0) {
        check(
          character + ' has a rendered model portrait',
          image.startsWith('data:image/png;base64,'),
        );
        await writeFile(
          path.join(dir, 'controls-portrait-' + character + '.png'),
          Buffer.from(image.split(',')[1], 'base64'),
        );
      }
      await page.locator('[data-action="start"]').click();
      await page.evaluate(() => window.__PAWPRINT_TEST__.step(181));
      await frame();
      if (cycle === 0) await shot('model-' + character);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '返回主菜单' }).click();
      await frame();
      report.resources.push({
        cycle,
        character,
        ...(await page.evaluate(() => window.__PAWPRINT_TEST__.stats())),
      });
    }
  check(
    'model swaps release GPU geometry',
    Math.max(...report.resources.slice(4).map((s) => s.geometries)) <=
      Math.max(...report.resources.slice(0, 4).map((s) => s.geometries)) + 5,
  );
  check(
    'model swaps release textures',
    Math.max(...report.resources.slice(4).map((s) => s.textures)) <=
      Math.max(...report.resources.slice(0, 4).map((s) => s.textures)) + 2,
  );
  check('no browser runtime or rendering errors', report.errors.length === 0);
  report.passed = true;
  console.log(
    JSON.stringify({
      passed: true,
      checks: report.checks.length,
      movements: report.movements.length,
      warnings: report.warnings,
    }),
  );
} catch (error) {
  report.failure = error.stack;
  await shot('failure');
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(dir, 'controls-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
