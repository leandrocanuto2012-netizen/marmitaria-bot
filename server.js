require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// ⚙️ CONFIGURAÇÃO
const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL,
  EVO_URL: process.env.EVO_URL?.replace(/\/$/, ''),
  EVO_KEY: process.env.EVO_KEY,
  INSTANCE_NAME: process.env.EVO_INSTANCE || 'marmitaria',
  WEBHOOK_PATH: process.env.WEBHOOK_PATH || '/message/marmitaria/webhook',
  PORT: process.env.PORT || 8080
};

console.log('========================================');
console.log('🍽️ MARMITARIA SISTEMA — ONLINE');
console.log('🗄️ Banco:', CONFIG.DATABASE_URL?.replace(/:.*@/, ':***@'));
console.log('🏪 Instância:', CONFIG.INSTANCE_NAME);
console.log('🔗 Webhook:', CONFIG.WEBHOOK_PATH);
console.log('========================================');

// 🗄️ BANCO
const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 🧹 Limpar telefone
function limparTelefone(numero) {
  if (!numero) return null;
  return numero.toString().replace(/\D/g, '');
}

// 📤 ENVIAR MENSAGEM
async function enviarMensagem(telefone, texto) {
  if (!CONFIG.EVO_URL || !CONFIG.EVO_KEY) return false;
  const numeroLimpo = limparTelefone(telefone);
  if (!numeroLimpo) return false;

  try {
    await axios.post(
      `${CONFIG.EVO_URL}/message/sendText/${CONFIG.INSTANCE_NAME}`,
      { number: numeroLimpo, text: texto },
      { headers: { apikey: CONFIG.EVO_KEY, 'Content-Type': 'application/json' } }
    );
    await pool.query(
      'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
      [numeroLimpo, texto, 'bot']
    );
    return true;
  } catch (e) {
    console.error('❌ Erro envio:', e.response?.data || e.message);
    return false;
  }
}

