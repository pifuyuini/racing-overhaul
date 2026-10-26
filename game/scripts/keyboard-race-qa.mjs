import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const dir = process.env.QA_ARTIFACT_DIR;
if (!dir) throw new Error('Set QA_ARTIFACT_DIR.');
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const difficulties = process.env.QA_DIFFICULTIES?.split(',').map((value) => value.trim()) ?? [
  'easy',
  'normal',
  'hard',
];
if (difficulties.some((value) => !['easy', 'normal', 'hard'].includes(value)))
  throw new Error('QA_DIFFICULTIES must contain easy, normal, or hard.');
const errors = [],
  reports = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://10.10.10.1:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('[data-setting="sound"]').uncheck();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  for (const difficulty of difficulties) {
    await page.getByRole('button', { name: '出发，去兜个风' }).click();
    await page.locator('[data-action="driving"][data-id="manual"]').click();
    await page.locator('[data-action="difficulty"][data-id="' + difficulty + '"]').click();
    await page.getByRole('button', { name: '驶上发车线' }).click();
    await page.waitForFunction(() => window.__PAWPRINT_TEST__?.snapshot().phase === 'racing');
    await page.evaluate(() => window.__PAWPRINT_TEST__.resetMetrics());
    const held = new Set();
    const started = Date.now();
    let lastProgressAt = started,
      lastLap = -1,
      nextShot = 25,
      peakGeometry = 0,
      peakHeight = 0;
    while (Date.now() - started < 270000) {
      const state = await page.evaluate(() => {
        const t = window.__PAWPRINT_TEST__,
          s = t.snapshot(),
          r = s.racers[0];
        return {
          phase: s.phase,
          elapsed: s.elapsed,
          lap: r.laps,
          progress: r.progress,
          speed: r.speed,
          heightOffset: r.heightOffset,
          interaction: s.interaction,
          controls: t.recommendControls(),
          stats: t.stats(),
          finished: s.racers.map((r) => r.finishTime),
          laps: r.lapTimes,
          position: s.standings.findIndex((r) => r.id === 0) + 1,
        };
      });
      peakGeometry = Math.max(peakGeometry, state.stats.geometries);
      peakHeight = Math.max(peakHeight, state.heightOffset);
      if (state.phase === 'finished') {
        reports.push({
          difficulty,
          time: state.elapsed,
          laps: state.laps,
          position: state.position,
          averageFrameMs: state.stats.averageFrameMs,
          fps: 1000 / state.stats.averageFrameMs,
          drawCalls: state.stats.calls,
          triangles: state.stats.triangles,
          peakGeometry,
          peakHeight,
          events: state.stats.events,
          playerEvents: state.stats.playerEvents,
          items: state.stats.items,
          opponentFinishTimes: state.finished.slice(1),
        });
        console.log(JSON.stringify({ event: 'finished', ...reports.at(-1) }));
        break;
      }
      if (state.lap !== lastLap) {
        console.log(
          JSON.stringify({ event: 'lap', difficulty, lap: state.lap + 1, elapsed: state.elapsed }),
        );
        lastLap = state.lap;
      }
      if (state.elapsed > nextShot) {
        await page.screenshot({
          path: path.join(dir, 'route-' + difficulty + '-' + nextShot + '.jpg'),
          type: 'jpeg',
          quality: 65,
        });
        nextShot += 40;
      }
      const desired = new Set();
      if (state.controls.throttle > 0.1) desired.add('KeyW');
      if (state.controls.throttle < -0.1) desired.add('KeyS');
      if (state.controls.steer > 0.13) desired.add('KeyA');
      if (state.controls.steer < -0.13) desired.add('KeyD');
      for (const key of held)
        if (!desired.has(key)) {
          await page.keyboard.up(key);
          held.delete(key);
        }
      for (const key of desired)
        if (!held.has(key)) {
          await page.keyboard.down(key);
          held.add(key);
        }
      if (state.controls.item) await page.keyboard.press('KeyE');
      if (state.interaction?.perfect) await page.keyboard.press('KeyF');
      if (state.speed > 2) lastProgressAt = Date.now();
      else if (Date.now() - lastProgressAt > 5000) {
        await page.keyboard.press('KeyR');
        lastProgressAt = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    for (const key of held) await page.keyboard.up(key);
    if (reports.length !== difficulties.indexOf(difficulty) + 1)
      throw new Error('Keyboard driver failed to finish ' + difficulty);
    await page.getByRole('button', { name: '返回海湾' }).waitFor();
    await page.screenshot({
      path: path.join(dir, 'keyboard-result-' + difficulty + '.jpg'),
      type: 'jpeg',
      quality: 65,
    });
    await page.getByRole('button', { name: '返回海湾' }).click();
  }
  if (errors.length) throw new Error('Browser runtime errors: ' + errors.join('; '));
  await writeFile(
    path.join(dir, 'keyboard-race-report.json'),
    JSON.stringify({ reports, errors }, null, 2),
  );
  console.log(JSON.stringify({ complete: true, races: reports.length, errors }));
} catch (e) {
  await page.screenshot({
    path: path.join(dir, 'keyboard-failure.jpg'),
    type: 'jpeg',
    quality: 60,
  });
  console.error(JSON.stringify({ reports, errors }));
  throw e;
} finally {
  await browser.close();
}
