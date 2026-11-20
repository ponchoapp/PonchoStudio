"""Configuración: lee .env de la raíz a mano y luego las variables de entorno.

Las variables de entorno ganan sobre el .env. Nunca se imprimen las llaves.
"""

from __future__ import annotations

import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

# Llave → valor por defecto
VALORES_POR_DEFECTO = {
    "ARK_API_KEY": "",
    "SEEDANCE_BASE_URL": "https://ark.ap-southeast.bytepluses.com/api/v3",
    "OPENAI_API_KEY": "",
    "OPENAI_IMAGE_MODEL": "gpt-image-2",
    "OPENAI_TEXT_MODEL": "gpt-5-mini",
    "OLLAMA_URL": "http://localhost:11434",
    "OLLAMA_MODELO": "",
    "HIGGSFIELD_MCP_URL": "https://mcp.higgsfield.ai/mcp",
    "PUERTO": "8010",
    "DATA_DIR": "./data",
}

LLAVES_SECRETAS = {"ARK_API_KEY", "OPENAI_API_KEY"}


def leer_env(ruta: Path) -> dict[str, str]:
    """Lee un archivo .env simple: CLAVE=valor, comentarios con #, comillas opcionales."""
    valores: dict[str, str] = {}
    if not ruta.is_file():
        return valores
    for linea in ruta.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        if linea.lower().startswith("export "):
            linea = linea[7:].strip()
        clave, valor = linea.split("=", 1)
        clave = clave.strip()
        valor = valor.strip()
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
            valor = valor[1:-1]
        elif " #" in valor:
            # Comentario al final de la línea (solo si no hay comillas)
            valor = valor.split(" #", 1)[0].strip()
        valores[clave] = valor
    return valores


class Config:
    """Valores ya resueltos. Se accede como config.cfg.ARK_API_KEY."""

    def __init__(self) -> None:
        archivo = leer_env(RAIZ / ".env")
        for clave, defecto in VALORES_POR_DEFECTO.items():
            if clave in os.environ:
                valor = os.environ[clave]
            else:
                valor = archivo.get(clave, defecto)
            setattr(self, clave, (valor or "").strip())
        # Valores por defecto si quedaron vacíos (menos las llaves y OLLAMA_MODELO)
        for clave in ("SEEDANCE_BASE_URL", "OPENAI_IMAGE_MODEL", "OPENAI_TEXT_MODEL",
                      "OLLAMA_URL", "HIGGSFIELD_MCP_URL", "PUERTO", "DATA_DIR"):
            if not getattr(self, clave):
                setattr(self, clave, VALORES_POR_DEFECTO[clave])
        self.SEEDANCE_BASE_URL = self.SEEDANCE_BASE_URL.rstrip("/")
        self.OLLAMA_URL = self.OLLAMA_URL.rstrip("/")
        try:
            self.PUERTO = int(self.PUERTO)
        except ValueError:
            self.PUERTO = 8010
        datos = Path(self.DATA_DIR)
        if not datos.is_absolute():
            datos = (RAIZ / datos).resolve()
        self.DATOS = datos
        self.MEDIOS = datos / "medios"
        self.PRESETS = datos / "presets"
        self.DB = datos / "studio.db"
        self.TOKEN_HIGGSFIELD = datos / "higgsfield_token.json"
        self.STATIC = RAIZ / "app" / "static"

    @property
    def redirect_higgsfield(self) -> str:
        return f"http://localhost:{self.PUERTO}/api/higgsfield/callback"

    def __repr__(self) -> str:  # nunca mostrar llaves
        partes = []
        for clave in VALORES_POR_DEFECTO:
            valor = getattr(self, clave)
            if clave in LLAVES_SECRETAS:
                valor = "***" if valor else "(vacía)"
            partes.append(f"{clave}={valor}")
        return "Config(" + ", ".join(partes) + ")"


def crear_carpetas(c: "Config") -> None:
    c.DATOS.mkdir(parents=True, exist_ok=True)
    c.MEDIOS.mkdir(parents=True, exist_ok=True)


cfg = Config()


def recargar() -> Config:
    """Vuelve a leer .env y entorno (útil en pruebas)."""
    global cfg
    cfg = Config()
    return cfg
