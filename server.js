// server.js COMPLETO - Marmitaria-bot - mantém seu layout e liga o bot
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;
const NOME_LOJA = process.env.NOME_LOJA || 'Marmitaria';

// ===== SERVE SUAS TELAS IGUAIS DO PUBLIC (NÃO MUDA NADA) =====
app.use(express.static(path.join(__dirname, 'public')));
app.use('/pdv', express.static(path.join(__dirname, 'public/pdv')));

// Garante que abre as telas certas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/cardapio', (req, res) => res.sendFile(path.join(__dirname, 'public/cardapio.html')));
app.get('/pedido', (req, res) => res.sendFile(path.join(__dirname, 'public/pedido.html')));
app.get('/admin-cardapio', (req, res) => res.sendFile(path.join(__dirname, 'public/admin-cardapio.html')));

// ===== LOGIN SIMPLES (usa seu login.html igual) =====
const USER = process.env.LOGIN_USER || 'admin';
const PASS = process.env.LOGIN_PASS || '1234';

app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === USER && pass === PASS) return res.json({ ok: true });
  return res.json({ ok: false, msg: 'Login inválido' });
});

// ===== BANCO COMPARTILHADO COM O BOT (sincronizado) =====
function lerJson(arq, padrao) {
  try {
    if (fs.existsSync(arq)) return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch (e) {}
  return padrao;
}

// Pedidos do bot + pedidos do PDV ficam juntos
app.get('/api/dados', (req, res) => {
  const pedidosBot = lerJson('./pedidos-bot.json', []);
  const pedidosSite = lerJson('./pedidos.json', []);
  const caixaBot = lerJson('./caixa-bot.json', []);
  const caixaSite = lerJson('./caixa.json', []);

  const todosPedidos = [...pedidosSite, ...pedidosBot];
  const todoCaixa = [...caixaSite, ...caixaBot];
  const totalCaixa = todoCaixa.reduce((s, v) => s + (Number(v.total) || 0), 0);

  res.json({
    loja: NOME_LOJA,
    pedidos: [...todosPedidos].reverse(),
    caixa: [...todoCaixa].reverse(),
    totalCaixa,
    qtdPedidos: todosPedidos.length,
    qtdCaixa: todoCaixa.length
  });
});

// Pedido vindo do PDV / balcão cai no mesmo lugar do WhatsApp
app.post('/api/novo-pedido', (req, res) => {
  try {
    let pedidos = lerJson('./pedidos.json', []);
    const b = req.body || {};
    const id = String(Date.now()).slice(-5);
    const novo = {
      id,
      nome: b.nome || b.clienteNome || 'Balcão',
      jid: 'PDV',
      clienteNome: b.nome || b.clienteNome || 'Balcão',
      itens: b.itensTexto || b.itens || '',
      itensTexto: b.itensTexto || b.itens || '',
      total: Number(b.total) || 0,
      tam: b.tamanho || b.tam || 'M',
      tamanho: b.tamanho || b.tam || 'M',
      rest: b.restricao || b.rest || 'Nenhuma',
      restricao: b.restricao || b.rest || 'Nenhuma',
      end: b.endereco || b.end || 'Balcão',
      endereco: b.endereco || b.end || 'Balcão',
      pagamento: b.pagamento || b.pag || 'Dinheiro',
      pag: b.pagamento || b.pag || 'Dinheiro',
      status: 'NOVO',
      tempo: '',
      data: new Date().toLocaleString('pt-BR')
    };
    pedidos.push(novo);
    fs.writeFileSync('./pedidos.json', JSON.stringify(pedidos));
    res.json({ ok: true, id });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ===== LIGA O BOT.JS JUNTO SEM MEXER NO LAYOUT =====
try {
  const botMod = require('./bot.js');
  if (botMod.iniciarComServer) {
    botMod.iniciarComServer(app);
    console.log('Bot ligado junto ✅');
  }
} catch (e) {
  console.log('Bot off por enquanto:', e.message);
}

// ===== RODA NO RENDER =====
app.listen(PORT, () => {
  console.log(NOME_LOJA + ' rodando na porta ' + PORT);
});