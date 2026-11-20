"""Fixtures: entorno aislado (sin llaves reales) y servidor uvicorn en un puerto libre."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest
import requests

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from tests.falsos import ManejadorApagado, arrancar, escribir_catalogo, puerto_libre  # noqa: E402

# Servicio "apagado" que responde 503 al instante. No se usa un puerto cerrado (127.0.0.1:9)
# porque en Windows la conexión rechazada tarda ~2 s y las pruebas se caen por tiempo.
_APAGADO, MUERTO = arrancar(ManejadorApagado)


def variables_base(datos: Path) -> dict:
    """Variables que anulan cualquier .env real (nunca se pega a servicios de verdad)."""
    return {
        "DATA_DIR": str(datos),
        "ARK_API_KEY": "",
        "OPENAI_API_KEY": "",
        "OLLAMA_URL": MUERTO,
        "OLLAMA_MODELO": "",
        "HIGGSFIELD_MCP_URL": MUERTO + "/mcp",
        "SEEDANCE_BASE_URL": MUERTO + "/api/v3",
    }


@pytest.fixture
def entorno(tmp_path, monkeypatch):
    """Config y base de datos en una carpeta temporal, dentro del mismo proceso."""
    from app import config, db, trabajos
    from app.proveedores import higgsfield

    for clave, valor in variables_base(tmp_path / "data").items():
        monkeypatch.setenv(clave, valor)

    def aplicar(**extra):
        for k, v in extra.items():
            monkeypatch.setenv(k, v)
        c = config.recargar()
        config.crear_carpetas(c)
        db.cerrar()
        db.iniciar()
        higgsfield._reiniciar_sesion()
        higgsfield._pendientes.clear()
        trabajos._en_proceso.clear()
        trabajos._ultimo_sondeo.clear()
        trabajos._esperar_hasta.clear()
        return c

    aplicar()
    yield aplicar
    db.cerrar()
    config.recargar()


@pytest.fixture(scope="module")
def servidor(tmp_path_factory):
    """Levanta uvicorn en un puerto libre y devuelve la URL base."""
    datos = tmp_path_factory.mktemp("srv") / "data"
    escribir_catalogo(datos / "presets")
    puerto = puerto_libre()
    env = dict(os.environ, **variables_base(datos), PUERTO=str(puerto))
    proceso = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
         "--port", str(puerto), "--log-level", "warning"],
        cwd=str(RAIZ), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{puerto}"
    for _ in range(300):
        try:
            if requests.get(base + "/api/salud", timeout=5).status_code == 200:
                break
        except requests.RequestException:
            pass
        if proceso.poll() is not None:
            raise RuntimeError(proceso.stdout.read().decode(errors="replace"))
        time.sleep(0.1)
    else:
        proceso.kill()
        raise RuntimeError("El servidor no arrancó")
    yield {"base": base, "datos": datos}
    proceso.terminate()
    try:
        proceso.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proceso.kill()
