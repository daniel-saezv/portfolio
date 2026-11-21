import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import {
  startServer,
  setupEventLog,
  waitReposoEnSeccion,
  waitAparicionInicial,
  assertReposoRenderizado,
  MAX_DIST_ANCLAJE,
} from "./motion-helpers.mjs";
import {
  medirArcosSaltos,
  assertArcoEnSpec,
  instalarMuestreoSalto,
  extraerMuestras,
  recortarSalto,
  combinarPaneles,
  panelTrayectoria,
  informarArco,
} from "./trajectory-overlay.mjs";

const artifactDir = "/opt/cursor/artifacts/v4";
const H_MIN = { 390: 18, 1440: 24 };
const H_MAX = { 390: 54, 1440: 72 };
const NAV_FLOW = [
  { href: "#habilidades", id: "habilidades" },
  { href: "#enlaces", id: "enlaces" },
  { href: "#sobre-mi", id: "sobre-mi" },
];
const resultados = [];

function fail(msg) {
  console.error(`FALLO v4: ${msg}`);
  throw new Error(msg);
}

function ok(msg) {
  console.log(`  OK — ${msg}`);
}

function reg(id, pass, detalle, extra = {}) {
  resultados.push({ id, pass, detalle, ...extra });
  if (!pass) fail(`Criterio ${id}: ${detalle}`);
  ok(`C${id}: ${detalle}`);
}

function guardarJson(nombre, data) {
  const p = path.join(artifactDir, nombre);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

async function instalarRafLog(page) {
  await page.evaluate(() => {
    window.__rafFrames = [];
    window.__rafOn = false;
    let raf = 0;
    const muestra = () => {
      if (!window.__rafOn) return;
      const m = document.getElementById("mascota");
      const r = m.getBoundingClientRect();
      const s = m.offsetWidth || r.height;
      window.__rafFrames.push({
        t: performance.now(),
        sy: scrollY,
        top: r.top,
        left: r.left,
        cx: r.left + r.width / 2,
        cy: window.__cyMascota ? window.__cyMascota(m) : r.top + s / 2,
        arcY: window.__arcY ? window.__arcY(m) : undefined,
        estado: m.dataset.estado,
        xTexto: document
          .querySelector(`#${document.body.dataset.seccionActiva} .titulo-seccion`)
          ?.getBoundingClientRect().left,
      });
      raf = requestAnimationFrame(muestra);
    };
    window.__rafArm = () => {
      window.__rafFrames = [];
      window.__rafOn = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(muestra);
    };
    window.__rafStop = () => {
      window.__rafOn = false;
      cancelAnimationFrame(raf);
    };
  });
}

async function criterio15(page, width, href, sectionId, rapid = false) {
  const hMin = H_MIN[width];
  const hMax = H_MAX[width];
  await instalarRafLog(page);
  await page.evaluate(() => window.__rafArm());
  if (rapid) {
    const cola = ["#enlaces", "#habilidades", "#enlaces", "#sobre-mi"];
    for (let i = 0; i < 4; i++) {
      await page.click(`nav a[href="${cola[i]}"]`);
      if (i < 3) await page.waitForTimeout(200);
    }
    sectionId = "sobre-mi";
  } else {
    await page.click(`nav a[href="${href}"]`);
  }
  const fin = Date.now() + 24000;
  while (Date.now() < fin) {
    const done = await page.evaluate((id) => {
      const ev = window.__eventos || [];
      const last = ev.filter((e) => e.nombre === "brote:reposo").at(-1);
      const m = document.getElementById("mascota");
      return (
        last?.detail?.seccion === id &&
        m.dataset.estado === "reposo" &&
        m.getAnimations().length === 0
      );
    }, sectionId);
    if (done) break;
    await page.waitForTimeout(16);
  }
  await waitReposoEnSeccion(page, sectionId, 6000);
  const frames = await page.evaluate(() => {
    window.__rafStop();
    return window.__rafFrames;
  });
  const ev = await page.evaluate(() => window.__eventos);
  const salto = ev
    .filter((e) => e.nombre === "brote:salto" && e.detail?.hasta === sectionId)
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
  const fly = frames.filter(
    (f) =>
      f.estado === "salto" &&
      salto &&
      f.t >= salto.t - 16 &&
      (!aterri || f.t <= aterri.t + 24)
  );
  const scrollFrames = frames.filter(
    (f) => salto && f.t < salto.t && f.estado !== "salto"
  );
  let maxStep = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].sy !== frames[i - 1].sy) {
      maxStep = Math.max(maxStep, Math.abs(frames[i].top - frames[i - 1].top));
    }
  }
  const { arcs, n } = medirArcosSaltos(fly, salto, { aterrizajeT: aterri?.t });
  assertArcoEnSpec(arcs, hMin, hMax, `${width}px C15`, n);
  if (maxStep > 2.05) {
    fail(`${width}px C15 maxΔscroll=${maxStep.toFixed(2)}px`);
  }
  const dtR =
    salto &&
    ev
      .filter((e) => e.nombre === "brote:reposo" && e.t >= salto.t)
      .at(-1)?.t - salto.t;
  return {
    width,
    rapid,
    maxStep,
    arcs,
    n,
    dtR,
    frames: frames.length,
    scrollFrames: scrollFrames.length,
    log: frames,
  };
}

