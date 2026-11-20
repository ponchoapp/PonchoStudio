// Piezas compartidas por los generadores de video e imagen:
// selector de modelos, caja de prompt con "Mejorar prompt", chips de presets,
// botón Generar con costo en vivo y feed de trabajos que se refresca cada 3 s.
import { api, generarConfirmando } from "./api.js";
import { el, limpiar, icono, tarjetaModelo, toast, usd, abrirVisor, tarjetaMedio, segmentado } from "./ui.js";

/* ---------- Selector de modelos ---------- */
export function selectorModelos({ modelos, valor, onElegir, visibles = 3 }) {
  const caja = el("div", { class: "panel-bloque" });
  let abierto = false;
  const pintar = () => {
    const elegido = modelos.find((m) => m.id === valor);
    let lista = modelos;
    if (!abierto) {
      lista = modelos.slice(0, visibles);
      if (elegido && !lista.includes(elegido)) lista = [...lista.slice(0, visibles - 1), elegido];
    }
    const grupo = el("div", { class: "modelos", role: "radiogroup", "aria-label": "Modelo" },
      lista.map((m) => tarjetaModelo(m, { seleccionado: m.id === valor, onElegir: (mm) => { valor = mm.id; pintar(); onElegir(mm); } })));
    const resto = modelos.length - visibles;
    limpiar(caja,
      el("span", { class: "etiqueta" }, "Modelo"),
      grupo,
      resto > 0 ? el("button", { class: "btn btn-fantasma btn-chico modelos-mas", type: "button", "aria-expanded": String(abierto),
        onclick: () => { abierto = !abierto; pintar(); } }, abierto ? "Ver menos modelos" : `Ver ${resto} modelos más`) : null);
  };
  pintar();
  return caja;
}

/* ---------- Caja de prompt ---------- */
function nombreMotor(m) {
  if (!m) return "";
  if (m === "reglas") return "Reglas locales (sin IA)";
  const [a, ...b] = m.split(":");
  const nombre = { ollama: "Ollama", openai: "OpenAI" }[a] || a;
  return b.length ? `${nombre} · ${b.join(":")}` : nombre;
}

export function cajaPrompt({ tipo, valor = "", salud, modeloActual, onCambio, placeholder }) {
  const id = "prompt-" + tipo;
  const area = el("textarea", { id, class: "", rows: 5, maxlength: 4000, placeholder, spellcheck: true });
  area.value = valor;
  const contador = el("span", { class: "contador", "aria-live": "off" });
  const actualizarContador = () => { contador.textContent = `${area.value.length}/4000`; };
  area.addEventListener("input", () => { actualizarContador(); onCambio(area.value); });
  actualizarContador();

  const prov = (salud && salud.proveedores) || {};
  const ollamaListo = !!(prov.ollama && prov.ollama.listo);
  const openaiListo = !!(prov.openai && prov.openai.listo);
  let motor = "auto";
  let ollamaModelo = null;
  let anterior = null;

  const usado = el("div", { class: "motor-usado", "aria-live": "polite" });
  const btnMejorar = el("button", { class: "btn btn-chico", type: "button" }, icono("chispa"), "Mejorar prompt");
  const btnGuardar = el("button", { class: "btn btn-fantasma btn-chico", type: "button" }, icono("guardar"), "Guardar");
  const prompt = el("div", { class: "prompt-caja" },
    el("label", { for: id, class: "solo-lector" }, "Describe lo que quieres generar"),
    area,
    el("div", { class: "prompt-barra" }, btnMejorar, btnGuardar, contador));

  const selMotor = segmentado({
    etiqueta: "Motor para mejorar",
    opciones: [
      { valor: "auto", texto: "Auto", titulo: "Ollama primero (gratis), luego OpenAI, luego reglas" },
      { valor: "ollama", texto: "Ollama", deshabilitado: !ollamaListo, titulo: ollamaListo ? "Modelos locales, gratis" : "Ollama no está abierto" },
      { valor: "openai", texto: "OpenAI", deshabilitado: !openaiListo, titulo: openaiListo ? "Usa tu llave de OpenAI" : "Falta la llave de OpenAI" },
    ],
    valor: motor,
    onCambio: (v) => { motor = v; selOllama.hidden = v === "openai" || !selOllama.dataset.hay; },
  });

  const idSel = id + "-ollama";
  const select = el("select", { class: "entrada", id: idSel });
  const selOllama = el("div", { class: "campo", hidden: true },
    el("label", { for: idSel }, "Modelo de Ollama"), select);
  select.addEventListener("change", () => { ollamaModelo = select.value || null; });
  if (ollamaListo) {
    api.ollamaModelos({ silencioso: true }).then((r) => {
      const lista = (r && r.modelos) || [];
      if (!lista.length) return;
      select.replaceChildren(el("option", { value: "" }, "El que elija la app"),
        ...lista.map((m) => el("option", { value: m.nombre }, m.nombre)));
      selOllama.dataset.hay = "1";
      selOllama.hidden = motor === "openai";
    }).catch(() => {});
  }

  btnMejorar.onclick = async () => {
    const texto = area.value.trim();
    if (!texto) { toast("Escribe una idea corta y la mejoro.", "info"); area.focus(); return; }
    btnMejorar.disabled = true;
    btnMejorar.lastChild.textContent = "Mejorando…";
    try {
      const r = await api.mejorar({ prompt: texto, tipo, modelo: modeloActual(), motor, ollama_modelo: ollamaModelo });
      anterior = area.value;
      area.value = r.prompt || area.value;
      actualizarContador();
      onCambio(area.value);
      const deshacer = el("button", { class: "btn btn-fantasma btn-chico", type: "button" }, icono("deshacer"), "Deshacer");
      deshacer.onclick = () => {
        if (anterior == null) return;
        area.value = anterior; anterior = null; actualizarContador(); onCambio(area.value);
        limpiar(usado, "Volviste a tu prompt.");
      };
      limpiar(usado, el("span", {}, "Mejorado con ", el("b", {}, nombreMotor(r.motor))), deshacer);
    } catch { /* toast ya mostrado */ } finally {
      btnMejorar.disabled = false;
      btnMejorar.lastChild.textContent = "Mejorar prompt";
    }
  };
  btnGuardar.onclick = async () => {
    const texto = area.value.trim();
    if (!texto) { toast("No hay prompt para guardar.", "info"); return; }
    const nombre = texto.split(/\s+/).slice(0, 5).join(" ");
    try { await api.guardarPrompt({ nombre, prompt: texto, tipo }); toast("Prompt guardado.", "ok"); } catch { /* toast */ }
  };

  const caja = el("div", { class: "panel-bloque" },
    el("span", { class: "etiqueta", "aria-hidden": "true" }, "Prompt"),
    prompt,
    el("div", { class: "mejorar-fila", style: { gridTemplateColumns: "1fr" } }, selMotor, selOllama),
    usado);
  caja.area = area;
  caja.fijar = (t) => { area.value = t; actualizarContador(); };
  return caja;
}

