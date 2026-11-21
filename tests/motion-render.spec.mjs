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
  instalarMuestreoSalto,
  extraerMuestras,
  recortarSalto,
  panelTrayectoria,
  combinarPaneles,
  informarArco,
} from "./trajectory-overlay.mjs";

const artifactDir = "/opt/cursor/artifacts";
const STEP_MS = 2000;
const NAV_FLOW = [
  { href: "#habilidades", id: "habilidades" },
  { href: "#enlaces", id: "enlaces" },
  { href: "#sobre-mi", id: "sobre-mi" },
];

const H_MIN = { 390: 18, 1440: 24 };

function fail(msg) {
  console.error(`FALLO render: ${msg}`);
  throw new Error(msg);
}

function ok(msg) {
  console.log(`  OK — ${msg}`);
}

async function instalarMuestreoC15(page) {
  await page.evaluate(() => {
    window.__c15 = [];
    window.__c15Active = false;
    window.__c15Scroll = true;
    let prevTop = null;
    const sample = () => {
      if (!window.__c15Active) return;
      const m = document.getElementById("mascota");
      const r = m.getBoundingClientRect();
      const nh = document.querySelector(".nav").offsetHeight;
      const vis = Math.max(
        0,
        Math.min(r.bottom, innerHeight) - Math.max(r.top, nh)
      );
      const frac = r.height > 0 ? vis / r.height : 0;
      let drift = null;
      if (window.__c15Scroll && prevTop !== null) {
        drift = Math.abs(r.top - prevTop);
      }
      window.__c15.push({
        t: performance.now(),
        left: r.left,
        top: r.top,
        w: r.width,
        h: r.height,
        cx: (r.left + r.right) / 2,
        cy: (r.top + r.bottom) / 2,
        frac,
        estado: m.dataset.estado,
        drift,
      });
      prevTop = r.top;
    };
    window.__c15Start = () => {
      window.__c15 = [];
      window.__c15Active = true;
      window.__c15Scroll = true;
      prevTop = null;
      if (window.__c15SaltoEnd) {
        document.removeEventListener("brote:salto", window.__c15SaltoEnd);
      }
      window.__c15SaltoEnd = () => {
        window.__c15Scroll = false;
      };
      document.addEventListener("brote:salto", window.__c15SaltoEnd, {
        once: true,
      });
      clearInterval(window.__c15Iv);
      window.__c15Iv = setInterval(sample, 16);
    };
    window.__c15Stop = () => {
      window.__c15Active = false;
      clearInterval(window.__c15Iv);
    };
  });
}

