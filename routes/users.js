const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = (db, JWT_SECRET) => {

    // verifica token JWT
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

    // obtiene el rol del usuario del token
    const obtenerRolUsuario = (userId) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT r.nombre_rol FROM roles r
                INNER JOIN usuario_roles ur ON r.id = ur.rol_id
                WHERE ur.usuario_id = ?
            `;
            db.query(sql, [userId], (err, result) => {
                if (err) return reject(err);
                const roles = result.map(r => r.nombre_rol);
                resolve(roles);
            });
        });
    };

    // Generador de contraseña temporal
    const generarPasswordTemporal = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!';
        let pass = '';
        for (let i = 0; i < 10; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pass;
    };

    // Obtiene todos los roles disponibles
    router.get('/roles', verificarToken, (req, res) => {
        const sql = 'SELECT id, nombre_rol FROM roles';
        db.query(sql, (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        });
    });

    // Solo usuarios activos
    router.get('/listado', verificarToken, (req, res) => {
        const sql = `
            SELECT 
                u.id, 
                u.primer_nombre AS primerNombre, 
                u.primer_apellido AS primerApellido, 
                u.email,
                u.activo,
                u.cargo,
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

    // Crea usuario con password temporal
    router.post('/crear', verificarToken, async (req, res) => {
        try {
            const u = req.body;
            const creadorId = req.user.id;

            // Verificar rol del creador
            const rolesCreador = await obtenerRolUsuario(creadorId);
            const esSuperAdmin = rolesCreador.includes('rol_super_administrador');
            const esAdmin = rolesCreador.includes('rol_administrador');

            if (!esSuperAdmin && !esAdmin) {
                return res.status(403).json({ mensaje: "No tienes permiso para crear usuarios" });
            }

            // Admin no puede crear Super Admins ni Administradores
            if (!esSuperAdmin && esAdmin) {
                if (u.roles.rol_super_administrador || u.roles.rol_administrador) {
                    return res.status(403).json({ mensaje: "Un Administrador solo puede crear Analistas y Regulares" });
                }
            }

            // Verificar que el email no exista
            const [emailExistente] = await db.promise().query(
                'SELECT id FROM usuarios WHERE email = ?', [u.email]
            );
            if (emailExistente.length > 0) {
                return res.status(409).json({ mensaje: "Ya existe un usuario con ese email" });
            }

            // Generar y hashear contraseña temporal
            const passwordTemporal = generarPasswordTemporal();
            const salt = await bcrypt.genSalt(10);
            const passwordHasheado = await bcrypt.hash(passwordTemporal, salt);

            // Insertar usuario
            const sqlUser = `
                INSERT INTO usuarios (primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
                tipo_documento, documento, fecha_nacimiento, pais, estado, ciudad, direccion, sexo, email, cargo, password, activo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `;
            const values = [
                u.primerNombre, u.segundoNombre, u.primerApellido, u.segundoApellido,
                u.tipoDocumento, u.documento, u.fechaNacimiento, u.pais, u.estado,
                u.ciudad, u.direccion, u.sexo, u.email, u.cargo, passwordHasheado
            ];

            const [insertResult] = await db.promise().query(sqlUser, values);
            const nuevoUsuarioId = insertResult.insertId;

            // Mapear y asignar roles
            const rolesSeleccionados = [];
            if (u.roles.rol_super_administrador) rolesSeleccionados.push('rol_super_administrador');
            if (u.roles.rol_administrador) rolesSeleccionados.push('rol_administrador');
            if (u.roles.rol_analista) rolesSeleccionados.push('rol_analista');
            if (u.roles.rol_regular) rolesSeleccionados.push('rol_regular');

            if (rolesSeleccionados.length > 0) {
                const [rolesData] = await db.promise().query(
                    'SELECT id FROM roles WHERE nombre_rol IN (?)', [rolesSeleccionados]
                );
                const inserts = rolesData.map(r => [nuevoUsuarioId, r.id]);
                await db.promise().query('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ?', [inserts]);
            }

            // Cuando se configure el email, enviar passwordTemporal al correo del usuario
            res.json({
                mensaje: "Usuario creado con éxito",
                passwordTemporal: passwordTemporal  // Mostrar al admin para compartir con el usuario
            });

        } catch (err) {
            console.error("Error creando usuario:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // Borrado lógico (activo = 0)
    router.put('/desactivar/:id', verificarToken, async (req, res) => {
        try {
            const { id } = req.params;
            const creadorId = req.user.id;

            // Solo Super Admin puede desactivar usuarios
            const rolesCreador = await obtenerRolUsuario(creadorId);
            if (!rolesCreador.includes('rol_super_administrador')) {
                return res.status(403).json({ mensaje: "Solo un Super Administrador puede desactivar usuarios" });
            }

            // No permitir que el super admin se desactive a sí mismo
            if (parseInt(id) === creadorId) {
                return res.status(400).json({ mensaje: "No puedes desactivarte a ti mismo" });
            }

            await db.promise().query('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
            res.json({ mensaje: "Usuario desactivado correctamente" });

        } catch (err) {
            console.error("Error desactivando usuario:", err);
            res.status(500).json({ error: err.message });
        }
    });
    
    // Obtiene un usuario específico
    router.get('/obtener/:id', verificarToken, async (req, res) => {
        try {
            const { id } = req.params;
            const sql = `
                SELECT 
                    u.*, 
                    GROUP_CONCAT(r.nombre_rol) as lista_roles
                FROM usuarios u
                LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
                LEFT JOIN roles r ON ur.rol_id = r.id
                WHERE u.id = ?
                GROUP BY u.id
            `;
            const [rows] = await db.promise().query(sql, [id]);
            if (rows.length === 0) return res.status(404).json({ mensaje: "Usuario no encontrado" });
            
            const user = rows[0];
            const rolesArr = user.lista_roles ? user.lista_roles.split(',') : [];
            user.roles = {
                rol_super_administrador: rolesArr.includes('rol_super_administrador'),
                rol_administrador: rolesArr.includes('rol_administrador'),
                rol_analista: rolesArr.includes('rol_analista'),
                rol_regular: rolesArr.includes('rol_regular')
            };
            
            // Limpiar password y otros campos sensibles si fuera necesario
            delete user.password;
            
            // Renombrar campos y manejar nulos
            res.json({
                ...user,
                primerNombre: user.primer_nombre || '',
                segundoNombre: user.segundo_nombre || '',
                primerApellido: user.primer_apellido || '',
                segundoApellido: user.segundo_apellido || '',
                tipoDocumento: user.tipo_documento || null,
                documento: user.documento || '',
                fechaNacimiento: user.fecha_nacimiento ? new Date(user.fecha_nacimiento).toISOString().split('T')[0] : '',
                pais: user.pais || null,
                estado: user.estado || null,
                ciudad: user.ciudad || null,
                sexo: user.sexo || null,
                cargo: user.cargo || null,
                email: user.email || ''
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Actualiza un usuario
    router.put('/actualizar/:id', verificarToken, async (req, res) => {
        try {
            const { id } = req.params;
            const u = req.body;
            const editorId = req.user.id;

            const rolesEditor = await obtenerRolUsuario(editorId);
            const esSuperAdmin = rolesEditor.includes('rol_super_administrador');
            const esAdmin = rolesEditor.includes('rol_administrador');

            if (!esSuperAdmin && !esAdmin) {
                return res.status(403).json({ mensaje: "No tienes permiso para editar usuarios" });
            }

            const sqlUpdate = `
                UPDATE usuarios SET 
                    primer_nombre = ?, segundo_nombre = ?, primer_apellido = ?, segundo_apellido = ?,
                    tipo_documento = ?, documento = ?, fecha_nacimiento = ?, pais = ?, estado = ?, 
                    ciudad = ?, direccion = ?, sexo = ?, email = ?, cargo = ?
                WHERE id = ?
            `;
            const values = [
                u.primerNombre, u.segundoNombre, u.primerApellido, u.segundoApellido,
                u.tipoDocumento, u.documento, u.fechaNacimiento, u.pais, u.estado,
                u.ciudad, u.direccion, u.sexo, u.email, u.cargo, id
            ];

            await db.promise().query(sqlUpdate, values);

            // Actualizar roles
            await db.promise().query('DELETE FROM usuario_roles WHERE usuario_id = ?', [id]);
            const rolesSeleccionados = [];
            if (u.roles.rol_super_administrador) rolesSeleccionados.push('rol_super_administrador');
            if (u.roles.rol_administrador) rolesSeleccionados.push('rol_administrador');
            if (u.roles.rol_analista) rolesSeleccionados.push('rol_analista');
            if (u.roles.rol_regular) rolesSeleccionados.push('rol_regular');

            if (rolesSeleccionados.length > 0) {
                const [rolesData] = await db.promise().query(
                    'SELECT id FROM roles WHERE nombre_rol IN (?)', [rolesSeleccionados]
                );
                const inserts = rolesData.map(r => [id, r.id]);
                await db.promise().query('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ?', [inserts]);
            }

            res.json({ mensaje: "Usuario actualizado con éxito" });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};