## 11. Movimiento (Sylvanas)

> Sustituye a «11. Movimiento: pendiente de Sylvanas» en `portfolio-design/spec.md`. Mantiene sus apartados y nombres: Puntos de anclaje, Eventos, los 5 puntos «por definir» (11.1 a 11.5) y Restricciones. Añade tres apartados: disparadores (11.6), sustitución de cada PROVISIONAL (11.7) y criterios de aceptación (11.10).
> Versión 1 · 21-11-2026 · Para Thrall (ingeniería) y Anduin (PM) · Base: maqueta de Jaina en `/workspace/portfolio-design/` · Demo de referencia: `/workspace/portfolio-motion/demo.html` (copia de `index.html` con este movimiento ya aplicado).

**Repo `daniel-saezv/portfolio`**: el 21-11-2026 está vacío (sin commits ni ramas). Stack fijado por Thrall y Jaina: HTML, CSS y JS nativos, sin librerías.

**Técnica de animación**:
- Reposo, entradas y barra van en CSS (`transition` y `@keyframes`).
- El viaje de la mascota va en Web Animations API (`element.animate`), porque hay que cancelarlo y retargetearlo a mitad.
- El arco del salto es una segunda animación sobre `#brote` con `composite: 'add'`. Así no hace falta añadir capas al DOM de Jaina.
- No hay muelles: todo son duraciones en ms con `cubic-bezier`.

**Criterio**:
- El movimiento sirve para seguir los cambios con la vista.
- Nada aparece de golpe y nada se mueve por adorno.
- Nada hace esperar: el contenido nunca espera a la mascota.

**Buenas prácticas de Motion aplicadas** (docs *Animation performance* y *Accessibility*):
- Animar solo `transform` y `opacity`, que se resuelven en el compositor.
- `will-change` con moderación.
- No animar variables CSS, porque no se aceleran. Por eso el viaje anima `transform` directamente y `--brote-x/--brote-y` solo guardan la posición de reposo.
- Con *reduced motion*, cambiar transform por opacity y quitar el parallax.

### Curvas con nombre

| Nombre | cubic-bezier | Uso |
|---|---|---|
| `salida` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entradas, rebote de aterrizaje, indicador que entra. Llega rápido y frena suave. |
| `entrada` | `cubic-bezier(0.4, 0, 1, 1)` | Salidas: acelera al irse sin pedir atención. |
| `desacel` | `cubic-bezier(0, 0, 0.2, 1)` | Fundidos de aparición cortos. |
| `seno` | `cubic-bezier(0.37, 0, 0.63, 1)` | Ciclos de reposo y asentado final. Simétrica, sin tirones en bucle. |
| `cuerda` | `cubic-bezier(0.3, 0, 0.7, 1)` | Avance de cada saltito por la recta origen→destino. Suaviza despegue y llegada. |
| `subida` | `cubic-bezier(0.5, 1, 0.89, 1)` | Media subida del arco (ease-out cuadrática). |
| `bajada` | `cubic-bezier(0.11, 0, 0.5, 0)` | Media bajada del arco (ease-in cuadrática). Junto con `subida` aproxima una parábola de gravedad. |
| `anticipa` | `cubic-bezier(0.33, 0, 0.67, 1)` | Agacharse antes de saltar. |
| `estira` | `cubic-bezier(0.33, 1, 0.68, 1)` | Paso de aplastada a estirada al despegar. |
| `impacto` | `cubic-bezier(0.32, 0, 0.67, 0)` | Compresión al tocar suelo. Acelera, así que el golpe se nota. |

### Puntos de anclaje

- Uno por sección, sobre el borde superior izquierdo de `.titulo-seccion`: `#sobre-mi` h1, `#habilidades` h2 y `#enlaces` h2. Es igual en móvil y escritorio.
- Fórmula de Jaina (§8.4), sin cambios: `x = título.left − 0.12 × tamaño`; `y = título.top + padding-top − tamaño + 2`, redondeados con `Math.round`.
- Hueco reservado: `padding-top: calc(var(--brote) + 8px)`. Son 56 px en escritorio y tablet y 44 px en móvil (< 640 px).
- **Cambio necesario: medir con la posición de layout** (`offsetLeft`/`offsetTop` acumulados por `offsetParent`) en vez de con `getBoundingClientRect() + scroll`.
  - Motivo: mientras la sección está en `data-entrada="inicial"` lleva `translateY(16px)`, y el rect incluye ese desplazamiento.
  - Lo he medido en la maqueta original: clic en «Enlaces» nada más cargar → la mascota queda **18 px metida en el título** (tapa texto). Con la posición de layout queda en el valor de la fórmula.
- La posición de reposo se guarda en `--brote-x/--brote-y` de `#brote` (estructura de Jaina). Se recoloca sin animación con `resize`, `document.fonts.ready` y `ResizeObserver(body)`, **salvo durante un viaje**: entonces el destino se recalcula al aterrizar.

