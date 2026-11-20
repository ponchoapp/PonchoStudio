import json

from app import prompts
from tests.falsos import ManejadorOllama, arrancar


def test_reglas_completa_lo_que_falta():
    r = prompts.reglas("un perro corre en la playa", "video")
    assert r.startswith("un perro corre en la playa")
    for pista in ("dolly", "lighting", "35mm", "sound"):
        assert pista in r
    assert len(r.split()) <= 120


def test_reglas_no_repite_si_ya_esta():
    base = "close-up portrait, neon lighting, 85mm lens, cinematic mood"
    assert prompts.reglas(base, "imagen") == base


def test_mejorar_sin_ia_usa_reglas(entorno):
    r = prompts.mejorar("un cóndor", "video", "seedance-2.5", "auto")
    assert r["motor"] == "reglas"
    r = prompts.mejorar("un cóndor", "imagen", None, "openai")
    assert r["motor"] == "reglas"


def test_mejorar_con_ollama_falso(entorno):
    servidor, base = arrancar(ManejadorOllama)
    try:
        entorno(OLLAMA_URL=base)
        r = prompts.mejorar("perro en la playa", "video", "seedance-2.5", "auto")
        assert r["motor"] == "ollama:poncho-prompts:latest"  # se salta el de embeddings
        assert r["prompt"].startswith("A golden retriever")
        assert "<think>" not in r["prompt"] and not r["prompt"].startswith("Prompt")
        r = prompts.mejorar("perro", "video", None, "ollama", "gpt-oss:120b-cloud")
        assert r["motor"] == "ollama:gpt-oss:120b-cloud"
        # Ollama viejo o modelo sin "think": reintenta sin el campo y funciona igual
        r = prompts.mejorar("perro", "video", None, "ollama", "viejo")
        assert r["motor"] == "ollama:viejo:latest" and r["prompt"].startswith("A golden retriever")
    finally:
        servidor.shutdown()


def test_elegir_prefiere_gemma4_y_qwen35(entorno, monkeypatch):
    from app.proveedores import ollama
    lista = ["nomic-embed-text:latest", "llama3.2:3b", "hf.co/unsloth/Qwen3.5-4B-GGUF:Q4_K_M",
             "hf.co/google/gemma-4-E4B-it-qat-q4_0-gguf:latest"]
    monkeypatch.setattr(ollama, "modelos", lambda: [{"nombre": n} for n in lista])
    assert ollama.elegir_modelo() == "hf.co/google/gemma-4-E4B-it-qat-q4_0-gguf:latest"
    lista.pop()
    assert ollama.elegir_modelo() == "hf.co/unsloth/Qwen3.5-4B-GGUF:Q4_K_M"
    assert ollama.elegir_modelo("llama3.2:3b") == "llama3.2:3b"  # lo que pida Poncho gana


def test_presets_lee_archivos_y_aplica(entorno):
    c = entorno()
    c.PRESETS.mkdir(parents=True, exist_ok=True)
    (c.PRESETS / "estilos.json").write_text(json.dumps([
        {"id": "neo-noir", "nombre": "Neo noir", "tipo": "estilo", "texto": "neo-noir, deep shadows"}]))
    (c.PRESETS / "camaras.json").write_text(json.dumps({"camaras": [
        {"id": "dolly", "nombre": "Dolly in", "texto": "slow dolly in"}]}))
    (c.PRESETS / "aprendidos.json").write_text(json.dumps([
        {"id": "hf-1", "nombre": "x", "categoria": "video", "prompt": "a test prompt", "origen": "higgsfield"}]))
    p = prompts.presets()
    assert p["estilos"][0]["origen"] == "poncho" and p["camaras"][0]["tipo"] == "camara"
    assert p["plantillas"][0]["origen"] == "higgsfield"
    final = prompts.aplicar_presets("A boxer in the rain.", "neo-noir", "dolly")
    assert final == "A boxer in the rain, slow dolly in, neo-noir, deep shadows"


def test_presets_vacios_sin_archivos(entorno):
    assert prompts.presets() == {"estilos": [], "camaras": [], "plantillas": []}