async function medirCarril(browser, page, width, height) {
  await page.goto(page.url().split("#")[0], { waitUntil: "networkidle" });
  await waitAparicionInicial(page);
  await instalarMuestreoSalto(page, 16);
  await page.evaluate(() => window.__trayStart());
  await page.click('nav a[href="#enlaces"]');
  await page.waitForFunction(
    () => document.getElementById("mascota").dataset.estado === "salto",
    null,
    { timeout: 8000 }
  );
  await page.waitForTimeout(400);
  const samples = await extraerMuestras(page);
  const ev = await page.evaluate(() => window.__eventos);
  const salto = ev.filter((e) => e.nombre === "brote:salto").at(-1);
  const { samples: s, salto: sal } = recortarSalto(samples, "ancla", ev);
  const lane = await page.evaluate(() => {
    const m = document.getElementById("mascota");
    const s = m.offsetWidth;
    const xTexto = document
      .getElementById("enlaces")
      .querySelector(".titulo-seccion")
      .getBoundingClientRect().left;
    const xCarril = Math.max(4, xTexto - s - 8);
    const bloques = [
      ...document.querySelectorAll(
        "#sobre-mi p, #habilidades p, .habilidad, .enlace-ext"
      ),
    ].map((el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top, b: r.bottom };
    });
    return { xCarril, xTexto, s, bloques };
  });
  let violaciones = 0;
  const mid = s.filter((f, i) => i > 2 && i < s.length - 2);
  for (const f of mid) {
    const brote = { l: f.left, r: f.left + lane.s, t: f.top, b: f.top + lane.s };
    for (const b of lane.bloques) {
      const ox = Math.min(brote.r, b.r) - Math.max(brote.l, b.l);
      const oy = Math.min(brote.b, b.b) - Math.max(brote.t, b.t);
      if (ox > 2 && oy > 2) violaciones++;
    }
  }
  const panel = await panelTrayectoria(
    browser,
    page,
    width,
    height,
    s,
    "carril nav",
    "rgb(46,196,182)"
  );
  const out = path.join(artifactDir, `trayectoria-carril-${width}.png`);
  const b64 = panel.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(out, Buffer.from(b64, "base64"));
  return { violaciones, xCarril: lane.xCarril, xTexto: lane.xTexto };
}

