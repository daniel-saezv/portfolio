import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

/** Recompensa cy si scrollY cambia durante el salto (coords de pantalla con scroll congelado). */
/** cy de ancla (mitad del tamaño lógico `offsetWidth`, sin sesgo del bbox escalado). */
export function cyAnclaMascota(m, r) {
  const s = m.offsetWidth || r.height;
  return r.top + s / 2;
}

export function compensarScroll(samples) {
  const pts = muestrasArco(samples);
  if (!pts.length) return pts;
  const sy0 = pts[0].sy ?? 0;
  return pts.map((p) => ({
    ...p,
    cy: p.cy + ((p.sy ?? sy0) - sy0),
  }));
}

/** Muestras de la fase de vuelo (sin reposo tras aterrizar). */
export function muestrasArco(samples) {
  if (!samples?.length) return [];
  const firstSalto = samples.findIndex((s) => s.estado === "salto");
  if (firstSalto < 0) return [];
  let lastFly = firstSalto;
  for (let i = samples.length - 1; i >= firstSalto; i--) {
    if (samples[i].estado === "salto") {
      lastFly = i;
      break;
    }
  }
  return samples.slice(firstSalto, lastFly + 1);
}

/** Arco por cada saltito (cambio de convexidad en cy). */
/** Un arco por ventana WAAPI de 240 ms (§11.1), tras anticipación 80 ms. */
function arcosEnVentanas(pts, nSaltos, base) {
  const A = 80;
  const Ts = 240;
  const Tc = 40;
  const arcs = [];
  for (let i = 0; i < nSaltos; i++) {
    const phaseStart = base + A + i * (Ts + Tc);
    const phaseEnd = phaseStart + Ts;
    const chunk = pts.filter(
      (p) => p.t >= phaseStart - 20 && p.t <= phaseEnd + 20
    );
    if (chunk.length >= 3) arcs.push(alturaArcoEnTramo(chunk));
  }
  return arcs.filter((a) => a > 0.2);
}

export function arcosPorSaltitosAnimacion(samples, nSaltos, saltoT = 0, hRef = 0) {
  const pts = compensarScroll(
    muestrasArco(
      samples.map((p) => ({
        ...p,
        sy: p.sy ?? 0,
      }))
    )
  );
  if (pts.length < 2 || nSaltos < 1) return [];
  const tGuess = saltoT > 0 ? saltoT : pts[0].t;
  let best = null;
  let bestScore = Infinity;
  for (let shift = -100; shift <= 60; shift += 5) {
    const arcs = arcosEnVentanas(pts, nSaltos, tGuess + shift);
    if (arcs.length !== nSaltos) continue;
    const score =
      hRef > 0
        ? arcs.reduce((s, a) => s + Math.abs(a - hRef), 0)
        : Math.abs(shift) + arcs.length * 0.01;
    if (
      score < bestScore - 0.05 ||
      (Math.abs(score - bestScore) < 0.05 && Math.abs(shift) < Math.abs(best?.shift ?? 999))
    ) {
      best = { arcs, shift };
      bestScore = score;
    }
  }
  if (best?.arcs.length) return best.arcs;
  return arcosEnVentanas(pts, nSaltos, tGuess);
}

/** Divide el vuelo en n saltitos por tiempo (como viajar() con n tramos). */
export function arcosPorTiempo(samples, nSaltos) {
  const pts = muestrasArco(samples);
  if (pts.length < 3 || nSaltos < 1) return [];
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const arcs = [];
  for (let i = 0; i < nSaltos; i++) {
    const ta = t0 + (i / nSaltos) * (t1 - t0);
    const tb = t0 + ((i + 1) / nSaltos) * (t1 - t0);
    const chunk = pts.filter((p) => p.t >= ta - 2 && p.t <= tb + 2);
    if (chunk.length >= 3) arcs.push(alturaArcoEnTramo(chunk));
  }
  return arcs.filter((a) => a > 0.1);
}

export function arcosPorSegmento(samples) {
  const pts = muestrasArco(samples);
  if (pts.length < 3) return pts.length ? [alturaArcoEnTramo(pts)] : [];
  const arcs = [];
  let start = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d0 = pts[i].cy - pts[i - 1].cy;
    const d1 = pts[i + 1].cy - pts[i].cy;
    if (d0 * d1 < 0 && (Math.abs(d0) > 0.3 || Math.abs(d1) > 0.3)) {
      arcs.push(alturaArcoEnTramo(pts.slice(start, i + 1)));
      start = i;
    }
  }
  arcs.push(alturaArcoEnTramo(pts.slice(start)));
  return arcs.filter((a) => a > 0.5);
}

