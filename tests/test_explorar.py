"""Explorar: galería, presets y recrear de Higgsfield, contra el servidor MCP falso."""

import json
import time

import pytest

from app.proveedores import ErrorProveedor, higgsfield
from tests.falsos import ESTADO
from tests.test_higgsfield import conectar, hf  # noqa: F401  (fixture)


@pytest.fixture(autouse=True)
def limpiar_cache():
    higgsfield._cache_galeria.clear()
    yield
    higgsfield._cache_galeria.clear()


def llamadas(nombre):
    return [a for n, a in ESTADO.llamadas if n == nombre]


def test_galeria_video_imagen_y_cursor(hf):
    conectar()
    r = higgsfield.galeria("video")
    assert [i["id"] for i in r["items"]] == ["g1", "g2", "g3"]
    g1 = r["items"][0]
    assert g1 == {"id": "g1", "modelo": "seedance_2_5", "url": ESTADO.base + "/media/a.mp4",
                  "miniatura": ESTADO.base + "/media/a.jpg", "tipo": "video", "fecha": "2026-11-01"}
    assert r["siguiente"] == "g2"
    assert llamadas("show_generations")[-1] == {"limit": 20, "type": "video"}
    img = higgsfield.galeria("image")
    assert [(i["id"], i["tipo"], i["url"]) for i in img["items"]] == [("g4", "imagen", ESTADO.base + "/media/d.png")]
    pagina2 = higgsfield.galeria(None, "g2")
    assert [i["id"] for i in pagina2["items"]] == ["g5"] and pagina2["siguiente"] is None
    assert llamadas("show_generations")[-1]["cursor"] == "g2"


def test_galeria_usa_cache(hf):
    conectar()
    higgsfield.galeria("video")
    antes = len(llamadas("show_generations"))
    higgsfield.galeria("video")
    assert len(llamadas("show_generations")) == antes


def test_presets_recorre_fuentes_y_paginas_y_guarda(hf):
    conectar()
    r = higgsfield.presets_higgsfield()
    ids = [i["id"] for i in r["items"]]
    assert ids == ["p1", "p2", "p3", "p4"]  # sin duplicados entre fuentes
    fuentes = [(a.get("source"), a.get("cursor")) for a in llamadas("get_presets")]
    assert fuentes == [("trending", None), ("trending", "c2"), ("featured", None)]
    assert llamadas("execute_preset") == [] and not any(n.startswith("generate") for n, _ in ESTADO.llamadas)
    por_id = {i["id"]: i for i in r["items"]}
    assert por_id["p1"] == {"id": "p1", "nombre": "Crash Zoom", "tipo": "video",
                            "preview": ESTADO.base + "/media/p1.mp4", "preview_tipo": "video",
                            "prompt": "Crash zoom into the eyes of a boxer, sweat flying",
                            "modelo": "kling3_0", "categoria": "trending", "formato": None,
                            "duracion": None}
    assert por_id["p2"]["tipo"] == "imagen" and por_id["p2"]["preview_tipo"] == "imagen"
    assert por_id["p2"]["categoria"] == "retratos"
    assert por_id["p4"]["prompt"] is None and por_id["p4"]["preview_tipo"] == "imagen"
    archivo = json.loads((hf.PRESETS / "higgsfield_presets.json").read_text())
    assert archivo["actualizado"] and len(archivo["items"]) == 4
    # filtro por fuente
    assert [i["id"] for i in higgsfield.presets_higgsfield("featured")["items"]] == ["p4"]


def test_presets_sirve_archivo_fresco_o_si_falla(hf):
    conectar()
    higgsfield.presets_higgsfield()
    n = len(llamadas("get_presets"))
    assert len(higgsfield.presets_higgsfield()["items"]) == 4
    assert len(llamadas("get_presets")) == n  # < 24 h: no vuelve a llamar
    # archivo viejo + MCP caído → copia guardada con nota
    ruta = hf.PRESETS / "higgsfield_presets.json"
    datos = json.loads(ruta.read_text())
    datos["epoch"] = time.time() - 25 * 3600
    ruta.write_text(json.dumps(datos))
    ESTADO.presets_fallan = True
    r = higgsfield.presets_higgsfield()
    assert len(r["items"]) == 4 and "Copia guardada" in r["nota"]


def test_presets_sin_herramienta(hf, monkeypatch):
    conectar()
    sin = [h for h in higgsfield.herramientas() if "preset" not in h["name"]]
    monkeypatch.setattr(higgsfield, "herramientas", lambda forzar=False: sin)
    r = higgsfield.presets_higgsfield()
    assert r["items"] == [] and r["nota"]


def test_presets_sin_conexion_ni_archivo(hf):
    with pytest.raises(ErrorProveedor) as e:
        higgsfield.presets_higgsfield()
    assert e.value.codigo == 409


def test_recrear(hf):
    conectar()
    higgsfield.presets_higgsfield()
    llamadas_antes = len(ESTADO.llamadas)
    p1 = higgsfield.recrear("p1")
    assert p1["modelo_sugerido"] == "seedance-2.5" and p1["exclusivo"] is True
    assert p1["modelo_higgsfield"] == "hf:kling3_0" and p1["tipo"] == "video"
    assert p1["prompt"].startswith("Crash zoom") and p1["ajustes"]["duracion"] == 5
    p3 = higgsfield.recrear("p3")
    assert p3["exclusivo"] is False and p3["ajustes"]["formato"] == "9:16"
    assert p3["ajustes"]["resolucion"] == "720p"
    p2 = higgsfield.recrear("p2")
    assert p2["modelo_sugerido"] == "gpt-image-2" and p2["ajustes"]["calidad"] == "medium"
    assert p2["ajustes"]["formato"] in ("1:1", "2:3", "3:2")
    p4 = higgsfield.recrear("p4")
    assert p4["prompt"] == "Sin prompt" and "nota" in p4
    assert higgsfield.recrear("no-existe") is None
    assert len(ESTADO.llamadas) == llamadas_antes  # recrear no llama al MCP
