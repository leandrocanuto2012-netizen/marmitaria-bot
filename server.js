require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ========== CONEXÃO DIRETA — FORÇA IPv4 ==========
const pool = new Pool({
  host: 'db.rurubtvjhtymhriwlrlr.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'leandrocanuto123',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  family: 4 // 🔑 IGNORA IPv6 — ISSO RESOLVE!
});

// Testar conexão
async function testarBanco() {
  try {
    const cliente = await pool.connect();
    console.log('✅ BANCO CONECTADO COM SUCESSO!');
    cliente.release();
  } catch (erro) {
    console.error('❌ ERRO NO BANCO:', erro.message);
    console.error('Detalhes:', erro);
  }
}
testarBanco();

// ========== VARIÁVEIS DA EVOLUTION ==========
console.log('🔍 VARIÁVEIS:');
console.log('EVO_URL:', process.env.EVO_URL || '❌ FALTA');
console.log('EVO_KEY:', process.env.EVO_KEY ? '✅ OK' : '❌ FALTA');
console.log('EVO_INSTANCE:', process.env.EVO_INSTANCE || 'marmitaria');

// ========== INICIAR BOT ==========
bot.init(app, pool);

// ========== PORTA ==========
const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`🚀 SERVIDOR RODANDO NA PORTA ${PORTA}`);
  console.log(`📡 WEBHOOK PRONTO!`);
});
