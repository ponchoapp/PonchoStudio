// Piezas compartidas por los generadores de video e imagen.
// Distribución: panel izquierdo (modelo + entradas + ajustes), feed central en masonry
// y barra de prompt flotante abajo. En celular el panel es una hoja inferior.
import { api, generarConfirmando } from "./api.js";
import {
  el, limpiar, icono, toast, usd, abrirVisor, tarjetaMedio, segmentado, popover, masonry, columnasFeed,
  iconoModelo, insigniaModelo, precargaDeTrabajo,
} from "./ui.js";

/* ---------- Selector de modelo (menú desplegable con lista rica) ---------- */
export function selectorModelo({ modelos, valor, onElegir }) {
  const boton = el("button", { class: "sel-modelo", type: "button", "aria-label": "Elegir modelo" });
  const ancla = el("div", { class: "pop-ancla" }, boton);
  const pintarBoton = () => {
    const m = modelos.find((x) => x.id === valor) || modelos[0];
    limpiar(boton, iconoModelo(m),
      el("span", { class: "modelo-txt" }, el("strong", {}, m.nombre), el("small", {}, m.etiqueta || m.proveedor)),
      insigniaModelo(m), icono("abajo"));
    boton.setAttribute("aria-label", `Modelo: ${m.nombre}. Cambiar modelo`);
  };
  const opcion = (m, cerrar) => {
    const b = el("button", { class: "opcion-modelo", type: "button", role: "option", "aria-selected": String(m.id === valor) },
      iconoModelo(m),
      el("span", { class: "modelo-txt" }, el("strong", {}, m.nombre), el("small", {}, m.nota || m.etiqueta || m.proveedor)),
      insigniaModelo(m));
    b.onclick = () => { valor = m.id; pintarBoton(); cerrar(); onElegir(m); };
    return b;
  };
  popover(boton, (cerrar) => {
    // Agrupado por proveedor (catálogo): directos primero, Higgsfield al final.
    const NOMBRES = { seedance: "Seedance · directo con tu llave", openai: "OpenAI · directo con tu llave", higgsfield: "Higgsfield · gasta créditos" };
    const proveedores = [...new Set(modelos.map((m) => m.proveedor))]
      .sort((a, b) => (a === "higgsfield") - (b === "higgsfield"));
    const lista = el("div", { class: "lista-modelos", role: "listbox", "aria-label": "Modelos" },
      proveedores.map((pv) => [
        el("div", { class: "grupo" }, NOMBRES[pv] || pv),
        modelos.filter((m) => m.proveedor === pv).map((m) => opcion(m, cerrar)),
      ]));
    lista.addEventListener("keydown", (e) => {
      if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      const ops = [...lista.querySelectorAll(".opcion-modelo")];
      const i = ops.indexOf(document.activeElement);
      ops[(i + (e.key === "ArrowDown" ? 1 : -1) + ops.length) % ops.length].focus();
    });
    return lista;
  }, { lado: "abajo", etiqueta: "Modelos" });
  pintarBoton();
  return ancla;
}

/* ---------- Prompt: textarea, mejorar, guardar y motor ---------- */
function nombreMotor(m) {
  if (!m) return "";
  if (m === "reglas") return "Reglas locales (sin IA)";
  const [a, ...b] = m.split(":");
  const nombre = { ollama: "Ollama", openai: "OpenAI" }[a] || a;
  return b.length ? `${nombre} · ${b.join(":")}` : nombre;
}

