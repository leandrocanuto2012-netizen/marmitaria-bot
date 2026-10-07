require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// BANCO DE DADOS
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// TESTE CONEXÃO
async function testarBanco() {
  try {
    const c = await pool.connect();
    console.log('✅ Banco conectado!');
    c.release();
  } catch(e) {
    console.error('❌ Erro Banco:', e.message);
  }
}
testarBanco();

// ==========================================
// ROTAS — CAIXA / PDV COMPLETO
// ==========================================

// Status do Caixa
app.get('/api/resumo', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM cash_registers 
      WHERE status = 'aberto' 
      ORDER BY opened_at DESC LIMIT 1
    `);
    res.json({ caixaAberto: result.rows[0] || null });
  } catch (e) {
    console.error('/api/resumo:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ABRIR CAIXA
app.post('/api/caixa/abrir', async (req, res) => {
  try {
    const { operador, saldo_inicial } = req.body;

    const aberto = await pool.query(`SELECT id FROM cash_registers WHERE status = 'aberto'`);
    if (aberto.rows.length > 0) {
      return res.status(400).json({ erro: 'Já existe um caixa aberto!' });
    }

    const result = await pool.query(`
      INSERT INTO cash_registers (operator_name, opening_balance, status, opened_at)
      VALUES ($1, $2, 'aberto', NOW())
      RETURNING *
    `, [operador, saldo_inicial || 0]);

    res.json({ sucesso: true, caixa: result.rows[0] });
  } catch (e) {
    console.error('Abrir Caixa:', e);
    res.status(500).json({ erro: e.message });
  }
});

// FECHAR CAIXA
app.post('/api/caixa/fechar', async (req, res) => {
  try {
    const { saldo_contado, saldo_sistema, diferenca } = req.body;

    const result = await pool.query(`
      UPDATE cash_registers 
      SET status = 'fechado', closing_balance = $1, counted_balance = $2, difference = $3, closed_at = NOW()
      WHERE status = 'aberto'
      RETURNING *
    `, [saldo_sistema, saldo_contado, diferenca]);

    if (result.rows.length === 0) {
      return res.status(404).json({ erro: 'Nenhum caixa aberto!' });
    }

    res.json({ sucesso: true, caixa: result.rows[0] });
  } catch (e) {
    console.error('Fechar Caixa:', e);
    res.status(500).json({ erro: e.message });
  }
});

// LISTAR PEDIDOS
app.get('/api/pedidos', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM sales_orders ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (e) {
    console.error('Pedidos:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ITENS DO PEDIDO
app.get('/api/pedidos/:id/itens', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT product_name as nome_produto, quantity as quantidade, unit_price as preco_unitario 
      FROM order_items WHERE order_id = $1
    `, [req.params.id]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// REGISTRAR VENDA + BAIXA DE ESTOQUE
app.post('/api/pedidos/manual', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { nome_cliente, telefone_cliente, tipo, observacao, valor_total, itens, status } = req.body;

    const pedido = await client.query(`
      INSERT INTO sales_orders (customer_name, customer_phone, order_type, observation, total_amount, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id
    `, [nome_cliente, telefone_cliente, tipo, observacao, valor_total, status]);

    const pedidoId = pedido.rows[0].id;

    for (const item of itens) {
      await client.query(`
        INSERT INTO order_items (order_id, product_name, quantity, unit_price)
        VALUES ($1, $2, $3, $4)
      `, [pedidoId, item.nome_produto, item.quantidade, item.preco_unitario]);

      await client.query(`
        UPDATE products SET stock = stock - $1 WHERE name = $2
      `, [item.quantidade, item.nome_produto]);
    }

    await client.query('COMMIT');
    res.json({ sucesso: true, id: pedidoId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Venda Manual:', e);
    res.status(500).json({ erro: e.message });
  } finally {
    client.release();
  }
});

// Listar produtos para o cardápio
app.get('/api/produtos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name, price, stock 
      FROM products 
      ORDER BY id
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Cardápio:', e);
    res.status(500).json({ erro: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
