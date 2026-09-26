require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ==============================================
// BANCO — SUPABASE
// ==============================================
const pool = new Pool({
  host: 'rurubtvjhtymhriwlrlr.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'leandrocanuto123',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const cliente = await pool.connect();
    console.log('✅ BANCO CONECTADO COM SUCESSO!');
    cliente.release();
  } catch (erro) {
    console.error('❌ ERRO NO BANCO:', erro.message);
  }
}
testarBanco();

// ==============================================
// ROTAS DO CARDÁPIO
// ==============================================

// Listar categorias
app.get('/api/menu/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM product_categories WHERE active = TRUE ORDER BY sort_order, name'
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Listar itens
app.get('/api/menu/items', async (req, res) => {
  try {
    const { category } = req.query;
    let query = `
      SELECT mi.*, pc.name as category_name 
      FROM menu_items mi
      LEFT JOIN product_categories pc ON mi.category_id = pc.id
      WHERE mi.available = TRUE
    `;
    const params = [];
    if (category) {
      params.push(category);
      query += ` AND mi.category_id = $${params.length}`;
    }
    query += ' ORDER BY mi.sort_order, mi.name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Criar pedido
app.post('/api/menu/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { customer_name, customer_phone, customer_address, observations, payment_method, items } = req.body;
    
    const total = items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
    
    const orderRes = await client.query(
      `INSERT INTO menu_orders 
       (customer_name, customer_phone, customer_address, observations, total_amount, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [customer_name, customer_phone, customer_address, observations, total, payment_method]
    );
    
    const order = orderRes.rows[0];
    
    for (const item of items) {
      await client.query(
        `INSERT INTO menu_order_items (order_id, menu_item_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.id, item.quantity, item.unit_price, item.quantity * item.unit_price]
      );
    }
    
    await client.query('COMMIT');
    
    // 🔔 Enviar aviso no WhatsApp para o admin
    await bot.avisarPedidoNoWhatsApp(order, items);
    
    res.status(201).json(order);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally {
    client.release();
  }
});

// ==============================================
// INICIAR BOT
// ==============================================
console.log('🔍 VARIÁVEIS:');
console.log('EVO_URL:', process.env.EVO_URL || '❌ FALTA');
console.log('EVO_KEY:', process.env.EVO_KEY ? '✅ OK' : '❌ FALTA');
console.log('EVO_INSTANCE:', process.env.EVO_INSTANCE || 'marmitaria');

bot.init(app, pool);

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORTA}`);
  console.log(`🍽️ CARDÁPIO DISPONÍVEL`);
});
