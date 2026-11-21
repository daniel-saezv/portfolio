(function () {
  const secciones = [...document.querySelectorAll("[data-seccion]")];
  const enlacesNav = [...document.querySelectorAll(".nav__enlace")];
  const mascota = document.getElementById("mascota");
  const anio = document.getElementById("anio");

  if (!secciones.length || !mascota) {
    return;
  }

  if (anio) {
    anio.textContent = String(new Date().getFullYear());
  }

  let activa = null;
  let bloqueo = null;

  function puntoDeAnclaje(id) {
    const titulo = document.getElementById(id).querySelector(".titulo-seccion");
    const rect = titulo.getBoundingClientRect();
    const tam = mascota.offsetWidth;
    const pad = parseFloat(getComputedStyle(titulo).paddingTop);
    return {
      x: Math.round(rect.left + scrollX - tam * 0.12),
      y: Math.round(rect.top + scrollY + pad - tam + 2),
    };
  }

  function colocar(id) {
    const p = puntoDeAnclaje(id);
    mascota.style.setProperty("--brote-x", p.x + "px");
    mascota.style.setProperty("--brote-y", p.y + "px");
  }

  function setActiva(id) {
    if (!id || id === activa) {
      return;
    }
    activa = id;
    document.body.dataset.seccionActiva = id;

    enlacesNav.forEach((a) => a.removeAttribute("aria-current"));
    enlacesNav
      .filter((a) => a.dataset.destino === id)
      .forEach((a) => a.setAttribute("aria-current", "true"));

    mascota.dataset.estado = "reposo";
    colocar(id);
  }

  function masVisible() {
    if (bloqueo) {
      return;
    }
    const vh = innerHeight;
    const navH = document.querySelector(".nav").offsetHeight;

    if (scrollY + vh >= document.documentElement.scrollHeight - 4) {
      setActiva(secciones.at(-1).id);
      return;
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
    if (mejor) {
      setActiva(mejor);
    }
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

  enlacesNav.forEach((a) => {
    a.addEventListener("click", () => {
      bloqueo = a.dataset.destino;
      setActiva(bloqueo);
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
      setActiva(s.id);
    });
  });

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
    if (activa) {
      colocar(activa);
    }
  };
  addEventListener("resize", recolocar);
  if (document.fonts) {
    document.fonts.ready.then(recolocar);
  }
  new ResizeObserver(recolocar).observe(document.body);

  const hash = location.hash.slice(1);
  const inicial = secciones.some((s) => s.id === hash) ? hash : secciones[0].id;
  setActiva(inicial);
})();