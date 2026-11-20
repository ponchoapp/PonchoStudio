# PonchoStudio

Estudio propio de Poncho G para crear video e imagen con IA, con la comodidad de Higgsfield pero pagando directo a
cada proveedor:

| Qué | Con qué | Gasta |
|---|---|---|
| Video | **Seedance 2.5** directo en BytePlus ModelArk | US$ por segundo, lo más barato sin intermediario |
| Imagen | **OpenAI gpt-image-2** | US$ por imagen |
| Mejorar prompts | **Ollama** en tu PC (o OpenAI de respaldo) | Gratis con Ollama |
| Modelos exclusivos (Kling, Veo, Soul…) y aprender prompts | **Higgsfield MCP** con tu cuenta | Créditos de Higgsfield solo al generar, y siempre pregunta antes |

## Instalar (Windows, una vez)
1. Tener Python 3.12 instalado.
2. Doble clic en `INSTALAR.bat`.
3. Copia `env.ejemplo` como `.env` y llena las llaves (ver abajo).

## Abrir
Doble clic en `ABRIR.bat`. Se abre http://localhost:8010.
Sin llaves funciona en **modo demostración**, así puedes ver todo sin gastar.

## Llaves (`.env`, nunca va a git)
- `ARK_API_KEY`: console.byteplus.com → ModelArk → API Keys (elige el proyecto abajo a la izquierda). Activa
  Seedance 2.5 en la consola. Guía: docs.byteplus.com/en/docs/ModelArk (Quick start y Seedance 2.5).
- `OPENAI_API_KEY`: platform.openai.com → API keys. Ojo: la suscripción de ChatGPT no sirve aquí, la API se paga aparte.
- Ollama: no necesita llave. Abre Ollama y la app lo encuentra en `http://localhost:11434`. Elige el modelo en Ajustes.
- Higgsfield: no necesita llave. En **Ajustes → Conectar Higgsfield** inicias sesión con tu cuenta.

## Ahorrar
- Prueba siempre en **480p y 4-5 s**; pasa a 1080p solo la toma final, con la misma semilla.
- 4K: la API oficial llega a 1080p. Para 4K, genera en 1080p y escala aparte.
- ModelArk deja 3 videos a la vez en cuentas individuales; la app pone el resto en cola sola.

## Documentación
- `docs/MEMORIA.md`: todo lo decidido. Leer primero en cada sesión nueva.
- `docs/CONTRATO_API.md`: rutas entre interfaz y servidor.
- `docs/ERRORES.md`: errores ya cometidos y la regla para no repetirlos.
- `docs/GUIA_PROMPTS.md`: cómo escribir prompts para Seedance 2.5 y gpt-image-2.
- `CHANGELOG.md`: qué cambió en cada versión.

## Versiones y GitHub
Cada cambio publicado sube `VERSION` en `app/__init__.py`, agrega su entrada en `CHANGELOG.md` y lleva etiqueta
`vX.Y.Z` en git:
```
git add -A
git commit -m "0.2.0: lo que cambió"
git tag v0.2.0
git push --follow-tags
```

## Pruebas
```
.venv\Scripts\python -m pytest
```
