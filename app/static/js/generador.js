// Piezas compartidas por los generadores de video e imagen.
// Distribución (como un estudio de generación): panel izquierdo con pestañas, referencia, prompt y fichas
// de ajustes; el botón Generar con su costo queda fijo abajo del panel. El centro es el feed de trabajos
// y, mientras está vacío, ejemplos para elegir. En celular el panel se apila y Generar queda fijo abajo.
import { api, generarConfirmando, importarReferencia } from "./api.js";
import {
  el, limpiar, icono, toast, usd, abrirVisor, tarjetaMedio, popover, masonry, columnasFeed,
  iconoModelo, insigniaCreditos, insigniaDirecto, precargaDeTrabajo, sliderDuracion,
} from "./ui.js";
import { leerReferencia, guardarReferencia, quitarReferencia, referenciaDe, tarjetaVista, verMedio } from "./tarjetas.js";

/* ---------- Utilidades ---------- */
const RUTAS = {
  lupa: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  aviso: '<path d="M12 9v4m0 4h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
};
function svg(nombre, clase = "icono") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", clase); s.setAttribute("aria-hidden", "true");
  s.innerHTML = RUTAS[nombre] || "";
  return s;
}
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const esVideoUrl = (u) => /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(u || ""));
const sinMov = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Mensaje corto para los errores de /api/referencias/importar (413, 415, 502, sin conexión).
export function mensajeImportar(e) {
  const c = e && e.estado;
  if (c === 413) return "Ese archivo pesa más de 50 MB.";
  if (c === 415) return "Ese enlace no es una imagen ni un video.";
  if (c === 502) return "No pude bajar ese enlace. Revisa que esté público.";
  if (c === 0) return "No hay conexión con PonchoStudio.";
  return (e && e.message) || "No pude agregar la referencia.";
}

// Pestaña elegida por generador (dura lo que la sesión del navegador).
export function leerPestana(tipo) { try { return sessionStorage.getItem(`ponchostudio.pestana.${tipo}`) || "crear"; } catch { return "crear"; } }
export function guardarPestana(tipo, id) { try { sessionStorage.setItem(`ponchostudio.pestana.${tipo}`, id); } catch { /* sin almacenamiento */ } }

/* ---------- Pestañas (Crear · Editar) ---------- */
export function pestanas({ etiqueta, lista, activa, onCambio }) {
  const caja = el("div", { class: "pestanas", role: "tablist", "aria-label": etiqueta });
  const botones = lista.map((p) => el("button", {
    class: "pestana", type: "button", role: "tab", id: `pestana-${p.id}`, "aria-controls": "panel-contenido",
    "aria-selected": "false", tabindex: "-1", title: p.titulo || null,
  }, p.texto));
  const fijar = (id, avisar) => {
    botones.forEach((b, i) => {
      const on = lista[i].id === id;
      b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1;
    });
    if (avisar) onCambio(id);
  };
  botones.forEach((b, i) => { b.onclick = () => fijar(lista[i].id, true); });
  caja.addEventListener("keydown", (e) => {
    const i = botones.indexOf(document.activeElement);
    if (i < 0) return;
    let n = null;
    if (e.key === "ArrowRight") n = (i + 1) % botones.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + botones.length) % botones.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = botones.length - 1;
    if (n === null) return;
    e.preventDefault(); botones[n].focus(); fijar(lista[n].id, true);
  });
  caja.append(...botones);
  fijar(activa, false);
  return caja;
}

/* ---------- Fichas (etiqueta chica + valor) ---------- */
// Lleva el menú a la vista si queda tapado (hoja de pie o borde de la pantalla).
function verMenu(boton, ancla) {
  boton.addEventListener("click", () => requestAnimationFrame(() => {
    const p = ancla.querySelector(".pop");
    if (p) p.scrollIntoView({ block: "nearest", behavior: sinMov() ? "auto" : "smooth" });
  }));
}

