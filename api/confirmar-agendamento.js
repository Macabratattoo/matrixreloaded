const {
  DURACAO_MINUTOS,
  FUSO,
  abaDaCidade,
  calendarioDaAba,
  calendarClient,
  normalizarTamanho,
  parseData,
  parseHorario,
  sheetsClient,
  somarMinutos
} = require('./_booking-utils');

const VALOR_SINAL = 50;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { idAgendamento, paymentId, cidade } = req.body || {};
    const aba = abaDaCidade(cidade);
    if (!aba || !idAgendamento || !paymentId) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Mercado Pago não configurado no servidor' });
    }

    const respMp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    if (!respMp.ok) return res.status(400).json({ error: 'Pagamento não encontrado' });
    const pagamento = await respMp.json();
    if (pagamento.status !== 'approved' || Number(pagamento.transaction_amount) < VALOR_SINAL) {
      return res.status(402).json({ error: 'Pagamento ainda não aprovado' });
    }
    if (pagamento.external_reference && pagamento.external_reference !== idAgendamento) {
      return res.status(400).json({ error: 'Pagamento não corresponde ao agendamento' });
    }

    const sheets = sheetsClient();
    const leitura = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!A:T`
    });
    const linhas = leitura.data.values || [];
    const indice = linhas.findIndex(linha => linha[1] === idAgendamento);
    if (indice < 0) return res.status(404).json({ error: 'Agendamento não encontrado' });
    const linha = linhas[indice];
    const linhaPlanilha = indice + 1;

    if (String(linha[4] || '').toLowerCase() === 'confirmado') {
      return res.status(200).json({ ok: true, jaConfirmado: true, eventoId: linha[18] || null });
    }
    if (linhas.some((outra, i) => i !== indice && String(outra[3] || '') === String(paymentId))) {
      return res.status(409).json({ error: 'Pagamento já usado em outro agendamento' });
    }

    const dataISO = parseData(linha[9]);
    const inicio = parseHorario(linha[10]);
    const fim = somarMinutos(inicio, DURACAO_MINUTOS);
    const calendarId = calendarioDaAba(aba);
    if (!calendarId || !dataISO || !inicio) {
      return res.status(500).json({ error: 'Dados de calendário incompletos' });
    }

    const calendar = calendarClient();
    const busy = await calendar.freebusy.query({
      requestBody: {
        timeMin: `${dataISO}T${inicio}:00-03:00`,
        timeMax: `${dataISO}T${fim}:00-03:00`,
        timeZone: FUSO,
        items: [{ id: calendarId }]
      }
    });
    if ((busy.data.calendars?.[calendarId]?.busy || []).length > 0) {
      return res.status(409).json({ error: 'O horário ficou ocupado antes da confirmação' });
    }

    const tamanho = normalizarTamanho(linha[11]) || String(linha[11] || '');
    const evento = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `Tatuagem - ${linha[5]}`,
        description: [
          `WhatsApp: ${linha[6]}`,
          `E-mail: ${linha[7]}`,
          `Tatuagem e local: ${linha[8]}`,
          `Tamanho: ${tamanho}`,
          `Dúvidas: ${linha[12] || 'Nenhuma'}`,
          `Recomendação: ${linha[13] || 'Nenhuma'}`,
          `Fotos: ${linha[14] || 'Sem fotos'}`,
          `Pagamento do sinal: ${paymentId}`,
          `Código: ${idAgendamento}`
        ].join('\n'),
        start: { dateTime: `${dataISO}T${inicio}:00`, timeZone: FUSO },
        end: { dateTime: `${dataISO}T${fim}:00`, timeZone: FUSO }
      }
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!D${linhaPlanilha}:E${linhaPlanilha}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[String(paymentId), 'confirmado']] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!L${linhaPlanilha}:L${linhaPlanilha}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[tamanho]] }
    });

    return res.status(200).json({ ok: true, eventoId: evento.data.id, link: evento.data.htmlLink });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao confirmar: ' + erro.message });
  }
};
