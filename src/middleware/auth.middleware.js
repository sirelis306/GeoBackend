const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || "mi_llave_secreta_default_cambiame";

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

module.exports = {
  verificarToken,
  JWT_SECRET
};
