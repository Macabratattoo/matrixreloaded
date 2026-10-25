const { Readable } = require('stream');
const {
  DURACAO_MINUTOS,
  FUSO,
  abaDaCidade,
  disponibilidade,
  normalizarTamanho,
  parseData,
  parseHorario,
  sheetsClient,
  calendarClient,
  calendarioDaAba,
  somarMinutos
} = require('./_booking-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const {
      cidade, nome, email, whatsapp, data, horario,
      tatuagem, tamanho, duvidas, recomendacao, fotos
    } = req.body || {};
    const aba = abaDaCidade(cidade);
    const dataISO = parseData(data);
    const hora = parseHorario(horario);
    const tamanhoCodigo = normalizarTamanho(tamanho);

    if (!aba) return res.status(400).json({ error: 'Cidade inválida' });
    if (!nome || !email || !whatsapp || !tatuagem || !dataISO || !hora) {
      return res.status(400).json({ error: 'Preencha os campos obrigatórios' });
    }
    if (!tamanhoCodigo) return res.status(400).json({ error: 'Selecione um tamanho válido' });

    const sheets = sheetsClient();
    const leitura = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!A:T`
    });
    const linhas = leitura.data.values || [];
    const conflitoPlanilha = linhas.some(linha => {
      const status = String(linha[4] || '').toLowerCase();
      return parseData(linha[9]) === dataISO &&
        parseHorario(linha[10]) === hora &&
        !['cancelado', 'expirado'].includes(status);
    });
    if (conflitoPlanilha) return res.status(409).json({ error: 'Este horário já está reservado' });

    const indisponiveis = await disponibilidade({ aba, minISO: dataISO, maxISO: dataISO });
    if (indisponiveis.has(dataISO)) {
      return res.status(409).json({ error: 'Este dia já está reservado ou bloqueado' });
    }

    const calendarId = calendarioDaAba(aba);
    const calendar = calendarClient();
    const fim = somarMinutos(hora, DURACAO_MINUTOS);
    const busy = await calendar.freebusy.query({
      requestBody: {
        timeMin: `${dataISO}T${hora}:00-03:00`,
        timeMax: `${dataISO}T${fim}:00-03:00`,
        timeZone: FUSO,
        items: [{ id: calendarId }]
      }
    });
    if ((busy.data.calendars?.[calendarId]?.busy || []).length > 0) {
      return res.status(409).json({ error: 'Este horário já está ocupado' });
    }

    const driveAuth = require('googleapis').google.auth.OAuth2;
    const driveOAuth = new driveAuth(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    driveOAuth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = require('googleapis').google.drive({ version: 'v3', auth: driveOAuth });

    const idAgendamento = `AG-${aba.substring(0, 3).toUpperCase()}-${Date.now()}`;
    const agora = new Date().toISOString();
    const linksFotos = [];
    for (const [i, foto] of (Array.isArray(fotos) ? fotos : []).entries()) {
      const buffer = Buffer.from(foto.base64, 'base64');
      const arquivo = await drive.files.create({
        requestBody: { name: `${idAgendamento}_${i + 1}_${foto.name}`, parents: [process.env.DRIVE_FOLDER_ID] },
        media: { mimeType: foto.mimeType, body: Readable.from(buffer) },
        fields: 'id, webViewLink'
      });
      linksFotos.push(arquivo.data.webViewLink || arquivo.data.id);
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!A:T`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          linhas.length,
          idAgendamento,
          idAgendamento,
          '',
          'aguardando_pagamento',
          nome,
          whatsapp,
          email,
          tatuagem,
          dataISO,
          hora,
          tamanhoCodigo,
          duvidas || '',
          recomendacao || '',
          linksFotos.join('\n'),
          50,
          agora,
          '',
          '',
          ''
        ]]
      }
    });

    return res.status(200).json({ ok: true, id: idAgendamento, tamanho: tamanhoCodigo });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao salvar: ' + erro.message });
  }
};
