const { mkdirSync, accessSync, constants } = require('node:fs');
const path = require('node:path');

const configuredDirectory = process.env.STORAGE_DIR;
if (configuredDirectory !== undefined && !configuredDirectory.trim()) {
  throw new Error('STORAGE_DIR deve indicar um diretório local.');
}

const storageDirectory = configuredDirectory
  ? path.resolve(configuredDirectory)
  : path.resolve(__dirname, '../../storage');

try {
  mkdirSync(storageDirectory, { recursive: true });
  accessSync(storageDirectory, constants.R_OK | constants.W_OK);
} catch {
  throw new Error('Não foi possível preparar o diretório de armazenamento.');
}

const documents = new Map();

function save(document) {
  documents.set(document.id, document);
  return document;
}

function findAll() {
  return [...documents.values()]
    .sort((first, second) => second.uploadedAt.localeCompare(first.uploadedAt));
}

function findById(id) {
  return documents.get(id);
}

function getFilePath(id) {
  return path.join(storageDirectory, id);
}

module.exports = { save, findAll, findById, getFilePath, storageDirectory };