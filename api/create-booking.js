const {
  abaDaCidade,
  normalizarTamanho,
  parseData,
  parseHorario,
  sheetsClient,
  calendarClient,
  calendarioDaAba,
  intervalosDoAgendamento,
  intervaloComoDatas,
  intervalosConflitam,
  disponibilidadeDetalhada,
  FUSO
} = require('./_booking-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { cidade, nome, email, whatsapp, data, horario, tatuagem, tamanho, duvidas, recomendacao } = req.body || {};
    const aba = abaDaCidade(cidade);
    const dataISO = parseData(data);
    const hora = parseHorario(horario);
    const tamanhoCodigo = normalizarTamanho(tamanho);
    const calculo = intervalosDoAgendamento(dataISO, hora, tamanhoCodigo);
    if (!aba) return res.status(400).json({ error: 'Cidade inválida' });
    if (!nome || !email || !whatsapp || !tatuagem || !dataISO || !hora) return res.status(400).json({ error: 'Preencha os campos obrigatórios' });
    if (!calculo) return res.status(400).json({ error: 'Tamanho ou horário inválido' });

    const sheets = sheetsClient();
    const leitura = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: `${aba}!A:T` });
    const linhas = leitura.data.values || [];
    const reservasPlanilha = [];
    for (const linha of linhas) {
      const status = String(linha[4] || '').toLowerCase();
      if (status !== 'confirmado') continue;
      const reserva = intervalosDoAgendamento(parseData(linha[9]), parseHorario(linha[10]), linha[11]);
      if (reserva) reservasPlanilha.push(...reserva.intervalos.map(intervaloComoDatas));
    }
    const ocupadosPlanilha = reservasPlanilha.map(i => ({ ...i, origem: 'sheet' }));
    if (calculo.intervalos.some(i => ocupadosPlanilha.some(o => intervalosConflitam(i, o)))) {
      return res.status(409).json({ error: 'Existe uma reserva pendente ou confirmada nesse intervalo' });
    }

    const disponibilidade = await disponibilidadeDetalhada({ aba, minISO: dataISO, maxISO: calculo.sobra ? calculo.intervalos[1].dataInicio : dataISO });
    const ocupadosExternos = disponibilidade.ocupados || [];
    if (calculo.intervalos.some(i => ocupadosExternos.some(o => intervalosConflitam(i, o)))) {
      return res.status(409).json({ error: 'Existe conflito no horário escolhido ou no bloqueio do dia seguinte' });
    }

    const calendarId = calendarioDaAba(aba);
    const calendar = calendarClient();
    for (const intervalo of calculo.intervalos) {
      const busy = await calendar.freebusy.query({ requestBody: {
        timeMin: `${intervalo.dataInicio}T${intervalo.horaInicio}:00-03:00`,
        timeMax: `${intervalo.dataFim}T${intervalo.horaFim}:00-03:00`,
        timeZone: FUSO,
        items: [{ id: calendarId }]
      }});
      if ((busy.data.calendars?.[calendarId]?.busy || []).length > 0) return res.status(409).json({ error: 'O horário acabou de ser ocupado' });
    }

    const idAgendamento = `AG-${aba.substring(0, 3).toUpperCase()}-${Date.now()}`;
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!A:T`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[
        linhas.length, idAgendamento, idAgendamento, '', 'aguardando_pagamento',
        nome, whatsapp, email, tatuagem, dataISO, hora, tamanhoCodigo,
        duvidas || '', recomendacao || '', '', 50, new Date().toISOString(), '', '', ''
      ]] }
    });
    return res.status(200).json({ ok: true, id: idAgendamento, tamanho: tamanhoCodigo, duracaoMinutos: calculo.duracao, sobraMinutos: calculo.sobra });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao salvar: ' + erro.message });
  }
};