### Eventos

Nombres y `detail` exactos de la maqueta (`CustomEvent` en `#brote`, `bubbles: true`). Lo que fija esta spec es **cuándo** se emiten:

| Evento | Cuándo | `detail` |
|---|---|---|
| `brote:salto` | Al **empezar** el viaje: el primer fotograma de la anticipación, o del saltito si se retargetea. No se emite en la colocación inicial ni con reduced-motion. Con ancla o foco, se emite cuando el scroll ha terminado (§11.6), no en el clic. | `{desde, hasta, origen: 'ancla'\|'foco'\|'scroll'}` |
| `brote:aterrizaje` | Cuando los pies tocan el destino al final del último saltito (`A + n·240 + (n−1)·40` ms después de `brote:salto`). No se emite para un viaje interrumpido por retarget. | `{seccion}` |
| `brote:reposo` | Cuando acaba el asentado (240 ms después de `brote:aterrizaje`), al terminar la aparición inicial (`origen: 'inicio'`) y al terminar el fundido de reduced-motion. | `{seccion, origen?}`. La demo siempre envía `origen`. |

- **Retarget**: se emite un `brote:salto` nuevo con `desde` = destino abandonado y `hasta` = destino nuevo. El viaje abandonado no emite ni `aterrizaje` ni `reposo`.
- **Origen al hacer clic**: el clic en un ancla mueve después el foco a la sección (`tabindex="-1"`) y dispara `focusin`. Si el destino es el mismo, se conserva `origen: 'ancla'`.
- **`data-estado` de `#brote`** se sincroniza con los eventos: `salto` desde `brote:salto`, `aterrizaje` desde `brote:aterrizaje` y `reposo` desde `brote:reposo`.
  - Los valores de forma de §8.3 de Jaina son los **picos** de la animación.
  - Las reglas estáticas de `data-estado` quedan debajo de la WAAPI y solo se ven cuando no hay animación, que es siempre en `reposo`.

### 11.1 Salto entre secciones

**Fases** (constantes):

| Fase | Duración | Notas |
|---|---|---|
| Anticipación (A) | 80 ms | Solo si sale desde parada. 0 ms al retargetear. |
| Saltito | 240 ms cada uno | — |
| Contacto entre saltitos | 40 ms | — |
| Aterrizaje (forma) | 160 ms | §11.2 |
| Asentado de hojas | 240 ms | Desde que toca suelo. Marca el final. |

**Número de saltitos (n)** según la distancia en línea recta `d` entre el origen y el destino efectivos:

- `d ≤ 320 px`: n = 1
- `320 < d ≤ 640 px`: n = 2
- `d > 640 px`: n = 3 (tope)

Cada saltito cubre `d/n`.

**Tiempos** (ms tras `brote:salto`):

| n | `brote:aterrizaje` | `brote:reposo` (fin) |
|---|---|---|
| 1 | 320 | 560 |
| 2 | 600 | 840 |
| 3 | 880 | **1120 = tope absoluto** |

Con retarget (A = 0): 240 / 520 / 800 y 480 / 760 / 1040.

- Un saltito por cada 320 px: la vista sigue botes cortos en vez de un vuelo largo.
- El tope de 3 saltitos y 1120 ms evita que la mascota «haga esperar».

**Trayectoria** (tres animaciones simultáneas, todas de duración `total`):

1. **Avance**: `#brote`, `transform: translate(x, y)`. Cada saltito avanza 1/n del vector origen→destino con la curva `cuerda` y se queda quieto durante la anticipación y los contactos.
2. **Arco**: `#brote`, `translateY` con `composite: 'add'`. En cada saltito va de 0 a `−h` en la mitad (curva `subida`) y vuelve a 0 al final (curva `bajada`).
   - Altura: `h = min(0.5·tamaño + 0.25·(d/n), 1.5·tamaño)`.
   - Escritorio: `min(24 + 0.25·d/n, 72)` px. Móvil: `min(18 + 0.25·d/n, 54)` px.
   - Los saltos cortos son bajos y los largos se ven como saltos claros, sin pasar de 1,5 veces el cuerpo.
3. **Forma (squash & stretch)**: en `svg`, con origen `50% 100%` (§8.2 de Jaina):

| Momento | `scale(x, y)` | Curva hacia el siguiente |
|---|---|---|
| Inicio (valor actual si se retargetea) | `1, 1` | `anticipa` |
| Fin de la anticipación (80 ms) | `1.1, 0.9` | `estira` |
| Saltito +20 % (48 ms) | **`0.86, 1.18`** (estado `salto` de Jaina) | lineal |
| Saltito +80 % (192 ms) | `0.92, 1.08` | `impacto` |
| Fin del saltito intermedio (se mantiene 40 ms) | `1.1, 0.9` | `estira` |
| Fin del último saltito (toca suelo) | **`1.2, 0.8`** (estado `aterrizaje` de Jaina) | §11.2 |

