import { CONFIG } from './config.js';
import { abrir, poner, todos, borrar, obtener, limpiar } from './db.js';
import { parsearPegado } from './parser.js';
import { comparar } from './orden.js';
import { crearSync } from './sync.js';
import { conectar, conectado } from './google.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Orígenes que por regla operativa nunca llevan Bolsa de Seguridad (BS)
const ORIGEN_SIN_BS_RE = /^(cross|xd_drop_off|xp_drop_off|drop_off)/i;
const PASOS_ZOOM = [1, 1.5, 2];

// ---------- Estado ----------
const estado_app = {
  paquetes: [],
  fotos: [],
  actual: null,
  validador: '',
  cajaVacia: false,
  previo: null,
  stream: null,
  capturador: null,
  capturando: false,
  flash: false,
  zoom: 1,
  zoomNiveles: [1],
  filtro: 'todos',
  sync: 'ok',
  pantalla: 'datos',
};

const sync = crearSync(estado_app, () => {
  renderEstado();
  renderTabla();
  if (estado_app.pantalla === 'camara') renderCamara();
});

const fotosDe = (id) => estado_app.fotos.filter((f) => f.paqueteId === id);
const porId = (id) => estado_app.paquetes.find((p) => p.id === id);
const tieneFoto = (p) => fotosDe(p.id).length > 0;
const disponible = (p) =>
  p.soloId || p.estatus === 'in_container' || p.estatus === 'ready_to_deliver' || !!p.segFase;

// '' (blanco) | 'disp' (verde) | 'tomado' (amarillo) | 'en-bolsa' (naranja) | 'valido' (cyan)
function estadoVisual(p) {
  const conFoto = tieneFoto(p);
  if (p.tipo !== 'segregado' || (p.sinBS && p.segFase !== 'tomado')) {
    return conFoto ? 'valido' : (disponible(p) ? 'disp' : '');
  }
  if (p.segFase === 'regresado' && conFoto) return 'valido';
  if (conFoto) return 'en-bolsa';
  if (p.segFase === 'tomado') return 'tomado';
  return disponible(p) ? 'disp' : '';
}

const ordenada = () => {
  const o = [...estado_app.paquetes].sort(comparar);
  return [...o.filter(disponible), ...o.filter((p) => !disponible(p))];
};
const cola = () => ordenada().filter(disponible);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2500);
}

// ---------- Acciones de Segregado ----------
async function cambiarFaseSegregado(p, nuevaFase) {
  if (!p || p.tipo !== 'segregado') return;
  p.segFase = nuevaFase;
  await poner('paquetes', p);
  renderTabla();
  if (estado_app.pantalla === 'camara') renderCamara();
}

async function alternarSinBS(p) {
  if (!p || p.tipo !== 'segregado') return;
  p.sinBS = !p.sinBS;
  await poner('paquetes', p);
  renderTabla();
  if (estado_app.pantalla === 'camara') renderCamara();
}

async function regresarTodosNaranjas() {
  const naranjas = estado_app.paquetes.filter((p) => estadoVisual(p) === 'en-bolsa');
  if (!naranjas.length) return;
  if (!confirm(`¿Marcar ${naranjas.length} paquete(s) en bolsa como regresados al baker?`)) return;
  for (const p of naranjas) p.segFase = 'regresado';
  await Promise.all(naranjas.map((p) => poner('paquetes', p)));
  renderTabla();
  if (estado_app.pantalla === 'camara') renderCamara();
  toast(`${naranjas.length} paquetes marcados en baker ✓`);
}

