import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const SCROLL_WIDTHS = [320, 375, 390, 640, 1024, 1440];
const SCREENSHOT_WIDTHS = [320, 640, 1280];
const ARTIFACT_DIR = path.join(root, "artifacts");

const CONTRAST_PAIRS = [
  { name: "bruma-50 sobre selva-800", fg: "#F3F7EF", bg: "#14453A", min: 4.5 },
  { name: "laguna-200 sobre selva-800", fg: "#A8F0E6", bg: "#14453A", min: 4.5 },
  { name: "piedra-300 sobre selva-800", fg: "#B4B9A6", bg: "#14453A", min: 4.5 },
  { name: "sol-400 sobre selva-800", fg: "#F2C14E", bg: "#14453A", min: 4.5 },
  { name: "laguna-400 sobre selva-800", fg: "#2EC4B6", bg: "#14453A", min: 4.5 },
];

function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const lin = (c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function verifyContrast() {
  const results = CONTRAST_PAIRS.map((pair) => {
    const ratio = contrastRatio(pair.fg, pair.bg);
    const ok = ratio >= pair.min;
    return { ...pair, ratio: Number(ratio.toFixed(2)), ok };
  });
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    throw new Error(`Contraste insuficiente: ${JSON.stringify(failed)}`);
  }
  return results;
}

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

async function assertNoHorizontalScroll(page) {
  const ok = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  if (!ok) {
    const dims = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      navLeft: Math.min(
        ...[...document.querySelectorAll(".nav__enlace")].map(
          (link) => link.getBoundingClientRect().left
        )
      ),
      navRight: Math.max(
        ...[...document.querySelectorAll(".nav__enlace")].map(
          (link) => link.getBoundingClientRect().right
        )
      ),
    }));
    if (dims.navLeft < 0 || dims.navRight > dims.innerWidth) {
      throw new Error(`Navegación cortada: ${JSON.stringify(dims)}`);
    }
    throw new Error(`Scroll horizontal: ${JSON.stringify(dims)}`);
  }
}

async function assertSingleNavActive(page, expectedId) {
  const estado = await page.evaluate(() => {
    const currents = [...document.querySelectorAll('.nav__enlace[aria-current="true"]')];
    return {
      seccionActiva: document.body.dataset.seccionActiva,
      currentHrefs: currents.map((a) => a.getAttribute("href")),
    };
  });
  if (estado.seccionActiva !== expectedId) {
    throw new Error(
      `data-seccion-activa=${estado.seccionActiva}, esperado ${expectedId}`
    );
  }
  if (estado.currentHrefs.length !== 1) {
    throw new Error(
      `aria-current en ${estado.currentHrefs.length} enlaces: ${estado.currentHrefs.join(", ")}`
    );
  }
  if (estado.currentHrefs[0] !== `#${expectedId}`) {
    throw new Error(
      `aria-current en ${estado.currentHrefs[0]}, esperado #${expectedId}`
    );
  }
}

async function assertMascotaSinSolapeTitulo(page, sectionId) {
  const solape = await page.evaluate((id) => {
    const titulo = document.getElementById(id).querySelector(".titulo-seccion");
    const m = document.getElementById("mascota");
    const tr = titulo.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(titulo).paddingTop);
    const textoTop = tr.top + pad;
    return Math.max(0, mr.bottom - textoTop - 2);
  }, sectionId);
  if (solape > 2) {
    throw new Error(
      `Mascota solapa título de ${sectionId} en ${solape.toFixed(1)}px (>2)`
    );
  }
}

async function runNavInteraction(browser, baseUrl, width) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await page.waitForFunction(
    () => document.getElementById("mascota")?.dataset.estado === "reposo",
    null,
    { timeout: 8000 }
  );

  await assertNoHorizontalScroll(page);

  const navLinks = [
    { href: "#sobre-mi", id: "sobre-mi" },
    { href: "#habilidades", id: "habilidades" },
    { href: "#proyectos", id: "proyectos" },
    { href: "#enlaces", id: "enlaces" },
  ];

  for (const { href, id } of navLinks) {
    await page.click(`nav a[href="${href}"]`);
    await page.waitForFunction(
      () => document.getElementById("mascota")?.dataset.estado === "reposo",
      null,
      { timeout: 8000 }
    );
    await assertMascotaSinSolapeTitulo(page, id);
    await page.waitForFunction(
      (sectionId) => document.body.dataset.seccionActiva === sectionId,
      id,
      { timeout: 5000 }
    );
    await page.waitForFunction(
      (sectionId) => {
        const el = document.getElementById(sectionId);
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight * 0.6;
      },
      id,
      { timeout: 5000 }
    );
    await assertSingleNavActive(page, id);
  }

  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForFunction(
    () => document.body.dataset.seccionActiva === "enlaces",
    null,
    { timeout: 5000 }
  );
  await assertSingleNavActive(page, "enlaces");

  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(
    () => document.body.dataset.seccionActiva === "sobre-mi",
    null,
    { timeout: 5000 }
  );
  await assertSingleNavActive(page, "sobre-mi");

  await assertNoHorizontalScroll(page);
  await page.close();
}

