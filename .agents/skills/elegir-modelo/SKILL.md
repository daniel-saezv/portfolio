---
name: elegir-modelo
description: Elige y comprueba el modelo de un agente en la nube. Pasa el modelo de forma explícita y justifica plataforma y modelo en el informe o la PR.
---

# Elegir modelo

Usa esta skill al lanzar un agente en la nube.

Los detalles de cada plataforma (dónde consultar el catálogo, cómo pasar el modelo, cómo comprobarlo) están en [referencias/cursor.md](referencias/cursor.md) y [referencias/copilot.md](referencias/copilot.md). No los copies a `AGENTS.md`.

## Qué hacer

1. **Elige plataforma y modelo juntos.** Mira la tarea. Consulta el catálogo vigente de la plataforma, no una lista memorizada. Aplica las reglas de política de abajo. Justifica ambos en el informe o la PR.
2. **Pasa el modelo de forma explícita.** Nunca dejes el de por defecto. Sigue la referencia de la plataforma: id, parámetros y el canal con el que lanzas.
3. **Comprueba el modelo que se resolvió realmente.** No asumas que el id pedido es el usado. Lee el dato que documenta la referencia.
4. **Aplica las reglas de política.** Si el modelo resuelto no coincide con lo justificado, para y relanza.

## Reglas de política

- Elige plataforma y modelo en cada tarea y justifícalos en el informe o la PR.
- En Cursor, solo modelos incluidos sin créditos extra, y siempre con `fast=false`. Qué está incluido lo dice la documentación de modelos y precios en el momento del lanzamiento, no esta skill.

## Qué no hacer

- No dejes el modelo por defecto de la cuenta, el equipo o el sistema.
- No copies a `AGENTS.md` ni a esta skill una lista de ids o nombres de modelo. Cambian.
- No nombres una plataforma como obligatoria en `AGENTS.md`.
