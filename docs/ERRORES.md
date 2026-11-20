# Errores y reglas para no repetirlos

## 19 nov 2026 · Prueba de subida grande con Content-Length falso
**Qué pasó:** la prueba de "archivo de más de 50 MB" mandaba 10 bytes con la cabecera `Content-Length` inflada. `requests` reescribe esa cabecera con el tamaño real, así que el servidor recibió un multipart roto y respondió 400 en vez de 413.
**Regla para no repetirlo:** para probar límites de tamaño, subir un archivo real que pase el límite (51 MB en memoria está bien) y revisar que no quede basura en `data/medios/`. No falsificar cabeceras con `requests`.

## 19 nov 2026 · Carrera en el hilo de trabajos (trabajo "huérfano" falso)
**Qué pasó:** en el diseño del gestor, el `tic()` leía primero los trabajos activos y después la lista de hilos en curso. Si un hilo de imagen terminaba justo en medio, el trabajo salía "generando" sin hilo y se marcaba como fallo por "se cerró la app". Además, el progreso estimado podía pisar un trabajo ya listo (100 → 40).
**Regla para no repetirlo:** tomar la foto de `_en_proceso` ANTES de consultar la base, y mover el progreso solo con `UPDATE ... WHERE estado = 'generando'` (función `_progreso`).

## 19 nov 2026 · En el contenedor no hay httpx
**Qué pasó:** `starlette.testclient` necesita httpx y no está (ni se puede instalar).
**Regla para no repetirlo:** las pruebas de rutas levantan uvicorn en un subproceso en un puerto libre y pegan con `requests` (fixture `servidor` en `tests/conftest.py`). Los proveedores se prueban con servidores falsos de `http.server` (`tests/falsos.py`), nunca contra servicios reales: el fixture anula todas las llaves del `.env`.

## 19 nov 2026 · Modelos de Higgsfield inventados
**Qué pasó:** en `app/catalogo.py` puse a mano seis modelos de Higgsfield (kling-3.0, veo-3.1, nano-banana-pro, soul-2, seedream-5-lite, higgsfield-audio) con resoluciones, formatos y duraciones supuestas, y slugs adivinados para el MCP. El catálogo real de la cuenta (leído con el conector de solo lectura) tiene 26 modelos con otros ids (`kling4_0`, `cinematic_studio_video_4_0`, `soul_2`...) y otras opciones (`std`/`pro`, `2K`, `auto`, `1k`/`4k`). Además, el historial (`show_generations`) no trae prompts, así que "aprender prompts del historial" no servía.
**Regla para no repetirlo:** no inventar modelos ni parámetros: leer el catálogo real (`models_list` / `models_get`) y cargarlo desde `data/presets/higgsfield_catalogo.json`. En la app el id es `"hf:" + id real` y al MCP se manda el id real tal cual. Probar con datos que imiten la respuesta real (sin prompts en el historial), no con lo que uno supone.

## 19 nov 2026 · Variables CSS que no se aplicaban desde JS (frontend)
**Qué pasó:** el helper `el()` de `ui.js` hacía `Object.assign(nodo.style, { "--ar": "9 / 16" })`. Las propiedades personalizadas (`--x`) no se asignan así: se ignoran sin error. Todas las tarjetas de medio quedaban 16:9, las barras de progreso vacías y la tarjeta "Falló" se montaba encima de su texto.
**Regla para no repetirlo:** para variables CSS usar siempre `style.setProperty("--x", valor)`. El helper `el()` ya lo hace para claves que empiezan por `--`.

## 19 nov 2026 · aspect-ratio + min-height desborda la tarjeta (frontend)
**Qué pasó:** a `.medio-caja` (con `aspect-ratio: 16/9`) le puse `min-height: 190px` para que la tarjeta "Falló" tuviera espacio. Sin ancho fijo, el navegador calculó el ancho desde el alto (190 × 16/9 = 338 px) y la caja se salió de la columna de 220 px. No se veía como scroll horizontal porque la tarjeta tiene `overflow: hidden`, solo como texto cortado.
**Regla para no repetirlo:** cuando se combine `aspect-ratio` con `min-height`, fijar también `width: 100%`. El detector de scroll horizontal no ve desbordes dentro de `overflow: hidden`: mirar las capturas.

## 19 nov 2026 · Trabajo demo "listo" sin archivo (frontend ↔ backend)
**Qué pasó:** el backend real devuelve los trabajos demo con `estado: "listo"`, `resultado.url: null` y solo `miniatura`, más `demo: true` y `nota`. El frontend asumía que "listo" siempre trae `url` y los pintaba como "Generando 0%".
**Regla para no repetirlo:** la tarjeta y el visor deciden por lo que hay (`url`, `miniatura` o nada) y no solo por `estado`. Sin `url` no hay botón Descargar. `demo` y `nota` se usan si vienen. Probar el frontend contra el backend real, no solo contra el mock.

## 19 nov 2026 · Enlace "Saltar al contenido" con rutas por hash (frontend)
**Qué pasó:** `<a href="#contenido">` cambia `location.hash` y el router lo tomaba como ruta desconocida y mandaba a Explorar.
**Regla para no repetirlo:** en una SPA con rutas por hash, los enlaces internos de ancla se manejan con JS (`preventDefault` + `focus()`), nunca con `href="#id"`.

## 19 nov 2026 · Mandar "adaptive" como formato desde el frontend
**Qué pasó:** con foto de entrada, el frontend mandaba `ajustes.formato: "adaptive"` para Seedance. El backend valida contra `formatos` del catálogo y respondía 400; la conversión a `adaptive` ya la hace `proveedores/seedance.py`.
**Regla para no repetirlo:** el frontend manda siempre un formato del catálogo. Las reglas propias de un proveedor viven en su archivo del backend, no en la interfaz.

## 2026-11-19 · La barra de prompt se salía de la pantalla en celular
**Qué pasó:** en 390 px la barra flotante era más ancha que la pantalla y el botón Generar quedaba fuera. Un hijo de
grid toma como mínimo el ancho de su fila de chips.
**Regla:** en contenedores grid con filas de chips usar `grid-template-columns: minmax(0,1fr)` y chips con
`flex-shrink: 0` dentro de una fila con scroll.

## 2026-11-19 · La primera interfaz no gustó
**Qué pasó:** hero gigante, tarjetas moradas planas y plantillas sin imagen. Poncho pidió "igual a Higgsfield".
**Regla:** la home arranca en la grilla de ejemplos con imagen o video real; nada de tarjetas vacías ni bloques de
color saturado. Mostrar capturas a Poncho antes de dar una interfaz por terminada.
