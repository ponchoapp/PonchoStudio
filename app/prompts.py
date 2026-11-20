"""Biblioteca de prompts (data/presets/*.json) y mejorador: Ollama → OpenAI → reglas locales."""

from __future__ import annotations

import json
import re

from app import catalogo, config
from app.proveedores import ErrorProveedor, ollama, openai_img

SISTEMA_VIDEO = (
    "You rewrite video prompts for {modelo}. Write ONE cinematic prompt in English, "
    "in the style of Higgsfield and Seedance prompts. Cover, in this order: subject, action, "
    "camera movement and framing, lighting, lens, environment and mood, and sound/audio cues. "
    "Keep the user's idea and any names or text exactly. Concrete visual words, no lists, "
    "no headings. Maximum 120 words. Return only the prompt, nothing else."
)
SISTEMA_IMAGEN = (
    "You rewrite image prompts for {modelo}. Write ONE cinematic photographic prompt in English, "
    "in the style of Higgsfield prompts. Cover: subject, pose or action, framing and composition, "
    "lighting, lens and camera, environment, color palette and mood. Keep the user's idea and any "
    "names or text exactly. Natural skin tones, no oversaturated colors. Maximum 120 words. "
    "Return only the prompt, nothing else."
)


# ---------------------------------------------------------------- biblioteca

def _leer_json(nombre: str, clave: str) -> list[dict]:
    ruta = config.cfg.PRESETS / nombre
    if not ruta.is_file():
        return []
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return []
    if isinstance(datos, dict):
        datos = datos.get(clave) or datos.get("items") or next(
            (v for v in datos.values() if isinstance(v, list)), [])
    if not isinstance(datos, list):
        return []
    return [d for d in datos if isinstance(d, dict) and d.get("id")]


def _preset(d: dict, tipo: str) -> dict:
    return {"id": str(d["id"]), "nombre": d.get("nombre") or str(d["id"]), "tipo": d.get("tipo") or tipo,
            "texto": d.get("texto") or "", "miniatura": d.get("miniatura"),
            "origen": d.get("origen") or "poncho"}


def _miniatura_plantilla(plantilla_id: str) -> str | None:
    from app import miniaturas  # aquí adentro para no crear un import circular
    return miniaturas.url_miniatura(plantilla_id)


def _plantilla(d: dict) -> dict:
    return {"id": str(d["id"]), "nombre": d.get("nombre") or str(d["id"]),
            "categoria": d.get("categoria") or "video", "prompt": d.get("prompt") or "",
            "modelo_sugerido": d.get("modelo_sugerido"), "origen": d.get("origen") or "poncho",
            "miniatura": _miniatura_plantilla(str(d["id"])) or d.get("miniatura")}


def presets() -> dict:
    """{"estilos", "camaras", "plantillas"}. Listas vacías si no hay archivos."""
    estilos = [_preset(d, "estilo") for d in _leer_json("estilos.json", "estilos")]
    camaras = [_preset(d, "camara") for d in _leer_json("camaras.json", "camaras")]
    plantillas = [_plantilla(d) for d in _leer_json("plantillas.json", "plantillas")]
    vistos = {p["id"] for p in plantillas}
    for d in _leer_json("aprendidos.json", "plantillas"):
        p = _plantilla(dict(d, origen=d.get("origen") or "higgsfield"))
        if p["id"] not in vistos and p["prompt"]:
            plantillas.append(p)
            vistos.add(p["id"])
    return {"estilos": estilos, "camaras": camaras, "plantillas": plantillas}


def buscar_preset(tipo: str, preset_id: str | None) -> dict | None:
    if not preset_id:
        return None
    lista = presets()["estilos" if tipo == "estilo" else "camaras"]
    return next((p for p in lista if p["id"] == preset_id), None)