function alturaArcoEnTramo(pts) {
  if (pts.length < 3) return 0;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  if (t1 <= t0) return 0;
  const y0 = pts[0].cy;
  const y1 = pts[pts.length - 1].cy;
  let maxUp = 0;
  for (const s of pts) {
    const u = (s.t - t0) / (t1 - t0);
    const yLin = y0 + u * (y1 - y0);
    maxUp = Math.max(maxUp, yLin - s.cy);
  }
  return Math.round(maxUp * 10) / 10;
}

/**
 * Altura de arco en pantalla: máxima desviación hacia arriba de cy respecto a la
 * interpolación lineal en tiempo entre despegue y aterrizaje (coords viewport).
 */
/** Máx. arco por saltito (desviación hacia arriba respecto a la cuerda local). */
export function alturaArcoRenderizada(samples, nSaltos, saltoT = 0) {
  const n = nSaltos > 0 ? nSaltos : 1;
  let arcs = arcosPorSaltitosAnimacion(samples, n, saltoT);
  if (arcs.length < n) {
    const pts = compensarScroll(muestrasArco(samples));
    arcs =
      n > 1
        ? arcosPorTiempo(pts, n)
        : arcosPorSegmento(pts);
  }
  if (!arcs.length) return alturaArcoEnTramo(muestrasArco(samples));
  return Math.round(Math.max(...arcs) * 10) / 10;
}

export function alturaArcoGlobal(samples) {
  return alturaArcoEnTramo(muestrasArco(samples));
}

export function cuerdaVertical(samples) {
  const pts = muestrasArco(samples);
  if (pts.length < 2) return 0;
  return Math.round(Math.abs(pts[pts.length - 1].cy - pts[0].cy) * 10) / 10;
}

export async function instalarMuestreoSalto(page, intervalMs = 33) {
  await page.evaluate((ms) => {
    window.__tray = [];
    window.__trayOn = false;
    window.__trayIv = ms;
    window.__trayStart = () => {
      window.__tray = [];
      window.__trayOn = true;
      const tick = () => {
        if (!window.__trayOn) return;
        const m = document.getElementById("mascota");
        const r = m.getBoundingClientRect();
        const s = m.offsetWidth || r.width;
        const cy = r.top + s / 2;
        window.__tray.push({
          t: performance.now(),
          left: r.left,
          top: r.top,
          sy: scrollY,
          w: r.width,
          h: r.height,
          cx: r.left + r.width / 2,
          cy,
          estado: m.dataset.estado,
        });
        window.__trayTimer = setTimeout(tick, ms);
      };
      tick();
    };
    window.__trayStop = () => {
      window.__trayOn = false;
      clearTimeout(window.__trayTimer);
    };
  }, intervalMs);
}

export async function extraerMuestras(page) {
  return page.evaluate(() => {
    window.__trayStop();
    return window.__tray;
  });
}

export function recortarSalto(samples, origenFilter, eventos) {
  const salto = eventos
    .filter(
      (e) =>
        e.nombre === "brote:salto" &&
        (!origenFilter || e.detail?.origen === origenFilter)
    )
    .at(-1);
  const reposo = eventos
    .filter(
      (e) =>
        e.nombre === "brote:reposo" &&
        salto &&
        e.t >= salto.t &&
        e.detail?.seccion === salto.detail?.hasta
    )
    .at(-1);
  if (!salto || !reposo) return { samples: [], salto, reposo };
  const s = samples.filter((f) => f.t >= salto.t - 8 && f.t <= reposo.t + 8);
  return { samples: s, salto, reposo };
}

function decodificarDataUrl(dataUrl) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(b64, "base64");
}

