// Explorar: como el home de Higgsfield. Tarjetas grandes de herramientas, masonry de
// ejemplos reales (presets de Higgsfield) con video al pasar el mouse, tu galería de
// Higgsfield y tus generaciones locales. Sin Higgsfield: aviso + plantillas locales.
import { api } from "../api.js";
import { el, limpiar, icono, arte, modal, toast, usd, confirmar, tarjetaMedio, abrirVisor, masonry, columnasExplorar } from "../ui.js";
import { accionesVisor } from "../generador.js";
import { tarjetaVista, verMedio } from "../tarjetas.js";

const DEFECTO = { video: "seedance-2.5", imagen: "gpt-image-2" };
const tipoLocal = (t) => (t === "image" || t === "imagen" ? "imagen" : "video");

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

  const pagina = el("div", { class: "pagina pagina-explorar" }, el("h1", { class: "solo-lector" }, "Explorar"));
  raiz.append(pagina);

  /* Aviso discreto si Higgsfield no está conectado */
  if (!presets) {
    pagina.append(el("div", { class: "franja-aviso" },
      el("span", {}, hfConectado ? "Higgsfield no respondió. Los ejemplos vuelven cuando responda." : "Conecta Higgsfield para ver ejemplos reales con video y recrearlos sin gastar créditos."),
      hfConectado ? el("button", { class: "btn btn-chico", type: "button", onclick: () => ctx.irA("inicio") }, "Volver a intentar")
        : el("a", { class: "btn btn-chico btn-primario", href: api.rutaConectarHiggsfield }, icono("enlace"), "Conectar Higgsfield")));
  }

  /* Franja: crear miniaturas de plantillas con ChatGPT */
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

  /* Masonry principal: ejemplos de Higgsfield + plantillas con miniatura */
  const conMini = plantillas.filter((p) => p.miniatura);
  const items = [
    ...(presets || []).map((p) => ({ origen: "hf", tipo: tipoLocal(p.tipo), categoria: p.categoria, p })),
    ...conMini.map((p) => ({ origen: "local", tipo: p.categoria === "imagen" ? "imagen" : "video", categoria: "Plantillas", p })),
  ];
  if (items.length) {
    const categorias = [...new Set(items.map((x) => x.categoria).filter(Boolean))];
    let filtro = "todo";
    const grilla = masonry(columnasExplorar);
    limpiezas.push(() => grilla.soltar());
    const pestanas = el("div", { class: "pestanas", role: "group", "aria-label": "Filtrar ejemplos" });
    for (const x of items) {
      const p = x.p;
      if (x.origen === "hf") {
        const tipo = tipoLocal(p.preview_tipo || p.tipo);
        x.tarjeta = tarjetaVista({
          url: p.preview, tipo, titulo: p.nombre, sub: p.categoria, semilla: p.id, etiquetaAbrir: `Ver ejemplo ${p.nombre}`,
          onAbrir: () => verMedio({ url: p.preview, tipo, titulo: p.nombre, texto: p.prompt, onRecrear: (b) => recrearPreset(p, b) }),
          onRecrear: (b) => recrearPreset(p, b),
        });
      } else {
        const usar = () => ctx.irA(x.tipo, { prompt: p.prompt, modelo: modeloDirecto(x.tipo, p.modelo_sugerido) });
        x.tarjeta = tarjetaVista({
          url: p.miniatura, tipo: "imagen", titulo: p.nombre, sub: x.tipo === "video" ? "Plantilla de video" : "Plantilla", semilla: p.id,
          etiquetaAbrir: `Ver plantilla ${p.nombre}`,
          onAbrir: () => verMedio({ url: p.miniatura, tipo: "imagen", titulo: p.nombre, texto: p.prompt, onRecrear: usar }),
          onRecrear: usar,
        });
      }
    }
    const pintar = () => {
      pestanas.replaceChildren(...[["todo", "Todo"], ["video", "Video"], ["imagen", "Imagen"], ...categorias.map((c) => [c, c])].map(([id, txt]) =>
        el("button", { class: "pill", type: "button", "aria-pressed": String(filtro === id), onclick: () => { filtro = id; pintar(); } }, txt)));
      grilla.poner(items.filter((x) => filtro === "todo" || x.tipo === filtro || x.categoria === filtro).map((x) => x.tarjeta));
    };
    pintar();
    pagina.append(el("section", { class: "seccion", "aria-label": "Ejemplos para recrear" }, pestanas, grilla));
  }

  /* Plantillas sin miniatura y sin Higgsfield: lista compacta */
  if (!items.length && sinMini.length) {
    pagina.append(el("section", { class: "seccion", "aria-labelledby": "pla-titulo" },
      el("h2", { id: "pla-titulo" }, "Plantillas"),
      el("ul", { class: "lista-plantillas" }, sinMini.map((p) => {
        const destino = p.categoria === "imagen" ? "imagen" : "video";
        return el("li", {}, el("button", { class: "fila-plantilla", type: "button", onclick: () => ctx.irA(destino, { prompt: p.prompt, modelo: modeloDirecto(destino, p.modelo_sugerido) }) },
          el("span", { class: "insignia" }, icono(destino), destino === "video" ? "Video" : "Imagen"),
          el("span", { class: "fila-plantilla-txt" }, el("strong", {}, p.nombre), el("small", {}, p.prompt)),
          el("span", { class: "fila-plantilla-usar" }, "Usar")));
      }))));
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
