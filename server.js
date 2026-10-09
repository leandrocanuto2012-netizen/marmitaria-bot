const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());

// libera pra seu html acessar
app.use((req,res,next)=>{
  res.header("Access-Control-Allow-Origin","*");
  res.header("Access-Control-Allow-Headers","Content-Type");
  next();
});

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
try{ if(!fs.existsSync(DATA)) fs.mkdirSync(DATA); }catch(e){}

function ler(nome, padrao){
  // tenta em 3 lugares: data/, raiz, public/
  let caminhos = [path.join(DATA,nome), path.join(__dirname,nome), path.join(__dirname,'public',nome)];
  for(let c of caminhos){
    try{ if(fs.existsSync(c)) return JSON.parse(fs.readFileSync(c,'utf8')); }catch(e){}
  }
  return padrao;
}
function salvar(nome, dados){
  try{
    fs.writeFileSync(path.join(DATA,nome), JSON.stringify(dados));
    fs.writeFileSync(path.join(__dirname,nome), JSON.stringify(dados));
  }catch(e){ console.log('erro salvar '+nome, e.message); }
}

const CARDAPIO_PADRAO = [
  {id:1, nome:'Frango Grelhado', desc:'Arroz, feijao, fritas', preco:18},
  {id:2, nome:'Carne Assada', desc:'Arroz, feijao, farofa', preco:20},
  {id:3, nome:'Feijoada', desc:'Completa', preco:22}
];

app.use(express.static(path.join(__dirname,'public')));

// TESTE DE BANCO - abre isso pra ver
app.get('/api/debug',(req,res)=>{
  res.json({
    pasta: __dirname,
    tem_data: fs.existsSync(DATA),
    pode_escrever: (()=>{ try{ fs.writeFileSync(path.join(DATA,'teste.txt'),'ok'); return true; }catch(e){ return e.message; } })(),
    arquivos: (()=>{ try{ return fs.readdirSync(__dirname); }catch(e){ return e.message; } })()
  });
});

app.get('/api/cardapio',(req,res)=>{
  let c = ler('cardapio.json', null) || CARDAPIO_PADRAO;
  if(c.cardapio) c = c.cardapio;
  if(!Array.isArray(c)) c = CARDAPIO_PADRAO;
  res.json(c);
});
app.get('/api/produtos',(req,res)=>{
  let c = ler('cardapio.json', null) || CARDAPIO_PADRAO;
  res.json(c);
});
app.get('/api/dados',(req,res)=>{
  let pb = ler('pedidos-bot.json',[]);
  let ps = ler('pedidos.json',[]);
  let cb = ler('caixa-bot.json',[]);
  let cs = ler('caixa.json',[]);
  let card = ler('cardapio.json', CARDAPIO_PADRAO);
  let todos = [...ps, ...pb];
  let caixa = [...cs, ...cb];
  res.json({ok:true, cardapio:card, produtos:card, pedidos:todos.reverse(), caixa:caixa.reverse(), totalCaixa: caixa.reduce((s,v)=>s+(Number(v.total)||0),0)});
});

app.post('/api/login',(req,res)=>{
  let U = process.env.LOGIN_USER || 'admin';
  let P = process.env.LOGIN_PASS || '1234';
  res.json({ok: req.body.user===U && req.body.pass===P});
});

try{
  const bot = require('./bot.js');
  if(bot.iniciarComServer) bot.iniciarComServer(app);
  console.log('Bot ok');
}catch(e){ console.log('Bot off, site segue on: '+e.message); }

app.listen(PORT, ()=>console.log('Rodando '+PORT));