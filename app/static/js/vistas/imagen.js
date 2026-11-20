// Generador de imagen: OpenAI gpt-image-2 por defecto.
import { api } from "../api.js";
import { el, limpiar, toast, segmentado, dropzone, formaIcono, insigniaCreditos } from "../ui.js";
import { selectorModelo, crearPrompt, menuPresets, menuPlantillas, botonGenerar, enviarGeneracion, feedTrabajos, aplicarPrecarga, montarGenerador } from "../generador.js";

const MODELO_DEFECTO = "gpt-image-2";
const CALIDADES = { low: "Baja", medium: "Media", high: "Alta" };

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

  const st = {
    modelo: (modelos.find((m) => m.id === MODELO_DEFECTO) || modelos[0]).id,
    prompt: "", calidad: "medium", formato: "1:1", variantes: 1, semilla: null, referencias: [], estilo: null,
  };
  aplicarPrecarga(st, ctx.precarga);
  const modelo = () => modelos.find((m) => m.id === st.modelo) || modelos[0];

  function ajustarAlModelo() {
    const m = modelo();
    st.modelo = m.id;
    const cal = m.calidades || ["medium"];
    if (!cal.includes(st.calidad)) st.calidad = cal.includes("medium") ? "medium" : cal[0];
    const fmts = m.formatos || ["1:1"];
    if (!fmts.includes(st.formato)) st.formato = fmts[0];
    st.variantes = Math.min(st.variantes, m.variantes_max || 4);
    if (m.entradas && !m.entradas.includes("referencias")) st.referencias = [];
  }
  ajustarAlModelo();

  const notaModelo = el("div", {});
  const bloqueRefs = el("div", { class: "panel-seccion" });
  const bloqueAjustes = el("div", { class: "panel-seccion" });

  function pintarVariable() {
    const m = modelo();
    const aceptaRefs = !m.entradas || m.entradas.includes("referencias");
    limpiar(notaModelo,
      m.gasta_creditos_higgsfield ? el("p", { class: "nota nota-aviso" }, insigniaCreditos(), "Va por Higgsfield y gasta créditos. Te pido confirmación antes.") : null,
      m.nota ? el("p", { class: "nota" }, m.nota) : null);
    bloqueRefs.hidden = !aceptaRefs;
    limpiar(bloqueRefs, aceptaRefs ? [
      el("span", { class: "etiqueta" }, "Referencias", el("span", { class: "valor" }, `${st.referencias.length}/4`)),
      el("div", { class: "refs" }, [0, 1, 2, 3].map((i) => dropzone({
        texto: `Ref. ${i + 1}`, chico: true, valor: st.referencias[i] || null, subir: (a) => api.subir(a),
        onCambio: (u) => { const r = [...st.referencias]; if (u) r[i] = u; else r.splice(i, 1); st.referencias = r.filter(Boolean); pintarVariable(); },
      }))),
      el("p", { class: "nota" }, "Con referencias, la imagen se edita a partir de tus fotos."),
    ] : null);
    const max = m.variantes_max || 4;
    limpiar(bloqueAjustes,
      segmentado({ etiqueta: "Calidad", opciones: (m.calidades || ["medium"]).map((c) => ({ valor: c, texto: CALIDADES[c] || c })), valor: st.calidad, onCambio: (v) => { st.calidad = v; generar.recalcular(); } }),
      segmentado({ etiqueta: "Formato", opciones: (m.formatos || ["1:1"]).map((f) => ({ valor: f, texto: f, icono: formaIcono(f) })), valor: st.formato, onCambio: (v) => { st.formato = v; generar.recalcular(); } }),
      segmentado({ etiqueta: "Variantes", opciones: Array.from({ length: max }, (_, i) => i + 1), valor: st.variantes, onCambio: (v) => { st.variantes = v; generar.recalcular(); } }));
  }

  const prompt = crearPrompt({
    tipo: "imagen", valor: st.prompt, salud: ctx.salud, modeloActual: () => st.modelo,
    placeholder: "Describe la imagen: sujeto, lugar, luz, encuadre y estilo",
    onCambio: (v) => { st.prompt = v; },
  });
  const menus = [menuPresets({ etiqueta: "Estilo", iconoNombre: "pincel", lista: presets.estilos || [], valor: st.estilo, onCambio: (p) => { st.estilo = p ? p.id : null; } })];
  menus.push(menuPlantillas({
    lista: (presets.plantillas || []).filter((p) => (p.categoria === "imagen" ? "imagen" : "video") === "imagen"),
    onElegir: (p) => { st.prompt = p.prompt; prompt.fijar(p.prompt); prompt.area.focus(); },
  }));
  const feed = feedTrabajos({ tipo: "imagen", demo, irA: ctx.irA, vacio: { titulo: "Aún no hay imágenes", texto: "Escribe un prompt abajo y toca Generar. Aquí aparecen las imágenes." } });
  const generar = botonGenerar({
    tipo: "imagen",
    cuerpoCosto: () => ({ modelo: st.modelo, calidad: st.calidad, formato: st.formato, variantes: st.variantes }),
    textoBase: () => st.variantes > 1 ? `Generar ${st.variantes} imágenes` : "Generar imagen",
    onGenerar: async () => {
      if (!st.prompt.trim()) { toast("Escribe qué quieres ver en la imagen.", "info"); prompt.area.focus(); return; }
      const trabajos = await enviarGeneracion({
        tipo: "imagen", modelo: st.modelo, prompt: st.prompt.trim(),
        ajustes: { calidad: st.calidad, formato: st.formato, variantes: st.variantes, semilla: st.semilla },
        entradas: { primer_cuadro: null, ultimo_cuadro: null, referencias: st.referencias },
        estilo: st.estilo, camara: null,
      });
      if (trabajos) feed.agregar(trabajos);
    },
  });

  pintarVariable();
  const selModelo = selectorModelo({ modelos, valor: st.modelo, onElegir: (m) => { st.modelo = m.id; ajustarAlModelo(); pintarVariable(); generar.recalcular(); } });
  return montarGenerador({
    raiz, titulo: "Imagen", tituloFeed: "Tus imágenes", feed, prompt, menus, generar,
    secciones: [el("div", { class: "panel-seccion" }, el("span", { class: "etiqueta" }, "Modelo"), selModelo, notaModelo), bloqueRefs, bloqueAjustes],
  });
}
