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

const artifactDir = path.join(root, "artifacts", "v5");
const carrilResultados27 = [];
const H_MIN = { 390: 18, 1440: 24 };
const H_MAX = { 390: 54, 1440: 72 };
const NAV_FLOW = [
  { href: "#habilidades", id: "habilidades" },
  { href: "#proyectos", id: "proyectos" },
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
      const textoBloques = [
        ...document.querySelectorAll(
          "#sobre-mi p, #habilidades p, #proyectos .proyecto__tipo, #proyectos .proyecto__texto, #proyectos .paso__titulo, #proyectos .paso__detalle, .enlace-ext"
        ),
      ].map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom };
      });
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
        textoBloques,
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
    window.__rafArm = () => {
      window.__rafFrames = [];
      window.__rafOn = true;
      const sample = () => {
        if (!window.__rafOn) return;
        const f = capFrame();
        if (f) window.__rafFrames.push(f);
      };
      sample();
      window.__rafIv = setInterval(sample, 1000 / 60);
    };
    window.__rafStop = () => {
      window.__rafOn = false;
      clearInterval(window.__rafIv);
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

function anticipacionMs(salto, eventos, aterri) {
  const n =
    typeof salto?.detail?.n === "number" && salto.detail.n > 0
      ? salto.detail.n
      : 1;
  const core = n * 240 + (n - 1) * 40;
  if (salto.detail?.retarget || salto.detail?.estabaEnCarril) {
    return 0;
  }
  if (aterri?.t != null && salto?.t != null) {
    return Math.max(0, Math.round(aterri.t - salto.t - core));
  }
  const prev = eventos?.findLast?.(
    (e) => e.nombre === "brote:salto" && e.t < salto.t
  ) ?? [...(eventos || [])]
    .filter((e) => e.nombre === "brote:salto" && e.t < salto.t)
    .at(-1);
  if (
    prev &&
    salto.t - prev.t <
      core + (salto.detail.origen === "ancla" ? 200 : 80)
  ) {
    return 0;
  }
  if (salto.detail?.origen === "ancla" || salto.detail?.origen === "foco") {
    return 80;
  }
  return 0;
}

function ventanaCarrilMs(salto, aterri, eventos = []) {
  const n =
    typeof salto?.detail?.n === "number" && salto.detail.n > 0
      ? salto.detail.n
      : 1;
  const A = anticipacionMs(salto, eventos, aterri);
  const tSalidaFin = A + 0.4 * 240;
  const tVueltaInicio =
    A + (n - 1) * (240 + 40) + 0.6 * 240;
  return { A, tSalidaFin, tVueltaInicio, n };
}

function t0Salto(_frames, salto) {
  return salto?.t ?? 0;
}

function xCarrilVista(f, dest) {
  const tit = f.titulos?.[dest];
  const s = f.brote?.width ?? 36;
  const xTexto = tit?.left ?? 0;
  return Math.max(4, xTexto - s - 8);
}

function medirCarrilEnFrames(frames, eventos, etiqueta) {
  const saltos = eventos.filter(
    (e) =>
      e.nombre === "brote:salto" &&
      e.detail?.hasta &&
      e.detail.n !== 0 &&
      e.detail.origen !== "scroll"
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
    const { tSalidaFin, tVueltaInicio, n } = ventanaCarrilMs(
      salto,
      aterri,
      eventos
    );
    const t0 = t0Salto(frames, salto);
    const carrilGraceInMs = 16;
    const enCarril = frames.filter((f) => {
      const tr = f.t - t0;
      return (
        tr >= tSalidaFin + carrilGraceInMs &&
        tr < tVueltaInicio &&
        f.estado === "salto"
      );
    });
    const lefts = [];
    const desv = [];
    const xCarrilRef = enCarril.length
      ? xCarrilVista(enCarril[0], dest)
      : xCarrilVista({ titulos: {}, brote: { width: 36 } }, dest);
    for (const f of enCarril) {
      const xCarril = xCarrilVista(f, dest);
      const left = f.brote?.left;
      lefts.push(left);
      desv.push(Math.abs(left - xCarril));
    }
    const recto = !!salto.detail?.recto;
    const usaCarril = !!salto.detail?.carril && !recto;
    if (!usaCarril) {
      bloques.push({
        etiqueta,
        dest,
        n: salto.detail?.n ?? n,
        recto,
        carrilMs: salto.detail?.carrilMs ?? 0,
        barridoCruza: salto.detail?.barridoCruza ?? false,
        framesEnCarril: 0,
        modo: recto ? "recto" : "sin-carril",
      });
      continue;
    }
    let violBloque = 0;
    for (const d of desv) {
      framesEnCarril += 1;
      if (d > 1 + 1e-6) {
        violaciones += 1;
        violBloque += 1;
      }
    }
    bloques.push({
      etiqueta,
      dest,
      n: salto.detail?.n ?? n,
      ventanaMs: [tSalidaFin, tVueltaInicio],
      framesEnCarril: enCarril.length,
      leftMin: Math.min(...lefts),
      leftMax: Math.max(...lefts),
      xCarril: xCarrilRef,
      carrilMs: salto.detail?.carrilMs ?? Math.round(tVueltaInicio - tSalidaFin),
      modo: "carril",
      violacionesBloque: violBloque,
    });
  }
  return { violaciones, bloques, framesEnCarril };
}

function verificarC27(eventos, etiqueta) {
  const saltos = eventos.filter(
    (e) =>
      e.nombre === "brote:salto" &&
      e.detail?.hasta &&
      typeof e.detail.n === "number" &&
      e.detail.n > 0
  );
  let viol = 0;
  const viajes = saltos.map((s) => {
    const ms = s.detail.carrilMs ?? 0;
    const recto = !!s.detail.recto;
    const ok = recto ? ms === 0 : ms >= 120;
    if (!ok) viol++;
    return {
      desde: s.detail.desde,
      hasta: s.detail.hasta,
      origen: s.detail.origen,
      n: s.detail.n,
      recto,
      carril: !!s.detail.carril,
      carrilMs: ms,
      barridoCruza: !!s.detail.barridoCruza,
      ok,
    };
  });
  const resumen = viajes
    .map(
      (v) =>
        `${v.hasta} n=${v.n}${v.recto ? " recto" : ""} carrilMs=${v.carrilMs}${v.barridoCruza ? " barrido" : ""}`
    )
    .join("; ");
  const detalle = `${etiqueta}: viajes=${viajes.length} viol=${viol} (${resumen})`;
  carrilResultados27.push({ etiqueta, viol, viajes, detalle });
  reg(27, viol === 0, detalle, { viajes });
  return { viol, viajes };
}

function analizarRetargetEnCarril(frames, eventos, nuevoDest, metaCarril) {
  const saltos = eventos.filter(
    (e) => e.nombre === "brote:salto" && e.detail?.n > 0
  );
  const primero = saltos.find((s) => s.detail?.carril && !s.detail?.recto);
  const segundo = saltos
    .filter(
      (s) =>
        s.detail?.retarget &&
        s.detail?.hasta === nuevoDest &&
        primero &&
        s.t > primero.t
    )
    .at(-1);
  if (!primero || !segundo) {
    return {
      ok: false,
      motivo: "faltan saltos con carril y retarget",
      saltos: saltos.length,
    };
  }
  const tClick =
    typeof metaCarril?.clickT === "number"
      ? metaCarril.clickT
      : segundo.t;
  const tJump = segundo.t;
  const { tSalidaFin, tVueltaInicio } = ventanaCarrilMs(
    primero,
    null,
    eventos
  );
  const { tSalidaFin: t2Salida, tVueltaInicio: t2Vuelta } = ventanaCarrilMs(
    segundo,
    null,
    eventos
  );
  let violCarril = 0;
  let framesCarril = 0;
  let maxJump = 0;
  let maxDeltaScroll = 0;
  let maxDesv = 0;
  const muestrasViol = [];
  const medirVentana = (t0, tFin, tVuelta, dest, tMax, graceMs = 0) => {
    for (const f of frames) {
      const tr = f.t - t0;
      if (tr < tFin + graceMs || tr >= tVuelta || f.t > tMax) continue;
      if (f.estado !== "salto") continue;
      const xC = xCarrilVista(f, dest);
      const desv = Math.abs(f.brote.left - xC);
      maxDesv = Math.max(maxDesv, desv);
      framesCarril++;
      if (desv > 1 + 1e-6) {
        violCarril++;
        if (muestrasViol.length < 8) {
          muestrasViol.push({
            tr: Math.round(tr),
            left: f.brote.left,
            xCarril: xC,
            desv: Math.round(desv * 100) / 100,
            dest,
          });
        }
      }
    }
  };
  const tFinPrimero = Math.min(
    typeof tClick === "number" ? tClick : Infinity,
    segundo.t
  ) - 36;
  medirVentana(
    primero.t,
    tSalidaFin,
    tVueltaInicio,
    primero.detail.hasta,
    tFinPrimero,
    16
  );
  medirVentana(
    segundo.t,
    t2Salida,
    t2Vuelta,
    segundo.detail.hasta,
    Infinity,
    64
  );
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    const p = frames[i - 1];
    if (f.scrollY !== p.scrollY) {
      maxDeltaScroll = Math.max(
        maxDeltaScroll,
        Math.abs(f.brote.top - p.brote.top)
      );
    }
  }
  const idxJump = frames.findIndex((f) => f.t >= tJump - 2);
  if (idxJump > 0) {
    const f = frames[idxJump];
    const p = frames[idxJump - 1];
    maxJump = Math.max(
      maxJump,
      Math.abs(f.brote.left - p.brote.left),
      Math.abs(f.brote.top - p.brote.top)
    );
  }
  const aterri = eventos.find(
    (e) =>
      e.nombre === "brote:aterrizaje" &&
      e.t >= segundo.t &&
      e.detail?.seccion === nuevoDest
  );
  const reposo = eventos.find(
    (e) =>
      e.nombre === "brote:reposo" &&
      e.t >= segundo.t &&
      e.detail?.seccion === nuevoDest
  );
  const okC27 =
    (segundo.detail.recto
      ? segundo.detail.carrilMs === 0
      : (segundo.detail.carrilMs ?? 0) >= 120) &&
    !segundo.detail.recto;
  return {
    maxDesv,
    muestrasViol,
    ok:
      violCarril === 0 &&
      maxJump <= 2.05 &&
      maxDeltaScroll <= 2.05 &&
      !!aterri &&
      !!reposo &&
      okC27,
    violCarril,
    framesCarril,
    maxJump,
    maxDeltaScroll,
    primero: primero.detail,
    segundo: segundo.detail,
    carrilMs1: primero.detail.carrilMs,
    carrilMs2: segundo.detail.carrilMs,
    tClick,
    ventana1: [tSalidaFin, tVueltaInicio],
    ventana2: [t2Salida, t2Vuelta],
    aterrizaje: !!aterri,
    reposo: !!reposo,
  };
}