// ---------- Pantalla de datos ----------
async function cargarLista(reemplazar) {
  const tipoElegido = $('#tipo').value;
  const parseados = parsearPegado($('#pegado').value);
  if (!parseados.length) return toast('No encontré IDs válidas');

  const previos = new Map(estado_app.paquetes.map((p) => [p.id, p]));
  if (reemplazar) {
    await limpiar('paquetes');
    estado_app.paquetes = [];
  }

  const mapa = new Map(estado_app.paquetes.map((p) => [p.id, p]));
  for (const nuevo of parseados) {
    const ant = previos.get(nuevo.id);
    const autoSinBS = ORIGEN_SIN_BS_RE.test(nuevo.origen || '');
    mapa.set(nuevo.id, {
      ...nuevo,
      tipo: tipoElegido,
      segFase: ant?.tipo === 'segregado' && tipoElegido === 'segregado' ? (ant.segFase || '') : '',
      sinBS: tipoElegido === 'segregado' ? (ant?.sinBS ?? autoSinBS) : false,
    });
  }

  estado_app.paquetes = [...mapa.values()].map((p, i) => ({ ...p, orden: i }));
  await Promise.all(estado_app.paquetes.map((p) => poner('paquetes', p)));
  $('#pegado').value = '';
  $('#panel-carga').open = false;
  renderTabla();
  toast(`${parseados.length} paquetes cargados ✓`);
}

function renderTabla() {
  const lista = ordenada();
  const total = lista.length;
  const enCont = lista.filter(disponible).length;
  const noCont = total - enCont;

  const cDisp    = lista.filter((p) => estadoVisual(p) === 'disp').length;
  const cTomados = lista.filter((p) => estadoVisual(p) === 'tomado').length;
  const cBolsa   = lista.filter((p) => estadoVisual(p) === 'en-bolsa').length;
  const cValidos = lista.filter((p) => estadoVisual(p) === 'valido').length;
  const haySegregado = lista.some((p) => p.tipo === 'segregado');

  $('#resumen-1').textContent = `${total} paq · ${enCont} contenedor · ${noCont} sorting`;
  $('#resumen-2').textContent = haySegregado
    ? `${cValidos} listos · ${cTomados} tomados · ${cBolsa} en bolsa · ${total - cValidos} rest.`
    : `${cValidos} validados · ${total - cValidos} por validar`;

  const btnLote = $('#btn-regresar-todos');
  btnLote.hidden = cBolsa === 0;
  btnLote.textContent = `← Regresar (${cBolsa})`;

  const chips = [
    ['todos', `Todos (${total})`],
    ['disp', `🟢 Baker (${cDisp})`],
    ...(haySegregado ? [
      ['tomado', `🟡 Tomados (${cTomados})`],
      ['en-bolsa', `🟠 En bolsa (${cBolsa})`],
    ] : []),
    ['valido', `🔵 Listos (${cValidos})`],
  ];
  $('#filtros').hidden = total === 0;
  $('#filtros').innerHTML = chips
    .map(([id, txt]) => `<button class="chip ${estado_app.filtro === id ? 'activo' : ''}" data-filtro="${id}">${txt}</button>`)
    .join('');

  const visibles = estado_app.filtro === 'todos'
    ? lista
    : lista.filter((p) => estadoVisual(p) === estado_app.filtro);

  $('#tabla tbody').innerHTML = visibles.map((p) => {
    const est = estadoVisual(p);
    const nFotos = fotosDe(p.id).length;
    let badge = '';
    let accion = nFotos ? `✓ ${nFotos}` : '';

    if (p.tipo === 'segregado') {
      badge = p.sinBS ? `<span class="tag-tipo">SIN BS</span>` : `<span class="tag-tipo">SEG</span>`;
      if (!p.sinBS || p.segFase === 'tomado') {
        if (est === 'en-bolsa') {
          accion = `<button class="btn-seg regresar" data-acc="regresar">← Regresar</button>`;
        } else if (est === 'tomado') {
          accion = `<button class="btn-seg" data-acc="soltar">Soltar</button>`;
        } else if (est !== 'valido') {
          accion = `<button class="btn-seg" data-acc="tomar">+ Tomar</button>`;
        } else {
          accion = `✓ ${nFotos}`;
        }
      }
    }

    return (
      `<tr data-id="${p.id}" class="${est}">` +
      `<td>${p.id}${badge}</td>` +
      `<td>${esc(p.ruta)}</td>` +
      `<td>${esc(p.parada)}</td>` +
      `<td>${esc(p.estatus)}</td>` +
      `<td class="td-acc">${accion}</td></tr>`
    );
  }).join('');
}