/* ---------- Chips de presets ---------- */
export function chipsPresets({ etiqueta, lista, valor, onCambio, visibles = 8 }) {
  const caja = el("div", { class: "panel-bloque" });
  let abierto = false;
  const pintar = () => {
    let items = abierto ? lista : lista.slice(0, visibles);
    const elegido = lista.find((p) => p.id === valor);
    if (elegido && !items.includes(elegido)) items = [...items, elegido];
    const grupo = el("div", { class: "chips", role: "group", "aria-label": etiqueta },
      items.map((p) => el("button", {
        class: "chip", type: "button", "aria-pressed": String(p.id === valor), title: p.texto,
        onclick: () => { valor = valor === p.id ? null : p.id; pintar(); onCambio(valor ? p : null); },
      }, p.origen === "higgsfield" ? el("i", { class: "punto-origen", title: "Aprendido de Higgsfield" }) : null, p.nombre)),
      lista.length > visibles ? el("button", { class: "chip", type: "button", "aria-expanded": String(abierto), onclick: () => { abierto = !abierto; pintar(); } },
        abierto ? "Menos" : `+${lista.length - visibles}`) : null);
    const sel = lista.find((p) => p.id === valor);
    limpiar(caja,
      el("span", { class: "etiqueta" }, etiqueta, sel ? el("span", { class: "valor" }, sel.nombre) : null),
      lista.length ? grupo : el("p", { class: "nota" }, "Sin opciones todavía."));
  };
  pintar();
  caja.fijar = (v) => { valor = v; pintar(); };
  return caja;
}

/* ---------- Botón Generar con costo en vivo ---------- */
export function botonGenerar({ tipo, cuerpoCosto, textoBase, onGenerar }) {
  const btn = el("button", { class: "btn btn-primario btn-grande btn-generar", type: "button" });
  const detalle = el("div", { class: "generar-detalle", "aria-live": "polite" });
  let ultimo = null, temporizador = null, ocupado = false, pedido = 0;
  const pintar = () => {
    const base = textoBase();
    let costo = "";
    if (ultimo) {
      if (ultimo.usd != null) costo = usd(ultimo.usd);
      else if (ultimo.creditos != null) costo = `${ultimo.creditos} créditos`;
      else if (ultimo.usd === null) costo = "usa créditos";
    }
    limpiar(btn, ocupado ? "Enviando…" : base, !ocupado && costo ? el("span", { class: "costo" }, ` · ${costo}`) : null);
    detalle.textContent = ultimo && ultimo.detalle ? ultimo.detalle : "";
  };
  const recalcular = () => {
    clearTimeout(temporizador);
    pintar();
    temporizador = setTimeout(async () => {
      const mio = ++pedido;
      try {
        const r = await api.costo({ tipo, ...cuerpoCosto() });
        if (mio === pedido) { ultimo = r; pintar(); }
      } catch { if (mio === pedido) { ultimo = null; pintar(); } }
    }, 220);
  };
  btn.onclick = async () => {
    if (ocupado) return;
    ocupado = true; btn.disabled = true; pintar();
    try { await onGenerar(); } finally { ocupado = false; btn.disabled = false; pintar(); }
  };
  const pie = el("div", { class: "generar-pie" }, btn, detalle);
  pie.recalcular = recalcular;
  recalcular();
  return pie;
}

