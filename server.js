const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

function ler(n,p){ try{ if(fs.existsSync(n)) return JSON.parse(fs.readFileSync(n,'utf8')); }catch(e){} return p; }
function salvar(n,d){ try{ fs.writeFileSync(n, JSON.stringify(d)); }catch(e){} }

app.use(express.static(path.join(__dirname,'public')));

app.get('/', (req,res)=>{ res.sendFile(path.join(__dirname,'public','login.html')); });

// LOGIN 1x - igual seu login.html
app.post('/api/login',(req,res)=>{
  const b=req.body||{};
  const usuario=b.usuario||b.user||'';
  const senha=b.senha||b.pass||'';
  if(!usuario||!senha) return res.json({ok:false,sucesso:false,autorizado:false});
  return res.json({ok:true,sucesso:true,autorizado:true,usuario});
});

// CAIXA - ELE ESCOLHE ABRIR
function getCaixa(){ return ler('./status-caixa.json',{aberto:false}); }
app.get('/api/caixa/status',(req,res)=>{ res.json({ok:true,...getCaixa()}); });
app.get('/api/status-caixa',(req,res)=>{ res.json({ok:true,...getCaixa()}); });
app.get('/api/caixa',(req,res)=>{ res.json({ok:true,...getCaixa()}); });
app.post('/api/caixa/abrir',(req,res)=>{
  const s={aberto:true,operador:(req.body&&req.body.operador)||'caixa',data:new Date().toLocaleString('pt-BR')};
  salvar('./status-caixa.json',s);
  res.json({ok:true,sucesso:true,autorizado:true,...s});
});
app.post('/api/caixa-abrir',(req,res)=>{
  const s={aberto:true,data:new Date().toLocaleString('pt-BR')};
  salvar('./status-caixa.json',s);
  res.json({ok:true,sucesso:true,...s});
});
app.post('/api/caixa/fechar',(req,res)=>{
  const s={aberto:false,data:new Date().toLocaleString('pt-BR')};
  salvar('./status-caixa.json',s);
  res.json({ok:true,...s});
});

app.get('/api/cardapio',(req,res)=>{
  let c=ler('./cardapio.json',null);
  if(c&&c.cardapio) c=c.cardapio;
  if(!c) c=[{id:1,nome:'Frango Grelhado',preco:18}];
  res.json(c);
});
app.get('/api/pedidos',(req,res)=>{ res.json(ler('./pedidos-bot.json',[])); });
app.get('/api/dados',(req,res)=>{ res.json({ok:true,pedidos:ler('./pedidos-bot.json',[])}); });

try{ const b=require('./bot.js'); if(b.iniciarComServer) b.iniciarComServer(app);}catch(e){ console.log('bot off'); }

app.listen(PORT,()=>console.log('ON '+PORT));