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

// ---------- Estado ----------
const estado_app = {
  paquetes: [],
  fotos: [],
  actual: null,
  validador: '',
  cajaVacia: false,
  previo: null,
  stream: null,
  flash: false,
  filtro: 'todos',
  sync: 'ok',
  pantalla: 'datos',
};

const sync = crearSync(estado_app, () => {
  renderEstado();
  renderTabla();
  if (estado_app.pantalla === 'camara') renderCamara();
});

const fotoPorUID = (uid) => estado_app.fotos.find((f) => f.uid === uid);
const fotosDe = (id) => estado_app.fotos.filter((f) => f.paqueteId === id);
const porId = (id) => estado_app.paquetes.find((p) => p.id === id);
const tieneFoto = (p) => fotosDe(p.id).length > 0;
const disponible = (p) =>
  p.soloId || p.estatus === 'in_container' || p.estatus === 'ready_to_deliver' || !!p.segFase || tieneFoto(p);

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

// ---------- Cámara y Flash (Torch) ----------
async function iniciarCamara() {
  if (estado_app.stream) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280, max: CONFIG.VIDEO_MAX_W },
        height: { ideal: 960, max: CONFIG.VIDEO_MAX_H },
        frameRate: { ideal: 20, max: CONFIG.VIDEO_FPS },
      },
    });
    if (estado_app.pantalla !== 'camara' || document.hidden) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    estado_app.stream = stream;
    const pista = stream.getVideoTracks()[0];
    const caps = pista.getCapabilities ? pista.getCapabilities() : {};

    if (caps.focusMode?.includes('continuous')) {
      pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }

    estado_app.flash = false;
    const btnFlash = $('#btn-flash');
    btnFlash.hidden = !caps.torch;
    btnFlash.classList.remove('encendido');
    btnFlash.textContent = 'Flash: OFF';

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

function detenerCamara() {
  estado_app.stream?.getTracks().forEach((t) => t.stop());
  estado_app.stream = null;
  estado_app.flash = false;
  $('#btn-flash')?.classList.remove('encendido');
}

let urls = [];
function renderCamara() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  
  const p = porId(estado_app.actual); // Paquete actual en camara
  const est = p ? estadoVisual(p) : ''; // Estauts

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

  const fs = p ? fotosDe(p.id) : []; // arreglo de fotos del paquete
  $('#miniaturas').innerHTML = '';
  // Funcion que crea las minituras segun las fotos de un paquete
  for (const f of fs) {
    const d = document.createElement('div');
    d.className = 'mini';
    if (f.blob) {
      const u = URL.createObjectURL(f.blob);
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
  const c = cola(); // cola ya filtra sólo los disponibles
  if (!c.length) return;
  const i = Math.max(0, c.findIndex((p) => p.id === estado_app.actual));

  
  for (let k = 1; k <= c.length; k++) {
    const p = c[(i + k) % c.length];
    if (!tieneFoto(p) && estadoVisual(p) !== 'tomado') return ir(p.id);
  }

  toast('No quedan paquetes en baker ✓');
}

async function mostrarPrevio(blob) {
  estado_app.previo = blob;
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

function capturar() {
  const v = $('#video');
  if (!v.videoWidth || !$('#previo').hidden) return;
  const k = Math.min(1, CONFIG.FOTO_MAX_PX / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * k);
  c.height = Math.round(v.videoHeight * k);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  c.toBlob((b) => b && mostrarPrevio(b), 'image/jpeg', CONFIG.FOTO_CALIDAD);
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

  const tipoHoja = p.tipo === 'segregado' && p.sinBS
    ? (CONFIG.TIPOS.segregado_sin_bs ?? CONFIG.TIPOS.validacion)
    : (CONFIG.TIPOS[p.tipo] ?? p.tipo);

  const n = Math.max(0, ...fotosDe(p.id).map((f) => f.n)) + 1;
  const descripcionDrive = construirDescripcionDrive(p, tipoHoja);
  estado_app.previo.descripcionDrive = descripcionDrive;

  const f = {
    paqueteId: p.id,
    n,
    nombre: n === 1 ? `${p.id}.jpg` : `${p.id}_${n}.jpg`,
    blob: estado_app.previo,
    descripcionDrive,
    ts: Date.now(),
    validador: estado_app.validador,
    tipo: tipoHoja,
    cajaVacia: estado_app.cajaVacia,
    estado: 'pendiente',
  };

  f.uid = await poner('fotos', f);
  estado_app.fotos.push(f);
  cambiarFaseSegregado(p, 'en-bolsa')
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
  $('#btn-flash').onclick = alternarFlash;
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

  // Funcion que se encarga de borrar la foto y, por lo tanto, cambia la fase de segregado
  $('#miniaturas').onclick = async (e) => {
    const uid = +e.target.dataset.uid;
    if (!uid) return;
    await borrar('fotos', uid);
    // Encontramos foto por uid
    // Una vez encontrada, cambiamos el estado de segregado si es su ultima foto
    const paqueteId = fotoPorUID(uid).paqueteId;
    if (fotosDe(paqueteId).length === 1)
      cambiarFaseSegregado(porId(paqueteId), '');
    // Y actualizamos el arreglo global de fotos
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