function resolverSaltoEnLog(eventos, ref) {
  if (ref == null) return null;
  if (typeof ref === "number") {
    return (
      eventos.find(
        (e) => e.nombre === "brote:salto" && Math.abs(e.t - ref) <= 4
      ) ?? null
    );
  }
  if (typeof ref === "object" && ref.t != null) {
    return (
      eventos.find(
        (e) =>
          e.nombre === "brote:salto" &&
          e.detail?.hasta === ref.hasta &&
          Math.abs(e.t - ref.t) <= 4
      ) ?? null
    );
  }
  return null;
}

function analizarRetargetSalida(
  frames,
  eventos,
  nuevoDest,
  clickT,
  saltoT,
  metaSalida
) {
  const baseFail = {
    deltaMs:
      typeof metaSalida?.deltaMs === "number"
        ? Math.round(metaSalida.deltaMs)
        : undefined,
    maxJump: undefined,
    carrilMs2: undefined,
    modo2: undefined,
    limiteSalidaMs:
      typeof metaSalida?.tSalidaFinMs === "number"
        ? metaSalida.tSalidaFinMs
        : undefined,
  };
  const primero =
    resolverSaltoEnLog(eventos, metaSalida?.primeroRef ?? saltoT) ||
  eventos
      .filter(
        (e) =>
          e.nombre === "brote:salto" &&
          e.detail?.hasta === "enlaces" &&
          e.detail?.carril &&
          !e.detail?.recto
      )
      .at(-1);
  let segundo =
    resolverSaltoEnLog(eventos, metaSalida?.segundoRef) ||
    eventos.find(
      (e) =>
        e.nombre === "brote:salto" &&
        e.detail?.retarget &&
        e.detail?.hasta === nuevoDest &&
        primero &&
        e.t > primero.t
    );
  if (!primero) {
    return {
      ok: false,
      motivo: "sin brote:salto enlaces (carril n≥2) en el log",
      ...baseFail,
    };
  }
  if (!segundo) {
    const ultimoDest = eventos
      .filter(
        (e) =>
          e.nombre === "brote:salto" &&
          e.detail?.hasta === nuevoDest &&
          primero &&
          e.t > primero.t
      )
      .at(-1);
    return {
      ok: false,
      motivo: ultimoDest
        ? "segundo salto sin flag retarget (clic fuera de ventana o viaje normal)"
        : "no llegó segundo brote:salto tras el clic de retarget",
      ...baseFail,
      ultimoSaltoDest: ultimoDest?.detail ?? null,
    };
  }
  const tSalidaFin =
    primero.detail.tSalidaFinMs ??
    ventanaCarrilMs(primero, null, eventos).tSalidaFin;
  const tClick =
    typeof clickT === "number" ? clickT : segundo.t;
  const deltaMs = Math.round(
    metaSalida?.deltaMs ?? tClick - (primero?.t ?? tClick)
  );
  if (deltaMs >= tSalidaFin - 8) {
    return {
      ok: false,
      motivo: "retarget demasiado tarde para salida",
      deltaMs,
      deltaSaltoMs: Math.round(segundo.t - primero.t),
      tSalidaFin: Math.round(tSalidaFin),
      tClick,
    };
  }
  const idxEv = frames.findIndex((f) => f.t >= segundo.t - 2);
  const idxClick = frames.findIndex((f) => f.t >= tClick - 2);
  const idx = idxEv > 0 ? idxEv : idxClick;
  let maxJump = 0;
  if (idx > 0) {
    maxJump = Math.max(
      Math.abs(frames[idx].brote.left - frames[idx - 1].brote.left),
      Math.abs(frames[idx].brote.top - frames[idx - 1].brote.top)
    );
  }
  const okSalida =
    !segundo.detail.estabaEnCarril && metaSalida?.tr != null
      ? metaSalida.tr < tSalidaFin - 12
      : true;
  const modo2 = segundo.detail.recto ? "recto" : "carril";
  const carrilMs2 =
    typeof segundo.detail.carrilMs === "number" ? segundo.detail.carrilMs : 0;
  const okC27 =
    modo2 === "recto" ? carrilMs2 === 0 : carrilMs2 >= 120;
  return {
    ok: maxJump <= 2.05 && okC27 && okSalida,
    maxJump,
    deltaMs,
    okSalida,
    modo2,
    carrilMs2,
    limiteSalidaMs: Math.round(tSalidaFin),
    primero: primero.detail,
    segundo: segundo.detail,
  };
}