// ---------- Cámara: Vista previa ligera + Captura fotográfica de alta resolución ----------
function restriccionesPreview() {
  return {
    facingMode: { ideal: 'environment' },
    aspectRatio: { ideal: 4 / 3 },
    width: { ideal: CONFIG.VIDEO_IDEAL_W },
    height: { ideal: CONFIG.VIDEO_IDEAL_H },
    frameRate: { ideal: 20, max: CONFIG.VIDEO_FPS },
  };
}

async function iniciarCamara() {
  if (estado_app.stream) return;
  try {
    // Sin "max" rígido en width/height para que iOS/Android habiliten el formato fotográfico de 12MP en el sensor,
    // mientras "ideal: 1280x960 @ 24fps" mantiene el video en vivo ligero y rápido.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: restriccionesPreview(),
    });
    if (estado_app.pantalla !== 'camara' || document.hidden) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    estado_app.stream = stream;
    const pista = stream.getVideoTracks()[0];
    const caps = pista.getCapabilities ? pista.getCapabilities() : {};

    // Inicializar capturador fotográfico dedicado del hardware (ISP) si el navegador lo soporta
    estado_app.capturador = null;
    if ('ImageCapture' in window) {
      try {
        const ic = new ImageCapture(pista);
        if (typeof ic.takePhoto === 'function') estado_app.capturador = ic;
      } catch {}
    }

    // Si algún Android abrió el preview por encima de 1080p y ya tenemos ImageCapture independiente, bajamos el video
    const confActual = pista.getSettings ? pista.getSettings() : {};
    if (estado_app.capturador && (confActual.width > 1920 || confActual.height > 1440)) {
      pista.applyConstraints({
        width: { ideal: CONFIG.VIDEO_IDEAL_W, max: 1600 },
        height: { ideal: CONFIG.VIDEO_IDEAL_H, max: 1200 },
        frameRate: { ideal: 20, max: CONFIG.VIDEO_FPS },
      }).catch(() => {});
    }

    // Activar enfoque, exposición y balance de blancos continuos
    const continuo = {};
    if (caps.focusMode?.includes('continuous')) continuo.focusMode = 'continuous';
    if (caps.exposureMode?.includes('continuous')) continuo.exposureMode = 'continuous';
    if (caps.whiteBalanceMode?.includes('continuous')) continuo.whiteBalanceMode = 'continuous';
    if (Object.keys(continuo).length) {
      pista.applyConstraints({ advanced: [continuo] }).catch(() => {});
    }

    // Configurar botón de Flash (Torch)
    estado_app.flash = false;
    const btnFlash = $('#btn-flash');
    btnFlash.hidden = !caps.torch;
    btnFlash.classList.remove('encendido');
    btnFlash.textContent = 'Flash: OFF';

    // Configurar botón de Zoom óptico/sensor (1x / 1.5x / 2x) para etiquetas pequeñas sin acercar de más el lente
    estado_app.zoom = 1;
    const minZ = caps.zoom?.min ?? 1;
    const maxZ = caps.zoom?.max ?? 1;
    estado_app.zoomNiveles = PASOS_ZOOM.filter((z) => z >= minZ && z <= maxZ);
    const btnZoom = $('#btn-zoom');
    btnZoom.hidden = estado_app.zoomNiveles.length < 2;
    btnZoom.classList.remove('activo');
    btnZoom.textContent = '1x';

    $('#video').srcObject = stream;
    await $('#video').play();
  } catch (e) {
    toast('No se pudo abrir la cámara: ' + e.message);
  }
}

async function alternarFlash() {
  const pista = estado_app.stream?.getVideoTracks()[0];
  if (!pista) return;
  try {
    estado_app.flash = !estado_app.flash;
    await pista.applyConstraints({ advanced: [{ torch: estado_app.flash }] });
    $('#btn-flash').classList.toggle('encendido', estado_app.flash);
    $('#btn-flash').textContent = estado_app.flash ? 'Flash: ON' : 'Flash: OFF';
  } catch {
    estado_app.flash = false;
    toast('Este lente no permitió activar el flash');
  }
}

