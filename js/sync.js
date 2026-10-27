// Cola de subida. La "cola" es simplemente S.fotos con estado != 'listo' (persistidas en IndexedDB).
// Cada foto avanza: pendiente -> enDrive -> listo. Si falla a la mitad, el reintento continúa
// desde donde se quedó (no vuelve a subir la foto ni duplica la fila).
import { poner } from './db.js';
import { asegurarRuta, subirArchivo, agregarFila } from './google.js';

const pad = (n) => String(n).padStart(2, '0');
const fechaCarpeta = (t) => {
  const d = new Date(t);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

export function crearSync(estado_app, alCambiar) {
  let corriendo = false, espera = 2000, timer = null;
  const pendientes = () => estado_app.fotos.filter((f) => f.estado !== 'listo');

  async function subir(f) {
    if (f.estado === 'pendiente') {
      const carpeta = await asegurarRuta([fechaCarpeta(f.ts), f.validador]);
      const r = await subirArchivo(f.nombre, f.blob, carpeta);
      f.driveId = r.id;
      f.url = `https://drive.google.com/open?id=${r.id}`;
      f.estado = 'enDrive';
      await poner('fotos', f);
    }
    if (f.estado === 'enDrive') {
      await agregarFila(f);
      f.estado = 'listo';
      f.blob = null; // libera espacio del teléfono
      await poner('fotos', f);
    }
  }

  async function procesar() {
    if (corriendo || !navigator.onLine) return;
    corriendo = true;
    clearTimeout(timer);
    estado_app.sync = 'ok';
    alCambiar();
    try {
      for (let f; (f = pendientes()[0]); ) {
        await subir(f);
        espera = 2000;
        alCambiar();
      }
    } catch (e) {
      if (e.code !== 'AUTH') {
        // red caída u error temporal: reintento con espera creciente
        estado_app.sync = 'error';
        console.warn('subida falló', e);
        timer = setTimeout(procesar, espera);
        espera = Math.min(espera * 2, 60000);
      } // si es AUTH, espera a que el usuario toque "Conectar Google"
    } finally {
      corriendo = false;
      alCambiar();
    }
  }

  return { procesar, pendientes };
}
