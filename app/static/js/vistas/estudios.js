// Estudios: flujos guiados que arman el prompt y precargan Video o Imagen.
import { api } from "../api.js";
import { el, icono, toast, dropzone, modal } from "../ui.js";

function selector(id, etiqueta, opciones, valor) {
  const s = el("select", { class: "entrada", id },
    opciones.map((o) => el("option", { value: o.valor, selected: o.valor === valor }, o.texto)));
  return { nodo: el("div", { class: "campo" }, el("label", { for: id }, etiqueta), s), leer: () => s.value, sel: s };
}
function texto(id, etiqueta, placeholder, multilinea = false) {
  const i = multilinea
    ? el("textarea", { class: "entrada", id, rows: 3, placeholder })
    : el("input", { class: "entrada", id, type: "text", placeholder });
  return { nodo: el("div", { class: "campo" }, el("label", { for: id }, etiqueta), i), leer: () => i.value.trim(), input: i };
}
const o = (valor, texto) => ({ valor, texto: texto || valor });

const PLANOS = [o("plano general abierto", "Plano general"), o("plano medio", "Plano medio"), o("primer plano", "Primer plano"), o("plano detalle", "Detalle")];
const LENTES = [o("lente 24 mm, gran angular", "24 mm gran angular"), o("lente 35 mm", "35 mm"), o("lente 50 mm", "50 mm"), o("lente 85 mm, fondo desenfocado", "85 mm retrato"), o("lente anamórfico, destellos horizontales", "Anamórfico")];
const LUCES = [o("luz de hora dorada", "Hora dorada"), o("noche con neón violeta y lluvia", "Noche neón"), o("luz suave de ventana", "Luz de ventana"), o("contraluz dramático", "Contraluz")];

