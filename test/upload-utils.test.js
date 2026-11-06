'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_PHOTOS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  criarTokenUpload,
  tokenValido,
  decodificarBase64,
  assinaturaDaImagem
} = require('../api/_upload-utils');

function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

test('gera tokens de upload aleatórios e compara sem aceitar token diferente', () => {
  const primeiro = criarTokenUpload();
  const segundo = criarTokenUpload();
  assert.match(primeiro, /^[a-f0-9]{64}$/);
  assert.match(segundo, /^[a-f0-9]{64}$/);
  assert.notEqual(primeiro, segundo);
  assert.equal(tokenValido(primeiro, primeiro), true);
  assert.equal(tokenValido(primeiro, segundo), false);
});

test('mantém limites rígidos do upload', () => {
  assert.equal(MAX_PHOTOS, 7);
  assert.equal(MAX_FILE_BYTES, 3 * 1024 * 1024);
  assert.equal(MAX_TOTAL_BYTES, 12 * 1024 * 1024);
});

test('aceita apenas Base64 canônico e detecta assinaturas JPEG, PNG e WebP', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Buffer.from('RIFFxxxxWEBP', 'ascii');

  assert.deepEqual(assinaturaDaImagem(decodificarBase64(base64(jpeg))), { extensao: 'jpg', mimeType: 'image/jpeg' });
  assert.deepEqual(assinaturaDaImagem(decodificarBase64(base64(png))), { extensao: 'png', mimeType: 'image/png' });
  assert.deepEqual(assinaturaDaImagem(decodificarBase64(base64(webp))), { extensao: 'webp', mimeType: 'image/webp' });
  assert.equal(decodificarBase64('not-base64!'), null);
  assert.equal(assinaturaDaImagem(Buffer.from('image/jpeg')), null);
});
