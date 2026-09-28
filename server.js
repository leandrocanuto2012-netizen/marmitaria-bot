const axios = require('axios');

const EVO_URL = process.env.EVO_URL;
const EVO_KEY = process.env.EVO_KEY;
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';

let pool = null;
function setBanco(conexao) {
  pool = conexao;
  console.log('✅ [bot.js] Banco conectado');
}

// ENVIAR MENSAGEM
async function enviar(telefone, texto) {
  try {
    await axios.post(
      `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
      { number: telefone, text: texto },
      { headers: { apikey: EVO_KEY } }
    );
    console.log('✅ RESPOSTA ENVIADA →', telefone);
    return true;
  } catch (e) {
    console.error('❌ ERRO ENVIO:', e.response?.data || e.message);
    return false;
  }
}

// BUSCAR CLIENTE
async function buscarCliente(telefone) {
  if (!pool) return null;
  try {
    const res = await pool.query(
      'SELECT name, balance FROM customers WHERE phone = $1 LIMIT 1',
      [telefone]
    );
    return res.rows[0] || null;
  } catch (e) {
    console.error('❌ ERRO BUSCA:', e.message);
    return null;
  }
}

// LÓGICA PRINCIPAL
async function processar(telefone, texto, pushName) {
  const t = String(texto || '').trim().toLowerCase();
  const cliente = await buscarCliente(telefone);
  const nome = cliente?.name || pushName || 'amigo(a)';

  console.log(`💬 ${nome} diz: "${texto}"`);

  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'ou'].includes(t)) {
    await enviar(telefone,
      `Olá, ${nome}! 😋 Tudo bem?\n\nDigite *cardápio* para ver os pratos!`
    );
  }
  else if (['cardápio', 'cardapio', 'menu'].includes(t)) {
    await enviar(telefone,
      `🍽️ CARDÁPIO — ${nome}\n\n` +
      '1️⃣ Pequena — R$ 15,00\n' +
      '2️⃣ Média — R$ 18,00\n' +
      '3️⃣ Grande — R$ 22,00\n' +
      '4️⃣ Meu Fiado\n' +
      '0️⃣ Falar com Atendente'
    );
  }
  else if (['4', 'fiado', 'saldo'].includes(t)) {
    if (cliente) {
      await enviar(telefone, `${nome}, seu saldo: R$ ${cliente.balance || 0} 📋`);
    } else {
      await enviar(telefone, `${nome}, não encontrei seu cadastro. Fale com atendente!`);
    }
  }
  else if (['0', 'atendente'].includes(t)) {
    await enviar(telefone, `Certo ${nome}! 📞 Chamando atendente...`);
  }
  else {
    await enviar(telefone, `Recebi, ${nome}! ✅ Digite *cardápio*`);
  }
}

module.exports = { processar, setBanco };
console.log('🤖 bot.js CARREGADO COMPLETO ✅');
