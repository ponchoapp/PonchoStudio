"""Seedream 5.5 por BytePlus ModelArk (misma ARK_API_KEY que Seedance). Imágenes síncronas.

Fuente: docs.byteplus.com/en/docs/ModelArk/1541523 (API "Generate images") y /seedream-5-5, 19 nov 2026.
POST {base}/images/generations  ->  {"data": [{"b64_json" | "url", "size", ...}], "usage": {...}}
Seedream 5.5 NO acepta sequential_image_generation ni seed: una imagen por pedido.
"""

from __future__ import annotations

import base64
import secrets

import requests

from app import catalogo, config
from app.proveedores import ErrorProveedor, seedance

TIEMPO = 240
MAX_REFERENCIAS = 10  # Seedream 5.5: hasta 10 imágenes de referencia

MENSAJES = {
    401: "La llave ARK_API_KEY no sirve o venció. Revísala en el .env.",
    403: "Tu cuenta de ModelArk no tiene activado Seedream 5.5. Actívalo en la consola de ModelArk.",
    404: "ModelArk no encontró el modelo de Seedream. Revisa SEEDREAM_MODEL.",
    429: "ModelArk dice que pasaste el límite de imágenes por minuto o no hay cuota. Espera un momento.",
}


def disponible() -> bool:
    return bool(config.cfg.ARK_API_KEY) and bool(config.cfg.SEEDREAM_MODEL)


def _cabeceras() -> dict:
    return {"Authorization": f"Bearer {config.cfg.ARK_API_KEY}", "Content-Type": "application/json"}


def _error_http(resp: requests.Response) -> ErrorProveedor:
    codigo = resp.status_code
    detalle = ""
    try:
        err = (resp.json() or {}).get("error")
        if isinstance(err, dict):
            detalle = err.get("message") or err.get("code") or ""
    except (ValueError, AttributeError):
        pass
    if codigo >= 500:
        return ErrorProveedor("ModelArk está fallando. Intenta más tarde.", codigo, reintentable=True)
    base = MENSAJES.get(codigo) or f"Error {codigo} de ModelArk"
    if codigo == 400 or (codigo not in MENSAJES and detalle):
        base = f"ModelArk rechazó el pedido: {str(detalle)[:160]}" if detalle else base
    return ErrorProveedor(base if base.endswith(".") else base + ".", codigo, reintentable=codigo == 429)


def armar_cuerpo(prompt: str, formato: str, resolucion: str, referencias: list[str] | None = None) -> dict:
    ancho, alto = catalogo.tamano_seedream(formato, resolucion)
    cuerpo = {
        "model": config.cfg.SEEDREAM_MODEL,
        "prompt": prompt,
        "size": f"{ancho}x{alto}",
        "response_format": "b64_json",
        "output_format": "png",
        "watermark": False,
    }
    if "transparen" in prompt.lower():
        cuerpo["background"] = "transparent"   # solo con png; Seedream 5.5 hace RGBA nativo
    refs = [r for r in (referencias or []) if r]
    if len(refs) > MAX_REFERENCIAS:
        raise ErrorProveedor(f"Seedream 5.5 acepta hasta {MAX_REFERENCIAS} referencias.")
    if refs:
        urls = [seedance.a_url(r) for r in refs]   # /medios/x.png -> data URL base64
        cuerpo["image"] = urls[0] if len(urls) == 1 else urls
    return cuerpo


def generar(prompt: str, formato: str = "1:1", resolucion: str = "2k",
            referencias: list[str] | None = None) -> list[str]:
    """Genera UNA imagen y la guarda en data/medios/. Devuelve [nombre]."""
    cuerpo = armar_cuerpo(prompt, formato, resolucion, referencias)
    try:
        resp = requests.post(f"{config.cfg.SEEDANCE_BASE_URL}/images/generations", headers=_cabeceras(),
                             json=cuerpo, timeout=TIEMPO)
    except requests.Timeout:
        raise ErrorProveedor("Seedream se demoró demasiado. Intenta otra vez.", reintentable=True)
    except requests.RequestException:
        raise ErrorProveedor("No hay conexión con ModelArk. Revisa internet.", reintentable=True)
    if resp.status_code >= 400:
        raise _error_http(resp)
    try:
        datos = resp.json()
    except ValueError:
        raise ErrorProveedor("ModelArk respondió algo que no se entiende.", resp.status_code)
    for item in datos.get("data") or []:
        if not isinstance(item, dict):
            continue
        if item.get("error"):
            err = item["error"]
            raise ErrorProveedor("Seedream no pudo generar la imagen: "
                                 f"{str((err.get('message') if isinstance(err, dict) else err))[:160]}")
        if item.get("b64_json"):
            contenido = base64.b64decode(item["b64_json"])
        elif item.get("url"):   # el enlace vence a las 24 h: se baja ya
            try:
                contenido = requests.get(item["url"], timeout=60).content
            except requests.RequestException:
                raise ErrorProveedor("No pude descargar la imagen de ModelArk.", reintentable=True)
        else:
            continue
        config.cfg.MEDIOS.mkdir(parents=True, exist_ok=True)
        nombre = f"img_{secrets.token_hex(6)}.png"
        (config.cfg.MEDIOS / nombre).write_bytes(contenido)
        return [nombre]
    err = datos.get("error")
    msg = err.get("message") if isinstance(err, dict) else None
    raise ErrorProveedor(f"Seedream no devolvió ninguna imagen{': ' + msg[:160] if msg else '.'}")
