// Cola de subida en dos pasos (pendiente -> enDrive -> listo) resistente a cortes de red.
import { poner } from './db.js';
import { conectado, asegurarRuta, subirArchivo, agregarFila } from './google.js';

const pad = (n) => String(n).padStart(2, '0');
function carpetaFecha(ts) {
  const d = new Date(ts);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function crearSync(estado_app, alCambiar) {
  let corriendo = false;
  let timer = null;

  const pendientes = () => estado_app.fotos.filter((f) => f.estado !== 'listo');

  async function procesar() {
    clearTimeout(timer);
    if (corriendo || !navigator.onLine || !conectado()) return;
    const cola = pendientes();
    if (!cola.length) {
      estado_app.sync = 'ok';
      alCambiar();
      return;
    }

    corriendo = true;
    try {
      for (const f of cola) {
        if (!navigator.onLine || !conectado()) break;

        if (f.estado === 'pendiente') {
          const carpetaId = await asegurarRuta([carpetaFecha(f.ts), f.validador]);
          const arch = await subirArchivo(f.nombre, f.blob, carpetaId, f.descripcionDrive);
          f.driveId = arch.id;
          f.url = `https://drive.google.com/open?id=${arch.id}`;
          f.estado = 'enDrive';
          await poner('fotos', f);
          alCambiar();
        }

        if (f.estado === 'enDrive') {
          await agregarFila(f);
          f.estado = 'listo';
          delete f.blob;
          delete f.miniBlob;
          await poner('fotos', f);
          alCambiar();
        }
      }
      estado_app.sync = 'ok';
    } catch (e) {
      console.warn('Error en sincronización:', e);
      if (e.code !== 'AUTH') {
        estado_app.sync = 'error';
        timer = setTimeout(procesar, 15000);
      }
    } finally {
      corriendo = false;
      alCambiar();
    }
  }

  return { pendientes, procesar };
}