function fusionarPng(bg, overlay, outPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tray-fuse-"));
  const bgPath = path.join(dir, "bg.png");
  const ovPath = path.join(dir, "ov.png");
  fs.writeFileSync(bgPath, bg);
  fs.writeFileSync(ovPath, overlay);
  try {
    execSync(
      `ffmpeg -y -i "${bgPath}" -i "${ovPath}" -filter_complex "[0:v][1:v]overlay=0:0" -frames:v 1 "${outPath}"`,
      { stdio: "pipe" }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function capaTrayectoria(page, width, height, samples, label, color, timeSpread = 0.12) {
  const t0 = samples[0]?.t ?? 0;
  return page.evaluate(
    ({ w, h, samples, label, color, timeSpread, t0 }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      const pts = samples.map((p) => ({
        ...p,
        dx: p.cx + (p.t - t0) * timeSpread,
      }));
      if (pts.length >= 2) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        pts.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.dx, p.cy);
          else ctx.lineTo(p.dx, p.cy);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        pts.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.cx, p.cy);
          else ctx.lineTo(p.cx, p.cy);
        });
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        pts.forEach((p, i) => {
          const a = 0.1 + 0.45 * (i / Math.max(1, pts.length - 1));
          ctx.globalAlpha = a;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(p.dx - p.w / 2, p.top, p.w, p.h);
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.font = "bold 13px system-ui,sans-serif";
        ctx.fillText(label, 8, 20);
      }
      return c.toDataURL("image/png");
    },
    { w: width, h: height, samples, label, color, timeSpread, t0 }
  );
}

