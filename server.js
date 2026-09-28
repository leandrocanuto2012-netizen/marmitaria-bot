app.post('/api/bot/webhook', async (req, res) => {
  // Responde IMEDIATAMENTE — sem esperar processar ⚡
  res.status(200).json({ ok: true });

  // Processa depois
  try {
    const { event, data } = req.body;
    console.log('📩 RECEBIDO:', event);

    if (event === 'messages.upsert') {
      const msg = data.messages?.[0];
      if (!msg || msg.fromMe) return;

      const telefone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
      const texto = 
        msg.message?.conversation || 
        msg.message?.extendedTextMessage?.text || 
        '';

      console.log(`💬 ${telefone}: "${texto}"`);
      
      // Aqui você chama a função de resposta
      await enviarMensagem(telefone, `Recebi: "${texto}" ✅`);
    }
  } catch (e) {
    console.error('❌ Erro:', e.message);
  }
});