**Hojas en el aire** (`#brote-hoja-izq` / `#brote-hoja-der`, origen `32px 20px` en `view-box`, tal como están en `brote.svg`):

- Inicio (valor actual): curva `salida`.
- A + 72 ms: **−14° / +14°** (estado `salto`: se abren). Se mantienen así hasta tocar suelo.
- Las hojas llegan 24 ms después que el cuerpo: se leen como algo blando que va detrás.

**Carril de vuelo (no cruzar texto).** En vuelo, Brote no pasa por encima del texto: sale de la columna de texto a un carril a su izquierda, baja o sube por él y vuelve al ancla.

- `xTexto` = borde izquierdo del título destino (la columna de texto es común a las tres secciones).
- `xCarril = max(4px, xTexto − tamaño − 8px)` (borde izquierdo de Brote en el carril).
  - Escritorio: `xTexto − 56px`. Queda fuera de la tarjeta, en el margen.
  - Móvil: 4 px desde el borde del viewport.
- Requisito de layout (Jaina y Thrall): `xTexto ≥ tamaño + 6px` en todos los anchos; en móvil, el texto empieza a 42 px o más del borde izquierdo. La maqueta publicada da unos 41 px a 390 px de ancho y hay que comprobarlo a 320 px.
- Desplazamiento horizontal: cuarta animación en `#brote`, `translateX` con `composite:'add'`, de duración `total`:
  - `0` al empezar → `xCarril − xAncla` al terminar la anticipación + 40 % del primer saltito, curva `cubic-bezier(0.33,0,0.67,1)`;
  - se mantiene en el carril;
  - vuelve a `0` desde el 60 % del último saltito hasta tocar suelo, misma curva.
  - Con n = 1 no hay tramo de carril de 48 ms. Se usa la caja que barre Brote en línea recta del origen al destino:
    - si no se cruza con ninguna línea de texto, el salto va recto, sin carril;
    - si se cruza, se fuerza n = 2: total 840 ms, con salida en el primer saltito y vuelta en el segundo.
- El avance vertical, el arco, la forma y los tiempos no cambian. El total sigue siendo 560 / 840 / 1120 ms.
- Con retarget (incluidos los clics rápidos), el viaje relanzado aplica el carril igual que uno nuevo: parte del `translateX` actual, llega al carril al 40 % de su primer saltito y vuelve desde el 60 % del último. Si Brote ya está en el carril, se queda en él. La única excepción es la regla de n = 1 con trayecto recto despejado.
- Con reduced-motion no aplica: fundido sin desplazamiento.

**Navegación con scroll (clic en el nav o foco de teclado).** Sustituye a la regla de «entrar desde el borde» (v1), que en la PR #8 se leía como una aparición de ~100 ms.

- **Brote acompaña el scroll.** Desde el inicio del scroll suave hasta `scrollend`, Brote mantiene su posición **en pantalla**: cada fotograma (rAF) se le suma a su `translate` el desplazamiento de scroll acumulado. No avanza ni salta: la vista lo encuentra donde lo dejó.
- Si al empezar el scroll Brote no está en la zona visible `[alto de la barra, innerHeight]`, se coloca sin animación fuera de vista, justo bajo la barra (`top = alto de la barra − tamaño`), y se trata igual.
- **Al terminar el scroll** (`scrollend`, o 120 ms sin scroll, tope 1500 ms) sale `brote:salto` desde esa posición en pantalla hacia el título destino, con las fases de esta sección: anticipación 80 ms incluida.
- **Saltitos:** `n` según la distancia en pantalla (tabla de arriba), con **mínimo n = 1 completo**. Aunque la distancia sea casi 0, el saltito existe con la altura mínima `h = 0.5·tamaño` (24 px escritorio, 18 px móvil).
- **Duración mínima de la entrada:** 560 ms de `brote:salto` a `brote:reposo` (320 ms hasta `brote:aterrizaje`), todo dentro de la zona visible.
- Destino fuera de la zona visible tras el scroll (caso raro: tope de 1500 ms): se recoloca sin animación y se emiten `salto`, `aterrizaje` y `reposo` seguidos.
- El scroll manual (rueda o dedo) no usa esta regla: la mascota sigue en el documento y salta cuando la sección gana el debounce de 150 ms.
- Por qué: el ojo sigue a Brote, no al contenido. Esperar en su sitio y quedarse fuera de vista la hace desaparecer y reaparecer; acompañar el scroll la mantiene visible y el salto final es entero.

**Cambio de sección a mitad de salto**: nunca se encola ni se termina el viaje anterior.