async function alternarZoom() {
  const pista = estado_app.stream?.getVideoTracks()[0];
  if (!pista || estado_app.zoomNiveles.length < 2) return;
  const idx = (estado_app.zoomNiveles.indexOf(estado_app.zoom) + 1) % estado_app.zoomNiveles.length;
  const nuevoZoom = estado_app.zoomNiveles[idx];
  try {
    await pista.applyConstraints({ advanced: [{ zoom: nuevoZoom }] });
    estado_app.zoom = nuevoZoom;
    const btnZoom = $('#btn-zoom');
    btnZoom.textContent = `${nuevoZoom}x`;
    btnZoom.classList.toggle('activo', nuevoZoom > 1);
  } catch {}
}

// Re-enfocar al tocar el visor de video (útil al pasar de caja grande a texto diminuto de etiqueta)
async function enfocarAlTocar(e) {
  const pista = estado_app.stream?.getVideoTracks()[0];
  if (!pista || !$('#previo').hidden) return;

  const rect = $('#pantalla-camara').getBoundingClientRect();
  const aro = $('#foco-aro');
  aro.style.left = `${e.clientX - rect.left}px`;
  aro.style.top = `${e.clientY - rect.top}px`;
  aro.hidden = false;
  aro.style.transform = 'scale(1.25)';
  requestAnimationFrame(() => (aro.style.transform = 'scale(1)'));
  clearTimeout(enfocarAlTocar.t);
  enfocarAlTocar.t = setTimeout(() => (aro.hidden = true), 900);

  const caps = pista.getCapabilities ? pista.getCapabilities() : {};
  try {
    const vRect = $('#video').getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - vRect.left) / vRect.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - vRect.top) / vRect.height));
    const foco = {};
    if (caps.pointsOfInterest) foco.pointsOfInterest = [{ x: nx, y: ny }];
    if (caps.focusMode?.includes('single-shot')) foco.focusMode = 'single-shot';
    else if (caps.focusMode?.includes('continuous')) foco.focusMode = 'continuous';

    if (Object.keys(foco).length) {
      await pista.applyConstraints({ advanced: [foco] });
      // Regresar a enfoque continuo tras fijar foco en la etiqueta
      if (foco.focusMode === 'single-shot' && caps.focusMode?.includes('continuous')) {
        setTimeout(() => {
          pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }, 1200);
      }
    }
  } catch {}
}

function detenerCamara() {
  estado_app.stream?.getTracks().forEach((t) => t.stop());
  estado_app.stream = null;
  estado_app.capturador = null;
  estado_app.capturando = false;
  estado_app.flash = false;
  estado_app.zoom = 1;
  $('#btn-flash')?.classList.remove('encendido');
  $('#btn-zoom')?.classList.remove('activo');
  $('#btn-disparo')?.classList.remove('capturando');
}

