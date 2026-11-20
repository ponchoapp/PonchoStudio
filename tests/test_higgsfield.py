"""Cliente MCP + OAuth contra un servidor Higgsfield falso."""

import json
import time
from urllib.parse import parse_qs, urlparse

import pytest
import requests

from app import trabajos
from app.proveedores import ErrorProveedor, higgsfield
from tests.falsos import ESTADO, ManejadorMCP, arrancar


@pytest.fixture
def hf(entorno):
    servidor, base = arrancar(ManejadorMCP)
    ESTADO.reiniciar()
    ESTADO.base = base
    c = entorno(HIGGSFIELD_MCP_URL=base + "/mcp")
    yield c
    servidor.shutdown()


def conectar():
    url = higgsfield.url_conectar()
    q = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
    assert q["code_challenge_method"] == "S256"
    assert q["redirect_uri"].endswith("/api/higgsfield/callback")
    assert q["scope"] == "mcp" and q["resource"].endswith("/mcp")
    # el "navegador" hace login y vuelve con el código
    r = requests.get(url, allow_redirects=False)
    vuelta = {k: v[0] for k, v in parse_qs(urlparse(r.headers["Location"]).query).items()}
    assert vuelta["state"] == q["state"]
    return higgsfield.callback(vuelta["code"], vuelta["state"])


def test_oauth_guarda_token(hf):
    assert higgsfield.conectado() is False
    assert conectar() == {"ok": True}
    assert higgsfield.conectado() is True
    datos = json.loads(hf.TOKEN_HIGGSFIELD.read_text())
    assert datos["token"]["access_token"].startswith("tok")
    assert datos["token"]["refresh_token"]


def test_callback_con_state_malo(hf):
    with pytest.raises(ErrorProveedor):
        higgsfield.callback("x", "estado-inventado")


def test_herramientas_y_estado(hf):
    conectar()
    nombres = [h["name"] for h in higgsfield.herramientas()]
    assert "generate_video" in nombres and "get_balance" in nombres  # dos páginas de tools/list
    assert ESTADO.metodos[:2] == ["initialize", "notifications/initialized"]
    e = higgsfield.estado()
    assert e["conectado"] is True and e["creditos"] == 1234.5
    assert e["cuenta"] == "poncho@ejemplo.com"
    assert not any(n.startswith("generate") for n, _ in ESTADO.llamadas)


def test_aprender_solo_lee_y_no_duplica(hf):
    conectar()
    r = higgsfield.aprender()
    assert r == {"nuevos": 3, "total": 3}
    llamadas = [n for n, _ in ESTADO.llamadas]
    assert "list_history" in llamadas and "search_presets" in llamadas
    assert not any(n.startswith("generate") for n in llamadas)
    assert "get_job_secret" not in llamadas  # pide un id que no tenemos
    args = dict(ESTADO.llamadas)
    assert args["list_history"] == {"limit": 20} and args["search_presets"] == {"query": "cinematic"}
    guardados = json.loads((hf.PRESETS / "aprendidos.json").read_text())
    assert all(p["origen"] == "higgsfield" for p in guardados)
    astronauta = next(p for p in guardados if "astronaut" in p["prompt"])
    assert astronauta["categoria"] == "video" and astronauta["modelo_sugerido"] == "kling_3_0"
    zoom = next(p for p in guardados if p["nombre"] == "Crash zoom")
    assert zoom["categoria"] == "video"
    assert higgsfield.aprender() == {"nuevos": 0, "total": 3}


def test_generar_via_mcp_elige_herramienta(hf):
    conectar()
    r = higgsfield.generar_via_mcp("kling-3.0", "a cat", {"formato": "9:16", "duracion": 5})
    assert r["herramienta"] == "generate_video"
    assert r["url"].endswith("/media/video.mp4")
    nombre, args = ESTADO.llamadas[-1]
    assert args == {"prompt": "a cat", "model": "kling_3_0", "aspect_ratio": "9:16", "duration": 5}
    r = higgsfield.generar_via_mcp("nano-banana-pro", "a cat", {"formato": "1:1"})
    assert r["herramienta"] == "generate_image"
    assert ESTADO.llamadas[-1][1]["model"] == "nano_banana_pro"
    assert r["id_remoto"] == "j2" and r["estado"] == "queued" and r["url"] is None


def test_refresca_token_y_renueva_sesion(hf):
    conectar()
    higgsfield.herramientas()
    viejo = json.loads(hf.TOKEN_HIGGSFIELD.read_text())["token"]["access_token"]
    ESTADO.rechazar_token = viejo
    assert higgsfield.herramientas(forzar=True)
    nuevo = json.loads(hf.TOKEN_HIGGSFIELD.read_text())["token"]["access_token"]
    assert nuevo != viejo
    ESTADO.vencer_sesion = True
    assert higgsfield.herramientas(forzar=True)
    assert ESTADO.metodos.count("initialize") >= 3


def test_desconectar(hf):
    conectar()
    assert higgsfield.desconectar() == {"ok": True}
    assert not hf.TOKEN_HIGGSFIELD.exists()
    with pytest.raises(ErrorProveedor):
        higgsfield.herramientas(forzar=True)


def test_trabajo_higgsfield_completo(hf):
    conectar()
    spec = trabajos.validar({"tipo": "video", "modelo": "kling-3.0", "prompt": "a cat",
                             "ajustes": {"formato": "16:9", "duracion": 5}, "confirmar_creditos": True})
    t = trabajos.crear(spec)[0]
    assert t["demo"] is False
    fin = time.time() + 15
    while time.time() < fin:
        trabajos.tic()
        actual = trabajos.obtener(t["id"])
        if actual["estado"] in ("listo", "fallo"):
            break
        time.sleep(0.2)
    assert actual["estado"] == "listo", actual
    assert actual["resultado"]["url"] == f"/medios/{t['id']}.mp4"
    assert (hf.MEDIOS / f"{t['id']}.mp4").is_file()
