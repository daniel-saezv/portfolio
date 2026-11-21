import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
  medirArcosSaltos,
  assertArcoEnSpec,
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, "artifacts");
const STEP_MS = 2000;
const NAV_FLOW = [
  { href: "#habilidades", id: "habilidades" },
  { href: "#proyectos", id: "proyectos" },
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
        cy: window.__cyMascota(m),
        arcY: window.__arcY(m),
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

let scrollDemoLogeado = false;

async function criterio15Nav(page, width, href, sectionId, opts = {}) {
  const { soloArco = false } = opts;
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
      salto &&
      f.t >= salto.t - 16 &&
      (!aterri || f.t <= aterri.t + 24)
  );
  if (!salto) {
    fail(`${width}px C15 ${sectionId}: sin evento brote:salto`);
  }
  const { arcs: segmentArcs, max: arcSpan, n: nSaltos } = medirArcosSaltos(
    flightFrames,
    salto,
    { aterrizajeT: aterri?.t }
  );
  if (
    !scrollDemoLogeado &&
    sectionId === "habilidades" &&
    width === 390
  ) {
    scrollDemoLogeado = true;
    const demo = scrollFrames.slice(0, 10).map(
      (f, i) =>
        `#${i} scrollY=${f.sy} top=${f.top.toFixed(2)} drift=${f.drift?.toFixed(2) ?? "—"}`
    );
    console.log(
      `  C15 demostración muestreo scroll (390 habilidades, sy cambia; deriva |Δtop| entre frames consecutivos con scrollY distinto):\n    ${demo.join("\n    ")}`
    );
    const syCambia = scrollFrames.some(
      (f, i, arr) => i > 0 && f.sy !== arr[i - 1].sy
    );
    if (!syCambia) {
      fail("390px C15 habilidades: scrollY no cambió en fase scroll (muestreo inválido)");
    }
  }
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
  try {
    assertArcoEnSpec(
      segmentArcs,
      hMin,
      hMax,
      `${width}px C15 ${sectionId}`,
      nSaltos
    );
  } catch (e) {
    fail(e.message);
  }
  if (!soloArco) {
    ok(
      `${width}px C15 ${sectionId}: vis≥50%, scroll ${scrollFrames.length} frames maxΔ=${maxDrift.toFixed(2)}px, T${dtA}/${dtR}ms, arco saltitos=[${segmentArcs.map((a) => a.toFixed(1)).join(", ")}] (n=${nSaltos})`
    );
  }
  return { arcSpan, maxDrift, scrollFrames: scrollFrames.length, segmentArcs };
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
  await instalarMuestreoSalto(page, 16);
  await page.evaluate(() => {
    window.__tray = [];
    window.__trayOn = true;
    let raf = 0;
    const loop = () => {
      if (!window.__trayOn) return;
      const m = document.getElementById("mascota");
      const r = m.getBoundingClientRect();
      const s = m.offsetWidth || r.height;
      const svg = m.querySelector("svg");
      const sm = new DOMMatrixReadOnly(getComputedStyle(svg).transform);
      window.__tray.push({
        t: performance.now(),
        cy: r.top + s / 2,
        sy: scrollY,
        svgSy: Math.round(sm.d * 100) / 100,
        estado: m.dataset.estado,
      });
      raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
  await page.click('nav a[href="#enlaces"]');
  await waitReposoEnSeccion(page, "enlaces", 20000);
  const frames = await page.evaluate(() => {
    window.__trayOn = false;
    return window.__tray || [];
  });
  const saltoEv = await page.evaluate((n) => {
    const ev = window.__eventos || [];
    return ev.filter((e) => e.nombre === "brote:salto").slice(n).at(-1);
  }, saltosPrev);
  const fly = frames.filter((f) => f.estado === "salto");
  const { arcs, max: arcPx } = medirArcosSaltos(fly, saltoEv);
  try {
    assertArcoEnSpec(
      arcs,
      hMin,
      hMax,
      `${label} salto animado`,
      nSaltosDesdeSalto(saltoEv)
    );
  } catch (e) {
    fail(e.message);
  }
  const scales = frames.map((f) => f.svgSy);
  const minScale = Math.min(...scales);
  const maxScale = Math.max(...scales);
  const squashOk = minScale <= 0.94 && maxScale >= 1.08;
  const noTeleport = frames.length >= 10;
  if (!squashOk || !noTeleport) {
    fail(
      `${label}: squash=${squashOk} (${minScale}–${maxScale}) muestras=${frames.length}`
    );
  }
  ok(
    `${label}: salto arco saltitos=[${arcs.map((a) => a.toFixed(1)).join(", ")}] max=${arcPx}px, squash ${minScale}–${maxScale}, ${frames.length} muestras`
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
  const arcoNav = informarArco(
    `${width}px clic nav→enlaces`,
    nav.samples,
    nav.salto,
    hMin,
    hMax
  );
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
  const arcoScroll = informarArco(
    `${width}px scroll→${scroll.destinoId}`,
    scroll.samples,
    scroll.salto,
    hMin,
    hMax
  );
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
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      tmpWebm,
      "-vf",
      "fps=30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "23",
      "-movflags",
      "+faststart",
      dest,
    ],
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
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      videoPath,
      "-vf",
      "select=gte(n\\,0)",
      "-vsync",
      "vfr",
      "-frames:v",
      String(count),
      path.join(dir, "frame-%02d.png"),
    ],
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
    console.log("\n=== Estabilidad arco 390px C15 habilidades (3 corridas) ===\n");
    for (let run = 1; run <= 3; run++) {
      const pSt = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await setupEventLog(pSt);
      await pSt.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(pSt);
      await waitAparicionInicial(pSt);
      const { segmentArcs } = await criterio15Nav(
        pSt,
        390,
        "#habilidades",
        "habilidades",
        { soloArco: true }
      );
      const maxA = Math.max(...segmentArcs);
      console.log(
        `  corrida ${run}/3: saltitos=[${segmentArcs.map((a) => a.toFixed(1)).join(", ")}] max=${maxA.toFixed(1)}px`
      );
      await pSt.close();
    }

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