const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

function ler(n, p){ try{ if(fs.existsSync(n)) return JSON.parse(fs.readFileSync(n,'utf8')); }catch(e){} return p; }

app.use(express.static(path.join(__dirname,'public')));

app.get('/api/cardapio',(req,res)=>{
  let c = ler('./cardapio.json', null);
  if(c && c.cardapio) c = c.cardapio;
  if(!c) c = [{id:1,nome:'Frango Grelhado',preco:18},{id:2,nome:'Carne Assada',preco:20},{id:3,nome:'Feijoada',preco:22}];
  res.json(c);
});

app.post('/api/login',(req,res)=>{
  const b = req.body || {};
  const usuario = b.usuario || b.user || '';
  const senha = b.senha || b.pass || '';
  if(!usuario || !senha) return res.json({ok:false, sucesso:false, autorizado:false});
  return res.json({ok:true, sucesso:true, autorizado:true, usuario});
});

app.get('/api/caixa/status',(req,res)=>{ res.json({ok:true, aberto:true}); });
app.get('/api/dados',(req,res)=>{ res.json({ok:true, pedidos:[]}); });

app.listen(PORT, ()=>console.log('ON '+PORT));