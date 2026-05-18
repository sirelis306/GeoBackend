const jwt = require('jsonwebtoken');
const db = require('../config/db.config');
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

const verificarAdmin = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const sql = `
      SELECT r.nombre_rol FROM roles r
      INNER JOIN usuario_roles ur ON r.id = ur.rol_id
      WHERE ur.usuario_id = ?
    `;
    const [result] = await db.promise().query(sql, [userId]);
    const roles = result.map(r => r.nombre_rol);
    if (roles.includes('rol_super_administrador') || roles.includes('rol_administrador')) {
      next();
    } else {
      return res.status(403).json({ mensaje: "Acceso denegado: Se requiere rol de administrador" });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  verificarToken,
  verificarAdmin,
  JWT_SECRET
};
