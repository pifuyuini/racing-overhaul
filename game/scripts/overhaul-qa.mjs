import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
const dir = process.env.QA_ARTIFACT_DIR;
if (!dir || path.resolve(process.env.TMPDIR ?? '') !== path.resolve(dir))
  throw Error('Set QA_ARTIFACT_DIR and TMPDIR to the same marked directory.');
await access(path.join(dir, '.codex-tmp'));
const groups = process.env.QA_OVERHAUL_GROUPS?.split(',') ?? [
  'collision',
  'items',
  'interactions',
  'ui',
  'lifecycle',
];
assert.ok(
  groups.every((name) => ['collision', 'items', 'interactions', 'ui', 'lifecycle'].includes(name)),
);
const report = {
  recordedAt: new Date().toISOString(),
  groups,
  passed: false,
  checks: [],
  cases: [],
  errors: [],
  warnings: [],
};
let currentCase = 'startup';
const check = (name, value) => {
  assert.ok(value, currentCase + ': ' + name);
  report.checks.push(currentCase + ': ' + name);
};
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1366, height: 768 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('console', (e) => {
  if (e.type() === 'error') report.errors.push(e.text());
  if (e.type() === 'warning') report.warnings.push(e.text());
});
const base = process.env.QA_BASE_URL ?? 'http://10.10.10.1:5173/';
const frame = () =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const shot = (name = currentCase) =>
  page.screenshot({ path: path.join(dir, 'overhaul-' + name + '.png') });
