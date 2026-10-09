const express = require('express');
const qrcode = require('qrcode');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
let lastQR = null;
let sock = null;

app.get('/', (req, res) => res.send('Bot Marmitaria ON! Va em /qr para conectar'));
app.get('/qr', async (req, res) => {
  if (!lastQR) return res.send('Bot ja conectado OU QR ainda nao gerado. Veja os Logs no Render.');
  const img = await qrcode.toDataURL(lastQR);
  res.send(`<h1>Escaneie no WhatsApp > Aparelhos conectados:</h1><img src="${img}" width="300"/><br/>Atualize a pagina`);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Site rodando na porta ' + PORT));

const pedidos = {};
const DONO = process.env.DONO_NUMERO || '5511999999999'; // seu numero com DDD
const CARDAPIO = `*🍱 MARMITARIA - CARDÁPIO*\nDigite o número:\n\n1 - Frango R$18\n2 - Carne R$20\n3 - Feijoada R$22\n4 - Strogonoff R$22\n\nDigite FINALIZAR para fechar`;

async function conecta() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Marmitaria', 'Chrome', '1.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) { lastQR = qr; console.log('QR GERADO! Abra /qr'); }
    if (connection === 'open') { lastQR = null; console.log('Bot da Marmitaria ON! Conectado!'); }
    if (connection === 'close') {
      console.log('Desconectado, tentando de novo...');
      const deveReconectar = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (deveReconectar) conecta();
      else console.log('Deslogou, apague a pasta auth e escaneie de novo');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;
    const de = m.key.remoteJid;
    if (de === 'status@broadcast' || de.includes('@g.us')) return;

    const textoBruto = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const texto = textoBruto.trim().toUpperCase();
    console.log('CHEGOU:', textoBruto);

    const responder = (txt) => sock.sendMessage(de, { text: txt });

    if (['OI','OLA','MENU','CARDAPIO'].includes(texto)) {
      pedidos[de] = { itens: [], etapa: 'escolhendo' };
      await responder(`Ola! Bem-vindo(a)! 😊\n\n${CARDAPIO}`);
      return;
    }
    if (!pedidos[de]) { await responder('Digite OI para ver o cardapio 🍱'); return; }

    let pedido = pedidos[de];

    if (pedido.etapa === 'escolhendo') {
      if (['1','2','3','4'].includes(texto)) {
        const nomes = {'1':'Frango R$18','2':'Carne R$20','3':'Feijoada R$22','4':'Strogonoff R$22'};
        const valores = {'1':18,'2':20,'3':22,'4':22};
        pedido.itens.push({ nome: nomes[texto], valor: valores[texto] });
        await responder(`Adicionado: ${nomes[texto]} ✅\nDigite outro numero ou FINALIZAR`);
      } else if (texto === 'FINALIZAR') {
        if (pedido.itens.length === 0) { await responder('Carrinho vazio. Escolha 1 a 4.'); return; }
        pedido.etapa = 'endereco';
        await responder('Agora manda seu ENDERECO completo, ou RETIRADA');
      } else { await responder(CARDAPIO); }
      return;
    }

    if (pedido.etapa === 'endereco') {
      pedido.endereco = textoBruto;
      pedido.etapa = 'pagamento';
      await responder('Anotado! ✅\nPagamento?\n1 - PIX\n2 - Dinheiro\n3 - Cartao');
      return;
    }

    if (pedido.etapa === 'pagamento') {
      let total = pedido.itens.reduce((s,i) => s + i.valor, 0);
      let lista = pedido.itens.map(i => `- ${i.nome}`).join('\n');
      let pag = texto.includes('1') ? 'PIX' : texto.includes('2') ? 'Dinheiro' : 'Cartao';
      await responder(`Pedido FINALIZADO! 🎉\n\n${lista}\nTotal: R$${total}\nJa foi pra cozinha!`);
      // avisa o dono
      try { await sock.sendMessage(DONO + '@s.whatsapp.net', { text: `*NOVO PEDIDO* 🛵\nDe: ${de}\n\n${lista}\nTotal: R$${total}\nEntrega: ${pedido.endereco}\nPag: ${pag}` }); } catch(e){ console.log('Nao achei dono'); }
      delete pedidos[de];
    }
  });
}
conecta();