export function ficha({ etiqueta, construir, lado = "ficha" }) {
  const boton = el("button", { class: "ficha", type: "button" });
  const ancla = el("div", { class: "pop-ancla ficha-ancla" }, boton);
  let texto = "", bloqueada = null;
  const pintar = () => {
    limpiar(boton, el("span", { class: "ficha-txt" }, el("small", {}, etiqueta), el("strong", {}, texto)), icono("abajo"));
    boton.setAttribute("aria-label", bloqueada ? `${etiqueta}: ${texto}. ${bloqueada}` : `${etiqueta}: ${texto}. Cambiar`);
    boton.disabled = !!bloqueada;
    boton.title = bloqueada || "";
  };
  popover(boton, construir, { lado, etiqueta });
  verMenu(boton, ancla);
  ancla.poner = (t, motivoBloqueo = null) => { texto = t; bloqueada = motivoBloqueo; pintar(); };
  ancla.ocultar = (v) => { ancla.hidden = !!v; };
  return ancla;
}

// Ficha que se prende y se apaga con un clic (Audio).
export function fichaInterruptor({ etiqueta, onCambio }) {
  const boton = el("button", { class: "ficha ficha-interruptor", type: "button", role: "switch", "aria-checked": "false" });
  let valor = false, texto = "", bloqueada = null;
  const pintar = () => {
    limpiar(boton, el("span", { class: "ficha-txt" }, el("small", {}, etiqueta), el("strong", {}, texto || (valor ? "Con audio" : "Sin audio"))),
      el("span", { class: "interr", "aria-hidden": "true" }));
    boton.setAttribute("aria-checked", String(valor));
    boton.disabled = !!bloqueada; boton.title = bloqueada || "";
  };
  boton.onclick = () => { valor = !valor; pintar(); onCambio(valor); };
  const ancla = el("div", { class: "ficha-ancla" }, boton);
  ancla.poner = (v, textoFijo = "", motivoBloqueo = null) => { valor = !!v; texto = textoFijo; bloqueada = motivoBloqueo; pintar(); };
  return ancla;
}

// Lista de opciones dentro de un menú de ficha (rejilla para proporciones).
export function listaOpciones({ etiqueta, opciones, valor, onElegir, rejilla = false }) {
  const lista = el("div", { class: "opciones" + (rejilla ? " opciones-rejilla" : ""), role: "listbox", "aria-label": etiqueta },
    opciones.map((o) => {
      const b = el("button", { class: "opcion", type: "button", role: "option", "aria-selected": String(o.valor === valor), title: o.titulo || null },
        o.forma || null,
        el("span", { class: "opcion-txt" }, el("strong", {}, o.texto), o.sub ? el("small", {}, o.sub) : null),
        o.valor === valor ? svg("check", "icono opcion-check") : null);
      b.onclick = () => onElegir(o.valor);
      return b;
    }));
  lista.addEventListener("keydown", (e) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
    e.preventDefault();
    const ops = [...lista.querySelectorAll(".opcion")];
    const i = ops.indexOf(document.activeElement);
    const paso = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    ops[(i + paso + ops.length) % ops.length].focus();
  });
  return lista;
}

// Ficha de duración: el menú trae un slider y un botón "Listo" (en táctil no hay otra forma de cerrar).
export function fichaDuracion({ rango, valor, onCambio }) {
  let actual = valor, r = rango;
  const f = ficha({
    etiqueta: "Duración",
    construir: (cerrar) => el("div", { class: "pop-duracion" },
      sliderDuracion({ min: r.min, max: r.max, valor: actual, onCambio: (v) => { actual = v; f.poner(`${v} s`); onCambio(v); } }),
      el("button", { class: "btn btn-chico", type: "button", onclick: () => cerrar() }, "Listo")),
  });
  f.fijar = (nuevoRango, v) => { r = nuevoRango; actual = v; f.poner(`${v} s`); };
  f.fijar(rango, valor);
  return f;
}

/* ---------- Selector de modelo: buscador, destacados y el resto ---------- */
const insigniasModelo = (m) => [
  m.nuevo ? el("span", { class: "insignia insignia-violeta" }, "Nuevo") : null,
  m.gasta_creditos_higgsfield ? insigniaCreditos() : insigniaDirecto(),
];

