const { google } = require('googleapis');
const { Readable } = require('stream');

// Chaves sem acento e em minúsculas.
// Aceita o nome da cidade e também o nome da aba, para não depender de como o site envia.
const ABAS = {
  'cascavel': 'Cascavel',
  'gravatai': 'Gravatai',
  'balneario camboriu': 'Camboriu',
  'camboriu': 'Camboriu'
};

function normalizarCidade(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const {
      cidade, nome, email, whatsapp, data, horario,
      tatuagem, tamanho, duvidas, recomendacao, fotos
    } = req.body;

    console.log('Cidade recebida:', JSON.stringify(cidade));

    const aba = ABAS[normalizarCidade(cidade)];
    if (!aba) {
      return res.status(400).json({ error: 'Cidade inválida: ' + cidade });
    }

    // Planilha: conta de serviço
    const credenciais = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const authSheets = new google.auth.GoogleAuth({
      credentials: credenciais,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth: authSheets });

    // Drive: sua conta, pelo refresh token
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: oauth2 });

    const leitura = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!A:A`
    });
    const idContagem = (leitura.data.values || []).length;
    const idAgendamento = `AG-${aba.substring(0, 3).toUpperCase()}-${Date.now()}`;
    const agora = new Date().toISOString();

    // Upload das fotos para a pasta do Drive
    const linksFotos = [];
    for (const [i, foto] of (fotos || []).entries()) {
      const buffer = Buffer.from(foto.base64, 'base64');
      const arquivo = await drive.files.create({
        requestBody: {
          name: `${idAgendamento}_${i + 1}_${foto.name}`,
          parents: [process.env.DRIVE_FOLDER_ID]
        },
        media: {
          mimeType: foto.mimeType,
          body: Readable.from(buffer)
        },
        fields: 'id, webViewLink'
      });
      linksFotos.push(arquivo.data.webViewLink);
    }

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
          linksFotos.join('\n'),
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
    return res.status(500).json({ error: 'Falha ao salvar: ' + erro.message });
  }
};
