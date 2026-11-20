// Explorar: tarjetas grandes de herramientas y masonry densa de generaciones y plantillas.
import { api } from "../api.js";
import { el, icono, arte, tarjetaMedio, abrirVisor, masonry, columnasExplorar } from "../ui.js";
import { accionesVisor } from "../generador.js";

const HERRAMIENTAS = [
  { id: "cine", titulo: "Cine", texto: "Plano, cámara y lente guiados", ruta: "estudios", precarga: { estudio: "cine" }, tipoMedio: "video" },
  { id: "video", titulo: "Video", texto: "Seedance 2.5 directo, 4 a 30 s", ruta: "video", tipoMedio: "video" },
  { id: "imagen", titulo: "Imagen", texto: "gpt-image-2 con referencias", ruta: "imagen", tipoMedio: "imagen" },
  { id: "estudios", titulo: "Estudios", texto: "Producto, videoclip y retrato", ruta: "estudios", tipoMedio: "imagen" },
];
const PROPORCIONES = ["4 / 5", "1 / 1", "3 / 4", "4 / 5", "9 / 16", "1 / 1"];

export async function montar(raiz, ctx) {
  const demo = !!(ctx.salud && ctx.salud.demo);
  let trabajos = [], plantillas = [];
  let filtro = "todo";

  const [rt, rp] = await Promise.all([
    api.trabajos({ limite: 48 }, { silencioso: true }).catch(() => ({ trabajos: [] })),
    api.presets().catch(() => ({ plantillas: [] })),
  ]);
  trabajos = (rt && rt.trabajos) || [];
  plantillas = (rp && rp.plantillas) || [];

  // Fondo de cada herramienta: la última generación lista de ese tipo, si hay.
  const listos = trabajos.filter((t) => t.estado === "listo" && t.resultado && (t.resultado.url || t.resultado.miniatura));
  const fondoDe = (tipo, i) => {
    const t = listos.filter((x) => x.tipo === tipo)[i] || listos[i];
    if (!t) return null;
    const r = t.resultado;
    if (t.tipo === "video" && r.url) return el("video", { src: r.url, poster: r.miniatura || null, muted: true, loop: true, playsInline: true, autoplay: false, preload: "metadata", "aria-hidden": "true" });
    return el("img", { src: r.miniatura || r.url, alt: "" });
  };
  const carrusel = el("nav", { class: "carrusel", "aria-label": "Herramientas" },
    HERRAMIENTAS.map((h, i) => {
      const medio = fondoDe(h.tipoMedio, i);
      const fondo = el("div", { class: "herramienta-fondo ruido", style: { background: arte(h.id + "x") } }, medio);
      const a = el("a", { class: "herramienta", href: `#/${h.ruta}` },
        fondo,
        el("span", { class: "insignia ir" }, h.ruta === "estudios" && h.id === "cine" ? "Estudio" : "Abrir"),
        el("strong", {}, h.titulo), el("span", {}, h.texto));
      if (h.precarga) a.onclick = (e) => { e.preventDefault(); ctx.irA(h.ruta, h.precarga); };
      if (medio && medio.tagName === "VIDEO") {
        a.onmouseenter = () => medio.play().catch(() => {});
        a.onmouseleave = () => medio.pause();
      }
      return a;
    }));

  const acc = accionesVisor({ alCambiar: () => recargar(), irA: ctx.irA });
  const abrir = (t) => abrirVisor(t, { ...acc, demo });
  const grilla = masonry(columnasExplorar);
  const vacio = el("div", {});
  const pestanas = el("div", { class: "pestanas", role: "group", "aria-label": "Qué mostrar" });

  function pintarPestanas() {
    pestanas.replaceChildren(...[["todo", "Todo"], ["mios", "Mis generaciones"], ["plantillas", "Plantillas"]].map(([id, txt]) =>
      el("button", { class: "pill", type: "button", "aria-pressed": String(filtro === id), onclick: () => { filtro = id; pintarPestanas(); pintarGrilla(); } }, txt)));
  }
  function pintarGrilla() {
    const nodos = [];
    if (filtro !== "plantillas") nodos.push(...trabajos.map((t) => tarjetaMedio(t, { demo, onAbrir: abrir, onRecrear: acc.onRecrear })));
    if (filtro !== "mios") nodos.push(...plantillas.map((p, i) => tarjetaPlantilla(p, i, ctx)));
    grilla.poner(nodos);
    vacio.replaceChildren(nodos.length ? "" : el("div", { class: "vacio" },
      el("strong", {}, filtro === "plantillas" ? "Sin plantillas" : "Todavía no has generado nada"),
      el("span", {}, filtro === "plantillas" ? "Conecta Higgsfield en Ajustes y toca «Aprender de Higgsfield»." : "Abre Video o Imagen, escribe un prompt y genera."),
      el("a", { class: "btn btn-primario", href: filtro === "plantillas" ? "#/ajustes" : "#/video" }, filtro === "plantillas" ? "Abrir Ajustes" : "Crear un video")));
  }
  async function recargar() {
    try { trabajos = ((await api.trabajos({ limite: 48 }, { silencioso: true })).trabajos) || []; } catch { /* sin datos */ }
    pintarGrilla();
  }

  pintarPestanas();
  raiz.append(el("div", { class: "pagina" },
    el("h1", { class: "solo-lector" }, "Explorar"),
    carrusel,
    el("section", { class: "seccion", "aria-label": "Generaciones y plantillas" },
      el("div", { class: "seccion-cabeza" }, pestanas), vacio, grilla)));
  pintarGrilla();
  return () => grilla.soltar();
}

function tarjetaPlantilla(p, i, ctx) {
  const destino = p.categoria === "imagen" ? "imagen" : "video";
  const ar = PROPORCIONES[i % PROPORCIONES.length];
  const [w, h] = ar.split("/").map((x) => parseFloat(x));
  const b = el("button", {
    class: "plantilla ruido", type: "button", style: { "--ar": ar, background: arte(p.id || p.nombre) },
    "aria-label": `Usar plantilla ${p.nombre} en ${destino === "video" ? "Video" : "Imagen"}`,
  },
    el("div", { class: "plantilla-cab" },
      el("span", { class: "insignia" }, icono(destino), destino === "video" ? "Video" : "Imagen"),
      p.origen === "higgsfield" ? el("span", { class: "insignia insignia-violeta" }, "Aprendida") : null),
    el("div", {}, el("strong", {}, p.nombre), el("p", {}, p.prompt), el("div", { class: "plantilla-usar" }, "Usar plantilla")));
  b.altoRel = h / w;
  b.onclick = () => ctx.irA(destino, { prompt: p.prompt, modelo: p.modelo_sugerido || undefined });
  return b;
}
