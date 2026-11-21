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
import {
  alturaArcoRenderizada,
  arcosPorSegmento,
  arcosPorTiempo,
  compensarScroll,
  nSaltosDesdeSalto,
  instalarMuestreoSalto,
  extraerMuestras,
  recortarSalto,
  panelTrayectoria,
  combinarPaneles,
  informarArco,
  guardarGraficoArco,
} from "./trajectory-overlay.mjs";

const artifactDir = "/opt/cursor/artifacts";
const STEP_MS = 2000;
const NAV_FLOW = [
  { href: "#habilidades", id: "habilidades" },
  { href: "#enlaces", id: "enlaces" },
  { href: "#sobre-mi", id: "sobre-mi" },
];

const H_MIN = { 390: 18, 1440: 24 };
const H_MAX = { 390: 54, 1440: 72 };

function fail(msg) {
  console.error(`FALLO render: ${msg}`);
  throw new Error(msg);
}

function ok(msg) {
  console.log(`  OK — ${msg}`);
}

async function instalarMuestreoC15Raf(page) {
  await page.evaluate(() => {
    let on = false;
    let prev = null;
    let rafId = 0;
    const sample = () => {
      if (!on) return;
      const m = document.getElementById("mascota");
      const r = m.getBoundingClientRect();
      const nh = document.querySelector(".nav").offsetHeight;
      const vis = Math.max(
        0,
        Math.min(r.bottom, innerHeight) - Math.max(r.top, nh)
      );
      const sy = scrollY;
      let drift = null;
      if (prev && sy !== prev.sy) {
        drift = Math.abs(r.top - prev.top);
      }
      window.__c15f.push({
        t: performance.now(),
        top: r.top,
        sy,
        drift,
        w: r.width,
        h: r.height,
        cx: (r.left + r.right) / 2,
        cy: (r.top + r.bottom) / 2,
        frac: r.height > 0 ? vis / r.height : 0,
        estado: m.dataset.estado,
      });
      prev = { top: r.top, sy };
    };
    const loop = () => {
      if (!on) return;
      sample();
      rafId = requestAnimationFrame(loop);
    };
    window.__c15f = [];
    window.__c15Sample = () => {
      if (on) sample();
    };
    window.__c15Arm = () => {
      window.__c15f = [];
      on = true;
      prev = null;
      window.__c15ClickT = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    };
    window.__c15Stop = () => {
      on = false;
      cancelAnimationFrame(rafId);
    };
  });
}

