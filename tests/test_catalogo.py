import pytest

from app import catalogo


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


def test_higgsfield_sin_precio():
    r = catalogo.costo("video", "kling-3.0", "720p", "16:9", 5)
    assert r["usd"] is None and r["creditos"] is None


def test_catalogo_publico_cumple_contrato():
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
    assert {m["nombre"] for m in hf} == {"Kling 3.0", "Veo 3.1", "Nano Banana Pro", "Soul 2",
                                         "Seedream 5 lite", "Higgsfield Audio"}
    assert all(m["gasta_creditos_higgsfield"] for m in hf)


def test_costo_real_desde_tokens():
    assert catalogo.costo_real_seedance("seedance-2.5", "480p", 48037) == pytest.approx(0.514, abs=1e-3)
