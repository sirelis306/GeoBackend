const elementService = require('../services/element.service');

class ElementController {
  async getAll(req, res) {
    try {
      const elements = await elementService.getAllElements();
      res.json(elements);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getResumen(req, res) {
    try {
      const resumen = await elementService.getResumen();
      res.json(resumen);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async create(req, res) {
    try {
      const id = await elementService.saveElement(req.body);
      res.json({ mensaje: "Operación exitosa", id });
    } catch (error) {
      res.status(400).json({ mensaje: error.message });
    }
  }

  async updateCoords(req, res) {
    try {
      const { id } = req.params;
      const { latitud, longitud } = req.body;
      await elementService.updateCoordinates(id, latitud, longitud);
      res.json({ mensaje: "Coordenadas actualizadas con éxito" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      await elementService.updateElement(id, req.body);
      res.json({ mensaje: "Elemento actualizado con éxito" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;
      await elementService.deleteElement(id);
      res.json({ mensaje: "Elemento eliminado correctamente" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ElementController();