let urls = [];
function renderCamara() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const p = porId(estado_app.actual);
  const est = p ? estadoVisual(p) : '';

  $('#dp-id').textContent = p?.id ?? 'Sin paquete';
  $('#dp-desc').textContent = p?.descripcion ?? '';
  $('#dp-ruta').textContent = p ? [p.ruta, p.parada && `parada ${p.parada}`].filter(Boolean).join(' · ') : '';
  $('#dp-extra').textContent = p ? [p.origen, p.embalaje, p.estatus, p.monto && `$${p.monto}`].filter(Boolean).join(' · ') : '';

  const etiquetasEst = {
    disp: '🟢 En baker',
    tomado: '🟡 Tomado (en mesa)',
    'en-bolsa': '🟠 En bolsa · falta regresar',
    valido: '🔵 Completado',
  };
  $('#dp-validacion').textContent = p
    ? `${p.tipo.toUpperCase()}${p.tipo === 'segregado' && p.sinBS ? ' (SIN BS)' : ''} · ${etiquetasEst[est] || 'No contenerizado'}`
    : '';

  $('#chk-vacia').checked = estado_app.cajaVacia;

  const barraSeg = $('#barra-segregado');
  barraSeg.hidden = !p || p.tipo !== 'segregado';
  if (p?.tipo === 'segregado') {
    const btnFase = $('#btn-seg-fase');
    btnFase.className = est;
    if (est === 'en-bolsa') {
      btnFase.textContent = '← Marcar regresado al baker';
      btnFase.hidden = false;
    } else if (est === 'tomado') {
      btnFase.textContent = '🟡 Tomado (toca p/ soltar)';
      btnFase.hidden = false;
    } else if (est === 'valido' && !p.sinBS) {
      btnFase.textContent = '🔵 En baker (deshacer)';
      btnFase.hidden = false;
    } else if (!p.sinBS) {
      btnFase.textContent = '+ Marcar tomado';
      btnFase.hidden = false;
    } else {
      btnFase.hidden = true;
    }

    const btnSinBS = $('#btn-sin-bs');
    btnSinBS.classList.toggle('activo', !!p.sinBS);
    btnSinBS.textContent = p.sinBS ? '✓ Sin BS: SÍ' : 'Sin BS: NO';
  }

  const fs = p ? fotosDe(p.id) : [];
  $('#miniaturas').innerHTML = '';
  for (const f of fs) {
    const d = document.createElement('div');
    d.className = 'mini';
    const fuenteMini = f.miniBlob || f.blob;
    if (fuenteMini) {
      const u = URL.createObjectURL(fuenteMini);
      urls.push(u);
      d.innerHTML = `<img src="${u}" alt="">`;
    } else {
      d.textContent = '✓';
    }
    if (f.estado === 'pendiente') d.insertAdjacentHTML('beforeend', `<b data-uid="${f.uid}">✕</b>`);
    $('#miniaturas').append(d);
  }
  $('#btn-listo').hidden = !fs.length;
}

function ir(id) {
  estado_app.actual = id;
  estado_app.cajaVacia = false;
  renderCamara();
}

function paso(d) {
  const c = cola();
  if (!c.length) return;
  let i = c.findIndex((p) => p.id === estado_app.actual);
  i = i < 0 ? (d > 0 ? 0 : c.length - 1) : (i + d + c.length) % c.length;
  ir(c[i].id);
}

function siguientePendiente() {
  const c = cola();
  if (!c.length) return;
  const i = Math.max(0, c.findIndex((p) => p.id === estado_app.actual));

  for (let k = 1; k <= c.length; k++) {
    const p = c[(i + k) % c.length];
    if (estadoVisual(p) === 'tomado') return ir(p.id);
  }
  for (let k = 1; k <= c.length; k++) {
    const p = c[(i + k) % c.length];
    if (!tieneFoto(p)) return ir(p.id);
  }
  toast('No quedan pendientes de foto ✓');
}

// ---------- Procesamiento de captura de alta calidad ----------
const conLimiteTiempo = (promesa, ms) =>
  Promise.race([
    promesa,
    new Promise((_, mal) => setTimeout(() => mal(new Error('timeout')), ms)),
  ]);

function canvasABlob(canvas, tipo, calidad) {
  return new Promise((ok) => canvas.toBlob(ok, tipo, calidad));
}

// Si el sensor entrega ~12 MP (<= FOTO_MAX_PX y <= FOTO_MAX_BYTES), conserva el JPEG original del ISP sin recomprimir.
// Si entrega 50 MP / 100 MP crudos, lo escala con suavizado alto a FOTO_MAX_PX y JPEG 0.92.
async function normalizarFoto(blobCrudo) {
  const bmp = await createImageBitmap(blobCrudo);
  try {
    const ladoMayor = Math.max(bmp.width, bmp.height);
    if (
      blobCrudo.type === 'image/jpeg' &&
      ladoMayor <= CONFIG.FOTO_MAX_PX &&
      blobCrudo.size <= CONFIG.FOTO_MAX_BYTES
    ) {
      return { blob: blobCrudo, ancho: bmp.width, alto: bmp.height };
    }

    const k = Math.min(1, CONFIG.FOTO_MAX_PX / ladoMayor);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);

    const blob = await canvasABlob(c, 'image/jpeg', CONFIG.FOTO_CALIDAD);
    return { blob: blob || blobCrudo, ancho: c.width, alto: c.height };
  } finally {
    bmp.close();
  }
}