/** Captura alineada con design/capturas: carga inicial, sin hover residual del test. */
async function captureReferenceScreenshot(
  browser,
  baseUrl,
  width,
  artifactDir,
  reducedMotion = false
) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.emulateMedia({
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await page.waitForFunction(
    () => document.body.dataset.seccionActiva === "sobre-mi",
    null,
    { timeout: 5000 }
  );
  await assertSingleNavActive(page, "sobre-mi");
  await assertNoHorizontalScroll(page);
  await page.click('nav a[href="#proyectos"]');
  await page.waitForFunction(
    () =>
      document.querySelector("#proyectos .esquema__lista")?.dataset.esquema ===
      "final"
  );
  await page.click('nav a[href="#enlaces"]');
  await page.waitForFunction(
    () => document.body.dataset.seccionActiva === "enlaces"
  );
  await page.click('nav a[href="#proyectos"]');
  await page.waitForFunction(
    () => document.body.dataset.seccionActiva === "proyectos"
  );

  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  const motion = reducedMotion ? "-reduced-motion" : "";
  const shot = path.join(artifactDir, `proyectos-${width}px${motion}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await page.close();
  return shot;
}

async function assertProjects(browser, baseUrl) {
  const markupPage = await browser.newPage();
  await markupPage.emulateMedia({ reducedMotion: "reduce" });
  await markupPage.goto(baseUrl, { waitUntil: "networkidle" });
  const project = await markupPage.evaluate(() => {
    const section = document.getElementById("proyectos");
    const previous = section.previousElementSibling.previousElementSibling;
    const next = section.nextElementSibling.nextElementSibling;
    const link = section.querySelector(".proyecto .boton");
    const steps = [...section.querySelectorAll(".paso")].map((step) => ({
      title: step.querySelector(".paso__titulo").childNodes[0].textContent,
      detail: step
        .querySelector(".paso__detalle")
        .textContent.replace(/\s+/g, " ")
        .trim(),
      index: step.style.getPropertyValue("--paso"),
    }));
    return {
      previous: previous?.id,
      next: next?.id,
      text: section.textContent.replace(/\s+/g, " ").trim(),
      href: link?.getAttribute("href"),
      target: link?.getAttribute("target"),
      rel: link?.getAttribute("rel"),
      label: link?.getAttribute("aria-label"),
      steps,
    };
  });
  const copy = [
    "Plantilla de GitHub",
    "ai-agents-template",
    "Una plantilla reutilizable para trabajar con agentes en la nube en Cursor y GitHub Copilot.",
    "Da a los agentes las instrucciones y las herramientas para configurar por su cuenta el entorno de desarrollo de un proyecto desde cero.",
    "Ver en GitHub",
    "Cómo funciona",
    "Creas tu repositorio a partir de la plantilla.",
    "Un único archivo de reglas para los agentes.",
    "Instrucciones reutilizables para las tareas habituales.",
    "Un agente explora el proyecto y prepara su entorno desde cero.",
    "Cursor y GitHub Copilot arrancan con el entorno preparado, y CI revisa las skills en cada pull request.",
  ];
  if (
    project.previous !== "habilidades" ||
    project.next !== "enlaces" ||
    copy.some((fragment) => !project.text.includes(fragment)) ||
    project.href !==
      "https://github.com/daniel-saezv/ai-agents-template" ||
    project.target !== "_blank" ||
    !project.rel.split(/\s+/).includes("noopener") ||
    project.steps.length !== 5 ||
    project.steps.some((step, index) => step.index !== String(index))
  ) {
    throw new Error(`Contenido o estructura de Proyectos inválida: ${JSON.stringify(project)}`);
  }
  await markupPage.close();

  const noJs = await browser.newPage({
    javaScriptEnabled: false,
    viewport: { width: 640, height: 800 },
  });
  await noJs.goto(baseUrl, { waitUntil: "networkidle" });
  const noJsState = await noJs.evaluate(() => {
    const node = document.querySelector("#proyectos .paso__nodo");
    const stem = getComputedStyle(
      document.querySelector("#proyectos .paso"),
      "::before"
    ).clipPath;
    return {
      nodeOpacity: getComputedStyle(node).opacity,
      nodeTransform: getComputedStyle(node).transform,
      stem,
      movementClass: document.documentElement.classList.contains("js-movimiento"),
    };
  });
  if (
    noJsState.movementClass ||
    noJsState.nodeOpacity !== "1" ||
    noJsState.nodeTransform !== "none" ||
    !["inset(0%)", "inset(0px)"].includes(noJsState.stem)
  ) {
    throw new Error(`Proyectos sin JS no está en estado final: ${JSON.stringify(noJsState)}`);
  }
  await noJs.close();
}

async function assertProjectMotion(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const pending = await page.evaluate(() => ({
    movementClass: document.documentElement.classList.contains("js-movimiento"),
    state: document.querySelector("#proyectos .esquema__lista").dataset.esquema,
    opacity: getComputedStyle(
      document.querySelector("#proyectos .paso__nodo")
    ).opacity,
  }));
  if (!pending.movementClass || pending.state !== "pendiente" || pending.opacity !== "0") {
    throw new Error(`Estado inicial animable inválido: ${JSON.stringify(pending)}`);
  }

  await page.evaluate(() => {
    window.__cambiosEsquema = [];
    const list = document.querySelector("#proyectos .esquema__lista");
    new MutationObserver(() => {
      window.__cambiosEsquema.push({
        state: list.dataset.esquema,
        t: performance.now(),
      });
    }).observe(list, { attributes: true, attributeFilter: ["data-esquema"] });
  });
  await page.locator("#proyectos .esquema").scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector("#proyectos .esquema__lista").dataset.esquema === "final"
  );
  await page.waitForTimeout(1000);
  const final = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("#proyectos .paso__nodo")];
    const titles = [...document.querySelectorAll("#proyectos .paso__titulo")];
    const detail = [...document.querySelectorAll("#proyectos .paso__detalle")];
    const stems = [...document.querySelectorAll("#proyectos .paso")].slice(0, -1);
    const style = (el, property) => getComputedStyle(el).getPropertyValue(property);
    return {
      changes: window.__cambiosEsquema,
      nodes: nodes.map((el) => ({
        opacity: style(el, "opacity"),
        transform: style(el, "transform"),
        duration: style(el, "transition-duration"),
        delay: style(el, "transition-delay"),
        origin: style(el, "transform-origin"),
      })),
      texts: titles.map((el, i) => ({
        opacity: style(el, "opacity"),
        titleDelay: style(el, "transition-delay"),
        detailDelay: style(detail[i], "transition-delay"),
      })),
      stems: stems.map((el) => ({
        clip: getComputedStyle(el, "::before").clipPath,
        duration: getComputedStyle(el, "::before").transitionDuration,
        delay: getComputedStyle(el, "::before").transitionDelay,
      })),
    };
  });
  const expectedNodes = [0, 0.14, 0.28, 0.42, 0.56];
  const expectedTexts = [0.04, 0.18, 0.32, 0.46, 0.6];
  const expectedStems = [0.06, 0.2, 0.34, 0.48];
  if (
    final.changes.length !== 1 ||
    final.changes[0].state !== "final" ||
    final.nodes.some(
      (node, index) =>
        node.opacity !== "1" ||
        node.transform !== "none" ||
        node.duration !== "0.28s, 0.28s" ||
        Math.abs(parseFloat(node.delay.split(",")[0]) - expectedNodes[index]) >
          0.001
    ) ||
    final.texts.some(
      (text, index) =>
        text.opacity !== "1" ||
        Math.abs(parseFloat(text.titleDelay.split(",")[0]) - expectedTexts[index]) >
          0.001 ||
        Math.abs(parseFloat(text.detailDelay.split(",")[0]) - expectedTexts[index]) >
          0.001
    ) ||
    final.stems.some(
      (stem, index) =>
        !["inset(0%)", "inset(0px)"].includes(stem.clip) ||
        stem.duration !== "0.14s" ||
        Math.abs(parseFloat(stem.delay) - expectedStems[index]) > 0.001
    )
  ) {
    throw new Error(`Movimiento del esquema inválido: ${JSON.stringify(final)}`);
  }
  await page.locator("#sobre-mi").scrollIntoViewIfNeeded();
  await page.locator("#proyectos .esquema").scrollIntoViewIfNeeded();
  await page.waitForTimeout(50);
  if (
    (await page.evaluate(() => window.__cambiosEsquema.length)) !== 1
  ) {
    throw new Error("La secuencia del esquema se repitió al volver a vista");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () => !document.documentElement.classList.contains("js-movimiento")
  );
  const reducedMid = await page.evaluate(() => ({
    state: document.querySelector("#proyectos .esquema__lista").dataset.esquema,
    movementClass: document.documentElement.classList.contains("js-movimiento"),
    transitions: getComputedStyle(
      document.querySelector("#proyectos .paso__nodo")
    ).transitionDuration,
  }));
  if (
    reducedMid.state !== "final" ||
    reducedMid.movementClass ||
    reducedMid.transitions !== "0s"
  ) {
    throw new Error(
      `Activar reduced motion no saltó al final: ${JSON.stringify(reducedMid)}`
    );
  }
  await page.close();

  const focusPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await focusPage.goto(baseUrl, { waitUntil: "networkidle" });
  await focusPage.evaluate(() => {
    document.querySelector("#proyectos .boton").focus();
  });
  const focused = await focusPage.evaluate(() => ({
    state: document.querySelector("#proyectos .esquema__lista").dataset.esquema,
    movementClass: document.documentElement.classList.contains("js-movimiento"),
  }));
  if (focused.state !== "final" || focused.movementClass) {
    throw new Error(`Focusin no saltó al estado final: ${JSON.stringify(focused)}`);
  }
  await focusPage.close();

  const reducedPage = await browser.newPage({
    viewport: { width: 640, height: 800 },
  });
  await reducedPage.emulateMedia({ reducedMotion: "reduce" });
  await reducedPage.goto(baseUrl, { waitUntil: "networkidle" });
  const reduced = await reducedPage.evaluate(() => ({
    movementClass: document.documentElement.classList.contains("js-movimiento"),
    state: document.querySelector("#proyectos .esquema__lista").dataset.esquema,
    opacity: getComputedStyle(
      document.querySelector("#proyectos .paso__nodo")
    ).opacity,
  }));
  if (reduced.movementClass || reduced.state !== "final" || reduced.opacity !== "1") {
    throw new Error(`Reduced motion inicial inválido: ${JSON.stringify(reduced)}`);
  }
  await reducedPage.close();

  const brotePage = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await brotePage.goto(baseUrl, { waitUntil: "networkidle" });
  const tope = await brotePage.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    document.addEventListener(
      "brote:aterrizaje",
      (event) => {
        event.stopImmediatePropagation();
      },
      true
    );
    const lista = document.querySelector("#proyectos .esquema__lista");
    const tarjeta = document.querySelector("#proyectos .esquema");
    if (lista.dataset.esquema !== "pendiente") {
      return { error: "el esquema ya no estaba pendiente antes del salto" };
    }
    return new Promise((resolve) => {
      let tDisparo = 0;
      let tFinal = 0;
      const marcas = [];
      new MutationObserver(() => {
        marcas.push({ estado: lista.dataset.esquema, t: performance.now() });
        if (lista.dataset.esquema === "final" && !tFinal) {
          tFinal = performance.now();
        }
      }).observe(lista, {
        attributes: true,
        attributeFilter: ["data-esquema"],
      });
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting) && !tDisparo) {
            tDisparo = performance.now();
            io.disconnect();
          }
        },
        { threshold: 0.2 }
      );
      io.observe(tarjeta);
      document.dispatchEvent(new CustomEvent("brote:salto"));
      tarjeta.scrollIntoView({ block: "center", behavior: "instant" });
      const inicio = performance.now();
      const timer = setInterval(() => {
        if (!tFinal && performance.now() - inicio < 1500) return;
        clearInterval(timer);
        resolve({
          delta: tDisparo && tFinal ? tFinal - tDisparo : null,
          estado: lista.dataset.esquema,
          marcas: marcas.map((marca) => ({
            estado: marca.estado,
            ms: Math.round(marca.t - (tDisparo || inicio)),
          })),
        });
      }, 20);
    });
  });
  console.log(`Tope de Brote sin aterrizaje: ${JSON.stringify(tope)}`);
  if (
    tope.error ||
    tope.estado !== "final" ||
    tope.delta == null ||
    tope.delta < 380 ||
    tope.delta > 520 ||
    tope.marcas.some((marca) => marca.estado === "final" && marca.ms < 380)
  ) {
    throw new Error(
      `El tope de 400 ms no arrancó el esquema sin aterrizaje: ${JSON.stringify(tope)}`
    );
  }
  await brotePage.close();
}

function cercaDe(valor, esperado, margen) {
  return Math.abs(valor - esperado) <= margen;
}

async function medirCaja(page, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.waitForFunction(() => document.fonts.status === "loaded");
  return page.evaluate(() => {
    const boton = document.querySelector("#proyectos .boton");
    const caja = boton.getBoundingClientRect();
    const links = [...document.querySelectorAll(".nav__enlace")];
    const primero = links[0].getBoundingClientRect();
    const ultimo = links.at(-1).getBoundingClientRect();
    const titulo = document.querySelector("#proyectos .esquema__titulo");
    const csTitulo = getComputedStyle(titulo);
    const pasos = [...document.querySelectorAll("#proyectos .paso")];
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      nombre: getComputedStyle(document.querySelector(".nav__nombre")).display,
      enlace: {
        fontSize: getComputedStyle(links[0]).fontSize,
        left: primero.left,
        right: ultimo.right,
      },
      boton: {
        display: getComputedStyle(boton).display,
        width: caja.width,
        height: caja.height,
      },
      tituloEsquema: {
        fontFamily: csTitulo.fontFamily,
        fontSize: csTitulo.fontSize,
        color: csTitulo.color,
      },
      counterReset: getComputedStyle(
        document.querySelector("#proyectos .esquema__lista")
      ).counterReset,
      numeros: pasos.map((paso) => {
        const tituloPaso = paso.querySelector(".paso__titulo");
        const antes = getComputedStyle(tituloPaso, "::before");
        return {
          content: antes.content,
          color: antes.color,
          titulo: getComputedStyle(tituloPaso).color,
          increment: getComputedStyle(paso).counterIncrement,
          opacity: antes.opacity,
        };
      }),
      formas: pasos.map((paso) =>
        [...paso.querySelector(".paso__nodo svg").children].map(
          (forma) =>
            `${forma.tagName}:${[...forma.attributes]
              .map((attr) => `${attr.name}=${attr.value}`)
              .join(",")}`
        )
      ),
    };
  });
}

async function assertMaqueta(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const anchos = [320, 640, 1280];
  const medidas = {};
  for (const ancho of anchos) {
    medidas[ancho] = await medirCaja(page, ancho);
    const boton = medidas[ancho].boton;
    const enlace = medidas[ancho].enlace;
    console.log(
      `Medidas ${ancho}px: botón ${boton.width.toFixed(1)}×${boton.height.toFixed(1)} ${boton.display}; nav nombre=${medidas[ancho].nombre} enlaces x=${enlace.left.toFixed(1)}–${enlace.right.toFixed(1)} ${enlace.fontSize}`
    );
  }
  await page.close();

  const estrecho = medidas[320];
  if (estrecho.scrollWidth > estrecho.innerWidth) {
    throw new Error(
      `Scroll horizontal a 320 px: ${JSON.stringify({
        scrollWidth: estrecho.scrollWidth,
        innerWidth: estrecho.innerWidth,
        enlace: estrecho.enlace,
      })}`
    );
  }
  if (
    estrecho.nombre !== "none" ||
    estrecho.enlace.fontSize !== "14px" ||
    !cercaDe(estrecho.enlace.left, 17, 8) ||
    !cercaDe(estrecho.enlace.right, 303, 8)
  ) {
    throw new Error(`Nav a 320 px distinto de la maqueta: ${JSON.stringify(estrecho.enlace)} nombre=${estrecho.nombre}`);
  }
  if (medidas[640].nombre === "none" || medidas[1280].nombre === "none") {
    throw new Error("El nombre del nav se oculta desde 640 px");
  }

  for (const ancho of [640, 1280]) {
    const boton = medidas[ancho].boton;
    if (
      boton.display !== "inline-flex" ||
      !cercaDe(boton.width, 189, 16) ||
      !cercaDe(boton.height, 52, 3)
    ) {
      throw new Error(`Botón a ${ancho}px distinto de 189×52: ${JSON.stringify(boton)}`);
    }
  }

  const numeros = medidas[1280].numeros;
  if (
    !/paso/.test(medidas[1280].counterReset) ||
    numeros.length !== 5 ||
    numeros.some(
      (numero) =>
        numero.content !== 'counter(paso) ". "' ||
        numero.increment !== "paso 1" ||
        numero.opacity !== "1" ||
        !numero.color.startsWith("rgb(180, 185, 166)") ||
        !numero.titulo.startsWith("rgb(243, 247, 239)")
    )
  ) {
    throw new Error(
      `Números o color de los pasos: ${JSON.stringify({
        counterReset: medidas[1280].counterReset,
        numeros,
      })}`
    );
  }
  const titulo = medidas[1280].tituloEsquema;
  if (
    titulo.fontSize !== "18px" ||
    !titulo.color.startsWith("rgb(143, 214, 148)") ||
    !/Fraunces/i.test(titulo.fontFamily)
  ) {
    throw new Error(`Título del esquema distinto de la maqueta: ${JSON.stringify(titulo)}`);
  }

  const formas = [
    [
      "path:d=M12 4 C 17 8, 18 14, 12 20 C 6 14, 7 8, 12 4 Z,fill=rgba(143,214,148,.25),stroke=#8FD694,stroke-width=1.6,stroke-linejoin=round",
      "path:d=M12 8 V17,stroke=#8FD694,stroke-width=1.4,stroke-linecap=round",
    ],
    [
      "path:d=M6 3.5 H14.5 L18.5 7.5 V20.5 H6 Z,fill=rgba(168,240,230,.12),stroke=#A8F0E6,stroke-width=1.6,stroke-linejoin=round",
      "path:d=M9 11 H15.5 M9 14 H15.5 M9 17 H13,stroke=#A8F0E6,stroke-width=1.4,stroke-linecap=round",
    ],
    [
      "ellipse:cx=8,cy=15,rx=4.5,ry=3.5,fill=rgba(46,196,182,.3),stroke=#2EC4B6,stroke-width=1.5",
      "ellipse:cx=16.5,cy=16,rx=4,ry=3,fill=rgba(242,193,78,.3),stroke=#F2C14E,stroke-width=1.5",
      "ellipse:cx=12.5,cy=9,rx=3.8,ry=3,fill=rgba(46,196,182,.3),stroke=#2EC4B6,stroke-width=1.5",
    ],
    [
      "path:d=M12 21 V12,stroke=#8FD694,stroke-width=1.8,stroke-linecap=round",
      "path:d=M12 13 C 8 13, 5 10, 5 6 C 9 6, 12 9, 12 13 Z,fill=#3FA36B",
      "path:d=M12 11 C 15 11, 19 9, 19 4.5 C 15 4.5, 12 7, 12 11 Z,fill=#8FD694",
    ],
    [
      "circle:cx=12,cy=12,r=7,fill=rgba(242,193,78,.2),stroke=#F2C14E,stroke-width=1.6",
      "path:d=M8.6 12.2 L11 14.6 L15.6 9.6,stroke=#F2C14E,stroke-width=1.9,fill=none,stroke-linecap=round,stroke-linejoin=round",
    ],
  ];
  if (JSON.stringify(medidas[1280].formas) !== JSON.stringify(formas)) {
    throw new Error(`SVG del esquema distinto de la maqueta: ${JSON.stringify(medidas[1280].formas)}`);
  }
}

function finTransicion(delay, duration) {
  const retrasos = delay.split(",").map((parte) => parseFloat(parte));
  const duraciones = duration.split(",").map((parte) => parseFloat(parte));
  return Math.max(
    ...retrasos.map((retraso, indice) => (retraso + (duraciones[indice] || 0)) * 1000)
  );
}

async function assertCriteriosEsquema(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const estilos = await page.evaluate(() => {
    const nodos = [...document.querySelectorAll("#proyectos .paso__nodo")];
    const titulos = [...document.querySelectorAll("#proyectos .paso__titulo")];
    const detalles = [...document.querySelectorAll("#proyectos .paso__detalle")];
    const tallos = [...document.querySelectorAll("#proyectos .paso")].slice(0, -1);
    const leer = (el, pseudo) => {
      const cs = getComputedStyle(el, pseudo);
      return {
        property: cs.transitionProperty,
        delay: cs.transitionDelay,
        duration: cs.transitionDuration,
        width: cs.width,
      };
    };
    return {
      nodos: nodos.map((el) => leer(el)),
      titulos: titulos.map((el) => leer(el)),
      detalles: detalles.map((el) => leer(el)),
      tallos: tallos.map((el) => leer(el, "::before")),
    };
  });
  const permitidas = new Set(["opacity", "transform", "clip-path"]);
  const piezas = [
    ...estilos.nodos,
    ...estilos.titulos,
    ...estilos.detalles,
    ...estilos.tallos,
  ];
  const ajenas = piezas.filter((pieza) =>
    pieza.property.split(",").some((nombre) => !permitidas.has(nombre.trim()))
  );
  const fin = Math.max(...piezas.map((pieza) => finTransicion(pieza.delay, pieza.duration)));
  const finUltimo = finTransicion(
    estilos.detalles.at(-1).delay,
    estilos.detalles.at(-1).duration
  );
  const clipFuera = [
    ...estilos.nodos,
    ...estilos.titulos,
    ...estilos.detalles,
  ].filter((pieza) => pieza.property.includes("clip-path"));
  if (
    ajenas.length ||
    clipFuera.length ||
    estilos.tallos.length !== 4 ||
    estilos.tallos.some(
      (tallo) => tallo.property !== "clip-path" || !cercaDe(parseFloat(tallo.width), 2, 0.2)
    ) ||
    fin > 920.5 ||
    !cercaDe(finUltimo, 920, 1)
  ) {
    throw new Error(
      `Transiciones del esquema (38, 41): fin=${fin} ultimo=${finUltimo} ${JSON.stringify(estilos)}`
    );
  }

  const secuencia = await page.evaluate(() => {
    const lista = document.querySelector("#proyectos .esquema__lista");
    const delEsquema = () =>
      document.getAnimations().filter((anim) => {
        const el = anim.effect && anim.effect.target;
        return el instanceof Element && !!el.closest("#proyectos .esquema");
      });
    for (const anim of delEsquema()) anim.cancel();
    lista.dataset.esquema = "pendiente";
    lista.getBoundingClientRect();
    lista.dataset.esquema = "final";
    lista.getBoundingClientRect();
    const anims = delEsquema().filter((anim) => anim.playState !== "idle");
    for (const anim of anims) anim.pause();
    const solapesEn = (ms) => {
      for (const anim of anims) anim.currentTime = ms;
      const cajas = [];
      for (const [i, paso] of [...lista.querySelectorAll(":scope > .paso")].entries()) {
        for (const tipo of ["nodo", "titulo", "detalle"]) {
          const el = paso.querySelector(`.paso__${tipo}`);
          const cs = getComputedStyle(el);
          cajas.push({
            tipo,
            i,
            opacity: Number(cs.opacity),
            rect: el.getBoundingClientRect(),
          });
        }
      }
      const hits = [];
      for (let a = 0; a < cajas.length; a++) {
        for (let b = a + 1; b < cajas.length; b++) {
          const A = cajas[a];
          const B = cajas[b];
          if (A.opacity < 0.02 || B.opacity < 0.02) continue;
          if (A.tipo === "nodo" && B.tipo === "nodo") continue;
          if (
            A.i === B.i &&
            ((A.tipo === "titulo" && B.tipo === "detalle") ||
              (A.tipo === "detalle" && B.tipo === "titulo"))
          ) {
            continue;
          }
          const w =
            Math.min(A.rect.right, B.rect.right) - Math.max(A.rect.left, B.rect.left);
          const h =
            Math.min(A.rect.bottom, B.rect.bottom) - Math.max(A.rect.top, B.rect.top);
          if (w > 0.5 && h > 0.5) {
            hits.push({ a: `${A.tipo}${A.i}`, b: `${B.tipo}${B.i}`, w, h });
          }
        }
      }
      return hits;
    };
    const clipEn = (ms) => {
      for (const anim of anims) anim.currentTime = ms;
      return [...lista.querySelectorAll(":scope > .paso")]
        .slice(0, -1)
        .map((paso) => getComputedStyle(paso, "::before").clipPath);
    };
    const muestras = [0, 200, 450, 700, 920].map((ms) => ({
      ms,
      solapes: solapesEn(ms),
    }));
    const tallos = [0, 1, 2, 3].map((i) => {
      const ms = 140 * i + 59;
      return { i, ms, clip: clipEn(ms)[i] };
    });
    return { nAnims: anims.length, muestras, tallos };
  });
  const solapes = secuencia.muestras.filter((muestra) => muestra.solapes.length);
  const tallosAbiertos = secuencia.tallos.filter((tallo) => {
    const partes = String(tallo.clip).match(/inset\(([^)]+)\)/i);
    if (!partes) return true;
    const tokens = partes[1].trim().split(/\s+/);
    const bottom = tokens.length >= 3 ? tokens[2] : tokens[0];
    return !(/%$/.test(bottom) && parseFloat(bottom) >= 99.9);
  });
  if (!secuencia.nAnims || solapes.length || tallosAbiertos.length) {
    throw new Error(
      `Solapes o clip-path del esquema (42, 43): ${JSON.stringify(secuencia)}`
    );
  }

  const entrada = await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    const seccion = document.getElementById("proyectos");
    const lista = document.querySelector("#proyectos .esquema__lista");
    lista.dataset.esquema = "pendiente";
    seccion.dataset.entrada = "inicial";
    const tarjeta = document.querySelector("#proyectos .esquema");
    return new Promise((resolve) => {
      let tEntrada = 0;
      let tFinal = 0;
      new MutationObserver(() => {
        if (seccion.dataset.entrada === "final" && !tEntrada) {
          tEntrada = performance.now();
        }
      }).observe(seccion, {
        attributes: true,
        attributeFilter: ["data-entrada"],
      });
      new MutationObserver(() => {
        if (lista.dataset.esquema === "final" && !tFinal) {
          tFinal = performance.now();
        }
      }).observe(lista, {
        attributes: true,
        attributeFilter: ["data-esquema"],
      });
      tarjeta.scrollIntoView({ block: "center", behavior: "instant" });
      const inicio = performance.now();
      const timer = setInterval(() => {
        if (!(tEntrada && tFinal) && performance.now() - inicio < 1500) return;
        clearInterval(timer);
        resolve({
          delta: tEntrada && tFinal ? tFinal - tEntrada : null,
          entrada: seccion.dataset.entrada,
          esquema: lista.dataset.esquema,
        });
      }, 15);
    });
  });
  console.log(`Entrada del esquema (33): ${JSON.stringify(entrada)}`);
  if (
    entrada.esquema !== "final" ||
    entrada.delta == null ||
    entrada.delta < 100 ||
    entrada.delta > 180
  ) {
    throw new Error(
      `El esquema no queda final a +120 ms de la entrada: ${JSON.stringify(entrada)}`
    );
  }
  await page.close();
}

async function main() {
  const artifactDir = ARTIFACT_DIR;
  fs.mkdirSync(artifactDir, { recursive: true });

  const contrast = verifyContrast();
  console.log("Contraste WCAG (pares de spec.md):");
  contrast.forEach((c) => {
    console.log(`  ${c.name}: ${c.ratio}:1 — ${c.ok ? "AA ✔" : "FAIL"}`);
  });

  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();

  const scrollResults = [];
  const screenshotResults = [];

  try {
    for (const w of SCROLL_WIDTHS) {
      const page = await browser.newPage({ viewport: { width: w, height: 800 } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await assertNoHorizontalScroll(page);
      const dims = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      scrollResults.push({ width: w, ...dims, ok: true });
      console.log(
        `OK scroll horizontal ${w}px (scrollWidth=${dims.scrollWidth}, innerWidth=${dims.innerWidth})`
      );
      await page.close();
    }

    await runNavInteraction(browser, baseUrl, 375);
    console.log("OK viewport interactivo 375px");

    await assertProjects(browser, baseUrl);
    console.log("OK contenido, estructura y estados sin JS");
    await assertProjectMotion(browser, baseUrl);
    console.log("OK movimiento del esquema y reduced motion");
    await assertMaqueta(browser, baseUrl);
    console.log("OK botón, nav y números de la maqueta");
    await assertCriteriosEsquema(browser, baseUrl);
    console.log("OK criterios 33, 38, 41, 42 y 43");

    for (const w of SCREENSHOT_WIDTHS) {
      const shot = await captureReferenceScreenshot(
        browser,
        baseUrl,
        w,
        artifactDir
      );
      screenshotResults.push({ width: w, screenshot: shot });
      console.log(`OK captura referencia ${w}px -> ${shot}`);
    }
    const reducedShot = await captureReferenceScreenshot(
      browser,
      baseUrl,
      640,
      artifactDir,
      true
    );
    screenshotResults.push({ width: 640, reducedMotion: true, screenshot: reducedShot });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(
    JSON.stringify(
      {
        passed: true,
        contrast,
        scrollResults,
        screenshotResults,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});