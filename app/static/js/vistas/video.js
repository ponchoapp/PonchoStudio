// Generador de video: Seedance 2.5 directo por defecto.
import { api } from "../api.js";
import { el, limpiar, toast, segmentado, sliderDuracion, interruptor, dropzone, formaIcono, insigniaCreditos } from "../ui.js";
import { selectorModelos, cajaPrompt, chipsPresets, botonGenerar, enviarGeneracion, feedTrabajos, aplicarPrecarga } from "../generador.js";

const MODELO_DEFECTO = "seedance-2.5";

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

  const st = {
    modelo: (modelos.find((m) => m.id === MODELO_DEFECTO) || modelos[0]).id,
    prompt: "", resolucion: "720p", formato: "16:9", duracion: 5, audio: true, variantes: 1, semilla: null,
    primer_cuadro: null, ultimo_cuadro: null, referencias: [], estilo: null, camara: null,
  };
  aplicarPrecarga(st, ctx.precarga);
  const modelo = () => modelos.find((m) => m.id === st.modelo) || modelos[0];

  // Ajusta los valores al rango del modelo elegido.
  function ajustarAlModelo() {
    const m = modelo();
    st.modelo = m.id;
    const res = m.resoluciones || ["720p"];
    if (!res.includes(st.resolucion)) st.resolucion = res.includes("720p") ? "720p" : res[0];
    const fmts = m.formatos || ["16:9"];
    if (!fmts.includes(st.formato)) st.formato = fmts[0];
    const d = m.duracion || { min: 4, max: 30 };
    st.duracion = Math.min(d.max, Math.max(d.min, st.duracion));
    if (!m.audio) st.audio = false;
    const ent = m.entradas || ["texto"];
    if (!ent.includes("primer_cuadro")) st.primer_cuadro = null;
    if (!ent.includes("ultimo_cuadro")) st.ultimo_cuadro = null;
    if (!ent.includes("referencias")) st.referencias = [];
  }
  ajustarAlModelo();

  const cajaModelos = selectorModelos({ modelos, valor: st.modelo, onElegir: (m) => { st.modelo = m.id; ajustarAlModelo(); pintarVariable(); pie.recalcular(); } });

  const prompt = cajaPrompt({
    tipo: "video", valor: st.prompt, salud: ctx.salud, modeloActual: () => st.modelo,
    placeholder: "Describe la escena: quién, dónde, qué pasa y cómo se mueve la cámara.",
    onCambio: (v) => { st.prompt = v; },
  });

  const estilos = chipsPresets({ etiqueta: "Estilo", lista: presets.estilos || [], valor: st.estilo, onCambio: (p) => { st.estilo = p ? p.id : null; } });
  const camaras = chipsPresets({ etiqueta: "Movimiento de cámara", lista: presets.camaras || [], valor: st.camara, onCambio: (p) => { st.camara = p ? p.id : null; } });

  const bloqueEntradas = el("div", { class: "panel-bloque" });
  const bloqueAjustes = el("div", { class: "ajustes-grilla" });
  const notaModelo = el("div", {});

  function pintarVariable() {
    const m = modelo();
    const ent = m.entradas || ["texto"];
    const subir = (a) => api.subir(a);
    const conFoto = !!st.primer_cuadro || !!st.ultimo_cuadro;

    limpiar(notaModelo,
      m.gasta_creditos_higgsfield ? el("p", { class: "nota nota-aviso" }, insigniaCreditos(), " Este modelo va por Higgsfield y gasta créditos de tu cuenta. Te pido confirmación antes.") : null,
      m.nota ? el("p", { class: "nota" }, m.nota) : null);

    const hayCuadros = ent.includes("primer_cuadro") || ent.includes("ultimo_cuadro");
    limpiar(bloqueEntradas,
      hayCuadros ? el("span", { class: "etiqueta" }, "Cuadros (opcional)") : null,
      hayCuadros ? el("div", { class: "cuadros" },
        ent.includes("primer_cuadro") ? dropzone({ texto: "Primer cuadro", valor: st.primer_cuadro, subir, onCambio: (u) => { st.primer_cuadro = u; pintarVariable(); } }) : null,
        ent.includes("ultimo_cuadro") ? dropzone({ texto: "Último cuadro", valor: st.ultimo_cuadro, subir, onCambio: (u) => { st.ultimo_cuadro = u; pintarVariable(); } }) : null) : null,
      ent.includes("referencias") ? el("span", { class: "etiqueta" }, "Referencias", el("span", { class: "valor" }, `${st.referencias.length}/4`)) : null,
      ent.includes("referencias") ? el("div", { class: "refs" },
        [0, 1, 2, 3].map((i) => dropzone({
          texto: `Ref. ${i + 1}`, chico: true, valor: st.referencias[i] || null, subir,
          onCambio: (u) => { const r = [...st.referencias]; if (u) r[i] = u; else r.splice(i, 1); st.referencias = r.filter(Boolean); pintarVariable(); },
        }))) : null,
      !hayCuadros && !ent.includes("referencias") ? el("p", { class: "nota" }, "Este modelo solo recibe texto.") : null);

    const d = m.duracion || { min: 4, max: 30 };
    const esSeedance = m.proveedor === "seedance";
    limpiar(bloqueAjustes,
      segmentado({ etiqueta: "Resolución", opciones: m.resoluciones || ["720p"], valor: st.resolucion, onCambio: (v) => { st.resolucion = v; pie.recalcular(); } }),
      segmentado({
        etiqueta: "Formato", valor: st.formato, deshabilitado: esSeedance && conFoto,
        opciones: (m.formatos || ["16:9"]).map((f) => ({ valor: f, texto: f, icono: formaIcono(f) })),
        onCambio: (v) => { st.formato = v; pie.recalcular(); },
      }),
      esSeedance && conFoto ? el("p", { class: "nota" }, "Con foto de entrada, Seedance toma el formato de la foto.") : null,
      sliderDuracion({ min: d.min, max: d.max, valor: st.duracion, onCambio: (v) => { st.duracion = v; pie.recalcular(); } }),
      m.audio ? interruptor({ texto: "Audio", ayuda: "Seedance genera sonido y voces dentro del video", valor: st.audio, onCambio: (v) => { st.audio = v; pie.recalcular(); } })
        : el("p", { class: "nota" }, "Este modelo genera video sin audio."),
      segmentado({ etiqueta: "Variantes", opciones: [1, 2, 3, 4], valor: st.variantes, onCambio: (v) => { st.variantes = v; pie.recalcular(); } }));
  }

  const cuerpoCosto = () => ({ modelo: st.modelo, resolucion: st.resolucion, formato: st.formato, duracion: st.duracion, variantes: st.variantes, audio: st.audio });
  const feed = feedTrabajos({ tipo: "video", demo, titulo: "Tus videos", vacio: { titulo: "Aún no hay videos", texto: "Escribe un prompt y toca Generar. Aquí ves el progreso." } });

  const pie = botonGenerar({
    tipo: "video", cuerpoCosto,
    textoBase: () => st.variantes > 1 ? `Generar ${st.variantes} videos` : "Generar video",
    onGenerar: async () => {
      if (!st.prompt.trim() && !st.primer_cuadro) { toast("Escribe qué quieres ver en el video.", "info"); prompt.area.focus(); return; }
      const conFoto = !!st.primer_cuadro || !!st.ultimo_cuadro;
      const trabajos = await enviarGeneracion({
        tipo: "video", modelo: st.modelo, prompt: st.prompt.trim(),
        ajustes: { resolucion: st.resolucion, formato: modelo().proveedor === "seedance" && conFoto ? "adaptive" : st.formato, duracion: st.duracion, audio: st.audio, semilla: st.semilla, variantes: st.variantes },
        entradas: { primer_cuadro: st.primer_cuadro, ultimo_cuadro: st.ultimo_cuadro, referencias: st.referencias },
        estilo: st.estilo, camara: st.camara,
      });
      if (trabajos) feed.agregar(trabajos);
    },
  });

  pintarVariable();
  const panel = el("section", { class: "panel", "aria-label": "Ajustes del video" },
    el("div", { class: "panel-titulo" }, el("h1", {}, "Video")),
    cajaModelos, notaModelo, prompt, bloqueEntradas, estilos, camaras, bloqueAjustes, pie);
  raiz.append(el("div", { class: "generador" }, panel, feed));
  return () => feed.parar();
}
