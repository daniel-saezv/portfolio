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
const SCREENSHOT_WIDTHS = [390, 1440];

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
    }));
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
async function captureReferenceScreenshot(browser, baseUrl, width, artifactDir) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.fonts.status === "loaded");
  await page.waitForFunction(
    () => document.body.dataset.seccionActiva === "sobre-mi",
    null,
    { timeout: 5000 }
  );
  await assertSingleNavActive(page, "sobre-mi");
  await assertNoHorizontalScroll(page);

  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  const shot = path.join(artifactDir, `portfolio-${width}px.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await page.close();
  return shot;
}

async function main() {
  const artifactDir = "/opt/cursor/artifacts";
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