1. Se lee el estado visual actual: `getComputedStyle(...).transform` de `#brote` (avance + arco), de `svg` y de las dos hojas.
2. Se cancelan las animaciones.
3. Se fija `--brote-x/--brote-y` en esa posición visual, que incluye la altura de arco.
4. Empieza un viaje nuevo **sin anticipación**, cuyo primer keyframe son la escala y los ángulos leídos. No hay saltos de posición ni de forma.

### 11.2 Aterrizaje

Desde que toca suelo (instante `llegada`):

| Qué | Momento | Valor | Curva hacia el siguiente |
|---|---|---|---|
| Forma (`svg`) | llegada | `scale(1.2, 0.8)` | `salida` |
| | +80 ms | `scale(0.96, 1.04)` | `seno` |
| | +160 ms | `scale(1, 1)` | — |
| `#brote-hoja-izq` | llegada | −14° | `salida` |
| | +80 ms | **+12°** (estado `aterrizaje`: se cierran) | `seno` |
| | +240 ms | 0° | — |
| `#brote-hoja-der` | Igual que la izquierda con el signo invertido: +14° → −12° → 0° | | |

- La compresión de Jaina (1.2 × 0.8) se ve en el primer fotograma del contacto y se recupera en 160 ms con un rebote pequeño (4 %). Se lee el peso sin efecto de goma.
- Las hojas se asientan 80 ms después que el cuerpo: es el seguimiento natural.

### 11.3 Reposo

**a) Idle** (solo con `data-estado="reposo"`): se reinicia en cada aterrizaje y todos los ciclos empiezan en su valor neutro, así que no hay salto visual. Todo cabe en el hueco reservado: el máximo es +3 % de alto, es decir, 1,4 px a 48 px.

| Qué | Elemento (origen) | Valores | Duración | Curva | Justificación |
|---|---|---|---|---|---|
| Respirar | `svg` (`50% 100%`) | `scale(1,1)` → 50 %: `scale(0.985, 1.03)` → `scale(1,1)` | 3200 ms, infinito | `seno` | Unas 19 respiraciones por minuto, ritmo de reposo. Se ve viva sin distraer. |
| Brillo de barriga | `#brote-barriga` | opacity 0.85 → 50 %: 1 → 0.85 | 3200 ms, en fase con la respiración | `seno` | El toque bioluminiscente del valle, en la mascota y no repartido por la página. Solo anima opacidad. |
| Parpadeo | `#brote-ojo-izq` (`24.5px 36px`) y `#brote-ojo-der` (`39.5px 36px`), `transform-box: view-box` | `scaleY(1)` hasta 96,19 % → 98,1 %: `scaleY(0.1)` → 100 %: `scaleY(1)` | Ciclo de 4200 ms. El parpadeo dura 160 ms (80 + 80) | Cierre `cubic-bezier(0.4,0,1,1)`, apertura `cubic-bezier(0,0,0.2,1)` | 160 ms es un parpadeo natural. Uno cada 4,2 s. |
| Balanceo de hojas | `#brote-hoja-izq`, `#brote-hoja-der` (`32px 20px`) | 0° → 25 %: +4° → 75 %: −4° → 100 %: 0° | 2600 ms, infinito. La derecha con `animation-delay: −1300ms` | `seno` | El desfase rompe el espejo y parece brisa. ±4° no cambia la silueta. |
| Mejillas | `#brote-mejillas` | Estáticas | — | — | Animarlas sería adorno. |

**b) Aparición inicial**: empieza en el mismo fotograma en que empieza la entrada de la sección inicial (el título pasa de opacity 0), sin esperar a `document.fonts.ready`. Si las fuentes cargan durante la caída y el ancla se mueve, el destino de la caída se actualiza al nuevo ancla sin reiniciar la animación (se cambia `--brote-x/--brote-y` y la caída sigue con `composite:'add'`). Termina con `brote:reposo {seccion, origen:'inicio'}`. Sin `brote:salto`.

| Qué | Valores | Duración | Curva |
|---|---|---|---|
| Opacidad (`#brote`) | 0 → 1 | 160 ms | `desacel` |
| Caída (`#brote`, `composite: 'add'`) | `translateY(−24px)` → `0` | 260 ms | `bajada` |
| Forma (`svg`) | `0.92, 1.08` → al tocar suelo (260 ms) `1.2, 0.8` → +80 ms `0.96, 1.04` → +160 ms `1, 1` | 420 ms | `impacto`, `salida`, `seno` |

Total: 500 ms desde que empieza la entrada de la sección (antes 360 + 500 ms: Garrosh midió 0,7 s sin mascota con el título ya visible). Con `#hash`, aparece directamente en esa sección.

**c) Pausas**

| Situación | Comportamiento |
|---|---|
| Pestaña oculta (`visibilitychange`) | El viaje en curso termina al instante (`animation.finish()`): emite lo que falte (`aterrizaje`, `reposo`) y queda en el destino. Se descarta cualquier salto pendiente de scroll. El idle pasa a `animation-play-state: paused`. |
| `#brote` fuera del viewport (IntersectionObserver) | Idle en pausa. |

