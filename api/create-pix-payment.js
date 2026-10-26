const { agendamentoAtivo, sheetsClient } = require('./_booking-utils');

const VALOR_SINAL = 50;
const EXPIRACAO_PIX_MS = 35 * 60 * 1000;
const TENTATIVA_EM_ANDAMENTO_MS = 2 * 60 * 1000;

function siteUrl(req) {
  const configurada = String(process.env.SITE_URL || '').replace(/\/$/, '');
  if (configurada) return configurada;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocolo = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${protocolo}://${host}` : 'https://matrixreloaded.vercel.app';
}

function respostaPagamento(dados, expiresAt) {
  const pagamento = dados || {};
  const transacao = pagamento.point_of_interaction?.transaction_data || {};
  return {
    ok: true,
    paymentId: String(pagamento.id),
    status: pagamento.status,
    statusDetail: pagamento.status_detail,
    expiresAt: expiresAt || pagamento.date_of_expiration || null,
    pix: {
      qrCode: transacao.qr_code || '',
      qrCodeBase64: transacao.qr_code_base64 || '',
      ticketUrl: transacao.ticket_url || ''
    }
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { idAgendamento } = req.body || {};
    if (!/^AG-(CAS|GRA|CAM)-\d+$/.test(String(idAgendamento || ''))) {
      return res.status(400).json({ error: 'Agendamento inválido' });
    }
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'Mercado Pago não configurado' });

    const cidade = { CAS: 'Cascavel', GRA: 'Gravatai', CAM: 'Camboriu' }[idAgendamento.split('-')[1]];
    const sheets = sheetsClient();
    const leitura = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${cidade}!A:T`
    });
    const linhas = leitura.data.values || [];
    const indice = linhas.findIndex(linha => linha[1] === idAgendamento);
    if (indice < 0) return res.status(404).json({ error: 'Agendamento não encontrado' });

    const linha = linhas[indice];
    const numeroLinha = indice + 1;
    const statusAgendamento = String(linha[4] || '').toLowerCase();
    if (statusAgendamento === 'confirmado') return res.status(409).json({ error: 'Este agendamento já foi pago' });
    if (statusAgendamento !== 'aguardando_pagamento') return res.status(409).json({ error: 'Este agendamento não está aguardando pagamento' });

    const pagamentoExistenteId = String(linha[3] || '');
    let podeCriarNovaTentativa = !pagamentoExistenteId;
    let pagamentoExistenteCriadoEm = null;
    if (pagamentoExistenteId) {
      if (!/^\d+$/.test(pagamentoExistenteId)) {
        return res.status(409).json({ error: 'Já existe outro pagamento associado a este agendamento' });
      }
      const consultaExistente = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(pagamentoExistenteId)}`, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      });
      const pagamentoExistente = await consultaExistente.json().catch(() => ({}));
      if (!consultaExistente.ok) return res.status(502).json({ error: 'Não foi possível recuperar o Pix existente' });
      pagamentoExistenteCriadoEm = Date.parse(pagamentoExistente.date_created || '');
      if (pagamentoExistente.external_reference !== idAgendamento) {
        return res.status(409).json({ error: 'O pagamento existente não corresponde ao agendamento' });
      }
      if (pagamentoExistente.status === 'approved') {
        return res.status(200).json(respostaPagamento(pagamentoExistente, linha[18]));
      }
      if (['pending', 'in_process'].includes(pagamentoExistente.status) && Date.parse(linha[18] || '') > Date.now()) {
        return res.status(200).json(respostaPagamento(pagamentoExistente, linha[18]));
      }
      if (['pending', 'in_process'].includes(pagamentoExistente.status)) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SHEET_ID,
          range: `${cidade}!E${numeroLinha}:E${numeroLinha}`,
          valueInputOption: 'RAW',
          requestBody: { values: [['pix_expirado']] }
        });
        return res.status(409).json({ error: 'Este Pix expirou. Crie um novo agendamento para tentar novamente.' });
      }
      podeCriarNovaTentativa = ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(pagamentoExistente.status);
      if (!podeCriarNovaTentativa) {
        return res.status(409).json({ error: 'Este pagamento não permite uma nova tentativa.' });
      }
    }

    if (!agendamentoAtivo(linha)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SHEET_ID,
        range: `${cidade}!E${numeroLinha}:E${numeroLinha}`,
        valueInputOption: 'RAW',
        requestBody: { values: [['agendamento_expirado']] }
      });
      return res.status(409).json({ error: 'A reserva expirou. Escolha o horário novamente.' });
    }

    const email = String(linha[7] || '').trim();
    if (!email) return res.status(400).json({ error: 'E-mail do agendamento não encontrado' });
    const expiraEm = new Date(Date.now() + EXPIRACAO_PIX_MS);
    const expiresAt = expiraEm.toISOString();
    const tentativaAnterior = String(linha[19] || '').match(/^(\d+)\|(\d+)$/);
    const tentativaAnteriorNumero = tentativaAnterior ? Number(tentativaAnterior[1]) : 0;
    const tentativaIniciadaEm = tentativaAnterior ? Number(tentativaAnterior[2]) : 0;
    const pagamentoAnteriorDaTentativa = Number.isFinite(pagamentoExistenteCriadoEm)
      && pagamentoExistenteCriadoEm < tentativaIniciadaEm - 10000;
    const reutilizarTentativa = tentativaAnterior
      && Date.now() - tentativaIniciadaEm < TENTATIVA_EM_ANDAMENTO_MS
      && (!pagamentoExistenteId || pagamentoAnteriorDaTentativa);
    const numeroTentativa = reutilizarTentativa ? tentativaAnteriorNumero : tentativaAnteriorNumero + 1;
    const idempotencyKey = `${idAgendamento}-pix-${numeroTentativa}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${cidade}!T${numeroLinha}:T${numeroLinha}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[`${numeroTentativa}|${reutilizarTentativa ? tentativaIniciadaEm : Date.now()}`]] }
    });

    const resposta = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        transaction_amount: VALOR_SINAL,
        description: 'Sinal de agendamento de tatuagem',
        payment_method_id: 'pix',
        external_reference: idAgendamento,
        date_of_expiration: expiresAt,
        notification_url: `${siteUrl(req)}/api/mp-webhook`,
        payer: { email }
      })
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      console.error('Mercado Pago create Pix payment:', resposta.status, dados);
      const causa = Array.isArray(dados.cause)
        ? dados.cause.map(item => item.description || item.message || item.code).filter(Boolean).join('; ')
        : '';
      return res.status(502).json({
        error: dados.message || 'Mercado Pago recusou a criação do Pix',
        detail: causa || dados.error || dados.status || ''
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `${cidade}!D${numeroLinha}:D${numeroLinha}`, values: [[String(dados.id)]] },
          { range: `${cidade}!S${numeroLinha}:S${numeroLinha}`, values: [[expiresAt]] }
        ]
      }
    });
    return res.status(200).json(respostaPagamento(dados, expiresAt));
  } catch (erro) {
    console.error('Falha ao criar Pix:', erro);
    return res.status(500).json({ error: 'Falha ao criar Pix' });
  }
};
