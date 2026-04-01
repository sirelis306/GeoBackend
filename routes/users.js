const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const jwt = require('jsonwebtoken');

// Obtener todos los usuarios (Protegido)
module.exports = (db, JWT_SECRET) => {

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
    
    // La ruta relativa es /listado
    router.get('/listado', (req, res) => {
        const sql = "SELECT id, username, rol FROM usuarios";
        db.query(sql, (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        });
    });

// Crear nuevo usuario con contraseña encriptada
router.post('/crear', verificarToken, async (req, res) => {
    const { username, password, rol } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = "INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)";
    db.query(sql, [username, hashedPassword, rol], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: "Usuario creado con éxito" });
    });
});

// Eliminar usuario
router.delete('/eliminar/:id', verificarToken, (req, res) => {
        const { id } = req.params;
        db.query("DELETE FROM usuarios WHERE id = ?", [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ mensaje: "Usuario eliminado" });
        });
    });

    return router;
};