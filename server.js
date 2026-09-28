require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const QRCode = require('qrcode');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Configuração do banco PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Variáveis para API EVO (substitua pelos seus valores)
const EVO_URL = process.env.EVO_URL || 'https://whatsapp-api-production-8dcf.up.railway.app'; // Exemplo
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'marmitaria';
const EVO_KEY = process.env.EVO_KEY || '8de0035b89cfc53ba0dc4587ecd95f491d89897306739400ccdb347a33e11f3a';

// Função para enviar mensagem via API EVO
async function enviar(telefone, texto) {
  try {
    await axios.post(
      `${EVO_URL}/message/sendText/${EVO_INSTANCE}`,
      { number: telefone, text: texto },
      { headers: { apikey: EVO_KEY } }
    );
    console.log(`✅ Mensagem enviada para ${telefone}: ${texto}`);
    return true;
  } catch (e) {
    console.error(`❌ Erro ao enviar para ${telefone}:`, e.response?.data || e.message);
    return false;
  }
}

// Função para buscar cliente no banco pelo telefone
async function buscarCliente(telefone) {
  try {
    const res = await pool.query('SELECT * FROM clients WHERE phone = $1', [telefone]);
    return res.rows[0];
  } catch (e) {
    console.error('Erro ao buscar cliente:', e.message);
    return null;
  }
}

// Função para gerar payload PIX simplificado (exemplo)
function gerarPayloadPix(chavePix, valor, descricao) {
  const valorStr = valor.toFixed(2).replace('.', ',');
  return `00020126580014BR.GOV.BCB.PIX0136${chavePix}5204000053039865405${(valor*100).toFixed(0).padStart(4,'0')}5802BR5925Marmitaria Exemplo6009Sao Paulo61080540900062070503***6304`;
}

// Função para gerar QR Code base64 a partir do payload PIX
async function gerarQrCodeBase64(payload) {
  try {
    return await QRCode.toDataURL(payload);
  } catch (e) {
    console.error('Erro ao gerar QR Code:', e);
    return null;
  }
}

// Função principal do bot para processar mensagens
async function processar(telefone, texto, pushName) {
  const t = String(texto || '').trim().toLowerCase();
  if (!t) return;

  const cliente = await buscarCliente(telefone);
  const nome = cliente?.name || pushName || 'amigo(a)';

  console.log(`💬 ${nome} diz: "${texto}"`);

  try {
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
        'Para pedir, digite: pedido [número do prato]\nExemplo: pedido 1'
      );
    }
    else if (t.startsWith('pedido ')) {
      const num = t.split(' ')[1];
      const pratos = {
        '1': { nome: 'Pequena', valor: 15.00 },
        '2': { nome: 'Média', valor: 18.00 },
        '3': { nome: 'Grande', valor: 22.00 }
      };
      const prato = pratos[num];
      if (!prato) {
        await enviar(telefone, `Desculpe, não encontrei o prato número ${num}. Digite *cardápio* para ver as opções.`);
        return;
      }

      const chavePix = process.env.CHAVE_PIX || 'seu-email-ou-chave-pix';
      const descricao = `Pedido ${prato.nome} para ${nome}`;
      const payload = gerarPayloadPix(chavePix, prato.valor, descricao);
      const qrCodeBase64 = await gerarQrCodeBase64(payload);

      if (!qrCodeBase64) {
        await enviar(telefone, 'Erro ao gerar QR Code PIX. Tente novamente.');
        return;
      }

      try {
        await pool.query(
          'INSERT INTO orders (phone, name, item, price, status) VALUES ($1, $2, $3, $4, $5)',
          [telefone, nome, prato.nome, prato.valor, 'pending']
        );
        console.log(`Pedido salvo para ${telefone}: ${prato.nome}`);
      } catch (e) {
        console.error('Erro ao salvar pedido:', e.message);
      }

      await enviar(telefone,
        `Pedido: ${prato.nome} — R$ ${prato.valor.toFixed(2)}\n` +
        `Para pagar via PIX, escaneie o QR Code abaixo ou copie o código:\n\n${payload}\n\n` +
        `QR Code (imagem base64):\n${qrCodeBase64}`
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
      await enviar(telefone, `Recebi, ${nome}! ✅ Digite *cardápio* para ver as opções.`);
    }
  } catch (error) {
    console.error('Erro no processar:', error);
    try {
      await enviar(telefone, 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.');
    } catch {}
  }
}

// Webhook para receber mensagens do WhatsApp/EVO
app.post('/api/bot/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log('📩 EVENTO:', event);

    if (event === 'messages.upsert') {
      const msg = data?.messages?.[0];
      if (!msg || msg.fromMe) {
        return res.sendStatus(200);
      }

      const telefone = msg.key?.remoteJid?.replace('@s.whatsapp.net', '');
      const texto =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';
      const pushName = msg.pushName || 'Cliente';

      console.log(`📞 ${telefone} | "${texto}"`);

      if (telefone && texto) {
        await processar(telefone, texto, pushName);
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('❌ ERRO no webhook:', e.message);
    res.sendStatus(500);
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 1000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