async function criterio15Nav(page, width, href, sectionId) {
  const saltoN = await page.evaluate(
    () =>
      window.__eventos?.filter((e) => e.nombre === "brote:salto").length ?? 0
  );
  const frames = [];
  let scrollPhase = true;
  const poll = async () => {
    return page.evaluate(() => {
      const m = document.getElementById("mascota");
      const r = m.getBoundingClientRect();
      const nh = document.querySelector(".nav").offsetHeight;
      const vis = Math.max(
        0,
        Math.min(r.bottom, innerHeight) - Math.max(r.top, nh)
      );
      return {
        t: performance.now(),
        left: r.left,
        top: r.top,
        sy: scrollY,
        w: r.width,
        h: r.height,
        cx: (r.left + r.right) / 2,
        cy: (r.top + r.bottom) / 2,
        frac: r.height > 0 ? vis / r.height : 0,
        estado: m.dataset.estado,
      };
    });
  };
  await page.click(`nav a[href="${href}"]`);
  const deadline = Date.now() + 18000;
  let prevTop = null;
  let prevSy = null;
  while (Date.now() < deadline) {
    const f = await poll();
    const drift =
      scrollPhase &&
      prevTop !== null &&
      prevSy !== null &&
      f.sy !== prevSy
        ? Math.abs(f.top - prevTop)
        : null;
    frames.push({ ...f, drift });
    prevTop = f.top;
    prevSy = f.sy;
    const saltos = await page.evaluate(
      () =>
        window.__eventos?.filter((e) => e.nombre === "brote:salto").length ?? 0
    );
    if (saltos > saltoN) scrollPhase = false;
    const done = await page.evaluate(
      (id) => {
        const m = document.getElementById("mascota");
        const ev = window.__eventos || [];
        const last = ev.filter((e) => e.nombre === "brote:reposo").at(-1);
        return (
          last?.detail?.seccion === id &&
          m.dataset.estado === "reposo" &&
          m.getAnimations().length === 0
        );
      },
      sectionId
    );
    if (done && frames.length > 12) break;
    await page.waitForTimeout(16);
  }
  await waitReposoEnSeccion(page, sectionId);
  const analisis = await page.evaluate(
    ({ frames, hMin, sectionId }) => {
      const ev = window.__eventos || [];
      const filtered = frames;
      const salto = ev.filter((e) => e.nombre === "brote:salto").at(-1);
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
      const minFrac = Math.min(...filtered.map((f) => f.frac));
      const scrollDrifts = filtered
        .filter((f) => f.drift !== null && f.estado === "reposo")
        .map((f) => f.drift)
        .slice(2);
      const maxDrift = scrollDrifts.length
        ? Math.max(...scrollDrifts)
        : 0;
      const saltoFrames = filtered.filter((f) => f.estado === "salto");
      const puntos = saltoFrames.map((f) => ({
        cx: f.cx ?? (f.left + f.w / 2),
        cy: f.cy,
      }));
      let arcSpan = 0;
      if (puntos.length >= 3) {
        for (let i = 0; i < puntos.length; i++) {
          const t = i / (puntos.length - 1);
          const expCy =
            puntos[0].cy + t * (puntos[puntos.length - 1].cy - puntos[0].cy);
          const expCx =
            puntos[0].cx + t * (puntos[puntos.length - 1].cx - puntos[0].cx);
          arcSpan = Math.max(
            arcSpan,
            Math.hypot(puntos[i].cx - expCx, puntos[i].cy - expCy)
          );
        }
        arcSpan = Math.round(arcSpan * 10) / 10;
      }
      return {
        frames: filtered.length,
        minFrac,
        maxDrift,
        dtA,
        dtR,
        arcSpan,
        hMin,
      };
    },
    { frames, hMin: H_MIN[width] || 24, sectionId }
  );
  if (analisis.frames < 8) {
    fail(`${width}px C15 ${sectionId}: pocas muestras (${analisis.frames})`);
  }
  if (analisis.minFrac < 0.5) {
    fail(
      `${width}px C15 ${sectionId}: visibilidad mínima ${(analisis.minFrac * 100).toFixed(0)}% < 50%`
    );
  }
  if (analisis.maxDrift > 2.05) {
    fail(
      `${width}px C15 ${sectionId}: deriva en scroll ${analisis.maxDrift.toFixed(2)}px > 2px`
    );
  }
  if (analisis.dtA == null || analisis.dtA < 320) {
    fail(`${width}px C15 ${sectionId}: Δaterrizaje=${analisis.dtA}ms < 320`);
  }
  if (analisis.dtR == null || analisis.dtR < 560) {
    fail(`${width}px C15 ${sectionId}: Δreposo=${analisis.dtR}ms < 560`);
  }
  if (analisis.arcSpan < analisis.hMin * 0.75) {
    fail(
      `${width}px C15 ${sectionId}: arco renderizado ${analisis.arcSpan}px < ${(analisis.hMin * 0.75).toFixed(0)}px (75% de ${analisis.hMin}px)`
    );
  }
  ok(
    `${width}px C15 ${sectionId}: vis≥50%, scroll Δ≤${analisis.maxDrift.toFixed(1)}px, T${analisis.dtA}/${analisis.dtR}ms, arco ${analisis.arcSpan.toFixed(0)}px`
  );
  return analisis;
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
  const deadline = Date.now() + 22000;
  let destinoId = null;
  while (Date.now() < deadline) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(250);
    destinoId = await page.evaluate(() => {
      const ev = window.__eventos || [];
      const salto = ev
        .filter((e) => e.nombre === "brote:salto" && e.detail?.origen === "scroll")
        .at(-1);
      return salto?.detail?.hasta ?? null;
    });
    if (destinoId) break;
  }
  if (!destinoId) fail("No hubo salto por scroll manual en el tiempo límite");
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
  const arcoNav = informarArco(
    `${width}px clic nav→enlaces`,
    nav.samples,
    hMin
  );
  if (arcoNav < hMin * 0.75) {
    fail(
      `${width}px arco nav ${arcoNav}px < ${(hMin * 0.75).toFixed(0)}px (75% de ${hMin}px)`
    );
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
  const arcoScroll = informarArco(
    `${width}px scroll→${scroll.destinoId}`,
    scroll.samples,
    hMin
  );
  if (arcoScroll < hMin * 0.75) {
    fail(
      `${width}px arco scroll manual ${arcoScroll}px < ${(hMin * 0.75).toFixed(0)}px (75% de ${hMin}px)`
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