export function selectorModelo({ modelos, valor, onElegir, etiqueta = "Modelo" }) {
  let lista = modelos;
  const boton = el("button", { class: "ficha ficha-modelo", type: "button" });
  const ancla = el("div", { class: "pop-ancla ficha-ancla" }, boton);
  const actual = () => lista.find((x) => x.id === valor) || lista[0];
  const pintar = () => {
    const m = actual();
    limpiar(boton, iconoModelo(m),
      el("span", { class: "ficha-txt" }, el("small", {}, etiqueta), el("strong", {}, m.nombre)),
      m.gasta_creditos_higgsfield ? insigniaCreditos() : insigniaDirecto(), icono("abajo"));
    boton.setAttribute("aria-label", `${etiqueta}: ${m.nombre}. Cambiar modelo`);
  };
  const opcion = (m, cerrar) => {
    const b = el("button", { class: "opcion-modelo", type: "button", role: "option", "aria-selected": String(m.id === valor) },
      iconoModelo(m),
      el("span", { class: "modelo-txt" },
        el("span", { class: "modelo-linea" }, el("strong", {}, m.nombre), insigniasModelo(m)),
        el("small", {}, m.descripcion || m.nota || m.etiqueta || m.proveedor)),
      m.id === valor ? svg("check", "icono opcion-check") : null);
    b.onclick = () => { valor = m.id; pintar(); cerrar(); onElegir(m); };
    return b;
  };
  popover(boton, (cerrar) => {
    const buscador = el("input", { class: "buscador-in", type: "search", placeholder: "Buscar modelo", "aria-label": "Buscar modelo", autocomplete: "off", spellcheck: false });
    const cuerpo = el("div", { class: "lista-modelos", role: "listbox", "aria-label": "Modelos" });
    const grupo = (t) => el("div", { class: "grupo", role: "presentation" }, t);
    const pintarLista = () => {
      const q = norm(buscador.value.trim());
      const vis = q ? lista.filter((m) => norm([m.nombre, m.descripcion, m.etiqueta, m.nota, m.proveedor].join(" ")).includes(q)) : lista;
      if (!vis.length) { limpiar(cuerpo, el("p", { class: "nota sin-resultados" }, `Ningún modelo coincide con «${buscador.value.trim()}».`)); return; }
      const dest = q ? [] : vis.filter((m) => m.destacado);
      const resto = q ? vis : vis.filter((m) => !m.destacado);
      limpiar(cuerpo,
        dest.length ? [grupo("Modelos destacados"), dest.map((m) => opcion(m, cerrar))] : null,
        resto.length ? [grupo(q ? "Resultados" : dest.length ? "Todos los modelos" : "Modelos"), resto.map((m) => opcion(m, cerrar))] : null);
    };
    buscador.addEventListener("input", pintarLista);
    const envoltura = el("div", { class: "selector-modelos" },
      el("label", { class: "buscador" }, svg("lupa"), buscador), cuerpo);
    envoltura.addEventListener("keydown", (e) => {
      if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
      const ops = [...envoltura.querySelectorAll(".opcion-modelo")];
      if (!ops.length) return;
      e.preventDefault();
      const i = ops.indexOf(document.activeElement);
      const sig = i < 0 ? (e.key === "ArrowDown" ? 0 : ops.length - 1) : (i + (e.key === "ArrowDown" ? 1 : -1) + ops.length) % ops.length;
      ops[sig].focus();
    });
    pintarLista();
    // Con mouse el buscador toma el foco al abrir; en celular no, para que no salte el teclado.
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => buscador.focus());
    return envoltura;
  }, { lado: "modelos", etiqueta: "Modelos" });
  verMenu(boton, ancla);
  ancla.poner = ({ modelos: nuevos, valor: v }) => { lista = nuevos; valor = v; pintar(); };
  pintar();
  return ancla;
}

/* ---------- Referencia que llega de Explorar: tarjeta + importación única ---------- */
// La referencia se guarda en localStorage (tarjetas.js) y se importa UNA vez a data/medios con
// POST /api/referencias/importar. El resultado se guarda aparte, ligado al enlace original,
// para no volver a bajar el archivo si el generador se monta otra vez.
const CLAVE_IMP = (t) => `ponchostudio.referencia.importada.${t === "imagen" ? "imagen" : "video"}`;
const importando = new Map(); // enlace → promesa en curso (evita dos descargas iguales)

