// Explorar, organizado en secciones como una home de generación: destacados 16:9, verticales 9:16,
// una sección por categoría real del MCP de Higgsfield, plantillas, tu galería de Higgsfield y tus
// generaciones locales. Recrear o abrir un ejemplo conserva la referencia (vista previa) hacia el generador.
import { api } from "../api.js";
import { el, limpiar, icono, toast, usd, confirmar, tarjetaMedio, abrirVisor, masonry, columnasExplorar } from "../ui.js";
import { accionesVisor } from "../generador.js";
import { tarjetaVista, verMedio, referenciaDe, guardarReferencia, sinMovimiento } from "../tarjetas.js";

const DEFECTO = { video: "seedance-2.5", imagen: "gpt-image-2" };
const tipoLocal = (t) => (t === "image" || t === "imagen" ? "imagen" : "video");

// Categorías reales del MCP -> nombre legible. Si llega una nueva, cae al nombre crudo.
const CATEGORIAS = {
  viral: ["Virales", "Efectos y tendencias para recrear"],
  what_if: ["¿Y si…?", "Escenas imposibles hechas video"],
  marketing_studio: ["Producto y marketing", "Anuncios y tomas de producto"],
  soul: ["Estilos de foto", "Retratos y looks para tus imágenes"],
};
const ORDEN_CATEGORIAS = Object.keys(CATEGORIAS);
const nombreCategoria = (c) => (CATEGORIAS[c] ? CATEGORIAS[c][0] : String(c || "Más ejemplos").replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase()));
const subCategoria = (c) => (CATEGORIAS[c] ? CATEGORIAS[c][1] : "Ejemplos para recrear");

