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
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
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

async function runViewport(browser, baseUrl, width, artifactDir) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await assertNoHorizontalScroll(page);

  const navLinks = [
    { href: "#sobre-mi", id: "sobre-mi" },
    { href: "#habilidades", id: "habilidades" },
    { href: "#enlaces", id: "enlaces" },
  ];

  for (const { href, id } of navLinks) {
    await page.click(`nav a[href="${href}"]`);
    await page.waitForFunction(
      (sectionId) => document.body.dataset.seccionActiva === sectionId,
      id,
      { timeout: 5000 }
    );
    const inView = await page.evaluate((sectionId) => {
      const el = document.getElementById(sectionId);
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight * 0.6;
    }, id);
    if (!inView) {
      throw new Error(`La sección ${id} no quedó visible tras el nav (${width}px)`);
    }
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForFunction(
    () => document.body.dataset.seccionActiva === "enlaces",
    null,
    { timeout: 5000 }
  );

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(
    () => document.body.dataset.seccionActiva === "sobre-mi",
    null,
    { timeout: 5000 }
  );

  await assertNoHorizontalScroll(page);

  const shot = path.join(artifactDir, `portfolio-${width}px.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await page.close();
  return shot;
}

async function main() {
  const artifactDir = "/opt/cursor/artifacts";
  fs.mkdirSync(artifactDir, { recursive: true });

  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();

  const results = [];
  try {
    for (const w of [375, 1440]) {
      const shot = await runViewport(browser, baseUrl, w, artifactDir);
      results.push({ width: w, screenshot: shot, ok: true });
      console.log(`OK viewport ${w}px -> ${shot}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(JSON.stringify({ passed: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
