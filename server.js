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
  if(!c) c = [{id:1,nome:'Frango Grelhado',preco:18},{id:2,nome:'Carne Assada',preco:20},{id:3,nome:'Feijoada',preco:22}];
  res.json(c);
});
app.get('/api/dados',(req,res)=>{
  let pb = ler('./pedidos-bot.json',[]);
  let ps = ler('./pedidos.json',[]);
  res.json({ok:true, pedidos:[...ps,...pb].reverse()});
});

try{ const b=require('./bot.js'); if(b.iniciarComServer) b.iniciarComServer(app); }catch(e){ console.log('bot off:'+e.message); }

app.listen(PORT, ()=>console.log('ON '+PORT));