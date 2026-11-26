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

  // --- Cámara: vista previa ligera + captura de alta definición ---
  VIDEO_IDEAL_W: 1280,          // Vista en vivo ligera (4:3, ~1.2 MP) para máxima fluidez
  VIDEO_IDEAL_H: 960,
  VIDEO_FPS: 24,
  FOTO_MAX_PX: 4080,            // ~12.5 MP (cubre nativo 4000x3000, 4032x3024 iPhone y 4080x3060 de 50MP)
  FOTO_MAX_BYTES: 4_500_000,    // Si el JPEG nativo del sensor pesa <= 4.5 MB y cabe en FOTO_MAX_PX, no se recomprime
  FOTO_CALIDAD: 0.92,           // Calidad JPEG alta cuando se redimensiona un disparo mayor (ej. 50MP/100MP sin agrupar)

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