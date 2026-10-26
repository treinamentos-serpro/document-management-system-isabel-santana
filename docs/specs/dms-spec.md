# Especificação - Document Management System

> Especificação funcional e técnica para orientar o desenvolvimento do DMS.
> Esta etapa entrega somente este documento; as fases de implementação abaixo
> são planejamento futuro e não foram executadas.

## 1. Objetivo

Entregar uma aplicação web simples para enviar, listar e baixar documentos, armazenando os arquivos no filesystem local e mantendo seus metadados em memória.

## 2. Escopo

### Dentro do escopo

- Enviar um documento por requisição, com limite de tamanho configurável.
- Listar os documentos recebidos durante a execução atual do backend.
- Baixar um documento pelo identificador.
- Associar metadados a um identificador de proprietário, sem autenticação nesta fase.
- Interface React para upload, listagem e download, com estados de carregamento e erro.
- Armazenamento de arquivos em `backend/storage`, usando Multer com `diskStorage`.

### Fora do escopo

- Armazenamento externo ou em nuvem.
- Persistência de metadados em banco de dados ou recuperação automática de metadados após reinicialização.
- Versionamento de documentos.
- Autenticação, autorização e isolamento de documentos por proprietário.
- Allowlist de extensões ou tipos MIME.
- Edição, exclusão, compartilhamento ou busca de documentos.

## 3. Requisitos funcionais

| ID | Requisito | Critério de aceite |
| --- | --- | --- |
| RF-01 | O usuário pode enviar um documento. | O backend recebe um arquivo multipart no campo `file`, grava-o no armazenamento local e responde com os metadados criados. |
| RF-02 | O sistema valida a presença e o tamanho do arquivo. | Requisição sem arquivo recebe `400`; arquivo acima do limite configurado recebe `413`; nenhuma dessas falhas cria metadados. |
| RF-03 | O sistema mantém metadados do documento. | Após o armazenamento bem-sucedido, registra `id`, `originalName`, `size`, `uploadedAt` e `owner` em memória. |
| RF-04 | O usuário pode listar documentos. | A resposta contém os metadados de todos os documentos registrados na execução atual; sem documentos, retorna lista vazia. |
| RF-05 | O usuário pode baixar um documento por identificador. | Um identificador existente retorna o arquivo como anexo; um identificador inexistente retorna `404`. |
| RF-06 | O documento pode receber um identificador de proprietário. | O cliente pode informar `owner`; quando ausente, o sistema usa `anonymous`. O valor é metadado e não comprova identidade nem restringe acesso. |
| RF-07 | A interface informa o resultado das operações. | A interface apresenta estados de carregamento, sucesso e erro para upload, listagem e download, sem exibir detalhes internos do servidor. |

## 4. Requisitos não funcionais

| ID | Requisito |
| --- | --- |
| RNF-01 | Os arquivos são gravados no filesystem local via Multer `diskStorage`, sob `backend/storage` por padrão. |
| RNF-02 | Os metadados são mantidos em memória nesta fase. Após reinicialização do backend, os arquivos permanecem no disco, mas os metadados não são recuperados; esses arquivos não aparecem na listagem nem podem ser baixados pelo identificador anterior. |
| RNF-03 | Porta, diretório de armazenamento e limite de upload são configuráveis por variáveis de ambiente. |
| RNF-04 | O nome original é preservado somente como metadado e não é usado como caminho físico. O backend gera um nome interno a partir do identificador do documento. |
| RNF-05 | Erros HTTP são retornados em formato JSON consistente e não expõem stack traces, caminhos locais ou detalhes internos. A resposta binária de download é uma exceção. |
| RNF-06 | O backend usa JavaScript CommonJS e Express; o frontend usa React e Vite. Não se introduz TypeScript nesta fase. |
| RNF-07 | A comunicação do frontend usa `fetch` com prefixo `/api`; o proxy do Vite encaminha as chamadas ao backend. |

### Configuração inicial

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP do backend. |
| `STORAGE_DIR` | `backend/storage` | Diretório local de armazenamento dos arquivos. |
| `UPLOAD_MAX_SIZE_BYTES` | `10485760` (10 MiB) | Tamanho máximo permitido por arquivo; deve ser configurável por ambiente. |

Valores de configuração inválidos devem ser detectados na inicialização, com mensagem clara no log, sem expor dados sensíveis.

## 5. Modelo de dados (metadados do documento)

Os metadados existem em memória, indexados pelo `id`. Não há persistência em banco nesta fase.

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | string | Identificador único, gerado pelo backend (UUID). Também identifica o nome interno do arquivo armazenado. |
| `originalName` | string | Nome original informado pelo cliente; usado para metadados e nome sugerido no download, nunca como caminho físico. |
| `size` | number | Tamanho do arquivo em bytes. |
| `uploadedAt` | string | Data e hora de recebimento em UTC, serializada em ISO 8601. |
| `owner` | string | Identificador opaco informado pelo cliente; padrão `anonymous`. Não representa uma identidade autenticada e não controla acesso. |

Exemplo de representação JSON:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "relatorio.pdf",
  "size": 24576,
  "uploadedAt": "2026-10-26T12:00:00.000Z",
  "owner": "anonymous"
}
```

## 6. Contratos de API

Os caminhos abaixo são as rotas do backend. No frontend, são acessados com o prefixo `/api` pelo proxy do Vite (por exemplo, `/api/documents`). O proxy deve encaminhar a rota correspondente ao backend.

Formato padrão de erro:

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Documento não encontrado."
  }
}
```

