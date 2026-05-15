const elementRepository = require('../repositories/element.repository');

class ElementService {
  async getAllElements() {
    return await elementRepository.getAll();
  }

  async getResumen() {
    return await elementRepository.getResumen();
  }

  async saveElement(data) {
    const estado = await elementRepository.findEstadoByName(data.estado);
    if (!estado) {
      throw new Error(`Estado '${data.estado}' no encontrado.`);
    }
    
    data.estado_id = estado.id;
    
    // Logic by type (Adhering to OCP - although ideally we'd use strategies)
    switch (data.tipo) {
      case 'antenas':
        return await this.handleAntena(data);
      case 'abonados':
        return await this.handleAbonado(data);
      case 'agentes':
        return await this.handleAgente(data);
      default:
        return await this.handleGenericElement(data);
    }
  }

  async handleAntena(data) {
    const existing = await elementRepository.findAntenaByName(data.nombre);
    if (existing) {
      throw new Error("Ya existe una antena registrada con ese nombre.");
    }
    data.tecnologia = Array.isArray(data.tecnologia) ? data.tecnologia.join(' / ') : data.tecnologia;
    data.cantidad = 1;
    return await elementRepository.insert(data);
  }

  async handleAbonado(data) {
    const existing = await elementRepository.findAbonadoByEstado(data.estado_id);
    if (existing) {
      const segActual = existing.segmentacion || "3G:0 | 4G:0 | 5G:0";
      let match3G = segActual.match(/3G:(\d+)/);
      let match4G = segActual.match(/4G:(\d+)/);
      let match5G = segActual.match(/5G:(\d+)/);
      let s3 = match3G ? parseInt(match3G[1]) : 0;
      let s4 = match4G ? parseInt(match4G[1]) : 0;
      let s5 = match5G ? parseInt(match5G[1]) : 0;
      
      const cantNueva = Number(data.cantidad);
      if (data.segmentacion === '3G') s3 += cantNueva;
      if (data.segmentacion === '4G') s4 += cantNueva;
      if (data.segmentacion === '5G') s5 += cantNueva;

      const nuevaSegString = `3G:${s3} | 4G:${s4} | 5G:${s5}`;
      const nuevaCantidadTotal = s3 + s4 + s5;
      
      await elementRepository.update(existing.id, { 
        cantidad: nuevaCantidadTotal, 
        segmentacion: nuevaSegString 
      });
      return existing.id;
    } else {
      let s3 = (data.segmentacion === '3G') ? data.cantidad : 0;
      let s4 = (data.segmentacion === '4G') ? data.cantidad : 0;
      let s5 = (data.segmentacion === '5G') ? data.cantidad : 0;
      data.segmentacion = `3G:${s3} | 4G:${s4} | 5G:${s5}`;
      return await elementRepository.insert(data);
    }
  }

  async handleAgente(data) {
    const existing = await elementRepository.findAgenteByCodigoDealer(data.codigoDealer);
    if (existing) {
      throw new Error("Este Código Dealer ya se encuentra registrado.");
    }
    data.codigo_dealer = data.codigoDealer;
    data.cantidad = 1;
    return await elementRepository.insert(data);
  }

  async handleGenericElement(data) {
    const existing = await elementRepository.findElementByTypeAndEstado(data.tipo, data.estado_id);
    if (existing) {
      const nuevaCantidadTotal = Number(existing.cantidad) + Number(data.cantidad);
      await elementRepository.update(existing.id, { cantidad: nuevaCantidadTotal });
      return existing.id;
    } else {
      return await elementRepository.insert(data);
    }
  }

  async updateCoordinates(id, latitud, longitud) {
    await elementRepository.update(id, { latitud, longitud });
  }
}

module.exports = new ElementService();
