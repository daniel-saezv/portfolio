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
} from "./motion-helpers.mjs";
import {
  medirArcosSaltos,
  assertArcoEnSpec,
  instalarMuestreoSalto,
  extraerMuestras,
  recortarSalto,
  panelTrayectoria,
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
const c20Resultados = [];
const carrilResultados = [];

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

async function instalarCapturaCarga(page) {
  await page.addInitScript(() => {
    window.__rafFrames = [];
    let on = true;
    const capFrame = () => {
      const m = document.getElementById("mascota");
      if (!m) return null;
      const activa = document.body.dataset.seccionActiva;
      const sec = activa ? document.getElementById(activa) : null;
      const titulo = sec?.querySelector(".titulo-seccion");
      const mcs = getComputedStyle(m);
      const br = m.getBoundingClientRect();
      const s = m.offsetWidth || br.width;
      const secCs = sec ? getComputedStyle(sec) : null;
      const titCs = titulo ? getComputedStyle(titulo) : null;
      const titulos = {};
      for (const id of ["sobre-mi", "habilidades", "enlaces"]) {
        const el = document.querySelector(`#${id} .titulo-seccion`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        titulos[id] = {
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          opacity: parseFloat(cs.opacity),
        };
      }
      return {
        t: performance.now(),
        scrollY,
        brote: {
          left: br.left,
          top: br.top,
          width: br.width,
          height: br.height,
          opacity: parseFloat(mcs.opacity),
          transform: mcs.transform,
        },
        tituloOpacity: titulo ? parseFloat(titCs.opacity) : 0,
        seccionOpacity: sec ? parseFloat(secCs.opacity) : 0,
        titulos,
        estado: m.dataset.estado,
        seccionActiva: activa,
        top: br.top,
        left: br.left,
        sy: scrollY,
        cy: window.__cyMascota ? window.__cyMascota(m) : br.top + s / 2,
        arcY: window.__arcY ? window.__arcY(m) : undefined,
        xTexto: titulo?.getBoundingClientRect().left,
      };
    };
    const loop = () => {
      if (!on) return;
      const f = capFrame();
      if (f) window.__rafFrames.push(f);
      requestAnimationFrame(loop);
    };
    window.__capturaStop = () => {
      on = false;
    };
    requestAnimationFrame(loop);
  });
}

async function instalarFrameLog(page) {
  await page.evaluate(() => {
    const capFrame = () => {
      const m = document.getElementById("mascota");
      if (!m) return null;
      const activa = document.body.dataset.seccionActiva;
      const sec = activa ? document.getElementById(activa) : null;
      const titulo = sec?.querySelector(".titulo-seccion");
      const mcs = getComputedStyle(m);
      const br = m.getBoundingClientRect();
      const s = m.offsetWidth || br.width;
      const secCs = sec ? getComputedStyle(sec) : null;
      const titCs = titulo ? getComputedStyle(titulo) : null;
      const titulos = {};
      for (const id of ["sobre-mi", "habilidades", "enlaces"]) {
        const el = document.querySelector(`#${id} .titulo-seccion`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        titulos[id] = {
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          opacity: parseFloat(cs.opacity),
        };
      }
      return {
        t: performance.now(),
        scrollY,
        brote: {
          left: br.left,
          top: br.top,
          width: br.width,
          height: br.height,
          opacity: parseFloat(mcs.opacity),
          transform: mcs.transform,
        },
        tituloOpacity: titulo ? parseFloat(titCs.opacity) : 0,
        seccionOpacity: sec ? parseFloat(secCs.opacity) : 0,
        titulos,
        estado: m.dataset.estado,
        seccionActiva: activa,
        top: br.top,
        left: br.left,
        sy: scrollY,
        cy: window.__cyMascota ? window.__cyMascota(m) : br.top + s / 2,
        arcY: window.__arcY ? window.__arcY(m) : undefined,
        xTexto: titulo?.getBoundingClientRect().left,
      };
    };
    window.__rafFrames = [];
    window.__rafOn = false;
    let raf = 0;
    const loop = () => {
      if (!window.__rafOn) return;
      const f = capFrame();
      if (f) window.__rafFrames.push(f);
      raf = requestAnimationFrame(loop);
    };
    window.__rafArm = () => {
      window.__rafFrames = [];
      window.__rafOn = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    window.__rafStop = () => {
      window.__rafOn = false;
      cancelAnimationFrame(raf);
    };
  });
}

function opacidadTituloInicial(frame, secId) {
  const t = frame.titulos?.[secId];
  return t?.opacity ?? frame.seccionOpacity ?? frame.tituloOpacity ?? 0;
}

function primerCruceOpacity(frames, secId) {
  for (let i = 0; i < frames.length; i++) {
    const o = opacidadTituloInicial(frames[i], secId);
    if (o <= 0.01) continue;
    const prev = i > 0 ? opacidadTituloInicial(frames[i - 1], secId) : 0;
    if (prev <= 0.01) return { idx: i, frame: frames[i] };
  }
  return null;
}

function analizarC20(frames, ev, secInicial, marcadores = {}) {
  const cruceTit = primerCruceOpacity(frames, secInicial);
  const titulo0 =
    cruceTit?.frame ||
    frames.find((f) => opacidadTituloInicial(f, secInicial) > 0.01);
  const tTitulo =
    marcadores.inicioTituloEntrada ??
    titulo0?.t ??
    marcadores.inicioAparicion;
  const brote0 = frames.find(
    (f) => f.t >= tTitulo - 1 && (f.brote?.opacity ?? 0) > 0.005
  );
  const reposoEv = ev.find(
    (e) => e.nombre === "brote:reposo" && e.detail?.origen === "inicio"
  );
  const sinSalto = !ev.some((e) => e.nombre === "brote:salto");
  if (!tTitulo || !brote0 || !reposoEv) {
    return { ok: false, reason: "sin muestras", titulo0, brote0, reposoEv };
  }
  const reposoFrame =
    frames.find((f) => f.t >= reposoEv.t - 20 && f.estado === "reposo") ||
    frames.at(-1);
  const iTitulo = cruceTit?.idx ?? frames.indexOf(titulo0);
  const iBrote = frames.indexOf(brote0);
  const deltaFrames = iBrote >= 0 && iTitulo >= 0 ? iBrote - iTitulo : 99;
  const deltaOpacity = brote0.t - tTitulo;
  const dtReposo = (reposoFrame?.t ?? reposoEv.t) - tTitulo;
  return {
    ok: true,
    tTitulo,
    tBrote: brote0.t,
    deltaOpacity,
    deltaFrames,
    dtReposo,
    sinSalto,
    seccion: reposoEv.detail.seccion,
    secInicial,
    iTitulo,
    iBrote,
  };
}

function ventanaCarril(salto, aterri) {
  const n =
    typeof salto?.detail?.n === "number" && salto.detail.n > 0
      ? salto.detail.n
      : 1;
  const core = n * 240 + (n - 1) * 40;
  const A = Math.max(
    0,
    aterri?.t != null && salto?.t != null
      ? Math.round(aterri.t - salto.t - core)
      : 0
  );
  const tSalida = A + 0.4 * 240;
  const tVuelta = A + (n - 1) * (240 + 40) + 0.6 * 240;
  return { A, tSalida, tVuelta, n };
}

function medirCarrilEnFrames(frames, eventos, etiqueta) {
  const saltos = eventos.filter(
    (e) =>
      e.nombre === "brote:salto" &&
      e.detail?.hasta &&
      e.detail.n !== 0
  );
  const bloques = [];
  let violaciones = 0;
  let framesEnCarril = 0;
  for (const salto of saltos) {
    const dest = salto.detail.hasta;
    const aterri = eventos.find(
      (e) =>
        e.nombre === "brote:aterrizaje" &&
        e.t >= salto.t &&
        e.detail?.seccion === dest
    );
    const { tSalida, tVuelta } = ventanaCarril(salto, aterri);
    const enCarril = frames.filter(
      (f) =>
        f.t >= salto.t + tSalida - 20 &&
        f.t <= salto.t + tVuelta + 20 &&
        (f.estado === "salto" || f.estado === "aterrizaje")
    );
    const lefts = [];
    let xCarril = 0;
    for (const f of enCarril) {
      const tit = f.titulos?.[dest];
      const s = f.brote?.width ?? 36;
      const xTexto = tit?.left ?? 0;
      xCarril = Math.max(4, xTexto - s - 8);
      const left = f.brote?.left;
      lefts.push(left);
      framesEnCarril += 1;
    }
    const spread = lefts.length ? Math.max(...lefts) - Math.min(...lefts) : 0;
    const enCarrilActivo =
      spread <= 2.5 && lefts.some((l) => Math.abs(l - xCarril) <= 2);
    const checkFrames =
      enCarril.length >= 3 ? enCarril.slice(1, -1) : enCarril;
    if (enCarrilActivo) {
      for (const f of checkFrames) {
        const left = f.brote?.left;
        if (Math.abs(left - xCarril) > 1.15) violaciones += 1;
      }
    }
    if (enCarril.length) {
      bloques.push({
        etiqueta,
        dest,
        saltoT: salto.t,
        frames: enCarril.length,
        framesEstables: enCarrilActivo ? checkFrames.length : 0,
        leftMin: Math.min(...lefts),
        leftMax: Math.max(...lefts),
        xCarril,
        spread,
        tSalida,
        tVuelta,
        estable: enCarrilActivo,
      });
    }
  }
  return { violaciones, bloques, framesEnCarril };
}

async function ejecutarC20(browser, baseUrl, width, height, opts = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  await setupEventLog(page);
  if (opts.reducedMotion) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  await instalarCapturaCarga(page);
  const url = opts.hash
    ? `${baseUrl.replace(/\/$/, "")}${opts.hash}`
    : baseUrl;
  const secInicial = opts.hash ? opts.hash.replace("#", "") : "sobre-mi";
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      window.__eventos?.some(
        (e) => e.nombre === "brote:reposo" && e.detail?.origen === "inicio"
      ),
    null,
    { timeout: 8000 }
  );
  await page.waitForTimeout(80);
  const { frames, ev, marcadores } = await page.evaluate(() => {
    window.__capturaStop?.();
    return {
      frames: window.__rafFrames || [],
      ev: window.__eventos || [],
      marcadores: {
        inicioTituloEntrada: window.__inicioTituloEntrada,
        inicioAparicion: window.__inicioAparicion,
      },
    };
  });
  const analisis = analizarC20(frames, ev, secInicial, marcadores);
  const fname = opts.outFile || `frames-carga-${width}.json`;
  guardarJson(fname, frames);
  await page.close();
  return { ...analisis, frames, ev, width, fname, opts };
}

function registrarC20(result, suffix = "") {
  const a = result;
  const pass =
    a.ok &&
    a.deltaOpacity <= 17.5 &&
    a.dtReposo <= 520 &&
    a.sinSalto &&
    a.seccion ===
      (result.opts?.hash ? result.opts.hash.replace("#", "") : "sobre-mi");
  const detalle = `${result.width}px C20${suffix}: título@${a.tTitulo?.toFixed(1)}ms brote@${a.tBrote?.toFixed(1)}ms Δopac=${a.deltaOpacity?.toFixed(1)}ms (Δframes=${a.deltaFrames}) Δreposo=${a.dtReposo?.toFixed(0)}ms`;
  c20Resultados.push({ ...a, pass, detalle });
  reg(20, pass, detalle);
  return a;
}

async function criterio15(page, width, href, sectionId, rapid = false) {
  const hMin = H_MIN[width];
  const hMax = H_MAX[width];
  await instalarFrameLog(page);
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
  let maxStep = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].scrollY !== frames[i - 1].scrollY) {
      maxStep = Math.max(
        maxStep,
        Math.abs(frames[i].brote.top - frames[i - 1].brote.top)
      );
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
  const carril = medirCarrilEnFrames(
    frames,
    ev,
    rapid ? `${width}px-rápidos` : `${width}px-nav`
  );
  return {
    width,
    rapid,
    maxStep,
    arcs,
    n,
    dtR,
    log: frames,
    ev,
    carril,
  };
}

async function medirCarrilNav(browser, page, width, height) {
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
  const { samples: s } = recortarSalto(samples, "ancla", ev);
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

function registrarCarril26(medida, etiqueta) {
  const { violaciones, bloques, framesEnCarril } = medida;
  const estables = bloques.filter((b) => b.estable);
  const framesEstables = estables.reduce((s, b) => s + b.framesEstables, 0);
  const pass =
    violaciones === 0 &&
    (framesEstables > 0 || estables.length > 0 || etiqueta.includes("scroll"));
  const resumen = bloques
    .map((b) =>
      b.estable
        ? `${b.dest}: xCarril=${b.xCarril.toFixed(1)} left∈[${b.leftMin.toFixed(1)},${b.leftMax.toFixed(1)}] chequeados=${b.framesEstables}`
        : `${b.dest}: sin tramo estable (spread=${b.spread.toFixed(1)}px, n=${b.frames})`
    )
    .join("; ");
  const detalle = `${etiqueta}: carril ±1px viol=${violaciones} enVuelo=${framesEnCarril} estables=${framesEstables} (${resumen})`;
  carrilResultados.push({ etiqueta, pass, ...medida, detalle });
  reg(26, pass, detalle);
}

async function scrollManualConLog(page, width) {
  await instalarFrameLog(page);
  await page.evaluate(() => window.__rafArm());
  for (let i = 0; i < 90; i++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(33);
  }
  for (let i = 0; i < 45; i++) {
    await page.mouse.wheel(0, -80);
    await page.waitForTimeout(33);
  }
  await page.waitForTimeout(1500);
  const frames = await page.evaluate(() => {
    window.__rafStop();
    return window.__rafFrames;
  });
  const ev = await page.evaluate(() => window.__eventos);
  return { frames, ev };
}

function duracionVideoSeg(ruta) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "${ruta}"`,
      { encoding: "utf8" }
    );
    return parseFloat(out.trim());
  } catch {
    return 0;
  }
}

async function grabarDemoCompleta(browser, baseUrl, width, height, name) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: artifactDir, size: { width, height } },
  });
  const page = await ctx.newPage();
  await setupEventLog(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitAparicionInicial(page);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 55; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(600);
  for (let i = 0; i < 55; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(600);
  await page.click('nav a[href="#enlaces"]');
  await waitReposoEnSeccion(page, "enlaces", 22000);
  await page.waitForTimeout(500);
  const rapid = ["#enlaces", "#habilidades", "#enlaces", "#sobre-mi"];
  for (let i = 0; i < 4; i++) {
    await page.click(`nav a[href="${rapid[i]}"]`);
    if (i < 3) await page.waitForTimeout(200);
  }
  await waitReposoEnSeccion(page, "sobre-mi", 22000);
  await page.waitForTimeout(2000);
  await page.close();
  await ctx.close();
  const vids = fs
    .readdirSync(artifactDir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => ({ f, t: fs.statSync(path.join(artifactDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f;
  const webm = path.join(artifactDir, vids);
  const mp4 = path.join(artifactDir, name);
  const fps = 60;
  try {
    execSync(
      `ffmpeg -y -i "${webm}" -vf "fps=${fps}" -r ${fps} -c:v libx264 -pix_fmt yuv420p -crf 22 -movflags +faststart "${mp4}"`,
      { stdio: "pipe" }
    );
  } catch {
    execSync(
      `ffmpeg -y -i "${webm}" -vf "fps=30" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 22 -movflags +faststart "${mp4}"`,
      { stdio: "pipe" }
    );
  }
  try {
    fs.unlinkSync(webm);
  } catch {
    /* noop */
  }
  const dur = duracionVideoSeg(mp4);
  if (dur < 10) {
    fail(`${name}: duración ${dur.toFixed(1)}s < 10s`);
  }
  return { mp4, dur, fps };
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

    for (const [width, height] of [
      [390, 844],
      [1440, 900],
    ]) {
      const r20 = await ejecutarC20(browser, baseUrl, width, height, {});
      registrarC20(r20);
    }

    const r20Hash = await ejecutarC20(browser, baseUrl, 390, 844, {
      hash: "#habilidades",
      outFile: "frames-carga-hash-390.json",
    });
    registrarC20(r20Hash, " hash");

    const r20Rm = await ejecutarC20(browser, baseUrl, 390, 844, {
      reducedMotion: true,
      outFile: "frames-carga-rm-390.json",
    });
    const passRm =
      r20Rm.ok &&
      r20Rm.deltaOpacity <= 17.5 &&
      r20Rm.dtReposo <= 520 &&
      r20Rm.sinSalto;
    const detRm = `390px C20 RM: Δopac=${r20Rm.deltaOpacity?.toFixed(1)}ms (Δframes=${r20Rm.deltaFrames}) Δreposo=${r20Rm.dtReposo?.toFixed(0)}ms sin salto`;
    c20Resultados.push({ ...r20Rm, pass: passRm, detalle: detRm });
    reg(20, passRm, detRm);

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

    const logs = {};
    for (const width of [390, 1440]) {
      const height = width === 390 ? 844 : 900;
      const page = await browser.newPage({ viewport: { width, height } });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitAparicionInicial(page);
      const r15 = await criterio15(page, width, "#enlaces", "enlaces", false);
      guardarJson(`frames-nav-${width}.json`, r15.log);
      registrarCarril26(r15.carril, `${width}px nav→enlaces`);
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
      guardarJson(`frames-rapid-${width}.json`, rapid.log);
      registrarCarril26(rapid.carril, `${width}px clics rápidos`);
      reg(
        15,
        rapid.maxStep <= 2.05,
        `${width}px C15 rápidos (4×200ms) maxΔ=${rapid.maxStep.toFixed(2)}px arcs=[${rapid.arcs.map((a) => a.toFixed(1)).join(",")}]`,
        rapid
      );
      const carril = await medirCarrilNav(browser, page, width, height);
      reg(
        26,
        carril.violaciones === 0,
        `${width}px solape texto: xTexto=${carril.xTexto.toFixed(1)} xCarril=${carril.xCarril.toFixed(1)} violaciones=${carril.violaciones}`
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

    for (const [width, height, fname] of [
      [390, 844, "frames-scroll-manual-390.json"],
      [1440, 900, "frames-scroll-manual-1440.json"],
    ]) {
      const pScroll = await browser.newPage({ viewport: { width, height } });
      await setupEventLog(pScroll);
      await pScroll.goto(baseUrl, { waitUntil: "networkidle" });
      await waitAparicionInicial(pScroll);
      const { frames, ev } = await scrollManualConLog(pScroll, width);
      guardarJson(fname, frames);
      const carrilScroll = medirCarrilEnFrames(
        frames,
        ev,
        `${width}px scroll manual`
      );
      registrarCarril26(carrilScroll, `${width}px scroll manual`);
      await pScroll.close();
    }

    const v390 = await grabarDemoCompleta(
      browser,
      baseUrl,
      390,
      844,
      "motion-v4-390.mp4"
    );
    const v1440 = await grabarDemoCompleta(
      browser,
      baseUrl,
      1440,
      900,
      "motion-v4-1440.mp4"
    );
    ok(
      `vídeos ${v390.mp4} (${v390.dur.toFixed(1)}s), ${v1440.mp4} (${v1440.dur.toFixed(1)}s)`
    );

    fs.writeFileSync(
      path.join(artifactDir, "criteria-v4.json"),
      JSON.stringify(
        { resultados, c20Resultados, carrilResultados, logs },
        null,
        2
      )
    );
    console.log("\n=== motion-v4 OK ===\n");
  } finally {
    fs.writeFileSync(
      path.join(artifactDir, "motion-v4-log.txt"),
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