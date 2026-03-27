const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); // Para que Node entienda los JSON que envía Angular

// Conexión a la base de datos (La de tu XAMPP)
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // Vacío por defecto en XAMPP
  database: 'geoproyect'
});

app.get('/', (req, res) => {
  res.send('Servidor de GeoProyect corriendo con éxito 🚀');
});

// Ruta para obtener todos los elementos (Antenas, Oficinas, etc.)
app.get('/api/elementos', (req, res) => {
  const sql = "SELECT * FROM elementos";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

// Ruta para guardar un nuevo elemento desde el formulario
app.post('/api/elementos', (req, res) => {
  const { nombre, tipo, estado, region, latitud, longitud, direccion, actividad, tecnologia, cantidad, segmentacion } = req.body;

  // ANTENAS (Individuales)
  if (tipo === 'antenas') {
    const sql = "INSERT INTO elementos (nombre, tipo, estado, region, latitud, longitud, direccion, actividad, tecnologia, cantidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    db.query(sql, [nombre, tipo, estado, region, latitud, longitud, direccion, actividad, tecnologia, 1], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      return res.json({ mensaje: "Antena guardada con éxito", id: result.insertId });
    });
  } 
  
  // ABONADOS (Lógica de un solo punto con desglose)
  else if (tipo === 'abonados') {
    const checkSql = "SELECT id, cantidad, segmentacion FROM elementos WHERE tipo = 'abonados' AND estado = ? LIMIT 1";
    
    db.query(checkSql, [estado], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      if (results.length > 0) {
        // --- EXISTE: ACTUALIZAMOS EL DESGLOSE ---
        const idExistente = results[0].id;
        const cantActualTotal = Number(results[0].cantidad);
        const segActual = results[0].segmentacion || "3G:0 | 4G:0 | 5G:0";

        // Extraemos los números actuales usando Regex
        let match3G = segActual.match(/3G:(\d+)/);
        let match4G = segActual.match(/4G:(\d+)/);
        let match5G = segActual.match(/5G:(\d+)/);

        let s3 = match3G ? parseInt(match3G[1]) : 0;
        let s4 = match4G ? parseInt(match4G[1]) : 0;
        let s5 = match5G ? parseInt(match5G[1]) : 0;

        // Sumamos solo a la tecnología que envió el usuario
        const cantNueva = Number(cantidad);
        if (segmentacion === '3G') s3 += cantNueva;
        if (segmentacion === '4G') s4 += cantNueva;
        if (segmentacion === '5G') s5 += cantNueva;

        const nuevaSegString = `3G:${s3} | 4G:${s4} | 5G:${s5}`;
        const nuevaCantidadTotal = s3 + s4 + s5;

        const updateSql = "UPDATE elementos SET cantidad = ?, segmentacion = ? WHERE id = ?";
        db.query(updateSql, [nuevaCantidadTotal, nuevaSegString, idExistente], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ mensaje: "Segmentación y Total actualizados", id: idExistente });
        });
      } else {
        // --- NO EXISTE: CREAMOS EL PUNTO MAESTRO ---
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
  }

  // OFICINAS Y AGENTES (Suma simple por estado)
  else {
    const checkSql = "SELECT id, cantidad FROM elementos WHERE tipo = ? AND estado = ? LIMIT 1";
    db.query(checkSql, [tipo, estado], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      if (results.length > 0) {
        const idExistente = results[0].id;
        const nuevaCantidadTotal = Number(results[0].cantidad) + Number(cantidad);
        const updateSql = "UPDATE elementos SET cantidad = ? WHERE id = ?";
        db.query(updateSql, [nuevaCantidadTotal, idExistente], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ mensaje: "Cantidad actualizada", id: idExistente });
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

//Calcula las regiones 

const xlsx = require('xlsx');

// Función para mapear Estado -> Región 
const obtenerRegion = (estado) => {
    const mapeo = {
        'Zulia': 'Zuliana',
        'Distrito Capital': 'Capital', 'Miranda': 'Capital', 'La Guaira': 'Capital',
        'Carabobo': 'Central', 'Aragua': 'Central', 'Cojedes': 'Central',
        'Bolívar': 'Guayana', 'Amazonas': 'Guayana', 'Delta Amacuro': 'Guayana',
        'Lara': 'Centro Occidental', 'Falcón': 'Centro Occidental', 'Yaracuy': 'Centro Occidental', 'Portuguesa': 'Centro Occidental',
        'Guárico': 'Los Llanos', 'Apure': 'Los Llanos',
        'Anzoátegui': 'Nororiental', 'Monagas': 'Nororiental', 'Sucre': 'Nororiental',
        'Mérida': 'Los Andes', 'Táchira': 'Los Andes', 'Trujillo': 'Los Andes', 'Barinas': 'Los Andes',
        'Nueva Esparta': 'Insular'
    };
    return mapeo[estado] || 'Desconocida';
};

app.post('/api/importar-masivo', (req, res) => {
    try {
        // Lee el archivo 
        const workbook = xlsx.readFile('data_recibida.xlsx'); 
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const filas = xlsx.utils.sheet_to_json(sheet);

        // Procesar e insertar
        filas.forEach(fila => {
            const region = obtenerRegion(fila.estado);
            const sql = "INSERT INTO elementos (nombre, tipo, estado, region, latitud, longitud, direccion) VALUES (?, ?, ?, ?, ?, ?, ?)";
            
            db.query(sql, [fila.nombre, fila.tipo, fila.estado, region, fila.latitud, fila.longitud, fila.direccion]);
        });

        res.json({ mensaje: `${filas.length} elementos integrados con éxito` });
    } catch (error) {
        res.status(500).json({ error: "Error procesando el archivo" });
    }
});