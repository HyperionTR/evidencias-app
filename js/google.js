// Adaptador de almacenamiento: Google OAuth (GIS) + Drive API + Sheets API, todo desde el navegador.
// Si algún día migran a "Verdi" u otro backend, solo reescribes este archivo
// (conserva: conectar, conectado, asegurarRuta, subirArchivo, agregarFila).
import { CONFIG } from './config.js';

const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const err = (msg, code) => Object.assign(new Error(msg), { code });

let token = null, expira = 0, cliente = null;
export const conectado = () => !!token && Date.now() < expira - 60000;

function cargarGIS() {
  return new Promise((ok) => {
    if (window.google?.accounts) return ok();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = s.onerror = () => ok();
    document.head.append(s);
  });
}

// Debe llamarse desde un toque del usuario la primera vez (si no, el navegador bloquea el popup).
export async function conectar() {
  await cargarGIS();
  if (!window.google?.accounts) throw err('Sin acceso a Google', 'RED');
  cliente ??= google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: () => {},
  });
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(err('Tiempo agotado', 'AUTH')), 20000);
    cliente.callback = (r) => {
      clearTimeout(t);
      if (r.error) return mal(err(r.error, 'AUTH'));
      token = r.access_token;
      expira = Date.now() + r.expires_in * 1000;
      ok();
    };
    cliente.error_callback = (e) => {
      clearTimeout(t);
      mal(err(e.type || 'popup', 'AUTH'));
    };
    cliente.requestAccessToken({ prompt: '' }); // sin UI si ya hay sesión y consentimiento
  });
}

async function api(url, opts = {}) {
  // Sin sesión NO se abre el popup solo: el navegador lo bloquea si no viene de un toque del usuario.
  // Quien conecta es el botón de estado ("Conectar Google"), que sí es un toque.
  if (!conectado()) throw err('Sin sesión', 'AUTH');
  const r = await fetch(url, { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${token}` } });
  if (r.status === 401) {
    token = null;
    throw err('401', 'AUTH');
  }
  if (!r.ok) throw err(`${r.status} ${await r.text()}`, r.status);
  return r.json();
}

const cacheCarpetas = new Map();
async function carpeta(nombre, padre) {
  const k = `${padre}/${nombre}`;
  if (cacheCarpetas.has(k)) return cacheCarpetas.get(k);
  const buscar = async () => {
    const q = `'${padre}' in parents and name='${nombre.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const r = await api(
      `${DRIVE}/files?` +
        new URLSearchParams({ q, fields: 'files(id)', orderBy: 'createdTime', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' })
    );
    return r.files[0]?.id;
  };
  let id = await buscar();
  if (!id) {
    const nuevo = await api(`${DRIVE}/files?supportsAllDrives=true&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padre] }),
    });
    // Si dos personas la crearon a la vez, todos convergen en la más antigua.
    id = (await buscar()) ?? nuevo.id;
  }
  cacheCarpetas.set(k, id);
  return id;
}

// ['16-10-2026', 'Pamela Pedraza'] -> id de la carpeta final dentro de ROOT_FOLDER_ID
export async function asegurarRuta(partes) {
  let id = CONFIG.ROOT_FOLDER_ID;
  for (const p of partes) id = await carpeta(p, id);
  return id;
}

export async function subirArchivo(nombre, blob, carpetaId) {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: nombre, parents: [carpetaId] })], { type: 'application/json' }));
  form.append('file', blob);
  try {
    return await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
      method: 'POST',
      body: form,
    });
  } catch (e) {
    if (e.code === 404) cacheCarpetas.clear(); // carpeta borrada: que se recree en el reintento
    throw e;
  }
}

const pad = (n) => String(n).padStart(2, '0');
const fmt = (t) => {
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Mismo orden de columnas que el formulario: Timestamp | (vacío) | URL | ¿Caja vacía? | Tipo | Validador | ID
export function agregarFila(f) {
  const rango = encodeURIComponent(`${CONFIG.SHEET_TAB}!A:G`);
  return api(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${rango}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[fmt(f.ts), '', f.url, f.cajaVacia ? 'Sí' : 'No', f.tipo, f.validador, f.paqueteId]] }),
    }
  );
}
