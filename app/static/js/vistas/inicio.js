// Explorar: como el home de Higgsfield. Tarjetas grandes de herramientas, masonry de
// ejemplos reales (presets de Higgsfield) con video al pasar el mouse, tu galería de
// Higgsfield y tus generaciones locales. Sin Higgsfield: aviso + plantillas locales.
import { api } from "../api.js";
import { el, limpiar, icono, arte, modal, toast, tarjetaMedio, abrirVisor, masonry, columnasExplorar, insigniaDemo } from "../ui.js";
import { accionesVisor } from "../generador.js";

const HERRAMIENTAS = [
  { id: "cine", titulo: "Cine", texto: "Plano, cámara y lente guiados", ruta: "estudios", precarga: { estudio: "cine" } },
  { id: "video", titulo: "Video", texto: "Seedance 2.5 directo, 4 a 30 s", ruta: "video" },
  { id: "imagen", titulo: "Imagen", texto: "gpt-image-2 con referencias", ruta: "imagen" },
  { id: "estudios", titulo: "Estudios", texto: "Producto, videoclip y retrato", ruta: "estudios" },
];
const DEFECTO = { video: "seedance-2.5", imagen: "gpt-image-2" };
const sinMovimiento = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const tipoLocal = (t) => (t === "image" || t === "imagen" ? "imagen" : "video");

// Carga perezosa: el video no pide nada hasta que la tarjeta entra en pantalla;
// ahí baja solo los metadatos para mostrar el primer cuadro.
const observador = "IntersectionObserver" in window ? new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    if (!e.isIntersecting) continue;
    const v = e.target;
    observador.unobserve(v);
    if (v.dataset.src) { v.preload = "metadata"; v.src = v.dataset.src + "#t=0.1"; }
  }
}, { rootMargin: "300px" }) : null;

function medioVista(url, tipo, alt) {
  if (tipo === "video") {
    const v = el("video", { muted: true, loop: true, playsInline: true, preload: "none", "aria-hidden": "true", tabIndex: -1 });
    v.muted = true;
    if (observador) { v.dataset.src = url; observador.observe(v); } else v.src = url;
    return v;
  }
  return el("img", { src: url, alt: alt || "", loading: "lazy" });
}

// Tarjeta de vista previa (preset o galería): mismo aspecto que las tarjetas de trabajo.
function tarjetaVista({ url, tipo, titulo, sub, semilla, onAbrir, onRecrear, etiquetaAbrir }) {
  const tarjeta = el("div", { class: "medio" });
  const caja = el("div", { class: "medio-caja", style: { "--ar": tipo === "video" ? "9 / 16" : "4 / 5" } });
  tarjeta.altoRel = tipo === "video" ? 1.5 : 1.25;
  let medio = null;
  if (url) {
    medio = medioVista(url, tipo, titulo);
    const ajustarProporcion = (w, h) => { if (w && h) caja.style.setProperty("--ar", `${w} / ${h}`); };
    if (tipo === "video") medio.addEventListener("loadedmetadata", () => ajustarProporcion(medio.videoWidth, medio.videoHeight));
    else medio.addEventListener("load", () => ajustarProporcion(medio.naturalWidth, medio.naturalHeight));
    caja.append(medio);
  } else {
    caja.classList.add("ruido", "sin-medio");
    caja.style.background = arte(semilla || titulo);
    caja.append(el("div", { class: "medio-pendiente" }, el("span", {}, "Sin vista previa")));
  }
  const abrir = el("button", { class: "medio-abrir", type: "button", "aria-label": etiquetaAbrir });
  abrir.onclick = onAbrir;
  if (medio && tipo === "video") {
    const jugar = () => { if (!sinMovimiento()) { if (!medio.src && medio.dataset.src) medio.src = medio.dataset.src; medio.play().catch(() => {}); } };
    const parar = () => medio.pause();
    tarjeta.onmouseenter = jugar; tarjeta.onmouseleave = parar;
    abrir.onfocus = jugar; abrir.onblur = parar;
  }
  const recrear = onRecrear ? el("button", { class: "btn", type: "button", "aria-label": `Recrear ${titulo}` }, icono("repetir"), "Recrear") : null;
  if (recrear) recrear.onclick = (e) => { e.stopPropagation(); onRecrear(recrear); };
  const sup = el("div", { class: "medio-sup" }, sub ? el("span", { class: "insignia insignia-demo" }, sub) : null);
  const inf = el("div", { class: "medio-inf" }, el("p", {}, el("strong", {}, titulo)), recrear ? el("div", { class: "medio-acciones" }, recrear) : null);
  tarjeta.append(caja, sup, abrir, inf);
  return tarjeta;
}

