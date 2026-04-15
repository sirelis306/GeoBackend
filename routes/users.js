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
    router.get('/listado', verificarToken, (req, res) => {
        // Esta consulta trae los datos nuevos y concatena los roles en un string
        const sql = `
            SELECT 
                u.id, 
                u.primer_nombre AS primerNombre, 
                u.primer_apellido AS primerApellido, 
                u.email,
                GROUP_CONCAT(r.nombre_rol) as lista_roles
            FROM usuarios u
            LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
            LEFT JOIN roles r ON ur.rol_id = r.id
            GROUP BY u.id
        `;

        db.query(sql, (err, result) => {
            if (err) {
                console.error("Error SQL:", err);
                return res.status(500).json(err);
            }

            // Convertimos el string "ROLE_ADMIN,ROLE_REGULAR" en el objeto booleano que espera Angular
            const usuariosProcesados = result.map(user => {
                const rolesArr = user.lista_roles ? user.lista_roles.split(',') : [];
                return {
                    ...user,
                    roles: {
                        rol_super_administrador: rolesArr.includes('rol_super_administrador'),
                        rol_administrador: rolesArr.includes('rol_administrador'),
                        rol_analista: rolesArr.includes('rol_analista'),
                        rol_regular: rolesArr.includes('rol_regular')
                    }
                };
            });

            res.json(usuariosProcesados);
        });
    });

    // Crear nuevo usuario con contraseña encriptada
    router.post('/crear', verificarToken, async (req, res) => {
        const u = req.body;
        // Insertar datos básicos del usuario
        const sqlUser = `INSERT INTO usuarios (primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, 
                        tipo_documento, documento, fecha_nacimiento, pais, estado, ciudad, direccion, sexo, email, cargo) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const values = [u.primerNombre, u.segundoNombre, u.primerApellido, u.segundoApellido,
        u.tipoDocumento, u.documento, u.fechaNacimiento, u.pais, u.estado, u.ciudad, u.direccion, u.sexo, u.email, u.cargo];

        db.query(sqlUser, values, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });

            const nuevoUsuarioId = result.insertId;

            // Mapear los roles seleccionados del objeto 
            const rolesSeleccionados = [];
            if (u.roles.rol_super_administrador) rolesSeleccionados.push('rol_super_administrador');
            if (u.roles.rol_administrador) rolesSeleccionados.push('rol_administrador');
            if (u.roles.rol_analista) rolesSeleccionados.push('rol_analista');
            if (u.roles.rol_regular) rolesSeleccionados.push('rol_regular');

            if (rolesSeleccionados.length === 0) return res.json({ mensaje: "Usuario creado sin roles" });

            // Insertar en la tabla pivote usuario_roles
            const sqlGetRoles = "SELECT id FROM roles WHERE nombre_rol IN (?)";
            db.query(sqlGetRoles, [rolesSeleccionados], (err, rolesData) => {
                if (err) return res.status(500).json({ error: err.message });

                const inserts = rolesData.map(r => [nuevoUsuarioId, r.id]);
                const sqlPivot = "INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ?";

                db.query(sqlPivot, [inserts], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ mensaje: "Usuario y roles creados con éxito" });
                });
            });
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