function detalleRetargetSalidaOFalla(rS, width) {
  const r = rS?.resultado ?? {};
  const faltan = [];
  if (typeof r.deltaMs !== "number") faltan.push("Δt");
  if (typeof r.maxJump !== "number") faltan.push("jump");
  if (typeof r.carrilMs2 !== "number") faltan.push("carrilMs2");
  if (faltan.length) {
    fail(
      `Criterio 26: ${width}px retarget salida translateX: métricas ausentes [${faltan.join(", ")}] motivo=${r.motivo ?? "desconocido"}`
    );
  }
  const modo = r.modo2 ?? (r.segundo?.recto ? "recto" : "carril");
  return `${width}px retarget salida translateX: Δt=${r.deltaMs}ms jump=${r.maxJump.toFixed(2)}px modo2=${modo} carrilMs2=${r.carrilMs2} violRel=${rS.violRelanzado ?? 0}`;
}

async function prepararViajeCarril(page, baseUrl, width) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitAparicionInicial(page);
  if (width === 390) {
    await page.click('nav a[href="#habilidades"]');
    await waitReposoEnSeccion(page, "habilidades", 12000);
  }
}

async function esperarFaseSalto(page, fase, hasta = null) {
  return page.waitForFunction(
    ({ f, dest }) => {
      const salto = window.__eventos
        ?.filter(
          (e) =>
            e.nombre === "brote:salto" &&
            e.detail?.carril &&
            !e.detail?.recto &&
            (dest ? e.detail.hasta === dest : true)
        )
        .at(-1);
      if (!salto) return false;
      const tSalidaFin = salto.detail.tSalidaFinMs ?? 176;
      const carrilMs = salto.detail.carrilMs ?? 328;
      const tVuelta = tSalidaFin + carrilMs;
      const tr = performance.now() - salto.t;
      const m = document.getElementById("mascota");
      const enVuelo = m.dataset.estado === "salto" && m.getAnimations().length > 0;
      if (f === "carril") {
        return (
          enVuelo &&
          tr >= tSalidaFin + 24 &&
          tr <= tVuelta - 40
        );
      }
      return enVuelo && tr >= 52 && tr < tSalidaFin - 24;
    },
    { f: fase, dest: hasta },
    { timeout: 12000, polling: 4 }
  );
}

