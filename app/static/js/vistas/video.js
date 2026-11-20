// Generador de video: Seedance 2.5 directo por defecto.
// Pestañas: "Crear video" (texto, cuadros y referencias) y "Editar video" (Seedance toma un video como referencia).
import { api, importarReferencia } from "../api.js";
import { el, limpiar, toast, dropzone, formaIcono, icono, insigniaCreditos } from "../ui.js";
import {
  selectorModelo, ficha, fichaInterruptor, fichaDuracion, listaOpciones, pestanas, crearReferencia, crearPrompt, cajaPrompt,
  menuPresets, menuPlantillas, botonGenerar, enviarGeneracion, feedTrabajos, panelPresets, aplicarPrecarga, montarGenerador,
  leerPestana, guardarPestana, mensajeImportar, esVideoUrl,
} from "../generador.js";

const MODELO_DEFECTO = "seedance-2.5";
const MAX_REFS = 4;
// Editar video solo existe donde el backend manda un video de referencia de verdad: Seedance directo.
const sirveParaEditar = (m) => m.proveedor === "seedance" && (m.entradas || []).includes("referencias");

export async function montar(raiz, ctx) {
  const [catalogo, presets] = await Promise.all([api.catalogo(), api.presets().catch(() => ({ estilos: [], camaras: [] }))]);
  const modelos = catalogo.video || [];
  const demo = !!(ctx.salud && ctx.salud.demo);
  if (!modelos.length) {
    raiz.append(el("div", { class: "pagina" }, el("div", { class: "vacio" },
      el("strong", {}, "No hay modelos de video"), el("span", {}, "El catálogo llegó vacío. Revisa la app en Ajustes."),
      el("a", { class: "btn", href: "#/ajustes" }, "Abrir Ajustes"))));
    return;
  }
  const puedeEditar = modelos.some(sirveParaEditar);

  const st = {
    modelo: (modelos.find((m) => m.id === MODELO_DEFECTO) || modelos[0]).id,
    prompt: "", resolucion: "720p", formato: "16:9", duracion: 5, audio: true, variantes: 1, semilla: null,
    primer_cuadro: null, ultimo_cuadro: null, referencias: [], estilo: null, camara: null,
    pestana: ctx.precarga ? (ctx.precarga.pestana || "crear") : leerPestana("video"),
    videoEditar: null, // { url, nombre, cuadro } importado a mano en "Editar video"
  };
  if (!puedeEditar) st.pestana = "crear";
  aplicarPrecarga(st, ctx.precarga);
  const editando = () => st.pestana === "editar";
  const disponibles = () => (editando() ? modelos.filter(sirveParaEditar) : modelos);
  const modelo = () => modelos.find((m) => m.id === st.modelo) || modelos[0];

  const ref = crearReferencia({ tipo: "video", precarga: ctx.precarga, irA: ctx.irA });

  // Ajusta los valores al rango del modelo elegido.
  function ajustarAlModelo() {
    if (!disponibles().some((m) => m.id === st.modelo)) st.modelo = disponibles()[0].id;
    const m = modelo();
    const res = m.resoluciones || ["720p"];
    if (!res.includes(st.resolucion)) st.resolucion = res.includes("720p") ? "720p" : res[0];
    const fmts = m.formatos || ["16:9"];
    if (!fmts.includes(st.formato)) st.formato = fmts.includes("16:9") ? "16:9" : fmts[0];
    const d = m.duracion || { min: 4, max: 30 };
    st.duracion = Math.min(d.max, Math.max(d.min, st.duracion));
    if (!m.audio) st.audio = false;
    const ent = m.entradas || ["texto"];
    if (!ent.includes("primer_cuadro")) st.primer_cuadro = null;
    if (!ent.includes("ultimo_cuadro")) st.ultimo_cuadro = null;
    if (!ent.includes("referencias")) st.referencias = [];
  }
  ajustarAlModelo();

  /* ---------- Referencias finales que viajan al backend ---------- */
  const refTarjeta = () => ref.usable(modelo()).url;
  // Video que se edita: el importado a mano o, si la referencia de Explorar es un video, ese.
  const videoAEditar = () => st.videoEditar ? st.videoEditar.url : (ref.esVideoLista() ? ref.importada().url : null);
  function refsFinales() {
    const lista = [];
    if (editando()) {
      const v = videoAEditar();
      if (v) lista.push(v);
      const t = refTarjeta();
      if (t && !lista.includes(t) && !esVideoUrl(t)) lista.push(t); // una imagen de la tarjeta suma como guía
      return lista.slice(0, MAX_REFS);
    }
    const t = refTarjeta();
    if (t) lista.push(t);
    return [...lista, ...st.referencias].slice(0, MAX_REFS);
  }
  const hayVideoDeEntrada = () => refsFinales().some(esVideoUrl);

  /* ---------- Entradas del panel ---------- */
  const bloqueEntradas = el("div", { class: "panel-bloque" });
  const notaModelo = el("div", { class: "panel-notas" });

  function tarjetaVideoEditar() {
    const v = videoAEditar();
    const nombre = st.videoEditar ? st.videoEditar.nombre : ref.nombre();
    const cuadro = st.videoEditar ? st.videoEditar.cuadro : (ref.importada() && ref.importada().cuadro);
    const quitar = el("button", { class: "btn-icono", type: "button", "aria-label": `Quitar el video a editar ${nombre}` }, icono("x"));
    quitar.onclick = () => { if (st.videoEditar) st.videoEditar = null; else ref.quitar(); pintarEntradas(); generar.recalcular(); };
    return el("div", { class: "ref-tarjeta" },
      el("div", { class: "ref-mini" }, cuadro ? el("img", { src: cuadro, alt: "", loading: "lazy" })
        : el("video", { src: v + "#t=0.1", muted: true, playsInline: true, preload: "metadata", "aria-hidden": "true", tabIndex: -1 })),
      el("div", { class: "ref-info" }, el("strong", { title: nombre }, nombre),
        el("small", {}, st.videoEditar ? "Video agregado por enlace" : "Tu referencia de Explorar"),
        el("span", { class: "ref-estado ref-ok" }, "Este es el video que se va a editar")),
      el("div", { class: "ref-acciones" }, quitar));
  }

  function campoEnlace() {
    const id = "enlace-video-editar";
    const entrada = el("input", { class: "entrada", id, type: "url", inputmode: "url", placeholder: "https://… enlace público del video", autocomplete: "off", spellcheck: false });
    const msg = el("p", { class: "ref-estado ref-error", role: "alert", hidden: true });
    const btn = el("button", { class: "btn", type: "button" }, "Agregar video");
    const agregar = async () => {
      const url = entrada.value.trim();
      msg.hidden = true;
      if (!/^https?:\/\//i.test(url)) { msg.textContent = "Pega un enlace que empiece por https://"; msg.hidden = false; entrada.focus(); return; }
      btn.disabled = true; btn.textContent = "Agregando…";
      try {
        const r = await importarReferencia(url);
        if (r.tipo !== "video") { msg.textContent = "Ese enlace es una " + (r.tipo === "imagen" ? "imagen" : "pista de audio") + ", no un video."; msg.hidden = false; return; }
        st.videoEditar = { url: r.url, nombre: decodeURIComponent((url.split("?")[0].split("/").pop() || "Video").slice(0, 60)), cuadro: r.cuadro };
        pintarEntradas(); generar.recalcular();
      } catch (e) { msg.textContent = mensajeImportar(e); msg.hidden = false; }
      finally { btn.disabled = false; btn.textContent = "Agregar video"; }
    };
    btn.onclick = agregar;
    entrada.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } });
    return el("div", { class: "campo" }, el("label", { for: id }, "Enlace del video a editar"),
      el("div", { class: "campo-enlace" }, entrada, btn), msg);
  }

  function pintarEntradas() {
    const m = modelo();
    const ent = m.entradas || ["texto"];
    const subir = (a) => api.subir(a);
    const conFoto = !!st.primer_cuadro || !!st.ultimo_cuadro;

    if (editando()) {
      limpiar(bloqueEntradas, el("div", { class: "panel-seccion" },
        el("span", { class: "etiqueta" }, "Video a editar", el("span", { class: "valor" }, "Obligatorio")),
        videoAEditar() ? tarjetaVideoEditar()
          : (ref.fase() === "importando" ? el("p", { class: "nota" }, "Agregando tu referencia…") : campoEnlace()),
        el("p", { class: "nota nota-aviso" }, icono("aviso"),
          "Seedance toma tu video como referencia y crea uno nuevo siguiendo tu instrucción. No es un editor cuadro por cuadro, y esta función todavía no se confirmó con una generación real.")));
      return;
    }

    const hayCuadros = ent.includes("primer_cuadro") || ent.includes("ultimo_cuadro");
    const aceptaRefs = ent.includes("referencias");
    const tile = aceptaRefs ? ref.mosaico(m) : null;
    const capacidad = MAX_REFS - (tile ? 1 : 0);
    if (st.referencias.length > capacidad) st.referencias = st.referencias.slice(0, capacidad);
    const nota = ref.activa() ? ref.usable(m).nota : null;
    limpiar(bloqueEntradas,
      aceptaRefs ? el("div", { class: "panel-seccion" },
        el("span", { class: "etiqueta" }, "Referencias", el("span", { class: "valor" }, `${st.referencias.length + (tile ? 1 : 0)}/${MAX_REFS}`)),
        el("div", { class: "refs" },
          tile,
          Array.from({ length: capacidad }, (_, i) => dropzone({
            texto: `Ref. ${i + 1 + (tile ? 1 : 0)}`, chico: true, valor: st.referencias[i] || null, subir,
            onCambio: (u) => { const r = [...st.referencias]; if (u) r[i] = u; else r.splice(i, 1); st.referencias = r.filter(Boolean); pintarEntradas(); generar.recalcular(); },
          }))),
        nota && !tile ? el("p", { class: "nota nota-aviso" }, nota) : null,
        m.proveedor === "higgsfield" && st.referencias.length ? el("p", { class: "nota" }, "Higgsfield solo recibe enlaces públicos: tus fotos subidas no viajan allá.") : null) : null,
      hayCuadros ? el("div", { class: "panel-seccion" },
        el("span", { class: "etiqueta" }, "Cuadros", el("span", { class: "nota" }, "Opcional")),
        el("div", { class: "cuadros" },
          ent.includes("primer_cuadro") ? dropzone({ texto: "Primer cuadro", valor: st.primer_cuadro, subir, onCambio: (u) => { st.primer_cuadro = u; pintarEntradas(); pintarFichas(); generar.recalcular(); } }) : null,
          ent.includes("ultimo_cuadro") ? dropzone({ texto: "Último cuadro", valor: st.ultimo_cuadro, subir, onCambio: (u) => { st.ultimo_cuadro = u; pintarEntradas(); pintarFichas(); generar.recalcular(); } }) : null),
        m.proveedor === "seedance" && conFoto ? el("p", { class: "nota" }, "Con foto de entrada, Seedance toma el formato de la foto.") : null) : null);
  }

  /* ---------- Fichas de ajustes ---------- */
  const fichaModelo = selectorModelo({
    modelos: disponibles(), valor: st.modelo,
    onElegir: (m) => { st.modelo = m.id; cambioDeModelo(); },
  });
  const fDuracion = fichaDuracion({
    rango: modelo().duracion || { min: 4, max: 30 }, valor: st.duracion,
    onCambio: (v) => { st.duracion = v; generar.recalcular(); },
  });
  const fFormato = ficha({
    etiqueta: "Relación de aspecto",
    construir: (cerrar) => listaOpciones({
      etiqueta: "Relación de aspecto", rejilla: true, valor: st.formato,
      opciones: (modelo().formatos || ["16:9"]).map((f) => ({ valor: f, texto: f === "auto" ? "Auto" : f, forma: formaIcono(f) })),
      onElegir: (v) => { st.formato = v; pintarFichas(); generar.recalcular(); cerrar(); },
    }),
  });
  const fResolucion = ficha({
    etiqueta: "Resolución",
    construir: (cerrar) => listaOpciones({
      etiqueta: "Resolución", valor: st.resolucion,
      opciones: (modelo().resoluciones || ["720p"]).map((r) => ({ valor: r, texto: r })),
      onElegir: (v) => { st.resolucion = v; pintarFichas(); generar.recalcular(); cerrar(); },
    }),
  });
  const fAudio = fichaInterruptor({ etiqueta: "Audio", onCambio: (v) => { st.audio = v; generar.recalcular(); } });
  const fVariantes = ficha({
    etiqueta: "Variantes",
    construir: (cerrar) => listaOpciones({
      etiqueta: "Variantes", valor: st.variantes,
      opciones: [1, 2, 3, 4].map((n) => ({ valor: n, texto: String(n), sub: n === 1 ? "Un video" : `${n} videos a la vez` })),
      onElegir: (v) => { st.variantes = v; pintarFichas(); generar.recalcular(); cerrar(); },
    }),
  });

  function pintarFichas() {
    const m = modelo();
    const conFoto = !!st.primer_cuadro || !!st.ultimo_cuadro;
    fDuracion.fijar(m.duracion || { min: 4, max: 30 }, st.duracion);
    const bloqueaFormato = m.proveedor === "seedance" && conFoto && !editando();
    fFormato.poner(bloqueaFormato ? "Como la foto" : (st.formato === "auto" ? "Auto" : st.formato), bloqueaFormato ? "Con foto de entrada, Seedance toma el formato de la foto." : null);
    fResolucion.poner(st.resolucion);
    fAudio.poner(st.audio, m.audio ? "" : "Sin audio", m.audio ? null : "Este modelo genera video sin audio.");
    fVariantes.poner(String(st.variantes));
  }

  function pintarNota() {
    const m = modelo();
    limpiar(notaModelo,
      m.gasta_creditos_higgsfield ? el("p", { class: "nota nota-aviso" }, insigniaCreditos(), "Va por Higgsfield y gasta créditos. Te pido confirmación antes.") : null,
      m.nota && !editando() ? el("p", { class: "nota" }, m.nota) : null);
  }

  function cambioDeModelo() {
    ajustarAlModelo();
    fichaModelo.poner({ modelos: disponibles(), valor: st.modelo });
    ref.fijarModelo(modelo());
    pintarEntradas(); pintarFichas(); pintarNota(); generar.recalcular();
  }

  /* ---------- Prompt ---------- */
  const PLACEHOLDER = {
    crear: "Describe la escena: quién, dónde, qué pasa y cómo se mueve la cámara",
    editar: "Cuenta qué debe cambiar en el video: el fondo, la ropa, la luz, el ritmo…",
  };
  const prompt = crearPrompt({
    tipo: "video", valor: st.prompt, salud: ctx.salud, modeloActual: () => st.modelo,
    placeholder: PLACEHOLDER[st.pestana],
    onCambio: (v) => { st.prompt = v; },
  });
  const menus = [
    menuPresets({ etiqueta: "Estilo", iconoNombre: "pincel", lista: presets.estilos || [], valor: st.estilo, onCambio: (p) => { st.estilo = p ? p.id : null; } }),
    menuPresets({ etiqueta: "Cámara", iconoNombre: "camara", lista: presets.camaras || [], valor: st.camara, onCambio: (p) => { st.camara = p ? p.id : null; } }),
    menuPlantillas({
      lista: (presets.plantillas || []).filter((p) => (p.categoria === "imagen" ? "imagen" : "video") === "video"),
      onElegir: (p) => { st.prompt = p.prompt; prompt.fijar(p.prompt); prompt.area.focus(); },
    }),
  ];

  /* ---------- Feed, ejemplos y botón Generar ---------- */
  const vacio = panelPresets({ tipo: "video", ctx, modelos, plantillas: presets.plantillas });
  const feed = feedTrabajos({ tipo: "video", demo, irA: ctx.irA, vacio });
  const generar = botonGenerar({
    tipo: "video",
    cuerpoCosto: () => ({ modelo: st.modelo, resolucion: st.resolucion, formato: st.formato, duracion: st.duracion, variantes: st.variantes, audio: st.audio }),
    textoBase: () => editando() ? (st.variantes > 1 ? `Editar y crear ${st.variantes} videos` : "Editar video") : (st.variantes > 1 ? `Generar ${st.variantes} videos` : "Generar video"),
    // ModelArk cobra también los tokens del video de entrada y /api/costo solo cuenta el video nuevo.
    aviso: () => (hayVideoDeEntrada() ? "Aproximado: con video de referencia ModelArk también cobra el video de entrada." : ""),
    onGenerar: async () => {
      if (ref.fase() === "importando") { toast("Espera un momento: la referencia se está agregando.", "info"); return; }
      if (editando()) {
        if (!videoAEditar()) { toast("Agrega el video que quieres editar.", "info"); const c = document.getElementById("enlace-video-editar"); if (c) c.focus(); return; }
        if (!st.prompt.trim()) { toast("Escribe qué quieres cambiar en el video.", "info"); prompt.area.focus(); return; }
      } else if (!st.prompt.trim() && !st.primer_cuadro) { toast("Escribe qué quieres ver en el video.", "info"); prompt.area.focus(); return; }
      const trabajos = await enviarGeneracion({
        tipo: "video", modelo: st.modelo, prompt: st.prompt.trim(),
        ajustes: { resolucion: st.resolucion, formato: st.formato /* con foto, el backend pasa a "adaptive" */, duracion: st.duracion, audio: st.audio, semilla: st.semilla, variantes: st.variantes },
        entradas: { primer_cuadro: editando() ? null : st.primer_cuadro, ultimo_cuadro: editando() ? null : st.ultimo_cuadro, referencias: refsFinales() },
        estilo: st.estilo, camara: st.camara,
      });
      if (trabajos) feed.agregar(trabajos);
    },
  });
  ref.alCambiar(() => { pintarEntradas(); generar.recalcular(); });
  ref.fijarModelo(modelo());

  /* ---------- Pestañas ---------- */
  const lista = [{ id: "crear", texto: "Crear video" }];
  if (puedeEditar) lista.push({ id: "editar", texto: "Editar video", titulo: "Cambia un video que ya existe, con Seedance" });
  const nodoPestanas = pestanas({
    etiqueta: "Modo del generador de video", lista, activa: st.pestana,
    onCambio: (id) => {
      st.pestana = id; guardarPestana("video", id);
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
      el("div", { class: "fichas" }, fDuracion, fFormato, fResolucion, fAudio, fVariantes),
      notaModelo),
  ];
  return montarGenerador({
    raiz, titulo: "Video", tituloFeed: "Tus videos", feed, generar, pestanasNodo: nodoPestanas, contenido,
    limpiezas: [() => vacio.parar && vacio.parar()],
  });
}
