require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ==========================================
// BANCO DE DADOS
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
// EVOLUTION API — BOT WHATSAPP
// ==========================================
const EVO_URL = process.env.EVO_URL?.replace(/\/$/, '');
const EVO_KEY = process.env.EVO_KEY;
const INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('🤖 Bot configurado | Instância:', INSTANCE);

// Função de enviar mensagem
async function enviarMensagem(numero, texto) {
  if (!EVO_URL || !EVO_KEY || !numero) return;
  try {
    await axios.post(
      `${EVO_URL}/message/${INSTANCE}/sendText`,
      { number: numero, text: texto },
      { headers: { apikey: EVO_KEY } }
    );
    console.log('✅ Enviado para:', numero);
  } catch(e) {
    console.error('❌ Erro envio:', e.response?.data || e.message);
  }
}

// ROTA DO WEBHOOK — recebe mensagens do WhatsApp
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const { event, data } = req.body;
  console.log('📩 Evento recebido:', event);

  if (event !== 'messages.upsert') return;

  const mensagem = data?.messages?.[0];
  if (!mensagem || mensagem.fromMe) return;

  const texto = (mensagem.conversation || mensagem.text || '').trim().toLowerCase();
  const remetente = mensagem.key?.remoteJid;
  const numero = remetente?.replace('@c.us', '').replace(/\D/g, '');

  console.log(`💬 ${numero}: ${texto}`);

  // Lógica de respostas
  let resposta = '';

  if (!texto || ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(texto)) {
    resposta = 'Olá! Tudo bem? 😊\n\nSou o atendimento da Marmitaria!\n\nDigite:\n✅ *Cardápio* — ver opções\n✅ *Retirada* — pedir para buscar\n✅ *Entrega* — receber em casa\n✅ *Fiado* — controle de conta';
  }
  else if (texto.includes('cardápio') || texto.includes('cardapio')) {
    resposta = '📋 *CARDÁPIO:*\n🍽️ Marmita Pq — R$ 18,00\n🍽️ Marmita Md — R$ 22,00\n🍽️ Marmita Gr — R$ 26,00\n🍽️ Marmita Fit — R$ 24,00\n🥤 Suco — R$ 5,00\n🥤 Refri — R$ 4,50\n💧 Água — R$ 3,00\n🍮 Pudim — R$ 7,00\n\nDiga o que deseja!';
  }
  else if (texto.includes('retirada')) {
    resposta = 'Perfeito! ✅\nRetirada no balcão.\nSeg a Sex — 11h às 14h\nPode vir buscar!';
  }
  else if (texto.includes('entrega')) {
    resposta = 'Certo! 🚚\nTempo estimado: 40 a 60 min\nAvisa quando chegar!';
  }
  else if (texto.includes('fiado')) {
    resposta = 'Conta fiada liberada! ✅ Pode pedir!';
  }
  else {
    resposta = 'Entendi! 😊 Digite *Cardápio* para ver as opções';
  }

  // Envia a resposta
  if (resposta && numero) {
    await enviarMensagem(numero, resposta);
  }
});

// ==========================================
// ROTAS — CAIXA / PDV / PEDIDOS (as que você já tem)
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
    console.error('/api/resumo:', e);
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
      SELECT product_name as nome_produto, quantity as quantidade, unit_price as preco_unitario 
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
    console.error('Venda Manual:', e);
    res.status(500).json({ erro: e.message });
  } finally {
    client.release();
  }
});

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

// ==========================================
// INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Webhook: /webhook`);
  console.log(`📦 Instância: ${INSTANCE}`);
});
