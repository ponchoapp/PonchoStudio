"""Miniaturas de plantillas con un OpenAI falso."""

import json
import time

import pytest
import requests

from app import miniaturas, prompts
from app.proveedores import ErrorProveedor, openai_img
from tests.falsos import OPENAI, ManejadorOpenAI, arrancar

PLANTILLAS = [
    {"id": "barrio", "nombre": "Barrio", "categoria": "video", "prompt": "Vertical 9:16, a rapper on a rooftop"},
    {"id": "playa", "nombre": "Playa", "categoria": "video", "prompt": "A wave breaks at sunset"},
    {"id": "retrato", "nombre": "Retrato", "categoria": "imagen", "prompt": "Portrait of a woman, soft light"},
    {"id": "mala", "nombre": "Mala", "categoria": "imagen", "prompt": "FALLA a propósito"},
]


@pytest.fixture
def oai(entorno, monkeypatch):
    servidor, base = arrancar(ManejadorOpenAI)
    OPENAI.reiniciar()
    monkeypatch.setattr(openai_img, "BASE", base + "/v1")
    c = entorno(OPENAI_API_KEY="llave-falsa")
    c.PRESETS.mkdir(parents=True, exist_ok=True)
    (c.PRESETS / "plantillas.json").write_text(json.dumps(PLANTILLAS))
    miniaturas._lote.update(trabajo_id=None, hechas=0, total=0, costo_usd=0.0, fallidas=[], listo=True)
    yield c
    servidor.shutdown()


def test_costo(oai):
    assert miniaturas.costo() == {"total": 4, "usd": 0.044}
    assert miniaturas.costo(["playa"], "medium") == {"total": 1, "usd": 0.042}


def test_tamano_y_prompt():
    assert miniaturas.tamano_para(PLANTILLAS[0]) == "1024x1536"
    assert miniaturas.tamano_para(PLANTILLAS[1]) == "1536x1024"
    assert miniaturas.tamano_para({"categoria": "video", "prompt": "16:9 wide city"}) == "1536x1024"
    assert miniaturas.tamano_para(PLANTILLAS[2]) == "1024x1536"
    assert miniaturas.prompt_para(PLANTILLAS[1]) == "cinematic still frame of: A wave breaks at sunset"
    assert miniaturas.prompt_para(PLANTILLAS[2]) == "Portrait of a woman, soft light"


def test_sin_llave_409(entorno):
    with pytest.raises(ErrorProveedor) as e:
        miniaturas.generar()
    assert e.value.codigo == 409


def test_pocas_se_hacen_de_una(oai):
    codigo, cuerpo = miniaturas.generar(["playa", "no-existe"])
    assert codigo == 200
    assert cuerpo == {"hechas": 1, "fallidas": [{"id": "no-existe", "error": "Esa plantilla no existe."}],
                      "costo_usd": 0.011}
    pedido = OPENAI.pedidos[-1]
    assert pedido["quality"] == "low" and pedido["size"] == "1536x1024"
    assert pedido["prompt"].startswith("cinematic still frame of:")
    assert (oai.PRESETS / "miniaturas" / "playa.png").read_bytes()[:4] == b"\x89PNG"
    plantillas = {p["id"]: p for p in prompts.presets()["plantillas"]}
    assert plantillas["playa"]["miniatura"] == "/presets/miniaturas/playa.png"
    assert plantillas["barrio"]["miniatura"] is None
    assert miniaturas.costo()["total"] == 3  # ya no cuenta la que tiene miniatura
    assert not list(oai.MEDIOS.glob("img_*.png"))  # se movió, no quedó copia


def test_lote_en_segundo_plano(oai):
    miniaturas.generar(["playa"])
    codigo, cuerpo = miniaturas.generar()
    assert codigo == 202 and cuerpo["trabajo_id"].startswith("m_")
    fin = time.time() + 15
    while time.time() < fin and not miniaturas.estado_lote()["listo"]:
        time.sleep(0.1)
    e = miniaturas.estado_lote()
    assert e["listo"] and e["total"] == 3 and e["hechas"] == 2
    assert e["costo_usd"] == pytest.approx(0.022)
    assert [f["id"] for f in e["fallidas"]] == ["mala"]
    assert OPENAI.max_activos <= 2
    assert {p["size"] for p in OPENAI.pedidos if "rapper" in p["prompt"]} == {"1024x1536"}


def test_rutas_en_servidor(servidor):
    b = servidor["base"]
    assert requests.post(b + "/api/plantillas/miniaturas", json={}).status_code == 409
    assert requests.post(b + "/api/plantillas/miniaturas", json={"calidad": "ultra"}).status_code == 400
    r = requests.post(b + "/api/plantillas/miniaturas/costo", json={"calidad": "low"})
    assert r.status_code == 200 and r.json() == {"total": 0, "usd": 0.0}
    e = requests.get(b + "/api/plantillas/miniaturas/estado").json()
    assert set(e) >= {"hechas", "total", "costo_usd", "listo"}
    carpeta = servidor["datos"] / "presets" / "miniaturas"
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / "x.png").write_bytes(b"\x89PNG\r\n\x1a\nfalso")
    assert requests.get(b + "/presets/miniaturas/x.png").status_code == 200
    # Higgsfield sin conectar
    assert requests.get(b + "/api/higgsfield/galeria?tipo=video").status_code == 409
    assert requests.get(b + "/api/higgsfield/presets").status_code == 409
    assert requests.post(b + "/api/higgsfield/recrear", json={"preset_id": "p1"}).status_code == 404
    assert requests.post(b + "/api/higgsfield/recrear", json={}).status_code == 400