function leerImportada(tipo, fuente) {
  // También sirve la copia que dejó el otro generador: el mismo enlace no se baja dos veces.
  for (const t of [tipo, tipo === "imagen" ? "video" : "imagen"]) {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_IMP(t)) || "null");
      if (v && v.fuente === fuente && v.resultado && v.resultado.url) return v.resultado;
    } catch { /* sigue con la otra */ }
  }
  return null;
}
function guardarImportada(tipo, fuente, resultado) { try { localStorage.setItem(CLAVE_IMP(tipo), JSON.stringify({ fuente, resultado })); } catch { /* nada */ } }
function borrarImportada(tipo) { try { localStorage.removeItem(CLAVE_IMP(tipo)); } catch { /* nada */ } }

const ORIGENES = { preset: "Ejemplo de Higgsfield", higgsfield: "Tu generación en Higgsfield", plantilla: "Plantilla" };

export function crearReferencia({ tipo, precarga, irA }) {
  let ref = (precarga && precarga.referencia) || leerReferencia(tipo);
  if (precarga && precarga.referencia) guardarReferencia(tipo, ref);
  const est = { importada: null, fase: ref ? "importando" : "ninguna", mensaje: "", modelo: null };
  const oyentes = new Set();
  const nodo = el("div", { class: "ref-bloque", hidden: !ref });

  const aviso = () => { pintar(); oyentes.forEach((f) => f()); };

  async function importar() {
    if (!ref) return;
    const mia = ref, url = mia.url;
    est.mensaje = "";
    if (typeof url === "string" && url.startsWith("/medios/")) {
      est.importada = { url, tipo: mia.tipo, cuadro: null, origen: url }; est.fase = "lista"; aviso(); return;
    }
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) { est.fase = "vista"; aviso(); return; }
    const guardada = leerImportada(tipo, url);
    if (guardada) {
      // El archivo pudo borrarse de data/medios: se comprueba antes de confiar en la copia.
      let existe = false;
      try { existe = (await fetch(guardada.url, { method: "HEAD" })).ok; } catch { existe = false; }
      if (ref !== mia) return;
      if (existe) { est.importada = guardada; est.fase = "lista"; aviso(); return; }
    }
    est.fase = "importando"; est.importada = null; aviso();
    try {
      let p = importando.get(url);
      if (!p) { p = importarReferencia(url).finally(() => importando.delete(url)); importando.set(url, p); }
      const r = await p;
      if (ref !== mia) return;
      est.importada = r; est.fase = "lista"; guardarImportada(tipo, url, r);
    } catch (e) {
      if (ref !== mia) return;
      est.fase = "error"; est.mensaje = mensajeImportar(e);
    }
    aviso();
  }

  const quitar = () => {
    ref = null; est.importada = null; est.fase = "ninguna"; est.mensaje = "";
    quitarReferencia(tipo); borrarImportada(tipo);
    aviso();
  };

  // ¿Qué enlace se manda a este modelo? Seedance recibe imagen o video; los demás, solo imágenes.
  function usable(modelo) {
    if (!ref) return { url: null, nota: null };
    if (modelo && !(modelo.entradas || []).includes("referencias")) return { url: null, nota: "Este modelo no acepta referencias." };
    if (est.fase === "importando") return { url: null, nota: null, esperando: true };
    if (est.fase === "error") return { url: null, nota: "La referencia no se pudo agregar. Reintenta o quítala." };
    if (est.fase === "vista") return { url: null, nota: "Solo es una vista de muestra: no se manda al modelo." };
    const i = est.importada;
    if (!i) return { url: null, nota: null };
    if (!modelo || modelo.proveedor === "seedance") return { url: i.url, nota: null };
    // Higgsfield solo recibe enlaces públicos: se manda el de origen. OpenAI recibe el archivo local.
    const directo = modelo.proveedor === "higgsfield" ? i.origen : i.url;
    if (i.tipo === "imagen") return { url: /^(https?:\/\/|\/medios\/)/.test(directo || "") ? directo : null, nota: null };
    if (i.cuadro && modelo.proveedor !== "higgsfield") return { url: i.cuadro, nota: "Este modelo solo usa imágenes: se manda el primer cuadro del video." };
    return { url: null, nota: "Este modelo solo acepta imágenes y no hay un cuadro del video. Elige Seedance o una imagen." };
  }

  function miniatura() {
    const i = est.importada;
    const src = (ref && ref.miniatura) || (i && i.cuadro) || (ref && ref.tipo === "imagen" ? (i ? i.url : ref.url) : null);
    if (src) return el("img", { src, alt: "", loading: "lazy" });
    if (ref && ref.tipo === "video") {
      const v = el("video", { src: ((i && i.url) || ref.url) + "#t=0.1", muted: true, playsInline: true, preload: "metadata", "aria-hidden": "true", tabIndex: -1 });
      v.muted = true; return v;
    }
    return el("span", { class: "ref-sin-mini" }, icono(ref && ref.tipo === "imagen" ? "imagen" : "video"));
  }

  function textoEstado() {
    switch (est.fase) {
      case "importando": return { t: "Agregando a Referencias…", clase: "ocupado" };
      case "lista": {
        const u = usable(est.modelo);
        return u.nota ? { t: u.nota, clase: "aviso" } : { t: "Agregada a Referencias", clase: "ok" };
      }
      case "error": return { t: est.mensaje, clase: "error" };
      case "vista": return { t: "Solo es una vista de muestra.", clase: "aviso" };
      default: return null;
    }
  }

  function pintar() {
    nodo.hidden = !ref;
    if (!ref) { limpiar(nodo); return; }
    const e = textoEstado();
    const cambiar = el("button", { class: "btn btn-chico", type: "button", "aria-label": `Cambiar la referencia ${ref.nombre}: buscar otro ejemplo en Explorar` }, "Cambiar");
    cambiar.onclick = () => irA("inicio");
    const x = el("button", { class: "btn-icono ref-quitar", type: "button", "aria-label": `Quitar la referencia ${ref.nombre}` }, icono("x"));
    x.onclick = quitar;
    const reintentar = est.fase === "error" ? el("button", { class: "btn btn-chico", type: "button", onclick: importar }, "Reintentar") : null;
    limpiar(nodo, el("div", { class: "ref-tarjeta" },
      el("div", { class: "ref-mini" }, miniatura()),
      el("div", { class: "ref-info" },
        el("strong", { title: ref.nombre }, ref.nombre),
        el("small", {}, `${ORIGENES[ref.origen] || "Referencia"} · ${ref.tipo === "imagen" ? "Imagen" : "Video"}`),
        e ? el("span", { class: `ref-estado ref-${e.clase}`, role: e.clase === "error" ? "alert" : null }, e.t) : null),
      el("div", { class: "ref-acciones" }, x, cambiar, reintentar)));
  }

  // Cuadro para la caja "Referencias": muestra que el medio ya quedó agregado.
  function mosaico(modelo) {
    if (!ref || est.fase !== "lista" || !usable(modelo).url) return null;
    const x = el("button", { class: "btn-icono dropzone-quitar", type: "button", "aria-label": `Quitar la referencia ${ref.nombre}` }, icono("x"));
    x.onclick = quitar;
    return el("div", { class: "ref-tile", title: ref.nombre }, miniatura(), el("span", { class: "ref-tile-tag" }, ref.tipo === "video" ? "Video" : "Imagen"), x);
  }

  pintar();
  importar();
  return {
    nodo, mosaico, usable,
    activa: () => !!ref,
    fase: () => est.fase,
    nombre: () => (ref ? ref.nombre : ""),
    importada: () => est.importada,
    esVideoLista: () => !!(ref && est.fase === "lista" && est.importada && est.importada.tipo === "video"),
    fijarModelo: (m) => { est.modelo = m; pintar(); },
    alCambiar: (f) => { oyentes.add(f); },
    quitar,
  };
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
  const area = el("textarea", { id, rows: 4, maxlength: 4000, placeholder, spellcheck: true, "aria-label": "Prompt: describe lo que quieres generar" });
  area.value = valor;
  const ajustarAlto = () => { area.style.height = "auto"; area.style.height = Math.min(Math.max(area.scrollHeight, 96), 240) + "px"; };
  area.addEventListener("input", () => { ajustarAlto(); onCambio(area.value); });
  requestAnimationFrame(ajustarAlto);

  const prov = (salud && salud.proveedores) || {};
  const ollamaListo = !!(prov.ollama && prov.ollama.listo);
  const openaiListo = !!(prov.openai && prov.openai.listo);
  let motor = "auto", ollamaModelo = null, anterior = null;

  const usado = el("div", { class: "motor-usado", "aria-live": "polite" });
  const btnMejorar = el("button", { class: "chip", type: "button", title: "Mejorar el prompt con IA (Ollama primero, gratis)" }, icono("chispa"), "Mejorar");
  const btnGuardar = el("button", { class: "chip", type: "button", "aria-label": "Guardar prompt", title: "Guardar prompt" }, icono("guardar"));

  const opcionesMotor = [
    { valor: "auto", texto: "Auto", titulo: "Ollama primero (gratis), luego OpenAI, luego reglas" },
    { valor: "ollama", texto: "Ollama", deshabilitado: !ollamaListo, titulo: ollamaListo ? "Modelos locales, gratis" : "Ollama no está abierto" },
    { valor: "openai", texto: "OpenAI", deshabilitado: !openaiListo, titulo: openaiListo ? "Usa tu llave de OpenAI" : "Falta la llave de OpenAI" },
  ];
  const selMotor = el("div", { class: "segmentado", role: "radiogroup", "aria-label": "Motor para mejorar el prompt" },
    opcionesMotor.map((o) => {
      const b = el("button", { type: "button", role: "radio", "aria-checked": String(o.valor === motor), disabled: o.deshabilitado, title: o.titulo }, o.texto);
      b.onclick = () => {
        motor = o.valor;
        selMotor.querySelectorAll("button").forEach((x, i) => x.setAttribute("aria-checked", String(opcionesMotor[i].valor === motor)));
        selOllama.hidden = motor === "openai" || !selOllama.dataset.hay;
      };
      return b;
    }));
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

  const nodoMotor = el("details", { class: "motor-det" },
    el("summary", {}, "Motor de «Mejorar»"),
    el("div", { class: "panel-seccion" }, selMotor, selOllama,
      el("p", { class: "nota" }, "«Mejorar» usa Ollama si está abierto (gratis); si no, OpenAI o reglas locales.")));
  return { area, usado, btnMejorar, btnGuardar, nodoMotor, fijar: (t) => { area.value = t; ajustarAlto(); } };
}

