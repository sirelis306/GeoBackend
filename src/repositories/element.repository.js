const db = require('../config/db.config');

class ElementRepository {
  async getAll() {
    const sql = `
      SELECT 
        el.*, 
        est.nombre AS estado, 
        reg.nombre AS region 
      FROM elementos el
      LEFT JOIN estados est ON el.estado_id = est.id
      LEFT JOIN regiones reg ON est.region_id = reg.id
      WHERE el.activo = 1
    `;
    const [rows] = await db.promise().query(sql);
    return rows;
  }

  async getResumen() {
    const sql = `
      SELECT 
        el.tipo,
        est.nombre AS estado,
        reg.nombre AS region,
        SUM(el.activo * el.cantidad) as total
      FROM elementos el
      LEFT JOIN estados est ON el.estado_id = est.id
      LEFT JOIN regiones reg ON est.region_id = reg.id
      WHERE el.activo = 1
      GROUP BY el.tipo, est.nombre, reg.nombre
    `;
    const [rows] = await db.promise().query(sql);
    return rows;
  }

  async findEstadoByName(nombre) {
    const sql = "SELECT id FROM estados WHERE nombre = ? LIMIT 1";
    const [rows] = await db.promise().query(sql, [nombre]);
    return rows[0];
  }

  async findAntenaByName(nombre) {
    const sql = "SELECT id FROM elementos WHERE tipo = 'antenas' AND nombre = ? AND activo = 1 LIMIT 1";
    const [rows] = await db.promise().query(sql, [nombre]);
    return rows[0];
  }

  async findAbonadoByEstado(estadoId) {
    const sql = "SELECT id, cantidad, segmentacion FROM elementos WHERE tipo = 'abonados' AND estado_id = ? AND activo = 1 LIMIT 1";
    const [rows] = await db.promise().query(sql, [estadoId]);
    return rows[0];
  }

  async findAgenteByCodigoDealer(codigoDealer) {
    const sql = "SELECT id FROM elementos WHERE tipo = 'agentes' AND codigo_dealer = ? AND activo = 1 LIMIT 1";
    const [rows] = await db.promise().query(sql, [codigoDealer]);
    return rows[0];
  }

  async findElementByTypeAndEstado(tipo, estadoId) {
    const sql = "SELECT id, cantidad FROM elementos WHERE tipo = ? AND estado_id = ? AND activo = 1 LIMIT 1";
    const [rows] = await db.promise().query(sql, [tipo, estadoId]);
    return rows[0];
  }

  async insert(data) {
    const sql = `INSERT INTO elementos 
      (nombre, tipo, estado_id, latitud, longitud, direccion, actividad, tecnologia, cantidad, segmentacion, codigo_dealer, clasificacion) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const values = [
      data.nombre, data.tipo, data.estado_id, data.latitud, data.longitud, 
      data.direccion, data.actividad || 'Operativa', data.tecnologia || null, 
      data.cantidad || 1, data.segmentacion || null, data.codigo_dealer || null, 
      data.clasificacion || null
    ];
    
    const [result] = await db.promise().query(sql, values);
    return result.insertId;
  }

  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    
    const sql = `UPDATE elementos SET ${setClause} WHERE id = ?`;
    await db.promise().query(sql, [...values, id]);
  }
}

module.exports = new ElementRepository();
