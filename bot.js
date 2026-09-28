const QRCode = require('qrcode');
const axios = require('axios');

let pool = null;

function setBanco(conexao) {
  pool = conexao;
  console.log('✅ [bot.js] Banco conectado');
}

const cardapio = {
  '1': { nome: 'Pequena', valor: 15.00 },
  '2': { nome: 'Média', valor: 18.00 },
  '3': { nome: 'Grande', valor: 22.00 }
};

async function enviar(telefone, texto) {
  try {
    const url = `${process.env.API_URL}/message/sendText/${process.env.API_INSTANCE}`;

    const body = {
      number: telefone,
      text: texto
    };

    await axios.post(url, body, {
      headers: {
        apikey: process.env.API_KEY,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Mensagem enviada para ${telefone}`);
    return true;
  } catch (e) {
    console.error('❌ Erro ao enviar mensagem:', e.response?.data || e.message);
    return false;
  }
}

async function buscarCliente(telefone) {
  if (!pool) return null;
  try {
    const res = await pool.query(
      'SELECT * FROM clients WHERE phone = $1 LIMIT 1',
      [telefone]
    );
    return res.rows[0] || null;
  } catch (e) {
    console.error('❌ Erro ao buscar cliente:', e.message);
    return null;
  }
}

async function salvarPedido(telefone, nome, item, preco) {
  if (!pool) return false;
  try {
    await pool.query(
      'INSERT INTO orders (phone, name, item, price, status) VALUES ($1, $2, $3, $4, $5)',
      [telefone, nome, item, preco, 'pending']
    );
    console.log(`✅ Pedido salvo para ${telefone}: ${item}`);
    return true;
  } catch (e) {
    console.error('❌ Erro ao salvar pedido:', e.message);
    return false;
  }
}

function gerarPayloadPix(chavePix, valor, descricao) {
  // simplificado. se quiser depois te passo o oficial
  return `PIX|CHAVE:${chavePix}|VALOR:${valor.toFixed(2)}|DESC:${descricao}`;
}

async function gerarQrCodeBase64(payload) {
  try {
    return await QRCode.toDataURL(payload);
  } catch (e) {
    console.error('❌ Erro ao gerar QR Code:', e.message);
    return null;
  }
}

async function processar(telefone, texto, pushName) {
  const t = String(texto || '').trim().toLowerCase();
  if (!t) return;

  const cliente = await buscarCliente(telefone);
  const nome = cliente?.name || pushName || 'amigo(a)';

  console.log(`💬 ${nome} diz: "${texto}"`);

  try {
    if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite'].includes(t)) {
      await enviar(telefone, `Olá, ${nome}! 😋\n\nDigite *cardápio* para ver os pratos.`);
    }

    else if (['cardápio', 'cardapio', 'menu'].includes(t)) {
      let textoCardapio = `🍽️ CARDÁPIO — ${nome}\n\n`;
      for (const [key, prato] of Object.entries(cardapio)) {
        textoCardapio += `${key}️⃣ ${prato.nome} — R$ ${prato.valor.toFixed(2)}\n`;
      }
      textoCardapio += `\nDigite *pedido 1*, *pedido 2* ou *pedido 3*.`;
      await enviar(telefone, textoCardapio);
    }

    else if (t.startsWith('pedido ')) {
      const num = t.split(' ')[1];
      const prato = cardapio[num];

      if (!prato) {
        await enviar(telefone, `Não encontrei a opção ${num}. Digite *cardápio* para ver as opções.`);
        return;
      }

      const pedidoSalvo = await salvarPedido(telefone, nome, prato.nome, prato.valor);
      if (!pedidoSalvo) {
        await enviar(telefone, 'Erro ao registrar seu pedido. Tente novamente.');
        return;
      }

      const descricao = `Pedido ${prato.nome} para ${nome}`;
      const payload = gerarPayloadPix(process.env.CHAVE_PIX, prato.valor, descricao);
      const qrCodeBase64 = await gerarQrCodeBase64(payload);

      let mensagem =
        `✅ Pedido recebido, ${nome}!\n` +
        `🍛 Item: ${prato.nome}\n` +
        `💰 Valor: R$ ${prato.valor.toFixed(2)}\n\n` +
        `🔑 PIX copia e cola:\n${payload}`;

      if (qrCodeBase64) {
        mensagem += `\n\n🧾 QR Code base64:\n${qrCodeBase64}`;
      }

      await enviar(telefone, mensagem);
    }

    else if (['4', 'fiado', 'saldo'].includes(t)) {
      if (cliente) {
        await enviar(telefone, `${nome}, seu saldo atual é: R$ ${Number(cliente.balance || 0).toFixed(2)} 📋`);
      } else {
        await enviar(telefone, 'Não encontrei seu cadastro. Fale com o atendente.');
      }
    }

    else if (['0', 'atendente'].includes(t)) {
      await enviar(telefone, `Certo, ${nome}. Estou chamando o atendente. 📞`);
    }

    else {
      await enviar(telefone, `Recebi sua mensagem, ${nome}. ✅\nDigite *cardápio* para continuar.`);
    }
  } catch (error) {
    console.error('❌ Erro no processar:', error.message);
    try {
      await enviar(telefone, 'Ocorreu um erro ao processar sua mensagem. Tente novamente.');
    } catch {}
  }
}

module.exports = { processar, setBanco };
console.log('🤖 bot.js carregado com webhook, api e banco ✅');
