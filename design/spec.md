# Portfolio personal v1 · Daniel Saez — Especificación de diseño

Autora: Jaina (UX/UI) · Movimiento: Sylvanas (pendiente) · Ingeniería: Thrall
Maqueta de referencia: `index.html` (autocontenida). Mascota suelta: `brote.svg`. Capturas: `capturas/`.

## 1. Objetivo
Una sola página, bonita y original, que presente a Daniel en tres pasos: quién es (Sobre mí), qué sabe hacer (Habilidades) y dónde encontrarle (Enlaces). Cada sección está a un clic desde la barra superior. Una mascota pequeña, **Brote**, se posa sobre el título de la sección activa.

- Stack: HTML + CSS + JS sin framework y **sin dependencias**. Única petición externa: Google Fonts.
- Concepto visual: *valle selvático escondido al amanecer*: selva frondosa en una cuenca, agua turquesa, luz dorada cálida, bruma suave, piedras antiguas con vetas que brillan.
- Regla de originalidad: es solo inspiración. En la página, el código y los assets no hay imágenes, logos, nombres ni términos de ningún videojuego. Todos los SVG están dibujados a mano para este proyecto.

## 2. Estructura
```
header.nav (fija)        "Daniel Saez"  ·  [Sobre mí] [Habilidades] [Enlaces]
main
  section#sobre-mi        h1 "Daniel Saez" + antetítulo "Sobre mí" + texto (hero integrado)
  .separador              línea de agua + bruma
  section#habilidades     h2 + tarjeta "Rasgo principal" + lista de piedras
  .separador
  section#enlaces         h2 + intro + botones LinkedIn / GitHub
footer.pie                "© {año} Daniel Saez"
div#brote (aria-hidden)   mascota, posicionada en absoluto sobre el documento
```
Cada `section` lleva `data-seccion`, `aria-labelledby` apuntando a su título, `tabindex="-1"` (destino de ancla enfocable) y `data-entrada` (estado de entrada). Cada título lleva la clase `.titulo-seccion`.

## 3. Tokens

### 3.1 Color
| Token | Hex | Uso |
|---|---|---|
| `--selva-950` | `#0B2A22` | Fondo profundo, inicio del degradado, texto sobre botón relleno |
| `--selva-800` | `#14453A` | Final del degradado, base de tarjetas |
| `--hoja-500` | `#3FA36B` | Hojas decorativas y hojas de Brote (**no para texto**) |
| `--hoja-300` | `#8FD694` | Cuerpo de Brote, nervios de hojas |
| `--laguna-400` | `#2EC4B6` | Acento principal: enlaces, iconos, bordes, **anillo de foco** |
| `--laguna-200` | `#A8F0E6` | Barriga de Brote, antetítulos, etiqueta "Principal", vetas |
| `--sol-400` | `#F2C14E` | Acento cálido: subrayado de nav activa, rasgo principal, mejillas |
| `--bruma-50` | `#F3F7EF` | Texto principal |
| `--piedra-400` | `#8A8F7A` | **Solo decorativo** (no pasa AA sobre `--selva-800`) |
| `--piedra-300` | `#B4B9A6` | **Nuevo, ajuste AA**: texto secundario (intros, footer) |
| `--tarjeta-bg` | `rgba(20,69,58,.55)` | Fondo de tarjeta de sección |
| `--tarjeta-borde` | `rgba(46,196,182,.25)` | Borde de tarjeta y de la barra |

**Contraste (WCAG 2.1) medido** sobre el peor fondo (`--selva-800`) y el mejor (`--selva-950`):

| Texto | sobre 950 | sobre 800 | Resultado |
|---|---|---|---|
| bruma-50 | 14.15 | 9.97 | AA/AAA ✔ |
| laguna-400 | 7.08 | 4.99 | AA ✔ |
| laguna-200 | 11.89 | 8.38 | AA ✔ |
| sol-400 | 9.14 | 6.44 | AA ✔ |
| hoja-300 | 8.93 | 6.29 | AA ✔ |
| piedra-400 | 4.60 | **3.24** | ✘ en texto normal → sustituido por piedra-300 |
| piedra-300 | 7.62 | 5.37 | AA ✔ |
| hoja-500 | 4.87 | **3.43** | Solo decorativo |
| anillo de foco laguna-400 vs fondo | 7.08 | 4.99 | ≥ 3:1 (no-texto) ✔ |

