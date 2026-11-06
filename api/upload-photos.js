'use strict';

const { Readable } = require('stream');
const { google } = require('googleapis');
const { abaDaCidade, sheetsClient } = require('./_booking-utils');
const {
  MAX_PHOTOS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_REQUEST_BYTES,
  tokenValido,
  decodificarBase64,
  assinaturaDaImagem
} = require('./_upload-utils');

const ERRO_UPLOAD = 'Não foi possível processar as fotos.';

function respostaErro(res, status, error = ERRO_UPLOAD) {
  return res.status(status).json({ error });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return respostaErro(res, 405, 'Método não permitido');

  try {
    const tamanhoRequisicao = Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8');
    if (tamanhoRequisicao > MAX_REQUEST_BYTES) return respostaErro(res, 413, 'As fotos excedem o limite permitido');

    const { idAgendamento, cidade, token, fotos } = req.body || {};
    const aba = abaDaCidade(cidade);
    if (!idAgendamento || !aba || !Array.isArray(fotos) || !token) return respostaErro(res, 400, 'Dados das fotos incompletos');
    if (fotos.length > MAX_PHOTOS) return respostaErro(res, 413, `Envie no máximo ${MAX_PHOTOS} fotos`);
    if (!fotos.length) return res.status(200).json({ ok: true, count: 0 });

    const sheets = sheetsClient();
    const leitura = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: `${aba}!A:T` });
    const linhas = leitura.data.values || [];
    const indice = linhas.findIndex(linha => linha[1] === idAgendamento);
    if (indice < 0) return respostaErro(res, 404, 'Agendamento não encontrado');

    const linha = linhas[indice];
    if (!tokenValido(String(linha[19] || ''), String(token))) return respostaErro(res, 403, 'Token de upload inválido');
    if (String(linha[4] || '').toLowerCase() !== 'confirmado') {
      return respostaErro(res, 409, 'As fotos só podem ser enviadas após o pagamento aprovado');
    }
    if (linha[14]) return res.status(200).json({ ok: true, count: String(linha[14]).split('\n').filter(Boolean).length });

    const arquivos = [];
    let totalBytes = 0;
    for (const foto of fotos) {
      const dados = decodificarBase64(foto?.base64);
      if (!dados || dados.length > MAX_FILE_BYTES) return respostaErro(res, 413, 'Uma das fotos excede o limite permitido');
      const assinatura = assinaturaDaImagem(dados);
      if (!assinatura) return respostaErro(res, 415, 'Formato de imagem não suportado');
      totalBytes += dados.length;
      if (totalBytes > MAX_TOTAL_BYTES) return respostaErro(res, 413, 'As fotos excedem o limite total permitido');
      arquivos.push({ dados, assinatura });
    }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth });
    const links = [];
    for (const [i, arquivo] of arquivos.entries()) {
      const nomeSeguro = `${String(idAgendamento).replace(/[^A-Za-z0-9_-]/g, '_')}_${String(i + 1).padStart(2, '0')}.${arquivo.assinatura.extensao}`;
      const criado = await drive.files.create({
        requestBody: { name: nomeSeguro, parents: [process.env.DRIVE_FOLDER_ID] },
        media: { mimeType: arquivo.assinatura.mimeType, body: Readable.from(arquivo.dados) },
        fields: 'id, webViewLink'
      });
      if (criado.data.webViewLink || criado.data.id) links.push(criado.data.webViewLink || criado.data.id);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${aba}!O${indice + 1}:O${indice + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[links.join('\n')]] }
    });
    return res.status(200).json({ ok: true, count: links.length });
  } catch (erro) {
    console.error('Falha interna no upload de fotos:', erro);
    return respostaErro(res, 500);
  }
};

module.exports.config = {
  api: {
    bodyParser: { sizeLimit: '16mb' }
  }
};