async function criterio15Nav(page, width, href, sectionId) {
  const hMin = H_MIN[width] || 24;
  const hMax = H_MAX[width] || 72;
  await instalarMuestreoC15Raf(page);
  await page.evaluate(() => window.__c15Arm());
  await page.click(`nav a[href="${href}"]`);
  const fin = Date.now() + 22000;
  while (Date.now() < fin) {
    await page.evaluate(() => window.__c15Sample?.());
    const done = await page.evaluate((id) => {
      const ev = window.__eventos || [];
      const reposos = ev.filter((e) => e.nombre === "brote:reposo");
      const last = reposos.at(-1);
      if (!last || last.detail.seccion !== id) return false;
      const m = document.getElementById("mascota");
      if (m.dataset.estado !== "reposo") return false;
      if (m.getAnimations().length > 0) return false;
      if (document.body.dataset.seccionActiva !== id) return false;
      return true;
    }, sectionId);
    if (done) break;
    await page.waitForTimeout(16);
  }
  await waitReposoEnSeccion(page, sectionId, 4000);
  await page.evaluate(() => window.__c15Stop());
  const { frames, ev, clickT } = await page.evaluate(() => ({
    frames: window.__c15f || [],
    ev: window.__eventos || [],
    clickT: window.__c15ClickT ?? 0,
  }));
  const salto = ev
    .filter(
      (e) =>
        e.nombre === "brote:salto" &&
        e.detail?.hasta === sectionId
    )
    .at(-1);
  const aterri = ev
    .filter(
      (e) =>
        e.nombre === "brote:aterrizaje" &&
        salto &&
        e.t >= salto.t &&
        e.detail?.seccion === sectionId
    )
    .at(-1);
  const reposo = ev
    .filter(
      (e) =>
        e.nombre === "brote:reposo" &&
        salto &&
        e.t >= salto.t &&
        e.detail?.seccion === sectionId
    )
    .at(-1);
  const dtA = salto && aterri ? aterri.t - salto.t : null;
  const dtR = salto && reposo ? reposo.t - salto.t : null;
  const minFrac = Math.min(...frames.map((f) => f.frac), 1);
  const scrollFrames = frames.filter(
    (f) => salto && f.t < salto.t && f.drift !== null
  );
  const maxDrift = scrollFrames.length
    ? Math.max(...scrollFrames.map((f) => f.drift))
    : 0;
  const flightFrames = frames.filter(
    (f) =>
      f.estado === "salto" &&
      f.t >= Math.min(clickT, salto?.t ?? clickT) - 50
  );
  if (!salto) {
    fail(`${width}px C15 ${sectionId}: sin evento brote:salto`);
  }
  const comp = compensarScroll(flightFrames);
  const nSaltos = nSaltosDesdeSalto(salto);
  const segmentArcs =
    nSaltos > 1
      ? arcosPorTiempo(comp, nSaltos)
      : arcosPorSegmento(comp);
  const arcSpan = segmentArcs.length
    ? Math.max(...segmentArcs)
    : alturaArcoRenderizada(flightFrames, nSaltos);
  if (frames.length < 8) {
    fail(`${width}px C15 ${sectionId}: pocas muestras rAF (${frames.length})`);
  }
  if (scrollFrames.length < 3) {
    fail(
      `${width}px C15 ${sectionId}: scroll sin fotogramas con scrollY cambiando (n=${scrollFrames.length})`
    );
  }
  if (minFrac < 0.5) {
    fail(
      `${width}px C15 ${sectionId}: visibilidad mínima ${(minFrac * 100).toFixed(0)}% < 50%`
    );
  }
  if (maxDrift > 2.05) {
    fail(
      `${width}px C15 ${sectionId}: deriva en scroll ${maxDrift.toFixed(2)}px > 2px (${scrollFrames.length} frames)`
    );
  }
  if (dtA == null || dtA < 320) {
    fail(`${width}px C15 ${sectionId}: Δaterrizaje=${dtA}ms < 320`);
  }
  if (dtR == null || dtR < 560) {
    fail(`${width}px C15 ${sectionId}: Δreposo=${dtR}ms < 560`);
  }
  if (arcSpan < hMin) {
    fail(
      `${width}px C15 ${sectionId}: arco ${arcSpan}px < mínimo ${hMin}px (saltitos=${segmentArcs.join(",")} vuelo=${flightFrames.length})`
    );
  }
  for (const [i, a] of segmentArcs.entries()) {
    if (a < hMin - 1) {
      fail(
        `${width}px C15 ${sectionId}: saltito ${i + 1} arco ${a}px < ${hMin}px`
      );
    }
    const hCap = salto?.detail?.h ?? hMax;
    const tol = nSaltos > 1 ? 30 : 12;
    if (a > hCap + tol) {
      fail(
        `${width}px C15 ${sectionId}: saltito ${i + 1} arco ${a}px > diseño ${hCap}px (+${tol}px)`
      );
    }
  }
  ok(
    `${width}px C15 ${sectionId}: vis≥50%, scroll ${scrollFrames.length} frames maxΔ=${maxDrift.toFixed(2)}px, T${dtA}/${dtR}ms, arco ${arcSpan.toFixed(1)}px (${segmentArcs.length} saltitos)`
  );
  return { arcSpan, maxDrift, scrollFrames: scrollFrames.length };
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
  const hMin = label.startsWith("390") ? H_MIN[390] : H_MIN[1440];
  const hMax = label.startsWith("390") ? H_MAX[390] : H_MAX[1440];
  const saltosPrev = await page.evaluate(
    () => window.__eventos?.filter((e) => e.nombre === "brote:salto").length ?? 0
  );
  await page.click('nav a[href="#enlaces"]');
  await page.waitForFunction(
    () => document.getElementById("mascota").dataset.estado === "salto",
    null,
    { timeout: 12000 }
  );
  const saltoEv = await page.evaluate((n) => {
    const ev = window.__eventos || [];
    return ev.filter((e) => e.nombre === "brote:salto").slice(n).at(-1);
  }, saltosPrev);
  const nSaltos = saltoEv?.detail?.n > 0 ? saltoEv.detail.n : 1;
  const hCap = (saltoEv?.detail?.h ?? hMax) + (nSaltos > 1 ? 30 : 12);
  const frames = [];
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(25);
    const f = await page.evaluate(() => {
      const m = document.getElementById("mascota");
      const r = m.getBoundingClientRect();
      const svg = m.querySelector("svg");
      const sm = new DOMMatrixReadOnly(getComputedStyle(svg).transform);
      return {
        t: performance.now(),
        cy: (r.top + r.bottom) / 2,
        sy: Math.round(sm.d * 100) / 100,
        estado: m.dataset.estado,
      };
    });
    frames.push(f);
    if (f.estado === "reposo" && frames.length > 12) break;
  }
  const arcPx = alturaArcoRenderizada(frames, nSaltos);
  const scales = frames.map((f) => f.sy);
  const minScale = Math.min(...scales);
  const maxScale = Math.max(...scales);
  const squashOk = minScale <= 0.94 && maxScale >= 1.08;
  const noTeleport = frames.length >= 10;
  const arcOk = arcPx >= hMin - 1 && arcPx <= hCap;
  if (!arcOk || !squashOk || !noTeleport) {
    fail(
      `${label}: arco=${arcPx}px (min ${hMin} max ${hMax}) squash=${squashOk} (${minScale}–${maxScale}) muestras=${frames.length}`
    );
  }
  ok(
    `${label}: salto arco ${arcPx}px, squash ${minScale}–${maxScale}, ${frames.length} muestras`
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

async function capturarSaltoNav(page, href, sectionId) {
  await instalarMuestreoSalto(page);
  await page.evaluate(() => window.__trayStart());
  await page.click(`nav a[href="${href}"]`);
  await waitReposoEnSeccion(page, sectionId);
  const raw = await extraerMuestras(page);
  const ev = await page.evaluate(() => window.__eventos);
  return recortarSalto(raw, "ancla", ev);
}

async function capturarSaltoScroll(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await instalarMuestreoSalto(page);
  await page.evaluate(() => window.__trayStart());
  for (let i = 0; i < 55; i++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(33);
  }
  await page.waitForTimeout(400);
  let destinoId = null;
  const settleDeadline = Date.now() + 18000;
  while (Date.now() < settleDeadline) {
    destinoId = await page.evaluate(() => {
      const ev = window.__eventos || [];
      const salto = ev
        .filter((e) => e.nombre === "brote:salto" && e.detail?.origen === "scroll")
        .at(-1);
      return salto?.detail?.hasta ?? null;
    });
    if (destinoId) break;
    await page.waitForTimeout(50);
  }
  if (!destinoId) fail("No hubo salto por scroll manual tras rueda continua");
  await waitReposoEnSeccion(page, destinoId, 16000);
  const raw = await extraerMuestras(page);
  const ev = await page.evaluate(() => window.__eventos);
  return { ...recortarSalto(raw, "scroll", ev), destinoId };
}

async function artefactoTrayectoria(
  browser,
  baseUrl,
  width,
  height,
  archivo
) {
  const page = await browser.newPage({ viewport: { width, height } });
  await setupEventLog(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitFonts(page);
  await waitAparicionInicial(page);

  const nav = await capturarSaltoNav(page, "#enlaces", "enlaces");
  const hMin = H_MIN[width] || 24;
  const hMax = H_MAX[width] || 72;
  const nNav = nSaltosDesdeSalto(nav.salto);
  const arcoNav = informarArco(
    `${width}px clic nav→enlaces`,
    nav.samples,
    hMin,
    hMax,
    nNav
  );
  const tolNav = nNav > 1 ? 30 : 12;
  if (arcoNav < hMin - 1 || arcoNav > (nav.salto?.detail?.h ?? hMax) + tolNav) {
    fail(`${width}px arco nav ${arcoNav}px fuera de [${hMin}, ${(nav.salto?.detail?.h ?? hMax) + tolNav}]`);
  }
  const panelNav = await panelTrayectoria(
    browser,
    page,
    width,
    height,
    nav.samples,
    "clic nav",
    "rgb(46,196,182)"
  );

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitFonts(page);
  await waitAparicionInicial(page);
  const scroll = await capturarSaltoScroll(page);
  const nScroll = nSaltosDesdeSalto(scroll.salto);
  const arcoScroll = informarArco(
    `${width}px scroll→${scroll.destinoId}`,
    scroll.samples,
    hMin,
    hMax,
    nScroll
  );
  const tolScroll = nScroll > 1 ? 30 : 12;
  if (
    arcoScroll < hMin - 1 ||
    arcoScroll > (scroll.salto?.detail?.h ?? hMax) + tolScroll
  ) {
    fail(
      `${width}px arco scroll manual ${arcoScroll}px fuera de rango (mín ${hMin})`
    );
  }
  const panelScroll = await panelTrayectoria(
    browser,
    page,
    width,
    height,
    scroll.samples,
    "scroll manual",
    "rgb(242,193,78)"
  );

  const out = path.join(artifactDir, archivo);
  await combinarPaneles(browser, width, height, panelNav, panelScroll, out);
  console.log(`  Trayectoria ${out}`);
  const chartName =
    width === 390 ? "arco-390.png" : "arco-1440.png";
  const chartPath = path.join(artifactDir, chartName);
  await guardarGraficoArco(
    browser,
    width,
    nav.samples,
    scroll.samples,
    arcoNav,
    arcoScroll,
    chartPath
  );
  console.log(`  Gráfico ${chartPath}`);
  await page.close();
  return { arcoNav, arcoScroll };
}

async function grabarV3(browser, baseUrl, width, height, filename) {
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
  const tmpWebm = path.join(artifactDir, `_tmp-${width}.webm`);
  if (!latest) fail(`Sin vídeo Playwright para ${filename}`);
  fs.renameSync(path.join(artifactDir, latest), tmpWebm);
  execSync(
    `ffmpeg -y -i "${tmpWebm}" -vf "fps=30" -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart "${dest}"`,
    { stdio: "pipe" }
  );
  try {
    fs.unlinkSync(tmpWebm);
  } catch {
    /* noop */
  }
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

      console.log(`\n--- Criterio 15 (${width}px) ---\n`);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await waitAparicionInicial(page);
      for (const { href, id } of NAV_FLOW) {
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        await waitFonts(page);
        await waitAparicionInicial(page);
        if (id === "sobre-mi") {
          await page.click('nav a[href="#enlaces"]');
          await waitReposoEnSeccion(page, "enlaces");
        }
        await criterio15Nav(page, width, href, id);
      }

      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await waitAparicionInicial(page);
      await correrFlujoNav(page, width);
      await assertSaltoAnimado(page, `${width}px`);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await waitAparicionInicial(page);
      await correrFlujoNav(page, width);
      await scrollManualYComprobar(page, width);
      await page.close();
    }

    console.log("\n=== Trayectorias (33 ms) y altura de arco ===\n");
    await artefactoTrayectoria(
      browser,
      baseUrl,
      390,
      844,
      "trayectoria-390.png"
    );
    await artefactoTrayectoria(
      browser,
      baseUrl,
      1440,
      900,
      "trayectoria-1440.png"
    );

    console.log("\n=== Vídeos motion-v3 ===\n");
    const v390 = await grabarV3(browser, baseUrl, 390, 844, "motion-v3-390.mp4");
    const v1440 = await grabarV3(
      browser,
      baseUrl,
      1440,
      900,
      "motion-v3-1440.mp4"
    );
    extraerFrames(v390, "motion-v3-390", 8);
    extraerFrames(v1440, "motion-v3-1440", 8);

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