### 11.4 Entrada de secciones

**a) Sección** (estados de Jaina §8.6, sin cambios: `data-entrada` de `inicial` a `final`, `threshold 0.12`, una vez, o al recibir foco):

| Parámetro | Valor | Justificación |
|---|---|---|
| Transición | `opacity 480ms cubic-bezier(0.22, 1, 0.36, 1), transform 480ms cubic-bezier(0.22, 1, 0.36, 1)` | Se lee como llegada y es legible antes de medio segundo. La curva `salida` muestra el contenido casi enseguida. |
| Recorrido | `translateY(16px)` → `0` (Jaina) | — |
| Stagger interno | Ninguno: la sección entra como un bloque | La tarjeta de sección ya agrupa su contenido. Escalonar sus hijos haría esperar al texto y obligaría a cambiar el marcado de Jaina. |
| Reduced motion | Directo al estado final, `transition: none` (Jaina) | — |

**b) Indicador de la barra** (estilos de Jaina §6.1; aquí solo se añade el timing):

| Qué | Transición |
|---|---|
| `.nav__enlace` (color) | `color 160ms cubic-bezier(0.22, 1, 0.36, 1)` |
| `.nav__enlace::after` volviendo a reposo | `transform 160ms cubic-bezier(0.4, 0, 1, 1), opacity 160ms cubic-bezier(0.4, 0, 1, 1)` |
| `::after` en hover (`scaleX(.4)`, opacity .6) o activo (`scaleX(1)`) | `transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms cubic-bezier(0.22, 1, 0.36, 1)` |

- El subrayado crece en el sentido de lectura (`transform-origin: left`, de Jaina). La salida es más corta que la entrada, así que domina el estado nuevo.
- Con reduced motion se mantiene: son 3 px de alto y no provocan mareo.
- Los micro-estados de `.boton` (`.15s linear`) son de Jaina y quedan fuera de este encargo. No se tocan.
- El anillo de foco aparece **sin transición**: quien navega con teclado tiene que ver al instante dónde está.

### 11.5 prefers-reduced-motion

| Elemento | Comportamiento |
|---|---|
| Cambio de sección de la mascota | Sin salto, desplazamiento ni squash (propuesta de Jaina), y sin cambio de golpe: fundido de salida de 120 ms (`entrada`, opacity 1→0) → recolocación en el destino sin animación → fundido de entrada de 160 ms (`desacel`, 0→1). Total: 280 ms. Mismos disparadores y esperas (§11.6). Emite solo `brote:reposo {seccion, origen}`, como la maqueta. |
| Idle | Ninguno (`animation: none !important` en `svg` y sus hijos; `svg{transform:none!important}`, de Jaina). |
| Aparición inicial | Solo opacity 0→1, 160 ms, `desacel`, sin retraso: empieza con la entrada de la sección. |
| Secciones | Estado final sin transición. |
| Scroll a ancla | `scroll-behavior: auto` (Jaina). |
| Parallax | No hay en ningún modo. |
| Cambio en caliente | `matchMedia(...).change`: cancela el viaje o la espera en curso y recoloca la mascota sin animación. |

### 11.6 Qué dispara el movimiento y cuándo empieza

La sección activa se decide con la lógica de Jaina (§8.5): clic en ancla con bloqueo hasta `wheel`, `touchstart` o teclas de scroll; `focusin`; IntersectionObserver con umbrales 0, 0.05 … 1. El movimiento añade estas reglas:

| Origen | `aria-current` | Empieza el salto |
|---|---|---|
| `ancla` | Al instante del clic | Al terminar el scroll suave: evento `scrollend`. Si no existe, a los **120 ms** sin eventos `scroll`. Tope: **1500 ms** tras el clic. Si no hay scroll, a los 120 ms. |
| `foco` | Al instante | Igual que `ancla`. |
| `scroll` | Cuando cambia la activa | La candidata (la de más píxeles visibles) debe seguir ganando **150 ms** seguidos (debounce). Entonces cambia la activa y empieza el salto al instante, aunque el usuario siga haciendo scroll. |
| `inicio` | Al cargar | Aparición inicial (§11.3.b). |

- **Por qué el salto espera a que acabe el scroll en vez de sincronizarse con él**:
  - La duración del scroll suave la decide el navegador y no se puede fijar, así que no se podría verificar.
  - Al terminar, el destino ya está en pantalla y Brote, que ha acompañado el scroll (§11.1), salta desde su posición en pantalla con al menos un saltito completo.
