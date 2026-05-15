const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const db = require('./src/config/db.config');
const { JWT_SECRET } = require('./src/middleware/auth.middleware');

// Rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const elementRoutes = require('./src/routes/element.routes');
const geoRoutes = require('./src/routes/geo.routes');
const importRoutes = require('./src/routes/import.routes');

const app = express();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Demasiados intentos, intenta de nuevo en 15 minutos"
});

// Middlewares Globales
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());

// Registro de Rutas
app.use('/api/auth', loginLimiter, authRoutes(db, JWT_SECRET));
app.use('/api/users', userRoutes(db, JWT_SECRET));
app.use('/api/elementos', elementRoutes);
app.use('/api', geoRoutes); // /api/estados, /api/regiones, /api/geocode
app.use('/api/import', importRoutes);

app.get('/', (req, res) => {
  res.send('Servidor de GeoProyect corriendo con Arquitectura SOLID 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor SOLID corriendo en el puerto ${PORT}`);
});