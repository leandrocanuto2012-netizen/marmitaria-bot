require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bot = require('./bot');
const net = require('net');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ========== BANCO — FORÇA IPv4 DEFINITIVAMENTE ==========
function extrairConexao(url) {
  const m = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!m) return null;
  return {
    host: m[3],
    port: parseInt(m[4]),
    user: m[1],
    password: m[2],
    database: m[5],
    ssl: { rejectUnauthorized: false },
    family: 4, // 🔑 AQUI — força IPv4, ignora IPv6!
  };
}

const config = extrairConexao(process.env.DATABASE_URL);
const pool = new Pool(config);

// Teste de conexão
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

// ========== VARIÁVEIS ==========
console.log('🔍 VARIÁVEIS:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ OK' : '❌ FALTA');
console.log('EVO_URL:', process.env.EVO_URL ? '✅ OK' : '❌ FALTA');
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
