require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot.js');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ==========================================
// BANCO DE DADOS — SUPABASE
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const c = await pool.connect();
    console.log('✅ Banco CONECTADO!');
    c.release();
  } catch(e) {
    console.error('❌ ERRO Banco:', e.message);
  }
}
testarBanco();

// ==========================================
// EVOLUTION API — BOT WHATSAPP
// ==========================================
const EVO_URL = process.env.EVO_URL?.replace(/\/$/, '');
const EVO_KEY = process.env.EVO_KEY;
const INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('🤖 Bot carregado | Instância:', INSTANCE);

async function enviarMensagem(numero, texto) {
  if (!EVO_URL || !EVO_KEY || !numero) return;
  try {
    const url = `${EVO_URL}/message/${INSTANCE}/sendText`;
    console.log('📤 Enviando para:', numero);

    await axios.post(url, {
      number: numero,
      text: texto
    }, {
      headers: { 'apikey': EVO_KEY }
    });

    console.log('✅ Resposta ENVIADA!');
  } catch(e) {
    console.error('❌ Erro envio:', e.response?.status, e.response?.data || e.message);
  }
}

// ==========================================
// WEBHOOK — CAMINHO CERTO
// ==========================================
app.post('/message/marmitaria/webhook', async (req, res) => {
  res.sendStatus(200);

  const { event, data } = req.body;
  console.log('📩 Evento:', event);

  if (event !== 'messages.upsert') return;

  const mensagem = data?.messages?.[0];
  if (!mensagem || mensagem.fromMe) return;

  const texto = (mensagem.conversation || mensagem.text || '');
  const remetente = mensagem.key?.remoteJid;
  const numero = remetente?.replace('@c.us', '').replace(/\D/g, '');

  console.log(`💬 ${numero}: ${texto}`);

  const resposta = await bot.responder(numero, texto);
  
  if (resposta && numero) {
    await enviarMensagem(numero, resposta);
  }
});

// ==========================================
// ROTAS — PRODUTOS / ESTOQUE
// ==========================================
app.get('/api/produtos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name AS nome, price AS preco, stock AS estoque
      FROM products ORDER BY id
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Produtos:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ==========================================
// ROTAS — CAIXA
// ==========================================
app.get('/api/resumo', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM cash_registers 
      WHERE status = 'aberto' 
      ORDER BY opened_at DESC LIMIT 1
    `);
    res.json({ caixaAberto: result.rows[0] || null });
  } catch (e) {
    console.error('Resumo:', e);
    res.status(500).json({ erro: e.message });
  }
});

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

// ==========================================
// ROTAS — PEDIDOS
// ==========================================
app.get('/api/pedidos', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM sales_orders ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (e) {
    console.error('Pedidos:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/pedidos/:id/itens', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT product_name AS nome_produto, quantity AS quantidade, unit_price AS preco_unitario 
      FROM order_items WHERE order_id = $1
    `, [req.params.id]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

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
    console.error('Venda:', e);
    res.status(500).json({ erro: e.message });
  } finally {
    client.release();
  }
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Webhook: /message/marmitaria/webhook`);
});