- **Debounce de 150 ms**: al cruzar Habilidades con un scroll rápido hacia Enlaces no hay paradas intermedias. 150 ms es menos de lo que se tarda en empezar a leer.
- **Propuesta añadida (pendiente del visto bueno de Jaina)**: si `scrollY ≤ 2`, la activa es la primera sección.
  - Sin esta regla, en pantallas donde cabe toda la página, la regla de «final de página» de la maqueta activa Enlaces al cargar. Lo he medido con un viewport de 1440×2400 en la maqueta original: activa «enlaces».
  - La regla de final de página (`≥ scrollHeight − 4`) se aplica después.

### 11.7 Sustitución de cada PROVISIONAL

Números de línea de `portfolio-design/index.html` y `spec.md` del 21-11-2026:

| # | Ubicación | Valor PROVISIONAL | Sustituto exacto |
|---|---|---|---|
| P1 | `index.html` L123–124 | `.js .seccion{transition:opacity .3s linear, transform .3s linear}` | `.js .seccion{transition:opacity 480ms cubic-bezier(0.22, 1, 0.36, 1), transform 480ms cubic-bezier(0.22, 1, 0.36, 1)}` (§11.4.a) |
| P2 | `index.html` L208–209 | `.brote.en-viaje{transition:transform .35s linear}` | **Se elimina.** El viaje no es una transición CSS, sino tres o más `element.animate()` (§11.1): avance con `cuerda`, arco `subida`/`bajada` con `composite:'add'`, forma y hojas con las tablas de §11.1 y §11.2. Duración `A + n·240 + (n−1)·40 + 240` ms (560 / 840 / 1120). En su lugar van los `@keyframes` de reposo (§11.3.a). |
| P3 | `index.html` L210 | `@media (prefers-reduced-motion:reduce){ .brote,.brote.en-viaje{transition:none} .brote svg{transform:none!important} }` | Se mantiene `.brote svg{transform:none!important}` y se añade `.brote svg,.brote svg *{animation:none!important}`. La regla `transition:none` deja de ser necesaria (no hay transición), aunque es inocua. El cambio de sitio pasa a ser el fundido 120 + 160 ms de §11.5. |
| P4 | `index.html` L420–428 (`setActiva`) | `salto` → viaje lineal `350ms` (`setTimeout 350`) → `aterrizaje` → `setTimeout 140` → `reposo` | Se sustituye por `viajar(desde, hasta, origen)` (§11.1). `brote:salto` al empezar el viaje (tras la espera de §11.6), `brote:aterrizaje` a 320 / 600 / 880 ms (o 240 / 520 / 800 con retarget) y `brote:reposo` a 560 / 840 / 1120 ms (o 480 / 760 / 1040). Los cambios de `data-estado` van en esos mismos instantes. Retarget sin encolar (§11.1). |
| P5 | `spec.md` §8.6 L294 | «transición `.3s linear` marcada PROVISIONAL» | «Transición 480 ms `cubic-bezier(0.22, 1, 0.36, 1)` en opacity y transform, sin stagger (§11.4.a)». |
| P6 | `spec.md` §11 L317–335 | Sección «Movimiento: pendiente de Sylvanas» | Este documento entero. |

**Cambios relacionados con el movimiento en líneas sin la marca PROVISIONAL** (los propongo; los decide Jaina):

| # | Ubicación | Actual | Propuesto | Motivo |
|---|---|---|---|---|
| C1 | `index.html` L196 (`.brote`) | `will-change:transform` permanente | Quitarlo de la regla base. JS lo pone al empezar el viaje y lo quita al terminar | Una capa de GPU permanente sin necesidad (buena práctica de Motion). |
| C2 | `index.html` `puntoDeAnclaje()` (justo antes de L405) | `t.getBoundingClientRect()` + `scrollX/scrollY` | Posición de layout (`offsetLeft`/`offsetTop` acumulados) y la misma fórmula | Evita los 18 px de solape medidos con secciones aún sin entrar (ver Puntos de anclaje). |
| C3 | `index.html` L414–418 (rama `desde === null \|\| reducido.matches`) | Colocación instantánea | Primera colocación: aparición de §11.3.b. Reduced-motion: fundido de §11.5 | No aparecer de golpe. |
| C4 | `index.html` `masVisible()` | Cambio inmediato en cada callback del IO | Debounce de 150 ms y regla `scrollY ≤ 2` → primera (§11.6) | Sin paradas intermedias. Pantallas altas. |
| C5 | `index.html` `recolocar()` | Siempre | Salvo durante un viaje: el destino se recalcula al aterrizar | El `ResizeObserver` no debe romper un viaje en marcha. |
| C6 | `index.html` CSS de la barra | Sin transición | La de §11.4.b | Que el indicador acompañe el cambio. |

### Restricciones (cumplimiento)

