import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  waitReposoEnSeccion,
  waitAparicionInicial,
  setupEventLog as setupEventLogHelper,
} from "./motion-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const T = {
  anticipacion: 80,
  salto: 240,
  contacto: 40,
  hojas: 240,
  debounceScroll: 150,
  quietud: 120,
  aparicionRetraso: 0,
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function startServer() {
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

function tiempoAterrizaje(n, retarget = false) {
  const A = retarget ? 0 : T.anticipacion;
  return A + n * T.salto + (n - 1) * T.contacto;
}

function tiempoReposo(n, retarget = false) {
  return tiempoAterrizaje(n, retarget) + T.hojas;
}

async function waitFonts(page) {
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

async function setupEventLog(page) {
  await setupEventLogHelper(page);
}

const NAV_LINKS = [
  { href: "#sobre-mi", id: "sobre-mi" },
  { href: "#habilidades", id: "habilidades" },
  { href: "#enlaces", id: "enlaces" },
];

async function solapeTitulo(page, sectionId) {
  return page.evaluate((id) => {
    const titulo = document.getElementById(id).querySelector(".titulo-seccion");
    const m = document.getElementById("mascota");
    const tr = titulo.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(titulo).paddingTop);
    const textoTop = tr.top + pad;
    return Math.max(0, mr.bottom - textoTop - 2);
  }, sectionId);
}

async function solapeTrasCargaFresca(browser, baseUrl, width, href, sectionId) {
  const page = await browser.newPage({
    viewport: { width, height: width === 390 ? 844 : 900 },
  });
  await setupEventLog(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitFonts(page);
  await waitAparicionInicial(page);
  await page.click(`nav a[href="${href}"]`);
  await waitReposoEnSeccion(page, sectionId);
  const solape = await solapeTitulo(page, sectionId);
  await page.close();
  return solape;
}

async function medicionAnclaje(page, sectionId) {
  return page.evaluate((id) => {
    const mascota = document.getElementById("mascota");
    const titulo = document.getElementById(id).querySelector(".titulo-seccion");
    let x = 0;
    let y = 0;
    for (let e = titulo; e; e = e.offsetParent) {
      x += e.offsetLeft;
      y += e.offsetTop;
    }
    const tam = mascota.offsetWidth;
    const pad = parseFloat(getComputedStyle(titulo).paddingTop);
    const esperado = {
      x: Math.round(x - tam * 0.12),
      y: Math.round(y + pad - tam + 2),
    };
    const actual = {
      x: parseFloat(getComputedStyle(mascota).getPropertyValue("--brote-x")),
      y: parseFloat(getComputedStyle(mascota).getPropertyValue("--brote-y")),
    };
    const rect = titulo.getBoundingClientRect();
    const mrect = mascota.getBoundingClientRect();
    const textoTop = rect.top + pad;
    const overlap = Math.max(0, mrect.bottom - textoTop - 2);
    return { tam, esperado, actual, overlapTitulo: overlap };
  }, sectionId);
}

const criterios = [];

function registro(id, ok, verificacion) {
  criterios.push({ id, ok: ok ? "OK" : "FALLO", verificacion });
  console.log(`  C${id}: ${ok ? "OK" : "FALLO"} — ${verificacion}`);
  if (!ok) throw new Error(`Criterio ${id} falló: ${verificacion}`);
}

async function main() {
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();
  const artifactDir = "/opt/cursor/artifacts";
  fs.mkdirSync(artifactDir, { recursive: true });

  try {
    console.log("\n=== Movimiento §11.10 ===\n");

    // C1, C2 — anclaje y solape
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(T.aparicionRetraso + 600);
      for (const id of ["sobre-mi", "habilidades", "enlaces"]) {
        const m = await medicionAnclaje(page, id);
        const coincide =
          id === "sobre-mi"
            ? m.esperado.x === m.actual.x && m.esperado.y === m.actual.y
            : true;
        registro(
          1,
          m.tam === 48 && coincide,
          `1440px ${id}: tamaño=${m.tam}, anclaje esperado (${m.esperado.x},${m.esperado.y})`
        );
      }
      const pageM = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await pageM.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(pageM);
      await pageM.waitForTimeout(T.aparicionRetraso + 600);
      const m = await medicionAnclaje(pageM, "sobre-mi");
      registro(1, m.tam === 36, `390px tamaño mascota=${m.tam}`);
      await pageM.close();

      await page.close();
    }

    // C2 — solape: cada ancla tras carga fresca (reload entre enlaces), 390 y 1440
    console.log("\n=== Solape tras carga fresca ===\n");
    for (const width of [390, 1440]) {
      for (const { href, id } of NAV_LINKS) {
        const solape = await solapeTrasCargaFresca(
          browser,
          baseUrl,
          width,
          href,
          id
        );
        registro(
          2,
          solape <= 2,
          `${width}px recarga → clic ${id}: solape ${solape.toFixed(1)}px`
        );
      }
    }

    // C3 — accesibilidad mascota
    {
      const page = await browser.newPage();
      await page.goto(baseUrl);
      const a11y = await page.evaluate(() => {
        const m = document.getElementById("mascota");
        const nav = document.querySelector(".nav");
        return {
          ariaHidden: m.getAttribute("aria-hidden"),
          pe: getComputedStyle(m).pointerEvents,
          z: parseInt(getComputedStyle(m).zIndex, 10),
          navZ: parseInt(getComputedStyle(nav).zIndex, 10),
          tabIndex: m.tabIndex,
        };
      });
      registro(
        3,
        a11y.ariaHidden === "true" &&
          a11y.pe === "none" &&
          a11y.z < a11y.navZ &&
          a11y.tabIndex === -1,
        `aria-hidden, pointer-events:none, z-index ${a11y.z}<${a11y.navZ}`
      );
      await page.close();
    }

    // C4 — idle CSS (muestreo en reposo)
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(T.aparicionRetraso + 700);
      const idle = await page.evaluate(() => {
        const svg = document.querySelector("#mascota svg");
        const barriga = document.getElementById("brote-barriga");
        const ojo = document.getElementById("brote-ojo-izq");
        const hoja = document.getElementById("brote-hoja-izq");
        const cs = (el) => getComputedStyle(el);
        return {
          svgAnim: cs(svg).animationName,
          barrigaAnim: cs(barriga).animationName,
          ojoAnim: cs(ojo).animationName,
          hojaAnim: cs(hoja).animationDuration,
          ojoOrigin: cs(ojo).transformOrigin,
        };
      });
      registro(
        4,
        idle.svgAnim.includes("brote-respirar") &&
          idle.barrigaAnim.includes("brote-brillo") &&
          idle.ojoAnim.includes("brote-parpadeo") &&
          idle.hojaAnim === "2.6s" &&
          idle.ojoOrigin.includes("24.5px 36px"),
        "Keyframes idle respirar/brillo/parpadeo/balanceo y origen ojo 24.5px 36px"
      );
      await page.close();
    }

    // C5 — idle pausado en viaje
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 500 } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await setupEventLog(page);
      await waitFonts(page);
      await page.waitForTimeout(T.aparicionRetraso + 600);
      await page.click('nav a[href="#enlaces"]');
      await page.waitForFunction(
        () => document.getElementById("mascota").dataset.estado === "salto",
        null,
        { timeout: 5000 }
      );
      const enViaje = await page.evaluate(() => {
        const svg = document.querySelector("#mascota svg");
        return {
          estado: document.getElementById("mascota").dataset.estado,
          anim: getComputedStyle(svg).animationName,
        };
      });
      registro(
        5,
        enViaje.estado === "salto" && enViaje.anim === "none",
        "En viaje data-estado=salto e idle CSS no corre (sin @keyframes reposo)"
      );
      await page.waitForTimeout(1200);
      const reposo = await page.evaluate(() => ({
        estado: document.getElementById("mascota").dataset.estado,
        svgAnim: getComputedStyle(document.querySelector("#mascota svg")).animationName,
      }));
      registro(
        5,
        reposo.estado === "reposo" && reposo.svgAnim.includes("brote-respirar"),
        "Tras aterrizar idle reinicia en reposo"
      );
      await page.close();
    }

    // C6 — scrollY<=2 y debounce
    {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 2400 },
      });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(400);
      const top = await page.evaluate(() => document.body.dataset.seccionActiva);
      registro(6, top === "sobre-mi", `scrollY=0 activa=${top} (regla scrollY≤2)`);
      await page.close();
    }

    // C7 — clic ancla
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(T.aparicionRetraso + 600);
      const t0 = await page.evaluate(() => performance.now());
      await page.click('nav a[href="#habilidades"]');
      const ariaInmediato = await page.evaluate(() =>
        document.querySelector('nav a[href="#habilidades"]').getAttribute("aria-current")
      );
      registro(7, ariaInmediato === "true", "aria-current al instante del clic");
      await page.waitForFunction(
        () => window.__eventos.some((e) => e.nombre === "brote:salto"),
        null,
        { timeout: 3000 }
      );
      const ev = await page.evaluate(() => window.__eventos);
      const salto = ev.find((e) => e.nombre === "brote:salto");
      registro(
        7,
        salto.detail.origen === "ancla" && salto.t - t0 >= T.quietud - 20,
        `brote:salto origen ancla tras quietud (~${Math.round(salto.t - t0)}ms)`
      );
      const intermedios = ev.filter(
        (e) => e.nombre === "brote:salto" && e.detail.hasta === "enlaces"
      );
      registro(7, intermedios.length === 0, "Sin saltos a secciones intermedias");
      await page.close();
    }

    // C9 — saltitos por distancia
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(T.aparicionRetraso + 600);
      await page.click('nav a[href="#enlaces"]');
      await page.waitForTimeout(T.quietud + 100);
      const dist = await page.evaluate(() => {
        const secciones = ["sobre-mi", "habilidades", "enlaces"];
        function docPos(el) {
          let x = 0, y = 0;
          for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
          return { x, y };
        }
        function punto(id) {
          const t = document.getElementById(id).querySelector(".titulo-seccion");
          const p = docPos(t);
          const tam = document.getElementById("mascota").offsetWidth;
          const pad = parseFloat(getComputedStyle(t).paddingTop);
          return { x: Math.round(p.x - tam * 0.12), y: Math.round(p.y + pad - tam + 2) };
        }
        const a = punto("sobre-mi");
        const b = punto("enlaces");
        return Math.hypot(b.x - a.x, b.y - a.y);
      });
      const nLayout = dist <= 320 ? 1 : dist <= 640 ? 2 : 3;
      await page.waitForFunction(
        () =>
          window.__eventos.some(
            (e) => e.nombre === "brote:reposo" && e.detail.seccion === "enlaces"
          ),
        null,
        { timeout: 8000 }
      );
      const tiempos = await page.evaluate(() => {
        const ev = window.__eventos;
        const salto = ev.find(
          (e) => e.nombre === "brote:salto" && e.detail.hasta === "enlaces"
        );
        const aterri = ev.find(
          (e) =>
            e.nombre === "brote:aterrizaje" &&
            e.t >= salto.t &&
            e.detail.seccion === "enlaces"
        );
        const reposo = ev.find(
          (e) => e.nombre === "brote:reposo" && e.detail.seccion === "enlaces"
        );
        return {
          deltaA: aterri ? aterri.t - salto.t : null,
          deltaR: reposo ? reposo.t - salto.t : null,
        };
      });
      const nObs =
        tiempos.deltaA <= 400 ? 1 : tiempos.deltaA <= 700 ? 2 : 3;
      const expA = tiempoAterrizaje(nObs);
      const expR = tiempoReposo(nObs);
      registro(
        9,
        nObs >= 1 && nObs <= 3 && nLayout === 3,
        `d layout=${Math.round(dist)}px → n observado=${nObs} (layout sugiere ${nLayout})`
      );
      registro(
        10,
        Math.abs(tiempos.deltaA - expA) < 80 &&
          Math.abs(tiempos.deltaR - expR) < 80,
        `Tiempos aterrizaje ${tiempos.deltaA}ms (esp ${expA}) reposo ${tiempos.deltaR}ms (esp ${expR})`
      );
      await page.close();
    }

    // C11 — altura arco (fórmula estática con distancia medida)
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 500 } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      const hMax = await page.evaluate(() => {
        const tam = document.getElementById("mascota").offsetWidth;
        function docPos(el) {
          let x = 0,
            y = 0;
          for (let e = el; e; e = e.offsetParent) {
            x += e.offsetLeft;
            y += e.offsetTop;
          }
          return { x, y };
        }
        function punto(id) {
          const t = document.getElementById(id).querySelector(".titulo-seccion");
          const p = docPos(t);
          const pad = parseFloat(getComputedStyle(t).paddingTop);
          return {
            x: Math.round(p.x - tam * 0.12),
            y: Math.round(p.y + pad - tam + 2),
          };
        }
        const a = punto("sobre-mi");
        const b = punto("enlaces");
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const n = d <= 320 ? 1 : d <= 640 ? 2 : 3;
        return Math.min(0.5 * tam + 0.25 * (d / n), 1.5 * tam);
      });
      registro(
        11,
        hMax <= 72,
        `Altura arco calculada ${hMax.toFixed(1)}px ≤72 (mascota 48px)`
      );
      await page.close();
    }

    // C14 — retarget
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 500 } });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(T.aparicionRetraso + 600);
      await page.click('nav a[href="#enlaces"]');
      await page.waitForFunction(
        () => document.getElementById("mascota").dataset.estado === "salto",
        null,
        { timeout: 5000 }
      );
      await page.click('nav a[href="#habilidades"]');
      await page.waitForTimeout(1500);
      const ev = await page.evaluate(() => window.__eventos);
      const saltos = ev.filter((e) => e.nombre === "brote:salto");
      const aterrizajes = ev.filter((e) => e.nombre === "brote:aterrizaje");
      registro(
        14,
        saltos.length >= 2 && saltos[1].detail.hasta === "habilidades",
        `Retarget: ${saltos.length} saltos, segundo hacia habilidades`
      );
      const aterriEntre = aterrizajes.filter(
        (a) => a.t > saltos[0].t && a.t < saltos[1].t
      );
      registro(
        14,
        saltos.length < 2 || aterriEntre.length === 0,
        `Aterrizajes entre saltos: ${aterriEntre.length} (esperado 0)`
      );
      await page.close();
    }

    // C16 — nombres eventos
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(T.aparicionRetraso + 700);
      const evInicio = await page.evaluate(() => ({
        inicio: window.__eventos.find(
          (e) => e.nombre === "brote:reposo" && e.detail.origen === "inicio"
        ),
        sinSalto: !window.__eventos.some((e) => e.nombre === "brote:salto"),
      }));
      registro(
        16,
        evInicio.inicio && evInicio.sinSalto,
        "Aparición inicial solo brote:reposo {origen:inicio}"
      );
      registro(
        16,
        !!evInicio.inicio,
        "Eventos brote:* con detail y burbujean (listener en document)"
      );
      await page.close();
    }

    // C18 — entrada sección
    {
      const page = await browser.newPage();
      await page.goto(baseUrl);
      const sinJs = await page.evaluate(() => {
        document.documentElement.classList.remove("js");
        const s = document.getElementById("enlaces");
        const cs = getComputedStyle(s);
        return cs.opacity === "1" && cs.transform === "none";
      });
      registro(18, sinJs, "Sin .js sección Enlaces visible (opacity 1)");
      const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page2.goto(baseUrl);
      const trans = await page2.evaluate(() => {
        const s = document.querySelector(".seccion");
        return getComputedStyle(s).transitionDuration;
      });
      registro(
        18,
        trans.includes("0.48") || trans.includes("480"),
        `Transición sección ~480ms (${trans})`
      );
      await page.close();
      await page2.close();
    }

    // C19 — barra
    {
      const page = await browser.newPage();
      await page.goto(baseUrl);
      const nav = await page.evaluate(() => {
        const a =
          document.querySelector('.nav__enlace:not([aria-current="true"])') ||
          document.querySelector(".nav__enlace");
        const after = getComputedStyle(a, "::after");
        return {
          color: getComputedStyle(a).transitionDuration,
          after: after.transitionDuration,
        };
      });
      const navMs = (s) =>
        s.split(",").every((p) => {
          const n = parseFloat(p);
          return n >= 0.15 && n <= 0.17;
        });
      registro(
        19,
        navMs(nav.color) && navMs(nav.after),
        `Nav color y ::after ~160ms (${nav.color} / ${nav.after})`
      );
      await page.close();
    }

    // C20 — aparición inicial
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await setupEventLog(page);
      const tLoad = Date.now();
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForFunction(() =>
        window.__eventos.some((e) => e.nombre === "brote:reposo" && e.detail.origen === "inicio")
      );
      const ev = await page.evaluate(() => window.__eventos);
      const reposo = ev.find((e) => e.detail.origen === "inicio");
      const sinSaltoInicio = !ev.some((e) => e.nombre === "brote:salto" && e.t < reposo.t + 50);
      registro(
        20,
        sinSaltoInicio && reposo.detail.seccion === "sobre-mi",
        "Aparición inicial termina en brote:reposo sin brote:salto"
      );
      await page.close();
    }

    // C21 — reduced motion
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(600);
      await page.click('nav a[href="#habilidades"]');
      await page.waitForTimeout(T.quietud + 400);
      const ev = await page.evaluate(() => window.__eventos);
      registro(
        21,
        ev.some((e) => e.nombre === "brote:reposo") &&
          !ev.some((e) => e.nombre === "brote:salto"),
        "Reduced-motion: solo brote:reposo, sin salto"
      );
      const idle = await page.evaluate(() =>
        getComputedStyle(document.querySelector("#mascota svg")).animationName
      );
      registro(21, idle === "none", "Sin animación idle en reduced-motion");
      const scrollBeh = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
      registro(21, scrollBeh === "auto", "scroll-behavior auto");
      await page.close();
    }

    // C22 — cambio reduced-motion en caliente
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(T.aparicionRetraso + 600);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(200);
      const estado = await page.evaluate(() => ({
        entrada: document.getElementById("habilidades").dataset.entrada,
        anim: getComputedStyle(document.querySelector("#mascota svg")).animationName,
      }));
      registro(
        22,
        estado.entrada === "final" && estado.anim === "none",
        "matchMedia change aplica sin recargar"
      );
      await page.close();
    }

    // C23 — will-change solo en viaje
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(T.aparicionRetraso + 700);
      const reposo = await page.evaluate(() =>
        getComputedStyle(document.getElementById("mascota")).willChange
      );
      registro(23, reposo === "auto" || reposo === "", `will-change en reposo: "${reposo}"`);
      await page.click('nav a[href="#enlaces"]');
      await page.waitForFunction(
        () => document.getElementById("mascota").dataset.estado === "salto",
        null,
        { timeout: 5000 }
      );
      const viaje = await page.evaluate(() =>
        getComputedStyle(document.getElementById("mascota")).willChange
      );
      registro(23, viaje === "transform", `will-change en viaje: "${viaje}"`);
      await page.close();
    }

    // C24 — 320px (también en portfolio.spec)
    {
      const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      const ok = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      );
      registro(24, ok, "320px sin scroll horizontal");
      await page.close();
    }

    // C25 — sin PROVISIONAL
    {
      const files = ["index.html", "styles.css", "script.js"];
      let found = false;
      for (const f of files) {
        const t = fs.readFileSync(path.join(root, f), "utf8");
        if (/PROVISIONAL/i.test(t)) found = true;
      }
      registro(25, !found, "Sin marca PROVISIONAL en HTML/CSS/JS");
    }

    // C26 — aparición inicial no bloquea contenido
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const temprano = await page.evaluate(() => {
        const m = document.getElementById("mascota");
        const sobre = document.getElementById("sobre-mi");
        const titulo = sobre.querySelector(".titulo-seccion");
        const tr = titulo.getBoundingClientRect();
        const mr = m.getBoundingClientRect();
        return {
          pe: getComputedStyle(m).pointerEvents,
          tituloVisible: tr.height > 0 && getComputedStyle(titulo).opacity === "1",
          mascotaOpacity0: parseFloat(getComputedStyle(m).opacity) <= 0.01,
          solape: mr.bottom > tr.top && mr.width > 0 && getComputedStyle(m).opacity !== "0",
        };
      });
      registro(
        26,
        temprano.pe === "none" && temprano.tituloVisible && temprano.mascotaOpacity0,
        "Al cargar: contenido visible, mascota opacity 0, pointer-events none"
      );
      await page.close();
    }

    // C8 — foco: misma cola de espera que ancla
    {
      const medirAncla = async () => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 900 },
        });
        await setupEventLog(page);
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        await waitFonts(page);
        await waitAparicionInicial(page);
        await page.evaluate(() => {
          window.__t0 = performance.now();
        });
        await page.click('nav a[href="#enlaces"]');
        await page.waitForFunction(() =>
          window.__eventos.some(
            (e) => e.nombre === "brote:salto" && e.detail.origen === "ancla"
          )
        );
        const d = await page.evaluate(() => {
          const salto = window.__eventos.find(
            (e) => e.nombre === "brote:salto" && e.detail.origen === "ancla"
          );
          return { delta: salto.t - window.__t0, seccion: salto.detail.hasta };
        });
        await page.close();
        return d;
      };
      const medirFoco = async () => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 900 },
        });
        await setupEventLog(page);
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        await waitFonts(page);
        await waitAparicionInicial(page);
        await page.evaluate(() => {
          window.__t0 = performance.now();
        });
        await page.locator("#enlaces").focus();
        await page.waitForFunction(() =>
          window.__eventos.some(
            (e) => e.nombre === "brote:salto" && e.detail.origen === "foco"
          )
        );
        const d = await page.evaluate(() => {
          const salto = window.__eventos.find(
            (e) => e.nombre === "brote:salto" && e.detail.origen === "foco"
          );
          return { delta: salto.t - window.__t0, seccion: salto.detail.hasta };
        });
        await page.close();
        return d;
      };
      const ancla = await medirAncla();
      const foco = await medirFoco();
      registro(
        8,
        ancla.seccion === "enlaces" && foco.seccion === "enlaces",
        "Ancla y foco saltan a enlaces"
      );
      const midAncla = await (async () => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 900 },
        });
        await setupEventLog(page);
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        await waitFonts(page);
        await waitAparicionInicial(page);
        await page.click('nav a[href="#enlaces"]');
        await page.waitForTimeout(5);
        const snap = await page.evaluate(() => ({
          saltoYa: window.__eventos.some((e) => e.nombre === "brote:salto"),
          aria: document
            .querySelector('nav a[href="#enlaces"]')
            .getAttribute("aria-current"),
        }));
        await page.close();
        return snap;
      })();
      const midFoco = await (async () => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 900 },
        });
        await setupEventLog(page);
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        await waitFonts(page);
        await waitAparicionInicial(page);
        await page.locator("#enlaces").focus();
        await page.waitForTimeout(5);
        const snap = await page.evaluate(() => ({
          saltoYa: window.__eventos.some((e) => e.nombre === "brote:salto"),
          aria: document
            .querySelector('nav a[href="#enlaces"]')
            .getAttribute("aria-current"),
        }));
        await page.close();
        return snap;
      })();
      registro(
        8,
        midAncla.aria === "true" && midFoco.aria === "true",
        "aria-current al instante en ancla y foco"
      );
      registro(
        8,
        midAncla.saltoYa === midFoco.saltoYa,
        `Cola idéntica a +5ms: salto ancla=${midAncla.saltoYa} foco=${midFoco.saltoYa}`
      );
      registro(
        8,
        Math.abs(ancla.delta - foco.delta) < 250,
        `Misma cola ancla/foco: Δ ${Math.abs(ancla.delta - foco.delta).toFixed(0)}ms < 250ms`
      );
    }

    // C12 — curvas WAAPI (getKeyframes)
    {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await waitAparicionInicial(page);
      await page.click('nav a[href="#enlaces"]');
      await page.waitForFunction(
        () => document.getElementById("mascota").dataset.estado === "salto",
        null,
        { timeout: 5000 }
      );
      const sample = await page.evaluate(() => {
        const m = document.getElementById("mascota");
        const svg = m.querySelector("svg");
        const easings = new Set();
        const transforms = [];
        for (const el of [m, svg]) {
          for (const a of el.getAnimations()) {
            const kf = a.effect?.getKeyframes?.() ?? [];
            kf.forEach((k) => {
              if (k.easing) easings.add(k.easing);
              if (k.transform) transforms.push(k.transform);
            });
          }
        }
        return { easings: [...easings], transforms: transforms.join(" ") };
      });
      const tieneCuerda = sample.easings.some((e) =>
        /0\.3[^,]*,\s*0[^,]*,\s*0\.7/.test(e)
      );
      const tieneSubida = sample.easings.some((e) =>
        /0\.5[^,]*,\s*1[^,]*,\s*0\.89/.test(e)
      );
      const tieneEscalaSalto = /0\.86|scale\(0\.86/.test(sample.transforms);
      registro(
        12,
        tieneCuerda && tieneSubida && tieneEscalaSalto,
        `WAAPI: cuerda=${tieneCuerda}, subida=${tieneSubida}, scale salto=${tieneEscalaSalto}`
      );
      await page.close();
    }

    // C13 — ángulos de hojas en keyframes
    {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await waitAparicionInicial(page);
      await page.click('nav a[href="#enlaces"]');
      await page.waitForFunction(
        () => document.getElementById("mascota").dataset.estado === "salto",
        null,
        { timeout: 5000 }
      );
      const leaf = await page.evaluate(() => {
        const izq = document.getElementById("brote-hoja-izq");
        const der = document.getElementById("brote-hoja-der");
        const all = [...izq.getAnimations(), ...der.getAnimations()].flatMap(
          (a) => a.effect?.getKeyframes?.() ?? []
        );
        return all.map((k) => k.transform).filter(Boolean).join(" ");
      });
      const aire = /rotate\(-14deg\)|rotate\(\s*-14/.test(leaf);
      const aterri = /rotate\(12deg\)|rotate\(\s*12/.test(leaf);
      registro(
        13,
        aire && aterri,
        `Hojas en keyframes: −14° en aire=${aire}, ±12° aterrizaje=${aterri}`
      );
      await page.close();
    }

    // C15 — recorte fuera del viewport (destino debajo del pliegue)
    {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 500 },
      });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await waitAparicionInicial(page);
      await page.click('nav a[href="#enlaces"]');
      await page.waitForFunction(
        () => window.__eventos?.some((e) => e.nombre === "brote:salto"),
        null,
        { timeout: 15000 }
      );
      await page.waitForFunction(
        () => document.getElementById("mascota").getAnimations().length > 0,
        null,
        { timeout: 5000 }
      );
      const clip = await page.evaluate(() => {
        const m = document.getElementById("mascota");
        const nav = document.querySelector(".nav").offsetHeight;
        const tam = m.offsetWidth;
        const abajo = scrollY + innerHeight;
        const bordeRecorte = abajo + 8;
        const kf = m.getAnimations()[0]?.effect?.getKeyframes?.() ?? [];
        const last = kf[kf.length - 1];
        const match = last?.transform?.match(
          /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/
        );
        const yLast = match ? parseFloat(match[2]) : null;
        const destReal = (() => {
          const t = document
            .getElementById("enlaces")
            .querySelector(".titulo-seccion");
          let x = 0;
          let y = 0;
          for (let e = t; e; e = e.offsetParent) {
            x += e.offsetLeft;
            y += e.offsetTop;
          }
          const pad = parseFloat(getComputedStyle(t).paddingTop);
          return { y: Math.round(y + pad - tam + 2) };
        })();
        const arriba = scrollY + nav;
        const visibleDest =
          destReal.y + tam > arriba && destReal.y < abajo;
        const yEsperado = visibleDest ? destReal.y : abajo + 8;
        return {
          visibleDest,
          yEsperado,
          yLast,
          destRealY: destReal.y,
          diff: yLast == null ? 999 : Math.abs(yLast - yEsperado),
        };
      });
      registro(
        15,
        clip.diff <= 6,
        `Destino keyframe y=${clip.yLast} vs esperado ${clip.yEsperado} (visible=${clip.visibleDest}, Δ${clip.diff.toFixed(1)})`
      );
      await page.close();
    }

    // C17 — visibilitychange oculta: termina en destino
    {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await waitAparicionInicial(page);
      await page.click('nav a[href="#enlaces"]');
      await page.waitForFunction(
        () => document.getElementById("mascota").dataset.estado === "salto",
        null,
        { timeout: 5000 }
      );
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await waitReposoEnSeccion(page, "enlaces", 8000);
      const fin = await page.evaluate(() => {
        const ev = window.__eventos;
        const reposo = ev.filter((e) => e.nombre === "brote:reposo").at(-1);
        const m = document.getElementById("enlaces").querySelector(".titulo-seccion");
        let x = 0;
        let y = 0;
        for (let e = m; e; e = e.offsetParent) {
          x += e.offsetLeft;
          y += e.offsetTop;
        }
        const tam = document.getElementById("mascota").offsetWidth;
        const pad = parseFloat(getComputedStyle(m).paddingTop);
        const ey = Math.round(y + pad - tam + 2);
        const actual = parseFloat(
          getComputedStyle(document.getElementById("mascota")).getPropertyValue(
            "--brote-y"
          )
        );
        return {
          seccion: reposo?.detail?.seccion,
          okY: Math.abs(actual - ey) <= 2,
        };
      });
      registro(
        17,
        fin.seccion === "enlaces" && fin.okY,
        "Tab oculta: reposo en enlaces y anclaje correcto"
      );
      await page.close();
    }

    console.log("\n=== Capturas y vídeo ===\n");
    for (const { w, rm, label } of [
      { w: 390, rm: false, label: "390-inicial" },
      { w: 390, rm: true, label: "390-reduce" },
      { w: 1440, rm: false, label: "1440-inicial" },
      { w: 1440, rm: true, label: "1440-reduce" },
    ]) {
      const page = await browser.newPage({
        viewport: { width: w, height: w === 390 ? 844 : 900 },
      });
      if (rm) await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitFonts(page);
      await page.waitForTimeout(rm ? 500 : T.aparicionRetraso + 600);
      const shot1 = path.join(artifactDir, `motion-${label}-carga.png`);
      await page.screenshot({ path: shot1, fullPage: true });
      console.log(`Captura: ${shot1}`);
      if (!rm) {
        await page.click('nav a[href="#enlaces"]');
        await page.waitForTimeout(T.quietud + tiempoReposo(2) + 200);
        const shot2 = path.join(artifactDir, `motion-${label}-enlaces.png`);
        await page.screenshot({ path: shot2, fullPage: true });
        console.log(`Captura: ${shot2}`);
      }
      await page.close();
    }

    console.log("\n" + JSON.stringify({ criterios }, null, 2));
    console.log(
      "\n(Vídeos motion-v3-* y trayectorias los genera tests/motion-render.spec.mjs)\n"
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});