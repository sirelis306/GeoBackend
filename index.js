const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const authRoutes = require('./routes/auth');
const JWT_SECRET = "mi_llave_secreta_ultra_segura_2026";
const userRoutes = require('./routes/users');

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'geoproyect'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Demasiados intentos, intenta de nuevo en 15 minutos"
});

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api/users', userRoutes(db, JWT_SECRET));

// FUNCIÓN PARA VERIFICAR EL TOKEN
const verificarToken = (req, res, next) => {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];

  if (!token) return res.status(401).json({ mensaje: "Token requerido" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ mensaje: "Token inválido o expirado" });
    req.user = user;
    next();
  });
};

// Rutas de Auth
app.use('/api/auth', authRoutes(db, JWT_SECRET));

app.get('/', (req, res) => {
  res.send('Servidor de GeoProyect corriendo con éxito 🚀');
});

// Ahora solo entra aquí si tiene Token
app.get('/api/elementos', verificarToken, (req, res) => {
  const sql = "SELECT * FROM elementos";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

// Endpoints Estados y Regiones
app.get('/api/estados', (req, res) => {
  const sql = `
    SELECT e.id, e.nombre, e.latitud, e.longitud, r.nombre AS nombre_region, r.color AS color_region
    FROM estados e
    LEFT JOIN regiones r ON e.region_id = r.id
  `;
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

app.get('/api/regiones', (req, res) => {
  const sql = "SELECT * FROM regiones";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

// Solo guarda si tiene Token
app.post('/api/elementos', verificarToken, (req, res) => {
  const { nombre, tipo, estado, region, latitud, longitud, direccion, actividad, tecnologia, cantidad, segmentacion } = req.body;

  if (tipo === 'antenas') {
    const checkAntenaSql = "SELECT id FROM elementos WHERE tipo = 'antenas' AND nombre = ? LIMIT 1";
    db.query(checkAntenaSql, [nombre], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length > 0) {
        return res.status(400).json({ mensaje: "Ya existe una antena registrada con ese nombre." });
      }

      const sql = "INSERT INTO elementos (nombre, tipo, estado, region, latitud, longitud, direccion, actividad, tecnologia, cantidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      db.query(sql, [nombre, tipo, estado, region, latitud, longitud, direccion, actividad, tecnologia, 1], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: "Antena guardada", id: result.insertId });
      });
    });

  } else if (tipo === 'abonados') {
    const checkSql = "SELECT id, cantidad, segmentacion FROM elementos WHERE tipo = 'abonados' AND estado = ? LIMIT 1";
    db.query(checkSql, [estado], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length > 0) {
        const idExistente = results[0].id;
        const segActual = results[0].segmentacion || "3G:0 | 4G:0 | 5G:0";
        let match3G = segActual.match(/3G:(\d+)/);
        let match4G = segActual.match(/4G:(\d+)/);
        let match5G = segActual.match(/5G:(\d+)/);
        let s3 = match3G ? parseInt(match3G[1]) : 0;
        let s4 = match4G ? parseInt(match4G[1]) : 0;
        let s5 = match5G ? parseInt(match5G[1]) : 0;
        const cantNueva = Number(cantidad);
        if (segmentacion === '3G') s3 += cantNueva;
        if (segmentacion === '4G') s4 += cantNueva;
        if (segmentacion === '5G') s5 += cantNueva;

        const nuevaSegString = `3G:${s3} | 4G:${s4} | 5G:${s5}`;
        const nuevaCantidadTotal = s3 + s4 + s5;
        const updateSql = "UPDATE elementos SET cantidad = ?, segmentacion = ? WHERE id = ?";
        db.query(updateSql, [nuevaCantidadTotal, nuevaSegString, idExistente], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ mensaje: "Abonados actualizados" });
        });

      } else {
        let s3 = (segmentacion === '3G') ? cantidad : 0;
        let s4 = (segmentacion === '4G') ? cantidad : 0;
        let s5 = (segmentacion === '5G') ? cantidad : 0;
        const segInicial = `3G:${s3} | 4G:${s4} | 5G:${s5}`;
        const insertSql = "INSERT INTO elementos (nombre, tipo, estado, region, latitud, longitud, direccion, cantidad, segmentacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        db.query(insertSql, [nombre, tipo, estado, region, latitud, longitud, direccion, cantidad, segInicial], (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ mensaje: "Punto maestro creado", id: result.insertId });
        });
      }
    });

  } else if (tipo === 'agentes') {
    const { codigoDealer, clasificacion } = req.body;
    const checkAgenteSql = "SELECT id FROM elementos WHERE tipo = 'agentes' AND codigo_dealer = ? LIMIT 1";
    db.query(checkAgenteSql, [codigoDealer], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length > 0) {
        return res.status(400).json({ mensaje: "Este Código Dealer ya se encuentra registrado." });
      }

      const sql = "INSERT INTO elementos (nombre, tipo, estado, region, latitud, longitud, direccion, codigo_dealer, clasificacion, cantidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      db.query(sql, [nombre, tipo, estado, region, latitud, longitud, direccion, codigoDealer || null, clasificacion || null, 1], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: "Agente Autorizado guardado", id: result.insertId });
      });
    });

  } else {
    const checkSql = "SELECT id, cantidad FROM elementos WHERE tipo = ? AND estado = ? LIMIT 1";
    db.query(checkSql, [tipo, estado], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length > 0) {
        const nuevaCantidadTotal = Number(results[0].cantidad) + Number(cantidad);
        const updateSql = "UPDATE elementos SET cantidad = ? WHERE id = ?";
        db.query(updateSql, [nuevaCantidadTotal, results[0].id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ mensaje: "Cantidad actualizada" });
        });

      } else {
        const insertSql = "INSERT INTO elementos (nombre, tipo, estado, region, latitud, longitud, direccion, cantidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        db.query(insertSql, [nombre, tipo, estado, region, latitud, longitud, direccion, cantidad], (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ mensaje: "Registro creado", id: result.insertId });
        });
      }
    });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// XLS Import logic
const xlsx = require('xlsx');

app.post('/api/importar-masivo', async (req, res) => {
  try {
    const workbook = xlsx.readFile('data_recibida.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const filas = xlsx.utils.sheet_to_json(sheet);

    // Obtener mapeo de regiones desde la DB para evitar consultas en bucle
    const [estadosDb] = await db.promise().query("SELECT e.nombre, r.nombre as region FROM estados e LEFT JOIN regiones r ON e.region_id = r.id");
    const mapeoRegiones = {};
    estadosDb.forEach(est => mapeoRegiones[est.nombre] = est.region);

    // Procesar e insertar
    for (const fila of filas) {
      const region = mapeoRegiones[fila.estado] || 'Desconocida';
      const sql = "INSERT INTO elementos (nombre, tipo, estado, region, latitud, longitud, direccion) VALUES (?, ?, ?, ?, ?, ?, ?)";
      await db.promise().query(sql, [fila.nombre, fila.tipo, fila.estado, region, fila.latitud, fila.longitud, fila.direccion]);
    }

    res.json({ mensaje: `${filas.length} elementos integrados con éxito` });
  } catch (error) {
    console.error("Error en importación masiva:", error);
    res.status(500).json({ error: "Error procesando el archivo" });
  }
});