Mensagens são destinadas ao usuário e podem estar em português; `code` é estável para tratamento pela interface.

### `POST /upload`

- Entrada: `multipart/form-data` com campo obrigatório `file`; campo textual opcional `owner`.
- Validação: aceitar um único arquivo; aplicar `UPLOAD_MAX_SIZE_BYTES`; não restringir extensão ou MIME nesta fase.
- Sucesso: `201 Created`, `Content-Type: application/json`, corpo com os metadados do documento.
- Erros: `400 Bad Request` (`FILE_REQUIRED`); `413 Payload Too Large` (`FILE_TOO_LARGE`); `500 Internal Server Error` (`STORAGE_ERROR`).
- Consistência: metadados só são registrados após gravação do arquivo. Em falha de gravação, não deve haver registro visível na listagem.
- Segurança do armazenamento: gerar nome/caminho interno no servidor a partir de `id`; nunca concatenar o nome original ao caminho físico.

### `GET /documents`

- Entrada: sem parâmetros obrigatórios.
- Sucesso: `200 OK`, `Content-Type: application/json`, corpo como array de metadados. Retorna `[]` quando não há documentos.
- Ordenação: mais recentes primeiro por `uploadedAt`; em empate, qualquer ordem é aceita nesta fase.
- Erros: `500 Internal Server Error` (`INTERNAL_ERROR`).
- A listagem inclui todos os documentos em memória e não filtra por `owner`.

### `GET /documents/:id/download`

- Entrada: `id` no caminho.
- Sucesso: `200 OK`, conteúdo binário com `Content-Type: application/octet-stream` e `Content-Disposition: attachment`, usando o nome original de forma segura como nome sugerido.
- Erros: `404 Not Found` (`DOCUMENT_NOT_FOUND`) quando não há metadado para o identificador; `500 Internal Server Error` (`STORAGE_ERROR`) quando o arquivo registrado não pode ser lido.
- A rota não aplica autorização por proprietário nesta fase.

### Códigos de erro

| HTTP | Código | Situação |
| --- | --- | --- |
| `400` | `FILE_REQUIRED` | Arquivo ausente ou requisição multipart inválida. |
| `413` | `FILE_TOO_LARGE` | Arquivo excede `UPLOAD_MAX_SIZE_BYTES`. |
| `404` | `DOCUMENT_NOT_FOUND` | Identificador não registrado em memória. |
| `500` | `STORAGE_ERROR` | Falha ao gravar ou ler arquivo no armazenamento local. |
| `500` | `INTERNAL_ERROR` | Erro inesperado não classificado. |

## 7. Decisões arquiteturais

### Backend

Manter Clean Architecture simples, com fluxo de dependência `routes → controllers → services → repositories`:

- `routes/`: associam métodos e caminhos HTTP aos controllers.
- `controllers/`: extraem dados HTTP, validam o formato básico da requisição e traduzem resultados/erros para status e respostas.
- `services/`: aplicam as regras de upload, listagem e download sem depender de Express.
- `repositories/`: encapsulam o índice de metadados em memória e o acesso ao arquivo local.
- Multer com `diskStorage` recebe o arquivo e grava em diretório local configurável; os nomes físicos são gerados pelo backend.

Camadas internas não conhecem Express nem detalhes de transporte HTTP. Metadados e arquivo são tratados como recursos locais; não adicionar banco de dados nem provedor externo.

### Frontend

Usar componentes funcionais React organizados conforme a estrutura existente (`components/`, `pages/`, `services/`). Centralizar chamadas `fetch` no serviço de documentos, usar o prefixo `/api` e apresentar upload, lista e ação de download. Tratar respostas de erro sem duplicar lógica de transporte nos componentes.

### Limitações assumidas

- Como não há autenticação, `owner` é apenas informativo e pode ser fornecido pelo cliente. Não usar esse campo como controle de acesso.
- A perda dos metadados após reinicialização e a ausência de recuperação de arquivos órfãos são limitações aceitas nesta fase.
- Uploads não têm allowlist de tipo; a interface e a API não devem apresentar isso como verificação de segurança.

## 8. Plano de execução

As etapas a seguir descrevem implementação futura. Nesta etapa, somente este documento é produzido.

1. Preparar configuração e inicialização do backend, incluindo validação das variáveis de ambiente, diretório local e limite de upload via Multer `diskStorage`.
2. Implementar repositórios de metadados em memória e acesso a arquivos locais, com nome interno gerado pelo servidor.
3. Implementar serviços de upload, listagem e download, incluindo os comportamentos de falha e consistência definidos nesta especificação.
4. Implementar controllers e routes dos três contratos HTTP, com formato uniforme de erros e integração do middleware de upload.
5. Criar ou atualizar testes backend para sucesso, validações, limite de tamanho, documento inexistente e falhas de armazenamento.
6. Implementar o serviço `fetch` e a interface React para upload, listagem, download e estados de erro/carregamento.
7. Executar testes e validação integrada do fluxo frontend/backend, confirmando armazenamento local e comportamento após reinicialização.