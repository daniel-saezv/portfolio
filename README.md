# Portfolio

Sitio estático personal de **Daniel Saez** con las secciones **Sobre mí**, **Habilidades** y **Enlaces**. Publicado en [https://daniel-saezv.github.io/portfolio/](https://daniel-saezv.github.io/portfolio/).

## Stack

HTML, CSS y JavaScript vanilla en la raíz del repositorio. No hay paso de build ni dependencias en runtime; solo Playwright como dependencia de desarrollo para las pruebas.

## Ver en local

Desde la raíz del repositorio, sirve los archivos con cualquier servidor estático. Por ejemplo:

```bash
python3 -m http.server 8080
```

Abre [http://localhost:8080](http://localhost:8080).

## Cómo preparar el entorno

```bash
bash scripts/setup
```

## Pruebas

Con el entorno preparado, ejecuta la suite:

```bash
npm test
```

El script `test` de `package.json` ejecuta `tests/portfolio.spec.mjs` y `tests/motion-smoke.spec.mjs`. La prueba de movimiento comprueba la navegación en móvil y escritorio, el movimiento reducido y la continuidad lateral: muestrea la posición renderizada cada 4 ms, limita la velocidad a 1 px/ms y verifica el carril y el regreso sin cruzar texto.

## Estructura

| Ruta | Uso |
| --- | --- |
| `index.html` | Página publicada |
| `styles.css` | Estilos publicados |
| `script.js` | Comportamiento publicado |
| `design/` | Especificaciones, SVG y capturas de referencia (no se despliegan) |
| `tests/` | Pruebas Playwright (no se publican) |

## Despliegue

El workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (`Desplegar en GitHub Pages`) se dispara en cada push a `main` o manualmente (`workflow_dispatch`).

1. **build:** copia `index.html`, `styles.css` y `script.js` a `_site/`, configura GitHub Pages y sube el artefacto.
2. **deploy:** publica el artefacto en el entorno `github-pages`.

GitHub Pages debe tener como origen **GitHub Actions** en la configuración del repositorio.
