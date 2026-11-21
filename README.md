# portfolio

## Agentes y skills

`AGENTS.md` y `.agents/skills/` son la fuente de instrucciones para agentes en Cursor, Copilot, Codex y Gemini CLI. Claude Code lee las mismas skills vía `.claude/skills/`. `.github/copilot-instructions.md` es un enlace simbólico a `AGENTS.md`.

Hay dos clases de skills:

1. **Instaladas desde pstack** (inglés, instalador oficial): `blast-radius`, `correct`, `principle-prove-it-works`, `tdd` y `unslop`. Se añaden o actualizan con el CLI [`skills`](https://github.com/vercel-labs/skills), por ejemplo:

   ```bash
   npx skills add cursor/plugins --skill tdd -a cursor -a github-copilot -a codex -a gemini-cli -a claude-code -y
   ```

   Esas skills pueden nombrar otras de pstack que no vienen en el repositorio (por ejemplo, `blast-radius` menciona `why` y `arena`). Si las necesitas, instálalas con `npx skills add cursor/plugins --skill <nombre>` o con `/add-plugin pstack` en Cursor.

2. **Propias del repositorio** (español): `setup-proyecto`, `pr-lista`, `technical-writing` y `how`. Viven en `.agents/skills/`; para que Claude Code las vea, mantén los enlaces en `.claude/skills/` apuntando a `.agents/skills/<nombre>`.

Para actualizar las skills bloqueadas en `skills-lock.json`:

```bash
npx skills update -y
```

Revisa el diff, valida con `npx skills check` y commitea `.agents/skills/`, `.claude/skills/` y `skills-lock.json`.

### Créditos

Skills de [pstack](https://github.com/cursor/plugins/tree/main/pstack) por Lauren Tan (licencia MIT), instaladas con el instalador oficial. Las adaptaciones en español `how` y `technical-writing` derivan del mismo origen; ver `.agents/skills/LICENSE`.
