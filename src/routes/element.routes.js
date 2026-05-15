const express = require('express');
const router = express.Router();
const elementController = require('../controllers/element.controller');
const { verificarToken } = require('../middleware/auth.middleware');

router.get('/', verificarToken, elementController.getAll);
router.get('/resumen', verificarToken, elementController.getResumen);
router.post('/', verificarToken, elementController.create);
router.put('/:id/coordenadas', verificarToken, elementController.updateCoords);

module.exports = router;
