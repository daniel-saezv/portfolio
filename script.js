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

  function offsetXAddActual() {
    const r = mascota.getBoundingClientRect();
    const a = posDocDesdeCss();
    return Math.round(r.left + scrollX - a.x);
  }

  const tr = (p) => `translate(${p.x}px, ${p.y}px)`;

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
    const retarget = viajando;
    const xAddInicio = viajando ? offsetXAddActual() : 0;
    cancelar();
    const o0 = { x: mV.e, y: mV.f };
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
    if (nS === 1 && dist > 360) nS = 2;
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
    const laneDx = Math.round(xCarril - o.x);
  const tSalidaCarril = A + 0.4 * T.salto;
    const tVueltaCarril =
      A + (nS - 1) * (T.salto + T.contacto) + 0.6 * T.salto;

    const kV = [{ offset: 0, transform: tr(o), easing: E.cuerda }];
    const kArc = [{ offset: 0, transform: "translateY(0px)", easing: E.cuerda }];
    const kX = [{ offset: 0, transform: `translateX(${xAdd0}px)` }];
    const kF = [{ offset: 0, transform: sc([mF.a, mF.d]), easing: E.anticipa }];
    if (A) {
      kV.push({ offset: off(A), transform: tr(o) });
      kArc.push({ offset: off(A), transform: "translateY(0px)" });
      kX.push({ offset: off(A), transform: `translateX(${xAdd0}px)` });
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
    kX.at(-1).easing = E.anticipa;
    kX.push({
      offset: off(tSalidaCarril),
      transform: `translateX(${laneDx}px)`,
    });
    kX.push({
      offset: off(tVueltaCarril),
      transform: `translateX(${laneDx}px)`,
    });
    kX.at(-1).easing = E.anticipa;
    kX.push({ offset: off(llegada), transform: "translateX(0px)" });
    kArc.push({ offset: 1, transform: "translateY(0px)" });
    kX.push({ offset: 1, transform: "translateX(0px)" });
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
    kV.push({ offset: 1, transform: tr(d) });
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
    viajando = true;
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
    });
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
    };
    if (reducido.matches) {
      mascota.style.opacity = "0.01";
      anims = [
        mascota.animate(
          [{ opacity: 0.01 }, { opacity: 1 }],
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
          { opacity: 0.01, easing: E.desacel },
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

  function colocarBajoNav() {
    const s = mascota.offsetWidth;
    const navH = navAlto();
    const p = posDocDesdeCss();
    fijar({ x: p.x, y: scrollY + navH - s });
  }

  function pararAcompanarScroll() {
    acompanandoScroll = false;
    if (rafScroll) {
      cancelAnimationFrame(rafScroll);
      rafScroll = 0;
    }
  }

  function tickAcompanarScroll() {
    if (!acompanandoScroll || !pendiente || viajando) {
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
    if (reducido.matches) return;
    pararAcompanarScroll();
    const r = mascota.getBoundingClientRect();
    if (!visibleEnZona(r.top)) {
      colocarBajoNav();
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
      cancelarEspera();
      viajar(desde, id, origen);
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
    pendiente = {
      desde: pendiente ? pendiente.desde : desde,
      hasta: id,
      origen:
        pendiente && pendiente.hasta === id ? pendiente.origen : origen,
      navScroll,
    };
    clearTimeout(tQuieto);
    clearTimeout(tTope);
    if (navScroll) iniciarAcompanarScroll();
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
    if (!pendiente) return;
    const p = pendiente;
    cancelarEspera();
    if (p.hasta !== p.desde || viajando) viajar(p.desde, p.hasta, p.origen);
  }

  addEventListener(
    "scroll",
    () => {
      if (pendiente?.navScroll && !viajando) {
        const delta = scrollY - ultimoScrollY;
        if (delta !== 0) {
          const p = posDocDesdeCss();
          fijar({ x: p.x, y: p.y + delta });
          ultimoScrollY = scrollY;
        }
      }
      if (pendiente) {
        clearTimeout(tQuieto);
        tQuieto = setTimeout(lanzarPendiente, T.quietud);
      }
    },
    { passive: true }
  );
  if ("onscrollend" in window) {
    addEventListener("scrollend", lanzarPendiente);
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
      s.dataset.entrada = "final";
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
      s.dataset.entrada = "final";
    });
  }
  const ioEntrada = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.dataset.entrada = "final";
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
    seccionIni.dataset.entrada = "final";
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
        s.dataset.entrada = "final";
      });
    }
    cancelarEspera();
    colocar(activa);
  });
})();