def aplicar_presets(prompt: str, estilo: str | None, camara: str | None) -> str:
    """Le pega al prompt el texto del estilo y de la cámara elegidos."""
    partes = [prompt.strip().rstrip(".,")]
    for tipo, pid in (("camara", camara), ("estilo", estilo)):
        p = buscar_preset(tipo, pid)
        if p and p["texto"] and p["texto"].lower() not in prompt.lower():
            partes.append(p["texto"].strip().rstrip("."))
    return ", ".join(partes)


# ---------------------------------------------------------------- mejorador

def _limpiar(texto: str) -> str:
    texto = re.sub(r"<think>.*?</think>", "", texto or "", flags=re.DOTALL | re.IGNORECASE)
    texto = texto.strip()
    texto = re.sub(r"^(?:\*\*)?(?:improved |enhanced |final )?prompt(?:\*\*)?\s*:\s*", "", texto, flags=re.IGNORECASE)
    texto = texto.strip().strip("`").strip()
    if len(texto) >= 2 and texto[0] == texto[-1] and texto[0] in "\"'“”":
        texto = texto[1:-1].strip()
    texto = re.sub(r"\s+", " ", texto)
    palabras = texto.split()
    if len(palabras) > 140:  # tope de seguridad
        texto = " ".join(palabras[:140])
    return texto


def reglas(prompt: str, tipo: str = "video") -> str:
    """Mejora sin IA: limpia y completa cámara, luz, lente y ambiente si faltan."""
    texto = re.sub(r"\s+", " ", prompt or "").strip().rstrip(".,")
    bajo = texto.lower()
    extras = []
    if tipo == "video":
        if not any(p in bajo for p in ("camera", "cámara", "camara", "shot", "dolly", "tracking", "pan", "plano")):
            extras.append("slow cinematic dolly-in, medium shot")
    else:
        if not any(p in bajo for p in ("shot", "portrait", "close-up", "plano", "retrato", "framing")):
            extras.append("cinematic composition, medium shot")
    if not any(p in bajo for p in ("light", "luz", "lighting", "iluminación", "sunset", "golden hour", "neon")):
        extras.append("soft natural lighting with gentle contrast")
    if not any(p in bajo for p in ("mm", "lens", "lente")):
        extras.append("35mm lens, shallow depth of field")
    if not any(p in bajo for p in ("mood", "atmosphere", "ambiente", "film", "cinematic")):
        extras.append("filmic color grade, natural skin tones")
    if tipo == "video" and not any(p in bajo for p in ("sound", "audio", "sonido", "music", "música")):
        extras.append("subtle ambient sound")
    salida = ", ".join([texto] + extras) if texto else ", ".join(extras)
    palabras = salida.split()
    return " ".join(palabras[:120])


def mejorar(prompt: str, tipo: str = "video", modelo: str | None = None, motor: str = "auto",
            ollama_modelo: str | None = None) -> dict:
    """Devuelve {"prompt", "motor"}. Orden: Ollama → OpenAI → reglas."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("Escribe un prompt para mejorar.")
    tipo = "imagen" if tipo == "imagen" else "video"
    info = catalogo.buscar(modelo) if modelo else None
    nombre_modelo = info["nombre"] if info else ("Seedance 2.5" if tipo == "video" else "GPT Image 2")
    sistema = (SISTEMA_VIDEO if tipo == "video" else SISTEMA_IMAGEN).format(modelo=nombre_modelo)

    if motor in ("auto", "ollama"):
        elegido = ollama.elegir_modelo(ollama_modelo)
        if elegido:
            try:
                texto = _limpiar(ollama.generar(sistema, prompt, elegido))
                if texto:
                    return {"prompt": texto, "motor": f"ollama:{elegido}"}
            except ErrorProveedor:
                pass
    if motor in ("auto", "openai") and openai_img.disponible():
        try:
            texto = _limpiar(openai_img.texto(sistema, prompt))
            if texto:
                return {"prompt": texto, "motor": f"openai:{config.cfg.OPENAI_TEXT_MODEL}"}
        except ErrorProveedor:
            pass
    return {"prompt": reglas(prompt, tipo), "motor": "reglas"}
