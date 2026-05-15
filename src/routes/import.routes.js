const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const db = require('../config/db.config');

router.post('/masivo', async (req, res) => {
  try {
    const workbook = xlsx.readFile('data_recibida.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const filas = xlsx.utils.sheet_to_json(sheet);

    const [estadosDb] = await db.promise().query("SELECT id, nombre FROM estados");
    const mapeoEstados = {};
    estadosDb.forEach(est => mapeoEstados[est.nombre] = est.id);

    for (const fila of filas) {
      const estado_id = mapeoEstados[fila.estado];
      if (!estado_id) continue;

      const sql = `
        INSERT INTO elementos 
          (nombre, tipo, estado_id, latitud, longitud, direccion, actividad, tecnologia, cantidad, segmentacion, codigo_dealer, clasificacion) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        fila.nombre, fila.tipo || 'antenas', estado_id, fila.latitud || 0, 
        fila.longitud || 0, fila.direccion || '', fila.actividad || 'Operativa',
        fila.tecnologia || '/ / /', fila.cantidad || 1, fila.segmentacion || null,
        fila.codigo_dealer || fila.codigoDealer || null, fila.clasificacion || null
      ];

      await db.promise().query(sql, values);
    }

    res.json({ mensaje: `${filas.length} elementos integrados con éxito` });
  } catch (error) {
    res.status(500).json({ error: "Error procesando el archivo" });
  }
});

module.exports = router;
