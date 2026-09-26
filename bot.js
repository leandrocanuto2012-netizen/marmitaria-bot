const axios = require('axios');

module.exports.init = function(app, pool) {

  // ============================================
  // FUNÇÃO: Enviar mensagem via Evolution API
  // ============================================
  async function enviarWhatsApp(numero, mensagem) {
    try {
      const url = `${process.env.EVO_URL}/message/sendText/${process.env.EVO_INSTANCE}`;
      console.log('📤 Enviando para:', numero);
      console.log('📤 URL:', url);
      
      const resposta = await axios.post(url, {
        number: numero,
        text: mensagem
      }, {
        headers: { apikey: process.env.EVO_KEY }
      });
      
      console.log('✅ MENSAGEM ENVIADA COM SUCESSO!');
      return resposta.data;
    } catch (erro) {
      console.error('❌ ERRO AO ENVIAR:', erro.response?.data || erro.message);
    }
  }

  // ============================================
  // WEBHOOK: Recebe mensagens da Evolution
  // ============================================
  app.post('/api/bot/webhook', async (req, res) => {
    try {
      console.log('📥 ==================================');
      console.log('📥 NOVO EVENTO RECEBIDO!');
      console.log('📥 Evento:', req.body.event);
      console.log('📥 Corpo completo:', JSON.stringify(req.body, null, 2));

      const body = req.body;
      const data = body.data || body;
      const messageData = data.message || data;

      // Pega o remetente (número do telefone)
      const remoteJid = data.key?.remoteJid || data.remoteJid || data.chatId;
      
      if (!remoteJid) {
        console.log('⚠️ Sem remetente — ignorando');
        return res.json({ ok: true });
      }

      // Ignora mensagens de grupo
      if (remoteJid.includes('@g.us')) {
        console.log('⚠️ Mensagem de grupo — ignorando');
        return res.json({ ok: true });
      }

      // Ignora mensagens enviadas pelo próprio bot
      if (data.key?.fromMe) {
        console.log('⚠️ Mensagem própria — ignorando');
        return res.json({ ok: true });
      }

      const telefone = remoteJid.replace('@s.whatsapp.net', '');

      // Extrai o texto de TODOS os formatos possíveis
      const textoRecebido = 
        messageData.conversation ||
        messageData.extendedTextMessage?.text ||
        messageData.text ||
        messageData.content ||
        '';

      console.log(`📱 De: ${telefone}`);
      console.log(`📝 Texto: "${textoRecebido}"`);

      if (!textoRecebido.trim()) {
        console.log('⚠️ Mensagem vazia — ignorando');
        return res.json({ ok: true });
      }

      // ============================================
      // LÓGICA DE RESPOSTA
      // ============================================
      let resposta = '';
      const texto = textoRecebido.toLowerCase().trim();

      if (/^(olá|ola|oi|opa|eai|e aí|bom dia|boa tarde|boa noite|hello|hi)/i.test(texto)) {
        resposta = `Olá! 👋 Tudo bem?\n\nComo posso te chamar? Me diga seu nome! 😊`;
      }
      else if (/^(sim|s|confirmo|pode|ok|certo|claro)/i.test(texto)) {
        resposta = `✅ Confirmado! Em breve seu pedido estará pronto! 🍱`;
      }
      else if (/^(não|nao|n|cancela|cancelar|erro)/i.test(texto)) {
        resposta = `Tudo bem! Pode escolher novamente o que deseja! 😊`;
      }
      else if (texto.includes('cardapio') || texto.includes('cardápio') || texto.includes('menu')) {
        resposta = `🍱 NOSSO CARDÁPIO:\n\n• Marmita P — R$ 18,90\n• Marmita M — R$ 23,90\n• Marmita G — R$ 28,90\n🥤 Refrigerante — R$ 5,00\n🧃 Suco Natural — R$ 7,50\n\nÉ só me dizer o que quer! 😊`;
      }
      else if (texto.includes('pedido') || texto.includes('status') || texto.includes('pronto') || texto.includes('demora')) {
        resposta = `🕐 Seu pedido está sendo preparado!\n⏱️ Tempo estimado: ~20 minutos\n\nAssim que ficar pronto avisamos! 🍱`;
      }
      else if (texto.includes('obrigado') || texto.includes('obrigada') || texto.includes('valeu') || texto.includes('agradeço')) {
        resposta = `De nada! 😊 Foi um prazer atender você!\n\nVolte sempre! 🍱❤️`;
      }
      else {
        resposta = `Recebi sua mensagem! ✅\n\nVocê disse: "${textoRecebido}"\n\nEm breve um atendente vai te responder! 😊`;
      }

      // Envia a resposta
      await enviarWhatsApp(telefone, resposta);
      console.log(`✅ RESPOSTA ENVIADA: "${resposta.slice(0, 50)}..."`);

      res.json({ ok: true, resposta });

    } catch (erro) {
      console.error('❌ ERRO NO WEBHOOK:', erro);
      res.status(500).json({ erro: erro.message });
    }
  });

  // ============================================
  // ROTA DE TESTE (abre no navegador)
  // ============================================
  app.get('/api/bot/teste', (req, res) => {
    res.json({
      status: '✅ Bot funcionando!',
      instancia: process.env.EVO_INSTANCE,
      evo_url: process.env.EVO_URL,
      webhook: '/api/bot/webhook (POST)'
    });
  });

  console.log('🤖 ==================================');
  console.log('🤖 BOT CARREGADO E PRONTO!');
  console.log('🤖 Escutando em: /api/bot/webhook');
  console.log('🤖 ==================================');
};
