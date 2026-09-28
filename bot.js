const QRCode = require('qrcode');

let pool = null;
function setBanco(conexao) {
  pool = conexao;
  console.log('✅ [bot.js] Banco conectado');
}

// Cardápio global
const cardapio = {
  '1': { nome: 'Pequena', valor: 15.00 },
  '2': { nome: 'Média', valor: 18.00 },
  '3': { nome: 'Grande', valor: 22.00 }
};

// Função simulada para enviar mensagem (substitua pela sua API real)
async function enviar(telefone, texto) {
  console.log(`Mensagem para ${telefone}:`);
  console.log(texto);
  return true;
}

// Função para gerar payload PIX simples (exemplo básico)
function gerarPayloadPix(chavePix, valor, descricao) {
  // Para produção, use biblioteca oficial do Banco Central para gerar payload correto
  // Aqui um payload simplificado para exemplo
  const valorStr = valor.toFixed(2).replace('.', ',');
  return `00020126580014BR.GOV.BCB.PIX0136${chavePix}5204000053039865405${(valor*100).toFixed(0).padStart(4,'0')}5802BR5925Marmitaria Exemplo6009Sao Paulo61080540900062070503***6304`;
}

// Gerar QR Code base64 a partir do payload
async function gerarQrCodeBase64(payload) {
  try {
    return await QRCode.toDataURL(payload);
  } catch (e) {
    console.error('Erro ao gerar QR Code:', e);
    return null;
  }
}

// Função principal do bot
async function processar(telefone, texto, pushName) {
  const t = String(texto || '').trim().toLowerCase();
  const nome = pushName || 'amigo(a)';

  console.log(`💬 ${nome} diz: "${texto}"`);

  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ou'].includes(t)) {
    await enviar(telefone,
      `Olá, ${nome}! 😋 Tudo bem?\n\nDigite *cardápio* para ver os pratos!`
    );
  }
  else if (['cardápio', 'cardapio', 'menu'].includes(t)) {
    let textoCardapio = `🍽️ CARDÁPIO — ${nome}\n\n`;
    for (const [key, prato] of Object.entries(cardapio)) {
      textoCardapio += `${key}️⃣ ${prato.nome} — R$ ${prato.valor.toFixed(2)}\n`;
    }
    textoCardapio += '\nPara pedir, digite: pedido [número do prato]\nExemplo: pedido 1';
    await enviar(telefone, textoCardapio);
  }
  else if (t.startsWith('pedido ')) {
    const num = t.split(' ')[1];
    const prato = cardapio[num];
    if (!prato) {
      await enviar(telefone, `Desculpe, não encontrei o prato número ${num}. Digite *cardápio* para ver as opções.`);
      return;
    }

    const chavePix = 'seu-email-ou-chave-pix'; // substitua pela sua chave PIX real
    const descricao = `Pedido ${prato.nome} para ${nome}`;
    const payload = gerarPayloadPix(chavePix, prato.valor, descricao);
    const qrCodeBase64 = await gerarQrCodeBase64(payload);

    if (!qrCodeBase64) {
      await enviar(telefone, 'Erro ao gerar QR Code PIX. Tente novamente.');
      return;
    }

    // Aqui você pode salvar o pedido no banco se quiser, usando pool.query()

    await enviar(telefone,
      `Pedido: ${prato.nome} — R$ ${prato.valor.toFixed(2)}\n` +
      `Para pagar via PIX, escaneie o QR Code abaixo ou copie o código:\n\n${payload}\n\n` +
      `QR Code (imagem base64):\n${qrCodeBase64}`
    );
  }
  else {
    await enviar(telefone, `Recebi, ${nome}! ✅ Digite *cardápio* para ver as opções.`);
  }
}

module.exports = { processar, setBanco };
console.log('🤖 bot.js ajustado e completo carregado ✅');
