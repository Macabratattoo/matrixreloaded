const { Readable } = require('stream');
const { google } = require('googleapis');
const { abaDaCidade, sheetsClient } = require('./_booking-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const { idAgendamento, cidade, fotos } = req.body || {};
    const aba = abaDaCidade(cidade);
    if (!idAgendamento || !aba || !Array.isArray(fotos)) return res.status(400).json({ error: 'Dados das fotos incompletos' });
    if (!fotos.length) return res.status(200).json({ ok: true, links: [] });

    const sheets = sheetsClient();
    const leitura = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: `${aba}!A:T` });
    const linhas = leitura.data.values || [];
    const indice = linhas.findIndex(linha => linha[1] === idAgendamento);
    if (indice < 0) return res.status(404).json({ error: 'Agendamento não encontrado' });
    if (String(linhas[indice][4] || '').toLowerCase() !== 'confirmado') return res.status(409).json({ error: 'As fotos só podem ser enviadas após o pagamento aprovado' });
    if (linhas[indice][14]) return res.status(200).json({ ok: true, links: String(linhas[indice][14]).split('\n') });

    const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });
    const links = [];
    for (const [i, foto] of fotos.slice(0, 10).entries()) {
      if (!foto?.base64 || !foto?.name) continue;
      const arquivo = await drive.files.create({
        requestBody: { name: `${idAgendamento}_${i + 1}_${foto.name}`, parents: [process.env.DRIVE_FOLDER_ID] },
        media: { mimeType: foto.mimeType || 'image/jpeg', body: Readable.from(Buffer.from(foto.base64, 'base64')) },
        fields: 'id, webViewLink'
      });
      links.push(arquivo.data.webViewLink || arquivo.data.id);
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!O${indice + 1}:O${indice + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[links.join('\n')]] }
    });
    return res.status(200).json({ ok: true, links });
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ error: 'Falha ao enviar fotos: ' + erro.message });
  }
};
