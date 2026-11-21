import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import {
  startServer,
  waitFonts,
  setupEventLog,
  waitReposoEnSeccion,
  waitAparicionInicial,
  assertReposoRenderizado,
  MAX_DIST_ANCLAJE,
} from "./motion-helpers.mjs";

const artifactDir = "/opt/cursor/artifacts";
const STEP_MS = 2000;
const NAV_FLOW = [
  { href: "#habilidades", id: "habilidades" },
  { href: "#enlaces", id: "enlaces" },
  { href: "#sobre-mi", id: "sobre-mi" },
];

function fail(msg) {
  console.error(`FALLO render: ${msg}`);
  throw new Error(msg);
}

function ok(msg) {
  console.log(`  OK — ${msg}`);
}

async function correrFlujoNav(page, widths) {
  for (const { href, id } of NAV_FLOW) {
    await page.click(`nav a[href="${href}"]`);
    await waitReposoEnSeccion(page, id);
    await page.waitForTimeout(300);
    const m = await assertReposoRenderizado(page, id);
    if (!m.ok) {
      fail(
        `${widths}px tras ${id}: distVp=${m.distViewport}px distCss=${m.distCss}px overlap=${m.overlap} inVp=${m.inViewport}`
      );
    }
    ok(
      `${widths}px ${id}: caja en viewport, ≤${MAX_DIST_ANCLAJE}px del anclaje, sin solape texto`
    );
  }
}

async function assertSaltoAnimado(page, label) {
  await page.waitForFunction(
    () => document.getElementById("mascota").dataset.estado === "reposo",
    null,
    { timeout: 16000 }
  );
  await page.click('nav a[href="#enlaces"]');
  await page.waitForFunction(
    () => document.getElementById("mascota").dataset.estado === "salto",
    null,
    { timeout: 12000 }
  );
  const frames = [];
  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(25);
    const f = await page.evaluate(() => {
      const m = document.getElementById("mascota");
      const r = m.getBoundingClientRect();
      const svg = m.querySelector("svg");
      const sm = new DOMMatrixReadOnly(getComputedStyle(svg).transform);
      return {
        cy: Math.round((r.top + r.bottom) / 2),
        sy: Math.round(sm.d * 100) / 100,
        estado: m.dataset.estado,
      };
    });
    frames.push(f);
    if (f.estado === "reposo" && frames.length > 12) break;
  }
  const cys = [...new Set(frames.map((f) => f.cy))];
  const scales = frames.map((f) => f.sy);
  const minScale = Math.min(...scales);
  const maxScale = Math.max(...scales);
  const spanY = Math.max(...frames.map((f) => f.cy)) - Math.min(...frames.map((f) => f.cy));
  const arcOk = cys.length >= 4 && spanY >= 24;
  const squashOk = minScale <= 0.94 && maxScale >= 1.08;
  const noTeleport = frames.length >= 10 && cys.length >= 3;
  if (!arcOk || !squashOk || !noTeleport) {
    fail(
      `${label}: arco=${arcOk} (Δy=${spanY}, puntos=${cys.length}) squash=${squashOk} (${minScale}–${maxScale}) teleport=${!noTeleport}`
    );
  }
  ok(
    `${label}: salto con arco (Δy=${spanY}px), squash ${minScale}–${maxScale}, ${frames.length} muestras`
  );
  await waitReposoEnSeccion(page, "enlaces");
  const landed = await assertReposoRenderizado(page, "enlaces");
  if (!landed.ok) fail(`${label} aterrizaje enlaces: ${JSON.stringify(landed)}`);
}

