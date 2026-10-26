const crypto = require('crypto');

module.exports = function verifyMercadoPagoWebhook(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'Webhook secret não configurado' };

  const signature = String(req.headers?.['x-signature'] || '');
  const requestId = String(req.headers?.['x-request-id'] || '');
  const rawDataId = req.query?.['data.id'];
  const dataId = Array.isArray(rawDataId) ? String(rawDataId[0] || '') : String(rawDataId || '');
  const parts = signature.split(',').map(part => part.trim().split('=', 2));
  const timestamp = parts.find(([key]) => key === 'ts')?.[1];
  const receivedHash = parts.find(([key]) => key === 'v1')?.[1];

  if (!timestamp || !receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash)) {
    return { ok: false, status: 401, error: 'Assinatura do webhook inválida' };
  }

  const manifest = [
    ...(dataId ? [`id:${dataId}`] : []),
    ...(requestId ? [`request-id:${requestId}`] : []),
    `ts:${timestamp}`
  ].join(';') + ';';
  const expectedHash = crypto.createHmac('sha256', secret).update(manifest).digest();
  const providedHash = Buffer.from(receivedHash, 'hex');

  if (expectedHash.length !== providedHash.length || !crypto.timingSafeEqual(expectedHash, providedHash)) {
    return { ok: false, status: 401, error: 'Assinatura do webhook inválida' };
  }

  return { ok: true };
};
