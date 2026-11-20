"""Cliente MCP + OAuth contra un servidor Higgsfield falso."""

import json
import time
from urllib.parse import parse_qs, urlparse

import pytest
import requests

from app import trabajos
from app.proveedores import ErrorProveedor, higgsfield
from tests.falsos import ESTADO, ManejadorMCP, arrancar, escribir_catalogo


@pytest.fixture
def hf(entorno):
    servidor, base = arrancar(ManejadorMCP)
    ESTADO.reiniciar()
    ESTADO.base = base
    c = entorno(HIGGSFIELD_MCP_URL=base + "/mcp")
    escribir_catalogo(c.PRESETS)
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
    assert "generate_video" in nombres and "show_generations" in nombres  # dos páginas de tools/list
    assert ESTADO.metodos[:2] == ["initialize", "notifications/initialized"]
    e = higgsfield.estado()
    assert e["conectado"] is True and e["creditos"] == 6000
    assert e["cuenta"] == "poncho@ejemplo.com"
    assert not any(n.startswith("generate") for n, _ in ESTADO.llamadas)


def test_aprender_solo_lee_cuenta_modelos_y_no_duplica(hf):
    conectar()
    r = higgsfield.aprender()
    assert r == {"nuevos": 1, "total": 1}  # el historial no trae prompts; solo search_presets
    llamadas = [n for n, _ in ESTADO.llamadas]
    assert "show_generations" in llamadas and "models_list" in llamadas and "search_presets" in llamadas
    assert not any(n.startswith("generate") for n in llamadas)
    assert "workspace_select" not in llamadas  # no es de lectura
    assert "models_get" not in llamadas        # pide un id que no tenemos
    args = dict(ESTADO.llamadas)
    assert args["show_generations"] == {"limit": 20} and args["search_presets"] == {"query": "cinematic"}
    archivo = json.loads((hf.PRESETS / "aprendidos.json").read_text())
    assert archivo["plantillas"][0]["nombre"] == "Crash zoom"
    assert archivo["plantillas"][0]["origen"] == "higgsfield"
    assert archivo["plantillas"][0]["categoria"] == "video"
    usados = archivo["modelos_usados"]
    assert usados[0] == {"modelo": "seedance_2_5", "app_id": None, "nombre": "seedance_2_5", "usos": 2}
    assert usados[1] == {"modelo": "kling3_0", "app_id": "hf:kling3_0", "nombre": "Kling 3.0", "usos": 1}
    assert higgsfield.aprender() == {"nuevos": 0, "total": 1}
    # /api/presets sigue viendo las plantillas aprendidas
    from app import prompts
    assert any(p["nombre"] == "Crash zoom" for p in prompts.presets()["plantillas"])


def test_aprender_lee_formato_viejo_en_lista(hf):
    hf.PRESETS.mkdir(parents=True, exist_ok=True)
    (hf.PRESETS / "aprendidos.json").write_text("[]")
    conectar()
    assert higgsfield.aprender()["total"] == 1


def test_generar_via_mcp_pasa_id_real(hf):
    conectar()
    entradas = {"primer_cuadro": "https://cdn.ejemplo.com/a.png", "ultimo_cuadro": "/medios/local.png",
                "referencias": ["https://cdn.ejemplo.com/r.png"]}
    r = higgsfield.generar_via_mcp("hf:kling4_0", "a cat",
                                   {"formato": "9:16", "duracion": 5, "resolucion": "1080p"}, entradas)
    assert r["herramienta"] == "generate_video"
    assert r["url"].endswith("/media/video.mp4")
    _, args = ESTADO.llamadas[-1]
    assert args == {"model": "kling4_0", "prompt": "a cat", "aspect_ratio": "9:16", "duration": 5,
                    "resolution": "1080p",
                    "medias": [{"role": "start_image", "url": "https://cdn.ejemplo.com/a.png"},
                               {"role": "image_references", "url": "https://cdn.ejemplo.com/r.png"}]}
    r = higgsfield.generar_via_mcp("hf:nano_banana_pro", "a cat", {"formato": "1:1", "resolucion": "2k"})
    assert r["herramienta"] == "generate_image"
    assert ESTADO.llamadas[-1][1] == {"model": "nano_banana_pro", "prompt": "a cat", "aspect_ratio": "1:1",
                                      "resolution": "2k"}
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
    spec = trabajos.validar({"tipo": "video", "modelo": "hf:kling4_0", "prompt": "a cat",
                             "ajustes": {"formato": "16:9", "duracion": 5}, "confirmar_creditos": True})
    t = trabajos.crear(spec)[0]
    assert t["demo"] is False and t["ajustes"]["resolucion"] == "720p"
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