export async function montar(raiz, ctx) {
  const presets = await api.presets().catch(() => ({ camaras: [], estilos: [] }));
  const camaras = presets.camaras || [];
  const opcCam = [o("", "Sin movimiento"), ...camaras.map((c) => o(c.id, c.nombre))];

  const estudios = [
    {
      id: "cine", nombre: "Cine", destino: "video", etiqueta: "Video 16:9 · 1080p",
      descripcion: "Escena con lenguaje de cine: eliges plano, cámara y lente.",
      campos: () => {
        const escena = texto("cine-escena", "¿Qué pasa en la escena?", "Una mujer cruza una calle mojada en Medellín y mira atrás.", true);
        const plano = selector("cine-plano", "Plano", PLANOS, "plano medio");
        const cam = selector("cine-cam", "Movimiento de cámara", opcCam, camaras[0] ? camaras[0].id : "");
        const lente = selector("cine-lente", "Lente", LENTES, "lente 35 mm");
        const luz = selector("cine-luz", "Luz", LUCES, "luz de hora dorada");
        return {
          nodos: [escena.nodo, el("div", { class: "estudio-campos dos" }, plano.nodo, cam.nodo, lente.nodo, luz.nodo)],
          armar: () => {
            if (!escena.leer()) { escena.input.focus(); return null; }
            return {
              prompt: `${escena.leer()} ${cap(plano.leer())}, ${lente.leer()}, ${luz.leer()}. Look cinematográfico, grano de película fino, color natural.`,
              modelo: "seedance-2.5", camara: cam.leer() || null,
              ajustes: { formato: "16:9", resolucion: "1080p", duracion: 8, audio: true, variantes: 1 },
            };
          },
        };
      },
    },
    {
      id: "producto", nombre: "Producto y anuncio", destino: "imagen", etiqueta: "Imagen o video corto",
      descripcion: "Tu producto en un set limpio, listo para redes o tienda.",
      campos: () => {
        let foto = null;
        const producto = texto("prod-nombre", "Producto", "Botella de café de origen, etiqueta kraft");
        const set = selector("prod-set", "Escenario", [o("fondo de estudio liso con sombra suave", "Estudio liso"), o("sobre mármol con luz de mañana", "Mármol"), o("en una cocina colombiana real", "Cocina"), o("flotando con salpicaduras congeladas", "Salpicadura")], "fondo de estudio liso con sombra suave");
        const salida = selector("prod-salida", "Salida", [o("imagen", "Foto 1:1"), o("video", "Video 9:16 de 6 s")], "imagen");
        const zona = dropzone({ texto: "Foto del producto (opcional)", subir: (a) => api.subir(a), onCambio: (u) => { foto = u; } });
        return {
          nodos: [producto.nodo, el("div", { class: "estudio-campos dos" }, set.nodo, salida.nodo), zona],
          armar: () => {
            if (!producto.leer()) { producto.input.focus(); return null; }
            const base = `Foto publicitaria de ${producto.leer()}, ${set.leer()}, iluminación de estudio, nitidez alta, colores fieles, sin texto.`;
            if (salida.leer() === "video") {
              return { destino: "video", prompt: base + " La cámara gira despacio alrededor del producto.", modelo: "seedance-2.5",
                ajustes: { formato: "9:16", resolucion: "1080p", duracion: 6, audio: false }, entradas: foto ? { primer_cuadro: foto } : null };
            }
            return { prompt: base, modelo: "gpt-image-2", ajustes: { formato: "1:1", calidad: "high", variantes: 2 }, entradas: foto ? { referencias: [foto] } : null };
          },
        };
      },
    },
    {
      id: "videoclip", nombre: "Videoclip vertical", destino: "video", etiqueta: "Video 9:16 · con audio",
      descripcion: "Para artista urbano: toma vertical con ritmo, lista para Reels y TikTok.",
      campos: () => {
        const artista = texto("clip-artista", "Artista y look", "Rapero con chaqueta oversize y cadena plateada");
        const lugar = selector("clip-lugar", "Lugar", [o("una calle de barrio de noche con luces de neón", "Calle de noche"), o("una azotea con la ciudad de fondo al atardecer", "Azotea"), o("un estudio con luces violeta y humo", "Estudio con humo"), o("un parqueadero con carros tuneados", "Parqueadero")], "una calle de barrio de noche con luces de neón");
        const ritmo = selector("clip-ritmo", "Ritmo", [o("cortes rápidos al ritmo, energía alta", "Rápido"), o("movimiento fluido y lento, ambiente relajado", "Lento"), o("cámara en mano siguiendo al artista", "Cámara en mano")], "cortes rápidos al ritmo, energía alta");
        return {
          nodos: [artista.nodo, el("div", { class: "estudio-campos dos" }, lugar.nodo, ritmo.nodo)],
          armar: () => {
            if (!artista.leer()) { artista.input.focus(); return null; }
            return {
              prompt: `Videoclip vertical de reguetón: ${artista.leer()} canta y baila en ${lugar.leer()}. ${cap(ritmo.leer())}. Contraste alto, colores fríos, piel con tono natural.`,
              modelo: "seedance-2.5",
              ajustes: { formato: "9:16", resolucion: "720p", duracion: 10, audio: true, variantes: 1 },
            };
          },
        };
      },
    },
    {
      id: "retrato", nombre: "Retrato y personaje", destino: "imagen", etiqueta: "Imagen 2:3 · misma cara",
      descripcion: "Un personaje que se mantiene igual en varias fotos. Sube su cara como referencia.",
      campos: () => {
        let cara = null;
        const quien = texto("ret-quien", "Personaje", "Mujer de 30 años, pelo rizado, aretes dorados");
        const escena = selector("ret-escena", "Escena", [o("retrato de estudio con fondo gris", "Estudio"), o("caminando por una plaza de pueblo", "Pueblo"), o("en un café con luz de ventana", "Café"), o("en la playa al atardecer", "Playa")], "retrato de estudio con fondo gris");
        const zona = dropzone({ texto: "Foto de la cara", subir: (a) => api.subir(a), onCambio: (u) => { cara = u; } });
        return {
          nodos: [quien.nodo, escena.nodo, zona, el("p", { class: "nota" }, "Usa la misma foto en cada generación para que la cara no cambie.")],
          armar: () => {
            if (!quien.leer()) { quien.input.focus(); return null; }
            return {
              prompt: `${quien.leer()}, ${escena.leer()}. Mismo rostro y rasgos que la referencia, piel natural sin tono amarillo, foto realista, lente 85 mm.`,
              modelo: "gpt-image-2",
              ajustes: { formato: "2:3", calidad: "high", variantes: 2 },
              entradas: cara ? { referencias: [cara] } : null,
            };
          },
        };
      },
    },
  ];

  const pagina = el("div", { class: "pagina vista pagina-estudios" },
    el("header", { class: "vista-cabeza" },
      el("h1", { class: "vista-titulo" }, "Estudios"),
      el("p", { class: "vista-sub" }, "Atajos guiados. Llenas pocas cosas y te dejo el generador listo para revisar.")),
    el("div", { class: "estudios-grilla" }, estudios.map((e) => tarjetaEstudio(e, ctx))));
  raiz.append(pagina);
  // Desde Explorar ("Cine") llega precargado el estudio a abrir.
  const pedido = ctx.precarga && ctx.precarga.estudio;
  if (pedido) {
    const btn = document.getElementById(`estudio-${pedido}`);
    if (btn) requestAnimationFrame(() => btn.click());
  }
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Arte de cada estudio: dibujo sencillo en SVG (sin imágenes externas, nada de colores fuertes).
const ARTES = {
  cine: `<rect x="12" y="52" width="176" height="99" rx="6" fill="#0b0b0f" stroke="#E0AAFF" stroke-opacity=".6" stroke-width="1.5"/>
    <circle cx="128" cy="96" r="15" fill="#B15CFF" opacity=".35"/><ellipse cx="128" cy="96" rx="70" ry="1.6" fill="#E0AAFF" opacity=".6"/>
    <path d="M13 150 L52 112 L82 134 L118 108 L150 130 L187 114 V150Z" fill="#1c1c24"/>
    <rect x="13" y="53" width="174" height="12" fill="#000"/><rect x="13" y="138" width="174" height="12" fill="#000"/>
    <g fill="#E0AAFF" opacity=".35"><rect x="20" y="164" width="10" height="6" rx="1"/><rect x="36" y="164" width="10" height="6" rx="1"/><rect x="52" y="164" width="10" height="6" rx="1"/><rect x="138" y="164" width="10" height="6" rx="1"/><rect x="154" y="164" width="10" height="6" rx="1"/><rect x="170" y="164" width="10" height="6" rx="1"/></g>`,
  producto: `<ellipse cx="100" cy="158" rx="58" ry="11" fill="#000" opacity=".5"/><ellipse cx="100" cy="150" rx="46" ry="8" fill="#B15CFF" opacity=".2"/>
    <rect x="76" y="62" width="48" height="86" rx="12" fill="#1c1c24" stroke="#E0AAFF" stroke-opacity=".55" stroke-width="1.5"/>
    <rect x="88" y="44" width="24" height="20" rx="5" fill="#1c1c24" stroke="#E0AAFF" stroke-opacity=".55" stroke-width="1.5"/>
    <rect x="82" y="90" width="36" height="28" rx="4" fill="#B15CFF" opacity=".5"/>`,
  videoclip: `<rect x="56" y="22" width="88" height="156" rx="12" fill="#0b0b0f" stroke="#E0AAFF" stroke-opacity=".6" stroke-width="1.5"/>
    <g fill="#B15CFF" opacity=".75"><rect x="72" y="118" width="7" height="30" rx="3"/><rect x="85" y="100" width="7" height="48" rx="3"/><rect x="98" y="110" width="7" height="38" rx="3"/><rect x="111" y="88" width="7" height="60" rx="3"/><rect x="124" y="112" width="7" height="36" rx="3"/></g>
    <circle cx="100" cy="64" r="14" fill="none" stroke="#E0AAFF" stroke-opacity=".5" stroke-width="1.5"/>`,
  retrato: `<circle cx="100" cy="82" r="30" fill="#1c1c24" stroke="#E0AAFF" stroke-opacity=".55" stroke-width="1.5"/>
    <path d="M38 200 C40 144 70 124 100 124 C130 124 160 144 162 200Z" fill="#1c1c24" stroke="#E0AAFF" stroke-opacity=".55" stroke-width="1.5"/>
    <circle cx="100" cy="82" r="44" fill="none" stroke="#B15CFF" stroke-opacity=".35" stroke-dasharray="3 5"/>`,
};
function arteSVG(id) {
  const caja = el("span", { class: "estudio-arte", "aria-hidden": "true" });
  caja.innerHTML = `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">${ARTES[id] || ""}</svg>`;
  return caja;
}

function tarjetaEstudio(e, ctx) {
  let cache = null;
  const abrirForma = () => {
    cache = cache || e.campos();
    const { nodos, armar } = cache;
    const destinoTxt = e.destino === "video" ? "Video" : "Imagen";
    const btn = el("button", { class: "btn btn-primario", type: "button" }, `Preparar en ${destinoTxt}`);
    const cerrarBtn = el("button", { class: "btn-icono estudio-cerrar", type: "button", "aria-label": "Cerrar" }, icono("x"));
    const forma = el("div", { class: "estudio-forma" },
      el("div", { class: "estudio-forma-cab" },
        el("div", {}, el("span", { class: "insignia insignia-violeta" }, e.etiqueta), el("h2", { id: `est-${e.id}` }, e.nombre), el("p", {}, e.descripcion)),
        cerrarBtn),
      el("div", { class: "estudio-campos" }, nodos),
      el("div", { class: "modal-acciones" }, btn));
    const cerrar = modal(forma, { etiqueta: e.nombre, clase: "modal-estudio" });
    cerrarBtn.onclick = () => cerrar();
    btn.onclick = () => {
      const p = armar();
      if (!p) { toast("Completa el primer campo para armar el prompt.", "info"); return; }
      const destino = p.destino || e.destino;
      delete p.destino;
      if (!p.entradas) delete p.entradas;
      cerrar();
      ctx.irA(destino, p);
    };
  };
  return el("button", { class: `estudio estudio-${e.id}`, type: "button", id: `estudio-${e.id}`, onclick: abrirForma },
    arteSVG(e.id),
    el("span", { class: "insignia tag" }, e.etiqueta),
    el("span", { class: "estudio-texto" },
      el("strong", {}, e.nombre),
      el("small", {}, e.descripcion),
      el("span", { class: "estudio-ir" }, "Abrir estudio")));
}
