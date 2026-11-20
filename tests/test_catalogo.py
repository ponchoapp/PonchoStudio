import shutil
from pathlib import Path

import pytest

from app import catalogo
from tests.falsos import escribir_catalogo

REAL = Path(__file__).resolve().parent.parent / "data" / "presets" / "higgsfield_catalogo.json"


def test_costo_seedance_25_480p_5s():
    r = catalogo.costo("video", "seedance-2.5", "480p", "16:9", 5)
    assert r["usd"] == pytest.approx(0.514, abs=0.001)
    assert "tokens" in r["detalle"]


def test_tokens_formula():
    assert catalogo.tokens_video(854, 480, 5) == pytest.approx(48037.5)


def test_costo_1080p_usa_tarifa_mayor():
    r = catalogo.costo("video", "seedance-2.5", "1080p", "16:9", 5)
    esperado = 1920 * 1080 * 24 * 5 / 1024 / 1e6 * 11.7
    assert r["usd"] == pytest.approx(esperado, abs=1e-4)


def test_serie_20_usa_pixeles_propios_en_480p():
    m = catalogo.buscar("seedance-2.0")
    assert catalogo.pixeles(m, "480p", "16:9") == (864, 496)
    assert catalogo.pixeles(m, "480p", "9:16") == (496, 864)
    assert catalogo.pixeles(m, "720p", "16:9") == (1280, 720)
    r = catalogo.costo("video", "seedance-2.0", "480p", "16:9", 5)
    assert r["usd"] == pytest.approx(864 * 496 * 24 * 5 / 1024 / 1e6 * 7.0, abs=1e-4)


def test_fast_no_tiene_1080p():
    with pytest.raises(ValueError):
        catalogo.costo("video", "seedance-2.0-fast", "1080p", "16:9", 5)


def test_variantes_multiplican():
    uno = catalogo.costo("video", "seedance-2.5", "720p", "9:16", 5)["usd"]
    tres = catalogo.costo("video", "seedance-2.5", "720p", "9:16", 5, variantes=3)["usd"]
    assert tres == pytest.approx(uno * 3, abs=1e-3)


def test_costo_imagen_estimado():
    r = catalogo.costo("imagen", "gpt-image-2", calidad="high", variantes=2)
    assert r["usd"] == pytest.approx(0.334)
    assert "estimado" in r["detalle"]


def test_higgsfield_sin_precio(entorno):
    escribir_catalogo(entorno().PRESETS)
    r = catalogo.costo("video", "hf:kling4_0", "720p", "16:9", 5)
    assert r["usd"] is None and r["creditos"] is None


def test_catalogo_publico_cumple_contrato(entorno):
    escribir_catalogo(entorno().PRESETS)
    c = catalogo.catalogo_publico()
    assert set(c) == {"video", "imagen", "audio"}
    campos_video = {"id", "nombre", "proveedor", "etiqueta", "resoluciones", "formatos", "duracion",
                    "audio", "entradas", "gasta_creditos_higgsfield", "nota"}
    for m in c["video"]:
        assert campos_video <= set(m)
        assert not any(k.startswith("_") for k in m)
    s25 = next(m for m in c["video"] if m["id"] == "seedance-2.5")
    assert s25["duracion"] == {"min": 4, "max": 30}
    assert s25["resoluciones"] == ["480p", "720p", "1080p"]
    img = next(m for m in c["imagen"] if m["id"] == "gpt-image-2")
    assert img["calidades"] == ["low", "medium", "high"]
    assert img["formatos"] == ["1:1", "2:3", "3:2"]
    assert img["variantes_max"] == 4
    hf = [m for lista in c.values() for m in lista if m["proveedor"] == "higgsfield"]
    assert [m["id"] for m in hf] == ["hf:kling4_0", "hf:kling3_0", "hf:nano_banana_pro", "hf:elevenlabs_v4"]
    assert all(m["gasta_creditos_higgsfield"] and m["nota"] == catalogo.NOTA_HIGGSFIELD for m in hf)
    k4 = next(m for m in hf if m["id"] == "hf:kling4_0")
    assert k4["duracion"] == {"min": 3, "max": 30} and "auto" in k4["formatos"]
    assert catalogo.buscar("hf:kling4_0")["_hf_id"] == "kling4_0"
    # nada de modelos inventados
    for viejo in ("kling-3.0", "veo-3.1", "nano-banana-pro", "soul-2", "seedream-5-lite", "higgsfield-audio"):
        assert catalogo.buscar(viejo) is None


def test_sin_catalogo_higgsfield_no_hay_modelos(entorno):
    entorno()
    c = catalogo.catalogo_publico()
    assert not any(m["proveedor"] == "higgsfield" for lista in c.values() for m in lista)
    assert c["audio"] == []


def test_catalogo_higgsfield_roto_no_revienta(entorno):
    presets = entorno().PRESETS
    presets.mkdir(parents=True, exist_ok=True)
    (presets / "higgsfield_catalogo.json").write_text("{esto no es json")
    assert catalogo.modelos_higgsfield() == {"video": [], "imagen": [], "audio": []}


@pytest.mark.skipif(not REAL.is_file(), reason="falta el catálogo real")
def test_catalogo_real_de_higgsfield(entorno):
    presets = entorno().PRESETS
    presets.mkdir(parents=True, exist_ok=True)
    shutil.copy(REAL, presets / "higgsfield_catalogo.json")
    hf = catalogo.modelos_higgsfield()
    total = sum(len(v) for v in hf.values())
    assert total == 26
    ids = {m["id"] for v in hf.values() for m in v}
    assert {"hf:kling4_0", "hf:cinematic_studio_video_4_0", "hf:soul_2", "hf:nano_banana_pro",
            "hf:elevenlabs_music_v2_5"} <= ids


def test_costo_real_desde_tokens():
    assert catalogo.costo_real_seedance("seedance-2.5", "480p", 48037) == pytest.approx(0.514, abs=1e-3)
