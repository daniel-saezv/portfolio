(function () {
  const sectionIds = ["sobre-mi", "habilidades", "enlaces"];
  const sections = sectionIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (!sections.length) {
    return;
  }

  let activeId = "";

  function setActiveSection(id) {
    if (!id || id === activeId) {
      return;
    }
    activeId = id;
    document.body.dataset.seccionActiva = id;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (visible.length > 0) {
        setActiveSection(visible[0].target.id);
        return;
      }

      const closest = entries.reduce((best, entry) => {
        if (!best) {
          return entry;
        }
        return Math.abs(entry.boundingClientRect.top) <
          Math.abs(best.boundingClientRect.top)
          ? entry
          : best;
      }, null);

      if (closest) {
        setActiveSection(closest.target.id);
      }
    },
    {
      root: null,
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    }
  );

  sections.forEach((section) => observer.observe(section));

  document.querySelectorAll('nav a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => {
      const hash = link.getAttribute("href");
      if (!hash || hash.length < 2) {
        return;
      }
      const id = hash.slice(1);
      window.setTimeout(() => setActiveSection(id), 150);
    });
  });

  setActiveSection(sections[0].id);
})();