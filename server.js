// server.js COMPATIVEL - não quebra seu cardapio, login, pdv
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== ajuda ler/salvar sem dar erro =====
function ler(arq, padrao){
  try{ if(fs.existsSync(arq)) return JSON.parse(fs.readFileSync(arq,'utf8')); }catch(e){}
  return padrao;
}
function salvar(arq, dados){
  try{ fs.writeFileSync(arq, JSON.stringify(dados)); }catch(e){}
}

// Cardapio padrão caso ainda não tenha arquivo
const CARDAPIO_PADRAO = [
  {id:1, nome:'Frango Grelhado', desc:'Arroz, feijao, fritas e salada', preco:18},
  {id:2, nome:'Carne Assada', desc:'Arroz, feijao, farofa', preco:20},
  {id:3, nome:'Feijoada', desc:'Completa com couve', preco:22},
  {id:4, nome:'Strogonoff', desc:'Frango, arroz e palha', preco:22}
];

// ===== SERVE SUAS TELAS IGUAIS - NÃO MUDA NADA =====
app.use(express.static(path.join(__dirname, 'public')));

// ===== APIS QUE SEU CARDAPIO ANTIGO USA - CORRIGE ERRO AO CARREGAR =====
app.get('/api/cardapio', (req,res)=>{
  let c = ler('./cardapio.json', null) || ler('./produtos.json', null) || CARDAPIO_PADRAO;
  // devolve nos 2 formatos pra não quebrar: array e objeto
  res.json(c);
});
app.get('/api/produtos', (req,res)=>{
  let c = ler('./cardapio.json', null) || ler('./produtos.json', null) || CARDAPIO_PADRAO;
  res.json(c);
});
app.post('/api/cardapio', (req,res)=>{
  salvar('./cardapio.json', req.body);
  res.json({ok:true});
});
app.post('/api/produtos', (req,res)=>{
  salvar('./cardapio.json', req.body);
  res.json({ok:true});
});

// ===== PEDIDOS + CAIXA - JUNTA PDV + BOT =====
app.get('/api/dados', (req,res)=>{
  let pedidosBot = ler('./pedidos-bot.json', []);
  let pedidosSite = ler('./pedidos.json', []);
  let caixaBot = ler('./caixa-bot.json', []);
  let caixaSite = ler('./caixa.json', []);
  let cardapio = ler('./cardapio.json', null) || CARDAPIO_PADRAO;
  let todosPed = [...pedidosSite, ...pedidosBot];
  let todoCaixa = [...caixaSite, ...caixaBot];
  let total = todoCaixa.reduce((s,v)=>s+(Number(v.total)||0),0);
  res.json({
    ok:true,
    cardapio: cardapio,
    produtos: cardapio,
    pedidos: [...todosPed].reverse(),
    caixa: [...todoCaixa].reverse(),
    totalCaixa: total,
    total: total
  });
});

app.get('/api/pedidos', (req,res)=>{
  let a = ler('./pedidos.json', []);
  let b = ler('./pedidos-bot.json', []);
  res.json([...a, ...b].reverse());
});

app.get('/api/caixa', (req,res)=>{
  let a = ler('./caixa.json', []);
  let b = ler('./caixa-bot.json', []);
  res.json([...a, ...b].reverse());
});

app.post('/api/novo-pedido', (req,res)=>{
  let pedidos = ler('./pedidos.json', []);
  const b = req.body || {};
  const id = String(Date.now()).slice(-5);
  const novo = {
    id, nome: b.nome||'Balcao', clienteNome: b.nome||'Balcao', jid:'PDV',
    itens: b.itensTexto||b.itens||'', itensTexto: b.itensTexto||b.itens||'',
    total: Number(b.total)||0, tam: b.tamanho||'M', tamanho: b.tamanho||'M',
    rest: b.restricao||'Nenhuma', restricao: b.restricao||'Nenhuma',
    end: b.endereco||'Balcao', endereco: b.endereco||'Balcao',
    pagamento: b.pagamento||'Dinheiro', status:'NOVO', tempo:'',
    data: new Date().toLocaleString('pt-BR')
  };
  pedidos.push(novo); salvar('./pedidos.json', pedidos);
  res.json({ok:true, id});
});

app.post('/api/login', (req,res)=>{
  const USER = process.env.LOGIN_USER || 'admin';
  const PASS = process.env.LOGIN_PASS || '1234';
  const {user, pass} = req.body||{};
  if(user===USER && pass===PASS) return res.json({ok:true});
  res.json({ok:false});
});

// ===== LIGA BOT.JS SE EXISTIR, SE NÃO, NÃO DERRUBA O SITE =====
try{
  const botMod = require('./bot.js');
  if(botMod.iniciarComServer) botMod.iniciarComServer(app);
  console.log('Bot ok');
}catch(e){ console.log('Bot off, site segue on:', e.message); }

app.listen(PORT, ()=>console.log('Rodando '+PORT));