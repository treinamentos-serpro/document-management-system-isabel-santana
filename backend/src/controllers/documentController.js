const { randomUUID } = require('node:crypto');
const multer = require('multer');
const documentService = require('../services/documentService');

const maxFileSize = Number(process.env.UPLOAD_MAX_SIZE_BYTES ?? 10485760);
if (!Number.isSafeInteger(maxFileSize) || maxFileSize <= 0) {
  throw new Error('UPLOAD_MAX_SIZE_BYTES deve ser um inteiro positivo.');
}

const receiveFile = multer({
  storage: multer.diskStorage({
    destination: documentService.getStorageDirectory(),
    filename: (req, file, callback) => callback(null, randomUUID()),
  }),
  limits: { fileSize: maxFileSize },
}).single('file');

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function upload(req, res, next) {
  receiveFile(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 413, 'FILE_TOO_LARGE', 'O arquivo excede o tamanho permitido.');
      }
      if (error instanceof multer.MulterError || !error.code) {
        return sendError(res, 400, 'FILE_REQUIRED', 'Envie um único arquivo no campo file.');
      }
      return sendError(res, 500, 'STORAGE_ERROR', 'Não foi possível armazenar o arquivo.');
    }

    if (!req.file) {
      return sendError(res, 400, 'FILE_REQUIRED', 'Envie um arquivo no campo file.');
    }

    try {
      const document = documentService.createDocument({
        id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        owner: req.body?.owner,
      });
      return res.status(201).json(document);
    } catch (error) {
      return next(error);
    }
  });
}

function list(req, res) {
  res.json(documentService.listDocuments());
}

function download(req, res, next) {
  const result = documentService.getDocumentDownload(req.params.id);
  if (!result) {
    return sendError(res, 404, 'DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
  }

  res.download(result.filePath, result.document.originalName, {
    headers: { 'Content-Type': 'application/octet-stream' },
  }, (error) => {
    if (!error) return;
    if (res.headersSent) return next(error);
    res.removeHeader('Content-Disposition');
    sendError(res, 500, 'STORAGE_ERROR', 'Não foi possível ler o arquivo.');
  });
}

function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Não foi possível concluir a operação.');
}

module.exports = { upload, list, download, handleError };