// Miniatura ligera (~4 KB) para no decodificar imágenes de 12 MP en los recuadros de 52x52 px
async function crearMiniatura(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    try {
      const k = 120 / Math.max(bmp.width, bmp.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return await canvasABlob(c, 'image/jpeg', 0.65);
    } finally {
      bmp.close();
    }
  } catch {
    return null;
  }
}

// Vía 1 (Principal): Disparo fotográfico nativo por hardware usando ImageCapture
async function capturarPorISP(pista) {
  const cap = estado_app.capturador;
  if (!cap) return null;

  let opts = {};
  if (typeof cap.getPhotoCapabilities === 'function') {
    try {
      const pc = await cap.getPhotoCapabilities();
      const maxW = pc.imageWidth?.max;
      const maxH = pc.imageHeight?.max;
      if (maxW && maxH) {
        const k = Math.min(1, CONFIG.FOTO_MAX_PX / Math.max(maxW, maxH));
        const stepW = pc.imageWidth.step || 1;
        const stepH = pc.imageHeight.step || 1;
        opts = {
          imageWidth: Math.max(pc.imageWidth.min || 640, Math.round((maxW * k) / stepW) * stepW),
          imageHeight: Math.max(pc.imageHeight.min || 480, Math.round((maxH * k) / stepH) * stepH),
        };
      }
    } catch {}
  }

  let blob;
  try {
    blob = await conLimiteTiempo(cap.takePhoto(opts), 4000);
  } catch {
    blob = await conLimiteTiempo(cap.takePhoto(), 4000);
  }

  // Algunos teléfonos Android apagan la linterna al terminar takePhoto(); si estaba encendida, la restauramos
  if (estado_app.flash && pista) {
    pista.applyConstraints({ advanced: [{ torch: true }] }).catch(() => {});
  }
  return blob;
}

// Vía 2 (Respaldo para iPhone/Safari sin ImageCapture): sube la pista a alta resolución un instante, captura y baja a preview
async function capturarPorRafagaAltaRes(v, pista) {
  const caps = pista?.getCapabilities ? pista.getCapabilities() : {};
  const maxW = Math.min(CONFIG.FOTO_MAX_PX, caps.width?.max || CONFIG.FOTO_MAX_PX);
  const maxH = Math.min(CONFIG.FOTO_MAX_PX, caps.height?.max || Math.round(maxW * 0.75));
  const subioResolucion = pista && maxW > v.videoWidth;

  try {
    if (subioResolucion) {
      const esperaResize = new Promise((ok) => {
        const listo = () => { v.removeEventListener('resize', listo); ok(); };
        v.addEventListener('resize', listo);
        setTimeout(listo, 450);
      });
      await pista.applyConstraints({ width: { ideal: maxW }, height: { ideal: maxH } });
      await esperaResize;
      await new Promise((ok) => requestAnimationFrame(ok));
    }

    const k = Math.min(1, CONFIG.FOTO_MAX_PX / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v, 0, 0, c.width, c.height);

    const blob = await canvasABlob(c, 'image/jpeg', CONFIG.FOTO_CALIDAD);
    return { blob, ancho: c.width, alto: c.height };
  } finally {
    if (subioResolucion) {
      await pista.applyConstraints(restriccionesPreview()).catch(() => {});
      const extras = {};
      if (estado_app.flash) extras.torch = true;
      if (estado_app.zoom > 1) extras.zoom = estado_app.zoom;
      if (Object.keys(extras).length) {
        pista.applyConstraints({ advanced: [extras] }).catch(() => {});
      }
    }
  }
}

async function mostrarPrevio(blob, ancho, alto) {
  estado_app.previo = blob;
  const pesoMB = (blob.size / (1024 * 1024)).toFixed(2);
  $('#previo-info').textContent = `${ancho}x${alto} · ${pesoMB} MB`;

  const img = $('#previo-img');
  URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
  try { await img.decode(); } catch {}
  $('#video').pause();
  $('#previo').hidden = false;
}

function cerrarPrevio() {
  estado_app.previo = null;
  $('#previo').hidden = true;
  $('#video').play().catch(() => {});
}

