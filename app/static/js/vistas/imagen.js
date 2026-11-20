// Generador de imagen: OpenAI gpt-image-2 por defecto.
// Pestañas: "Crear imagen" (texto + referencias opcionales) y "Editar imagen" (una imagen tuya + instrucción).
import { api } from "../api.js";
import { el, limpiar, toast, dropzone, formaIcono, icono, insigniaCreditos } from "../ui.js";
import {
  selectorModelo, ficha, listaOpciones, pestanas, crearReferencia, crearPrompt, cajaPrompt,
  menuPresets, menuPlantillas, botonGenerar, enviarGeneracion, feedTrabajos, panelPresets, aplicarPrecarga, montarGenerador,
  leerPestana, guardarPestana,
} from "../generador.js";

const MODELO_DEFECTO = "gpt-image-2";
const CALIDADES = { low: "Baja", medium: "Media", high: "Alta" };
const MAX_REFS = 4;
// Editar con una imagen subida solo funciona donde el backend la entrega: Higgsfield solo recibe enlaces públicos.
const sirveParaEditar = (m) => !m.gasta_creditos_higgsfield && (m.entradas || []).includes("referencias");

export async function montar(raiz, ctx) {
  const [catalogo, presets] = await Promise.all([api.catalogo(), api.presets().catch(() => ({ estilos: [] }))]);
  const modelos = catalogo.imagen || [];
  const demo = !!(ctx.salud && ctx.salud.demo);
  if (!modelos.length) {
    raiz.append(el("div", { class: "pagina" }, el("div", { class: "vacio" },
      el("strong", {}, "No hay modelos de imagen"), el("span", {}, "El catálogo llegó vacío. Revisa la app en Ajustes."),
      el("a", { class: "btn", href: "#/ajustes" }, "Abrir Ajustes"))));
    return;
  }
  const puedeEditar = modelos.some(sirveParaEditar);

  const st = {
    modelo: (modelos.find((m) => m.id === MODELO_DEFECTO) || modelos[0]).id,
    prompt: "", calidad: "medium", resolucion: null, formato: "1:1", variantes: 1, semilla: null, referencias: [], estilo: null,
    pestana: ctx.precarga ? (ctx.precarga.pestana || "crear") : leerPestana("imagen"),
    imagenEditar: null,
  };
  if (!puedeEditar) st.pestana = "crear";
  aplicarPrecarga(st, ctx.precarga);
  const editando = () => st.pestana === "editar";
  const disponibles = () => (editando() ? modelos.filter(sirveParaEditar) : modelos);
  const modelo = () => modelos.find((m) => m.id === st.modelo) || modelos[0];

  const ref = crearReferencia({ tipo: "imagen", precarga: ctx.precarga, irA: ctx.irA });

  function ajustarAlModelo() {
    if (!disponibles().some((m) => m.id === st.modelo)) st.modelo = disponibles()[0].id;
    const m = modelo();
    const cal = m.calidades || [];
    if (cal.length && !cal.includes(st.calidad)) st.calidad = cal.includes("medium") ? "medium" : cal[0];
    const res = m.resoluciones || [];
    if (res.length && !res.includes(st.resolucion)) st.resolucion = res.includes("2k") ? "2k" : res[0];
    const fmts = m.formatos || ["1:1"];
    if (!fmts.includes(st.formato)) st.formato = fmts[0];
    st.variantes = Math.min(st.variantes, m.variantes_max || 4);
    if (m.entradas && !m.entradas.includes("referencias")) st.referencias = [];
  }
  ajustarAlModelo();

  // Referencias que viajan: imagen a editar primero (gpt-image toma la primera como base), luego la tarjeta y las manuales.
  const refTarjeta = () => ref.usable(modelo()).url;
  function refsFinales() {
    const lista = [];
    if (editando() && st.imagenEditar) lista.push(st.imagenEditar);
    const t = refTarjeta();
    if (t && !lista.includes(t)) lista.push(t);
    return [...lista, ...st.referencias].slice(0, MAX_REFS);
  }

  const bloqueEntradas = el("div", { class: "panel-bloque" });
  const notaModelo = el("div", { class: "panel-notas" });

  function pintarEntradas() {
    const m = modelo();
    const aceptaRefs = !m.entradas || m.entradas.includes("referencias");
    const subir = (a) => api.subir(a);
    const tile = aceptaRefs ? ref.mosaico(m) : null;
    const capacidad = Math.max(0, MAX_REFS - (tile ? 1 : 0) - (editando() ? 1 : 0));
    if (st.referencias.length > capacidad) st.referencias = st.referencias.slice(0, capacidad);
    const nota = ref.activa() ? ref.usable(m).nota : null;
    const total = st.referencias.length + (tile ? 1 : 0) + (editando() && st.imagenEditar ? 1 : 0);
    limpiar(bloqueEntradas,
      editando() ? el("div", { class: "panel-seccion" },
        el("span", { class: "etiqueta" }, "Imagen a editar", el("span", { class: "valor" }, "Obligatorio")),
        el("div", { class: "editar-imagen" }, dropzone({
          texto: "Sube la imagen a editar", valor: st.imagenEditar, subir,
          onCambio: (u) => { st.imagenEditar = u; pintarEntradas(); generar.recalcular(); },
        })),
        el("p", { class: "nota" }, "GPT Image 2 cambia tu imagen según tu instrucción. El resultado es una imagen nueva; la original no se toca.")) : null,
      aceptaRefs ? el("div", { class: "panel-seccion" },
        el("span", { class: "etiqueta" }, editando() ? "Imágenes de guía" : "Referencias",
          el("span", { class: "valor" }, `${total}/${MAX_REFS}`)),
        el("div", { class: "refs" },
          tile,
          Array.from({ length: capacidad }, (_, i) => dropzone({
            texto: `Ref. ${i + 1 + (tile ? 1 : 0)}`, chico: true, valor: st.referencias[i] || null, subir,
            onCambio: (u) => { const r = [...st.referencias]; if (u) r[i] = u; else r.splice(i, 1); st.referencias = r.filter(Boolean); pintarEntradas(); generar.recalcular(); },
          }))),
        nota && !tile ? el("p", { class: "nota nota-aviso" }, nota) : null,
        !editando() ? el("p", { class: "nota" }, "Con referencias, la imagen se edita a partir de tus fotos.") : null,
        m.proveedor === "higgsfield" && st.referencias.length ? el("p", { class: "nota" }, "Higgsfield solo recibe enlaces públicos: tus fotos subidas no viajan allá.") : null) : null);
  }

  /* ---------- Fichas ---------- */
  const fichaModelo = selectorModelo({
    modelos: disponibles(), valor: st.modelo,
    onElegir: (m) => { st.modelo = m.id; cambioDeModelo(); },
  });
  // Calidad (gpt-image) o resolución (modelos de Higgsfield): una sola ficha según lo que tenga el modelo.
  const fCalidad = ficha({
    etiqueta: "Calidad",
    construir: (cerrar) => listaOpciones({
      etiqueta: "Calidad", valor: st.calidad,
      opciones: (modelo().calidades || []).map((c) => ({ valor: c, texto: CALIDADES[c] || c })),
      onElegir: (v) => { st.calidad = v; pintarFichas(); generar.recalcular(); cerrar(); },
    }),
  });
  const fResolucion = ficha({
    etiqueta: "Resolución",
    construir: (cerrar) => listaOpciones({
      etiqueta: "Resolución", valor: st.resolucion,
      opciones: (modelo().resoluciones || []).map((r) => ({ valor: r, texto: r.toUpperCase() })),
      onElegir: (v) => { st.resolucion = v; pintarFichas(); generar.recalcular(); cerrar(); },
    }),
  });
  const fFormato = ficha({
    etiqueta: "Relación de aspecto",
    construir: (cerrar) => listaOpciones({
      etiqueta: "Relación de aspecto", rejilla: true, valor: st.formato,
      opciones: (modelo().formatos || ["1:1"]).map((f) => ({ valor: f, texto: f === "auto" ? "Auto" : f, forma: formaIcono(f) })),
      onElegir: (v) => { st.formato = v; pintarFichas(); generar.recalcular(); cerrar(); },
    }),
  });
  const fVariantes = ficha({
    etiqueta: "Variantes",
    construir: (cerrar) => listaOpciones({
      etiqueta: "Variantes", valor: st.variantes,
      opciones: Array.from({ length: modelo().variantes_max || 4 }, (_, i) => i + 1).map((n) => ({ valor: n, texto: String(n), sub: n === 1 ? "Una imagen" : `${n} imágenes a la vez` })),
      onElegir: (v) => { st.variantes = v; pintarFichas(); generar.recalcular(); cerrar(); },
    }),
  });

  function pintarFichas() {
    const m = modelo();
    const tieneCalidad = (m.calidades || []).length > 0;
    const tieneRes = (m.resoluciones || []).length > 0;
    fCalidad.ocultar(!tieneCalidad); fResolucion.ocultar(!tieneRes);
    if (tieneCalidad) fCalidad.poner(CALIDADES[st.calidad] || st.calidad);
    if (tieneRes) fResolucion.poner(String(st.resolucion || "").toUpperCase());
    fFormato.poner(st.formato === "auto" ? "Auto" : st.formato);
    fVariantes.poner(String(st.variantes));
  }
  function pintarNota() {
    const m = modelo();
    limpiar(notaModelo,
      m.gasta_creditos_higgsfield ? el("p", { class: "nota nota-aviso" }, insigniaCreditos(), "Va por Higgsfield y gasta créditos. Te pido confirmación antes.") : null,
      m.nota ? el("p", { class: "nota" }, m.nota) : null);
  }
  function cambioDeModelo() {
    ajustarAlModelo();
    fichaModelo.poner({ modelos: disponibles(), valor: st.modelo });
    ref.fijarModelo(modelo());
    pintarEntradas(); pintarFichas(); pintarNota(); generar.recalcular();
  }

  /* ---------- Prompt ---------- */
  const PLACEHOLDER = {
    crear: "Describe la imagen: sujeto, lugar, luz, encuadre y estilo",
    editar: "Cuenta qué debe cambiar: el fondo, la ropa, la luz, un objeto…",
  };
  const prompt = crearPrompt({
    tipo: "imagen", valor: st.prompt, salud: ctx.salud, modeloActual: () => st.modelo,
    placeholder: PLACEHOLDER[st.pestana],
    onCambio: (v) => { st.prompt = v; },
  });
  const menus = [
    menuPresets({ etiqueta: "Estilo", iconoNombre: "pincel", lista: presets.estilos || [], valor: st.estilo, onCambio: (p) => { st.estilo = p ? p.id : null; } }),
    menuPlantillas({
      lista: (presets.plantillas || []).filter((p) => (p.categoria === "imagen" ? "imagen" : "video") === "imagen"),
      onElegir: (p) => { st.prompt = p.prompt; prompt.fijar(p.prompt); prompt.area.focus(); },
    }),
  ];

  const vacio = panelPresets({ tipo: "imagen", ctx, modelos, plantillas: presets.plantillas });
  const feed = feedTrabajos({ tipo: "imagen", demo, irA: ctx.irA, vacio });
  const generar = botonGenerar({
    tipo: "imagen",
    cuerpoCosto: () => ({ modelo: st.modelo, calidad: st.calidad, formato: st.formato, variantes: st.variantes }),
    textoBase: () => editando() ? (st.variantes > 1 ? `Editar y crear ${st.variantes} imágenes` : "Editar imagen") : (st.variantes > 1 ? `Generar ${st.variantes} imágenes` : "Generar imagen"),
    onGenerar: async () => {
      if (ref.fase() === "importando") { toast("Espera un momento: la referencia se está agregando.", "info"); return; }
      if (editando() && !st.imagenEditar) { toast("Sube la imagen que quieres editar.", "info"); return; }
      if (!st.prompt.trim()) { toast(editando() ? "Escribe qué quieres cambiar en la imagen." : "Escribe qué quieres ver en la imagen.", "info"); prompt.area.focus(); return; }
      const m = modelo();
      const ajustes = { calidad: st.calidad, formato: st.formato, variantes: st.variantes, semilla: st.semilla };
      if ((m.resoluciones || []).length) ajustes.resolucion = st.resolucion;
      const trabajos = await enviarGeneracion({
        tipo: "imagen", modelo: st.modelo, prompt: st.prompt.trim(), ajustes,
        entradas: { primer_cuadro: null, ultimo_cuadro: null, referencias: refsFinales() },
        estilo: st.estilo, camara: null,
      });
      if (trabajos) feed.agregar(trabajos);
    },
  });
  ref.alCambiar(() => { pintarEntradas(); generar.recalcular(); });
  ref.fijarModelo(modelo());

  const lista = [{ id: "crear", texto: "Crear imagen" }];
  if (puedeEditar) lista.push({ id: "editar", texto: "Editar imagen", titulo: "Cambia una imagen tuya con una instrucción" });
  const nodoPestanas = pestanas({
    etiqueta: "Modo del generador de imagen", lista, activa: st.pestana,
    onCambio: (id) => {
      st.pestana = id; guardarPestana("imagen", id);
      prompt.area.placeholder = PLACEHOLDER[id];
      cambioDeModelo();
    },
  });

  pintarEntradas(); pintarFichas(); pintarNota();
  fichaModelo.poner({ modelos: disponibles(), valor: st.modelo });

  const contenido = [
    ref.nodo, bloqueEntradas, cajaPrompt(prompt, menus),
    el("div", { class: "panel-bloque" },
      fichaModelo,
      el("div", { class: "fichas" }, fCalidad, fResolucion, fFormato, fVariantes),
      notaModelo),
  ];
  return montarGenerador({
    raiz, titulo: "Imagen", tituloFeed: "Tus imágenes", feed, generar, pestanasNodo: nodoPestanas, contenido,
    limpiezas: [() => vacio.parar && vacio.parar()],
  });
}