async function scrollManualYComprobar(page, width) {
  await page.mouse.wheel(0, 120);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(STEP_MS + 400);
  const activaTrasAbajo = await page.evaluate(() => document.body.dataset.seccionActiva);
  try {
    await waitReposoEnSeccion(page, activaTrasAbajo, 12000);
  } catch {
    await page.waitForTimeout(800);
  }
  const activaAbajo = await page.evaluate(() => document.body.dataset.seccionActiva);
  const mAbajo = await assertReposoRenderizado(page, activaAbajo);
  if (!mAbajo.ok) {
    fail(`${width}px scroll abajo (${activaAbajo}): ${JSON.stringify(mAbajo)}`);
  }
  ok(`${width}px tras scroll al pie (${activaAbajo})`);

  await page.mouse.wheel(0, -120);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(STEP_MS + 400);
  const activaTrasArriba = await page.evaluate(() => document.body.dataset.seccionActiva);
  try {
    await waitReposoEnSeccion(page, activaTrasArriba, 12000);
  } catch {
    await page.waitForTimeout(800);
  }
  const activaArriba = await page.evaluate(() => document.body.dataset.seccionActiva);
  const mArriba = await assertReposoRenderizado(page, activaArriba);
  if (!mArriba.ok) {
    fail(`${width}px scroll arriba (${activaArriba}): ${JSON.stringify(mArriba)}`);
  }
  ok(`${width}px tras scroll al inicio (${activaArriba})`);
}

async function grabarV2(browser, baseUrl, width, height, filename) {
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: {
      dir: artifactDir,
      size: { width, height },
    },
  });
  const page = await context.newPage();
  await setupEventLog(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitFonts(page);
  await waitAparicionInicial(page);
  await page.waitForTimeout(STEP_MS);

  for (const { href } of NAV_FLOW) {
    await page.click(`nav a[href="${href}"]`);
    await waitReposoEnSeccion(page, href.slice(1));
    await page.waitForTimeout(STEP_MS);
  }

  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(STEP_MS);
  await page.mouse.wheel(0, -4000);
  await page.waitForTimeout(STEP_MS);

  const dest = path.join(artifactDir, filename);
  await page.close();
  await context.close();
  const vids = fs.readdirSync(artifactDir).filter((f) => f.endsWith(".webm"));
  const latest = vids
    .map((f) => ({ f, t: fs.statSync(path.join(artifactDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f;
  if (latest) {
    fs.copyFileSync(path.join(artifactDir, latest), dest);
    try {
      fs.unlinkSync(path.join(artifactDir, latest));
    } catch {
      /* noop */
    }
  }
  const tmp = `${dest}.30fps.webm`;
  execSync(
    `ffmpeg -y -i "${dest}" -vf "fps=30" -c:v libvpx -crf 32 -b:v 0 "${tmp}" && mv "${tmp}" "${dest}"`,
    { stdio: "pipe" }
  );
  const mb = fs.statSync(dest).size / (1024 * 1024);
  console.log(`Vídeo ${dest} (${mb.toFixed(2)} MB)`);
  if (mb > 15) fail(`${filename} supera 15 MB`);
  return dest;
}

function extraerFrames(videoPath, prefix, count = 5) {
  const dir = path.join(artifactDir, `${prefix}-frames`);
  fs.mkdirSync(dir, { recursive: true });
  execSync(
    `ffmpeg -y -i "${videoPath}" -vf "select='gte(n\\,0)'" -vsync vfr -frames:v ${count} "${dir}/frame-%02d.png"`,
    { stdio: "pipe" }
  );
  const frames = fs.readdirSync(dir).map((f) => path.join(dir, f));
  console.log(`Frames ${prefix}: ${frames.join(", ")}`);
  return frames;
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();

  try {
    console.log("\n=== Comprobaciones de caja renderizada ===\n");

    for (const width of [390, 1440]) {
      const height = width === 390 ? 844 : 900;
      const page = await browser.newPage({
        viewport: { width, height },
      });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await waitAparicionInicial(page);
      const ini = await assertReposoRenderizado(page, "sobre-mi");
      if (!ini.ok) fail(`${width}px carga: ${JSON.stringify(ini)}`);
      ok(`${width}px aparición inicial junto a Sobre mí`);

      await correrFlujoNav(page, width);
      await assertSaltoAnimado(page, `${width}px`);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await waitAparicionInicial(page);
      await correrFlujoNav(page, width);
      await scrollManualYComprobar(page, width);
      await page.close();
    }

    console.log("\n=== Vídeos motion-v2 ===\n");
    const v390 = await grabarV2(browser, baseUrl, 390, 844, "motion-v2-390.webm");
    const v1440 = await grabarV2(
      browser,
      baseUrl,
      1440,
      900,
      "motion-v2-1440.webm"
    );
    extraerFrames(v390, "motion-v2-390", 6);
    extraerFrames(v1440, "motion-v2-1440", 6);

    console.log("\n=== motion-render.spec.mjs OK ===\n");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});