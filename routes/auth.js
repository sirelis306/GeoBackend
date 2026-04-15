const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = (db, JWT_SECRET) => {

    router.post('/setup-admin', async (req, res) => {
        const { username, password, masterKey } = req.body;

        if (masterKey !== "Sirelis30") {
            return res.status(403).json({ mensaje: "MasterKey incorrecta" });
        }

        try {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const sql = "INSERT INTO usuarios (username, primer_nombre, primer_apellido, email, password) VALUES (?, ?, 'Admin', ?, ?)";
            db.query(sql, [username, username, username, hashedPassword], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });

                // Asignar rol super_admin automáticamente
                const userId = result.insertId;
                const sqlRol = "INSERT INTO usuario_roles (usuario_id, rol_id) SELECT ?, id FROM roles WHERE nombre_rol = 'rol_super_administrador'";
                db.query(sqlRol, [userId], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ mensaje: "Super Admin creado con éxito" });
                });
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // RUTA DE LOGIN (Corregida y con Logs)
    router.post('/login', (req, res) => {
        const { username, password } = req.body;
        console.log("--> Intento de login para:", username);

        // Buscamos al usuario y sus roles concatenados
        const sql = `
            SELECT u.*, GROUP_CONCAT(r.nombre_rol) as lista_roles 
            FROM usuarios u
            LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
            LEFT JOIN roles r ON ur.rol_id = r.id
            WHERE u.email = ?
            GROUP BY u.id`;

        db.query(sql, [username], async (err, results) => {
            if (err) return res.status(500).json({ error: err.message });

            if (results.length === 0) {
                return res.status(401).json({ mensaje: "Acceso denegado" });
            }

            const usuario = results[0];
            const coinciden = await bcrypt.compare(password, usuario.password);

            if (!coinciden) {
                return res.status(401).json({ mensaje: "Acceso denegado" });
            }

            // Procesamos el string de roles para enviarlo al Frontend
            const rolesArr = usuario.lista_roles ? usuario.lista_roles.split(',') : [];
            const rolesObj = {
                rol_super_administrador: rolesArr.includes('rol_super_administrador'),
                rol_administrador: rolesArr.includes('rol_administrador'),
                rol_analista: rolesArr.includes('rol_analista'),
                rol_regular: rolesArr.includes('rol_regular')
            };

            try {
                // Generar Token con la nueva estructura
                const token = jwt.sign(
                    { id: usuario.id, email: usuario.email },
                    JWT_SECRET,
                    { expiresIn: '8h' }
                );

                res.json({
                    mensaje: "Bienvenido",
                    token: token,
                    user: {
                        primerNombre: usuario.primer_nombre,
                        primerApellido: usuario.primer_apellido,
                        email: usuario.email,
                        roles: rolesObj
                    }
                });
            } catch (jwtErr) {
                res.status(500).json({ error: "Error al generar la llave de acceso" });
            }
        });
    });

    return router;
};