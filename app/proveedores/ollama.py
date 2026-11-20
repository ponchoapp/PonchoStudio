"""Ollama local (gratis). Lista modelos (incluye :cloud) y genera texto con /api/chat."""

from __future__ import annotations

import requests

from app import config
from app.proveedores import ErrorProveedor

TIEMPO_DETECTAR = 1.5  # corto: si está apagado se sabe rápido
TIEMPO_GENERAR = 120

# Si OLLAMA_MODELO está vacío, se usa el primero de esta lista que esté instalado.
# Medido el 19 nov 2026 en el PC de Poncho (RTX 4050 6 GB) con el prompt de video de la app:
# Gemma 4 E4B ~4.5 s y el texto más rico; Qwen 3.5 4B ~4.5 s (solo con think=false).
PREFERIDOS = ("gemma-4", "gemma4", "qwen3.5", "qwen3", "gemma3", "llama3")


def modelos() -> list[dict]:
    """[{"nombre", "tamano"}]. Lista vacía si Ollama está apagado."""
    try:
        resp = requests.get(f"{config.cfg.OLLAMA_URL}/api/tags", timeout=TIEMPO_DETECTAR)
        resp.raise_for_status()
        datos = resp.json()
    except (requests.RequestException, ValueError):
        return []
    lista = []
    for m in datos.get("models") or []:
        nombre = m.get("name") or m.get("model")
        if nombre:
            lista.append({"nombre": nombre, "tamano": m.get("size")})
    return lista


def elegir_modelo(preferido: str | None = None) -> str | None:
    """El pedido, o OLLAMA_MODELO, o el mejor de PREFERIDOS, o el primero que no sea de embeddings."""
    disponibles = [m["nombre"] for m in modelos()]
    if not disponibles:
        return None
    for candidato in (preferido, config.cfg.OLLAMA_MODELO):
        if candidato:
            if candidato in disponibles:
                return candidato
            if f"{candidato}:latest" in disponibles:
                return f"{candidato}:latest"
    for patron in PREFERIDOS:
        for nombre in disponibles:
            if patron in nombre.lower() and "embed" not in nombre.lower():
                return nombre
    for nombre in disponibles:
        if "embed" not in nombre.lower():
            return nombre
    return None


def _pedir(cuerpo: dict) -> requests.Response:
    try:
        return requests.post(f"{config.cfg.OLLAMA_URL}/api/chat", json=cuerpo, timeout=TIEMPO_GENERAR)
    except requests.RequestException:
        raise ErrorProveedor("Ollama no responde. ¿Está abierto?", reintentable=True)


def generar(sistema: str, usuario: str, modelo: str) -> str:
    # think=False: los modelos que "piensan" (Qwen 3.5) gastan 80 s pensando y dejan `content` vacío.
    cuerpo = {
        "model": modelo,
        "stream": False,
        "think": False,
        "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": usuario}],
    }
    resp = _pedir(cuerpo)
    if resp.status_code == 400 and "think" in resp.text.lower():
        cuerpo.pop("think")  # modelo o versión de Ollama que no entiende "think"
        resp = _pedir(cuerpo)
    if resp.status_code >= 400:
        raise ErrorProveedor(f"Ollama devolvió error {resp.status_code}.", resp.status_code)
    try:
        return (resp.json().get("message") or {}).get("content") or ""
    except ValueError:
        raise ErrorProveedor("Ollama respondió algo que no se entiende.")
