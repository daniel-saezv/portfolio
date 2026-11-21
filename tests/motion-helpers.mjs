import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = req.url === "/" ? "/index.html" : req.url.split("?")[0];
      const filePath = path.join(root, rel);
      if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
      });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/` });
    });
  });
}

export async function waitFonts(page) {
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

export async function setupEventLog(page) {
  await page.addInitScript(() => {
    window.__eventos = [];
    ["brote:salto", "brote:aterrizaje", "brote:reposo"].forEach((n) =>
      document.addEventListener(n, (e) =>
        window.__eventos.push({
          t: Math.round(performance.now()),
          nombre: n,
          detail: e.detail,
        })
      )
    );
  });
}

/** Máxima tolerancia al anclaje de reposo (px) respecto a la fórmula §8.4. */
export const MAX_DIST_ANCLAJE = 8;

/** Tras un salto: brote:reposo en la sección, sin WAAPI pendiente. */
export async function waitReposoEnSeccion(page, sectionId, timeout = 16000) {
  await page.waitForFunction(
    (id) => {
      const ev = window.__eventos || [];
      const reposos = ev.filter((e) => e.nombre === "brote:reposo");
      const last = reposos.at(-1);
      if (!last || last.detail.seccion !== id) return false;
      const m = document.getElementById("mascota");
      if (m.dataset.estado !== "reposo") return false;
      if (m.getAnimations().length > 0) return false;
      if (document.body.dataset.seccionActiva !== id) return false;
      return true;
    },
    sectionId,
    { timeout }
  );
}

export async function waitAparicionInicial(page, timeout = 12000) {
  await page.waitForFunction(
    () => {
      const ev = window.__eventos || [];
      const ini = ev.find(
        (e) => e.nombre === "brote:reposo" && e.detail.origen === "inicio"
      );
      const m = document.getElementById("mascota");
      return (
        !!ini &&
        m.dataset.estado === "reposo" &&
        m.getAnimations().length === 0
      );
    },
    null,
    { timeout }
  );
}

export async function assertReposoRenderizado(page, sectionId, maxDist = MAX_DIST_ANCLAJE) {
  return page.evaluate(
    ({ id, maxD }) => {
      const mascota = document.getElementById("mascota");
      mascota.classList.add("pausada");
      const m = mascota.getBoundingClientRect();
      const titulo = document.getElementById(id).querySelector(".titulo-seccion");
      let x = 0;
      let y = 0;
      for (let e = titulo; e; e = e.offsetParent) {
        x += e.offsetLeft;
        y += e.offsetTop;
      }
      const tam = mascota.offsetWidth;
      const pad = parseFloat(getComputedStyle(titulo).paddingTop);
      const doc = {
        x: Math.round(x - tam * 0.12),
        y: Math.round(y + pad - tam + 2),
      };
      const esperado = { x: doc.x - scrollX, y: doc.y - scrollY };
      const dist = Math.hypot(m.left - esperado.x, m.top - esperado.y);
      let overlap = 0;
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        if (!n.textContent.trim()) continue;
        if (n.parentElement?.closest("#mascota")) continue;
        const titulo = n.parentElement?.closest(".titulo-seccion");
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const cr of r.getClientRects()) {
          const nav = document.querySelector(".nav")?.offsetHeight ?? 0;
          if (cr.bottom < nav - 2 || cr.top > innerHeight + 2) continue;
          const ox = Math.max(
            0,
            Math.min(m.right, cr.right) - Math.max(m.left, cr.left)
          );
          if (ox <= 0) continue;
          if (titulo) {
            const tr = titulo.getBoundingClientRect();
            const pad = parseFloat(getComputedStyle(titulo).paddingTop);
            const textoTop = tr.top + pad;
            const pen = Math.max(0, m.bottom - textoTop - 2);
            if (pen > 0) overlap = Math.max(overlap, ox * pen);
          } else {
            const oy = Math.max(
              0,
              Math.min(m.bottom, cr.bottom) - Math.max(m.top, cr.top)
            );
            overlap = Math.max(overlap, ox * oy);
          }
        }
      }
      const nav = document.querySelector(".nav")?.offsetHeight ?? 0;
      const inVp =
        m.top >= nav - 1 &&
        m.left >= -1 &&
        m.right <= innerWidth + 1 &&
        m.bottom <= innerHeight + 1;
      const css = {
        x: parseFloat(getComputedStyle(mascota).getPropertyValue("--brote-x")),
        y: parseFloat(getComputedStyle(mascota).getPropertyValue("--brote-y")),
      };
      const distCss = Math.hypot(css.x - doc.x, css.y - doc.y);
      mascota.classList.remove("pausada");
      return {
        distViewport: Math.round(dist * 10) / 10,
        distCss: Math.round(distCss * 10) / 10,
        overlap,
        inViewport: inVp,
        ok: dist <= maxD && distCss <= maxD && overlap === 0 && inVp,
      };
    },
    { id: sectionId, maxD: maxDist }
  );
}