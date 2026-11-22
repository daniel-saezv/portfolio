import { chromium } from "playwright";
import { startServer, setupEventLog, waitAparicionInicial } from "./motion-helpers.mjs";

const SECCIONES = ["habilidades", "proyectos", "enlaces", "proyectos", "sobre-mi"];

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
    const trayectoria = await page.evaluate(() => {
      const mascota = document.getElementById("mascota");
      const animaciones = [
        ...mascota.getAnimations(),
        ...mascota.querySelector("svg").getAnimations(),
      ];
      const tiempos = animaciones.map((a) => a.currentTime);
      const salto = window.__eventos.filter((e) => e.nombre === "brote:salto").at(-1);
      const llegada = (salto.detail.retarget ? 0 : 80) +
        salto.detail.n * 240 + (salto.detail.n - 1) * 40;
      let anterior = null;
      let velocidadMax = 0;
      let solapes = 0;
      let primerSolape = null;
      let derivaCarril = 0;
      const titulo = document.querySelector(`#${salto.detail.hasta} .titulo-seccion`);
      const carril = Math.max(4, titulo.getBoundingClientRect().left - mascota.offsetWidth - 8);
      const salida = (salto.detail.retarget ? 0 : 80) + 0.4 * 240;
      const vuelta = llegada - 0.4 * 240;
      const bloques = [...document.querySelectorAll(
        "#sobre-mi p, #habilidades p, .habilidad, #proyectos .proyecto__tipo, #proyectos .proyecto__texto, #proyectos .paso__titulo, #proyectos .paso__detalle, .enlace-ext"
      )];
      animaciones.forEach((a) => a.pause());
      for (let t = 0; t <= llegada; t += 4) {
        animaciones.forEach((a) => { a.currentTime = t; });
        const rect = mascota.getBoundingClientRect();
        if (anterior !== null) {
          velocidadMax = Math.max(velocidadMax, Math.abs(rect.left - anterior) / 4);
        }
        anterior = rect.left;
        if (salto.detail.carril && t >= salida && t <= vuelta) {
          derivaCarril = Math.max(derivaCarril, Math.abs(rect.left - carril));
        }
        const bloque = bloques.find((el) => {
          const texto = el.getBoundingClientRect();
          return Math.min(rect.right, texto.right) - Math.max(rect.left, texto.left) > 2 &&
            Math.min(rect.bottom, texto.bottom) - Math.max(rect.top, texto.top) > 2;
        });
        if (bloque && t >= salida) {
          solapes++;
          primerSolape ??= { t, texto: bloque.textContent.slice(0, 50), left: rect.left, top: rect.top };
        }
      }
      animaciones.forEach((a, i) => {
        a.currentTime = tiempos[i];
        a.play();
      });
      return { velocidadMax, solapes, primerSolape, derivaCarril };
    });
    comprobar(
      trayectoria.velocidadMax <= 1,
      `${ancho}px menú ${seccion}: velocidad lateral ${trayectoria.velocidadMax.toFixed(2)}px/ms ≤ 1`
    );
    comprobar(
      trayectoria.derivaCarril <= 1,
      `${ancho}px menú ${seccion}: deriva del carril ${trayectoria.derivaCarril.toFixed(2)}px ≤ 1`
    );
    comprobar(
      trayectoria.solapes === 0,
      `${ancho}px menú ${seccion}: carril y regreso sin cruzar texto` +
        (trayectoria.primerSolape ? ` (${JSON.stringify(trayectoria.primerSolape)})` : "")
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