async function capturar() {
  const v = $('#video');
  if (estado_app.capturando || !v.videoWidth || !$('#previo').hidden) return;

  estado_app.capturando = true;
  const btn = $('#btn-disparo');
  btn.classList.add('capturando');

  const pista = estado_app.stream?.getVideoTracks()[0];
  try {
    let resultado = null;
    if (estado_app.capturador) {
      try {
        const blobISP = await capturarPorISP(pista);
        if (blobISP) resultado = await normalizarFoto(blobISP);
      } catch (e) {
        console.warn('Fallo captura ISP, usando ráfaga de alta resolución:', e);
      }
    }

    if (!resultado) {
      resultado = await capturarPorRafagaAltaRes(v, pista);
    }

    if (resultado?.blob) {
      await mostrarPrevio(resultado.blob, resultado.ancho, resultado.alto);
    }
  } catch (e) {
    toast('Error al capturar foto: ' + e.message);
  } finally {
    estado_app.capturando = false;
    btn.classList.remove('capturando');
  }
}

function construirDescripcionDrive(p, tipoHoja) {
  return [
    `ID: ${p.id}`,
    p.monto && `Costo: $${p.monto}`,
    p.ruta && `Ruta: ${p.ruta}`,
    p.parada && `Parada: ${p.parada}`,
    p.descripcion && `Descripción: ${p.descripcion}`,
    p.origen && `Origen: ${p.origen}`,
    p.embalaje && `Embalaje: ${p.embalaje}`,
    `Tipo: ${tipoHoja}${p.tipo === 'segregado' && p.sinBS ? ' (Sin BS)' : ''}`,
    estado_app.cajaVacia && 'ALERTA: Caja vacía (fraude)',
    `Validador: ${estado_app.validador}`,
  ].filter(Boolean).join('\n');
}

async function aceptar() {
  const p = porId(estado_app.actual);
  if (!p || !estado_app.previo) return;
  if (!estado_app.validador) {
    cerrarPrevio();
    return toast('Elige tu nombre arriba');
  }

  const blobFinal = estado_app.previo;
  const miniBlob = await crearMiniatura(blobFinal);

  const tipoHoja = p.tipo === 'segregado' && p.sinBS
    ? (CONFIG.TIPOS.segregado_sin_bs ?? CONFIG.TIPOS.validacion)
    : (CONFIG.TIPOS[p.tipo] ?? p.tipo);

  const n = Math.max(0, ...fotosDe(p.id).map((f) => f.n)) + 1;
  const descripcionDrive = construirDescripcionDrive(p, tipoHoja);
  blobFinal.descripcionDrive = descripcionDrive;

  const f = {
    paqueteId: p.id,
    n,
    nombre: n === 1 ? `${p.id}.jpg` : `${p.id}_${n}.jpg`,
    blob: blobFinal,
    miniBlob,
    descripcionDrive,
    ts: Date.now(),
    validador: estado_app.validador,
    tipo: tipoHoja,
    cajaVacia: estado_app.cajaVacia,
    estado: 'pendiente',
  };

  f.uid = await poner('fotos', f);
  estado_app.fotos.push(f);
  cerrarPrevio();
  renderCamara();
  renderTabla();
  renderEstado();
  sync.procesar();
}

async function mostrar(pantalla) {
  if (pantalla === 'camara' && !estado_app.actual) {
    const c = cola();
    const p = c.find((x) => estadoVisual(x) === 'tomado') ?? c.find((x) => !tieneFoto(x)) ?? c[0];
    if (!p) return toast('Primero carga una lista');
    estado_app.actual = p.id;
  }
  estado_app.pantalla = pantalla;
  $('#pantalla-datos').hidden = pantalla !== 'datos';
  $('#pantalla-camara').hidden = pantalla !== 'camara';
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('activo', b.dataset.ir === pantalla));
  if (pantalla === 'camara') {
    renderCamara();
    iniciarCamara();
  } else {
    detenerCamara();
  }
}

