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
    const link = section.querySelector(".proyecto__boton");
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
    document.querySelector("#proyectos .proyecto__boton").focus();
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
  await brotePage.evaluate(() => {
    document.dispatchEvent(new CustomEvent("brote:salto"));
    document.querySelector("#proyectos .esquema").scrollIntoView({
      block: "center",
    });
  });
  await brotePage.waitForTimeout(100);
  if (
    (await brotePage
      .locator("#proyectos .esquema__lista")
      .getAttribute("data-esquema")) !== "pendiente"
  ) {
    throw new Error("El esquema no esperó a Brote durante su salto");
  }
  await brotePage.waitForTimeout(450);
  if (
    (await brotePage
      .locator("#proyectos .esquema__lista")
      .getAttribute("data-esquema")) !== "final"
  ) {
    await brotePage.evaluate(() => {
      document.dispatchEvent(new CustomEvent("brote:aterrizaje"));
    });
  }
  await brotePage.waitForFunction(
    () =>
      document.querySelector("#proyectos .esquema__lista").dataset.esquema ===
      "final",
    null,
    { timeout: 1000 }
  );
  await brotePage.close();
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