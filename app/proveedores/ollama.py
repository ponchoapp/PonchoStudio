"""Ollama local (gratis). Lista modelos (incluye :cloud) y genera texto con /api/chat."""

from __future__ import annotations

import requests

from app import config
from app.proveedores import ErrorProveedor

TIEMPO_DETECTAR = 1.5  # corto: si está apagado se sabe rápido
TIEMPO_GENERAR = 120


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
    """El pedido, o OLLAMA_MODELO, o el primero que no sea de embeddings."""
    disponibles = [m["nombre"] for m in modelos()]
    if not disponibles:
        return None
    for candidato in (preferido, config.cfg.OLLAMA_MODELO):
        if candidato:
            if candidato in disponibles:
                return candidato
            if f"{candidato}:latest" in disponibles:
                return f"{candidato}:latest"
    for nombre in disponibles:
        if "embed" not in nombre.lower():
            return nombre
    return None


def generar(sistema: str, usuario: str, modelo: str) -> str:
    cuerpo = {
        "model": modelo,
        "stream": False,
        "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": usuario}],
    }
    try:
        resp = requests.post(f"{config.cfg.OLLAMA_URL}/api/chat", json=cuerpo, timeout=TIEMPO_GENERAR)
    except requests.RequestException:
        raise ErrorProveedor("Ollama no responde. ¿Está abierto?", reintentable=True)
    if resp.status_code >= 400:
        raise ErrorProveedor(f"Ollama devolvió error {resp.status_code}.", resp.status_code)
    try:
        return (resp.json().get("message") or {}).get("content") or ""
    except ValueError:
        raise ErrorProveedor("Ollama respondió algo que no se entiende.")
