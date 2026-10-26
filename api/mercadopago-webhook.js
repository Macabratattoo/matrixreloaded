const confirmar = require('./confirmar-agendamento');

function cidadePorAgendamento(id) {
  const prefixo = String(id || '').toUpperCase().split('-')[1];
  return { CAS: 'Cascavel', GRA: 'Gravatai', CAM: 'Camboriu' }[prefixo] || '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();
  if (req.method !== 'POST') return res.status(200).json({ received: true });

  try {
    const tipo = req.body?.type || req.body?.topic;
    const paymentId = req.body?.data?.id || req.body?.id;
    if (tipo !== 'payment' || !paymentId) return res.status(200).json({ received: true });
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ received: false });

    const consulta = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    if (!consulta.ok) return res.status(502).json({ received: false });
    const pagamento = await consulta.json();
    const cidade = cidadePorAgendamento(pagamento.external_reference);
    if (!cidade || !pagamento.external_reference) return res.status(200).json({ received: true });

    let statusCode = 200;
    let resultado;
    const fakeResponse = {
      status: codigo => { statusCode = codigo; return fakeResponse; },
      json: dados => { resultado = dados; return fakeResponse; },
      end: () => fakeResponse
    };
    await confirmar({
      method: 'POST',
      body: {
        idAgendamento: pagamento.external_reference,
        paymentId: String(paymentId),
        cidade
      }
    }, fakeResponse);
    if (statusCode >= 500) {
      console.error('Falha temporária ao confirmar pagamento do webhook:', statusCode, resultado);
      return res.status(500).json({ received: false });
    }
    return res.status(200).json({ received: true });
  } catch (erro) {
    console.error('Webhook Mercado Pago:', erro);
    return res.status(500).json({ received: false });
  }
};
