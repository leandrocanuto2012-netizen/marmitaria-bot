require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ========== BANCO DE DADOS (SUPABASE) ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Testar conexão com banco
async function testarBanco() {
  try {
    const cliente = await pool.connect();
    console.log('✅ BANCO CONECTADO COM SUCESSO!');
    cliente.release();
  } catch (erro) {
    console.error('❌ ERRO NO BANCO:', erro.message);
  }
}
testarBanco();

// ========== INICIALIZAR BOT ==========
bot.init(app, pool);

// ========== TESTE DE AMBIENTE ==========
console.log('🔍 VARIÁVEIS CARREGADAS:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ OK' : '❌ FALTA');
console.log('EVO_URL:', process.env.EVO_URL ? '✅ OK' : '❌ FALTA');
console.log('EVO_KEY:', process.env.EVO_KEY ? '✅ OK' : '❌ FALTA');
console.log('EVO_INSTANCE:', process.env.EVO_INSTANCE || 'marmitaria');

// ========== INICIAR SERVIDOR ==========
const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORTA}`);
  console.log(`📡 WEBHOOK: https://SEU-RENDER.onrender.com/api/bot/webhook`);
});