// Visor simple para medios de Higgsfield (no son trabajos locales).
function verMedio({ url, tipo, titulo, texto, onRecrear }) {
  const medio = el("div", { class: "visor-medio" },
    url ? (tipo === "video"
      ? el("video", { src: url, controls: true, autoplay: !sinMovimiento(), loop: true, muted: true, playsInline: true })
      : el("img", { src: url, alt: titulo })) : el("p", { class: "nota" }, "Sin vista previa"));
  const cerrarBtn = el("button", { class: "btn-icono visor-cerrar", type: "button", "aria-label": "Cerrar visor" }, icono("x"));
  const btnRecrear = onRecrear ? el("button", { class: "btn btn-primario", type: "button" }, icono("repetir"), "Recrear en PonchoStudio") : null;
  const info = el("div", { class: "visor-info" },
    el("h2", {}, titulo),
    texto ? el("div", { class: "visor-prompt" }, texto) : null,
    el("div", { class: "visor-acciones" }, btnRecrear,
      url ? el("a", { class: "btn", href: url, target: "_blank", rel: "noopener" }, icono("enlace"), "Abrir original") : null));
  const cerrar = modal([cerrarBtn, medio, info], { clase: "visor", etiqueta: titulo });
  cerrarBtn.onclick = cerrar;
  if (btnRecrear) btnRecrear.onclick = () => { cerrar(); onRecrear(btnRecrear); };
}

