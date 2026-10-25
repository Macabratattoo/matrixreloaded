const { Readable } = require('stream');
const { google } = require('googleapis');
const {
  FUSO,
  abaDaCidade,
  disponibilidade,
  normalizarTamanho,
  parseData,
  parseHorario,
  sheetsClient,
  calendarClient,
  calendarioDaAba,
  intervalosDoAgendamento
} = require('./_booking-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { cidade, nome, email, whatsapp, data, horario, tatuagem, tamanho, duvidas, recomendacao, fotos } = req.body || {};
    const aba = abaDaCidade(cidade);
    const dataISO = parseData(data);
    const hora = parseHorario(horario);
    const tamanhoCodigo = normalizarTamanho(tamanho);
    const calculo = intervalosDoAgendamento(dataISO, hora, tamanhoCodigo);

    if (!aba) return res.status(400).json({ error: 'Cidade inválida' });
    if (!nome || !email || !whatsapp || !tatuagem || !dataISO || !hora) {
      return res.status(400).json({ error: 'Preencha os campos obrigatórios' });
    }
    if (!calculo) return res.status(400).json({ error: 'Tamanho ou horário inválido' });

    const sheets = sheetsClient();
    const leitura = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: `${aba}!A:T` });
    const linhas = leitura.data.values || [];
    const conflitoPlanilha = linhas.some(linha => {
      const status = String(linha[4] || '').toLowerCase();
      return parseData(linha[9]) === dataISO && parseHorario(linha[10]) === hora && !['cancelado', 'expirado'].includes(status);
    });
    if (conflitoPlanilha) return res.status(409).json({ error: 'Este horário já está reservado' });

    const indisponiveis = await disponibilidade({ aba, minISO: dataISO, maxISO: calculo.sobra ? calculo.intervalos[1].dataInicio : dataISO });
    if (indisponiveis.has(dataISO) || (calculo.sobra && indisponiveis.has(calculo.intervalos[1].dataInicio))) {
      return res.status(409).json({ error: 'Este dia já está reservado ou bloqueado' });
    }

    const calendarId = calendarioDaAba(aba);
    const calendar = calendarClient();
    for (const intervalo of calculo.intervalos) {
      const busy = await calendar.freebusy.query({
        requestBody: {
          timeMin: `${intervalo.dataInicio}T${intervalo.horaInicio}:00-03:00`,
          timeMax: `${intervalo.dataFim}T${intervalo.horaFim}:00-03:00`,
          timeZone: FUSO,
          items: [{ id: calendarId }]
        }
      });
      if ((busy.data.calendars?.[calendarId]?.busy || []).length > 0) {
        return res.status(409).json({ error: 'Existe conflito no horário escolhido ou no bloqueio do dia seguinte' });
      }
    }

    const driveOAuth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    driveOAuth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: driveOAuth });
    const idAgendamento = `AG-${aba.substring(0, 3).toUpperCase()}-${Date.now()}`;
    const linksFotos = [];
    for (const [i, foto] of (Array.isArray(fotos) ? fotos : []).entries()) {
      const arquivo = await drive.files.create({
        requestBody: { name: `${idAgendamento}_${i + 1}_${foto.name}`, parents: [process.env.DRIVE_FOLDER_ID] },
        media: { mimeType: foto.mimeType, body: Readable.from(Buffer.from(foto.base64, 'base64')) },
        fields: 'id, webViewLink'
      });
      linksFotos.push(arquivo.data.webViewLink || arquivo.data.id);
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!A:T`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[
        linhas.length, idAgendamento, idAgendamento, '', 'aguardando_pagamento',
        nome, whatsapp, email, tatuagem, dataISO, hora, tamanhoCodigo,
        duvidas || '', recomendacao || '', linksFotos.join('\n'), 50,
        new Date().toISOString(), '', '', ''
      ]] }
    });

    return res.status(200).json({ ok: true, id: idAgendamento, tamanho: tamanhoCodigo, duracaoMinutos: calculo.duracao, sobraMinutos: calculo.sobra });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao salvar: ' + erro.message });
  }
};