// 📥 WEBHOOK — RECEBER MENSAGENS
app.post(CONFIG.WEBHOOK_PATH, async (req, res) => {
  const { event, data } = req.body;
  console.log('📥 Evento:', event);

  try {
    if (event === 'messages.upsert') {
      const msg = data?.message;
      if (!msg || msg.key?.fromMe) return res.sendStatus(200);

      const telefone = limparTelefone(msg.key?.remoteJid || data?.remoteJid || msg.participant);
      const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || data?.text || '';

      if (!telefone || !texto) return res.sendStatus(200);

      console.log(`💬 ${telefone}: ${texto.substring(0, 60)}`);
      await pool.query(
        'INSERT INTO mensagens (telefone, texto, remetente) VALUES ($1, $2, $3)',
        [telefone, texto, 'cliente']
      );

      // Processa com o bot
      const resposta = await bot.processar(telefone, texto, pool);
      if (resposta) await enviarMensagem(telefone, resposta);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('❌ Erro:', e.message);
    res.sendStatus(200);
  }
});

// ===== API DO SISTEMA =====

// Listar produtos do cardápio
app.get('/api/produtos', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM produtos WHERE ativo = true ORDER BY categoria, nome');
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Criar pedido
app.post('/api/pedidos', async (req, res) => {
  const { telefone, nome, itens, tipo, observacao } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Calcular valor total
    let valorTotal = 0;
    for (const item of itens) {
      const { rows } = await client.query('SELECT preco FROM produtos WHERE id = $1', [item.produto_id]);
      if (rows.length) valorTotal += rows[0].preco * item.quantidade;
    }

    // Inserir pedido
    const pedido = await client.query(
      `INSERT INTO pedidos (telefone_cliente, nome_cliente, valor_total, tipo, observacao)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, valor_total, created_at`,
      [telefone, nome, valorTotal, tipo, observacao]
    );
    const pedidoId = pedido.rows[0].id;

    // Inserir itens e baixar estoque
    for (const item of itens) {
      const prod = await client.query('SELECT preco, estoque_atual FROM produtos WHERE id = $1', [item.produto_id]);
      if (!prod.rows.length || prod.rows[0].estoque_atual < item.quantidade) {
        throw new Error(`Estoque insuficiente: ${item.produto_id}`);
      }
      await client.query(
        'INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario) VALUES ($1, $2, $3, $4)',
        [pedidoId, item.produto_id, item.quantidade, prod.rows[0].preco]
      );
      await client.query(
        'UPDATE produtos SET estoque_atual = estoque_atual - $1 WHERE id = $2',
        [item.quantidade, item.produto_id]
      );
    }

    await client.query('COMMIT');
    
    // Avisar no WhatsApp
    await enviarMensagem(telefone, `✅ Pedido recebido!\n\nPedido #${pedidoId}\nValor: R$ ${valorTotal.toFixed(2)}\nEm breve estará pronto! 🥘`);
    
    res.json({ sucess: true, pedidoId, valorTotal });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally {
    client.release();
  }
});

// Listar pedidos
app.get('/api/pedidos', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pedidos ORDER BY created_at DESC LIMIT 30');
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Atualizar status do pedido
app.patch('/api/pedidos/:id/status', async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;
  try {
    const pedido = await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    
    // Avisar cliente
    if (pedido.rows[0].telefone_cliente) {
      const msg = status === 'pronto' ? '✅ Seu pedido está PRONTO! Pode retirar! 🍽️' :
                  status === 'entregue' ? '✅ Pedido entregue! Obrigado! 🙏' :
                  `📦 Pedido #${id}: ${status}`;
      await enviarMensagem(pedido.rows[0].telefone_cliente, msg);
    }
    
    res.json(pedido.rows[0]);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Abertura de caixa
app.post('/api/caixa/abrir', async (req, res) => {
  const { operador, saldoInicial } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO caixa (operador, saldo_inicial) VALUES ($1, $2) RETURNING *',
      [operador, saldoInicial]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Fechamento de caixa
app.post('/api/caixa/fechar', async (req, res) => {
  try {
    const caixa = await pool.query("SELECT * FROM caixa WHERE status = 'aberto' ORDER BY id DESC LIMIT 1");
    if (!caixa.rows.length) return res.status(400).json({ erro: 'Nenhum caixa aberto' });
    
    const movs = await pool.query("SELECT SUM(valor) FROM caixa_movimentos WHERE caixa_id = $1", [caixa.rows[0].id]);
    const totalMov = parseFloat(movs.rows[0].sum || 0);
    const saldoFinal = parseFloat(caixa.rows[0].saldo_inicial) + totalMov;
    
    const { rows } = await pool.query(
      'UPDATE caixa SET status = $1, saldo_final = $2, fechamento = NOW() WHERE id = $3 RETURNING *',
      ['fechado', saldoFinal, caixa.rows[0].id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Registrar venda no caixa
app.post('/api/caixa/movimento', async (req, res) => {
  const { tipo, valor, descricao } = req.body;
  try {
    const caixa = await pool.query("SELECT id FROM caixa WHERE status = 'aberto' ORDER BY id DESC LIMIT 1");
    if (!caixa.rows.length) return res.status(400).json({ erro: 'Caixa fechado' });
    
    const { rows } = await pool.query(
      'INSERT INTO caixa_movimentos (caixa_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4) RETURNING *',
      [caixa.rows[0].id, tipo, valor, descricao]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Resumo geral
app.get('/api/resumo', async (req, res) => {
  try {
    const vendas = await pool.query("SELECT COALESCE(SUM(valor_total),0) as total FROM pedidos WHERE DATE(created_at) = CURRENT_DATE");
    const caixa = await pool.query("SELECT * FROM caixa WHERE status = 'aberto' ORDER BY id DESC LIMIT 1");
    res.json({
      vendasHoje: parseFloat(vendas.rows[0].total),
      caixaAberto: caixa.rows[0] || null
    });
  } catch (e) { res.json({ erro: e.message }); }
});

// Página inicial
app.get('/', (req, res) => {
  res.send(`
    <h1>🍽️ Sistema Marmitária</h1>
    <p><a href="/cardapio.html">📋 Cardápio Digital</a></p>
    <p><a href="/pdv/caixa.html">💰 Caixa / PDV</a></p>
    <p><a href="/pdv/estoque.html">📦 Controle de Estoque</a></p>
    <p><a href="/pdv/vendas.html">🛒 Pedidos</a></p>
  `);
});

app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${CONFIG.PORT}`);
});
