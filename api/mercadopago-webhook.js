const confirmar = require('./confirmar-agendamento');

function cidadePorAgendamento(id) {
  const prefixo = String(id || '').toUpperCase().split('-')[1];
  return { CAS: 'Cascavel', GRA: 'Gravatai', CAM: 'Camboriu' }[prefixo] || '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();
  res.status(200).json({ received: true });
  if (req.method !== 'POST') return;

  try {
    const tipo = req.body?.type || req.body?.topic;
    const paymentId = req.body?.data?.id || req.body?.id;
    if (tipo !== 'payment' || !paymentId) return;

    const consulta = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    if (!consulta.ok) return;
    const pagamento = await consulta.json();
    const cidade = cidadePorAgendamento(pagamento.external_reference);
    if (!cidade || !pagamento.external_reference) return;

    const fakeResponse = {
      status: () => fakeResponse,
      json: () => fakeResponse,
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
  } catch (erro) {
    console.error('Webhook Mercado Pago:', erro);
  }
};
