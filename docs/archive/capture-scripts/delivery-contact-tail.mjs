import { createRequire } from "node:module";
const { chromium } = createRequire(
  new URL("../../../game/package.json", import.meta.url),
)("playwright-core");
const base = process.env.QA_BASE_URL ?? "http://localhost:5173/";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const dir = process.env.QA_ARTIFACT_DIR,
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    channel: process.env.CHROME_PATH ? undefined : "chrome",
    headless: true,
  }),
  page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
  }),
  report = {
    passed: false,
    errors: [],
    warnings: [],
    scenes: {},
    bridge: [],
    resources: [],
  };
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error") report.errors.push(e.text());
  if (e.type() === "warning") report.warnings.push(e.text());
});
const frame = () =>
  page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
const shot = async (name) => {
  await page.screenshot({ path: path.join(dir, name + ".png") });
  console.log("READY " + name + ".png");
};
async function read() {
  return page.evaluate(async () => {
    const t = window.__PAWPRINT_TEST__,
      s = t.snapshot(),
      { TRACK } = await import("/src/track.ts"),
      camera = t.camera(),
      mul = (a, v) =>
        [0, 1, 2, 3].map(
          (i) =>
            a[i] * v[0] + a[i + 4] * v[1] + a[i + 8] * v[2] + a[i + 12] * v[3],
        ),
      project = (x, y, z) => {
        const v = mul(camera.projection, mul(camera.view, [x, y, z, 1]));
        return { x: v[0] / v[3], y: v[1] / v[3], w: v[3] };
      },
      bounds = s.racers.map((r) => {
        const points = [];
        for (const x of [-2, 2])
          for (const z of [-2.5, 2.5])
            for (const y of [0, 4.2])
              points.push(
                project(
                  r.x + Math.cos(r.yaw) * x + Math.sin(r.yaw) * z,
                  TRACK.height(r.x, r.z) + r.heightOffset + y,
                  r.z - Math.sin(r.yaw) * x + Math.cos(r.yaw) * z,
                ),
              );
        return {
          id: r.id,
          minX: Math.min(...points.map((p) => p.x)),
          maxX: Math.max(...points.map((p) => p.x)),
          minY: Math.min(...points.map((p) => p.y)),
          maxY: Math.max(...points.map((p) => p.y)),
          allInFront: points.every((p) => p.w > 0),
        };
      });
    const el = document.querySelector("#countdown"),
      style = el && getComputedStyle(el);
    return {
      elapsed: s.elapsed,
      racers: structuredClone(s.racers),
      projectiles: structuredClone(s.projectiles),
      stats: t.stats(),
      visuals: t.visuals(),
      bounds,
      goVisible: !!(
        el &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0.01 &&
        el.textContent.trim()
      ),
    };
  });
}
async function start(
  driving = "assisted",
  fresh = true,
  waitGo = true,
  character = "panda",
) {
  if (fresh) await page.goto(base, { waitUntil: "networkidle" });
  await page.locator('[data-action="setup"]').click();
  await page
    .locator('[data-action="character"][data-id="' + character + '"]')
    .click();
  await page
    .locator('[data-action="driving"][data-id="' + driving + '"]')
    .click();
  await page.locator('[data-action="mode"][data-id="race"]').click();
  await page.locator('[data-action="start"]').click();
  if (!waitGo) await page.evaluate(() => window.__PAWPRINT_TEST__.step(210));
  await page.waitForFunction(
    () => window.__PAWPRINT_TEST__.snapshot().phase === "racing",
  );
  if (waitGo)
    await page.waitForFunction(() => {
      const t = window.__PAWPRINT_TEST__,
        el = document.querySelector("#countdown"),
        style = el && getComputedStyle(el);
      return (
        t.snapshot().elapsed > 2 &&
        (!el ||
          !el.textContent.trim() ||
          style.display === "none" ||
          Number(style.opacity) < 0.01)
      );
    });
  await frame();
}
async function fixture({ progress = 0.3, player = {}, other = null } = {}) {
  await page.evaluate(
    async ({ progress, player, other }) => {
      const { TRACK } = await import("/src/track.ts"),
        t = window.__PAWPRINT_TEST__,
        s = t.snapshot(),
        p = s.racers[0],
        clone = structuredClone(s.racers[1] ?? p),
        point = TRACK.at(progress);
      function place(r, f, left, values) {
        Object.assign(
          r,
          {
            x: point.x + Math.sin(point.yaw) * f + Math.cos(point.yaw) * left,
            z: point.z + Math.cos(point.yaw) * f - Math.sin(point.yaw) * left,
            yaw: point.yaw,
            velocityYaw: point.yaw,
            speed: 0,
            lateralSpeed: 0,
            heightOffset: 0,
            verticalSpeed: 0,
            surface: "road",
            grip: 1,
            slipTime: 0,
            impactTime: 0,
            impactStrength: 0,
            landingTime: 0,
            acceleration: 0,
            steer: 0,
            progress: progress + f / TRACK.length,
            lastProgress: progress + f / TRACK.length,
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
      s.racers.splice(1);
      t.step(1);
      place(p, 0, 0, player);
      if (other) {
        clone.id = 1;
        place(clone, other.forward, other.left, other.values);
        s.racers.splice(1, s.racers.length - 1, clone);
      } else s.racers.splice(1);
      s.projectiles.splice(0);
      t.resetMetrics();
      t.settleView();
    },
    { progress, player, other },
  );
  await frame();
}
function inFrame(s) {
  assert.equal(s.goVisible, false);
  assert.ok(
    s.bounds.every(
      (b) =>
        b.allInFront &&
        b.minX > -0.98 &&
        b.maxX < 0.98 &&
        b.minY > -1 &&
        b.maxY < 0.98,
    ),
    "conservative full kart bounds must fit the formal camera",
  );
}
async function home() {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "返回主菜单" }).click();
  await frame();
}
try {
  let s;
  const previous = JSON.parse(
    await readFile(path.join(dir, "delivery-overhaul-report.json"), "utf8"),
  );
  report.scenes = previous.scenes;
  await start();
  await fixture({
    player: { speed: 22 },
    other: { forward: 0, left: -2, values: { speed: 22, lateralSpeed: 7 } },
  });
  const beforeContact = await read();
  await page.keyboard.press("KeyA");
  await page.waitForFunction(
    () => window.__PAWPRINT_TEST__.stats().playerEvents.collision > 0,
    undefined,
    { timeout: 5000 },
  );
  await frame();
  s = await read();
  inFrame(s);
  assert.equal(s.racers[0].targetLane, -1);
  assert.ok(s.racers[1].lateralSpeed > 0.1);
  report.scenes.contact = { before: beforeContact, after: s };
  await shot("delivery-overhaul-contact");
  await start("manual");
  for (const [name, progress] of [
    ["start", 0.189],
    ["mid", 0.215],
    ["end", 0.241],
  ]) {
    await fixture({ progress });
    s = await read();
    assert.equal(s.racers[0].surface, "wood");
    assert.ok(s.visuals.wheels.every((w) => Math.abs(w.clearance) < 0.15));
    assert.equal(s.goVisible, false);
    report.bridge.push({ name, progress, visuals: s.visuals, stats: s.stats });
    await shot("delivery-bridge-" + name);
  }
  await home();
  for (let cycle = 0; cycle < 2; cycle++)
    for (const [character, item] of [
      ["panda", "pulse"],
      ["fox", "oil"],
    ]) {
      await start("assisted", false, false, character);
      await frame();
      await page.evaluate(() => window.__PAWPRINT_TEST__.resetMetrics());
      await page.evaluate(
        (item) => window.__PAWPRINT_TEST__.giveItem(item),
        item,
      );
      await page.waitForFunction(
        (item) =>
          document.querySelector("#dock-item").textContent ===
          { pulse: "潮汐冲击", oil: "墨汁陷阱" }[item],
        item,
      );
      await page.keyboard.press("KeyE");
      await page.waitForFunction(
        (item) => window.__PAWPRINT_TEST__.stats().items[item] === 1,
        item,
      );
      await home();
      report.resources.push({
        cycle,
        character,
        item,
        ...(await page.evaluate(() => window.__PAWPRINT_TEST__.stats())),
      });
    }
  assert.ok(
    Math.max(...report.resources.slice(2).map((s) => s.geometries)) <=
      Math.max(...report.resources.slice(0, 2).map((s) => s.geometries)) + 5,
  );
  assert.ok(
    Math.max(...report.resources.slice(2).map((s) => s.textures)) <=
      Math.max(...report.resources.slice(0, 2).map((s) => s.textures)) + 2,
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(
    JSON.stringify({
      passed: true,
      scenes: Object.keys(report.scenes),
      bridge: report.bridge.map((b) => b.name),
      geometry: report.resources.map((r) => r.geometries),
      textures: report.resources.map((r) => r.textures),
      errors: report.errors,
      warnings: report.warnings,
    }),
  );
} catch (error) {
  report.failureState = await read();
  report.failure = error.stack;
  console.error(error);
  await shot("delivery-overhaul-failure");
  process.exitCode = 1;
} finally {
  await writeFile(
    path.join(dir, "delivery-overhaul-report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
