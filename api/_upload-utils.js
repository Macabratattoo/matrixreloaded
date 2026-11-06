'use strict';

const crypto = require('crypto');

const MAX_PHOTOS = 7;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const TOKEN_BYTES = 32;

function criarTokenUpload() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function tokenValido(tokenEsperado, tokenRecebido) {
  if (typeof tokenEsperado !== 'string' || typeof tokenRecebido !== 'string') return false;
  const esperado = Buffer.from(tokenEsperado, 'utf8');
  const recebido = Buffer.from(tokenRecebido, 'utf8');
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

function decodificarBase64(valor) {
  if (typeof valor !== 'string' || !valor || valor.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(valor)) return null;
  const dados = Buffer.from(valor, 'base64');
  if (!dados.length || dados.toString('base64') !== valor) return null;
  return dados;
}

function assinaturaDaImagem(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (jpeg) return { extensao: 'jpg', mimeType: 'image/jpeg' };

  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (png) return { extensao: 'png', mimeType: 'image/png' };

  const webp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (webp) return { extensao: 'webp', mimeType: 'image/webp' };

  return null;
}

module.exports = {
  MAX_PHOTOS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_REQUEST_BYTES,
  criarTokenUpload,
  tokenValido,
  decodificarBase64,
  assinaturaDaImagem
};
