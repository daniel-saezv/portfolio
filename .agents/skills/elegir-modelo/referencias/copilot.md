# Copilot: elegir y comprobar el modelo

Hechos para consultar. Si un campo no está aquí, no lo inventes: abre el enlace. No copies ids de modelo a esta skill: el catálogo y los descuentos cambian.

## Documentación

- Modelos soportados por el cloud agent: [Changing the AI model for GitHub Copilot cloud agent](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/changing-the-ai-model)
- Precios y uso actuales (créditos de IA): [Models and pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing)
- Premium requests (facturación antigua por peticiones): [Requests in GitHub Copilot (legacy)](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/copilot-requests)
- Multiplicadores de esa facturación antigua: [Model multipliers for annual plans on request-based billing (legacy)](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/model-multipliers-for-annual-plans)
- Cómo pasar el modelo al asignar una issue: [Using Copilot cloud agent via the API](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api)

## Cómo consultar el catálogo

Antes de lanzar, abre [Changing the AI model](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/changing-the-ai-model). Esa página es la lista vigente del cloud agent. La lista «Currently supported values» de las tareas REST puede ir desfasada.

Para coste y descuentos, abre [Models and pricing](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing). Si el plan sigue en facturación por peticiones premium, usa [Requests in GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/copilot-requests) y [Model multipliers](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/model-multipliers-for-annual-plans). No copies esas tablas aquí.

## Cómo elegir

En los puntos de entrada con selector, elige el modelo al arrancar. Si el modelo admite razonamiento configurable, la UI muestra un segundo menú. Donde no hay selector, Copilot usa Auto.

Por API, pasa el modelo de forma explícita. Sin `model`, Copilot usa Auto.

**REST (issues):** cabecera `X-GitHub-Api-Version: 2022-11-28`. Cuerpo con `assignees: ["copilot-swe-agent[bot]"]` y `agent_assignment.model`. Endpoints: `POST /repos/{owner}/{repo}/issues`, `POST /repos/{owner}/{repo}/issues/{n}/assignees`, `PATCH /repos/{owner}/{repo}/issues/{n}`.

**GraphQL:** `agentAssignment.model` con cabecera `GraphQL-Features: coding_agent_model_selection`.

**REST (tareas):** `POST /agents/repos/{owner}/{repo}/tasks` con `model`. Si omites `model`, Auto.

Los valores de `model` son identificadores en minúsculas. Tómalos del catálogo de «Changing the AI model», no de memoria.

## Cómo comprobar

Un modelo inválido o no disponible no falla el HTTP de creación de la issue: responde **201**. Copilot comenta que el modelo no está disponible y no abre sesión ni PR. Revisa siempre los comentarios de la issue tras asignar.

El modelo realmente usado está en el log del workflow **Running Copilot cloud agent**. Línea `[cca-engine] Model resolution: … → resolved="<id>"`.

No des por bueno el id pedido hasta ver comentarios y log.