export async function montar(raiz, ctx) {
  const demo = !!(ctx.salud && ctx.salud.demo);
  const hfConectado = !!(ctx.salud && ctx.salud.proveedores && ctx.salud.proveedores.higgsfield && ctx.salud.proveedores.higgsfield.conectado);
  const limpiezas = [];

  const [rt, rp, rh, catalogo] = await Promise.all([
    api.trabajos({ limite: 24 }, { silencioso: true }).catch(() => ({ trabajos: [] })),
    api.presets().catch(() => ({ plantillas: [] })),
    hfConectado ? api.higgsfieldPresets({ silencioso: true }).catch(() => null) : Promise.resolve(null),
    api.catalogo().catch(() => ({ video: [], imagen: [] })),
  ]);
  let trabajos = (rt && rt.trabajos) || [];
  const plantillas = (rp && rp.plantillas) || [];
  const presets = (rh && rh.items) || null;

  // "Recrear" un preset: modelo directo (Seedance / gpt-image) para no gastar créditos.
  const modeloDirecto = (tipo, sugerido) => {
    const lista = catalogo[tipo] || [];
    const m = lista.find((x) => x.id === sugerido);
    return m && !m.gasta_creditos_higgsfield ? m.id : (lista.find((x) => x.id === DEFECTO[tipo]) || lista.find((x) => !x.gasta_creditos_higgsfield) || {}).id;
  };
  const recrearPreset = async (p, boton) => {
    const tipo = tipoLocal(p.tipo);
    if (boton) { boton.disabled = true; }
    try {
      const r = await api.higgsfieldRecrear(p.id);
      ctx.irA(tipo, { prompt: r.prompt || p.prompt, modelo: modeloDirecto(tipo, r.modelo_sugerido), ajustes: r.ajustes || {} });
    } catch {
      // Sin respuesta del backend: igual cargo el prompt conocido.
      if (p.prompt) ctx.irA(tipo, { prompt: p.prompt, modelo: modeloDirecto(tipo, null) });
    } finally { if (boton) boton.disabled = false; }
  };

  /* Herramientas */
  const fondos = presets ? presets.filter((p) => p.preview) : [];
  const carrusel = el("nav", { class: "carrusel", "aria-label": "Herramientas" },
    HERRAMIENTAS.map((h, i) => {
      const p = fondos[i];
      const medio = p ? medioVista(p.preview, p.preview_tipo === "imagen" ? "imagen" : "video", "") : null;
      const a = el("a", { class: "herramienta", href: `#/${h.ruta}` },
        el("div", { class: "herramienta-fondo ruido", style: { background: arte(h.id + "x") } }, medio),
        el("strong", {}, h.titulo), el("span", {}, h.texto));
      if (h.precarga) a.onclick = (e) => { e.preventDefault(); ctx.irA(h.ruta, h.precarga); };
      if (medio && medio.tagName === "VIDEO") {
        a.onmouseenter = () => { if (!sinMovimiento()) medio.play().catch(() => {}); };
        a.onmouseleave = () => medio.pause();
      }
      return a;
    }));

  const pagina = el("div", { class: "pagina" }, el("h1", { class: "solo-lector" }, "Explorar"), carrusel);
  raiz.append(pagina);

  /* Ejemplos de Higgsfield */
  if (presets && presets.length) {
    const categorias = [...new Set(presets.map((p) => p.categoria).filter(Boolean))];
    let filtro = "todo";
    const grilla = masonry(columnasExplorar);
    limpiezas.push(() => grilla.soltar());
    const pestanas = el("div", { class: "pestanas", role: "group", "aria-label": "Filtrar ejemplos" });
    const tarjetas = presets.map((p) => {
      const tipo = tipoLocal(p.preview_tipo || p.tipo);
      const t = tarjetaVista({
        url: p.preview, tipo, titulo: p.nombre, sub: p.categoria, semilla: p.id,
        etiquetaAbrir: `Ver ejemplo ${p.nombre}`,
        onAbrir: () => verMedio({ url: p.preview, tipo, titulo: p.nombre, texto: p.prompt, onRecrear: (b) => recrearPreset(p, b) }),
        onRecrear: (b) => recrearPreset(p, b),
      });
      t.preset = p;
      return t;
    });
    const pintar = () => {
      pestanas.replaceChildren(...[["todo", "Todo"], ["video", "Video"], ["imagen", "Imagen"], ...categorias.map((c) => [c, c])].map(([id, txt]) =>
        el("button", { class: "pill", type: "button", "aria-pressed": String(filtro === id), onclick: () => { filtro = id; pintar(); } }, txt)));
      grilla.poner(tarjetas.filter((t) => filtro === "todo" || tipoLocal(t.preset.tipo) === filtro || t.preset.categoria === filtro));
    };
    pintar();
    pagina.append(el("section", { class: "seccion", "aria-labelledby": "ej-titulo" },
      el("div", { class: "seccion-cabeza" }, el("h2", { id: "ej-titulo" }, "Ejemplos para recrear"),
        el("span", { class: "nota" }, "Recrear usa Seedance o gpt-image directo: no gasta créditos")),
      pestanas, grilla));
  } else {
    // Sin Higgsfield: aviso y plantillas locales en una lista compacta.
    pagina.append(el("section", { class: "aviso-caja" },
      el("h2", {}, hfConectado ? "Higgsfield no respondió" : "Conecta Higgsfield para ver ejemplos reales"),
      el("p", {}, hfConectado ? "No se pudieron leer los ejemplos. Vuelve a intentar en un momento." : "Aquí aparecen videos e imágenes de ejemplo con su prompt, listos para recrear sin gastar créditos."),
      el("div", { class: "hero-acciones" },
        hfConectado ? el("button", { class: "btn", type: "button", onclick: () => ctx.irA("inicio") }, "Volver a intentar")
          : el("a", { class: "btn btn-primario", href: api.rutaConectarHiggsfield }, icono("enlace"), "Conectar Higgsfield"))));
    if (plantillas.length) {
      pagina.append(el("section", { class: "seccion", "aria-labelledby": "pla-titulo" },
        el("h2", { id: "pla-titulo" }, "Plantillas"),
        el("ul", { class: "lista-plantillas" }, plantillas.map((p) => {
          const destino = p.categoria === "imagen" ? "imagen" : "video";
          return el("li", {}, el("button", { class: "fila-plantilla", type: "button", onclick: () => ctx.irA(destino, { prompt: p.prompt, modelo: modeloDirecto(destino, p.modelo_sugerido) }) },
            el("span", { class: "insignia" }, icono(destino), destino === "video" ? "Video" : "Imagen"),
            el("span", { class: "fila-plantilla-txt" }, el("strong", {}, p.nombre), el("small", {}, p.prompt)),
            el("span", { class: "fila-plantilla-usar" }, "Usar")));
        }))));
    }
  }

  /* Tus generaciones en Higgsfield */
  if (presets) {
    const grilla = masonry(columnasExplorar);
    limpiezas.push(() => grilla.soltar());
    const seccion = el("section", { class: "seccion", "aria-labelledby": "gal-titulo" },
      el("div", { class: "seccion-cabeza" }, el("h2", { id: "gal-titulo" }, "Tus generaciones en Higgsfield")), grilla);
    pagina.append(seccion);
    const cursores = { video: "", image: "" };
    let items = [];
    const btnMas = el("button", { class: "btn", type: "button", hidden: true }, "Cargar más");
    seccion.append(el("div", {}, btnMas));
    const cargar = async () => {
      btnMas.disabled = true;
      const pedidos = Object.entries(cursores).filter(([, c]) => c !== null)
        .map(([tipo, c]) => api.higgsfieldGaleria({ tipo, cursor: c || undefined }, { silencioso: true })
          .then((r) => { cursores[tipo] = r.siguiente || null; return r.items || []; }).catch(() => { cursores[tipo] = null; return []; }));
      const nuevos = (await Promise.all(pedidos)).flat();
      items = items.concat(nuevos).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      grilla.poner(items.map((g) => {
        if (!g._tarjeta) {
          const tipo = tipoLocal(g.tipo);
          g._tarjeta = tarjetaVista({ url: g.url, tipo, titulo: g.modelo || "Higgsfield", semilla: g.id, etiquetaAbrir: `Ver generación de ${g.modelo || "Higgsfield"}`,
            onAbrir: () => verMedio({ url: g.url, tipo, titulo: g.modelo || "Generación de Higgsfield" }) });
        }
        return g._tarjeta;
      }));
      btnMas.hidden = !Object.values(cursores).some(Boolean);
      btnMas.disabled = false;
      if (!items.length) seccion.hidden = true;
    };
    btnMas.onclick = cargar;
    cargar();
  }

  /* Tus generaciones en PonchoStudio */
  if (trabajos.length) {
    const acc = accionesVisor({ alCambiar: () => ctx.irA("inicio"), irA: ctx.irA });
    const grilla = masonry(columnasExplorar);
    limpiezas.push(() => grilla.soltar());
    pagina.append(el("section", { class: "seccion", "aria-labelledby": "mis-titulo" },
      el("div", { class: "seccion-cabeza" }, el("h2", { id: "mis-titulo" }, "Tus generaciones"),
        el("a", { class: "btn btn-fantasma btn-chico", href: "#/biblioteca" }, "Ver biblioteca")),
      grilla));
    grilla.poner(trabajos.map((t) => tarjetaMedio(t, { demo, onAbrir: (tt) => abrirVisor(tt, { ...acc, demo }), onRecrear: acc.onRecrear })));
  }

  return () => limpiezas.forEach((f) => f());
}
