import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

/** Desviación máxima del centro respecto a la cuerda recta inicio→fin (viewport px). */
export function alturaArcoRenderizada(samples) {
  if (!samples || samples.length < 3) return 0;
  const n = samples.length;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const expCy = samples[0].cy + t * (samples[n - 1].cy - samples[0].cy);
    const expCx = samples[0].cx + t * (samples[n - 1].cx - samples[0].cx);
    const dev = Math.hypot(
      samples[i].cx - expCx,
      samples[i].cy - expCy
    );
    max = Math.max(max, dev);
  }
  return Math.round(max * 10) / 10;
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
        window.__tray.push({
          t: performance.now(),
          left: r.left,
          top: r.top,
          w: r.width,
          h: r.height,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
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

/** Recorta muestras al intervalo [desdeSalto, reposo] para un origen de salto. */
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
  const s = samples.filter((f) => f.t >= salto.t - 16 && f.t <= reposo.t + 16);
  return { samples: s, salto, reposo };
}

async function capaTrayectoria(page, width, height, samples, label, color) {
  return page.evaluate(
    ({ w, h, samples, label, color }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (samples.length >= 2) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        samples.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.cx, p.cy);
          else ctx.lineTo(p.cx, p.cy);
        });
        ctx.stroke();
        samples.forEach((p, i) => {
          const a = 0.1 + 0.45 * (i / Math.max(1, samples.length - 1));
          ctx.globalAlpha = a;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(p.left, p.top, p.w, p.h);
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.font = "bold 13px system-ui,sans-serif";
        ctx.fillText(label, 8, 20);
      }
      return c.toDataURL("image/png");
    },
    { w: width, h: height, samples, label, color }
  );
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
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  }
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
  await page.waitForLoadState("domcontentloaded").catch(() => {});
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
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  }
}

export async function esperarSaltoScroll(page, timeout = 15000) {
  await page.waitForFunction(
    () =>
      window.__eventos?.some(
        (e) => e.nombre === "brote:salto" && e.detail?.origen === "scroll"
      ),
    null,
    { timeout }
  );
}

export function informarArco(etiqueta, samples, hMin) {
  const arco = alturaArcoRenderizada(samples);
  console.log(
    `  arco ${etiqueta}: ${arco}px renderizado (mín spec ${hMin}px, muestras=${samples.length})`
  );
  return arco;
}