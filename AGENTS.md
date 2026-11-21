# portfolio

Página estática de portfolio (HTML, CSS y JS vanilla) desplegada en GitHub Pages.

## Stack y estructura

- **Sitio publicado:** `index.html`, `styles.css`, `script.js` (sin build ni dependencias en runtime).
- **CI:** `.github/workflows/deploy.yml` copia solo esos tres archivos a `_site` y despliega con GitHub Actions.
- **Pruebas locales:** `tests/portfolio.spec.mjs` (Playwright; no se publica).

## Comandos verificados

```bash
# Servir en local (cualquier servidor estático estático sobre la raíz del repo)
python3 -m http.server 8080

# Pruebas headless (375 px y 1440 px, capturas en /opt/cursor/artifacts)
npx --yes playwright install chromium
node tests/portfolio.spec.mjs
```

No hay paso de build del sitio.

## CI/CD

- Workflow `Desplegar en GitHub Pages` en cada push a `main`.
- Requiere GitHub Pages habilitado con origen **GitHub Actions**.
- El proyecto se despliega en GitHub Pages (URL del entorno `github-pages` tras el primer despliegue exitoso).

### Checks recomendados en PR

- Validación del workflow YAML.
- Ejecución manual o en agente de `tests/portfolio.spec.mjs` antes de merge.

## Cursor Cloud

1. Instalar navegador de prueba: `npx --yes playwright install chromium`.
2. Ejecutar `node tests/portfolio.spec.mjs` desde la raíz del repositorio.
3. No se requieren secretos para pruebas locales; el despliegue usa `GITHUB_TOKEN` / permisos de Pages del repositorio.