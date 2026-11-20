// Biblioteca: todos los trabajos con filtros, selección múltiple y visor grande.
import { api } from "../api.js";
import { el, limpiar, icono, toast, confirmar, tarjetaMedio, abrirVisor, masonry, columnasExplorar } from "../ui.js";
import { accionesVisor } from "../generador.js";

const FILTROS = [
  { id: "todo", texto: "Todo", q: {} },
  { id: "video", texto: "Video", q: { tipo: "video" } },
  { id: "imagen", texto: "Imagen", q: { tipo: "imagen" } },
  { id: "favoritos", texto: "Favoritos", q: { favoritos: 1 } },
];

export async function montar(raiz, ctx) {
  const demo = !!(ctx.salud && ctx.salud.demo);
  let filtro = FILTROS.some((f) => f.id === ctx.params.get("filtro")) ? ctx.params.get("filtro") : "todo";
  let siguiente = null, lista = [];
  let seleccionando = false;
  const elegidos = new Set();
  const cache = new Map();

  const grupo = el("div", { class: "pestanas", role: "group", "aria-label": "Filtrar biblioteca" });
  const grilla = masonry(columnasExplorar);
  const contenedor = el("div", {}, grilla);
  const zonaVacia = el("div", {});
  const btnMas = el("button", { class: "btn", type: "button", hidden: true }, "Cargar más");
  const contador = el("span", { class: "nota", "aria-live": "polite" });
  const btnSeleccionar = el("button", { class: "btn btn-chico", type: "button", "aria-pressed": "false" }, icono("check"), "Seleccionar");
  const barra = el("div", { class: "barra-seleccion", role: "toolbar", "aria-label": "Acciones con la selección", hidden: true });

  const acc = accionesVisor({ alCambiar: () => cargar(true), irA: ctx.irA });
  const abrir = (t, tarjeta) => {
    if (!seleccionando) { abrirVisor(t, { ...acc, demo }); return; }
    if (elegidos.has(t.id)) elegidos.delete(t.id); else elegidos.add(t.id);
    tarjeta.classList.toggle("elegido", elegidos.has(t.id));
    pintarBarra();
  };

  function pintarFiltros() {
    limpiar(grupo, FILTROS.map((f) => el("button", {
      class: "pill", type: "button", "aria-pressed": String(f.id === filtro),
      onclick: () => { if (filtro === f.id) return; filtro = f.id; pintarFiltros(); cargar(true); },
    }, f.texto)));
  }

  function modoSeleccion(si) {
    seleccionando = si;
    elegidos.clear();
    contenedor.classList.toggle("seleccionando", si);
    btnSeleccionar.setAttribute("aria-pressed", String(si));
    btnSeleccionar.lastChild.textContent = si ? "Listo" : "Seleccionar";
    grilla.querySelectorAll(".medio").forEach((n) => n.classList.remove("elegido"));
    pintarBarra();
  }

  function pintarBarra() {
    barra.hidden = !seleccionando;
    if (!seleccionando) return;
    const n = elegidos.size;
    const sel = lista.filter((t) => elegidos.has(t.id));
    const descargables = sel.filter((t) => t.resultado && t.resultado.url);
    limpiar(barra,
      el("strong", {}, n ? `${n} ${n === 1 ? "seleccionado" : "seleccionados"}` : "Toca para elegir"),
      el("button", { class: "btn btn-chico", type: "button", disabled: !n, onclick: async () => {
        for (const t of sel.filter((x) => !x.favorito)) { try { await api.favorito(t.id); } catch { /* toast */ } }
        toast("Marcados como favoritos.", "ok"); modoSeleccion(false); cargar(true);
      } }, icono("corazon"), "Favoritos"),
      el("button", { class: "btn btn-chico", type: "button", disabled: !descargables.length, onclick: () => {
        descargables.forEach((t, i) => setTimeout(() => {
          const a = el("a", { href: t.resultado.url, download: `ponchostudio-${t.id}.${t.tipo === "video" ? "mp4" : "png"}` });
          document.body.append(a); a.click(); a.remove();
        }, i * 300));
        toast(`Descargando ${descargables.length} ${descargables.length === 1 ? "archivo" : "archivos"}.`, "ok");
      } }, icono("descargar"), "Descargar"),
      el("button", { class: "btn btn-chico btn-peligro", type: "button", disabled: !n, onclick: async () => {
        const si = await confirmar({ titulo: `¿Borrar ${n} ${n === 1 ? "trabajo" : "trabajos"}?`, texto: "Se quitan de la biblioteca. Los archivos quedan en data/medios.", aceptar: "Borrar", peligro: true });
        if (!si) return;
        for (const t of sel) { try { await api.borrar(t.id); } catch { /* toast */ } }
        toast("Trabajos borrados.", "ok"); modoSeleccion(false); cargar(true);
      } }, icono("borrar"), "Borrar"),
      el("button", { class: "btn btn-chico btn-fantasma", type: "button", onclick: () => modoSeleccion(false) }, "Cancelar"));
  }

  async function cargar(reiniciar) {
    const q = { ...FILTROS.find((f) => f.id === filtro).q, limite: 60 };
    if (!reiniciar && siguiente) q.antes = siguiente;
    btnMas.disabled = true;
    try {
      const r = await api.trabajos(q);
      lista = reiniciar ? (r.trabajos || []) : lista.concat(r.trabajos || []);
      siguiente = r.siguiente || null;
    } catch { if (reiniciar) lista = []; }
    btnMas.disabled = false;
    btnMas.hidden = !siguiente;
    if (reiniciar) for (const id of [...cache.keys()]) if (!lista.some((t) => t.id === id)) cache.delete(id);
    grilla.poner(lista.map((t) => {
      let tj = cache.get(t.id);
      if (tj) tj.actualizar(t); else { tj = tarjetaMedio(t, { demo, onAbrir: abrir, onRecrear: acc.onRecrear }); cache.set(t.id, tj); }
      tj.classList.toggle("elegido", elegidos.has(t.id));
      return tj;
    }));
    contador.textContent = lista.length ? `${lista.length} ${lista.length === 1 ? "trabajo" : "trabajos"}${siguiente ? " (hay más)" : ""}` : "";
    btnSeleccionar.hidden = !lista.length;
    const textos = {
      todo: ["Tu biblioteca está vacía", "Lo que generes en Video o Imagen queda aquí.", "Crear un video", "#/video"],
      video: ["Aún no hay videos", "Genera tu primer video con Seedance 2.5.", "Crear un video", "#/video"],
      imagen: ["Aún no hay imágenes", "Genera tu primera imagen con gpt-image-2.", "Crear una imagen", "#/imagen"],
      favoritos: ["Sin favoritos", "Abre un trabajo y toca «Favorito» para verlo aquí.", "Ver todo", "#/biblioteca"],
    }[filtro];
    limpiar(zonaVacia, lista.length ? null : el("div", { class: "vacio" },
      el("strong", {}, textos[0]), el("span", {}, textos[1]),
      el("a", { class: "btn", href: textos[3], onclick: filtro === "favoritos" ? (e) => { e.preventDefault(); filtro = "todo"; pintarFiltros(); cargar(true); } : null }, textos[2])));
    pintarBarra();
  }
  btnMas.onclick = () => cargar(false);
  btnSeleccionar.onclick = () => modoSeleccion(!seleccionando);
  const tecla = (e) => { if (e.key === "Escape" && seleccionando && !document.querySelector(".modal-fondo")) modoSeleccion(false); };
  document.addEventListener("keydown", tecla);

  pintarFiltros();
  raiz.append(el("div", { class: "pagina" },
    el("div", { class: "seccion-cabeza" },
      el("h1", {}, "Biblioteca"),
      el("div", { class: "hero-acciones" }, contador, btnSeleccionar)),
    el("div", { class: "seccion" }, grupo, zonaVacia, contenedor, el("div", {}, btnMas))),
    barra);
  await cargar(true);

  // Refresca mientras haya trabajos pendientes.
  const t = setInterval(() => {
    if (!document.hidden && !seleccionando && lista.some((x) => x.estado === "en_cola" || x.estado === "generando")) cargar(true);
  }, 3000);
  return () => { clearInterval(t); document.removeEventListener("keydown", tecla); grilla.soltar(); };
}
