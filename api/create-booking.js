onst { google } = require('googleapis');

const ABAS = {
  'Cascavel': 'Cascavel',
  'Gravataí': 'Gravatai',
  'Balneário Camboriú': 'Camboriu'
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const credenciais = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

    const auth = new google.auth.GoogleAuth({
      credentials: credenciais,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const {
      cidade, nome, email, whatsapp, data, horario,
      tatuagem, tamanho, duvidas, recomendacao
    } = req.body;

    const aba = ABAS[cidade];
    if (!aba) {
      return res.status(400).json({ error: 'Cidade inválida: ' + cidade });
    }

    const leitura = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!A:A`
    });

    const linhas = leitura.data.values || [];
    const idContagem = linhas.length;

    const idAgendamento = `AG-${aba.substring(0, 3).toUpperCase()}-${Date.now()}`;
    const agora = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!A:T`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          idContagem,
          idAgendamento,
          idAgendamento,
          '',
          'aguardando_pagamento',
          nome,
          whatsapp,
          email,
          tatuagem,
          data,
          horario,
          tamanho,
          duvidas,
          recomendacao,
          '',
          50,
          agora,
          '',
          '',
          ''
        ]]
      }
    });

    return res.status(200).json({ ok: true, id: idAgendamento });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao salvar na planilha' });
  }
};
