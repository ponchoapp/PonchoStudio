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
