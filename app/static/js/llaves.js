// Ventana "Pegar mis llaves": guarda llaves en el .env local vía POST /api/llaves.
// Nunca muestra una llave completa: solo "termina en …abcd".
import { api } from "./api.js";
import { el, icono, modal, toast } from "./ui.js";

const CAMPOS = [
  { nombre: "ARK_API_KEY", etiqueta: "Llave de BytePlus", ayuda: "Seedance y Seedream", tipo: "secreto", placeholder: "Pega aquí la API key de ModelArk" },
  { nombre: "OPENAI_API_KEY", etiqueta: "Llave de OpenAI", ayuda: "Imágenes y mejorar prompts", tipo: "secreto", placeholder: "sk-…" },
  { nombre: "OLLAMA_URL", etiqueta: "Dirección de Ollama", ayuda: "Opcional", tipo: "texto", placeholder: "http://localhost:11434" },
  { nombre: "OLLAMA_MODELO", etiqueta: "Modelo de Ollama", ayuda: "Opcional", tipo: "modelo" },
];

function estadoGuardado(info) {
  if (info && info.guardada) {
    return el("span", { class: "llave-estado llave-si" }, info.final ? `Guardada · termina en …${info.final}` : "Guardada");
  }
  return el("span", { class: "llave-estado" }, "Sin guardar");
}

function campoSecreto(c, info) {
  const id = "llave-" + c.nombre;
  const input = el("input", {
    class: "entrada", id, type: "password", name: c.nombre, placeholder: info && info.guardada ? "Deja vacío para no cambiarla" : c.placeholder,
    autocomplete: "off", spellcheck: false, autocapitalize: "off",
  });
  const ojo = el("button", { class: "btn-icono llave-ojo", type: "button", "aria-label": `Mostrar ${c.etiqueta.toLowerCase()}`, "aria-pressed": "false", "aria-controls": id }, icono("ojo"));
  ojo.onclick = () => {
    const ver = input.type === "password";
    input.type = ver ? "text" : "password";
    ojo.setAttribute("aria-pressed", String(ver));
    ojo.setAttribute("aria-label", `${ver ? "Ocultar" : "Mostrar"} ${c.etiqueta.toLowerCase()}`);
    ojo.replaceChildren(icono(ver ? "ojoNo" : "ojo"));
  };
  const nodo = el("div", { class: "campo" },
    el("label", { for: id }, el("span", {}, c.etiqueta, el("small", { class: "llave-ayuda" }, ` · ${c.ayuda}`)), estadoGuardado(info)),
    el("div", { class: "llave-fila" }, input, ojo));
  return { nodo, leer: () => input.value.trim() };
}

function campoTexto(c, info) {
  const id = "llave-" + c.nombre;
  const input = el("input", { class: "entrada", id, type: "url", name: c.nombre, placeholder: c.placeholder, autocomplete: "off", spellcheck: false });
  const nodo = el("div", { class: "campo" },
    el("label", { for: id }, el("span", {}, c.etiqueta, el("small", { class: "llave-ayuda" }, ` · ${c.ayuda}`)), estadoGuardado(info)),
    input);
  return { nodo, leer: () => input.value.trim() };
}

function campoModelo(c, info) {
  const id = "llave-" + c.nombre;
  const select = el("select", { class: "entrada", id, name: c.nombre }, el("option", { value: "" }, "No cambiar"));
  const nota = el("p", { class: "nota" }, "Buscando modelos de Ollama…");
  api.ollamaModelos({ silencioso: true }).then((r) => {
    const lista = (r && r.modelos) || [];
    lista.forEach((m) => select.append(el("option", { value: m.nombre }, m.nombre)));
    nota.textContent = lista.length ? "" : "Ollama no respondió. Ábrelo y vuelve a abrir esta ventana.";
    nota.hidden = !!lista.length;
  }).catch(() => { nota.textContent = "Ollama no respondió. Ábrelo y vuelve a abrir esta ventana."; });
  const nodo = el("div", { class: "campo" },
    el("label", { for: id }, el("span", {}, c.etiqueta, el("small", { class: "llave-ayuda" }, ` · ${c.ayuda}`)),
      info && info.guardada ? el("span", { class: "llave-estado llave-si" }, info.final ? `Guardado · ${info.final}` : "Guardado") : estadoGuardado(info)),
    select, nota);
  return { nodo, leer: () => select.value };
}

/** Abre la ventana. alGuardar(respuesta) se llama tras guardar bien. */
export async function abrirModalLlaves({ alGuardar } = {}) {
  let estado = {};
  try { estado = (await api.llaves({ silencioso: true })) || {}; } catch { estado = {}; }

  const campos = CAMPOS.map((c) => {
    const info = estado[c.nombre];
    if (c.tipo === "secreto") return { c, ...campoSecreto(c, info) };
    if (c.tipo === "modelo") return { c, ...campoModelo(c, info) };
    return { c, ...campoTexto(c, info) };
  });

  const btnGuardar = el("button", { class: "btn btn-primario", type: "submit" }, "Guardar llaves");
  const btnCancelar = el("button", { class: "btn", type: "button" }, "Cancelar");
  const form = el("form", { class: "llaves-form", novalidate: true },
    el("h2", { id: "llaves-titulo" }, "Pega tus llaves"),
    el("p", {}, "Deja vacío lo que no quieras cambiar."),
    campos.map((x) => x.nodo),
    el("p", { class: "nota llaves-privacidad" }, "Se guardan solo en tu PC, en el archivo .env. No salen de aquí."),
    el("div", { class: "modal-acciones" }, btnCancelar, btnGuardar));

  const cerrar = modal(form, { etiqueta: "Pega tus llaves", clase: "modal-llaves" });
  btnCancelar.onclick = () => cerrar();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cuerpo = {};
    for (const x of campos) { const v = x.leer(); if (v) cuerpo[x.c.nombre] = v; }
    if (!Object.keys(cuerpo).length) { toast("No escribiste ninguna llave nueva.", "info"); return; }
    btnGuardar.disabled = true; btnGuardar.textContent = "Guardando…";
    try {
      const r = await api.guardarLlaves(cuerpo);
      toast("Llaves guardadas", "ok");
      if (r && r.salud) document.dispatchEvent(new CustomEvent("poncho:salud", { detail: r.salud }));
      cerrar();
      if (alGuardar) alGuardar(r);
    } catch {
      btnGuardar.disabled = false; btnGuardar.textContent = "Guardar llaves";
    }
  });
  return cerrar;
}