export async function enviarGeneracion(cuerpo) {
  try {
    const trabajos = await generarConfirmando(cuerpo);
    if (trabajos === null) { toast("No se generó nada. No se gastaron créditos.", "info"); return null; }
    toast(trabajos.length > 1 ? `${trabajos.length} trabajos en cola.` : "Trabajo en cola.", "ok");
    return trabajos;
  } catch { return null; }
}

/* ---------- Acciones del visor (compartidas con la biblioteca) ---------- */
export function accionesVisor({ alCambiar }) {
  return {
    onFavorito: async (t) => { const nt = await api.favorito(t.id); alCambiar && alCambiar(); return nt; },
    onRepetir: async (t) => {
      const r = await generarConfirmando({}, (c) => api.repetir(t.id, c));
      if (r === null) return false;
      toast("Repetido con semilla nueva. Va en cola.", "ok");
      alCambiar && alCambiar();
      return true;
    },
    onBorrar: async (t) => { await api.borrar(t.id); toast("Trabajo borrado.", "ok"); alCambiar && alCambiar(); return true; },
  };
}

/* ---------- Feed de trabajos ---------- */
export function feedTrabajos({ tipo, demo, titulo, vacio }) {
  const tarjetas = new Map();
  const grilla = el("div", { class: "masonry" });
  const caja = el("section", { class: "feed", "aria-label": titulo });
  const estadoVacio = el("div", { class: "vacio" }, el("strong", {}, vacio.titulo), el("span", {}, vacio.texto));
  const cabeza = el("div", { class: "seccion-cabeza" }, el("h2", {}, titulo),
    el("a", { class: "btn btn-fantasma btn-chico", href: "#/biblioteca" }, icono("libro"), "Ver biblioteca"));
  caja.append(cabeza, estadoVacio, el("div", { class: "feed-grilla" }, grilla));
  let temporizador = null, vivo = true, primera = true;

  const acciones = accionesVisor({ alCambiar: () => refrescar() });
  const abrir = (t) => abrirVisor(t, { ...acciones, demo });

  async function refrescar() {
    if (!vivo) return;
    try {
      const r = await api.trabajos({ tipo, limite: 30 }, { silencioso: !primera });
      if (!vivo) return;
      pintar(r.trabajos || []);
    } catch { /* sin conexión: se reintenta */ }
    primera = false;
  }
  function pintar(lista) {
    estadoVacio.hidden = lista.length > 0;
    const vistos = new Set();
    lista.forEach((t, i) => {
      vistos.add(t.id);
      let tarjeta = tarjetas.get(t.id);
      if (tarjeta) tarjeta.actualizar(t);
      else { tarjeta = tarjetaMedio(t, { onAbrir: abrir, demo }); tarjetas.set(t.id, tarjeta); }
      if (grilla.children[i] !== tarjeta) grilla.insertBefore(tarjeta, grilla.children[i] || null);
    });
    for (const [id, nodo] of tarjetas) if (!vistos.has(id)) { nodo.remove(); tarjetas.delete(id); }
  }
  function ciclo() {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      if (!document.hidden) await refrescar();
      if (vivo) ciclo();
    }, 3000);
  }
  refrescar().then(ciclo);
  caja.refrescar = refrescar;
  caja.agregar = (trabajos) => {
    // Muestra de inmediato los trabajos recién creados.
    const actuales = [...tarjetas.keys()];
    if (trabajos && trabajos.length) {
      trabajos.forEach((t) => { if (!tarjetas.has(t.id)) { const tj = tarjetaMedio(t, { onAbrir: abrir, demo }); tarjetas.set(t.id, tj); grilla.prepend(tj); } });
      estadoVacio.hidden = true;
    }
    refrescar();
    return actuales;
  };
  caja.parar = () => { vivo = false; clearTimeout(temporizador); };
  return caja;
}

/* ---------- Precarga (de plantillas, estudios o repetir) ---------- */
export function aplicarPrecarga(st, precarga) {
  if (!precarga) return;
  if (precarga.prompt) st.prompt = precarga.prompt;
  if (precarga.modelo) st.modelo = precarga.modelo;
  if (precarga.ajustes) Object.assign(st, precarga.ajustes);
  if (precarga.entradas) Object.assign(st, precarga.entradas);
  if ("estilo" in precarga) st.estilo = precarga.estilo;
  if ("camara" in precarga) st.camara = precarga.camara;
}