async function run(name, callback) {
  currentCase = name;
  const entry = { name, passed: false };
  report.cases.push(entry);
  await callback(entry);
  entry.passed = true;
}
async function group(name, callback) {
  if (groups.includes(name)) await callback();
}
async function read() {
  return page.evaluate(async () => {
    const t = window.__PAWPRINT_TEST__,
      s = t.snapshot(),
      { TRACK } = await import('/src/track.ts');
    return {
      phase: s.phase,
      elapsed: s.elapsed,
      racers: structuredClone(s.racers),
      projectiles: structuredClone(s.projectiles),
      interaction: s.interaction,
      stats: t.stats(),
      visuals: t.visuals(),
      camera: t.camera(),
      terrain: TRACK.height(s.racers[0].x, s.racers[0].z),
    };
  });
}
async function step(frames = 1) {
  await page.evaluate((n) => window.__PAWPRINT_TEST__.step(n), frames);
  await frame();
}
async function until(predicate, message, limit = 180) {
  for (let index = 0; index < limit; index++) {
    const state = await read();
    if (predicate(state)) return state;
    await step();
  }
  throw Error(currentCase + ': did not reach ' + message);
}
async function start(driving = 'assisted', character = 'panda') {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-action="setup"]').click();
  await page.locator('[data-action="character"][data-id="' + character + '"]').click();
  await page.locator('[data-action="mode"][data-id="race"]').click();
  await page.locator('[data-action="driving"][data-id="' + driving + '"]').click();
  await page.locator('[data-action="start"]').click();
  await page.evaluate(() => window.__PAWPRINT_TEST__.step(210));
  await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().phase === 'racing');
  await frame();
}
async function prepare(options = {}) {
  await start(options.driving ?? 'assisted');
  const before = await page.evaluate(async (options) => {
    const { TRACK } = await import('/src/track.ts'),
      t = window.__PAWPRINT_TEST__,
      s = t.snapshot(),
      point = TRACK.at(options.progress ?? 0.3),
      p = s.racers[0];
    const original = structuredClone(s.racers[1] ?? p);
    function place(r, forward, left, values = {}) {
      const progress = (options.progress ?? 0.3) + forward / TRACK.length;
      Object.assign(
        r,
        {
          x: point.x + Math.sin(point.yaw) * forward + Math.cos(point.yaw) * left,
          z: point.z + Math.cos(point.yaw) * forward - Math.sin(point.yaw) * left,
          yaw: point.yaw,
          velocityYaw: point.yaw,
          speed: 22,
          lateralSpeed: 0,
          heightOffset: 0,
          previousHeightOffset: 0,
          verticalSpeed: 0,
          surface: 'road',
          grip: 1,
          slipTime: 0,
          impactTime: 0,
          impactStrength: 0,
          landingTime: 0,
          acceleration: 0,
          steer: 0,
          progress,
          lastProgress: progress,
          beforeStart: false,
          laps: 0,
          nextCheckpoint: 0,
          completedDistance: progress * TRACK.length,
          lapTimes: [],
          finishTime: null,
          driftCharge: 0,
          drifting: false,
          driftDirection: 0,
          boost: 0,
          shield: 0,
          stun: 0,
          invulnerable: 0,
          item: null,
          itemCooldown: 0,
          lane: left,
          targetLane: 0,
          nitro: 60,
          nitroTime: 0,
          actionKind: null,
          actionTime: 0,
          actionDuration: 0,
          perfectActions: 0,
          successfulActions: 0,
          nitroUses: 0,
          recovery: 0,
          aiThink: 999,
        },
        values,
      );
      r.previousX = r.x;
      r.previousZ = r.z;
      r.previousYaw = r.yaw;
      r.previousHeightOffset = r.heightOffset;
    }
    place(p, 0, 0, options.player);
    if (options.other === null) s.racers.splice(1);
    else {
      original.id = 1;
      place(
        original,
        options.other?.forward ?? 12,
        options.other?.left ?? 0,
        options.other?.values,
      );
      s.racers.splice(1, s.racers.length - 1, original);
    }
    s.projectiles.splice(0);
    t.resetMetrics();
    t.settleView();
    return { player: structuredClone(p), other: s.racers[1] ? structuredClone(s.racers[1]) : null };
  }, options);
  await frame();
  return before;
}
const itemButton = () => page.locator('[data-action="item"]:visible').first();
async function give(item) {
  const label = await page.evaluate(async (item) => {
    window.__PAWPRINT_TEST__.giveItem(item);
    return (await import('/src/types.ts')).ITEM_INFO[item].name;
  }, item);
  const selector = (await page.locator('#dock-item').count()) ? '#dock-item' : '#item-name';
  await page.waitForFunction(
    ({ selector, label }) => document.querySelector(selector)?.textContent === label,
    { selector, label },
  );
}
async function use(item) {
  await give(item);
  await page.keyboard.press('KeyE');
  return until((s) => s.stats.items[item] === 1, item + ' real E use');
}
const targetFor = (type, height = 0) => ({
  forward: type === 'water' || type === 'homing' ? (height ? 7 : 12) : type === 'pulse' ? 0 : -3.2,
  left: type === 'pulse' ? 4 : 0,
  values: { speed: type === 'water' || type === 'homing' ? 18 : 0, heightOffset: height },
});
try {
  await group('collision', async () => {
    await run('collision-rear', async (e) => {
      e.before = await prepare({
        player: { speed: 32 },
        other: { forward: 3.5, values: { speed: 12 } },
      });
      e.after = await until((s) => s.stats.events.collision > 0, 'rear contact');
      check('front racer gains speed', e.after.racers[1].speed > e.before.other.speed + 1);
      check('rear racer transfers speed', e.after.racers[0].speed < e.before.player.speed - 1);
      check(
        'physical impact is rendered',
        e.after.visuals.particles > 0 || e.after.racers[0].impactTime > 0,
      );
      await shot();
    });
    await run('collision-side', async (e) => {
      e.before = await prepare({ other: { forward: 0, left: -2, values: { lateralSpeed: 7 } } });
      e.contact = await until((s) => s.stats.playerEvents.collision > 0, 'side contact');
      check('player receives lateral momentum', e.contact.racers[0].lateralSpeed > 0.3);
      await step(10);
      e.sustained = await read();
      check(
        'assisted guidance does not erase the side displacement',
        e.sustained.racers[0].lane > 0.15,
      );
      await shot();
      await step(90);
      e.recovery = await read();
      check(
        'car keeps moving after the contact',
        e.recovery.racers[0].speed > 10 && Number.isFinite(e.recovery.racers[0].lateralSpeed),
      );
    });
  });
  await group('items', async () => {
    const icons = [];
    for (const [index, type] of [
      'boost',
      'shield',
      'water',
      'banana',
      'homing',
      'pulse',
      'oil',
    ].entries()) {
      await run('item-' + type, async (e) => {
        await prepare({ driving: index % 2 ? 'manual' : 'assisted' });
        await give(type);
        icons.push(await itemButton().locator('svg').first().innerHTML());
        e.active = await use(type);
        check(
          'E consumes this item exactly once',
          e.active.racers[0].item === null && e.active.stats.items[type] === 1,
        );
        if (type === 'boost')
          check('boost changes the active propulsion state', e.active.racers[0].boost > 0);
        else if (type === 'shield')
          check('shield activates protection', e.active.racers[0].shield > 0);
        else {
          check(
            'real projectile exists',
            e.active.projectiles.some((p) => p.type === type),
          );
          check('projectile mesh exists', e.active.visuals.projectiles > 0);
        }
        await shot();
        await page.keyboard.press('KeyE');
        await frame();
        check('empty-hand E does not duplicate use', (await read()).stats.items[type] === 1);
      });
    }
    check('all seven item icons have distinct drawn geometry', new Set(icons).size === 7);
    for (const type of ['water', 'banana', 'homing', 'pulse', 'oil']) {
      await run('hit-' + type, async (e) => {
        await prepare({ other: targetFor(type) });
        await use(type);
        e.hit = await until(
          (s) =>
            type === 'oil'
              ? s.racers[1].slipTime > 0 && s.racers[1].grip < 0.4
              : type === 'pulse'
                ? s.racers[1].impactTime > 0
                : s.racers[1].stun > 0,
          'actual target effect',
        );
        if (type === 'oil')
          check(
            'oil lowers grip without stun',
            e.hit.racers[1].stun === 0 && e.hit.stats.events.slip > 0,
          );
        else check('target hit event is observed', e.hit.stats.events.hit > 0);
        await shot();
        if (type === 'pulse') {
          await page.evaluate(() => {
            window.__PAWPRINT_TEST__.snapshot().racers[1].invulnerable = 0;
          });
          await step(6);
          e.later = await read();
          check('pulse does not damage the same target twice', e.later.stats.events.hit === 1);
        }
      });
      await run('shield-block-' + type, async (e) => {
        await prepare({
          other: { ...targetFor(type), values: { ...targetFor(type).values, shield: 6 } },
        });
        await use(type);
        e.block = await until((s) => s.stats.events['shield-block'] > 0, 'shield block');
        check(
          'shield absorbs the effect',
          e.block.racers[1].shield === 0 &&
            e.block.racers[1].stun === 0 &&
            e.block.racers[1].slipTime === 0,
        );
      });
      await run('height-avoid-' + type, async (e) => {
        await prepare({ other: targetFor(type, 2.5) });
        await use(type);
        await step(6);
        e.crossing = await read();
        check(
          'airborne target clears the effect',
          e.crossing.racers[1].heightOffset > 0.7 &&
            e.crossing.racers[1].stun === 0 &&
            e.crossing.racers[1].slipTime === 0 &&
            !e.crossing.stats.events.hit &&
            !e.crossing.stats.events.slip,
        );
      });
    }
    await run('water-different-lane', async (e) => {
      await prepare({ other: { forward: 12, left: 5 } });
      await use('water');
      await step(45);
      e.after = await read();
      check(
        'water misses a different lane',
        !e.after.stats.events.hit && e.after.racers[1].stun === 0,
      );
    });
    await run('homing-finite-turn-dodge', async (e) => {
      await prepare();
      await use('homing');
      e.turn = await page.evaluate(() => {
        const t = window.__PAWPRINT_TEST__,
          s = t.snapshot(),
          target = s.racers[1],
          p = s.projectiles.find((p) => p.type === 'homing'),
          yaw = p.yaw;
        target.x += Math.cos(target.yaw) * 7.5;
        target.z -= Math.sin(target.yaw) * 7.5;
        target.previousX = target.x;
        target.previousZ = target.z;
        target.lane = 7.5;
        target.speed = 30;
        t.step(1);
        return Math.abs(Math.atan2(Math.sin(p.yaw - yaw), Math.cos(p.yaw - yaw)));
      });
      check(
        'homing cannot instantly turn at a controlled late lane change',
        e.turn <= 1.8 / 60 + 0.000001,
      );
      await step(18);
      e.after = await read();
      check(
        'late lateral target can evade this pass',
        e.after.racers[1].stun === 0 && !e.after.stats.events.hit,
      );
      await shot();
    });
  });
  await group('interactions', async () => {
    for (const driving of ['manual', 'assisted'])
      await run('jump-' + driving, async (e) => {
        await prepare({ driving, progress: 0.215, other: null });
        e.ground = await read();
        await page.waitForFunction(
          () =>
            !document.querySelector('#interaction-panel').hidden &&
            !document.querySelector('#action-button').disabled,
        );
        await page.keyboard.press('KeyF');
        e.air = await until((s) => s.racers[0].heightOffset > 1.3, 'real jump height');
        check(
          'real F launches physical vertical motion',
          e.air.racers[0].verticalSpeed > 0 && e.air.stats.playerEvents.launch === 1,
        );
        check(
          'rendered root tracks the physical height',
          Math.abs(e.air.visuals.root[1] - e.air.terrain - e.air.racers[0].heightOffset) < 0.2,
        );
        check(
          'all rendered tires leave the road',
          e.air.visuals.wheels.every((wheel) => wheel.clearance > 0.6),
        );
        await shot();
        e.land = await until(
          (s) => s.racers[0].heightOffset === 0 && s.stats.playerEvents.land === 1,
          'physical landing',
        );
        check(
          'landing is physical and unique',
          e.land.racers[0].landingTime > 0 && e.land.stats.playerEvents.land === 1,
        );
        check(
          'rendered tires contact the road after landing',
          e.land.visuals.wheels.every((wheel) => Math.abs(wheel.clearance) < 0.15),
        );
        await shot('landing-' + driving);
      });
    for (const [progress, kind, maximum] of [
      [0.51, 'sand', 0.8],
      [0.78, 'wet', 0.65],
    ])
      await run('surface-' + kind, async (e) => {
        await prepare({ driving: 'manual', progress, other: null });
        e.state = await read();
        check(
          'surface changes actual grip',
          e.state.racers[0].surface === kind && e.state.racers[0].grip < maximum,
        );
        await shot();
      });
    await run('sand-F-drift', async (e) => {
      await prepare({ driving: 'manual', progress: 0.51, other: null });
      e.before = await read();
      await page.keyboard.press('KeyF');
      e.after = await until((s) => s.racers[0].actionKind === 'drift', 'sand action');
      check(
        'F changes lateral momentum and grip',
        Math.abs(e.after.racers[0].lateralSpeed) > 0.2 &&
          e.after.racers[0].grip < e.before.racers[0].grip,
      );
      await shot();
    });
    for (const driving of ['manual', 'assisted'])
      await run('wind-' + driving, async (e) => {
        await prepare({ driving, progress: 0.87, other: null });
        await step(12);
        e.wind = await read();
        check('wind applies actual sideways velocity', e.wind.racers[0].lateralSpeed > 0.05);
        await prepare({ driving, progress: 0.87, other: null });
        await page.keyboard.press('KeyF');
        await until((s) => s.racers[0].actionKind === 'spin', 'wind action');
        await step(12);
        e.spin = await read();
        check(
          'successful F reduces the wind force',
          Math.abs(e.spin.racers[0].lateralSpeed) < Math.abs(e.wind.racers[0].lateralSpeed) * 0.6,
        );
        await shot();
      });
  });
  await group('ui', async () => {
    for (const driving of ['manual', 'assisted'])
      await run('guards-' + driving, async (e) => {
        await prepare({ driving, other: null });
        await give('homing');
        await frame();
        check('homing without a target is disabled', await itemButton().isDisabled());
        await page.keyboard.press('KeyE');
        check('homing is retained', (await read()).racers[0].item === 'homing');
        await page.evaluate(() => {
          const r = window.__PAWPRINT_TEST__.snapshot().racers[0];
          r.heightOffset = 2.5;
          r.previousHeightOffset = 2.5;
          r.verticalSpeed = 0;
        });
        for (const type of ['banana', 'pulse', 'oil']) {
          await give(type);
          check('airborne ' + type + ' is disabled', await itemButton().isDisabled());
          await page.keyboard.press('KeyE');
          check('airborne ' + type + ' is retained', (await read()).racers[0].item === type);
        }
        await page.evaluate(() => {
          const r = window.__PAWPRINT_TEST__.snapshot().racers[0];
          r.stun = 1;
        });
        await give('shield');
        check('shield remains available under stun', !(await itemButton().isDisabled()));
        await page.keyboard.press('KeyE');
        e.shield = await until((s) => s.racers[0].shield > 0, 'shield under stun');
        await shot();
      });
  });
  await group('lifecycle', async () => {
    await run('pause-and-camera', async (e) => {
      await prepare({ other: { forward: 50 } });
      await use('water');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().phase === 'paused');
      e.before = await read();
      await page.waitForTimeout(350);
      e.paused = await read();
      check(
        'pause freezes physics and projectile lifetime',
        e.before.elapsed === e.paused.elapsed &&
          JSON.stringify(e.before.projectiles) === JSON.stringify(e.paused.projectiles),
      );
      check(
        'pause freezes transient effect pools',
        ['particles', 'marks', 'rings'].every(
          (key) => e.before.visuals[key] === e.paused.visuals[key],
        ),
      );
      await page.getByRole('button', { name: '继续比赛' }).click();
      const positions = [];
      for (let index = 0; index < 30; index++) {
        await frame();
        positions.push((await read()).camera.position);
      }
      e.maxCameraStep = Math.max(
        ...positions
          .slice(1)
          .map((p, index) => Math.hypot(...p.map((value, axis) => value - positions[index][axis]))),
      );
      check(
        'normal camera motion stays finite and continuous',
        Number.isFinite(e.maxCameraStep) && e.maxCameraStep < 2,
      );
    });
    await run('resource-and-characters', async (e) => {
      await start();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '返回主菜单' }).click();
      e.resources = [];
      for (let cycle = 0; cycle < 2; cycle++)
        for (const [index, character] of ['panda', 'capybara', 'fox', 'penguin'].entries()) {
          await page.locator('[data-action="setup"]').click();
          await page.locator('[data-action="character"][data-id="' + character + '"]').click();
          if (!cycle) {
            const image = await page
              .locator('[data-action="character"][data-id="' + character + '"] img')
              .getAttribute('src');
            await writeFile(
              path.join(dir, 'overhaul-portrait-' + character + '.png'),
              Buffer.from(image.split(',')[1], 'base64'),
            );
          }
          await page.locator('[data-action="start"]').click();
          await page.evaluate(() => window.__PAWPRINT_TEST__.step(210));
          await page.waitForFunction(() => window.__PAWPRINT_TEST__.snapshot().phase === 'racing');
          await frame();
          await page.evaluate(() => window.__PAWPRINT_TEST__.resetMetrics());
          await use(['water', 'pulse', 'oil', 'banana'][index]);
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: '返回主菜单' }).click();
          await frame();
          e.resources.push({
            cycle,
            character,
            ...(await page.evaluate(() => window.__PAWPRINT_TEST__.stats())),
          });
        }
      check(
        'effect and character cycles release geometry',
        Math.max(...e.resources.slice(4).map((s) => s.geometries)) <=
          Math.max(...e.resources.slice(0, 4).map((s) => s.geometries)) + 5,
      );
      check(
        'effect and character cycles release textures',
        Math.max(...e.resources.slice(4).map((s) => s.textures)) <=
          Math.max(...e.resources.slice(0, 4).map((s) => s.textures)) + 2,
      );
    });
  });
  check('no runtime or renderer errors', report.errors.length === 0);
  report.passed = true;
  console.log(
    JSON.stringify({
      passed: true,
      groups,
      cases: report.cases.length,
      checks: report.checks.length,
      errors: report.errors,
      warnings: report.warnings,
    }),
  );
} catch (error) {
  report.failure = error.stack;
  report.failedCase = currentCase;
  console.error(error);
  await shot('failure-' + currentCase);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(dir, 'overhaul-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
