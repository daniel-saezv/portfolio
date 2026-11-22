# AGENTS.md

## Reglas transversales

1. Demuestra que funciona antes de darlo por hecho: comando real, test o captura.
2. Arregla la causa raíz, no el síntoma.
3. Resta antes de sumar: borra código muerto antes de añadir.
4. Haz el cambio mínimo que resuelve, sin capas ni abstracciones especulativas.
5. Los tests prueban comportamiento observable, no la implementación.
6. Amplía un test existente antes de crear otro y borra los que dejen de aplicar.
7. Sin comentarios en el código: que el nombre y la estructura lo expliquen.
8. Validación y manejo de errores en los bordes del sistema, no repartidos por todo el código.
9. Operaciones idempotentes: se pueden repetir sin daño.
10. Una unidad verificable por commit o PR.
11. Antes de reportar un número, explícalo y mídelo bien.
12. Si una corrección se repite, conviértela en estructura (test, lint, tipo) y no en otra instrucción.
13. Nunca inventes comandos, stack ni datos: solo lo comprobado.
14. Sin ficheros `.md` largos de planes o decisiones; el porqué va en la PR o en el commit.
15. Prosa breve y sin relleno en PRs, commits y documentación.
16. No cambies alcance, diseño ni prioridades por tu cuenta; si algo te bloquea, dilo con exactitud.
17. La preparación del entorno vive en `scripts/setup`. Es idempotente. Los archivos de cada proveedor de agentes en la nube solo lo invocan. Si cambias dependencias, toolchain o pasos de arranque, actualiza el script y comprueba que esos envoltorios siguen funcionando. Si el proyecto usa un proveedor sin envoltorio, créalo.

## Mantenimiento de skills

`AGENTS.md` y `.agents/skills/` son la fuente de instrucciones para agentes en Cursor, Copilot, Codex y Gemini CLI. Claude Code lee las mismas skills vía `.claude/skills/`. `.github/copilot-instructions.md` es un enlace simbólico a `AGENTS.md`.

Hay dos clases de skills:

1. **Instaladas desde pstack** (inglés, instalador oficial): `blast-radius`, `correct`, `principle-prove-it-works`, `tdd` y `unslop`. Se añaden o actualizan con el CLI [`skills`](https://github.com/vercel-labs/skills), por ejemplo:

   ```bash
   npx skills add cursor/plugins --skill tdd -a cursor -a github-copilot -a codex -a gemini-cli -a claude-code -y
   ```

   Esas skills pueden nombrar otras de pstack que no vienen en el repositorio (por ejemplo, `blast-radius` menciona `why` y `arena`). Si las necesitas, instálalas con `npx skills add cursor/plugins --skill <nombre>` o con `/add-plugin pstack` en Cursor.

2. **Propias del repositorio** (español): `setup-proyecto`, `entorno-agentes`, `pr-lista`, `technical-writing` y `how`. Viven en `.agents/skills/`; para que Claude Code las vea, mantén los enlaces en `.claude/skills/` apuntando a `.agents/skills/<nombre>`.

Para actualizar las skills bloqueadas en `skills-lock.json`:

```bash
npx skills update -y
```

Revisa el diff, valida con `npx skills check` y commitea `.agents/skills/`, `.claude/skills/` y `skills-lock.json`.

### Créditos de skills de pstack

Skills de [pstack](https://github.com/cursor/plugins/tree/main/pstack) por Lauren Tan (licencia MIT), instaladas con el instalador oficial. Las adaptaciones en español `how` y `technical-writing` derivan del mismo origen; ver `.agents/skills/LICENSE`.

## Este proyecto

portfolio

Página estática de portfolio (HTML, CSS y JS vanilla) desplegada en GitHub Pages.

### Stack y estructura

- **Sitio publicado:** `index.html`, `styles.css`, `script.js` (sin build ni dependencias en runtime).
- **CI:** `.github/workflows/deploy.yml` copia solo esos tres archivos a `_site` y despliega con GitHub Actions.
- **Pruebas locales:** `tests/portfolio.spec.mjs`, `tests/motion.spec.mjs` y `tests/motion-render.spec.mjs` (Playwright; no se publican).

### Comandos verificados

```bash
# Servir en local (cualquier servidor estático estático sobre la raíz del repo)
python3 -m http.server 8080

# Pruebas headless (criterios §11.10, capturas en /opt/cursor/artifacts)
bash scripts/setup
npm test
```

No hay paso de build del sitio.

### CI/CD

- Workflow `Desplegar en GitHub Pages` en cada push a `main` o manual (`workflow_dispatch`): job `build` (artefacto `_site`) y job `deploy` (entorno `github-pages`).
- Requiere GitHub Pages habilitado con origen **GitHub Actions**.
- El proyecto se despliega en GitHub Pages (URL del entorno `github-pages` tras el primer despliegue exitoso).

#### Checks recomendados en PR

- Validación del workflow YAML.
- Ejecución manual o en agente de `npm test` antes de merge.

### Cursor Cloud

1. Preparar el entorno: `bash scripts/setup` (`.cursor/environment.json` lo invoca en el Build).
2. Ejecutar `npm test` desde la raíz del repositorio.
3. No se requieren secretos para pruebas locales; el despliegue usa `GITHUB_TOKEN` / permisos de Pages del repositorio.

### Configuración que solo puede hacer el dueño del repo

- Activar **GitHub Pages** (*Settings → Pages → Source: GitHub Actions*) exige permisos `pages=write` y `administration=write`. Ninguna credencial de los agentes los tiene: la conexión de Cursor limita `pages` y `administration` a lectura. Hay que hacerlo a mano una vez por repositorio.