// Intercala varias listas: una de cada una por turno.
function intercalar(listas, max) {
  const salida = [];
  for (let i = 0; salida.length < max && listas.some((l) => i < l.length); i++)
    for (const l of listas) if (i < l.length && salida.length < max) salida.push(l[i]);
  return salida;
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
  const trabajos = (rt && rt.trabajos) || [];
  const plantillas = (rp && rp.plantillas) || [];
  const presets = (rh && rh.items) || null;

  // "Recrear": modelo directo (Seedance / gpt-image) para no gastar créditos de Higgsfield.
  const modeloDirecto = (tipo, sugerido) => {
    const lista = catalogo[tipo] || [];
    const m = lista.find((x) => x.id === sugerido);
    return m && !m.gasta_creditos_higgsfield ? m.id : (lista.find((x) => x.id === DEFECTO[tipo]) || lista.find((x) => !x.gasta_creditos_higgsfield) || {}).id;
  };
  // La referencia (vista previa original + poster) viaja al generador y queda guardada por si cambia de vista.
  const irConReferencia = (tipo, ref, datos) => {
    guardarReferencia(tipo, ref);
    ctx.irA(tipo, { ...datos, referencia: ref });
  };
  const recrearPreset = async (p, boton) => {
    const tipo = tipoLocal(p.tipo);
    const ref = referenciaDe({ id: p.id, nombre: p.nombre, tipo, url: p.preview, miniatura: p.miniatura, origen: "preset", categoria: p.categoria });
    if (boton) boton.disabled = true;
    try {
      const r = await api.higgsfieldRecrear(p.id);
      irConReferencia(tipo, ref, { prompt: r.prompt || p.prompt || p.descripcion || p.nombre, modelo: modeloDirecto(tipo, r.modelo_sugerido), ajustes: r.ajustes || {} });
    } catch {
      // Sin respuesta del backend: igual cargo lo que sé del ejemplo y su referencia.
      irConReferencia(tipo, ref, { prompt: p.prompt || p.descripcion || p.nombre, modelo: modeloDirecto(tipo, null) });
    } finally { if (boton) boton.disabled = false; }
  };
  const recrearGaleria = (g) => {
    const tipo = tipoLocal(g.tipo);
    const ref = referenciaDe({ id: g.id, nombre: g.modelo || "Generación de Higgsfield", tipo, url: g.url, miniatura: g.miniatura, origen: "higgsfield" });
    irConReferencia(tipo, ref, { prompt: g.prompt || "", modelo: modeloDirecto(tipo, null) });
  };
  const tarjetaPreset = (p, opciones = {}) => {
    const tipo = tipoLocal(p.preview_tipo || p.tipo);
    return tarjetaVista({
      url: p.preview, tipo, miniatura: p.miniatura, titulo: p.nombre, semilla: p.id, etiquetaAbrir: `Ver ejemplo ${p.nombre}`,
      onAbrir: () => verMedio({ url: p.preview, tipo, titulo: p.nombre, texto: p.prompt || p.descripcion, onRecrear: (b) => recrearPreset(p, b) }),
      onRecrear: (b) => recrearPreset(p, b), ...opciones,
    });
  };

  /* Piezas de sección: título violeta en mayúsculas, subtítulo gris y "Ver todo" */
  let contador = 0;
  const cabecera = (titulo, sub, extra) => {
    const id = `exp-s${++contador}`;
    return { id, nodo: el("div", { class: "seccion-cabeza" },
      el("div", { class: "seccion-textos" }, el("h2", { id, class: "seccion-titulo" }, titulo), sub ? el("p", { class: "seccion-sub" }, sub) : null),
      extra ? el("div", { class: "seccion-extra" }, extra) : null) };
  };
  const botonVerTodo = (titulo) => el("button", { class: "btn btn-chico ver-todo", type: "button", "aria-expanded": "false", "aria-label": `Ver todo: ${titulo}` }, "Ver todo");
  const alternar = (btn, titulo, abierto) => {
    btn.setAttribute("aria-expanded", String(abierto));
    btn.setAttribute("aria-label", `${abierto ? "Ver menos" : "Ver todo"}: ${titulo}`);
    btn.textContent = abierto ? "Ver menos" : "Ver todo";
  };

  // Carrusel horizontal con snap; con teclado se recorre con las flechas. "Ver todo" lo abre como cuadrícula.
  const carrusel = ({ titulo, sub, lista, inicial, clase, hacer }) => {
    const cache = new Map();
    const tarjeta = (x) => { if (!cache.has(x)) cache.set(x, hacer(x)); return cache.get(x); };
    const pista = el("div", { class: `carrusel-pista ${clase}`, tabindex: "0", role: "region", "aria-label": titulo });
    const anterior = el("button", { class: "btn-icono carrusel-flecha ant", type: "button", "aria-label": `${titulo}: ver anteriores` }, icono("abajo"));
    const siguiente = el("button", { class: "btn-icono carrusel-flecha sig", type: "button", "aria-label": `${titulo}: ver siguientes` }, icono("abajo"));
    let abierto = false;
    const btn = lista.length > inicial ? botonVerTodo(titulo) : null;
    const cab = cabecera(titulo, sub, [anterior, siguiente, btn]);
    const estado = () => {
      const max = pista.scrollWidth - pista.clientWidth - 2;
      anterior.disabled = abierto || pista.scrollLeft < 2;
      siguiente.disabled = abierto || pista.scrollLeft >= max;
    };
    const pintar = () => {
      pista.replaceChildren(...(abierto ? lista : lista.slice(0, inicial)).map((x) => el("div", { class: "carrusel-item" }, tarjeta(x))));
      pista.scrollLeft = 0;
      estado();
    };
    const mover = (dir) => pista.scrollBy({ left: dir * pista.clientWidth * .85, behavior: sinMovimiento() ? "auto" : "smooth" });
    anterior.onclick = () => mover(-1);
    siguiente.onclick = () => mover(1);
    pista.addEventListener("scroll", () => requestAnimationFrame(estado), { passive: true });
    if (btn) btn.onclick = () => {
      abierto = !abierto;
      alternar(btn, titulo, abierto);
      pista.classList.toggle("expandido", abierto);
      cab.nodo.classList.toggle("sin-flechas", abierto);
      pintar();
    };
    const ro = new ResizeObserver(() => requestAnimationFrame(estado));
    ro.observe(pista);
    limpiezas.push(() => ro.disconnect());
    pintar();
    return el("section", { class: "seccion seccion-carrusel", "aria-labelledby": cab.id }, cab.nodo, pista);
  };

  // Masonry con las primeras tarjetas; "Ver todo" muestra el resto de la sección.
  const masonrySeccion = ({ titulo, sub, lista, inicial = 12, hacer }) => {
    const cache = new Map();
    const tarjeta = (x) => { if (!cache.has(x)) cache.set(x, hacer(x)); return cache.get(x); };
    const grilla = masonry(columnasExplorar);
    limpiezas.push(() => grilla.soltar());
    let abierto = false;
    const btn = lista.length > inicial ? botonVerTodo(titulo) : null;
    const cab = cabecera(titulo, sub, btn);
    const pintar = () => grilla.poner((abierto ? lista : lista.slice(0, inicial)).map(tarjeta));
    if (btn) btn.onclick = () => { abierto = !abierto; alternar(btn, titulo, abierto); pintar(); };
    pintar();
    return el("section", { class: "seccion", "aria-labelledby": cab.id }, cab.nodo, grilla);
  };

  const pagina = el("div", { class: "pagina pagina-explorar" }, el("h1", { class: "solo-lector" }, "Explorar"));
  raiz.append(pagina);

  /* Aviso discreto si Higgsfield no está conectado */
  if (!presets) {
    pagina.append(el("div", { class: "franja-aviso" },
      el("span", {}, hfConectado ? "Higgsfield no respondió. Los ejemplos vuelven cuando responda." : "Conecta Higgsfield para ver ejemplos reales con video y recrearlos sin gastar créditos."),
      hfConectado ? el("button", { class: "btn btn-chico", type: "button", onclick: () => ctx.irA("inicio") }, "Volver a intentar")
        : el("a", { class: "btn btn-chico btn-primario", href: api.rutaConectarHiggsfield }, icono("enlace"), "Conectar Higgsfield")));
  }

  /* Franja: crear miniaturas de plantillas con ChatGPT (solo con confirmación: gasta plata) */
  const sinMini = plantillas.filter((p) => !p.miniatura);
  if (sinMini.length) {
    const franja = el("div", { class: "franja-aviso" });
    pagina.append(franja);
    api.miniaturasCosto().then((c) => {
      const usdTxt = c && c.usd != null ? ` · ~${usd(c.usd)}` : "";
      const total = (c && c.total) || sinMini.length;
      const btn = el("button", { class: "btn btn-chico", type: "button" }, icono("imagen"), `Crear miniaturas con ChatGPT${usdTxt}`);
      limpiar(franja, el("span", {}, `${total} ${total === 1 ? "plantilla no tiene" : "plantillas no tienen"} imagen.`), btn);
      btn.onclick = async () => {
        const si = await confirmar({ titulo: "¿Crear miniaturas con ChatGPT?", texto: `Se crean ${total} imágenes con tu llave de OpenAI${usdTxt ? `. Costo aproximado: ${usd(c.usd)}` : ""}.`, aceptar: `Crear ${total} miniaturas` });
        if (!si) return;
        try { await api.miniaturasCrear(); } catch { return; }
        const barra = el("div", { class: "progreso", role: "progressbar", "aria-label": "Miniaturas creadas", "aria-valuemin": 0, "aria-valuemax": 100 }, el("i"));
        const txt = el("span", { "aria-live": "polite" }, "Creando miniaturas…");
        limpiar(franja, txt, el("div", { class: "franja-progreso" }, barra));
        const sondeo = setInterval(async () => {
          const e = await api.miniaturasEstado().catch(() => null);
          if (!e) return;
          const p = e.total ? Math.round((e.hechas / e.total) * 100) : 0;
          barra.firstChild.style.setProperty("--v", p + "%");
          barra.setAttribute("aria-valuenow", p);
          txt.textContent = `Miniaturas: ${e.hechas} de ${e.total}${e.costo_usd != null ? ` · ${usd(e.costo_usd)}` : ""}`;
          if (e.listo) { clearInterval(sondeo); toast("Miniaturas listas.", "ok"); await api.presets(true).catch(() => {}); ctx.irA("inicio"); }
        }, 2000);
        limpiezas.push(() => clearInterval(sondeo));
      };
    }).catch(() => { franja.remove(); });
  }

  /* Ejemplos: destacados 16:9, verticales 9:16 y una sección por categoría */
  const conMini = plantillas.filter((p) => p.miniatura);
  if (presets && presets.length) {
    const videos = presets.filter((p) => tipoLocal(p.preview_tipo || p.tipo) === "video" && p.preview);
    const porCat = (c) => videos.filter((p) => p.categoria === c);
    const destacados = intercalar([porCat("marketing_studio"), porCat("what_if"), porCat("viral")], 16);
    const usados = new Set(destacados);
    const verticales = [...porCat("viral"), ...videos.filter((p) => p.categoria !== "viral")].filter((p) => !usados.has(p)).slice(0, 24);
    verticales.forEach((p) => usados.add(p));

    if (destacados.length) {
      pagina.append(carrusel({
        titulo: "Destacados", sub: "Ejemplos en video para inspirarte", lista: destacados, inicial: 6, clase: "pista-grande",
        hacer: (p) => tarjetaPreset(p, { formato: "16 / 9", tituloSiempre: true, sub: nombreCategoria(p.categoria) }),
      }));
    }
    if (verticales.length) {
      pagina.append(carrusel({
        titulo: "Verticales", sub: "Videos cortos 9:16 para redes", lista: verticales, inicial: 10, clase: "pista-vertical",
        hacer: (p) => tarjetaPreset(p, { formato: "9 / 16", tituloSiempre: true }),
      }));
    }

    const resto = presets.filter((p) => !usados.has(p));
    const cats = [...new Set(resto.map((p) => p.categoria || ""))]
      .sort((a, b) => (ORDEN_CATEGORIAS.indexOf(a) + 1 || 99) - (ORDEN_CATEGORIAS.indexOf(b) + 1 || 99));
    for (const c of cats) {
      const lista = resto.filter((p) => (p.categoria || "") === c);
      if (lista.length) pagina.append(masonrySeccion({ titulo: nombreCategoria(c), sub: subCategoria(c), lista, hacer: (p) => tarjetaPreset(p) }));
    }
  }

  /* Plantillas locales con miniatura: sección propia (sin referencia: son recetas de texto) */
  if (conMini.length) {
    pagina.append(masonrySeccion({
      titulo: "Plantillas", sub: "Recetas de la casa para empezar rápido", lista: conMini,
      hacer: (p) => {
        const destino = p.categoria === "imagen" ? "imagen" : "video";
        const usar = () => ctx.irA(destino, { prompt: p.prompt, modelo: modeloDirecto(destino, p.modelo_sugerido) });
        return tarjetaVista({
          url: p.miniatura, tipo: "imagen", titulo: p.nombre, sub: destino === "video" ? "Plantilla de video" : "Plantilla", semilla: p.id,
          etiquetaAbrir: `Ver plantilla ${p.nombre}`, nombreRecrear: "Usar plantilla",
          onAbrir: () => verMedio({ url: p.miniatura, tipo: "imagen", titulo: p.nombre, texto: p.prompt, onRecrear: usar }),
          onRecrear: usar,
        });
      },
    }));
  }

  /* Plantillas sin miniatura y sin ejemplos: lista compacta */
  if (!(presets && presets.length) && !conMini.length && sinMini.length) {
    pagina.append(el("section", { class: "seccion", "aria-labelledby": "pla-titulo" },
      el("div", { class: "seccion-cabeza" }, el("div", { class: "seccion-textos" }, el("h2", { id: "pla-titulo", class: "seccion-titulo" }, "Plantillas"))),
      el("ul", { class: "lista-plantillas" }, sinMini.map((p) => {
        const destino = p.categoria === "imagen" ? "imagen" : "video";
        return el("li", {}, el("button", { class: "fila-plantilla", type: "button", onclick: () => ctx.irA(destino, { prompt: p.prompt, modelo: modeloDirecto(destino, p.modelo_sugerido) }) },
          el("span", { class: "insignia" }, icono(destino), destino === "video" ? "Video" : "Imagen"),
          el("span", { class: "fila-plantilla-txt" }, el("strong", {}, p.nombre), el("small", {}, p.prompt)),
          el("span", { class: "fila-plantilla-usar" }, "Usar")));
      }))));
  }

  /* Tus generaciones en Higgsfield (con prompt: se pueden recrear) */
  if (presets) {
    const grilla = masonry(columnasExplorar);
    limpiezas.push(() => grilla.soltar());
    const btnMas = el("button", { class: "btn", type: "button", hidden: true }, "Cargar más generaciones");
    const cab = cabecera("Tus generaciones en Higgsfield", "Lo que ya creaste allá, listo para recrear aquí");
    const seccion = el("section", { class: "seccion", "aria-labelledby": cab.id }, cab.nodo, grilla, el("div", {}, btnMas));
    pagina.append(seccion);
    const cursores = { video: "", image: "" };
    let items = [];
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
          const titulo = g.modelo || "Higgsfield";
          g._tarjeta = tarjetaVista({
            url: g.url, tipo, miniatura: g.miniatura, titulo, semilla: g.id, etiquetaAbrir: `Ver generación de ${titulo}`,
            onAbrir: () => verMedio({ url: g.url, tipo, titulo: `Generación de ${titulo}`, texto: g.prompt, onRecrear: () => recrearGaleria(g) }),
            onRecrear: () => recrearGaleria(g),
          });
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
    const cab = cabecera("Tus generaciones", "Lo que has creado en PonchoStudio", el("a", { class: "btn btn-chico", href: "#/biblioteca" }, "Ver biblioteca"));
    pagina.append(el("section", { class: "seccion", "aria-labelledby": cab.id }, cab.nodo, grilla));
    grilla.poner(trabajos.map((t) => tarjetaMedio(t, { demo, onAbrir: (tt) => abrirVisor(tt, { ...acc, demo }), onRecrear: acc.onRecrear })));
  }

  return () => limpiezas.forEach((f) => f());
}