| Regla | Cómo se cumple |
|---|---|
| Solo CSS y JS nativos | CSS `transition`/`@keyframes` y Web Animations API. Sin dependencias. |
| Solo `transform` y `opacity` | Todo lo animado. El brillo de la barriga es opacity; el `drop-shadow` es estático. |
| `will-change` acotado | Solo en `#brote` y solo durante el viaje (C1). |
| Lecturas de layout | El viaje lee posiciones una vez al empezar. La sección activa lee `getBoundingClientRect` de 3 secciones solo en los callbacks del IO. No se escribe estilo en handlers de scroll. |
| Objetivo de rendimiento | 60 fps en móvil de gama media. Las animaciones van por el compositor, sin `requestAnimationFrame` que mueva estilos. |
| La mascota no tapa texto | Posada en el hueco reservado (C2 lo garantiza también durante la entrada de secciones). En vuelo va por el carril de §11.1 y no cruza texto. |
| No recibe eventos | `aria-hidden="true"`, `svg focusable="false"`, `pointer-events:none`, sin `tabindex`. `z-index` 15, por debajo de la barra (20). |
| Originalidad | Ni la spec ni la demo nombran ningún juego. |

### 11.8 Comprobado en la demo

Pruebas con Chrome headless sobre `demo.html` a 1440×900, 390×844 y con reduced-motion:
- Sin errores de JS.
- Pies a 1 px dentro del texto del título, que es la fórmula de Jaina (+2) con redondeo. Borde izquierdo a −0,12 × tamaño.
- Clic en Enlaces: `brote:salto {desde:'sobre-mi', hasta:'enlaces', origen:'ancla'}` al terminar el scroll suave. `brote:aterrizaje` 600 ms después (n = 2) y `brote:reposo` 249 ms más tarde.
- Viewport de 2400 px sin scroll: 3 saltitos, altura de arco 72 px, salto a +121 ms del clic, aterrizaje a +880 ms y reposo a +1138 ms.
- Retarget: segundo `brote:salto` sin `aterrizaje` intermedio.
- Reduced-motion: solo `brote:reposo`.

### 11.9 Pendiente de Jaina

1. Visto bueno a C1–C6 (11.7), sobre todo C2 (corrige un solape real) y la regla `scrollY ≤ 2` de C4.
2. Confirmar los orígenes de los ojos (`24.5px 36px` y `39.5px 36px`, centro de cada elipse en `brote.svg`) para el parpadeo.
3. Confirmar que el brillo de la barriga (opacity 0.85↔1) encaja con su `drop-shadow`.
4. ¿Quiere luciérnagas o partículas de ambiente?
   - Esta spec **no las incluye** en la v1. El toque bioluminiscente queda en la barriga de Brote, porque su diseño no las contempla y añadirían un control de desactivación.
   - Si las quiere, propuesta: 12 puntos de 4 px (6 en móvil), laguna y sol, ciclo de 9000 ms lineal, opacidad máxima 0.7, `position:fixed; z-index:0`, ocultas con reduced-motion.

### 11.10 Criterios de aceptación

Se verifican con DevTools: Animations (velocidad 10 %), Performance, Rendering → *Emulate prefers-reduced-motion*, y un listener de consola para `brote:*`.

1. Posada, la mascota cumple la fórmula de anclaje (con `Math.round`) medida con la posición de layout. Mide 48×48 px con ≥ 640 px de ancho y 36×36 px por debajo.
2. Posada, nunca se cruza con el texto del título más de 2 px, que es lo que da la fórmula de Jaina. Tampoco justo después de navegar a una sección que aún no había entrado.
3. Lleva `aria-hidden="true"` y `pointer-events:none`, no recibe foco con Tab y su `z-index` (15) es menor que el de la barra (20).
4. Idle (solo en `reposo`):
   - `svg` cicla `scale(1,1)`↔`scale(0.985,1.03)` en 3200 ms con `cubic-bezier(0.37,0,0.63,1)`.
   - `#brote-barriga` cicla opacity 0.85↔1 en 3200 ms, en fase.
   - Los ojos hacen `scaleY 1→0.1→1` en 160 ms cada 4200 ms.
   - Las hojas hacen ±4° en 2600 ms, con la derecha desfasada 1300 ms.
   - Las mejillas, estáticas.
5. Durante el viaje no corre el idle. Al aterrizar vuelve a empezar desde el valor neutro, sin saltos visuales.
6. Scroll: el salto empieza 150 ms después de que la nueva sección gane por píxeles visibles, y no empieza si deja de ganar antes. Con `scrollY ≤ 2` la activa es Sobre mí. Al final de la página (`≥ scrollHeight − 4`) es Enlaces.
7. Clic en un ancla:
   - `aria-current` cambia al instante.
   - No hay saltos a secciones intermedias.
   - `brote:salto` llega con `origen:'ancla'` cuando termina el scroll (`scrollend`, o 120 ms sin `scroll`), nunca más de 1500 ms después del clic.
