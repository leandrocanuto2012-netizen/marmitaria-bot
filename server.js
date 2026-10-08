require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const bot = require('./bot.js'); // ✅ BOT SEPARADO — NÃO MEXE!

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ==========================================
// BANCO
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
    console.error('❌ Erro Banco:', e.message);
  }
}
testarBanco();

// ==========================================
// EVOLUTION / BOT — INTACTO!
// ==========================================
const EVO_URL = process.env.EVO_URL?.replace(/\/$/, '');
const EVO_KEY = process.env.EVO_KEY;
const INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

console.log('🤖 Bot carregado | Instância:', INSTANCE);

async function enviarMensagem(numero, texto) {
  if (!EVO_URL || !EVO_KEY || !numero) return;
  try {
    const url = `${EVO_URL}/message/${INSTANCE}/sendText`;
    await axios.post(url, { number: numero, text: texto }, { headers: { 'apikey': EVO_KEY } });
    console.log('✅ Enviado para:', numero);
  } catch(e) {
    console.error('❌ Erro envio:', e.response?.status, e.response?.data || e.message);
  }
}

// Webhook — DOIS caminhos para garantir
async function processarWebhook(corpo) {
  const { event, data } = corpo;
  console.log('📩 Evento:', event);
  if (event !== 'messages.upsert') return;
  
  const mensagem = data?.messages?.[0];
  if (!mensagem || mensagem.fromMe) return;
  
  const texto = (mensagem.conversation || mensagem.text || '');
  const numero = mensagem.key?.remoteJid?.replace('@c.us', '').replace(/\D/g, '');
  
  console.log(`💬 ${numero}: ${texto}`);
  const resposta = await bot.responder(numero, texto); // ✅ CHAMA bot.js
  if (resposta && numero) await enviarMensagem(numero, resposta);
}

app.post('/webhook', (req, res) => { res.sendStatus(200); processarWebhook(req.body); });
app.post('/message/marmitaria/webhook', (req, res) => { res.sendStatus(200); processarWebhook(req.body); });

