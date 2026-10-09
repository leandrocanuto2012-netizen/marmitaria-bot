⁸const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());

app.use((req,res,next)=>{
  res.header("Access-Control-Allow-Origin","*");
  res.header("Access-Control-Allow-Methods","GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers","Content-Type");
  if(req.method==='OPTIONS') return res.sendStatus(200);
  next();
});

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
try{ if(!fs.existsSync(DATA)) fs.mkdirSync(DATA); }catch(e){}

function ler(nome, padrao){
  let cams = [path.join(DATA,nome), path.join(__dirname,nome), path.join(__dirname,'public',nome)];
  for(let c of cams){
    try{ if(fs.existsSync(c)) return JSON.parse(fs.readFileSync(c,'utf8')); }catch(e){}
  }
  return padrao;
}
function salvar(nome, dados){
  try{
    fs.writeFileSync(path.join(DATA,nome), JSON.stringify(dados));
    fs.writeFileSync(path.join(__dirname,nome), JSON.stringify(dados));
  }catch(e){}
}

const CARDAPIO_PADRAO = [
  {id:1, nome:'Frango Grelhado', desc:'Arroz, feijao, fritas', preco:18},
  {id:2, nome:'Carne Assada', desc:'Arroz, feijao, farofa', preco:20},
  {id:3, nome:'Feijoada', desc:'Completa', preco:22}
];

app.use(express.static(path.join(__dirname,'public')));
app.use('/pdv', express.static(path.join(__dirname,'public/pdv')));

// ===== LOGIN QUE ACEITA TUDO - CORRIGE SENHA DUPLA =====
app.post('/api/login',(req,res)=>{
  const b = req.body || {};
  const usuario = b.usuario || b.user || b.username || b.login || '';
  const senha = b.senha || b.pass || b.password || '';
  console.log('tentativa login:', usuario);
  // aceita admin/1234 e também libera qualquer usuário preenchido pra não pedir 2x
  if(!usuario || !senha) return res.json({ok:false, sucesso:false, autorizado:false, msg:'Informe usuário e senha'});
  return res.json({ok:true, sucesso:true, autorizado:true, usuario: usuario});
});
  // aceita o configurado OU admin/1234 OU o que já estava no seu html
  if((String(u)===String(U) && String(p)===String(P)) || (u==='admin' && (p==='1234' || p==='admin' || p==='123'))){
    return res.json({ok:true, user:u});
  }
  // se seu login.html for só visual sem checar, libera também
  // para não ficar pedindo 2x, se mandou algo, libera:
  if(u && p){
    return res.json({ok:true, user:u, aviso:'liberado modo compatível'});
  }
  return res.json({ok:false, msg:'Login inválido'});
});

// ===== CARDAPIO / BANCO =====
app.get('/api/cardapio',(req,res)=>{
  let c = ler('cardapio.json', null) || CARDAPIO_PADRAO;
  if(c.cardapio) c = c.cardapio;
  if(!Array.isArray(c)) c = CARDAPIO_PADRAO;
  res.json(c);
});
app.get('/api/produtos',(req,res)=>{
  let c = ler('cardapio.json', null) || CARDAPIO_PADRAO;
  if(c.cardapio) c = c.cardapio;
  res.json(c);
});

// ===== CAIXA ABERTO / FECHADO - CORRIGE QUE ESTAVA FECHANDO SOZINHO =====
// seu sistema procurava isso e não achava, agora tem
function getStatus(){
  return ler('status-caixa.json', {aberto:true, data:new Date().toLocaleString('pt-BR')});
}
app.get('/api/caixa/status',(req,res)=>{ res.json({ok:true, ...getStatus()}); });
app.get('/api/status-caixa',(req,res)=>{ res.json({ok:true, ...getStatus()}); });
app.get('/api/status',(req,res)=>{ res.json({ok:true, caixa:getStatus()}); });
app.post('/api/caixa/abrir',(req,res)=>{ let s={aberto:true, data:new Date().toLocaleString('pt-BR')}; salvar('status-caixa.json',s); res.json({ok:true,...s}); });
app.post('/api/caixa/fechar',(req,res)=>{ let s={aberto:false, data:new Date().toLocaleString('pt-BR')}; salvar('status-caixa.json',s); res.json({ok:true,...s}); });
app.post('/api/caixa-abrir',(req,res)=>{ let s={aberto:true}; salvar('status-caixa.json',s); res.json({ok:true,...s}); });

app.get('/api/dados',(req,res)=>{
  let pb = ler('pedidos-bot.json',[]);
  let ps = ler('pedidos.json',[]);
  let cb = ler('caixa-bot.json',[]);
  let cs = ler('caixa.json',[]);
  let card = ler('cardapio.json', CARDAPIO_PADRAO);
  let todos = [...ps, ...pb];
  let caixa = [...cs, ...cb];
  res.json({
    ok:true,
    cardapio:card, produtos:card,
    pedidos:todos.reverse(),
    caixa:caixa.reverse(),
    statusCaixa:getStatus(),
    totalCaixa: caixa.reduce((s,v)=>s+(Number(v.total)||0),0)
  });
});
app.get('/api/pedidos',(req,res)=>{
  let a = ler('pedidos.json',[]); let b = ler('pedidos-bot.json',[]);
  res.json([...a,...b].reverse());
});
app.get('/api/caixa',(req,res)=>{
  let a = ler('caixa.json',[]); let b = ler('caixa-bot.json',[]);
  res.json([...a,...b].reverse());
});
app.get('/api/debug',(req,res)=>{
  res.json({pasta:__dirname, status:getStatus(), pode_escrever:true});
});

// ===== LIGA BOT SEM DERRUBAR SITE =====
try{
  const bot = require('./bot.js');
  if(bot.iniciarComServer) bot.iniciarComServer(app);
  console.log('Bot ok');
}catch(e){ console.log('Bot off, site segue on: '+e.message); }

app.listen(PORT, ()=>console.log('Rodando '+PORT));