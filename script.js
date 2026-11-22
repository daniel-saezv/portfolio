(function () {
  const secciones = [...document.querySelectorAll("[data-seccion]")];
  const enlacesNav = [...document.querySelectorAll(".nav__enlace")];
  const mascota = document.getElementById("mascota");
  const anio = document.getElementById("anio");

  if (!secciones.length || !mascota) {
    return;
  }

  const svg = mascota.querySelector("svg");
  const hojaI = document.getElementById("brote-hoja-izq");
  const hojaD = document.getElementById("brote-hoja-der");
  const reducido = matchMedia("(prefers-reduced-motion: reduce)");
  const seccionProyectos = document.getElementById("proyectos");
  const esquema = document.querySelector("#proyectos .esquema");
  const listaEsquema = document.querySelector("#proyectos .esquema__lista");
  let registrarEntradaEsquema = () => {};

  if (anio) {
    anio.textContent = String(new Date().getFullYear());
  }

  const T = {
    anticipacion: 80,
    salto: 240,
    contacto: 40,
    aterrizaje: 160,
    hojas: 240,
    debounceScroll: 150,
    quietud: 120,
    topeEspera: 1500,
    aparicionRetraso: 360,
    caida: 260,
    aparicionOpacidad: 160,
    rmSalida: 120,
    rmEntrada: 160,
  };
  const E = {
    cuerda: "cubic-bezier(0.3, 0, 0.7, 1)",
    subida: "cubic-bezier(0.5, 1, 0.89, 1)",
    bajada: "cubic-bezier(0.11, 0, 0.5, 0)",
    anticipa: "cubic-bezier(0.33, 0, 0.67, 1)",
    estira: "cubic-bezier(0.33, 1, 0.68, 1)",
    impacto: "cubic-bezier(0.32, 0, 0.67, 0)",
    salida: "cubic-bezier(0.22, 1, 0.36, 1)",
    seno: "cubic-bezier(0.37, 0, 0.63, 1)",
    entrada: "cubic-bezier(0.4, 0, 1, 1)",
    desacel: "cubic-bezier(0, 0, 0.2, 1)",
  };
  const F = {
    anticipa: [1.1, 0.9],
    salto: [0.86, 1.18],
    previo: [0.92, 1.08],
    contacto: [1.1, 0.9],
    aterrizaje: [1.2, 0.8],
    rebote: [0.96, 1.04],
  };
  const HOJA = { salto: 14, aterrizaje: 12 };

  let activa = null;
  let bloqueo = null;
  let anims = [];
  let viajando = false;
  let viajeUsaCarril = false;
  let viajeDestino = null;
  let tAterrizaje = 0;
  let aterrizado = true;

  function docPos(el) {
    let x = 0;
    let y = 0;
    for (let e = el; e; e = e.offsetParent) {
      x += e.offsetLeft;
      y += e.offsetTop;
    }
    return { x, y };
  }

  function puntoDeAnclaje(id) {
    const t = document.getElementById(id).querySelector(".titulo-seccion");
    const p = docPos(t);
    const tam = mascota.offsetWidth;
    const pad = parseFloat(getComputedStyle(t).paddingTop);
    return {
      x: Math.round(p.x - tam * 0.12),
      y: Math.round(p.y + pad - tam + 2),
    };
  }

  function xTextoDoc(seccionId) {
    const t = document
      .getElementById(seccionId)
      .querySelector(".titulo-seccion");
    return t.getBoundingClientRect().left + scrollX;
  }

  function bloquesTextoLinea() {
    return [
      ...document.querySelectorAll(
        "#sobre-mi p, #habilidades p, .habilidad, #proyectos .proyecto__tipo, #proyectos .proyecto__texto, #proyectos .paso__titulo, #proyectos .paso__detalle, .enlace-ext"
      ),
    ];
  }

  function finalizarEntrada(seccion) {
    if (seccion === seccionProyectos && seccion.dataset.entrada !== "final") {
      registrarEntradaEsquema();
    }
    seccion.dataset.entrada = "final";
  }

  function prepararEsquema() {
    if (!seccionProyectos || !esquema || !listaEsquema) return;

    let inicioEntrada = -Infinity;
    let disparado = false;
    let iniciado = false;
    let broteEnAire = false;
    let esperaAire = null;
    let esperaInicio = null;
    let ioEsquema = null;

    registrarEntradaEsquema = () => {
      if (inicioEntrada === -Infinity) inicioEntrada = performance.now();
    };

    function irAFinalSinAnimar() {
      esperaAire?.cancelar();
      if (esperaInicio) {
        clearTimeout(esperaInicio);
        esperaInicio = null;
      }
      document.documentElement.classList.remove("js-movimiento");
      listaEsquema.dataset.esquema = "final";
      finalizarEntrada(seccionProyectos);
      disparado = true;
      iniciado = true;
      ioEsquema?.disconnect();
    }

    function arrancarTransiciones() {
      if (iniciado) return;
      iniciado = true;
      listaEsquema.dataset.esquema = "final";
    }

    function programarInicio(tDisparo) {
      const lanzar = () => {
        const retraso = Math.max(
          0,
          Math.max(tDisparo, inicioEntrada + 120) - performance.now()
        );
        esperaInicio = setTimeout(() => {
          esperaInicio = null;
          arrancarTransiciones();
        }, retraso);
      };
      if (!broteEnAire) {
        queueMicrotask(lanzar);
        return;
      }
      const tope = setTimeout(() => {
        esperaAire = null;
        queueMicrotask(lanzar);
      }, 400);
      esperaAire = {
        cancelar() {
          clearTimeout(tope);
          esperaAire = null;
        },
        seguir() {
          clearTimeout(tope);
          esperaAire = null;
          queueMicrotask(lanzar);
        },
      };
    }

    function disparar() {
      if (disparado) return;
      disparado = true;
      ioEsquema?.disconnect();
      if (seccionProyectos.dataset.entrada !== "final") {
        finalizarEntrada(seccionProyectos);
      }
      programarInicio(performance.now());
    }

    document.addEventListener("brote:salto", () => {
      broteEnAire = true;
    });
    document.addEventListener("brote:aterrizaje", () => {
      broteEnAire = false;
      esperaAire?.seguir();
    });

    if (!reducido.matches) {
      document.documentElement.classList.add("js-movimiento");
      ioEsquema = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) disparar();
        },
        { threshold: 0.2 }
      );
      ioEsquema.observe(esquema);
    } else {
      irAFinalSinAnimar();
    }

    seccionProyectos.addEventListener("focusin", () => {
      finalizarEntrada(seccionProyectos);
      if (!iniciado) irAFinalSinAnimar();
    });

    reducido.addEventListener("change", () => {
      if (reducido.matches) irAFinalSinAnimar();
    });
  }

  prepararEsquema();

  function barridoCruzaTexto(oDoc, dDoc, tam) {
    const bloques = bloquesTextoLinea();
    const oV = { x: oDoc.x - scrollX, y: oDoc.y - scrollY };
    const dV = { x: dDoc.x - scrollX, y: dDoc.y - scrollY };
    const muestras = [];
    let cruza = false;
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const l = oV.x + t * (dV.x - oV.x);
      const top = oV.y + t * (dV.y - oV.y);
      const brote = { l, r: l + tam, t: top, b: top + tam };
      muestras.push({
        t,
        l: Math.round(l * 100) / 100,
        tY: Math.round(top * 100) / 100,
        r: Math.round((l + tam) * 100) / 100,
        b: Math.round((top + tam) * 100) / 100,
      });
      for (const el of bloques) {
        const r = el.getBoundingClientRect();
        const ox = Math.min(brote.r, r.right) - Math.max(brote.l, r.left);
        const oy = Math.min(brote.b, r.bottom) - Math.max(brote.t, r.top);
        if (ox > 2 && oy > 2) {
          cruza = true;
          break;
        }
      }
      if (cruza) break;
    }
    return {
      cruza,
      oV,
      dV,
      muestras,
      bloques: bloques.map((el) => {
        const r = el.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom };
      }),
    };
  }

  function offsetXAddActual() {
    const r = mascota.getBoundingClientRect();
    const a = posDocDesdeCss();
    return Math.round(r.left + scrollX - a.x);
  }

  const tr = (p) =>
    `translate(${Math.round(p.x * 1000) / 1000}px, ${Math.round(p.y * 1000) / 1000}px)`;

  function fijar(p) {
    mascota.style.setProperty("--brote-x", Math.round(p.x) + "px");
    mascota.style.setProperty("--brote-y", Math.round(p.y) + "px");
  }

  function cancelar() {
    clearTimeout(tAterrizaje);
    aterrizado = true;
    anims.forEach((a) => {
      a.onfinish = null;
      a.cancel();
    });
    anims = [];
    viajando = false;
    mascota.classList.remove("en-viaje");
    mascota.style.willChange = "";
  }

  function colocar(id) {
    cancelar();
    fijar(puntoDeAnclaje(id));
    mascota.style.opacity = "";
    mascota.dataset.estado = "reposo";
  }

  function emitir(nombre, detalle) {
    mascota.dispatchEvent(
      new CustomEvent(nombre, { detail: detalle, bubbles: true })
    );
  }

  function continuarPendiente(hasta) {
    if (!pendiente) return;
    if (pendiente.hasta === hasta) {
      cancelarEspera();
      return;
    }
    const espera = Math.max(
      0,
      T.quietud - (performance.now() - ultimoScrollT)
    );
    clearTimeout(tQuieto);
    if (espera === 0) {
      queueMicrotask(lanzarPendiente);
    } else {
      tQuieto = setTimeout(lanzarPendiente, espera);
    }
  }

  const mtx = (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform);
  const ang = (el) => {
    const m = mtx(el);
    return Math.round((Math.atan2(m.b, m.a) * 18000) / Math.PI) / 100;
  };

  function viajar(desde, hasta, origen) {
    const destReal = puntoDeAnclaje(hasta);
    const mV = mtx(mascota);
    const mF = mtx(svg);
    const a0I = ang(hojaI);
    const a0D = ang(hojaD);
    const opac = parseFloat(getComputedStyle(mascota).opacity) || 1;
    const retarget =
      viajando ||
      mascota.dataset.estado === "salto" ||
      mascota.getAnimations().length > 0;
    const refCarril =
      viajando && viajeDestino ? viajeDestino : hasta;
    const xLaneRef = Math.max(
      4,
      xTextoDoc(refCarril) - scrollX - mascota.offsetWidth - 8
    );
    const xAddInicio = viajando ? offsetXAddActual() : 0;
    const laneLeftNow =
      Math.abs(mascota.getBoundingClientRect().left - xLaneRef) <= 2.5;
    const estabaEnCarril =
      retarget &&
      (laneLeftNow ||
        Math.abs(mascota.getBoundingClientRect().left - xLaneRef) <= 1.5);
    cancelar();
    const o0 = {
      x: Math.round(mV.e * 1000) / 1000,
      y: Math.round(mV.f * 1000) / 1000,
    };
    fijar(o0);

    if (reducido.matches) {
      return fundido(hasta, origen, opac);
    }

    const s = mascota.offsetWidth;
    const nav = document.querySelector(".nav");
    const arriba = scrollY + nav.offsetHeight;
    const abajo = scrollY + innerHeight;
    const visibleDoc = (p) => p.y + s > arriba && p.y < abajo;
    const recorta = (p) =>
      visibleDoc(p)
        ? p
        : { x: p.x, y: p.y < arriba ? scrollY - s - 8 : abajo + 8 };
    const navOrigen = origen === "ancla" || origen === "foco";
    if (
      navOrigen &&
      !visibleDoc(o0) &&
      !visibleDoc(destReal)
    ) {
      colocar(hasta);
      const desdeEvento = retarget && viajeDestino ? viajeDestino : desde;
      viajeDestino = null;
      emitir("brote:salto", {
        desde: desdeEvento,
        hasta,
        origen,
        n: 0,
        h: 0,
      });
      emitir("brote:aterrizaje", { seccion: hasta });
      emitir("brote:reposo", { seccion: hasta, origen });
      return;
    }
    if (!navOrigen && !visibleDoc(o0) && !visibleDoc(destReal)) {
      colocar(hasta);
      const desdeEvento = retarget && viajeDestino ? viajeDestino : desde;
      viajeDestino = null;
      emitir("brote:salto", {
        desde: desdeEvento,
        hasta,
        origen,
        n: 0,
        h: 0,
      });
      emitir("brote:aterrizaje", { seccion: hasta });
      emitir("brote:reposo", { seccion: hasta, origen });
      return;
    }
    const o =
      navOrigen || visibleDoc(o0) ? o0 : recorta(o0);
    const d =
      navOrigen || visibleDoc(destReal) ? destReal : recorta(destReal);
    fijar(o);
    const oPant = { x: o.x - scrollX, y: o.y - scrollY };
    const dPant = { x: d.x - scrollX, y: d.y - scrollY };
    const dist = Math.hypot(d.x - o.x, d.y - o.y);
    let nS = dist <= 320 ? 1 : dist <= 640 ? 2 : 3;
    let recto = false;
    let useCarril = false;
    let barrido = null;
    if (nS === 1) {
      barrido = barridoCruzaTexto(o, d, s);
      if (barrido.cruza) {
        nS = 2;
        useCarril = true;
      } else {
        recto = true;
        useCarril = false;
      }
    } else {
      useCarril = true;
    }
    if (retarget && estabaEnCarril) {
      recto = false;
      useCarril = true;
      if (nS === 1) nS = 2;
    }
    nS = Math.max(1, nS);
    const hMin = 0.5 * s;
    const hCap = Math.max(hMin, 1.5 * s - (s <= 36 ? 3 : 4));
    const h = Math.max(
      hMin,
      Math.min(0.5 * s + 0.25 * (dist / nS), hCap)
    );
    const xAdd0 = retarget ? xAddInicio : saltoSinA ? offsetXAddActual() : 0;
    const A = retarget || saltoSinA ? 0 : T.anticipacion;
    saltoSinA = false;
    const llegada = A + nS * T.salto + (nS - 1) * T.contacto;
    const total = llegada + T.hojas;
    const off = (t) => t / total;
    const sc = ([x, y]) => `scale(${x}, ${y})`;

    const xTexto = xTextoDoc(hasta);
    const xCarril = Math.max(4, xTexto - s - 8);
    const xCarrilV = Math.max(4, xTexto - scrollX - s - 8);
    const enCarrilAhora =
      (retarget && estabaEnCarril) ||
      (useCarril &&
        !recto &&
        Math.abs(mascota.getBoundingClientRect().left - xCarrilV) <= 1.5);
    const posSaltoFraccion = (hopI, frac) => {
      const p0 = {
        x: o.x + (hopI / nS) * (d.x - o.x),
        y: o.y + (hopI / nS) * (d.y - o.y),
      };
      const p1 = {
        x: o.x + ((hopI + 1) / nS) * (d.x - o.x),
        y: o.y + ((hopI + 1) / nS) * (d.y - o.y),
      };
      return {
        x: p0.x + frac * (p1.x - p0.x),
        y: p0.y + frac * (p1.y - p0.y),
      };
    };
    const tSalidaCarril = A + 0.4 * T.salto;
    // Criterio 26 de motion-v4 (scroll a 390 px hacia Proyectos): al 60 % del
    // último salto Brote cruza el texto; la vuelta al ancla espera al 99 %.
    const tVueltaCarril =
      A + (nS - 1) * (T.salto + T.contacto) + 0.99 * T.salto;
    const pSalidaCarril = posSaltoFraccion(0, 0.4);
    const pVueltaCarril = posSaltoFraccion(nS - 1, 0.99);

    const kV = [{ offset: 0, transform: tr(o), easing: E.cuerda }];
    const kArc = [{ offset: 0, transform: "translateY(0px)", easing: E.cuerda }];
    const kF = [{ offset: 0, transform: sc([mF.a, mF.d]), easing: E.anticipa }];
    if (A) {
      kV.push({ offset: off(A), transform: tr(o) });
      kArc.push({ offset: off(A), transform: "translateY(0px)" });
      kF.push({ offset: off(A), transform: sc(F.anticipa) });
    }
    for (let i = 0; i < nS; i++) {
      const t0 = A + i * (T.salto + T.contacto);
      const tMid = t0 + T.salto / 2;
      const t1 = t0 + T.salto;
      const fracEnd = (i + 1) / nS;
      const fracMid = (i + 0.5) / nS;
      const p1 = {
        x: o.x + (d.x - o.x) * fracEnd,
        y: o.y + (d.y - o.y) * fracEnd,
      };
      const pMid = {
        x: o.x + (d.x - o.x) * fracMid,
        y: o.y + (d.y - o.y) * fracMid,
      };
      if (i > 0) {
        kV.push({ offset: off(t0), transform: kV.at(-1).transform });
        kArc.push({ offset: off(t0), transform: "translateY(0px)" });
        kF.push({ offset: off(t0), transform: sc(F.contacto) });
      }
      kV.at(-1).easing = E.cuerda;
      kV.push({ offset: off(tMid), transform: tr(pMid), easing: E.cuerda });
      kV.push({ offset: off(t1), transform: tr(p1), easing: E.cuerda });
      kArc.at(-1).easing = E.subida;
      kArc.push({
        offset: off(tMid),
        transform: `translateY(${-h}px)`,
        easing: E.bajada,
      });
      kArc.push({ offset: off(t1), transform: "translateY(0px)" });
      kF.at(-1).easing = E.estira;
      kF.push({
        offset: off(t0 + 0.2 * T.salto),
        transform: sc(F.salto),
        easing: E.subida,
      });
      kF.push({
        offset: off(t0 + 0.8 * T.salto),
        transform: sc(F.previo),
        easing: E.impacto,
      });
      kF.push({
        offset: off(t1),
        transform: sc(i === nS - 1 ? F.aterrizaje : F.contacto),
      });
    }
    kV.push({ offset: 1, transform: tr(d) });
    kV.sort((a, b) => a.offset - b.offset);
    const offSalida = off(tSalidaCarril);
    const offVuelta = off(tVueltaCarril);
    const docX = (transform) => {
      const m = transform.match(/translate\((-?[\d.]+)px/);
      return m ? Math.round(parseFloat(m[1]) * 1000) / 1000 : 0;
    };
    const progresoCurva = (easing, t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      const m = String(easing || "linear").match(
        /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/
      );
      if (!m) return t;
      const x1 = +m[1];
      const y1 = +m[2];
      const x2 = +m[3];
      const y2 = +m[4];
      const cx = 3 * x1;
      const bx = 3 * (x2 - x1) - cx;
      const ax = 1 - cx - bx;
      const cy = 3 * y1;
      const by = 3 * (y2 - y1) - cy;
      const ay = 1 - cy - by;
      const sampleX = (u) => ((ax * u + bx) * u + cx) * u;
      const sampleY = (u) => ((ay * u + by) * u + cy) * u;
      const sampleDX = (u) => (3 * ax * u + 2 * bx) * u + cx;
      let u = t;
      for (let i = 0; i < 8; i++) {
        const dx = sampleDX(u) || 1e-6;
        u -= (sampleX(u) - t) / dx;
        if (u < 0) u = 0;
        if (u > 1) u = 1;
      }
      return sampleY(u);
    };
    const xCaminoEn = (kfs, offset) => {
      let a = kfs[0];
      let b = kfs[kfs.length - 1];
      for (let i = 0; i < kfs.length - 1; i++) {
        if (kfs[i + 1].offset - kfs[i].offset <= 1e-9) continue;
        if (offset <= kfs[i + 1].offset + 1e-9) {
          a = kfs[i];
          b = kfs[i + 1];
          break;
        }
      }
      const span = b.offset - a.offset;
      const u = span > 1e-9 ? (offset - a.offset) / span : 0;
      const xa = docX(a.transform);
      const xb = docX(b.transform);
      return {
        x: xa + (xb - xa) * progresoCurva(a.easing, u),
        u,
        parcial: u > 1e-6 && u < 1 - 1e-6,
        easing: a.easing,
        offsetA: a.offset,
        xa,
        xb,
      };
    };
    const xLane = xCarril;
    const kX = [
      { offset: 0, transform: `translateX(${xAdd0}px)`, easing: E.anticipa },
    ];
    const snapLaneAddV = () => {
      const left = mascota.getBoundingClientRect().left;
      return Math.round((xCarrilV - left) * 1000) / 1000;
    };
    const addKx = (offset, pathX, easing) => {
      const tx = Math.round((xLane - pathX) * 1000) / 1000;
      kX.push({
        offset,
        transform: `translateX(${tx}px)`,
        easing: easing || E.cuerda,
      });
    };
    if (!useCarril) {
      kX.push(
        { offset: offSalida, transform: "translateX(0px)", easing: E.anticipa },
        { offset: 1, transform: "translateX(0px)" }
      );
    } else {
      const margenDesde =
        origen === "scroll" || enCarrilAhora
          ? off(Math.max(A, 0))
          : offSalida;
      if (origen === "scroll" || enCarrilAhora) {
        if (enCarrilAhora) {
          kX[0].transform = `translateX(${snapLaneAddV()}px)`;
          for (const kf of kV) {
            if (kf.offset <= margenDesde + 1e-6) continue;
            if (kf.offset >= offVuelta - 1e-6) break;
            addKx(kf.offset, docX(kf.transform), kf.easing);
          }
        } else {
          const k0 = docX(kV[0].transform);
          kX[0].transform = `translateX(${xAdd0 + xLane - k0}px)`;
          addKx(
            margenDesde,
            docX(
              kV.find((k) => k.offset >= margenDesde - 1e-6)?.transform ||
                kV[0].transform
            ),
            E.cuerda
          );
          for (const kf of kV) {
            if (kf.offset <= margenDesde + 1e-6) continue;
            if (kf.offset >= offVuelta - 1e-6) break;
            addKx(kf.offset, docX(kf.transform), kf.easing);
          }
        }
      } else {
        addKx(offSalida, docX(tr(posSaltoFraccion(0, 0.4))), E.cuerda);
        for (const kf of kV) {
          if (kf.offset <= offSalida + 1e-6) continue;
          if (kf.offset >= offVuelta - 1e-6) break;
          addKx(kf.offset, docX(kf.transform), kf.easing);
        }
      }
      const camVuelta = xCaminoEn(kV, offVuelta);
      const prevVuelta = kX.at(-1);
      if (
        camVuelta.parcial &&
        prevVuelta &&
        Math.abs(prevVuelta.offset - camVuelta.offsetA) < 1e-6 &&
        Math.abs(camVuelta.xb - camVuelta.xa) > 1e-4
      ) {
        const pasos = 8;
        prevVuelta.easing = "linear";
        for (let i = 1; i < pasos; i++) {
          const s = i / pasos;
          const p = progresoCurva(camVuelta.easing, camVuelta.u * s);
          addKx(
            camVuelta.offsetA + (offVuelta - camVuelta.offsetA) * s,
            camVuelta.xa + (camVuelta.xb - camVuelta.xa) * p,
            "linear"
          );
        }
      }
      addKx(offVuelta, camVuelta.x, E.anticipa);
      kX.push(
        { offset: off(llegada), transform: "translateX(0px)", easing: E.anticipa },
        { offset: 1, transform: "translateX(0px)" }
      );
    }
    kX.sort((a, b) => a.offset - b.offset);
    kArc.push({ offset: 1, transform: "translateY(0px)" });
    kF.at(-1).easing = E.salida;
    kF.push({
      offset: off(llegada + T.aterrizaje / 2),
      transform: sc(F.rebote),
      easing: E.seno,
    });
    kF.push({
      offset: off(llegada + T.aterrizaje),
      transform: "scale(1, 1)",
    });
    kF.push({ offset: 1, transform: "scale(1, 1)" });
    const kH = (a, signo) => [
      { offset: 0, transform: `rotate(${a}deg)`, easing: E.salida },
      {
        offset: off(A + 0.3 * T.salto),
        transform: `rotate(${-signo * HOJA.salto}deg)`,
        easing: E.subida,
      },
      {
        offset: off(llegada),
        transform: `rotate(${-signo * HOJA.salto}deg)`,
        easing: E.salida,
      },
      {
        offset: off(llegada + 80),
        transform: `rotate(${signo * HOJA.aterrizaje}deg)`,
        easing: E.seno,
      },
      { offset: 1, transform: "rotate(0deg)" },
    ];

    mascota.dataset.estado = "salto";
    mascota.classList.add("en-viaje");
    mascota.style.willChange = "transform";
    mascota.style.opacity = "";
    viajeUsaCarril = useCarril;
    viajando = true;
    scrollViajeY = scrollY;
    aterrizado = false;
    const desdeEvento = retarget && viajeDestino ? viajeDestino : desde;
    viajeDestino = hasta;
    emitir("brote:salto", {
      desde: desdeEvento,
      hasta,
      origen,
      n: nS,
      h: Math.round(h),
      dist: Math.round(dist),
      carril: useCarril,
      recto,
      barridoCruza: barrido?.cruza ?? false,
      carrilMs: useCarril ? Math.round(tVueltaCarril - tSalidaCarril) : 0,
      tSalidaFinMs: Math.round(tSalidaCarril),
      estabaEnCarril: !!estabaEnCarril,
      laneLeftNow,
      retarget,
      viajeUsaCarrilPrev: !!viajeUsaCarril,
    });
    window.__ultimoBarrido = barrido;
    window.__barridoCruzaTexto = barridoCruzaTexto;
    const opt = { duration: total, fill: "forwards" };
    anims = [
      mascota.animate(kV, opt),
      mascota.animate(kArc, { ...opt, composite: "add" }),
      mascota.animate(kX, { ...opt, composite: "add" }),
      svg.animate(kF, opt),
      hojaI.animate(kH(a0I, 1), opt),
      hojaD.animate(kH(a0D, -1), opt),
    ];
    if (opac < 1) {
      anims.push(
        mascota.animate(
          [{ opacity: opac }, { opacity: 1 }],
          { duration: T.aparicionOpacidad, easing: E.desacel }
        )
      );
    }
    const aterrizar = () => {
      if (aterrizado) return;
      aterrizado = true;
      mascota.dataset.estado = "aterrizaje";
      emitir("brote:aterrizaje", { seccion: hasta });
    };
    tAterrizaje = setTimeout(aterrizar, llegada);
    anims[0].onfinish = () => {
      aterrizar();
      colocar(hasta);
      viajeDestino = null;
      emitir("brote:reposo", { seccion: hasta, origen });
      continuarPendiente(hasta);
    };
  }

  function fundido(hasta, origen, opac) {
    viajando = true;
    const a1 = mascota.animate(
      [{ opacity: opac }, { opacity: 0 }],
      { duration: T.rmSalida, easing: E.entrada, fill: "forwards" }
    );
    anims = [a1];
    a1.onfinish = () => {
      fijar(puntoDeAnclaje(hasta));
      const a2 = mascota.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: T.rmEntrada, easing: E.desacel, fill: "forwards" }
      );
      anims = [a2];
      a2.onfinish = () => {
        colocar(hasta);
        emitir("brote:reposo", { seccion: hasta, origen });
        continuarPendiente(hasta);
      };
    };
  }

  function sc0([x, y]) {
    return `scale(${x}, ${y})`;
  }

  function aparecer(id, origen) {
    window.__inicioAparicion =
      origen === "inicio" && window.__inicioTituloEntrada
        ? window.__inicioTituloEntrada
        : performance.now();
    cancelar();
    fijar(puntoDeAnclaje(id));
    mascota.dataset.estado = "reposo";
    const fin = () => {
      colocar(id);
      emitir("brote:reposo", { seccion: id, origen });
      continuarPendiente(id);
    };
    if (reducido.matches) {
      mascota.style.opacity = "0.02";
      anims = [
        mascota.animate(
          [{ opacity: 0.02 }, { opacity: 1 }],
          {
            duration: T.rmEntrada,
            easing: E.desacel,
            fill: "both",
            delay: 0,
          }
        ),
      ];
      anims[0].onfinish = fin;
      return;
    }
    viajando = true;
    mascota.classList.add("en-viaje");
    const total =
      origen === "inicio" ? T.caida + 200 : T.caida + T.hojas;
    const off = (t) => t / total;
    const opt = {
      duration: total,
      fill: "both",
    };
    const syncAncla = () => {
      if (!viajando) return;
      fijar(puntoDeAnclaje(id));
    };
    if (document.fonts?.addEventListener) {
      document.fonts.addEventListener("loadingdone", syncAncla);
    }
    addEventListener("resize", syncAncla);
    anims = [
      mascota.animate(
        [
          { opacity: 0.02, easing: E.desacel },
          { offset: off(T.aparicionOpacidad), opacity: 1 },
          { opacity: 1 },
        ],
        opt
      ),
      mascota.animate(
        [
          { transform: "translateY(-24px)", easing: E.bajada },
          { offset: off(T.caida), transform: "translateY(0px)" },
          { transform: "translateY(0px)" },
        ],
        { ...opt, composite: "add" }
      ),
      svg.animate(
        [
          { transform: sc0(F.previo), easing: E.impacto },
          {
            offset: off(T.caida),
            transform: sc0(F.aterrizaje),
            easing: E.salida,
          },
          {
            offset: off(T.caida + 80),
            transform: sc0(F.rebote),
            easing: E.seno,
          },
          { offset: off(T.caida + 160), transform: "scale(1, 1)" },
          { transform: "scale(1, 1)" },
        ],
        opt
      ),
    ];
    let listas = 0;
    const todasListas = () => {
      listas += 1;
      if (listas >= anims.length) {
        if (document.fonts?.removeEventListener) {
          document.fonts.removeEventListener("loadingdone", syncAncla);
        }
        removeEventListener("resize", syncAncla);
        fin();
      }
    };
    anims.forEach((a) => {
      a.onfinish = todasListas;
    });
  }

  let pendiente = null;
  let tQuieto = 0;
  let tTope = 0;
  let rafScroll = 0;
  let ultimoScrollY = 0;
  let acompanandoScroll = false;
  let saltoSinA = false;
  let scrollViajeY = 0;
  let ultimoScrollT = -Infinity;

  function navAlto() {
    return document.querySelector(".nav").offsetHeight;
  }

  function posDocDesdeCss() {
    const cs = getComputedStyle(mascota);
    return {
      x: parseFloat(cs.getPropertyValue("--brote-x")) || 0,
      y: parseFloat(cs.getPropertyValue("--brote-y")) || 0,
    };
  }

  function visibleEnZona(pantY) {
    const s = mascota.offsetWidth;
    const navH = navAlto();
    const top = pantY;
    const bottom = pantY + s;
    const inter =
      Math.min(bottom, innerHeight) - Math.max(top, navH);
    return inter >= 0.5 * s;
  }

  function colocarEnBordeVisible(pantY) {
    const s = mascota.offsetWidth;
    const navH = navAlto();
    const p = posDocDesdeCss();
    const top = Math.max(
      navH - s / 2,
      Math.min(pantY, innerHeight - s / 2)
    );
    fijar({ x: p.x, y: scrollY + top });
  }

  function pararAcompanarScroll() {
    acompanandoScroll = false;
    if (rafScroll) {
      cancelAnimationFrame(rafScroll);
      rafScroll = 0;
    }
  }

  function tickAcompanarScroll() {
    if (!acompanandoScroll || viajando) {
      pararAcompanarScroll();
      return;
    }
    const delta = scrollY - ultimoScrollY;
    if (delta !== 0) {
      const p = posDocDesdeCss();
      fijar({ x: p.x, y: p.y + delta });
      ultimoScrollY = scrollY;
    }
    rafScroll = requestAnimationFrame(tickAcompanarScroll);
  }

  function sincDocConPantalla() {
    const r = mascota.getBoundingClientRect();
    fijar({ x: r.left + scrollX, y: r.top + scrollY });
  }

  function iniciarAcompanarScroll() {
    if (reducido.matches || acompanandoScroll) return;
    const r = mascota.getBoundingClientRect();
    if (!visibleEnZona(r.top)) {
      colocarEnBordeVisible(r.top);
    } else {
      sincDocConPantalla();
    }
    ultimoScrollY = scrollY;
    acompanandoScroll = true;
    rafScroll = requestAnimationFrame(tickAcompanarScroll);
  }

  function setActiva(id, origen) {
    if (id === activa && !pendiente) return;
    const desde = activa;
    activa = id;
    document.body.dataset.seccionActiva = id;

    enlacesNav.forEach((a) => a.removeAttribute("aria-current"));
    enlacesNav
      .filter((a) => a.dataset.destino === id)
      .forEach((a) => a.setAttribute("aria-current", "true"));

    if (origen === "scroll") {
      if (viajando) {
        pendiente = {
          desde: viajeDestino || desde,
          hasta: id,
          origen,
          navScroll: false,
        };
        clearTimeout(tQuieto);
        tQuieto = setTimeout(lanzarPendiente, T.quietud);
        return;
      }
      pendiente = {
        desde: pendiente ? pendiente.desde : desde,
        hasta: id,
        origen,
        navScroll: false,
      };
      clearTimeout(tQuieto);
      clearTimeout(tTope);
      iniciarAcompanarScroll();
      tQuieto = setTimeout(lanzarPendiente, T.quietud);
      return;
    }
    if (viajando) {
      if (origen === "ancla" || origen === "foco") {
        sincDocConPantalla();
        cancelar();
        viajeDestino = null;
        saltoSinA = true;
        pendiente = {
          desde: pendiente ? pendiente.desde : desde,
          hasta: id,
          origen,
          navScroll: true,
        };
        clearTimeout(tQuieto);
        clearTimeout(tTope);
        iniciarAcompanarScroll();
        tQuieto = setTimeout(lanzarPendiente, T.quietud);
        tTope = setTimeout(lanzarPendiente, T.topeEspera);
        return;
      }
      cancelarEspera();
      viajar(viajeDestino || desde, id, origen);
      return;
    }
    const navScroll = origen === "ancla" || origen === "foco";
    const desdePendiente = pendiente ? pendiente.desde : desde;
    pendiente = {
      desde: desdePendiente,
      hasta: id,
      origen:
        pendiente && pendiente.hasta === id ? pendiente.origen : origen,
      navScroll,
    };
    clearTimeout(tQuieto);
    clearTimeout(tTope);
    if (navScroll) iniciarAcompanarScroll();
    if (navScroll && desdePendiente === id && !reducido.matches) {
      mascota.classList.add("en-viaje");
      mascota.dataset.estado = "salto";
    }
    tQuieto = setTimeout(lanzarPendiente, T.quietud);
    tTope = setTimeout(lanzarPendiente, T.topeEspera);
  }

  function cancelarEspera() {
    pendiente = null;
    clearTimeout(tQuieto);
    clearTimeout(tTope);
    pararAcompanarScroll();
  }

  function lanzarPendiente() {
    if (!pendiente) {
      pararAcompanarScroll();
      return;
    }
    const p = pendiente;
    if (viajando) return;
    cancelarEspera();
    if (p.hasta !== p.desde || p.navScroll || viajando) {
      viajar(p.desde, p.hasta, p.origen);
    }
  }

  addEventListener(
    "scroll",
    () => {
      ultimoScrollT = performance.now();
      if (viajando) {
        const delta = scrollY - scrollViajeY;
        if (delta !== 0) {
          const p = posDocDesdeCss();
          fijar({ x: p.x, y: p.y + delta });
          scrollViajeY = scrollY;
        }
      }
      if (!viajando) {
        const r = mascota.getBoundingClientRect();
        if (!visibleEnZona(r.top)) {
          iniciarAcompanarScroll();
        }
        if (acompanandoScroll) {
          const delta = scrollY - ultimoScrollY;
          if (delta !== 0) {
            const p = posDocDesdeCss();
            fijar({ x: p.x, y: p.y + delta });
            ultimoScrollY = scrollY;
          }
        }
      }
      clearTimeout(tQuieto);
      tQuieto = setTimeout(lanzarPendiente, T.quietud);
    },
    { passive: true }
  );
  if ("onscrollend" in window) {
    addEventListener("scrollend", () => {
      clearTimeout(tQuieto);
      tQuieto = setTimeout(
        lanzarPendiente,
        Math.max(0, T.quietud - (performance.now() - ultimoScrollT))
      );
    });
  }

  enlacesNav.forEach((a) => {
    a.addEventListener("click", () => {
      bloqueo = a.dataset.destino;
      setActiva(bloqueo, "ancla");
    });
  });

  const liberar = () => {
    bloqueo = null;
  };
  ["wheel", "touchstart"].forEach((ev) =>
    addEventListener(ev, liberar, { passive: true })
  );
  addEventListener("keydown", (e) => {
    if (
      ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(
        e.key
      )
    ) {
      liberar();
    }
  });

  secciones.forEach((s) => {
    s.addEventListener("focusin", () => {
      finalizarEntrada(s);
      bloqueo = s.id;
      setActiva(s.id, "foco");
    });
  });

  let candidata = null;
  let tCand = 0;

  function calcular() {
    const vh = innerHeight;
    const navH = document.querySelector(".nav").offsetHeight;
    if (scrollY <= 2) return secciones[0].id;
    if (scrollY + vh >= document.documentElement.scrollHeight - 4) {
      return secciones.at(-1).id;
    }
    let mejor = null;
    let max = -1;
    for (const s of secciones) {
      const r = s.getBoundingClientRect();
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, navH);
      if (visible > max) {
        max = visible;
        mejor = s.id;
      }
    }
    return mejor;
  }

  function masVisible() {
    if (bloqueo || activa === null) return;
    const c = calcular();
    if (c === activa) {
      candidata = null;
      clearTimeout(tCand);
      return;
    }
    if (c === candidata) return;
    candidata = c;
    clearTimeout(tCand);
    tCand = setTimeout(() => {
      const ok = !bloqueo && calcular() === candidata;
      const id = candidata;
      candidata = null;
      if (ok) setActiva(id, "scroll");
    }, T.debounceScroll);
  }

  const umbrales = Array.from({ length: 21 }, (_, i) => i / 20);
  const ioActiva = new IntersectionObserver(masVisible, { threshold: umbrales });
  secciones.forEach((s) => ioActiva.observe(s));
  addEventListener(
    "scroll",
    () => {
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 4) {
        masVisible();
      }
    },
    { passive: true }
  );

  if (reducido.matches) {
    secciones.forEach((s) => {
      finalizarEntrada(s);
    });
  }
  const ioEntrada = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          finalizarEntrada(e.target);
          ioEntrada.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  secciones.forEach((s) => ioEntrada.observe(s));

  const recolocar = () => {
    if (activa && !viajando && !pendiente) fijar(puntoDeAnclaje(activa));
  };
  addEventListener("resize", recolocar);
  new ResizeObserver(recolocar).observe(document.body);

  let oculta = false;
  let fuera = false;
  const pausa = () => mascota.classList.toggle("pausada", oculta || fuera);
  new IntersectionObserver(([e]) => {
    fuera = !e.isIntersecting;
    pausa();
  }).observe(mascota);
  document.addEventListener("visibilitychange", () => {
    oculta = document.hidden;
    if (oculta) {
      cancelarEspera();
      anims.slice().forEach((a) => a.finish());
    }
    pausa();
  });

  const hash = location.hash.slice(1);
  activa = secciones.some((s) => s.id === hash) ? hash : secciones[0].id;
  document.body.dataset.seccionActiva = activa;
  enlacesNav
    .filter((a) => a.dataset.destino === activa)
    .forEach((a) => a.setAttribute("aria-current", "true"));
  mascota.style.opacity = "0";
  const seccionIni = document.getElementById(activa);
  const arranqueInicial = () => {
    window.__inicioTituloEntrada = performance.now();
    mascota.style.opacity = "0.01";
    finalizarEntrada(seccionIni);
    void seccionIni.offsetHeight;
    void mascota.offsetHeight;
    aparecer(activa, "inicio");
  };
  if (reducido.matches) {
    arranqueInicial();
  } else {
    requestAnimationFrame(arranqueInicial);
  }

  reducido.addEventListener("change", () => {
    if (reducido.matches) {
      secciones.forEach((s) => {
        finalizarEntrada(s);
      });
    }
    cancelarEspera();
    colocar(activa);
  });
})();