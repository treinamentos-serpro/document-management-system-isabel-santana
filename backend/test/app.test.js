const { test } = require('node:test');
const assert = require('node:assert');
const { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const storageDirectory = mkdtempSync(path.join(tmpdir(), 'dms-test-'));
process.env.STORAGE_DIR = storageDirectory;
process.env.UPLOAD_MAX_SIZE_BYTES = '64';
const app = require('../src/app');

test('API de documentos com armazenamento local', async (context) => {
  assert.ok(app, 'o app deve estar definido');
  assert.strictEqual(typeof app, 'function', 'o app Express deve ser uma função');

  const server = app.listen(0, '127.0.0.1');
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(storageDirectory, { recursive: true, force: true });
  });
  await new Promise((resolve) => server.on('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let uploadedDocument;

  async function uploadFile(content, owner) {
    const form = new FormData();
    form.append('file', new Blob([content]), 'relatorio.txt');
    if (owner) form.append('owner', owner);
    return fetch(`${baseUrl}/upload`, { method: 'POST', body: form });
  }

  await context.test('preserva health e lista inicialmente vazia', async () => {
    assert.deepStrictEqual(await (await fetch(`${baseUrl}/health`)).json(), { status: 'ok' });
    assert.deepStrictEqual(await (await fetch(`${baseUrl}/documents`)).json(), []);
  });

  await context.test('grava arquivo com UUID e retorna somente metadados', async () => {
    const response = await uploadFile('conteudo do documento', 'isabel');
    assert.strictEqual(response.status, 201);
    uploadedDocument = await response.json();
    assert.deepStrictEqual(Object.keys(uploadedDocument).sort(), ['id', 'originalName', 'owner', 'size', 'uploadedAt']);
    assert.match(uploadedDocument.id, /^[0-9a-f-]{36}$/);
    assert.strictEqual(uploadedDocument.originalName, 'relatorio.txt');
    assert.strictEqual(uploadedDocument.owner, 'isabel');
    assert.strictEqual(uploadedDocument.size, Buffer.byteLength('conteudo do documento'));
    assert.strictEqual(new Date(uploadedDocument.uploadedAt).toISOString(), uploadedDocument.uploadedAt);
    assert.strictEqual(readFileSync(path.join(storageDirectory, uploadedDocument.id), 'utf8'), 'conteudo do documento');
    assert.deepStrictEqual(await (await fetch(`${baseUrl}/documents`)).json(), [uploadedDocument]);
  });

  await context.test('baixa conteúdo como anexo com nome original', async () => {
    const response = await fetch(`${baseUrl}/documents/${uploadedDocument.id}/download`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('content-type'), 'application/octet-stream');
    assert.match(response.headers.get('content-disposition'), /attachment; filename="relatorio.txt"/);
    assert.strictEqual(await response.text(), 'conteudo do documento');
  });

  await context.test('aplica proprietário padrão e ordenação por data decrescente', async () => {
    const response = await uploadFile('outro documento');
    assert.strictEqual(response.status, 201);
    assert.strictEqual((await response.json()).owner, 'anonymous');
    const documents = await (await fetch(`${baseUrl}/documents`)).json();
    assert.strictEqual(documents.length, 2);
    assert.ok(documents[0].uploadedAt >= documents[1].uploadedAt);
  });

  await context.test('rejeita arquivo ausente, multipart inválido e campos inesperados', async () => {
    const forms = [new FormData(), 'multipart inválido'];
    const wrongField = new FormData();
    wrongField.append('other', new Blob(['texto']), 'arquivo.txt');
    forms.push(wrongField);
    const multipleFiles = new FormData();
    multipleFiles.append('file', new Blob(['primeiro']), 'primeiro.txt');
    multipleFiles.append('file', new Blob(['segundo']), 'segundo.txt');
    forms.push(multipleFiles);
    for (const body of forms) {
      const response = await fetch(`${baseUrl}/upload`, {
        method: 'POST', body,
        ...(typeof body === 'string' ? { headers: { 'Content-Type': 'multipart/form-data; boundary=teste' } } : {}),
      });
      assert.strictEqual(response.status, 400);
      assert.strictEqual((await response.json()).error.code, 'FILE_REQUIRED');
    }
    assert.strictEqual(readdirSync(storageDirectory).length, 2);
    assert.strictEqual((await (await fetch(`${baseUrl}/documents`)).json()).length, 2);
  });

  await context.test('rejeita excesso de tamanho sem deixar arquivo ou metadado', async () => {
    const response = await uploadFile('a'.repeat(65));
    assert.strictEqual(response.status, 413);
    assert.strictEqual((await response.json()).error.code, 'FILE_TOO_LARGE');
    assert.strictEqual(readdirSync(storageDirectory).length, 2);
    assert.strictEqual((await (await fetch(`${baseUrl}/documents`)).json()).length, 2);
  });

  await context.test('retorna 404 para identificador desconhecido', async () => {
    const response = await fetch(`${baseUrl}/documents/inexistente/download`);
    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(await response.json(), {
      error: { code: 'DOCUMENT_NOT_FOUND', message: 'Documento não encontrado.' },
    });
  });

  await context.test('trata falhas de leitura e gravação sem expor caminhos', async () => {
    rmSync(storageDirectory, { recursive: true });
    const downloadResponse = await fetch(`${baseUrl}/documents/${uploadedDocument.id}/download`);
    assert.strictEqual(downloadResponse.status, 500);
    assert.strictEqual((await downloadResponse.json()).error.code, 'STORAGE_ERROR');

    writeFileSync(storageDirectory, 'não é diretório');
    try {
      const response = await uploadFile('documento');
      assert.strictEqual(response.status, 500);
      const body = await response.json();
      assert.strictEqual(body.error.code, 'STORAGE_ERROR');
      assert.ok(!JSON.stringify(body).includes(storageDirectory));
      assert.strictEqual((await (await fetch(`${baseUrl}/documents`)).json()).length, 2);
    } finally {
      rmSync(storageDirectory);
      mkdirSync(storageDirectory);
    }
  });
});
