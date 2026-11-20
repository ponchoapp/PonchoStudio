"""Imágenes con OpenAI (gpt-image-2): generaciones y ediciones con referencias."""

from __future__ import annotations

import base64
import mimetypes
import secrets
from pathlib import Path

import requests

from app import config
from app.proveedores import ErrorProveedor

BASE = "https://api.openai.com/v1"
TIEMPO = 240  # las imágenes high se demoran


def disponible() -> bool:
    return bool(config.cfg.OPENAI_API_KEY)


def _cabeceras() -> dict:
    return {"Authorization": f"Bearer {config.cfg.OPENAI_API_KEY}"}


def error_http(resp: requests.Response) -> ErrorProveedor:
    codigo = resp.status_code
    mensaje, tipo = "", ""
    try:
        err = resp.json().get("error") or {}
        mensaje = err.get("message") or ""
        tipo = err.get("code") or err.get("type") or ""
    except (ValueError, AttributeError):
        pass
    if codigo == 401:
        return ErrorProveedor("La llave OPENAI_API_KEY no sirve. Revísala en el .env.", codigo)
    if codigo == 403:
        return ErrorProveedor("Tu cuenta de OpenAI no tiene acceso a este modelo (puede pedir verificar la organización).", codigo)
    if codigo == 429:
        return ErrorProveedor("OpenAI dice límite de uso o sin saldo. Revisa tu cuenta.", codigo, reintentable=True)
    if "moderation" in str(tipo) or "safety" in str(tipo):
        return ErrorProveedor("OpenAI bloqueó el prompt por sus reglas de contenido.", codigo)
    if codigo >= 500:
        return ErrorProveedor("OpenAI está fallando. Intenta más tarde.", codigo, reintentable=True)
    texto = f"OpenAI rechazó el pedido: {mensaje[:160]}" if mensaje else f"Error {codigo} de OpenAI."
    return ErrorProveedor(texto, codigo)


def _ajustar_prompt(prompt: str) -> str:
    # gpt-image-2 no hace fondo transparente: pedimos fondo blanco liso
    if "transparen" in prompt.lower():
        prompt += ", on a plain solid white background"
    return prompt


def _guardar(respuesta: dict) -> list[str]:
    """Guarda cada b64_json como PNG en data/medios/ y devuelve los nombres."""
    nombres = []
    config.cfg.MEDIOS.mkdir(parents=True, exist_ok=True)
    for item in respuesta.get("data") or []:
        b64 = item.get("b64_json")
        if not b64:
            url = item.get("url")
            if url:
                contenido = requests.get(url, timeout=60).content
            else:
                continue
        else:
            contenido = base64.b64decode(b64)
        nombre = f"img_{secrets.token_hex(6)}.png"
        (config.cfg.MEDIOS / nombre).write_bytes(contenido)
        nombres.append(nombre)
    if not nombres:
        raise ErrorProveedor("OpenAI no devolvió ninguna imagen.")
    return nombres


def _archivo_local(ruta: str) -> tuple[str, bytes, str]:
    if ruta.startswith(("http://", "https://")):
        resp = requests.get(ruta, timeout=60)
        resp.raise_for_status()
        nombre = Path(ruta.split("?")[0]).name or "ref.png"
        return nombre, resp.content, resp.headers.get("content-type", "image/png")
    nombre = Path(ruta).name
    archivo = config.cfg.MEDIOS / nombre
    if not archivo.is_file():
        raise ErrorProveedor(f"No encuentro la referencia {nombre}.")
    return nombre, archivo.read_bytes(), mimetypes.guess_type(nombre)[0] or "image/png"


def generar(prompt: str, calidad: str = "medium", tamano: str = "1024x1024",
            referencias: list[str] | None = None, n: int = 1) -> list[str]:
    """Genera n imágenes. Con referencias usa /images/edits. Devuelve nombres en data/medios/."""
    prompt = _ajustar_prompt(prompt)
    modelo = config.cfg.OPENAI_IMAGE_MODEL
    try:
        if referencias:
            archivos = [("image[]", _archivo_local(r)) for r in referencias]
            datos = {"model": modelo, "prompt": prompt, "size": tamano, "quality": calidad, "n": str(n)}
            resp = requests.post(f"{BASE}/images/edits", headers=_cabeceras(),
                                 data=datos, files=archivos, timeout=TIEMPO)
        else:
            cuerpo = {"model": modelo, "prompt": prompt, "size": tamano, "quality": calidad, "n": n}
            resp = requests.post(f"{BASE}/images/generations", headers=_cabeceras(),
                                 json=cuerpo, timeout=TIEMPO)
    except requests.Timeout:
        raise ErrorProveedor("OpenAI se demoró demasiado. Intenta otra vez.", reintentable=True)
    except requests.RequestException:
        raise ErrorProveedor("No hay conexión con OpenAI. Revisa internet.", reintentable=True)
    if resp.status_code >= 400:
        raise error_http(resp)
    return _guardar(resp.json())


def texto(sistema: str, usuario: str) -> str:
    """Texto con el modelo OPENAI_TEXT_MODEL (para mejorar prompts)."""
    cuerpo = {
        "model": config.cfg.OPENAI_TEXT_MODEL,
        "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": usuario}],
    }
    try:
        resp = requests.post(f"{BASE}/chat/completions", headers=_cabeceras(), json=cuerpo, timeout=90)
    except requests.RequestException:
        raise ErrorProveedor("No hay conexión con OpenAI.", reintentable=True)
    if resp.status_code >= 400:
        raise error_http(resp)
    try:
        return resp.json()["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, ValueError, TypeError):
        raise ErrorProveedor("OpenAI respondió algo que no se entiende.")
