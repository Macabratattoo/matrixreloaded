const confirmar = require('./confirmar-agendamento');
const verificarAssinatura = require('./_verify-mercadopago-webhook');

function cidadePorAgendamento(id) {
  const prefixo = String(id || '').toUpperCase().split('-')[1];
  return { CAS: 'Cascavel', GRA: 'Gravatai', CAM: 'Camboriu' }[prefixo] || '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();
  if (req.method === 'GET') return res.status(200).json({ received: true });
  try {
    const assinatura = verificarAssinatura(req);
    if (!assinatura.ok) return res.status(assinatura.status).json({ error: assinatura.error });

    const orderId = req.body?.data?.id || req.body?.id;
    const tipo = req.body?.type || req.body?.topic;
    if (tipo && tipo !== 'order' && tipo !== 'orders') return res.status(200).json({ received: true });
    if (!orderId) return res.status(200).json({ received: true });
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ received: false });
    const consulta = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } });
    if (!consulta.ok) return res.status(502).json({ received: false });
    const order = await consulta.json();
    const pagamento = order.transactions?.payments?.[0];
    const cidade = cidadePorAgendamento(order.external_reference);
    const aprovado = ['processed', 'approved', 'accredited'].includes(pagamento?.status || order.status);
    if (!aprovado || !cidade || !order.external_reference) return res.status(200).json({ received: true });
    let statusCode = 200;
    let resultado;
    const fakeResponse = {
      status: codigo => { statusCode = codigo; return fakeResponse; },
      json: dados => { resultado = dados; return fakeResponse; },
      end: () => fakeResponse
    };
    await confirmar({ method: 'POST', body: { idAgendamento: order.external_reference, orderId: String(orderId), cidade } }, fakeResponse);
    if (statusCode >= 500) {
      console.error('Falha temporária ao confirmar order do webhook:', statusCode, resultado);
      return res.status(500).json({ received: false });
    }
    return res.status(200).json({ received: true });
  } catch (erro) {
    console.error('Webhook Order Mercado Pago:', erro);
    return res.status(500).json({ received: false });
  }
};
