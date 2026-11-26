// Todo lo que cambia entre equipos/entornos vive aquí. Edita sin miedo.
export const CONFIG = {
  // --- Google ---
  GOOGLE_CLIENT_ID: '213262182219-dntd1v10rthlbs8q4dnvm9dnlaaf763i.apps.googleusercontent.com',
  ROOT_FOLDER_ID: '1X71i48zu5dJ2vl_jrfLZRO_elxDywE0t', // Carpeta donde se suben las subcarpetas de fotos
  SHEETS_FOLDER_ID: '0AJDgoKFCOF9qUk9PVA',             // Raíz de la Unidad Compartida (donde viven los Sheets anuales)

  // Plantilla anual con las 12 pestañas: "Registros Enero" ... "Registros Diciembre"
  TEMPLATE_SHEET_ID: '1PMX2ulqRKfHGngjUFLdCRVq8cc9zsBOxSe6O-Dn6vBg',
  SHEET_ANUAL_NOMBRE: 'Registros {ANIO}',
  SHEET_MES_NOMBRE: 'Registros {MES}',

  VALIDADORES: [
    'Margarita Paredes', 'Fernando Espinoza', 'Pamela Pedraza',
    'Marco Manrique', 'Emmanuel Hernandez', 'Aldair Alvarez',
  ],

  // Valor que se escribe en la columna "Tipo de validacion" en Sheets.
  TIPOS: {
    validacion: 'auditoria',
    segregado: 'segregado',
    segregado_sin_bs: 'auditoria',
  },

  // --- Cámara y compresión ---
  VIDEO_MAX_W: 1440,
  VIDEO_MAX_H: 1080,
  VIDEO_FPS: 24,
  FOTO_MAX_PX: 1440,
  FOTO_CALIDAD: 0.82,

  // --- Orden de rutas ---
  CICLOS: {
    SD2:   { lados: false, desc: false },
    SD1:   { lados: false, desc: true },
    AM2:   { lados: true,  desc: true },
    AM0:   { lados: true,  desc: true },
    AM1:   { lados: true,  desc: true },
    AM101: { lados: true,  desc: true },
    AM201: { lados: true,  desc: true },
  },
  LADOS: [
    ['A', 'C', 'F', 'H', 'J', 'L', 'N', 'Q', 'S', 'U', 'VL', 'VN', 'VQ', 'VS', 'VU'],
    ['B', 'D', 'G', 'I', 'K', 'M', 'P', 'R', 'T', 'V', 'VV', 'VP', 'VR', 'VT', 'VV'],
  ],
};