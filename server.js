const express = require('express');
const qrcode = require('qrcode');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

// ===== CONFIGURA AQUI SUA LOJA =====
const NOME_LOJA = process.env.NOME_LOJA || 'Marmitaria do Leandro';
const DONO = process.env.DONO_NUMERO || '5511999999999';
const PIX_CHAVE = process.env.PIX || 'seu-pix-aqui';
// ===================================

const app = express();
let lastQR = null;
let sock = null;

// Página do QR
app.get('/qr', async (req, res) => {
  if (!lastQR) return res.send('Bot ja conectado! Pode usar.');
  const img = await qrcode.toDataURL(lastQR);
  res.send('<h1>Escaneie no WhatsApp > Aparelhos:</h1><img src="' + img + '" width="300"/>');
});

// CARDAPIO ELETRONICO BONITINHO COM MARGEM
app.get('/', (req, res) => {
res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${NOME_LOJA} - Cardapio</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial,sans-serif;background:#FFF3E8;color:#333}
.topo{background:#FF6A00;color:white;padding:28px 16px 50px;text-align:center}
.topo h1{margin:0;font-size:26px}
.topo p{margin:6px 0 0;opacity:0.9}
.container{max-width:500px;margin:-30px auto 120px auto;padding:0 16px}
.card{background:white;margin:0 0 16px 0;border-radius:18px;padding:16px;display:flex;gap:12px;align-items:center;box-shadow:0 4px 12px rgba(0,0,0,0.08)}
.emoji{font-size:48px;background:#FFF0E0;width:70px;height:70px;display:flex;align-items:center;justify-content:center;border-radius:16px}
.info{flex:1}
.info h3{margin:0 0 4px 0;font-size:17px}
.info p{margin:0 0 6px 0;font-size:13px;color:#777}
.preco{font-weight:bold;color:#1a7a2e;font-size:16px}
.btn{background:#FF6A00;color:white;border:none;border-radius:12px;padding:10px 14px;font-weight:bold;font-size:14px}
.form{background:white;margin:16px 0;border-radius:18px;padding:16px;box-shadow:0 4px 12px rgba(0,0,0,0.08)}
.form input,.form select{width:100%;margin:8px 0;padding:12px;border-radius:12px;border:1px solid #ddd;font-size:15px}
.carrinho{position:fixed;bottom:0;left:0;right:0;background:white;border-top:2px solid #eee;padding:12px 16px;max-width:500px;margin:0 auto;border-radius:18px 18px 0 0}
.total{display:flex;justify-content:space-between;font-weight:bold;margin-bottom:10px}
.finalizar{width:100%;background:#25D366;color:white;border:none;padding:15px;border-radius:14px;font-size:17px;font-weight:bold}
</style>
</head>
<body>
<div class="topo">
<h1>🍱 ${NOME_LOJA}</h1>
<p>Cardapio eletronico - faca seu pedido 👇</p>
<p>Aberto hoje ate 20h</p>
</div>

<div class="container">
<div id="lista"></div>

<div class="form">
<h3 style="margin:0">📋 Seus dados</h3>
<input id="nome" placeholder="Seu nome">
<input id="end" placeholder="Endereco com bairro ou RETIRADA">
<select id="pag">
<option value="PIX">PIX - ${PIX_CHAVE}</option>
<option value="Dinheiro">Dinheiro</option>
<option value="Cartao">Cartao na entrega</option>
</select>
</div>
</div>

<div class="carrinho">
<div class="total"><span>🛒 <span id="qtd">0</span> itens</span><span id="valor">R$ 0,00</span></div>
<button class="finalizar" onclick="finalizar()">FINALIZAR NO WHATSAPP</button>
</div>

<script>
var produtos = [
{id:1, nome:'Frango Grelhado', desc:'Arroz, feijao, fritas e salada', preco:18, emoji:'🍗'},
{id:2, nome:'Carne Assada', desc:'Arroz, feijao, farofa e vinagrete', preco:20, emoji:'🥩'},
{id:3, nome:'Feijoada', desc:'Completa com couve e laranja', preco:22, emoji:'🍲'},
{id:4, nome:'Strogonoff', desc:'Frango, arroz e batata palha', preco:22, emoji:'🍛'}
];
var cart = {};
function render(){
var h='';
for(var i=0;i<produtos.length;i++){
var p=produtos[i];
var q=cart[p.id]||0;
h+='<div class="card"><div class="emoji">'+p.emoji+'</div><div class="info"><h3>'+p.nome+'</h3><p>'+p.desc+'</p><div class="preco">R$ '+p.preco+',00</div></div><div><button class="btn" onclick="add('+p.id+')">'+(q>0? q+'x +':'+ Adicionar')+'</button></div></div>';
}
document.getElementById('lista').innerHTML=h;
}
function add(id){ cart[id]=(cart[id]||0)+1; atualiza(); render(); }
function atualiza(){
var total=0, qtd=0;
for(var k in cart){ for(var i=0;i<produtos.length;i++){ if(produtos[i].id==k){ total+=produtos[i].preco*cart[k]; qtd+=cart[k]; } } }
document.getElementById('qtd').innerText=qtd;
document.getElementById('valor').innerText='R$ '+total+',00';
}
function finalizar(){
var nome=document.getElementById('nome').value;
var end=document.getElementById('end').value;
var pag=document.getElementById('pag').value;
if(Object.keys(cart).length==0){ alert('Escolha ao menos 1 marmita!'); return; }
if(!nome||!end){ alert('Preencha nome e endereco!'); return; }
var texto='*NOVO PEDIDO - SITE* %0A';
texto+='Nome: '+nome+'%0A';
for(var k in cart){ for(var i=0;i<produtos.length;i++){ if(produtos[i].id==k){ texto+='- '+cart[k]+'x '+produtos[i].nome+'%0A'; } } }
texto+='Entrega: '+end+'%0A Pag: '+pag;
window.open('https://wa.me/${DONO}?text='+encodeURIComponent(nome+' | '+end+' | '+pag+' | ')+texto,'_blank');
}
render(); atualiza();
</script>
</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Site rodando'));

// ===== BOT WHATSAPP BONITINHO =====
const pedidos = {};

function menuBonito(){
return `*🍱 ${NOME_LOJA} 🍱*
━━━━━━━━━━━━━━━
* CARDAPIO ELETRONICO *
👉 Veja com fotos aqui:
https://${process.env.RENDER_EXTERNAL_URL || 'SEU-SITE.onrender.com'}/

━━━━━━━━━━━━━━━
*1* - 🍗 Frango R$18
*2* - 🥩 Carne R$20
*3* - 🍲 Feijoada R$22
*4* - 🍛 Strogonoff R$22
━━━━━━━━━━━━━━━
Digite o numero ou
digite *FINALIZAR*`;
}

async function conecta() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), browser: ['Marmitaria', 'Chrome', '1.0'] });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) { lastQR = qr; console.log('QR GERADO! Abra /qr'); }
    if (connection === 'open') { lastQR = null; console.log('Bot ON!'); }
    if (connection === 'close') {
      const rec = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (rec) conecta();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;
    const de = m.key.remoteJid;
    if (de.includes('@g.us')) return;
    const bruto = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const texto = bruto.trim().toUpperCase();
    const responder = (txt) => sock.sendMessage(de, { text: txt });

    if (['OI','OLA','MENU','CARDAPIO','COMEÇAR','INICIO'].includes(texto)) {
      pedidos[de] = { itens: [], etapa: 'escolhendo' };
      await responder('Ola! Bem-vindo(a) a *'+NOME_LOJA+'* 😊\n\n' + menuBonito());
      return;
    }
    if (!pedidos[de]) { await responder('Digite *OI* para ver o cardapio 🍱'); return; }
    let pedido = pedidos[de];

    if (pedido.etapa === 'escolhendo') {
      if (['1','2','3','4'].includes(texto)) {
        const nomes = {'1':'Frango R$18','2':'Carne R$20','3':'Feijoada R$22','4':'Strogonoff R$22'};
        const valores = {'1':18,'2':20,'3':22,'4':22};
        pedido.itens.push({ nome: nomes[texto], valor: valores[texto] });
        await responder('✅ *Adicionado:* '+nomes[texto]+'\n━━━━━━━━━━━━━━━\nDigite outro numero ou *FINALIZAR*');
      } else if (texto === 'FINALIZAR') {
        if (pedido.itens.length === 0) { await responder('Carrinho vazio 😅 Escolha 1 a 4'); return; }
        pedido.etapa = 'endereco';
        await responder('Perfeito! 👏\nAgora manda seu *ENDEREÇO completo* com nome e bairro\nou digite *RETIRADA*');
      } else { await responder(menuBonito()); }
      return;
    }
    if (pedido.etapa === 'endereco') {
      pedido.endereco = bruto;
      pedido.etapa = 'pagamento';
      await responder('📍 *Anotado!*\n━━━━━━━━━━━━━━━\nPagamento?\n*1* - PIX ('+PIX_CHAVE+')\n*2* - Dinheiro\n*3* - Cartao');
      return;
    }
    if (pedido.etapa === 'pagamento') {
      let total = pedido.itens.reduce((s,i) => s + i.valor, 0);
      let lista = pedido.itens.map(i => '▪️ '+i.nome).join('\n');
      let pag = texto.includes('1') ? 'PIX' : texto.includes('2') ? 'Dinheiro' : 'Cartao';
      await responder('*PEDIDO FINALIZADO!* 🎉\n━━━━━━━━━━━━━━━\n'+lista+'\n━━━━━━━━━━━━━━━\n*Total: R$'+total+'*\n\nJa foi pra cozinha! Obrigado! 🙏\nDigite *OI* p/ novo pedido');
      try { await sock.sendMessage(DONO + '@s.whatsapp.net', { text: '*NOVO PEDIDO* 🛵\nDe: '+de+'\n\n'+lista+'\nTotal: R$'+total+'\nEntrega: '+pedido.endereco+'\nPag: '+pag }); } catch(e){}
      delete pedidos[de];
    }
  });
}
conecta();