// Caja del prompt: texto, herramientas (estilo, cámara, plantillas, mejorar, guardar) y motor.
export function cajaPrompt(prompt, menus) {
  return el("div", { class: "prompt-bloque" },
    el("div", { class: "prompt-caja" },
      prompt.area,
      el("div", { class: "prompt-herr" }, menus, prompt.btnMejorar, prompt.btnGuardar)),
    prompt.usado, prompt.nodoMotor);
}

/* ---------- Menú de presets (estilo / cámara) ---------- */
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
  }, { lado: "herr", etiqueta });
  verMenu(boton, ancla);
  pintar();
  return ancla;
}

/* ---------- Menú de plantillas locales ---------- */
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
  ], { lado: "herr", etiqueta: "Plantillas" });
  verMenu(boton, ancla);
  return ancla;
}

/* ---------- Botón Generar con costo en vivo ---------- */
// aviso(): texto extra bajo el costo (p. ej. "aproximado" si hay video de referencia).
export function botonGenerar({ tipo, cuerpoCosto, textoBase, onGenerar, aviso = () => "" }) {
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
    const extra = aviso();
    if (ocupado) limpiar(btn, "Enviando…");
    else limpiar(btn, el("span", { class: "gen-txt" }, base), costo ? el("span", { class: "costo" }, `${extra ? "≈ " : ""}${costo}`) : null);
    btn.setAttribute("aria-label", costo ? `${base}. Costo ${extra ? "aproximado " : ""}${costo}` : base);
    limpiar(detalle, ultimo && ultimo.detalle ? ultimo.detalle : "", extra ? el("span", { class: "gen-aviso" }, ` ${extra}`) : null);
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
  return { btn, detalle, recalcular, parar: () => clearTimeout(temporizador) };
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

/* ---------- Ejemplos para el centro vacío ---------- */
// Presets de Higgsfield del mismo tipo; si no hay, las plantillas locales. Elegir uno carga su prompt y lo
// deja como referencia (mismo contrato que Explorar: guardarReferencia + precarga.referencia).
const aTipo = (t) => (t === "imagen" || t === "image" ? "imagen" : "video");

export function panelPresets({ tipo, ctx, modelos, plantillas }) {
  const textoTipo = tipo === "video" ? "videos" : "imágenes";
  const caja = el("section", { class: "vacio-presets", "aria-label": "Ejemplos para empezar" });
  const rejilla = masonry(columnasFeed);
  const estado = el("p", { class: "nota", role: "status" }, "Cargando ejemplos…");
  caja.append(
    el("div", { class: "vp-cabeza" },
      el("h2", {}, `Aún no hay ${textoTipo}`),
      el("p", {}, "Elige un ejemplo: se carga su prompt y queda como referencia. O escribe el tuyo en el panel.")),
    estado, rejilla);

  const directo = (sugerido) => {
    const m = modelos.find((x) => x.id === sugerido);
    return m && !m.gasta_creditos_higgsfield ? m.id : (modelos.find((x) => !x.gasta_creditos_higgsfield) || modelos[0] || {}).id;
  };
  async function usarPreset(p, boton) {
    const ref = referenciaDe({ id: p.id, nombre: p.nombre, tipo: aTipo(p.preview_tipo || p.tipo), url: p.preview, miniatura: p.miniatura, origen: "preset", categoria: p.categoria });
    if (boton) boton.disabled = true;
    let datos;
    try {
      const r = await api.higgsfieldRecrear(p.id);
      datos = { prompt: r.prompt || p.prompt || p.descripcion || p.nombre, modelo: directo(r.modelo_sugerido), ajustes: r.ajustes || {} };
      if (r.exclusivo) toast("Ese ejemplo usa un modelo exclusivo de Higgsfield. Lo preparé con un modelo directo.", "info");
    } catch {
      datos = { prompt: p.prompt || p.descripcion || p.nombre, modelo: directo(null), ajustes: {} };
    }
    guardarReferencia(tipo, ref);
    ctx.irA(tipo, { ...datos, referencia: ref, pestana: "crear" });
  }
  const tarjetaPreset = (p) => {
    const t = aTipo(p.preview_tipo || p.tipo);
    return tarjetaVista({
      url: p.preview, tipo: t, miniatura: p.miniatura, titulo: p.nombre, semilla: p.id, nombreRecrear: "Usar",
      etiquetaAbrir: `Ver ejemplo ${p.nombre}`, tituloSiempre: true,
      onAbrir: () => verMedio({ url: p.preview, tipo: t, titulo: p.nombre, texto: p.prompt || p.descripcion, onRecrear: (b) => usarPreset(p, b) }),
      onRecrear: (b) => usarPreset(p, b),
    });
  };
  const tarjetaPlantilla = (p) => tarjetaVista({
    url: p.miniatura || null, tipo: "imagen", titulo: p.nombre, semilla: p.id, sub: "Plantilla", nombreRecrear: "Usar",
    etiquetaAbrir: `Usar la plantilla ${p.nombre}`, tituloSiempre: true,
    onAbrir: () => ctx.irA(tipo, { prompt: p.prompt, modelo: directo(null), pestana: "crear" }),
    onRecrear: () => ctx.irA(tipo, { prompt: p.prompt, modelo: directo(null), pestana: "crear" }),
  });

  const pintarLista = (nodos, aviso) => {
    estado.hidden = !aviso;
    if (aviso) limpiar(estado, aviso);
    rejilla.poner(nodos);
  };
  const locales = (plantillas || []).filter((p) => aTipo(p.categoria) === tipo);
  api.higgsfieldPresets({ silencioso: true }).catch(() => null).then((r) => {
    const items = ((r && r.items) || []).filter((p) => aTipo(p.tipo) === tipo && (p.preview || p.miniatura)).slice(0, 24);
    if (items.length) { pintarLista(items.map(tarjetaPreset)); return; }
    if (locales.length) { pintarLista(locales.slice(0, 24).map(tarjetaPlantilla)); return; }
    pintarLista([], "Todavía no hay ejemplos. Escribe tu prompt en el panel o mira Explorar.");
    caja.append(el("a", { class: "btn btn-chico", href: "#/" }, "Abrir Explorar"));
  });
  caja.parar = () => rejilla.soltar();
  return caja;
}

/* ---------- Feed de trabajos (masonry, se refresca cada 3 s) ---------- */
// vacio: { titulo, texto } o un nodo ya armado (p. ej. panelPresets); se muestra solo si no hay trabajos.
export function feedTrabajos({ tipo, demo, vacio, irA }) {
  const tarjetas = new Map();
  const grilla = masonry(columnasFeed);
  const estadoVacio = vacio instanceof Node ? vacio
    : el("div", { class: "vacio" }, el("strong", {}, vacio.titulo), el("span", {}, vacio.texto));
  estadoVacio.hidden = true; // hasta saber si hay trabajos, para que no parpadee
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
    } catch { if (vivo && primera) estadoVacio.hidden = false; }
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
  caja.parar = () => { vivo = false; clearTimeout(temporizador); grilla.soltar(); if (estadoVacio.parar) estadoVacio.parar(); };
  return caja;
}