export async function panelTrayectoria(
  browser,
  page,
  width,
  height,
  samples,
  label,
  color
) {
  void browser;
  await page.waitForTimeout(80);
  const [bg, layerUrl] = await Promise.all([
    page.screenshot({ type: "png" }),
    capaTrayectoria(page, width, height, samples, label, color),
  ]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tray-panel-"));
  const out = path.join(dir, "panel.png");
  fusionarPng(bg, decodificarDataUrl(layerUrl), out);
  const dataUrl = `data:image/png;base64,${fs.readFileSync(out).toString("base64")}`;
  fs.rmSync(dir, { recursive: true, force: true });
  return dataUrl;
}

export async function combinarPaneles(browser, w, h, leftUrl, rightUrl, outPath) {
  void browser;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tray-merge-"));
  const lPath = path.join(dir, "izq.png");
  const rPath = path.join(dir, "der.png");
  fs.writeFileSync(lPath, decodificarDataUrl(leftUrl));
  fs.writeFileSync(rPath, decodificarDataUrl(rightUrl));
  try {
    execSync(
      `ffmpeg -y -i "${lPath}" -i "${rPath}" -filter_complex "[0:v][1:v]hstack=inputs=2" -frames:v 1 "${outPath}"`,
      { stdio: "pipe" }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function chartHtml(panelW, panelH, navSamples, scrollSamples, navArc, scrollArc) {
  const data = JSON.stringify({
    panelW,
    panelH,
    nav: muestrasArco(navSamples),
    scroll: muestrasArco(scrollSamples),
    navArc,
    scrollArc,
  }).replace(/</g, "\\u003c");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script type="application/json" id="d">${data}</script>
<script>
const { panelW, panelH, nav, scroll, navArc, scrollArc } = JSON.parse(document.getElementById("d").textContent);
const W = panelW * 2, H = panelH + 60;
const c = document.createElement("canvas");
c.width = W; c.height = H;
const ctx = c.getContext("2d");
ctx.fillStyle = "#0B2A22";
ctx.fillRect(0, 0, W, H);

function drawPanel(x0, title, pts, arco) {
  const pad = { l: 52, r: 20, t: 36, b: 44 };
  const pw = panelW - pad.l - pad.r;
  const ph = panelH - pad.t - pad.b;
  const t0 = pts[0]?.t ?? 0;
  const t1 = pts[pts.length - 1]?.t ?? t0 + 1;
  const ys = pts.map(p => p.cy);
  const yMin = Math.min(...ys) - 12;
  const yMax = Math.max(...ys) + 12;
  ctx.fillStyle = "#F3F7EF";
  ctx.font = "bold 14px system-ui,sans-serif";
  ctx.fillText(title, x0 + pad.l, 22);
  ctx.strokeStyle = "rgba(143,214,148,0.35)";
  ctx.strokeRect(x0 + pad.l, pad.t, pw, ph);
  const tx = (t) => x0 + pad.l + ((t - t0) / (t1 - t0 || 1)) * pw;
  const ty = (y) => pad.t + ((y - yMin) / (yMax - yMin || 1)) * ph;
  ctx.strokeStyle = "rgba(242,193,78,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = tx(p.t), y = ty(p.cy);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  const y0 = pts[0].cy, y1 = pts[pts.length - 1].cy;
  ctx.moveTo(tx(t0), ty(y0));
  ctx.lineTo(tx(t1), ty(y1));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#2EC4B6";
  ctx.font = "12px system-ui,sans-serif";
  ctx.fillText("arco " + arco + "px", x0 + pad.l + 4, panelH + 48);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("cy pantalla vs tiempo", x0 + pad.l, panelH + 18);
}
if (nav.length >= 3) drawPanel(0, "(a) clic nav", nav, navArc);
if (scroll.length >= 3) drawPanel(panelW, "(b) scroll manual", scroll, scrollArc);
window.__chart = c.toDataURL("image/png");
</script></body></html>`;
}

export async function guardarGraficoArco(
  browser,
  width,
  navSamples,
  scrollSamples,
  navArc,
  scrollArc,
  outPath
) {
  const panelW = 480;
  const panelH = 320;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arco-chart-"));
  const htmlPath = path.join(dir, "chart.html");
  fs.writeFileSync(
    htmlPath,
    chartHtml(panelW, panelH, navSamples, scrollSamples, navArc, scrollArc)
  );
  const aux = await browser.newPage({
    viewport: { width: panelW * 2, height: panelH + 60 },
  });
  try {
    await aux.goto(`file://${htmlPath}`);
    await aux.waitForFunction(() => window.__chart, null, { timeout: 10000 });
    const dataUrl = await aux.evaluate(() => window.__chart);
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
  } finally {
    await aux.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function nSaltosDesdeSalto(salto) {
  let n = typeof salto?.detail?.n === "number" && salto.detail.n > 0 ? salto.detail.n : 1;
  const d = salto?.detail?.dist;
  if (typeof d === "number") {
    if (d > 620) n = Math.max(n, 3);
    else if (d > 300) n = Math.max(n, 2);
  }
  return n;
}

export function medirArcosSaltos(samples, salto) {
  const n =
    typeof salto?.detail?.n === "number" && salto.detail.n > 0
      ? salto.detail.n
      : nSaltosDesdeSalto(salto);
  const saltoT = salto?.t ?? muestrasArco(samples)[0]?.t ?? 0;
  const hRef =
    typeof salto?.detail?.h === "number" && salto.detail.h > 0
      ? salto.detail.h
      : 0;
  const arcs = arcosPorSaltitosAnimacion(samples, n, saltoT, hRef);
  if (arcs.length < n) {
    const pts = compensarScroll(muestrasArco(samples));
    const seg = arcosPorSegmento(pts);
    if (seg.length >= n) {
      const use = seg.slice(0, n);
      return {
        arcs: use,
        max: Math.round(Math.max(...use) * 10) / 10,
        n,
      };
    }
  }
  const max = arcs.length ? Math.round(Math.max(...arcs) * 10) / 10 : 0;
  return { arcs, max, n };
}

export function assertArcoEnSpec(arcs, hMin, hMax, etiqueta, nSaltos = arcs.length) {
  const errs = [];
  if (nSaltos > 0 && arcs.length !== nSaltos) {
    errs.push(`medidos ${arcs.length}/${nSaltos} saltitos`);
  }
  arcs.forEach((a, i) => {
    if (a < hMin - 0.5) errs.push(`saltito ${i + 1}: ${a}px < ${hMin}px`);
    if (a > hMax + 0.5) errs.push(`saltito ${i + 1}: ${a}px > ${hMax}px (C11)`);
  });
  if (!arcs.length) errs.push("sin muestras de arco");
  if (errs.length) {
    const e = new Error(`${etiqueta}: ${errs.join("; ")}`);
    e.arcs = arcs;
    throw e;
  }
}

export function informarArco(etiqueta, samples, salto, hMin, hMax) {
  const { arcs, max, n } = medirArcosSaltos(samples, salto);
  const cuerda = cuerdaVertical(samples);
  console.log(
    `  arco ${etiqueta}: saltitos=[${arcs.map((a) => a.toFixed(1)).join(", ")}] max=${max}px (mín=${hMin} máx=${hMax} n=${n}, cuerda Δy=${cuerda}px, muestras=${muestrasArco(samples).length})`
  );
  assertArcoEnSpec(arcs, hMin, hMax, etiqueta, n);
  return max;
}