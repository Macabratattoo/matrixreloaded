const { InvalidWebhookSignatureError, WebhookSignatureValidator } = require('mercadopago');

module.exports = function verifyMercadoPagoWebhook(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'Webhook secret não configurado' };

  const signature = String(req.headers?.['x-signature'] || '');
  const requestId = String(req.headers?.['x-request-id'] || '');
  const rawDataId = req.query?.['data.id'];
  const dataId = Array.isArray(rawDataId) ? String(rawDataId[0] || '') : String(rawDataId || '');

  if (!signature) {
    return { ok: false, status: 401, error: 'Assinatura do webhook inválida' };
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: signature,
      xRequestId: requestId,
      dataId,
      secret,
      toleranceSeconds: 5 * 60
    });
  } catch (erro) {
    if (erro instanceof InvalidWebhookSignatureError) {
      return { ok: false, status: 401, error: 'Assinatura do webhook inválida' };
    }
    throw erro;
  }

  return { ok: true };
};
