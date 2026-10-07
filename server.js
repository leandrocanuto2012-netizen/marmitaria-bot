require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testarBanco() {
  try {
    const client = await pool.connect();
    console.log('✅ Banco conectado!');
    client.release();
  } catch (e) {
    console.error('❌ Erro Banco:', e.message);
  }
}
testarBanco();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    const result = await pool.query(`SELECT id, nome, email, senha_hash, cargo, ativo FROM funcionarios WHERE (usuario = $1 OR email = $1) AND ativo = TRUE LIMIT 1`, [usuario]);
    if (result.rows.length === 0) return res.status(401).json({ erro: 'Usuário não encontrado ou inativo' });
    const user = result.rows[0];
    if (senha === user.senha_hash) {
      res.json({ ok: true, id: user.id, nome: user.nome, perfil: user.cargo || 'comum' });
    } else {
      res.status(401).json({ erro: 'Senha incorreta' });
    }
  } catch (e) {
    console.error('Login:', e);
    res.status(500).json({ erro: 'Erro no servidor' });
  }
});

app.get('/api/cardapio', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM pratos WHERE ativo = TRUE ORDER BY categoria, nome`);
    res.json(result.rows);
  } catch (e) {
    console.error('Cardápio:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/caixa/atual', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM caixas WHERE status = 'aberto' ORDER BY data_abertura DESC LIMIT 1`);
    if (result.rows.length === 0) return res.json({ aberto: false });
    const caixa = result.rows[0];
    const movs = await pool.query(`SELECT * FROM caixa_movimentos WHERE caixa_id = $1 ORDER BY created_at DESC`, [caixa.id]);
    let valor_esperado = parseFloat(caixa.valor_inicial);
    movs.rows.forEach(m => {
      if (m.tipo === 'entrada') valor_esperado += parseFloat(m.valor);
      if (m.tipo === 'saida') valor_esperado -= parseFloat(m.valor);
    });
    res.json({ aberto: true, caixa: { ...caixa, valor_esperado, movimentos: movs.rows } });
  } catch (e) {
    console.error('Caixa atual:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/caixa/abrir', async (req, res) => {
  try {
    const { operador_nome, valor_inicial } = req.body;
    const existe = await pool.query(`SELECT id FROM caixas WHERE status = 'aberto' LIMIT 1`);
    if (existe.rows.length > 0) return res.status(400).json({ erro: 'Já existe um caixa aberto!' });
    const result = await pool.query(`INSERT INTO caixas (operador_nome, valor_inicial, valor_esperado, status) VALUES ($1, $2, $2, 'aberto') RETURNING *`, [operador_nome, parseFloat(valor_inicial) || 0]);
    res.json({ ok: true, caixa: result.rows[0] });
  } catch (e) {
    console.error('Abrir caixa:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/caixa/movimento', async (req, res) => {
  try {
    const { caixa_id, tipo, valor, descricao, forma_pagamento, usuario } = req.body;
    await pool.query(`INSERT INTO caixa_movimentos (caixa_id, tipo, valor, descricao, forma_pagamento, usuario) VALUES ($1, $2, $3, $4, $5, $6)`, [caixa_id, tipo, valor, descricao, forma_pagamento, usuario]);
    const caixa = await pool.query(`SELECT valor_esperado FROM caixas WHERE id = $1`, [caixa_id]);
    if (!caixa.rows.length) return res.status(404).json({ erro: 'Caixa não encontrado' });
    let novoValor = parseFloat(caixa.rows[0].valor_esperado);
    if (tipo === 'entrada') novoValor += parseFloat(valor);
    if (tipo === 'saida') novoValor -= parseFloat(valor);
    await pool.query(`UPDATE caixas SET valor_esperado = $1 WHERE id = $2`, [novoValor, caixa_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Movimento:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/caixa/fechar', async (req, res) => {
  try {
    const { caixa_id, valor_conferido, observacao } = req.body;
    const caixa = await pool.query(`SELECT * FROM caixas WHERE id = $1`, [caixa_id]);
    if (!caixa.rows.length) return res.status(404).json({ erro: 'Caixa não encontrado' });
    if (caixa.rows[0].status !== 'aberto') return res.status(400).json({ erro: 'Este caixa já está fechado!' });
    const esperado = parseFloat(caixa.rows[0].valor_esperado);
    const conferido = parseFloat(valor_conferido);
    const divergencia = conferido - esperado;
    const result = await pool.query(`UPDATE caixas SET data_fechamento = NOW(), valor_conferido = $1, divergencia = $2, status = 'fechado', observacao = $3 WHERE id = $4 RETURNING *`, [conferido, divergencia, observacao || null, caixa_id]);
    let mensagem = '✅ Caixa fechado com sucesso!';
    if (divergencia > 0) mensagem = `⚠️ Sobrou R$ ${divergencia.toFixed(2)}`;
    if (divergencia < 0) mensagem = `⚠️ Faltou R$ ${Math.abs(divergencia).toFixed(2)}`;
    res.json({ ok: true, caixa: result.rows[0], mensagem });
  } catch (e) {
    console.error('Fechar caixa:', e);
    res.status(500).json({ erro: e.message });
  }
});

app.get('/api/resumo', async (req, res) => {
  try {
    const caixa = await pool.query(`SELECT id, operador_nome, data_abertura, status FROM caixas WHERE status = 'aberto' ORDER BY data_abertura DESC LIMIT 1`);
    res.json({ caixaAberto: caixa.rows[0] || null });
  } catch (e) {
    res.json({ erro: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Banco: ${process.env.DATABASE_URL ? '✅ Conectado' : '❌ Sem DATABASE_URL'}`);
});
