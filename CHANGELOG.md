# Historial de versiones

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) · Versiones: [SemVer](https://semver.org/lang/es/).
Cada versión lleva su etiqueta de git (`v0.1.0`). Sube `VERSION` en `app/__init__.py` en cada cambio que se publique.

- **MAYOR** (1.0.0): cambia algo que rompe datos o la forma de usar la app.
- **MENOR** (0.2.0): función nueva.
- **PARCHE** (0.1.1): arreglo sin funciones nuevas.

## [Sin publicar]

### Arreglado
- **Mejorar prompt con Qwen 3.5** tardaba 85 s y volvía vacío: ahora se manda `think: false` a Ollama (~4 s).
- `INSTALAR.bat` funciona con Python 3.13/3.14 si no hay 3.12, e instala pytest.
- Pruebas en Windows: 12 fallaban por la espera de 2 s de un puerto cerrado; ahora usan un servicio falso "apagado".

### Cambiado
- Si `OLLAMA_MODELO` está vacío se prefiere Gemma 4, luego Qwen 3.5. El mejorador pide piel natural (sin tono
  amarillo), colores sin saturar y cámara suave.

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
