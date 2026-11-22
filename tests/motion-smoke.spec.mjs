import { chromium } from "playwright";
import { startServer, setupEventLog, waitAparicionInicial } from "./motion-helpers.mjs";

const SECCIONES = ["habilidades", "proyectos", "enlaces", "sobre-mi"];

function comprobar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
  console.log(`OK ${mensaje}`);
}

async function esperarReposo(page, seccion) {
  await page.waitForFunction(
    (id) => {
      const mascota = document.getElementById("mascota");
      return (
        document.body.dataset.seccionActiva === id &&
        mascota.dataset.estado === "reposo" &&
        mascota.getAnimations().length === 0
      );
    },
    seccion,
    { timeout: 10000 }
  );
}

async function comprobarNavegacion(page, ancho) {
  for (const seccion of SECCIONES) {
    const saltosAntes = await page.evaluate(
      () => window.__eventos.filter((e) => e.nombre === "brote:salto").length
    );
    await page.click(`nav a[href="#${seccion}"]`);
    await page.waitForFunction(
      (total) =>
        window.__eventos.filter((e) => e.nombre === "brote:salto").length >
        total,
      saltosAntes,
      { timeout: 10000 }
    );
    await esperarReposo(page, seccion);
    const resultado = await page.evaluate((id) => {
      const mascota = document.getElementById("mascota");
      const rect = mascota.getBoundingClientRect();
      const saltos = window.__eventos.filter((e) => e.nombre === "brote:salto");
      return {
        saltos: saltos.length,
        activa: document.body.dataset.seccionActiva,
        visible: rect.bottom > 0 && rect.top < innerHeight,
        anclada: id === "sobre-mi" ? rect.width > 0 : true,
      };
    }, seccion);
    comprobar(resultado.saltos > saltosAntes, `${ancho}px menú ${seccion}: hay salto`);
    comprobar(
      resultado.activa === seccion && resultado.visible && resultado.anclada,
      `${ancho}px menú ${seccion}: mascota visible y en reposo`
    );
  }
}

async function comprobarScroll(page, ancho) {
  await page.mouse.wheel(0, 10000);
  await esperarReposo(page, "enlaces");
  await page.mouse.wheel(0, -10000);
  await esperarReposo(page, "sobre-mi");
  comprobar(true, `${ancho}px scroll: navega arriba y abajo`);
}

async function comprobarMovimientoReducido(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setupEventLog(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitAparicionInicial(page);
  await page.click('nav a[href="#enlaces"]');
  await esperarReposo(page, "enlaces");
  const saltos = await page.evaluate(
    () => window.__eventos.filter((e) => e.nombre === "brote:salto").length
  );
  comprobar(saltos === 0, "movimiento reducido: navega sin saltos");
  await page.close();
}

async function main() {
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();
  try {
    for (const [ancho, alto] of [
      [390, 844],
      [1440, 900],
    ]) {
      const page = await browser.newPage({ viewport: { width: ancho, height: alto } });
      await setupEventLog(page);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitAparicionInicial(page);
      await comprobarNavegacion(page, ancho);
      await comprobarScroll(page, ancho);
      await page.close();
    }
    await comprobarMovimientoReducido(browser, baseUrl);
    console.log("OK movimiento funcional");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