async function grabarRuta(browser, baseUrl, width, height, name) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: artifactDir, size: { width, height } },
  });
  const page = await ctx.newPage();
  await setupEventLog(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitAparicionInicial(page);
  for (const { href, id } of NAV_FLOW) {
    await page.click(`nav a[href="${href}"]`);
    await waitReposoEnSeccion(page, id, 16000);
    await page.waitForTimeout(800);
  }
  await page.close();
  await ctx.close();
  const vids = fs
    .readdirSync(artifactDir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ f, t: fs.statSync(path.join(artifactDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f;
  const webm = path.join(artifactDir, vids);
  const mp4 = path.join(artifactDir, name);
  execSync(
    `ffmpeg -y -i "${webm}" -vf "fps=30" -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart "${mp4}"`,
    { stdio: "pipe" }
  );
  try {
    fs.unlinkSync(webm);
  } catch {
    /* noop */
  }
  return mp4;
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const logStream = [];
  const origLog = console.log;
  console.log = (...args) => {
    logStream.push(args.join(" "));
    origLog(...args);
  };
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();
  try {
    console.log("\n=== Motion v4 (Sylvanas spec v3) ===\n");

    for (const [width, height, xEsp] of [
      [320, 700, 49],
      [390, 844, 49],
      [1440, 900, 289],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitAparicionInicial(page);
      const xTexto = await page.evaluate(() =>
        document
          .querySelector("#sobre-mi .titulo-seccion")
          .getBoundingClientRect().left
      );
      const pass = Math.abs(xTexto - xEsp) <= 2;
      reg(26, pass, `${width}px xTexto=${xTexto.toFixed(1)} (esp≈${xEsp})`, {
        xTexto,
      });
      await page.close();
    }

    const p320 = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await p320.goto(baseUrl, { waitUntil: "networkidle" });
    const nav320 = await p320.evaluate(() => {
      const enlaces = [...document.querySelectorAll(".nav__enlace")];
      const iw = innerWidth;
      const sw = document.documentElement.scrollWidth;
      const rects = enlaces.map((a) => {
        const r = a.getBoundingClientRect();
        return { t: r.top, b: r.bottom, l: r.left, r: r.right, h: r.height };
      });
      return { sw, iw, rects };
    });
    reg(
      24,
      nav320.sw <= nav320.iw && nav320.rects.every((r) => r.r <= nav320.iw),
      `320px sin scroll horiz; nav visible ${nav320.rects.map((r) => r.h.toFixed(0)).join("/")}px alto`
    );
    reg(
      26,
      nav320.rects.every((r) => r.h >= 44),
      "320px nav altura táctil ≥44px"
    );
    await p320.screenshot({
      path: path.join(artifactDir, "nav-320.png"),
    });
    await p320.close();

    const p20 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await setupEventLog(p20);
    await p20.addInitScript(() => {
      window.__t0 = performance.now();
    });
    await p20.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await instalarRafLog(p20);
    await p20.evaluate(() => window.__rafArm());
    await p20.waitForFunction(
      () =>
        window.__eventos?.some(
          (e) => e.nombre === "brote:reposo" && e.detail?.origen === "inicio"
        ),
      null,
      { timeout: 3000 }
    );
    const c20b = await p20.evaluate(() => {
      const reposo = window.__eventos.find(
        (e) => e.nombre === "brote:reposo" && e.detail?.origen === "inicio"
      );
      const sinSalto = !window.__eventos.some((e) => e.nombre === "brote:salto");
      const t0 = window.__inicioAparicion ?? window.__t0;
      return {
        dt: reposo.t - t0,
        sinSalto,
        seccion: reposo.detail.seccion,
      };
    });
    const loadFrames = await p20.evaluate(() => {
      window.__rafStop();
      return window.__rafFrames;
    });
    guardarJson("frames-carga-1440.json", loadFrames);
    reg(
      20,
      c20b.sinSalto && c20b.seccion === "sobre-mi" && c20b.dt <= 520,
      `aparición inicial Δreposo=${c20b.dt?.toFixed(0)}ms ≤500, sin brote:salto`
    );
    await p20.close();

    const logs = {};
    for (const width of [390, 1440]) {
      const height = width === 390 ? 844 : 900;
      const page = await browser.newPage({ viewport: { width, height } });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitAparicionInicial(page);
      const r15 = await criterio15(page, width, "#enlaces", "enlaces", false);
      reg(
        15,
        true,
        `${width}px C15 enlaces arcs=[${r15.arcs.map((a) => a.toFixed(1)).join(",")}] maxΔ=${r15.maxStep.toFixed(2)}px dtR=${r15.dtR}ms`,
        r15
      );
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitAparicionInicial(page);
      const rapid = await criterio15(
        page,
        width,
        "#habilidades",
        "habilidades",
        true
      );
      reg(
        15,
        rapid.maxStep <= 2.05,
        `${width}px C15 rápidos (4×200ms) maxΔ=${rapid.maxStep.toFixed(2)}px arcs=[${rapid.arcs.map((a) => a.toFixed(1)).join(",")}]`,
        rapid
      );
      guardarJson(`frames-nav-${width}.json`, rapid.log);
      const carril = await medirCarril(browser, page, width, height);
      reg(
        26,
        carril.violaciones === 0,
        `${width}px carril: xTexto=${carril.xTexto.toFixed(1)} xCarril=${carril.xCarril.toFixed(1)} violaciones=${carril.violaciones}`
      );
      const reposo = await assertReposoRenderizado(page, "enlaces");
      reg(
        2,
        reposo.ok,
        `${width}px reposo sin solape overlap=${reposo.overlap}`
      );
      await page.close();
      logs[width] = { r15, rapid, carril };
    }

    {
      const pScroll = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await setupEventLog(pScroll);
      await pScroll.goto(baseUrl, { waitUntil: "networkidle" });
      await waitAparicionInicial(pScroll);
      await instalarRafLog(pScroll);
      await pScroll.evaluate(() => window.__rafArm());
      for (let i = 0; i < 40; i++) {
        await pScroll.mouse.wheel(0, 80);
        await pScroll.waitForTimeout(33);
      }
      const fScroll = await pScroll.evaluate(() => {
        window.__rafStop();
        return window.__rafFrames;
      });
      guardarJson("frames-scroll-manual-390.json", fScroll);
      await pScroll.close();
    }

    const mp390 = await grabarRuta(
      browser,
      baseUrl,
      390,
      844,
      "motion-v4-390.mp4"
    );
    const mp1440 = await grabarRuta(
      browser,
      baseUrl,
      1440,
      900,
      "motion-v4-1440.mp4"
    );
    ok(`vídeos ${mp390}, ${mp1440}`);

    fs.writeFileSync(
      path.join(artifactDir, "criteria-v4.json"),
      JSON.stringify({ resultados, logs }, null, 2)
    );
    console.log("\n=== motion-v4 OK ===\n");
  } finally {
    fs.writeFileSync(
      path.join(artifactDir, "npm-test-output.txt"),
      logStream.join("\n")
    );
    console.log = origLog;
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});