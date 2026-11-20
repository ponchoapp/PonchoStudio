# Historial de versiones

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) · Versiones: [SemVer](https://semver.org/lang/es/).
Cada versión lleva su etiqueta de git (`v0.1.0`). Sube `VERSION` en `app/__init__.py` en cada cambio que se publique.

- **MAYOR** (1.0.0): cambia algo que rompe datos o la forma de usar la app.
- **MENOR** (0.2.0): función nueva.
- **PARCHE** (0.1.1): arreglo sin funciones nuevas.

## [Sin publicar]

## [0.2.0] · 2026-11-19
Rediseño completo con la organización de higgsfield.ai (sin copiar su marca), referencias que no se pierden y Explorar
conectado de verdad a Higgsfield.

### Agregado
- **Logo nuevo**: una "P" cuyo ojo es un botón de reproducir (opción B, elegida por Poncho), en cabecera y favicon.
- **Explorar en secciones**: Destacados (16:9) y Verticales (9:16) en carrusel, una sección masonry por categoría real
  del MCP (Virales, ¿Y si…?, Producto y marketing, Estilos de foto), Plantillas, tus generaciones en Higgsfield y las
  locales. Títulos en mayúsculas violeta, subtítulo gris y "Ver todo". Tarjetas sin borde; el video llena la tarjeta y
  se reproduce al pasar el mouse (con poster mientras tanto).
- **La referencia no se pierde**: "Recrear" (preset o generación de Higgsfield) la deja arriba del panel con miniatura,
  "Cambiar" y X; se importa una sola vez a `data/medios` y va en Referencias. Sigue ahí al cambiar de vista.
- **Panel del generador** como el de Higgsfield: pestañas Crear/Editar (video e imagen), Referencias, prompt y fichas de
  ajustes en dos columnas; botón Generar con su costo fijo abajo.
- **Selector de modelos** con buscador, "Modelos destacados", descripción corta e insignias (Nuevo, Directo, Créditos
  Higgsfield).
- **Centro vacío con ejemplos** para elegir, en vez de un hueco negro.
- **Miniaturas de las 44 plantillas** hechas con ChatGPT (US$0,484), en WebP de 640 px (1,4 MB en total).
- Biblioteca, Estudios (4 tarjetas con arte propio), Audio (honesto: cómo pedir sonido en Seedance) y Ajustes (estado de
  cada conexión, créditos de Higgsfield y modelo de Ollama) con el mismo lenguaje visual.
- `tools/captura.mjs`: capturas de escritorio y celular con Chrome headless por DevTools. Antes y después en
  `docs/capturas/`.

### Arreglado
- **Mejorar prompt con Qwen 3.5** tardaba 85 s y volvía vacío: ahora se manda `think: false` a Ollama (~4 s).
- Explorar con Higgsfield real: la galería salía vacía y los presets daban error 502. Ahora lee la forma real del MCP
  (`results.rawUrl`, cursores numéricos, `preview_type`) y trae el prompt de cada generación.
- "Recrear" un preset sin prompt usa su descripción como idea.
- Precio de imagen según el tamaño: 2:3 y 3:2 cuestan más que 1:1 (antes se cotizaban como cuadradas).
- Un video o audio de referencia ya no se manda a modelos que solo aceptan imágenes (400 con mensaje claro).
- `INSTALAR.bat` funciona con Python 3.13/3.14 si no hay 3.12, e instala pytest.
- Pruebas en Windows: 12 fallaban por la espera de 2 s de un puerto cerrado; ahora usan un servicio falso "apagado".

### Cambiado
- Ollama por defecto: Gemma 4 E4B (si `OLLAMA_MODELO` está vacío se prefiere Gemma 4, luego Qwen 3.5). El mejorador pide
  piel natural (sin tono amarillo), colores sin saturar y cámara suave.
- Miniaturas de trabajos demo en violeta apagado (sin neón).

## [0.1.0] · 2026-11-19
Primera versión.

### Agregado
- Interfaz tipo Higgsfield en violeta (`#B15CFF`, sin lima): Explorar, Video, Imagen, Audio, Estudios, Biblioteca y Ajustes.
- Video directo con **Seedance 2.5** por BytePlus ModelArk (también 2.0 y 2.0 Fast), sin intermediarios. Costo en vivo
  calculado por tokens y corregido con los tokens reales al terminar.
- **Seedance 2.5 Flash** directo (`dreamina-seedance-2-5-flash-261115`, US$7/M tokens) para borradores baratos.
- Ventana **"Pegar mis llaves"** en Ajustes: guarda en el `.env` del PC sin pasar por el chat.
- Catálogo **real** de Higgsfield (26 modelos leídos de la cuenta, no inventados).
- Imágenes con **OpenAI gpt-image-2** (generar y editar con referencias).
- **Mejorar prompt** gratis con los modelos de **Ollama** del PC (detecta también los `:cloud`). Si no hay Ollama, usa
  OpenAI, y si tampoco hay OpenAI, usa reglas locales.
- Puente **Higgsfield MCP** con inicio de sesión OAuth: aprende historial, modelos y prompts sin generar nada (no gasta
  créditos). Los modelos exclusivos de Higgsfield piden confirmación antes de gastar créditos.
- Biblioteca de prompts: 40 movimientos de cámara, 35 estilos y 44 plantillas (videoclip urbano 9:16, producto,
  tráiler, portada de canción, miniatura…).
- Modo demostración cuando no hay llaves.
- Documentación: `docs/MEMORIA.md`, `docs/CONTRATO_API.md`, `docs/ERRORES.md`, `docs/GUIA_PROMPTS.md`.