export function crearPrompt({ tipo, valor = "", salud, modeloActual, onCambio, placeholder }) {
  const id = "prompt-" + tipo;
  const area = el("textarea", { id, rows: 2, maxlength: 4000, placeholder, spellcheck: true, "aria-label": "Prompt: describe lo que quieres generar" });
  area.value = valor;
  const ajustarAlto = () => { area.style.height = "auto"; area.style.height = Math.min(area.scrollHeight, 180) + "px"; };
  area.addEventListener("input", () => { ajustarAlto(); onCambio(area.value); });
  requestAnimationFrame(ajustarAlto);

  const prov = (salud && salud.proveedores) || {};
  const ollamaListo = !!(prov.ollama && prov.ollama.listo);
  const openaiListo = !!(prov.openai && prov.openai.listo);
  let motor = "auto", ollamaModelo = null, anterior = null;

  const usado = el("div", { class: "motor-usado", "aria-live": "polite" });
  const btnMejorar = el("button", { class: "chip", type: "button", title: "Mejorar el prompt con IA (Ollama primero, gratis)" }, icono("chispa"), "Mejorar");
  const btnGuardar = el("button", { class: "chip", type: "button", "aria-label": "Guardar prompt", title: "Guardar prompt" }, icono("guardar"));

  const selMotor = segmentado({
    etiqueta: "Motor para mejorar el prompt",
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
  const selOllama = el("div", { class: "campo", hidden: true }, el("label", { for: idSel }, "Modelo de Ollama"), select);
  select.addEventListener("change", () => { ollamaModelo = select.value || null; });
  if (ollamaListo) {
    api.ollamaModelos({ silencioso: true }).then((r) => {
      const lista = (r && r.modelos) || [];
      if (!lista.length) return;
      select.replaceChildren(el("option", { value: "" }, "El que elija la app"), ...lista.map((m) => el("option", { value: m.nombre }, m.nombre)));
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
      ajustarAlto(); onCambio(area.value);
      const deshacer = el("button", { class: "btn btn-fantasma btn-chico", type: "button" }, icono("deshacer"), "Deshacer");
      deshacer.onclick = () => {
        if (anterior == null) return;
        area.value = anterior; anterior = null; ajustarAlto(); onCambio(area.value);
        limpiar(usado, "Volviste a tu prompt.");
      };
      limpiar(usado, el("span", {}, "Mejorado con ", el("b", {}, nombreMotor(r.motor))), deshacer);
    } catch { /* toast ya mostrado */ } finally {
      btnMejorar.disabled = false;
      btnMejorar.lastChild.textContent = "Mejorar";
    }
  };
  btnGuardar.onclick = async () => {
    const texto = area.value.trim();
    if (!texto) { toast("No hay prompt para guardar.", "info"); return; }
    const nombre = texto.split(/\s+/).slice(0, 5).join(" ");
    try { await api.guardarPrompt({ nombre, prompt: texto, tipo }); toast("Prompt guardado.", "ok"); } catch { /* toast */ }
  };

  const nodoMotor = el("div", { class: "panel-seccion" }, selMotor, selOllama,
    el("p", { class: "nota" }, "«Mejorar» usa Ollama si está abierto (gratis); si no, OpenAI o reglas locales."));
  return { area, usado, btnMejorar, btnGuardar, nodoMotor, fijar: (t) => { area.value = t; ajustarAlto(); } };
}

/* ---------- Menú de presets (estilo / cámara) en la barra ---------- */
export function menuPresets({ etiqueta, iconoNombre, lista, valor, onCambio }) {
  const boton = el("button", { class: "chip", type: "button" });
  const ancla = el("div", { class: "pop-ancla" }, boton);
  const pintar = () => {
    const sel = lista.find((p) => p.id === valor);
    limpiar(boton, icono(iconoNombre), sel ? el("span", { class: "valor" }, sel.nombre) : etiqueta);
    boton.setAttribute("aria-pressed", String(!!sel));
    boton.setAttribute("aria-label", sel ? `${etiqueta}: ${sel.nombre}. Cambiar` : `Elegir ${etiqueta.toLowerCase()}`);
  };
  popover(boton, (cerrar) => {
    const chips = el("div", { class: "chips", role: "group", "aria-label": etiqueta },
      lista.map((p) => el("button", {
        class: "chip", type: "button", "aria-pressed": String(p.id === valor), title: p.texto,
        onclick: () => { valor = valor === p.id ? null : p.id; pintar(); onCambio(valor ? p : null); cerrar(); },
      }, p.origen === "higgsfield" ? el("i", { class: "punto-origen", title: "Aprendido de Higgsfield" }) : null, p.nombre)));
    return [
      el("div", { class: "pop-titulo" }, etiqueta,
        valor ? el("button", { class: "btn btn-fantasma btn-chico", type: "button", onclick: () => { valor = null; pintar(); onCambio(null); cerrar(); } }, "Quitar") : null),
      lista.length ? chips : el("p", { class: "nota" }, "Sin opciones todavía. Toca «Aprender de Higgsfield» en Ajustes."),
    ];
  }, { lado: "arriba", etiqueta });
  pintar();
  return ancla;
}

/* ---------- Menú de plantillas locales en la barra ---------- */
export function menuPlantillas({ lista, onElegir }) {
  const boton = el("button", { class: "chip", type: "button", "aria-label": "Elegir una plantilla de prompt" }, icono("libro"), "Plantillas");
  const ancla = el("div", { class: "pop-ancla" }, boton);
  if (!lista.length) ancla.hidden = true;
  popover(boton, (cerrar) => [
    el("div", { class: "pop-titulo" }, "Plantillas"),
    el("ul", { class: "lista-plantillas" }, lista.map((p) => el("li", {},
      el("button", { class: "fila-plantilla", type: "button", onclick: () => { onElegir(p); cerrar(); } },
        p.miniatura ? el("img", { class: "fila-plantilla-mini", src: p.miniatura, alt: "", loading: "lazy" }) : null,
        el("span", { class: "fila-plantilla-txt" }, el("strong", {}, p.nombre), el("small", {}, p.prompt)))))),
  ], { lado: "arriba", etiqueta: "Plantillas" });
  return ancla;
}

/* ---------- Botón Generar con costo en vivo ---------- */
export function botonGenerar({ tipo, cuerpoCosto, textoBase, onGenerar }) {
  const btn = el("button", { class: "btn btn-primario btn-generar", type: "button" });
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
    if (ocupado) limpiar(btn, "Enviando…");
    else limpiar(btn, el("span", { class: "txt-largo" }, base), el("span", { class: "txt-corto" }, "Generar"),
      costo ? el("span", { class: "costo" }, `· ${costo}`) : null);
    btn.setAttribute("aria-label", costo ? `${base} · ${costo}` : base);
    detalle.textContent = ultimo && ultimo.detalle ? ultimo.detalle : "";
  };
  const recalcular = () => {
    clearTimeout(temporizador);
    pintar();
    temporizador = setTimeout(async () => {
      const mio = ++pedido;
      try { const r = await api.costo({ tipo, ...cuerpoCosto() }); if (mio === pedido) { ultimo = r; pintar(); } }
      catch { if (mio === pedido) { ultimo = null; pintar(); } }
    }, 220);
  };
  btn.onclick = async () => {
    if (ocupado) return;
    ocupado = true; btn.disabled = true; pintar();
    try { await onGenerar(); } finally { ocupado = false; btn.disabled = false; pintar(); }
  };
  recalcular();
  return { btn, detalle, recalcular };
}

export async function enviarGeneracion(cuerpo) {
  try {
    const trabajos = await generarConfirmando(cuerpo);
    if (trabajos === null) { toast("No se generó nada. No se gastaron créditos.", "info"); return null; }
    toast(trabajos.length > 1 ? `${trabajos.length} trabajos en cola.` : "Trabajo en cola.", "ok");
    return trabajos;
  } catch { return null; }
}

/* ---------- Acciones del visor (compartidas con Explorar y Biblioteca) ---------- */
export function accionesVisor({ alCambiar, irA }) {
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
    onRecrear: irA ? (t) => irA(t.tipo === "imagen" ? "imagen" : "video", precargaDeTrabajo(t)) : null,
  };
}

/* ---------- Feed de trabajos (masonry, se refresca cada 3 s) ---------- */
export function feedTrabajos({ tipo, demo, vacio, irA }) {
  const tarjetas = new Map();
  const grilla = masonry(columnasFeed);
  const estadoVacio = el("div", { class: "vacio" }, el("strong", {}, vacio.titulo), el("span", {}, vacio.texto));
  const caja = el("div", { class: "feed-grilla" }, estadoVacio, grilla);
  let temporizador = null, vivo = true, primera = true;

  const acciones = accionesVisor({ alCambiar: () => refrescar(), irA });
  const abrir = (t) => abrirVisor(t, { ...acciones, demo });
  const nueva = (t) => tarjetaMedio(t, { onAbrir: abrir, onRecrear: acciones.onRecrear, demo });

  async function refrescar() {
    if (!vivo) return;
    try {
      const r = await api.trabajos({ tipo, limite: 40 }, { silencioso: !primera });
      if (vivo) pintar(r.trabajos || []);
    } catch { /* sin conexión: se reintenta */ }
    primera = false;
  }
  function pintar(lista) {
    estadoVacio.hidden = lista.length > 0;
    const vistos = new Set();
    const nodos = lista.map((t) => {
      vistos.add(t.id);
      let tj = tarjetas.get(t.id);
      if (tj) tj.actualizar(t); else { tj = nueva(t); tarjetas.set(t.id, tj); }
      return tj;
    });
    for (const id of [...tarjetas.keys()]) if (!vistos.has(id)) tarjetas.delete(id);
    grilla.poner(nodos);
  }
  function ciclo() {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => { if (!document.hidden) await refrescar(); if (vivo) ciclo(); }, 3000);
  }
  refrescar().then(ciclo);
  caja.agregar = (trabajos) => {
    if (trabajos && trabajos.length) {
      const actuales = [...grilla.querySelectorAll(".medio")].map((n) => n.trabajo).filter(Boolean);
      pintar([...trabajos.filter((t) => !tarjetas.has(t.id)), ...actuales]);
    }
    refrescar();
  };
  caja.parar = () => { vivo = false; clearTimeout(temporizador); grilla.soltar(); };
  return caja;
}

