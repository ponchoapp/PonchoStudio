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