async function ejecutarRetargetCarril(page, baseUrl, width, nuevoHref, nuevoId) {
  await prepararViajeCarril(page, baseUrl, width);
  await instalarFrameLog(page);
  await page.evaluate(() => window.__rafArm());
  const metaCarril = await page.evaluate(
    async ({ hrefDest, destId }) => {
      const esperarSalto = (pred, etiqueta, ms = 8000) =>
        new Promise((resolve, reject) => {
          const sync = () =>
            window.__eventos?.findLast?.(
              (e) => e.nombre === "brote:salto" && pred(e)
            ) ?? null;
          const ya = sync();
          if (ya) return resolve(ya);
          const on = (e) => {
            const row = {
              t: Math.round(performance.now()),
              nombre: "brote:salto",
              detail: { ...e.detail },
            };
            if (!pred(row)) return;
            document.removeEventListener("brote:salto", on);
            resolve(sync() ?? row);
          };
          document.addEventListener("brote:salto", on);
          const t0 = performance.now();
          const spin = () => {
            const hit = sync();
            if (hit) {
              document.removeEventListener("brote:salto", on);
              resolve(hit);
              return;
            }
            if (performance.now() - t0 > ms) {
              document.removeEventListener("brote:salto", on);
              reject(new Error(`timeout esperando ${etiqueta}`));
              return;
            }
            requestAnimationFrame(spin);
          };
          requestAnimationFrame(spin);
        });

      document.querySelector('nav a[href="#enlaces"]').click();
      let primero;
      try {
        primero = await esperarSalto(
          (e) =>
            e.detail?.hasta === "enlaces" &&
            e.detail?.carril &&
            !e.detail?.recto,
          "brote:salto enlaces"
        );
      } catch (err) {
        return {
          ok: false,
          motivo: `sin salto enlaces: ${String(err.message || err)}`,
        };
      }
      const tSalida = primero.detail.tSalidaFinMs ?? 176;
      const carrilMs = primero.detail.carrilMs ?? 328;
      const trMin = tSalida + 24;
      const trMax = tSalida + carrilMs - 40;
      while (performance.now() - primero.t < 12000) {
        const tr = performance.now() - primero.t;
        const m = document.getElementById("mascota");
        if (
          tr >= trMin &&
          tr <= trMax &&
          m?.dataset.estado === "salto" &&
          m.getAnimations().length > 0
        ) {
          const destTitulo = document
            .querySelector("#enlaces .titulo-seccion")
            ?.getBoundingClientRect();
          const s = m.offsetWidth || m.getBoundingClientRect().width;
          const xLane =
            destTitulo != null
              ? Math.max(4, destTitulo.left - s - 8)
              : m.getBoundingClientRect().left;
          const enCarril =
            Math.abs(m.getBoundingClientRect().left - xLane) <= 1.05;
          if (!enCarril) {
            await new Promise((r) => requestAnimationFrame(r));
            continue;
          }
          const clickT = Math.round(performance.now());
          document.querySelector(`nav a[href="${hrefDest}"]`).click();
          return {
            ok: true,
            sT: primero.t,
            clickT,
            tr: Math.round(tr),
            tSalida,
            carrilMs,
          };
        }
        if (tr > trMax) {
          return {
            ok: false,
            motivo: `perdió ventana carril (tr=${Math.round(tr)}ms; ventana ${trMin}–${trMax}ms)`,
            sT: primero.t,
          };
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { ok: false, motivo: "timeout ventana carril" };
    },
    { hrefDest: nuevoHref, destId: nuevoId }
  );
  if (!metaCarril?.ok) {
    fail(
      `retarget carril in-page: ${metaCarril?.motivo ?? "fallo desconocido"} (${width}px)`
    );
  }
  await page.waitForFunction(
    (dest) =>
      window.__eventos?.some(
        (e) =>
          e.nombre === "brote:salto" &&
          e.detail?.retarget &&
          e.detail?.hasta === dest
      ),
    nuevoId,
    { timeout: 8000, polling: 8 }
  );
  await waitReposoEnSeccion(page, nuevoId, 16000);
  const frames = await page.evaluate(() => {
    window.__rafStop();
    return window.__rafFrames;
  });
  const ev = await page.evaluate(() => window.__eventos);
  const resultado = analizarRetargetEnCarril(frames, ev, nuevoId, metaCarril);
  const carrilR2 = medirCarrilEnFrames(frames, ev, `retarget-${width}`);
  verificarC27(ev, `${width}px retarget carril`);
  guardarJson(`retarget-carril-${width}.json`, {
    width,
    ...resultado,
    carrilR2,
    frames: frames.length,
    muestrasViol: resultado.muestrasViol,
  });
  guardarJson(`frames-retarget-carril-${width}.json`, frames);
  return { frames, ev, resultado, carrilR2 };
}

async function ejecutarRetargetSalida(page, baseUrl, width, nuevoHref, nuevoId) {
  await prepararViajeCarril(page, baseUrl, width);
  await instalarFrameLog(page);
  await page.evaluate(() => window.__rafArm());
  const metaSalida = await page.evaluate(
    async ({ hrefDest, destId }) => {
      const esperarSalto = (pred, etiqueta, ms = 8000) =>
        new Promise((resolve, reject) => {
          const sync = () => {
            const hit = window.__eventos?.findLast?.(
              (e) => e.nombre === "brote:salto" && pred(e)
            );
            if (hit) return hit;
            return null;
          };
          const ya = sync();
          if (ya) return resolve(ya);
          const on = (e) => {
            const row = {
              t: Math.round(performance.now()),
              nombre: "brote:salto",
              detail: { ...e.detail },
            };
            if (!pred(row)) return;
            document.removeEventListener("brote:salto", on);
            resolve(sync() ?? row);
          };
          document.addEventListener("brote:salto", on);
          const t0 = performance.now();
          const spin = () => {
            const hit = sync();
            if (hit) {
              document.removeEventListener("brote:salto", on);
              resolve(hit);
              return;
            }
            if (performance.now() - t0 > ms) {
              document.removeEventListener("brote:salto", on);
              reject(new Error(`timeout esperando ${etiqueta}`));
              return;
            }
            requestAnimationFrame(spin);
          };
          requestAnimationFrame(spin);
        });

      const enlaceEnlaces = document.querySelector('nav a[href="#enlaces"]');
      if (!enlaceEnlaces) {
        return { ok: false, motivo: "sin enlace nav #enlaces" };
      }
      enlaceEnlaces.click();

      let primero;
      try {
        primero = await esperarSalto(
          (e) =>
            e.detail?.hasta === "enlaces" &&
            e.detail?.carril &&
            !e.detail?.recto &&
            typeof e.detail?.tSalidaFinMs === "number",
          "brote:salto enlaces carril"
        );
      } catch (err) {
        return {
          ok: false,
          motivo: `sin salto enlaces carril: ${String(err.message || err)}`,
        };
      }

      const fin = primero.detail.tSalidaFinMs ?? 176;
      const trMin = 48;
      const trMax = fin - 14;
      const objetivo =
        primero.t + Math.min(Math.max(Math.round(fin * 0.45), trMin), trMax);
      while (performance.now() < objetivo) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const tr = Math.round(performance.now() - primero.t);
      if (tr >= trMax) {
        return {
          ok: false,
          motivo: `clic fuera de ventana salida translateX (tr=${tr}ms; permitido <${trMax}ms)`,
          sT: primero.t,
          tSalidaFinMs: fin,
          tr,
        };
      }
      const m = document.getElementById("mascota");
      if (
        m?.dataset.estado !== "salto" ||
        m.getAnimations().length === 0
      ) {
        return {
          ok: false,
          motivo: "brote no en vuelo en ventana de salida",
          sT: primero.t,
          tr,
          tSalidaFinMs: fin,
        };
      }

      const clickT = Math.round(performance.now());
      window.__retargetSalidaClickT = clickT;
      window.__retargetSalidaPrimeroT = primero.t;
      const destLink = document.querySelector(`nav a[href="${hrefDest}"]`);
      if (!destLink) {
        return { ok: false, motivo: `sin enlace ${hrefDest}` };
      }
      destLink.click();

      let segundo;
      try {
        segundo = await esperarSalto(
          (e) =>
            e.detail?.retarget &&
            e.detail?.hasta === destId &&
            e.t > primero.t,
          "brote:salto retarget"
        );
      } catch (err) {
        return {
          ok: false,
          motivo: `sin segundo brote:salto retarget: ${String(err.message || err)}`,
          sT: primero.t,
          clickT,
          deltaMs: clickT - primero.t,
          tr,
          tSalidaFinMs: fin,
          primeroRef: { t: primero.t, hasta: "enlaces" },
        };
      }

      return {
        ok: true,
        sT: primero.t,
        clickT,
        deltaMs: clickT - primero.t,
        tr,
        tSalidaFinMs: fin,
        primeroRef: { t: primero.t, hasta: "enlaces" },
        segundoRef: { t: segundo.t, hasta: destId },
        segundoPreview: segundo.detail,
      };
    },
    { hrefDest: nuevoHref, destId: nuevoId }
  );
  if (!metaSalida?.ok) {
    const resultado = {
      ok: false,
      motivo: metaSalida.motivo ?? "escenario salida abortado",
      deltaMs:
        typeof metaSalida.deltaMs === "number"
          ? Math.round(metaSalida.deltaMs)
          : undefined,
      maxJump: undefined,
      carrilMs2: undefined,
      modo2: undefined,
      metaSalida,
    };
    guardarJson(`retarget-salida-${width}.json`, { width, ...resultado });
    return {
      frames: [],
      ev: [],
      resultado,
      carrilR2: { violaciones: 0 },
      violRelanzado: 0,
    };
  }
  const clickT = metaSalida.clickT;
  await waitReposoEnSeccion(page, nuevoId, 16000);
  const frames = await page.evaluate(() => {
    window.__rafStop();
    return window.__rafFrames;
  });
  const ev = await page.evaluate(() => window.__eventos);
  const resultado = analizarRetargetSalida(
    frames,
    ev,
    nuevoId,
    clickT,
    metaSalida.sT,
    metaSalida
  );
  resultado.metaSalida = metaSalida;
  const carrilR2 = medirCarrilEnFrames(frames, ev, `retarget-salida-${width}`);
  const bloqueRelanzado = carrilR2.bloques.filter((b) => b.dest === nuevoId).at(-1);
  const violRelanzado =
    bloqueRelanzado?.violacionesBloque ??
    (bloqueRelanzado?.modo === "recto" ? 0 : carrilR2.violaciones);
  resultado.violRelanzado = violRelanzado;
  verificarC27(ev.slice(-6), `${width}px retarget salida`);
  guardarJson(`retarget-salida-${width}.json`, {
    width,
    ...resultado,
    carrilR2,
    violRelanzado,
    frames: frames.length,
  });
  guardarJson(`frames-retarget-salida-${width}.json`, frames);
  return { frames, ev, resultado, carrilR2, violRelanzado };
}

async function capturarCasosTrayectoria(page, baseUrl, width) {
  const casos = {};
  async function viaNav(href, clave) {
    await instalarFrameLog(page);
    await page.evaluate(() => {
      window.__rafFrames = [];
      window.__rafArm?.();
    });
    await page.click(`nav a[href="${href}"]`);
    const fin = Date.now() + 20000;
    while (Date.now() < fin) {
      const done = await page.evaluate((h) => {
        const id = h.replace("#", "");
        const last = window.__eventos
          ?.filter((e) => e.nombre === "brote:reposo")
          .at(-1);
        const m = document.getElementById("mascota");
        return (
          last?.detail?.seccion === id &&
          m.dataset.estado === "reposo" &&
          m.getAnimations().length === 0
        );
      }, href);
      if (done) break;
      await page.waitForTimeout(16);
    }
    const payload = await page.evaluate(() => {
      window.__rafStop?.();
      return {
        frames: window.__rafFrames || [],
        salto: window.__eventos
          ?.filter((e) => e.nombre === "brote:salto")
          .at(-1),
        barrido: window.__ultimoBarrido || null,
      };
    });
    casos[clave] = {
      width,
      href,
      navegacionUsuario: true,
      descripcion:
        clave === "carril-n2"
          ? "Nav real: clic en enlace del nav (tras preparación de sección)"
          : "Nav real: clic en enlace del nav",
      detail: payload.salto?.detail,
      barrido: payload.barrido,
      frames: payload.frames.length,
    };
    guardarJson(`caso-${clave}-${width}.json`, casos[clave]);
    guardarJson(`frames-caso-${clave}-${width}.json`, payload.frames);
  }
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitAparicionInicial(page);
  await viaNav("#habilidades", "recto-n1");
  await viaNav("#enlaces", "carril-n2");
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitAparicionInicial(page);
  await instalarFrameLog(page);
  await page.evaluate(() => window.__rafArm());
  for (let i = 0; i < 22; i++) {
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(2000);
  const scrollHop = await page.evaluate(() => {
    window.__rafStop?.();
    const salto = window.__eventos
      ?.filter((e) => e.nombre === "brote:salto" && e.detail?.origen === "scroll")
      .at(-1);
    return {
      detail: salto?.detail,
      barrido: window.__ultimoBarrido || null,
      frames: (window.__rafFrames || []).length,
    };
  });
  casos[`scroll-n2-${width}`] = { width, ...scrollHop };
  guardarJson(`caso-scroll-n2-${width}.json`, casos[`scroll-n2-${width}`]);
  const barridoForzado = await page.evaluate(() => {
    const tam = document.getElementById("mascota").offsetWidth;
    const anchor = (id) => {
      const t = document.getElementById(id).querySelector(".titulo-seccion");
      let x = 0;
      let y = 0;
      for (let e = t; e; e = e.offsetParent) {
        x += e.offsetLeft;
        y += e.offsetTop;
      }
      const pad = parseFloat(getComputedStyle(t).paddingTop);
      return { x: Math.round(x - tam * 0.12), y: Math.round(y + pad - tam + 2) };
    };
    const o = anchor("sobre-mi");
    const d = { x: o.x, y: o.y + 300 };
    const barrido = window.__barridoCruzaTexto(o, d, tam);
    const dist = Math.hypot(d.x - o.x, d.y - o.y);
    return {
      sintetico: true,
      o,
      d,
      dist,
      cruza: barrido.cruza,
      regla: "d≤320 y cruza → n=2 forzado",
      nEsperado: dist <= 320 && barrido.cruza ? 2 : 1,
      muestras: barrido.muestras?.slice(0, 6),
      bloques: barrido.bloques?.length,
    };
  });
  casos[`barrido-forzado-${width}`] = barridoForzado;
  guardarJson(`barrido-forzado-n2-${width}.json`, barridoForzado);
  return casos;
}

function curvaOpacidadInicial(frames, tTitulo) {
  return frames
    .filter((f) => f.t >= tTitulo - 0.5 && f.t <= tTitulo + 200)
    .map((f) => ({
      ms: Math.round((f.t - tTitulo) * 10) / 10,
      opacity: f.brote?.opacity ?? 0,
    }));
}

const SELECTOR_TEXTO =
  "#sobre-mi p, #habilidades p, #proyectos .proyecto__tipo, #proyectos .proyecto__texto, #proyectos .paso__titulo, #proyectos .paso__detalle, .enlace-ext";

function contarSolapeTextoEnVuelo(frames, eventos) {
  const saltos = eventos.filter(
    (e) => e.nombre === "brote:salto" && e.detail?.n !== 0 && e.detail?.hasta
  );
  let cruces = 0;
  let framesVuelo = 0;
  const detalle = [];
  for (const salto of saltos) {
    const dest = salto.detail.hasta;
    const aterri = eventos.find(
      (e) =>
        e.nombre === "brote:aterrizaje" &&
        e.t >= salto.t &&
        e.detail?.seccion === dest
    );
    const t0 = t0Salto(frames, salto);
    const t1 = aterri?.t ?? salto.t + 900;
    const vuelo = frames.filter(
      (f) => f.t >= t0 && f.t <= t1 + 30 && f.estado === "salto"
    );
    let hopCruces = 0;
    for (const f of vuelo) {
      framesVuelo += 1;
      const bloques = f.textoBloques;
      if (!bloques?.length) continue;
      const brote = f.brote;
      const bl = brote.left;
      const br = bl + brote.width;
      const bt = brote.top;
      const bb = bt + brote.height;
      for (const b of bloques) {
        const ox = Math.min(br, b.r) - Math.max(bl, b.l);
        const oy = Math.min(bb, b.b) - Math.max(bt, b.t);
        if (ox > 2 && oy > 2) {
          hopCruces += 1;
          cruces += 1;
        }
      }
    }
    detalle.push({ dest, vuelo: vuelo.length, cruces: hopCruces });
  }
  return { cruces, framesVuelo, detalle };
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
  if (analisis.ok && analisis.tTitulo && !opts.reducedMotion) {
    const curva = curvaOpacidadInicial(frames, analisis.tTitulo);
    guardarJson(`c20-opacidad-${width}.json`, curva);
    const o160 = curva.find((p) => p.ms >= 150 && p.ms <= 175)?.opacity ?? 0;
    if (o160 < 0.9) {
      fail(
        `C20 ${width}px: opacidad a ~160ms=${o160.toFixed(2)} (esperado desacel→1)`
      );
    }
    analisis.curvaOpacidad = curva;
  }
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
  if (a.curvaOpacidad) {
    ok(
      `C20 curva opacidad ${result.width}px: t0=${a.curvaOpacidad[0]?.opacity?.toFixed(3)} → t160≈${a.curvaOpacidad.find((p) => p.ms >= 155 && p.ms <= 170)?.opacity?.toFixed(3)} (n=${a.curvaOpacidad.length})`
    );
  }
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
        "#sobre-mi p, #habilidades p, #proyectos .proyecto__tipo, #proyectos .proyecto__texto, #proyectos .paso__titulo, #proyectos .paso__detalle, .enlace-ext"
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
  const framesLane = bloques.reduce((s, b) => s + (b.framesEnCarril || 0), 0);
  const conCarril = bloques.filter((b) => b.modo === "carril");
  const pass =
    violaciones === 0 &&
    bloques.length > 0 &&
    (conCarril.length === 0 || framesLane > 0);
  const resumen = bloques
    .map((b) =>
      b.modo === "recto"
        ? `${b.dest}: recto n=${b.n} carrilMs=${b.carrilMs} barrido=${b.barridoCruza}`
        : b.modo === "carril"
          ? `${b.dest}: xCarril=${b.xCarril.toFixed(1)} ventana=${b.ventanaMs?.join("–")}ms n=${b.framesEnCarril} carrilMs=${b.carrilMs} left∈[${b.leftMin.toFixed(2)},${b.leftMax.toFixed(2)}]`
          : `${b.dest}: sin carril n=${b.n}`
    )
    .join("; ");
  const detalle = `${etiqueta}: |left−xCarril|≤1 viol=${violaciones} framesCarril=${framesLane} (${resumen})`;
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
      verificarC27(r15.ev, `${width}px nav→enlaces`);
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
      verificarC27(rapid.ev, `${width}px clics rápidos`);
      guardarJson(`rapid-viajes-${width}.json`, {
        carril: rapid.carril.bloques,
        c27: carrilResultados27.at(-1),
      });
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
      const solape = contarSolapeTextoEnVuelo(frames, ev);
      guardarJson(`scroll-solape-vuelo-${width}.json`, solape);
      reg(
        26,
        solape.cruces === 0,
        `${width}px scroll: cruces texto en vuelo=${solape.cruces} (frames vuelo=${solape.framesVuelo})`
      );
      verificarC27(ev, `${width}px scroll manual`);
      await pScroll.close();
    }

    const casosEvidencia = {};
    for (const width of [390, 1440]) {
      const height = width === 390 ? 844 : 900;
      const pCasos = await browser.newPage({ viewport: { width, height } });
      await setupEventLog(pCasos);
      casosEvidencia[width] = await capturarCasosTrayectoria(
        pCasos,
        baseUrl,
        width
      );
      await pCasos.close();
    }
    guardarJson("casos-trayectoria-resumen.json", casosEvidencia);

    for (const width of [390, 1440]) {
      const height = width === 390 ? 844 : 900;
      const pR = await browser.newPage({ viewport: { width, height } });
      await setupEventLog(pR);
      await pR.goto(baseUrl, { waitUntil: "networkidle" });
      const rC = await ejecutarRetargetCarril(
        pR,
        baseUrl,
        width,
        "#sobre-mi",
        "sobre-mi"
      );
      reg(
        26,
        rC.resultado.ok,
        `${width}px retarget en carril: viol=${rC.resultado.violCarril} maxΔleft=${rC.resultado.maxDesv?.toFixed(2)}px frames=${rC.resultado.framesCarril} jump=${rC.resultado.maxJump.toFixed(2)}px carrilMs2=${rC.resultado.segundo?.carrilMs}`
      );
      await pR.close();

      const pS = await browser.newPage({ viewport: { width, height } });
      await setupEventLog(pS);
      await pS.goto(baseUrl, { waitUntil: "networkidle" });
      const rS = await ejecutarRetargetSalida(
        pS,
        baseUrl,
        width,
        "#habilidades",
        "habilidades"
      );
      reg(
        26,
        rS.resultado.ok && (rS.violRelanzado ?? 0) === 0,
        detalleRetargetSalidaOFalla(rS, width)
      );
      await pS.close();
    }

    const v390 = await grabarDemoCompleta(
      browser,
      baseUrl,
      390,
      844,
      "motion-v5-390.mp4"
    );
    const v1440 = await grabarDemoCompleta(
      browser,
      baseUrl,
      1440,
      900,
      "motion-v5-1440.mp4"
    );
    ok(
      `vídeos ${v390.mp4} (${v390.dur.toFixed(1)}s), ${v1440.mp4} (${v1440.dur.toFixed(1)}s)`
    );

    fs.writeFileSync(
      path.join(artifactDir, "criteria-v5.json"),
      JSON.stringify(
        {
          resultados,
          c20Resultados,
          carrilResultados,
          carrilResultados27,
          logs,
          casosEvidencia,
        },
        null,
        2
      )
    );
    console.log("\n=== motion-v4 OK ===\n");
  } finally {
    fs.writeFileSync(
      path.join(artifactDir, "motion-v5-log.txt"),
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