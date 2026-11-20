"""Guardar llaves en el .env desde la app: conserva el resto, valida y no muestra la llave completa."""
import pytest

from app import config


@pytest.fixture
def env_temporal(tmp_path, monkeypatch):
    ruta = tmp_path / ".env"
    ruta.write_text("# mis llaves\nARK_API_KEY=\nPUERTO=8010\nOTRA=algo\n", encoding="utf-8")
    monkeypatch.setattr(config, "RAIZ", tmp_path)
    for clave in config.EDITABLES_DESDE_APP:
        monkeypatch.delenv(clave, raising=False)
    yield ruta
    monkeypatch.undo()
    config.recargar()


def test_guarda_y_conserva(env_temporal):
    guardadas = config.guardar_llaves({"ARK_API_KEY": "  ark-1234567890abcd ", "OPENAI_API_KEY": "sk-proj-xyz98765"})
    assert guardadas == ["ARK_API_KEY", "OPENAI_API_KEY"]
    texto = env_temporal.read_text(encoding="utf-8")
    assert "ARK_API_KEY=ark-1234567890abcd" in texto
    assert "OPENAI_API_KEY=sk-proj-xyz98765" in texto
    assert "# mis llaves" in texto and "OTRA=algo" in texto and "PUERTO=8010" in texto
    assert config.cfg.ARK_API_KEY == "ark-1234567890abcd"
    estado = config.estado_llaves()
    assert estado["ARK_API_KEY"] == {"guardada": True, "final": "abcd"}
    assert "ark-1234567890abcd" not in str(estado)


def test_vacio_no_cambia(env_temporal):
    config.guardar_llaves({"ARK_API_KEY": "ark-primera-llave"})
    config.guardar_llaves({"ARK_API_KEY": "", "OLLAMA_MODELO": "glm-5.3-flash:cloud"})
    assert config.cfg.ARK_API_KEY == "ark-primera-llave"
    assert config.cfg.OLLAMA_MODELO == "glm-5.3-flash:cloud"


@pytest.mark.parametrize("datos", [
    {"PUERTO": "9000"},
    {"ARK_API_KEY": "con espacio adentro"},
    {"ARK_API_KEY": "abc\nINYECTADA=1"},
    {"OLLAMA_URL": "localhost:11434"},
    {},
])
def test_rechaza(env_temporal, datos):
    with pytest.raises(ValueError):
        config.guardar_llaves(datos)
    assert "INYECTADA" not in env_temporal.read_text(encoding="utf-8")