/* ---------- Armado de la página del generador ---------- */
// contenido: nodos del panel en orden (tarjeta de referencia, entradas, prompt, fichas…).
// pestanasNodo: salida de pestanas(). generar: salida de botonGenerar().
export function montarGenerador({ raiz, titulo, pestanasNodo, contenido, generar, feed, tituloFeed, limpiezas = [] }) {
  const panel = el("aside", { class: "panel", "aria-label": `Ajustes de ${titulo.toLowerCase()}`, id: "panel-gen" },
    el("div", { class: "panel-cuerpo" },
      pestanasNodo,
      el("div", { class: "panel-contenido", id: "panel-contenido", role: "tabpanel" }, contenido)),
    el("div", { class: "panel-pie" }, generar.detalle, generar.btn));

  const contenedor = el("div", { class: "generador" },
    panel,
    el("section", { class: "feed", "aria-label": tituloFeed },
      el("div", { class: "feed-cabeza" }, el("h1", {}, tituloFeed),
        el("a", { class: "btn btn-fantasma btn-chico", href: "#/biblioteca" }, icono("libro"), "Biblioteca")),
      feed));
  // El feed deja espacio para el botón Generar fijo según su alto real (en celular va sobre la barra inferior).
  const pie = panel.querySelector(".panel-pie");
  const ro = new ResizeObserver(() => contenedor.style.setProperty("--alto-pie", pie.offsetHeight + "px"));
  ro.observe(pie);
  raiz.append(contenedor);
  return () => { ro.disconnect(); generar.parar(); feed.parar(); limpiezas.forEach((f) => f()); };
}

/* ---------- Precarga (de plantillas, estudios, Explorar o Recrear) ---------- */
export function aplicarPrecarga(st, precarga) {
  if (!precarga) return;
  if (precarga.prompt) st.prompt = precarga.prompt;
  if (precarga.modelo) st.modelo = precarga.modelo;
  if (precarga.ajustes) for (const [k, v] of Object.entries(precarga.ajustes)) if (v !== undefined && v !== null) st[k] = v;
  if (precarga.entradas) Object.assign(st, precarga.entradas);
  if ("estilo" in precarga) st.estilo = precarga.estilo;
  if ("camara" in precarga) st.camara = precarga.camara;
}

export { esVideoUrl };