/* ---------- Armado de la página del generador ---------- */
export function montarGenerador({ raiz, titulo, secciones, prompt, menus, generar, feed, tituloFeed }) {
  const btnCerrar = el("button", { class: "btn-icono panel-cerrar", type: "button", "aria-label": "Cerrar ajustes" }, icono("x"));
  const panel = el("aside", { class: "panel", "aria-label": `Ajustes de ${titulo.toLowerCase()}`, id: "panel-gen" },
    el("div", { class: "panel-cabeza" }, el("h2", {}, titulo), btnCerrar),
    el("div", { class: "panel-cuerpo" }, secciones, prompt.nodoMotor));
  const fondo = el("div", { class: "hoja-fondo", hidden: true });
  const btnHoja = el("button", { class: "btn-icono btn-hoja", type: "button", "aria-label": "Abrir ajustes del modelo", "aria-controls": "panel-gen", "aria-expanded": "false" }, icono("ajustes"));

  const abrirHoja = () => { panel.classList.add("abierta"); fondo.hidden = false; btnHoja.setAttribute("aria-expanded", "true"); btnCerrar.focus(); };
  const cerrarHoja = () => { if (!panel.classList.contains("abierta")) return; panel.classList.remove("abierta"); fondo.hidden = true; btnHoja.setAttribute("aria-expanded", "false"); btnHoja.focus(); };
  btnHoja.onclick = abrirHoja;
  btnCerrar.onclick = cerrarHoja;
  fondo.onclick = cerrarHoja;
  const tecla = (e) => { if (e.key === "Escape" && panel.classList.contains("abierta")) cerrarHoja(); };
  document.addEventListener("keydown", tecla);

  const barra = el("section", { class: "barra-prompt", "aria-label": "Prompt y generar" },
    prompt.usado,
    prompt.area,
    el("div", { class: "barra-fila" },
      btnHoja,
      el("div", { class: "barra-herr" }, menus, prompt.btnMejorar, prompt.btnGuardar),
      generar.btn),
    generar.detalle);

  const contenedor = el("div", { class: "generador" },
    panel,
    el("section", { class: "feed", "aria-label": tituloFeed },
      el("div", { class: "feed-cabeza" }, el("h1", {}, tituloFeed),
        el("a", { class: "btn btn-fantasma btn-chico", href: "#/biblioteca" }, icono("libro"), "Biblioteca")),
      feed),
    fondo, barra);
  // El feed deja espacio para la barra flotante según su alto real.
  const ro = new ResizeObserver(() => contenedor.style.setProperty("--alto-barra-prompt", barra.offsetHeight + "px"));
  ro.observe(barra);
  raiz.append(contenedor);
  return () => { ro.disconnect(); document.removeEventListener("keydown", tecla); feed.parar(); };
}

/* ---------- Precarga (de plantillas, estudios o Recrear) ---------- */
export function aplicarPrecarga(st, precarga) {
  if (!precarga) return;
  if (precarga.prompt) st.prompt = precarga.prompt;
  if (precarga.modelo) st.modelo = precarga.modelo;
  if (precarga.ajustes) for (const [k, v] of Object.entries(precarga.ajustes)) if (v !== undefined && v !== null) st[k] = v;
  if (precarga.entradas) Object.assign(st, precarga.entradas);
  if ("estilo" in precarga) st.estilo = precarga.estilo;
  if ("camara" in precarga) st.camara = precarga.camara;
}
