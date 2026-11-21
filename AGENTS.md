# portfolio

Página estática de portfolio (HTML, CSS y JS vanilla) desplegada en GitHub Pages.

## Stack y estructura

- **Sitio publicado:** `index.html`, `styles.css`, `script.js` (sin build ni dependencias en runtime).
- **CI:** `.github/workflows/deploy.yml` copia solo esos tres archivos a `_site` y despliega con GitHub Actions.
- **Pruebas locales:** `tests/portfolio.spec.mjs`, `tests/motion.spec.mjs` y `tests/motion-render.spec.mjs` (Playwright; no se publican).

## Comandos verificados

```bash
# Servir en local (cualquier servidor estático estático sobre la raíz del repo)
python3 -m http.server 8080

# Pruebas headless (criterios §11.10, capturas en /opt/cursor/artifacts)
npx --yes playwright install chromium
npm test
```

No hay paso de build del sitio.

## CI/CD

- Workflow `Desplegar en GitHub Pages` en cada push a `main` o manual (`workflow_dispatch`): job `build` (artefacto `_site`) y job `deploy` (entorno `github-pages`).
- Requiere GitHub Pages habilitado con origen **GitHub Actions**.
- El proyecto se despliega en GitHub Pages (URL del entorno `github-pages` tras el primer despliegue exitoso).

### Checks recomendados en PR

- Validación del workflow YAML.
- Ejecución manual o en agente de `npm test` antes de merge.

## Cursor Cloud

1. Instalar navegador de prueba: `npx --yes playwright install chromium`.
2. Ejecutar `npm test` desde la raíz del repositorio.
3. No se requieren secretos para pruebas locales; el despliegue usa `GITHUB_TOKEN` / permisos de Pages del repositorio.

## Plataformas de agentes

Notas aplicables a cualquier repositorio de **daniel-saezv** al usar agentes en la nube (no sustituyen la documentación oficial de cada proveedor).

### Cursor (agente en la nube)

- Se lanza desde Grok Bot o Cursor sobre la URL del repositorio.
- El agente crea una rama y abre la PR sin intervención manual.

### GitHub Copilot (agente en la nube)

- Se lanza **asignando una issue** a Copilot. El login correcto es `copilot-swe-agent[bot]`. Con `Copilot` o `copilot-swe-agent`, la API responde **422** *Validation Failed (assignees: invalid)*.
- Asignación válida vía `POST /repos/{owner}/{repo}/issues` con `assignees`, `POST /repos/{owner}/{repo}/issues/{n}/assignees` o `PATCH /repos/{owner}/{repo}/issues/{n}`. Opcionalmente se puede enviar `agent_assignment` (`target_repo`, `base_branch`, `custom_instructions`, `custom_agent`, `model`). Documentación: [Use Copilot cloud agent via the API](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api).
- Requiere un **token de usuario**: PAT, token OAuth o token user-to-server de una GitHub App. Los tokens de **instalación** de una GitHub App no sirven. Un PAT fine-grained necesita Metadata (lectura) y Actions, Contents, Issues y Pull requests (lectura y escritura). Un PAT classic necesita el ámbito `repo`.
- La conexión de GitHub de Cursor (user-to-server) cumple esos requisitos. Verificado el **21-11-2026**: la issue #4 se creó asignada a `copilot-swe-agent[bot]` y Copilot abrió la PR #5 en segundos en una rama `copilot/...`. Ambas se cerraron sin merge.
- Para comprobar disponibilidad en un repo, en GraphQL consulta `suggestedActors(capabilities: [CAN_BE_ASSIGNED])`: debe aparecer `copilot-swe-agent`.
- La PR figura con **autor** el usuario que asignó la issue; Copilot es **coautor** de los commits. La PR se abre en **draft**.

### Copilot: elegir y comprobar el modelo

Verificado en pruebas reales el **2026-11-21** (issues #9 y #10; PR #11 cerrada sin merge).

- Para elegir el modelo, asigna la issue a `copilot-swe-agent[bot]` y pasa `agent_assignment.model`.
- **REST:** `POST /repos/{owner}/{repo}/issues` o `POST /repos/{owner}/{repo}/issues/{n}/assignees`, cabecera `X-GitHub-Api-Version: 2022-11-28`, cuerpo con `assignees: ["copilot-swe-agent[bot]"]` y `agent_assignment: { target_repo, base_branch, custom_instructions, custom_agent, model }`.
- **GraphQL:** `agentAssignment.model` con cabecera `GraphQL-Features: coding_agent_model_selection`.
- Sin `model` se usa **Auto**.
- Los valores son identificadores en minúsculas. Verificado: `claude-haiku-4.5`. La lista de valores de la doc REST está desactualizada: `claude-sonnet-4.6` ya no está disponible. Antes de elegir, consulta la página «Changing the AI model» en docs.github.com.
- Un modelo inválido o no disponible **no** devuelve error HTTP: la issue se crea con **201** y Copilot comenta *The selected model isn't available…* sin abrir sesión ni PR. Revisa siempre los comentarios de la issue tras asignar.
- El modelo realmente usado se lee en el log del workflow **Running Copilot cloud agent** (`GET /repos/{owner}/{repo}/actions/runs/{id}/logs`), línea `[cca-engine] Model resolution: … → resolved="<modelo>"`.
- También aparece en el campo `model` de las sesiones de `GET /agents/tasks/{id}` (API `2026-03-10`), con permiso de repositorio **Agent tasks**. No figura en la PR.
- El token compartido de los agentes es `GITHUB_COPILOT_TOKEN` (fine-grained PAT de daniel-saezv). Nunca se imprime ni se guarda en archivos.

### Configuración que solo puede hacer el dueño del repo

- Activar **GitHub Pages** (*Settings → Pages → Source: GitHub Actions*) exige permisos `pages=write` y `administration=write`. Ninguna credencial de los agentes los tiene: la conexión de Cursor limita `pages` y `administration` a lectura. Hay que hacerlo a mano una vez por repositorio.
