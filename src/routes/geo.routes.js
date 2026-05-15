const express = require('express');
const router = express.Router();
const db = require('../config/db.config');
const https = require('https');

router.get('/estados', (req, res) => {
  const sql = `
    SELECT 
      e.id, 
      e.nombre, 
      e.latitud, 
      e.longitud, 
      e.color AS color_estado, 
      r.nombre AS nombre_region, 
      r.color AS color_region
    FROM estados e
    LEFT JOIN regiones r ON e.region_id = r.id
  `;
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

router.get('/regiones', (req, res) => {
  const sql = "SELECT * FROM regiones";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

router.get('/geocode', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query 'q' es requerido" });

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&email=admin@geoproyect.com`;
  
  const options = {
    headers: {
      'User-Agent': 'GeoProyect-App/1.0 (admin@geoproyect.com)'
    }
  };

  https.get(url, options, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (e) {
        res.status(500).json({ error: "Error parseando respuesta de Nominatim" });
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

module.exports = router;