### 3.2 Tipografía (Google Fonts)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Nunito:wght@400;600&display=swap" rel="stylesheet">
```
| Rol | Familia | Peso | Tamaño | Interlineado |
|---|---|---|---|---|
| h1 (nombre) | Fraunces, Georgia, serif | 700 | `clamp(2.2rem, 6vw, 4rem)` | 1.15 |
| h2 (sección) | Fraunces | 600 | `clamp(1.6rem, 4vw, 2.4rem)` | 1.15 |
| Texto rasgo principal | Fraunces | 600 | `clamp(1.25rem, 2.6vw, 1.5rem)` | 1.35 |
| Texto destacado (Sobre mí) | Nunito | 400 | 1.25rem (1.125rem en móvil) | 1.55 |
| Cuerpo | Nunito, system-ui, sans-serif | 400 | 1.0625rem | 1.6 |
| Nav, botones, piedras | Nunito | 600 | 1rem / 1.125rem botones / 0.9375rem nav móvil | 1.3 |
| Antetítulo / etiquetas | Nunito | 600, MAYÚSCULAS, tracking .08–.12em | 0.875rem (0.75rem etiqueta "Principal") | — |

### 3.3 Espaciado (escala 4/8/12/16/24/32/48/64)
`--e-1:4px` `--e-2:8px` `--e-3:12px` `--e-4:16px` `--e-5:24px` `--e-6:32px` `--e-7:48px` `--e-8:64px`. No usar valores fuera de la escala (excepción: el hueco de la mascota, `--brote + 8px`).

### 3.4 Radios
`--r-tarjeta:20px` (secciones, rasgo principal) · `--r-boton:16px` · `--r-pildora:999px` (etiquetas) · piedras: radio asimétrico, 3 variantes que rotan con `:nth-child(3n+…)`:
```css
.piedra                 { border-radius:18px 26px 16px 24px / 22px 16px 26px 18px; }
.piedra:nth-child(3n+2) { border-radius:24px 16px 26px 18px / 18px 26px 16px 22px; }
.piedra:nth-child(3n+3) { border-radius:16px 24px 20px 26px / 26px 20px 22px 16px; }
```

### 3.5 Otros
`--ancho-max:960px` · `--alto-nav:64px` (56px móvil) · `--brote:48px` (36px móvil) · `--anillo-foco:3px solid var(--laguna-400)`.

## 4. Layout por sección
Breakpoints: **móvil < 640px**, **tablet 640–1023px**, **escritorio ≥ 1024px**. Todo es una sola columna centrada; lo que cambia es el aire y la disposición de los botones.

| Elemento | Móvil (<640) | Tablet (640–1023) | Escritorio (≥1024) |
|---|---|---|---|
| Contenedor `main` | ancho 100%, padding lateral 16px | máx. 960px + 2×32px, padding lateral 32px | igual que tablet, centrado |
| Padding superior de `main` | alto nav + 24px | alto nav + 48px | alto nav + 48px |
| Tarjeta de sección | padding 24px | padding 32px | padding 48px |
| Separador entre secciones | alto 48px | alto 64px | alto 64px (+8px margen arriba/abajo) |
| Barra | alto 56px, padding lateral 16px, anclas con padding 0 8px, 15px | alto 64px, padding 32px | alto 64px, alineada al contenedor de 960px |

**Sobre mí (hero integrado)**: 1 columna. `h1` con hueco de mascota arriba → antetítulo "Sobre mí" (12px debajo) → texto (24px debajo, máx. **60ch**, 2 párrafos separados 12px).

**Habilidades**: 1 columna. `h2` → tarjeta **Rasgo principal** a ancho completo (32px debajo; padding 24px 32px, 16px en móvil; icono estrella 32px, 24px en móvil) → lista de piedras (24px debajo) en `flex-wrap`, separación 12px (8px en móvil). En escritorio caben 3 piedras por fila; en móvil una por fila si el texto es largo (se ajustan a su contenido, máx. 100% del ancho, el texto hace salto de línea dentro de la piedra).

**Enlaces**: `h2` → intro (12px) → rejilla de botones (24px debajo): **2 columnas iguales, máx. 640px** en tablet/escritorio; **1 columna a ancho completo, separación 12px** en móvil.

**Footer**: centrado, padding 32px 16px 48px, 0.875rem, `--piedra-300`.

## 5. Fondos y texturas (CSS/SVG exacto)

### 5.1 Fondo de página (amanecer + cuenca)
```css
body{
  background:
    radial-gradient(ellipse 80% 45% at 50% 0%,  rgba(242,193,78,.16), rgba(242,193,78,0) 70%), /* luz dorada */
    radial-gradient(ellipse 60% 40% at 50% 100%, rgba(46,196,182,.10), rgba(46,196,182,0) 70%), /* reflejo de agua */
    linear-gradient(180deg, #0B2A22 0%, #14453A 100%);
  background-color:#0B2A22;
}
```

### 5.2 Hojas de los bordes
Dos contenedores fijos (`.hojas--izq`, `.hojas--der`), `aria-hidden="true"`, `pointer-events:none`, `z-index:0`, ancho `min(22vw,260px)`, opacidad .55 (móvil: 34vw, .35 y sin el grupo inferior). El derecho es el izquierdo espejado con `transform:scaleX(-1)`; el grupo inferior se espeja con `scaleY(-1)`. SVG (viewBox 0 0 260 360), grupo superior izquierdo:
```html
<svg viewBox="0 0 260 360" fill="none">
  <g fill="#3FA36B" opacity=".55">
    <path d="M-10 40 C 60 30, 130 60, 170 120 C 110 120, 40 95, -10 40 Z"/>
    <path d="M-10 140 C 50 120, 120 140, 150 200 C 90 205, 30 185, -10 140 Z"/>
    <path d="M-10 250 C 40 235, 95 255, 115 300 C 65 305, 20 290, -10 250 Z"/>
  </g>
  <g fill="#14453A">
    <path d="M-20 -10 C 70 -20, 170 10, 230 80 C 150 90, 50 60, -20 -10 Z"/>
    <path d="M-20 80 C 40 70, 90 90, 120 140 C 70 145, 20 125, -20 80 Z" opacity=".9"/>
  </g>
  <path d="M-10 40 C 60 50, 120 80, 165 118 M-10 140 C 45 145, 100 165, 148 198"
        stroke="#8FD694" stroke-opacity=".25" stroke-width="1.5"/>
</svg>
```
El resto de grupos (inferior izquierdo, superior e inferior derecho) están en `index.html`; son variaciones de la misma hoja (curva bezier cerrada + nervio).

### 5.3 Tarjeta de sección
```css
.seccion{
  background:rgba(20,69,58,.55);
  border:1px solid rgba(46,196,182,.25);
  border-radius:20px;
  box-shadow:0 20px 48px -24px rgba(0,0,0,.45), inset 0 1px 0 rgba(168,240,230,.06);
}
```

### 5.4 Separador: línea de agua + franja de bruma
```css
.separador{position:relative; height:64px; margin:8px 0; pointer-events:none}
.separador::before{content:""; position:absolute; inset:0;
  background:linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.08) 50%, rgba(255,255,255,0) 100%);
  mask-image:linear-gradient(90deg, transparent 0%, #000 18%, #000 82%, transparent 100%)}
.separador svg{position:absolute; left:0; top:50%; width:100%; height:24px; transform:translateY(-50%)}
```
```html
<div class="separador" aria-hidden="true">
  <svg viewBox="0 0 480 24" preserveAspectRatio="none" fill="none">
    <path d="M0 12 C 40 2, 80 2, 120 12 S 200 22, 240 12 S 320 2, 360 12 S 440 22, 480 12"
          stroke="#2EC4B6" stroke-opacity=".45" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    <path d="M0 17 C 40 9, 80 9, 120 17 S 200 25, 240 17 S 320 9, 360 17 S 440 25, 480 17"
          stroke="#A8F0E6" stroke-opacity=".18" stroke-width="1" vector-effect="non-scaling-stroke"/>
  </svg>
</div>
```
El segundo separador usa la onda invertida (ver `index.html`) para que no se repita.

### 5.5 Piedra con veta brillante
```css
.piedra{
  background:linear-gradient(160deg, #1d5446 0%, #123d33 100%);
  border:1px solid rgba(46,196,182,.35);
  box-shadow:0 0 0 1px rgba(11,42,34,.6), 0 0 14px rgba(46,196,182,.12), inset 0 1px 0 rgba(243,247,239,.08);
}
.piedra::before{ /* veta */
  content:""; position:absolute; left:8%; bottom:5px; width:38%; height:1.5px; transform:rotate(-4deg);
  background:linear-gradient(90deg, rgba(168,240,230,0), rgba(168,240,230,.45), rgba(168,240,230,0));
}
.piedra:nth-child(3n+2)::before{left:auto; right:10%; bottom:auto; top:5px; transform:rotate(3deg)}
```

### 5.6 Rasgo principal
```css
.rasgo{border:1.5px solid #F2C14E; border-radius:20px;
  background:linear-gradient(135deg, rgba(242,193,78,.12), rgba(242,193,78,.03))}
```

## 6. Componentes y estados

### 6.1 Barra de navegación
- Fija arriba, fondo `rgba(11,42,34,.82)` + `backdrop-filter: blur(10px)`, borde inferior `--tarjeta-borde`.
- Izquierda: "Daniel Saez" (Fraunces 700, 1.25rem; 1rem en móvil). Es texto, **no** enlace (evita una parada de tabulación duplicada).
- Derecha: 3 anclas `#sobre-mi`, `#habilidades`, `#enlaces`. **Sin menú hamburguesa en móvil**: los 3 textos caben a 390px (15px, padding 0 8px).

| Estado | Estilo |
|---|---|
| Normal | texto `--bruma-50`, 600, área táctil mín. 44px de alto |
| Hover | texto `--laguna-200`, subrayado `--sol-400` al 40% de ancho y 60% de opacidad |
| Focus (`:focus-visible`) | anillo 3px `--laguna-400`, offset 0, radio 10px |
| Activo (sección activa) | `aria-current="true"`, texto `--sol-400`, subrayado 3px `--sol-400` a ancho completo, 6px sobre la base |

### 6.2 Tarjeta de sección
Sin estados interactivos. Ver 5.3. Estados de entrada en §8.4.

### 6.3 Tarjeta "Rasgo principal"
Estática. Icono estrella SVG propio (trazo `--sol-400`), etiqueta "RASGO PRINCIPAL" (`--sol-400`, 0.875rem, mayúsculas) y texto en Fraunces 600.

### 6.4 Piedras de habilidad (`ul.piedras > li.piedra`)
- Componente preparado para **4 a 12 elementos** sin romperse: `flex-wrap`, separación fija, sin anchos fijos, `overflow-wrap:anywhere`, alto mín. 48px. Verificado con 4 y 12 (capturas `prueba-habilidades-*`; en la maqueta, `?habilidades=N` rellena hasta N con textos de prueba: **solo maqueta, no implementar**).
- Orden = orden de peso. La primera lleva la variante **`.piedra--principal`**: borde 1.5px `--laguna-400` sólido, halo `0 0 18px rgba(46,196,182,.28)` y etiqueta "PRINCIPAL" (píldora, fondo `rgba(46,196,182,.18)`, texto `--laguna-200`, 0.75rem).
- Sin hover/focus: no son interactivas (no llevan enlace ni tabindex).

### 6.5 Botones de enlace (`a.boton`)
Alto mín. 56px, padding 12px 24px, radio 16px, icono SVG propio 24px en `--laguna-400` + texto 1.125rem 600. Abren en pestaña nueva (`target="_blank" rel="noopener"`) con aviso solo para lectores: "(se abre en una pestaña nueva)".

| Estado | Estilo |
|---|---|
| Normal | fondo `rgba(46,196,182,.12)`, borde 1px `rgba(46,196,182,.5)`, texto `--bruma-50` |
| Hover | fondo `rgba(46,196,182,.22)`, borde `--laguna-400` |
| Focus | anillo `3px solid --laguna-400`, offset 3px |
| Activo (pulsado) | fondo `rgba(46,196,182,.30)`, `translateY(1px)` |

Iconos: LinkedIn = cuadrado redondeado con "in" trazado; GitHub = icono de ramas (tres nodos conectados). Ambos son dibujos propios simples, no los logotipos oficiales (ver `index.html`).

## 7. Accesibilidad
- **Contraste**: tabla §3.1. Todo texto ≥ 4.5:1; `--piedra-400` y `--hoja-500` solo decorativos.
- **Foco visible**: `:focus-visible` con anillo 3px `--laguna-400` en todo lo interactivo. Nunca `outline:none` sin sustituto.
- **Orden de tabulación**: Sobre mí (nav) → Habilidades (nav) → Enlaces (nav) → LinkedIn → GitHub. Total 5 paradas, sin trampas.
- **Anclas**: cada sección tiene `tabindex="-1"` para recibir foco al navegar; `scroll-padding-top: alto-nav + 16px` para que la barra fija no tape el título.
- **Semántica**: `header > nav[aria-label="Secciones"]`, `main`, `section[aria-labelledby]`, un único `h1` y `h2` por sección, `ul` para habilidades (`aria-label="Habilidades por orden de peso"`), `footer`.
- **Decorativo**: hojas, separadores, iconos y mascota con `aria-hidden="true"`; la mascota además `pointer-events:none`.
- **Movimiento**: `prefers-reduced-motion: reduce` → `scroll-behavior:auto`, secciones en estado final sin transición, mascota cambia de sitio sin salto.
- `lang="es"`, `meta viewport`, sin desbordamiento horizontal a 390px (verificado).

## 8. Mascota "Brote"

### 8.1 Aspecto
Semilla-espíritu redonda, original. SVG propio, `viewBox="0 0 64 64"` (archivo `brote.svg`, idéntico al inline de `index.html`).
- Cuerpo `--hoja-300` (#8FD694), forma de gota redondeada, reflejo blanco al 35% arriba a la izquierda.
- Barriga `--laguna-200` (#A8F0E6) con degradado radial blanco en el centro y brillo `drop-shadow(0 0 3px rgba(168,240,230,.8))`.
- Dos hojitas en la cabeza `--hoja-500` (#3FA36B) con nervio `--hoja-300`.
- Ojos grandes `#0B2A22` con brillo blanco grande + pequeño.
- Mejillas `--sol-400` (#F2C14E) al 85%.
- **Sin cola.**

### 8.2 Grupos animables (ids)
| id | Contenido | Origen de transformación |
|---|---|---|
| `#brote-cuerpo` | cuerpo + reflejo | — (el squash/stretch se aplica al `svg` entero, origen `50% 100%`, en los pies) |
| `#brote-barriga` | barriga brillante | — |
| `#brote-ojos` | contiene `#brote-ojo-izq` y `#brote-ojo-der` | — |
| `#brote-hoja-izq` | hoja izquierda + nervio | **base de la hoja: (32, 20)** en unidades del viewBox → `transform-box:view-box; transform-origin:32px 20px` |
| `#brote-hoja-der` | hoja derecha + nervio | **(32, 20)**, igual |
| `#brote-mejillas` | ambas mejillas | — |
Orden de pintado (de atrás a delante): hojas → cuerpo → barriga → ojos → mejillas.

### 8.3 Tamaños y estados
- Tamaño: **48×48px escritorio y tablet, 36×36px móvil** (`--brote`).
- Estados (solo forma; la transición entre ellos es de Sylvanas). Se controlan con `data-estado` en `#brote`:

| Estado | Forma | Hojas |
|---|---|---|
| `reposo` (posada) | `transform:none` | rectas |
| `salto` (estirada vertical) | `scale(.86, 1.18)` | izq. `rotate(-14deg)`, der. `rotate(14deg)` (se abren) |
| `aterrizaje` (aplastada) | `scale(1.2, .8)` | izq. `rotate(12deg)`, der. `rotate(-12deg)` (se cierran) |

Ver `capturas/mascota.png`.

### 8.4 Anclaje
**Igual en móvil y escritorio**: posada **encima del borde superior izquierdo del título** (`.titulo-seccion`, el `h1` en Sobre mí y el `h2` en las demás) de la sección activa.
- Cada título reserva el hueco: `.titulo-seccion{ padding-top: calc(var(--brote) + 8px) }` → la mascota nunca tapa texto.
- Punto de anclaje (coordenadas del documento):
  `x = título.left + scrollX − 0.12 × tamaño` (compensa el margen transparente del viewBox para que el cuerpo quede alineado con la primera letra)
  `y = título.top + scrollY + padding-top − tamaño + 2` (los pies tocan la línea superior del texto del título).
- `#brote` es `position:absolute` en `body`, se mueve con `transform: translate(var(--brote-x), var(--brote-y))`, `z-index:15` (por debajo de la barra, `z-index:20`).
- Recalcular sin animación en `resize`, al cargar fuentes (`document.fonts.ready`) y con `ResizeObserver` sobre `body`.

### 8.5 Qué es la "sección activa"
Prioridad:
1. **Clic en un ancla de la barra** → esa sección, de inmediato. Queda "bloqueada" hasta que el usuario haga scroll a mano (`wheel`, `touchstart` o teclas de scroll), para que el scroll suave no la cambie a mitad de camino.
2. **Foco de teclado dentro de una sección** (`focusin`) → esa sección.
3. **Scroll** → la sección con más píxeles visibles en el viewport (descontando la barra), calculado en el callback de un `IntersectionObserver` con umbrales 0, 0.05 … 1. Si se llega al final de la página, se activa la última (Enlaces, que es corta).
Al cargar: la sección del `#hash` si existe; si no, Sobre mí. La sección activa también marca `aria-current="true"` en su ancla.

### 8.6 Estados de entrada de sección
Solo estados; el timing es de Sylvanas.
- Inicial: `data-entrada="inicial"` → `opacity:0; transform:translateY(16px)`.
- Final: `data-entrada="final"` → `opacity:1; transform:translateY(0)`.
- Pasa a final cuando el 12% de la sección entra en el viewport (`IntersectionObserver`, una sola vez) o cuando recibe foco.
- Los estados solo se aplican con la clase `.js` en `<html>` (sin JS el contenido se ve).
- `prefers-reduced-motion: reduce` → aparece directamente en el estado final, sin transición.
- Transición 480 ms `cubic-bezier(0.22, 1, 0.36, 1)` en opacity y transform, sin stagger (véase `design/motion-spec.md` §11.4.a).

## 9. Copy
**Sobre mí** (*propuesta de copy de Jaina, pendiente de visto bueno de Daniel*):
> Soy una persona muy curiosa e inquieta: me gusta entender cómo funcionan las cosas por dentro y no me quedo quieto hasta conseguirlo.
> Cuando me marco un objetivo, siempre encuentro la forma de llegar a él.

**Habilidades** (contenido final, textos literales, por orden de peso):
- Rasgo principal (tarjeta destacada): *Preparación y organización de desarrollos y releases en un equipo de producto.*
1. Backend en .NET — etiqueta "Principal"
2. Front-end en Angular
3. Diseño de arquitecturas técnicas
4. Participación en decisiones de producto

**Enlaces**: intro "Dónde encontrarme." · LinkedIn → `https://www.linkedin.com/in/daniel-saez-vilarrubia-667737206/` · GitHub → `https://github.com/daniel-saezv`. LinkedIn es solo enlace: sin fotos ni extractos.

**Footer**: "© {año actual} Daniel Saez" (año por JS; 2026 como valor por defecto en el HTML).

## 10. Huecos pendientes
- Visto bueno de Daniel a la propuesta de copy de *Sobre mí*.
(Habilidades, URL de LinkedIn y movimiento §11 ya están resueltas; movimiento en `design/motion-spec.md`.)

## 11. Movimiento

La especificación completa de animación (Sylvanas) está en **`design/motion-spec.md`**. Incluye puntos de anclaje, eventos `brote:*`, saltos con Web Animations API, reposo, entradas de sección, `prefers-reduced-motion` y los criterios de aceptación §11.10.

## 12. Archivos
- `index.html`: maqueta funcional autocontenida.
- `brote.svg`: mascota suelta con grupos e ids.
- `capturas/escritorio-1440.png`, `capturas/movil-390.png`: página completa.
- `capturas/escritorio-1440-enlaces-activa.png`, `capturas/movil-390-enlaces-activa.png`: mascota tras clic en "Enlaces".
- `capturas/mascota.png`: los 3 estados.
- `capturas/prueba-habilidades-4-movil.png`, `prueba-habilidades-12-movil.png`, `prueba-habilidades-12-escritorio.png`: prueba de 4 y 12 elementos.
- `shots.mjs`: script de capturas y comprobaciones (Playwright, herramienta de diseño; **no** es dependencia del proyecto).
