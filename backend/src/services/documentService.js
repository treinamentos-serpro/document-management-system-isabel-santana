const documentRepository = require('../repositories/documentRepository');

function createDocument({ id, originalName, size, owner }) {
  return documentRepository.save({
    id,
    originalName,
    size,
    uploadedAt: new Date().toISOString(),
    owner: typeof owner === 'string' && owner ? owner : 'anonymous',
  });
}

function listDocuments() {
  return documentRepository.findAll();
}

function getDocumentDownload(id) {
  const document = documentRepository.findById(id);
  if (!document) {
    return null;
  }

  return { document, filePath: documentRepository.getFilePath(document.id) };
}

function getStorageDirectory() {
  return documentRepository.storageDirectory;
}

module.exports = { createDocument, listDocuments, getDocumentDownload, getStorageDirectory };