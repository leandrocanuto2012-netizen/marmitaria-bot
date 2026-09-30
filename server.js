require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const app = express();

app.use(express.json());

// ========== SUPABASE ==========
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ========== ENVIAR WHATSAPP ==========
async function enviarWhatsApp(numero, texto) {
  try {
    const url = `${process.env.EVO_URL}/message/sendText/${process.env.EVO_INSTANCE}`;
    console.log(`📤 Enviando para: ${numero}`);
    
    const res = await axios.post(
      url,
      { number: numero, text: texto },
      { headers: { apikey: process.env.EVO_KEY, 'Content-Type': 'application/json' } }
    );
    
    console.log(`✅ Enviado! Status: ${res.status}`);
    return true;
  } catch (e) {
    console.error(`❌ Erro envio:`, e.response?.status, e.response?.data || e.message);
    return false;
  }
}

// ========== LÓGICA DO BOT ==========
async function processarMensagem(telefone, mensagem) {
  const msg = mensagem.trim().toLowerCase();
  console.log(`🧠 Processando: "${msg}"`);

  if (['oi','olá','ola','bom dia','boa tarde','boa noite','opa'].includes(msg)) {
    return 'Olá! Tudo bem? 😋\nSeja bem-vindo(a) à Marmitaria!\n\nEscolha:\n1️⃣ Cardápio\n2️⃣ Fazer Pedido\n3️⃣ Horário\n4️⃣ Falar com Atendente';
  }

  if (msg === '1' || msg === 'cardápio' || msg === 'cardapio') {
    return '📋 *CARDÁPIO*\n\n🍽️ Prato Feito — R$ 18,00\n🥗 Salada — R$ 12,00\n🍖 Feijoada — R$ 25,00\n🍹 Suco — R$ 6,00\n🥤 Refrigerante — R$ 5,00\n\nExemplo: "2 Prato Feito"';
  }

  if (msg === '3' || msg === 'horário' || msg === 'horario') {
    return '🕐 *Funcionamento*\nSeg–Sex: 10h às 15h\nSáb: 11h às 14h\nDom: Fechado 🚫';
  }

  if (msg === '2' || msg.includes('pedido')) {
    return 'Perfeito! 🥰\nMe diga o que deseja:\nExemplo: "1 Feijoada e 1 Suco"';
  }

  if (msg === '4' || msg.includes('atendente') || msg.includes('falar')) {
    return 'Claro! 📞\nTransferindo para atendente...\nAguarde um instante!';
  }

  if (msg.includes('confirmo') || msg.includes('confirmar')) {
    return '✅ Pedido confirmado! 🎉\nRetirada em ~20 minutos no balcão!';
  }

  return 'Desculpe, não entendi 😅\nEscolha:\n1️⃣ Cardápio\n2️⃣ Fazer Pedido\n3️⃣ Horário\n4️⃣ Falar com Atendente';
}

// ========== WEBHOOK ==========
app.post('/webhook', async (req, res) => {
  console.log('='.repeat(40));
  console.log('📩 RECEBIDO /webhook — evento:', req.body.event);

  try {
    const evento = req.body;

    if (evento.event === 'messages.upsert' && evento.data?.messages) {
      for (const msg of evento.data.messages) {
        if (msg.fromMe) {
          console.log('↳ Mensagem do bot — ignorada');
          continue;
        }

        const telefone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        
        if (!texto) {
          console.log('↳ Sem texto — ignorada');
          continue;
        }

        console.log(`📩 ${telefone}: "${texto}"`);
        
        const resposta = await processarMensagem(telefone, texto);
        console.log(`💬 Resposta: "${resposta}"`);
        
        await enviarWhatsApp(telefone, resposta);
      }
    }

    res.status(200).send('OK');
  } catch (e) {
    console.error('❌ ERRO:', e.message);
    res.status(200).send('OK'); // Sempre retorna 200 p/ não ficar tentando reenviar
  }
  
  console.log('='.repeat(40));
});

// ========== TESTE ==========
app.get('/', (req, res) => {
  res.send(`🤖 marmita-bot-1 ONLINE | Webhook: /webhook`);
});

// ========== INICIAR ==========
const PORTA = process.env.PORT || 8080;
app.listen(PORTA, () => {
  console.log(`🚀 SERVIDOR NA PORTA ${PORTA}`);
  console.log(`🔗 WEBHOOK: https://marmita-bot-1.onrender.com/webhook`);
});
