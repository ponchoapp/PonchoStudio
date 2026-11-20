# PonchoStudio

Estudio local de video e imagen de Poncho G con interfaz tipo Higgsfield (en violeta). Video: Seedance 2.5 directo
(BytePlus ModelArk). Imagen: OpenAI gpt-image-2. Prompts: Ollama local primero. Higgsfield MCP solo para aprender
y para modelos exclusivos, siempre con confirmación de créditos.

## Antes de empezar
1. Lee `docs/MEMORIA.md` (contexto y decisiones) y `docs/ERRORES.md` (no repetir).
2. Para tocar rutas: `docs/CONTRATO_API.md` es la fuente única; si cambias una ruta, actualízalo.

## Cómo trabajar
- Español de Colombia, claro y corto. Poncho es ingeniero de sistemas: explica decisiones, no lo obvio.
- Antes de cambiar mucho, propón el plan en 5 líneas.
- Nunca pongas llaves en código, commits ni chat. Viven en `.env` (fuera de git).
- Sin dependencias nuevas sin decir por qué. Stack: Python 3.12 + Starlette + Uvicorn + SQLite + requests.
  Frontend HTML/CSS/JS sin framework en `app/static/`.
- Al cerrar una tarea: corre `python -m pytest`, sube `VERSION`, agrega la entrada en `CHANGELOG.md`, commit y tag.
- Si cometes un error que costó tiempo, agrégalo a `docs/ERRORES.md` con su regla.
- Cuando la conversación se acerque al límite de contexto, actualiza `docs/MEMORIA.md` antes de que se compacte.

## Diseño
- Acento violeta `#B15CFF` (glow `rgba(177,92,255,.45)`), fondo negro, superficies `#121216`. Cero verde lima.
- Fuentes Unbounded + Manrope. Celular primero. Botones que dicen exactamente lo que hacen.
- Gustos de Poncho: nada de colores sobresaturados, piel sin tono amarillo, sin sacudidas fuertes.

## Probar
```
INSTALAR.bat   (una vez)
ABRIR.bat      → http://localhost:8010
.venv\Scripts\python -m pytest
```
