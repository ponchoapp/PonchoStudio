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


EDITABLES_DESDE_APP = ("ARK_API_KEY", "OPENAI_API_KEY", "OLLAMA_URL", "OLLAMA_MODELO")


def estado_llaves() -> dict:
    """Qué llaves hay guardadas, sin mostrarlas: solo los 4 últimos caracteres de las secretas."""
    out = {}
    for clave in EDITABLES_DESDE_APP:
        valor = getattr(cfg, clave, "") or ""
        if clave in LLAVES_SECRETAS:
            out[clave] = {"guardada": bool(valor), "final": valor[-4:] if len(valor) >= 8 else None}
        else:
            out[clave] = {"guardada": bool(valor), "valor": valor}
    return out


def guardar_llaves(nuevas: dict, ruta: Path | None = None) -> list[str]:
    """Escribe en el .env solo las llaves permitidas que llegan con valor. Conserva el resto del archivo.

    Lanza ValueError con un mensaje corto si algo no sirve. Devuelve los nombres guardados.
    """
    ruta = ruta or (RAIZ / ".env")
    limpias: dict[str, str] = {}
    for clave, valor in (nuevas or {}).items():
        if clave not in EDITABLES_DESDE_APP:
            raise ValueError(f"{clave} no se puede cambiar desde la app.")
        if valor is None:
            continue
        if not isinstance(valor, str):
            raise ValueError(f"{clave} debe ser texto.")
        valor = valor.strip().strip("\"'")
        if not valor:
            continue
        if any(c.isspace() for c in valor) or "#" in valor or len(valor) > 400:
            raise ValueError(f"{clave} tiene espacios o caracteres raros. Copia la llave otra vez.")
        if clave == "OLLAMA_URL" and not valor.startswith(("http://", "https://")):
            raise ValueError("OLLAMA_URL debe empezar por http:// o https://")
        limpias[clave] = valor
    if not limpias:
        raise ValueError("No llegó ninguna llave para guardar.")

    lineas = ruta.read_text(encoding="utf-8-sig").splitlines() if ruta.is_file() else []
    pendientes = dict(limpias)
    for i, linea in enumerate(lineas):
        s = linea.strip()
        if s.startswith("#") or "=" not in s:
            continue
        clave = s.split("=", 1)[0].strip()
        if clave.lower().startswith("export "):
            clave = clave[7:].strip()
        if clave in pendientes:
            lineas[i] = f"{clave}={pendientes.pop(clave)}"
    for clave, valor in pendientes.items():
        lineas.append(f"{clave}={valor}")
    temporal = ruta.with_suffix(".env.tmp")
    temporal.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    temporal.replace(ruta)
    for clave in limpias:          # el .env manda sobre una variable vieja del proceso
        os.environ.pop(clave, None)
    recargar()
    return sorted(limpias)


def recargar() -> Config:
    """Vuelve a leer .env y entorno (útil en pruebas)."""
    global cfg
    cfg = Config()
    return cfg