// ---------- Estado de sincronización ----------
function renderEstado() {
  const n = sync.pendientes().length;
  let t, c;
  if (!navigator.onLine) { t = `Sin conexión${n ? ` · ${n} pend.` : ''}`; c = 'warn'; }
  else if (!conectado()) { t = n ? `Conectar Google · ${n} pend.` : 'Conectar Google'; c = 'bad'; }
  else if (estado_app.sync === 'error') { t = `Reintentando · ${n}`; c = 'warn'; }
  else if (n) { t = `Subiendo ${n}…`; c = 'info'; }
  else { t = 'Todo subido ✓'; c = 'ok'; }
  $('#estado').textContent = t;
  $('#estado').className = 'pill ' + c;
}

// ---------- Arranque ----------
async function iniciar() {
  await abrir();
  estado_app.paquetes = await todos('paquetes');
  estado_app.fotos = await todos('fotos');
  estado_app.validador = (await obtener('meta', 'validador')) || '';

  if (estado_app.paquetes.length > 0) $('#panel-carga').open = false;

  const sel = $('#validador');
  sel.innerHTML = '<option value="">— ¿Quién valida? —</option>' + CONFIG.VALIDADORES.map((v) => `<option>${v}</option>`).join('');
  sel.value = estado_app.validador;
  sel.onchange = () => {
    estado_app.validador = sel.value;
    poner('meta', estado_app.validador, 'validador');
  };

  $('#btn-reemplazar').onclick = () => cargarLista(true);
  $('#btn-agregar').onclick = () => cargarLista(false);
  $('#btn-regresar-todos').onclick = regresarTodosNaranjas;

  $('#filtros').onclick = (e) => {
    const btn = e.target.closest('[data-filtro]');
    if (!btn) return;
    estado_app.filtro = btn.dataset.filtro;
    renderTabla();
  };

  $('#tabla').onclick = (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const p = porId(tr.dataset.id);
    const btnAcc = e.target.closest('[data-acc]');
    if (btnAcc && p) {
      const acc = btnAcc.dataset.acc;
      if (acc === 'tomar') cambiarFaseSegregado(p, 'tomado');
      else if (acc === 'soltar') cambiarFaseSegregado(p, '');
      else if (acc === 'regresar') cambiarFaseSegregado(p, 'regresado');
      return;
    }
    ir(tr.dataset.id);
    mostrar('camara');
  };

  document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => mostrar(b.dataset.ir)));
  $('#video').onclick = enfocarAlTocar;
  $('#btn-flash').onclick = alternarFlash;
  $('#btn-zoom').onclick = alternarZoom;
  $('#btn-disparo').onclick = capturar;
  $('#btn-aceptar').onclick = aceptar;
  $('#btn-rechazar').onclick = cerrarPrevio;
  $('#btn-prev').onclick = () => paso(-1);
  $('#btn-next').onclick = () => paso(1);
  $('#btn-listo').onclick = siguientePendiente;
  $('#chk-vacia').onchange = (e) => (estado_app.cajaVacia = e.target.checked);

  $('#btn-seg-fase').onclick = () => {
    const p = porId(estado_app.actual);
    if (!p) return;
    const est = estadoVisual(p);
    if (est === 'en-bolsa') cambiarFaseSegregado(p, 'regresado');
    else if (est === 'tomado') cambiarFaseSegregado(p, '');
    else cambiarFaseSegregado(p, 'tomado');
  };
  $('#btn-sin-bs').onclick = () => alternarSinBS(porId(estado_app.actual));

  $('#miniaturas').onclick = async (e) => {
    const uid = +e.target.dataset.uid;
    if (!uid) return;
    await borrar('fotos', uid);
    estado_app.fotos = estado_app.fotos.filter((f) => f.uid !== uid);
    renderCamara();
    renderTabla();
    renderEstado();
  };

  $('#estado').onclick = async () => {
    try { await conectar(); } catch { toast('No se pudo conectar con Google'); }
    renderEstado();
    sync.procesar();
  };

  window.addEventListener('online', () => { renderEstado(); sync.procesar(); });
  window.addEventListener('offline', renderEstado);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) detenerCamara();
    else {
      if (estado_app.pantalla === 'camara') iniciarCamara();
      sync.procesar();
    }
  });
  setInterval(renderEstado, 30000);

  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  renderTabla();
  renderEstado();
  sync.procesar();
}
iniciar();