8. Tab hasta un elemento de otra sección: salto con `origen:'foco'` y la misma regla de espera que el punto 7.
9. Saltitos: 1 si d ≤ 320 px, 2 si d ≤ 640 px y 3 si d > 640 px.
10. Tiempos desde `brote:salto`:
    - Sin retarget: `brote:aterrizaje` a 320 / 600 / 880 ms y `brote:reposo` a 560 / 840 / 1120 ms para n = 1 / 2 / 3.
    - Con retarget: 80 ms menos en ambos.
    - Ningún viaje dura más de 1120 ms.
11. El arco no pasa de 72 px (48 px de mascota) ni de 54 px (36 px) y sigue `min(0.5·tamaño + 0.25·d/n, 1.5·tamaño)`.
12. Curvas del viaje:
    - Avance: `cubic-bezier(0.3,0,0.7,1)`.
    - Subida del arco: `cubic-bezier(0.5,1,0.89,1)`. Bajada: `cubic-bezier(0.11,0,0.5,0)`.
    - Escalas del `svg`: `1.1,0.9` → `0.86,1.18` → `0.92,1.08` → (`1.1,0.9` en los contactos) → `1.2,0.8` → `0.96,1.04` → `1,1`, en los instantes de §11.1 y §11.2.
13. Hojas: ∓14° en el aire (A + 72 ms), ±12° a llegada + 80 ms y 0° a llegada + 240 ms, girando sobre `32px 20px` del viewBox.
14. Cambio de destino a mitad de viaje: el rumbo cambia desde la posición visual actual, sin saltos de posición, escala ni ángulo y sin anticipación. Se emite un `brote:salto` nuevo y no hay `aterrizaje` ni `reposo` del viaje abandonado.
15. Navegación con clic en el nav o foco: en cada fotograma desde el clic hasta `brote:reposo`, Brote está al menos al 50 % dentro de la zona visible; durante el scroll suave su posición en pantalla varía ≤ 2 px entre fotogramas; de `brote:salto` a `brote:aterrizaje` hay ≥ 320 ms y a `brote:reposo` ≥ 560 ms; el salto tiene n ≥ 1 saltito completo con arco ≥ 0.5·tamaño (24 px escritorio, 18 px móvil).
16. Eventos: los nombres son exactamente `brote:salto`, `brote:aterrizaje` y `brote:reposo`, con `detail` `{desde,hasta,origen}`, `{seccion}` y `{seccion,origen?}`. Burbujean y `data-estado` cambia en el mismo instante.
17. Pestaña oculta: el viaje termina al instante y emite los eventos que faltaban. El idle queda en `paused`.
18. Entrada de sección: `opacity 0→1` y `translateY(16px→0)` en 480 ms con `cubic-bezier(0.22,1,0.36,1)` al entrar el 12 % de la sección, una sola vez. Sin JS todo es visible.
19. Barra: el color cambia en 160 ms. El subrayado entra en 240 ms con `cubic-bezier(0.22,1,0.36,1)` y vuelve en 160 ms con `cubic-bezier(0.4,0,1,1)`.
20. Aparición inicial: Brote tiene opacity > 0 como mucho 1 fotograma (17 ms) después de que el título inicial tenga opacity > 0, y está en `brote:reposo` como mucho 500 ms después; caída de 24 px en 260 ms con fundido de 160 ms y aterrizaje de 160 ms. Termina con `brote:reposo {origen:'inicio'}`, sin `brote:salto`.
21. Reduced-motion:
    - Cambio de sección con fundidos de 120 + 160 ms, sin desplazamiento visible y solo con `brote:reposo`.
    - Sin idle.
    - Secciones directamente en estado final.
    - `scroll-behavior:auto` y ningún parallax.
22. Activar o desactivar reduced-motion con la página abierta se aplica sin recargar.
23. En una grabación de Performance de un viaje solo se animan `transform` y `opacity`, y no hay *Layout* provocado por la animación. `will-change` existe solo en `#brote` y solo durante el viaje.
24. A 320 px de ancho no aparece scroll horizontal en ningún momento.
25. No queda ninguna marca `PROVISIONAL – movimiento de Sylvanas` en el código entregado.
26. Carril de vuelo: entre `brote:salto` y `brote:aterrizaje`, a 390 px y 1440 px, la caja de Brote no se cruza con la caja de ninguna línea de texto (párrafos, rasgos, chips, enlaces). Solo se exceptúan los títulos de origen y destino durante los 120 ms primeros y últimos. En el carril, el borde izquierdo de Brote está en `max(4px, xTexto − tamaño − 8px)` con ±1 px.
27. Ningún viaje tiene un tramo de carril de menos de 120 ms: o va recto sin carril (n = 1 con trayecto despejado), o tiene n ≥ 2. Los viajes relanzados por clics rápidos cumplen el criterio 26 y van por el carril salvo esa excepción.
