const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const authRoutes = require('./routes/auth');
const JWT_SECRET = process.env.JWT_SECRET || "mi_llave_secreta_default_cambiame";
const userRoutes = require('./routes/users');

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'geoproyect'
});


const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Demasiados intentos, intenta de nuevo en 15 minutos"
});

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*'
}));
app.use(express.json());

// Aplicar limitador de login a las rutas de auth
app.use('/api/auth', loginLimiter, authRoutes(db, JWT_SECRET));
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

// Rutas de Auth (ya se cargaron arriba con el limitador)
// app.use('/api/auth', authRoutes(db, JWT_SECRET));

app.get('/', (req, res) => {
  res.send('Servidor de GeoProyect corriendo con éxito 🚀');
});

// Ahora solo entra aquí si tiene Token
app.get('/api/elementos', verificarToken, (req, res) => {
  const sql = `
    SELECT 
      el.*, 
      est.nombre AS estado, 
      reg.nombre AS region 
    FROM elementos el
    LEFT JOIN estados est ON el.estado_id = est.id
    LEFT JOIN regiones reg ON est.region_id = reg.id
  `;
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

// Endpoints Estados y Regiones
app.get('/api/estados', (req, res) => {
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

app.get('/api/regiones', (req, res) => {
  const sql = "SELECT * FROM regiones";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

// Solo guarda si tiene Token
app.post('/api/elementos', verificarToken, async (req, res) => {
  const { nombre, tipo, estado, latitud, longitud, direccion, actividad, tecnologia, cantidad, segmentacion } = req.body;

  try {
    // 1. Buscar el estado_id por nombre (Miranda, etc.)
    const [states] = await db.promise().query("SELECT id FROM estados WHERE nombre = ? LIMIT 1", [estado]);
    
    if (states.length === 0) {
      return res.status(400).json({ mensaje: `Estado '${estado}' no encontrado.` });
    }
    
    const estado_id = states[0].id;
    const tecnologiaStr = Array.isArray(tecnologia) ? tecnologia.join(', ') : tecnologia;

    if (tipo === 'antenas') {
      const checkAntenaSql = "SELECT id FROM elementos WHERE tipo = 'antenas' AND nombre = ? LIMIT 1";
      const [results] = await db.promise().query(checkAntenaSql, [nombre]);
      
      if (results.length > 0) {
        return res.status(400).json({ mensaje: "Ya existe una antena registrada con ese nombre." });
      }

      const sql = "INSERT INTO elementos (nombre, tipo, estado_id, latitud, longitud, direccion, actividad, tecnologia, cantidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
      const values = [nombre, tipo, estado_id, latitud, longitud, direccion, actividad, tecnologiaStr, 1];
      
      const [result] = await db.promise().query(sql, values);
      res.json({ mensaje: "Antena guardada", id: result.insertId });

    } else if (tipo === 'abonados') {
      const checkSql = "SELECT id, cantidad, segmentacion FROM elementos WHERE tipo = 'abonados' AND estado_id = ? LIMIT 1";
      const [results] = await db.promise().query(checkSql, [estado_id]);
      
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
        await db.promise().query(updateSql, [nuevaCantidadTotal, nuevaSegString, idExistente]);
        res.json({ mensaje: "Abonados actualizados" });

      } else {
        let s3 = (segmentacion === '3G') ? cantidad : 0;
        let s4 = (segmentacion === '4G') ? cantidad : 0;
        let s5 = (segmentacion === '5G') ? cantidad : 0;
        const segInicial = `3G:${s3} | 4G:${s4} | 5G:${s5}`;
        const insertSql = "INSERT INTO elementos (nombre, tipo, estado_id, latitud, longitud, direccion, cantidad, segmentacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        const [result] = await db.promise().query(insertSql, [nombre, tipo, estado_id, latitud, longitud, direccion, cantidad, segInicial]);
        res.json({ mensaje: "Punto maestro creado", id: result.insertId });
      }

    } else if (tipo === 'agentes') {
      const { codigoDealer, clasificacion } = req.body;
      const checkAgenteSql = "SELECT id FROM elementos WHERE tipo = 'agentes' AND codigo_dealer = ? LIMIT 1";
      const [results] = await db.promise().query(checkAgenteSql, [codigoDealer]);
      
      if (results.length > 0) {
        return res.status(400).json({ mensaje: "Este Código Dealer ya se encuentra registrado." });
      }

      const sql = "INSERT INTO elementos (nombre, tipo, estado_id, latitud, longitud, direccion, codigo_dealer, clasificacion, cantidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
      const [result] = await db.promise().query(sql, [nombre, tipo, estado_id, latitud, longitud, direccion, codigoDealer || null, clasificacion || null, 1]);
      res.json({ mensaje: "Agente Autorizado guardado", id: result.insertId });

    } else {
      const checkSql = "SELECT id, cantidad FROM elementos WHERE tipo = ? AND estado_id = ? LIMIT 1";
      const [results] = await db.promise().query(checkSql, [tipo, estado_id]);
      
      if (results.length > 0) {
        const nuevaCantidadTotal = Number(results[0].cantidad) + Number(cantidad);
        const updateSql = "UPDATE elementos SET cantidad = ? WHERE id = ?";
        await db.promise().query(updateSql, [nuevaCantidadTotal, results[0].id]);
        res.json({ mensaje: "Cantidad actualizada" });

      } else {
        const insertSql = "INSERT INTO elementos (nombre, tipo, estado_id, latitud, longitud, direccion, cantidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        const [result] = await db.promise().query(insertSql, [nombre, tipo, estado_id, latitud, longitud, direccion, cantidad]);
        res.json({ mensaje: "Registro creado", id: result.insertId });
      }
    }
  } catch (error) {
    console.error("Error al procesar elemento:", error);
    res.status(500).json({ error: error.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});


// XLS Import logic
const xlsx = require('xlsx');

app.post('/api/importar-masivo', async (req, res) => {
  try {
    const workbook = xlsx.readFile('data_recibida.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const filas = xlsx.utils.sheet_to_json(sheet);

    // Obtener mapeo de estados (nombre -> id) para evitar consultas en bucle
    const [estadosDb] = await db.promise().query("SELECT id, nombre FROM estados");
    const mapeoEstados = {};
    estadosDb.forEach(est => mapeoEstados[est.nombre] = est.id);

    // Procesar e insertar
    for (const fila of filas) {
      const estado_id = mapeoEstados[fila.estado];
      if (!estado_id) {
        console.warn(`Estado no encontrado para la fila: ${fila.nombre}`);
        continue;
      }

      const sql = "INSERT INTO elementos (nombre, tipo, estado_id, latitud, longitud, direccion) VALUES (?, ?, ?, ?, ?, ?)";
      await db.promise().query(sql, [fila.nombre, fila.tipo, estado_id, fila.latitud, fila.longitud, fila.direccion]);
    }

    res.json({ mensaje: `${filas.length} elementos integrados con éxito` });
  } catch (error) {
    console.error("Error en importación masiva:", error);
    res.status(500).json({ error: "Error procesando el archivo" });
  }
});