const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = (db, JWT_SECRET) => {

    // RUTA DE SETUP (Solo para crear el primer admin)
    router.post('/setup-admin', async (req, res) => {
        const { username, password, masterKey } = req.body;

        if (masterKey !== "Sirelis30") { 
        return res.status(403).json({ mensaje: "MasterKey incorrecta" });
    }

        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const sql = "INSERT INTO usuarios (username, password, rol) VALUES (?, ?, 'admin')";
            db.query(sql, [username, hashedPassword], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ mensaje: "Super Admin creado con éxito" });
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // RUTA DE LOGIN (Corregida y con Logs)
    router.post('/login', (req, res) => {
        const { username, password } = req.body;
        console.log("--> Intento de login para:", username);

        const sql = "SELECT * FROM usuarios WHERE username = ?";
        db.query(sql, [username], async (err, results) => {
            if (err) return res.status(500).json({ error: err.message });

            if (results.length === 0) {
                console.log("--> Error: Usuario no encontrado en la DB");
                return res.status(401).json({ mensaje: "Acceso denegado" });
            }

            const usuario = results[0];
            
            // Verificamos la contraseña
            const coinciden = await bcrypt.compare(password, usuario.password);
            console.log("--> ¿Contraseña coincide?:", coinciden);

            if (!coinciden) {
                console.log("--> Error: La contraseña no coincide con el Hash");
                return res.status(401).json({ mensaje: "Acceso denegado" });
            }

            // Generar Token
            try {
                const token = jwt.sign(
                    { id: usuario.id, username: usuario.username, rol: usuario.rol },
                    JWT_SECRET,
                    { expiresIn: '8h' }
                );

                console.log("--> Login Exitoso. Token generado.");
                res.json({
                    mensaje: "Bienvenido",
                    token: token,
                    user: { username: usuario.username, rol: usuario.rol }
                });
            } catch (jwtErr) {
                console.log("--> Error al generar JWT:", jwtErr.message);
                res.status(500).json({ error: "Error al generar la llave de acceso" });
            }
        });
    });

    return router;
};