// ==========================================
// 🔧 PRODUTOS — CORRIGIDO (DOIS FORMATOS)
// ==========================================
app.get('/api/produtos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        name, name AS nome,
        price, price AS preco,
        stock, stock AS estoque
      FROM products ORDER BY id
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Produtos:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ==========================================
// 🔧 CAIXA — CORRIGIDO COM company_id
// ==========================================
app.get('/api/resumo', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM cash_registers 
      WHERE status = 'aberto' ORDER BY opened_at DESC LIMIT 1
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
    const empresa = await pool.query(`SELECT id FROM companies LIMIT 1`);
    if (empresa.rows.length === 0) return res.status(400).json({ erro: 'Nenhuma empresa cadastrada!' });
    const company_id = empresa.rows[0].id;

    const aberto = await pool.query(
      `SELECT id FROM cash_registers WHERE status = 'aberto' AND company_id = $1`,
      [company_id]
    );
    if (aberto.rows.length > 0) return res.status(400).json({ erro: 'Já existe um caixa aberto!' });

    const result = await pool.query(`
      INSERT INTO cash_registers (company_id, operator_name, opening_balance, status, opened_at)
      VALUES ($1, $2, $3, 'aberto', NOW()) RETURNING *
    `, [company_id, operador, saldo_inicial || 0]);

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
      WHERE status = 'aberto' RETURNING *
    `, [saldo_sistema, saldo_contado, diferenca]);
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Nenhum caixa aberto!' });
    res.json({ sucesso: true, caixa: result.rows[0] });
  } catch (e) {
    console.error('Fechar Caixa:', e);
    res.status(500).json({ erro: e.message });
  }
});

// ==========================================
// PEDIDOS
// ==========================================
app.get('/api/pedidos', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM sales_orders ORDER BY created_at DESC`);
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
    const empresa = await client.query(`SELECT id FROM companies LIMIT 1`);
    const company_id = empresa.rows[0].id;

    const pedido = await client.query(`
      INSERT INTO sales_orders (company_id, customer_name, customer_phone, order_type, observation, total_amount, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id
    `, [company_id, nome_cliente, telefone_cliente, tipo, observacao, valor_total, status]);
    const pedidoId = pedido.rows[0].id;

    for (const item of itens) {
      await client.query(`
        INSERT INTO order_items (order_id, product_name, quantity, unit_price)
        VALUES ($1, $2, $3, $4)
      `, [pedidoId, item.nome_produto || item.nome, item.quantidade, item.preco_unitario || item.preco]);
      
      await client.query(`
        UPDATE products SET stock = stock - $1 WHERE name = $2
      `, [item.quantidade, item.nome_produto || item.nome]);
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
// 📅 CARDÁPIO DO DIA
// ==========================================

// Carregar cardápio do dia
app.get('/api/cardapio-dia', async (req, res) => {
  try {
    const { data } = req.query;
    const dataAlvo = data || new Date().toISOString().split('T')[0];
    const empresa = await pool.query(`SELECT id FROM companies LIMIT 1`);
    if (empresa.rows.length === 0) return res.json([]);

    const result = await pool.query(`
      SELECT id, nome, descricao, preco, categoria, disponivel, ordem
      FROM daily_menu
      WHERE company_id = $1 AND data = $2 AND disponivel = true
      ORDER BY categoria, ordem, nome
    `, [empresa.rows[0].id, dataAlvo]);

    res.json(result.rows);
  } catch (e) {
    console.error('Cardápio dia:', e);
    res.status(500).json({ erro: e.message });
  }
});

// Salvar/atualizar item do cardápio
app.post('/api/cardapio-dia/salvar', async (req, res) => {
  try {
    const { data, nome, descricao, preco, categoria, disponivel, ordem } = req.body;
    const empresa = await pool.query(`SELECT id FROM companies LIMIT 1`);
    if (empresa.rows.length === 0) return res.status(400).json({ erro: 'Empresa não cadastrada' });

    const result = await pool.query(`
      INSERT INTO daily_menu (company_id, data, nome, descricao, preco, categoria, disponivel, ordem)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (company_id, data, nome) DO UPDATE SET
        descricao = EXCLUDED.descricao,
        preco = EXCLUDED.preco,
        categoria = EXCLUDED.categoria,
        disponivel = EXCLUDED.disponivel,
        ordem = EXCLUDED.ordem
      RETURNING *
    `, [empresa.rows[0].id, data || new Date().toISOString().split('T')[0],
        nome, descricao || '', preco, categoria || 'Prato Principal',
        disponivel !== false, ordem || 0]);

    res.json({ sucesso: true, item: result.rows[0] });
  } catch (e) {
    console.error('Salvar cardápio:', e);
    res.status(500).json({ erro: e.message });
  }
});

// Listar produtos para dropdown do PDV
app.get('/api/produtos/lista', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name AS nome, price AS preco, stock AS estoque
      FROM products
      WHERE stock > 0
      ORDER BY name
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Lista produtos:', e);
    res.status(500).json({ erro: e.message });
  }
});
// ==========================================
// 🗑️ EXCLUIR item do cardápio
// ==========================================
app.post('/api/cardapio-dia/excluir', async (req, res) => {
  try {
    const { id } = req.body;
    const empresa = await pool.query(`SELECT id FROM companies LIMIT 1`);
    if (empresa.rows.length === 0) return res.status(400).json({ erro: 'Empresa não cadastrada' });

    const result = await pool.query(`
      DELETE FROM daily_menu
      WHERE id = $1 AND company_id = $2
      RETURNING *
    `, [id, empresa.rows[0].id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ sucesso: false, erro: 'Item não encontrado' });
    }

    res.json({ sucesso: true });
  } catch (e) {
    console.error('Excluir cardápio:', e);
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});
// ==========================================
// PAINEL ADM — pede senha
// ==========================================
function abrirAdm() {
  const senha = prompt('🔒 Digite a senha ADM:');
  const SENHA_ADM = 'admin123'; // ← ALTERE A SENHA AQUI SE QUISER
  
  if (senha === SENHA_ADM) {
    sessionStorage.setItem('adm_liberado', 'sim');
    window.location.href = '../dashboard.html';
  } else if (senha !== null) {
    alert('❌ Senha incorreta!');
  }
}
// ==========================================
// INICIAR
// ==========================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor na porta ${PORT}`);
  console.log(`🔗 Webhook: /webhook e /message/marmitaria/webhook`);
});
