# Impulso Social — Revenda automatizada de engajamento (SMM)

Cliente escolhe o pacote → paga via PIX → webhook do gateway confirma → pedido é despachado automaticamente para o painel SMM fornecedor (API v2).

## Arquitetura

```
public/                  SPA (HTML + Tailwind + JS puro)
db/schema.sql            Tabelas, índices, triggers e seed do catálogo
scripts/db-init.js       Aplica o schema (idempotente)
src/
  server.js              Bootstrap, jobs e graceful shutdown
  app.js                 Express, Helmet/CSP, CORS, rate limit, rotas
  config/env.js          Validação das variáveis de ambiente (zod) — app não sobe se faltar algo
  db/pool.js             Pool do PostgreSQL + helper de transação
  validators/schemas.js  Validação/sanitização de entrada (zod, modo strict)
  utils/target.js        Normaliza @/link para URL canônica e rejeita domínios estranhos
  services/
    paymentGateway.js    Mercado Pago PIX (+ modo mock) e validação de assinatura do webhook
    smmProvider.js       enviarOrdemSMM, consultarStatusSMM, consultarSaldoSMM
    fulfillment.js       Pagamento aprovado → despacho idempotente → "Erro na Automação"
  jobs/scheduler.js      Expira PIX, recupera pedidos órfãos, sincroniza status no fornecedor
  routes/                public (products, checkout, orders), webhooks, admin
```

### Catálogo

- `products`: uma página de venda (título, descrição, exemplos, características, tipo de link, % de desconto exibido). Na `description`, parágrafos são separados por linha em branco e trechos entre `[[ ]]` aparecem sublinhados em gradiente.
- `services`: as variações compráveis de cada produto (quantidade ou pacote nomeado como "Iniciante"/"VIP"), cada uma com preço e `provider_service_id` próprios.
- O front tem duas telas por hash: `#/` (catálogo) e `#/produto/<slug>` (página de compra).

### Ciclo de vida do pedido

```
aguardando_pagamento ──(webhook aprovado)──> pago ──> processando ──> enviado ──> concluido | parcial
        │                                                  │
        └──(PIX expirou/recusado)──> cancelado             └──(falha/sem saldo)──> erro_automacao ──(admin reenvia)──> processando
```

### Decisões de segurança

- **Valor nunca vem do front**: o preço é lido do catálogo (`services`/`products`) no servidor.
- **Webhook não é fonte de verdade**: o status é sempre reconsultado na API do gateway; além disso a assinatura `x-signature` (HMAC-SHA256) é validada. Valor pago e `external_reference` são conferidos.
- **Idempotência**: transições usam `UPDATE ... WHERE status = ... RETURNING`, então webhooks repetidos ou reenvios concorrentes não geram pedido duplicado no fornecedor.
- **SQL Injection**: 100% das queries são parametrizadas (`$1, $2...`).
- **XSS**: entrada validada por whitelist (zod `.strict()`, regex de link/handle, rejeição de `<>"'`), o front só usa `textContent` e a CSP bloqueia scripts inline.
- Helmet, CORS restrito, limite de 10 KB no body, rate limit (8 checkouts/min por IP), token de admin comparado em tempo constante, segredos só no `.env`.

## Rodando localmente

Pré-requisitos: **Node.js 20+** e **PostgreSQL 13+** (ou Docker).

```bash
# 1. Dependências
npm install
#    (instala: express, helmet, cors, express-rate-limit, pg, zod, dotenv, qrcode)

# 2. Banco de dados (via Docker; ou aponte DATABASE_URL para um Postgres existente)
docker compose up -d

# 3. Variáveis de ambiente
cp .env.example .env          # Windows: copy .env.example .env
#    Gere o ADMIN_TOKEN:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Criar tabelas e catálogo
npm run db:init

# 5. Subir o servidor
npm run dev                   # http://localhost:3000
```

Por padrão o `.env.example` vem com `PAYMENT_PROVIDER=mock` e `SMM_MOCK=true`, então dá para testar o fluxo inteiro sem nenhuma credencial.

### Indo para produção

1. Mercado Pago: crie uma aplicação em *Suas integrações*, copie o **Access Token** para `MP_ACCESS_TOKEN`, cadastre o webhook `https://SEU_DOMINIO/api/webhooks/payment` (evento *Pagamentos*) e copie a **assinatura secreta** para `MP_WEBHOOK_SECRET`. Defina `PAYMENT_PROVIDER=mercadopago`.
2. Fornecedor SMM (SMM Hub): veja a seção abaixo.
3. `NODE_ENV=production`, `PUBLIC_URL` com HTTPS, `TRUST_PROXY` conforme o proxy reverso.
4. Para receber webhooks em ambiente local, exponha a porta com `ngrok http 3000` e use a URL gerada em `PUBLIC_URL`.

### Conectando ao SMM Hub

O fornecedor é o [SMM Hub](https://smmhub.com.br/) (API padrão v2, documentação em [smmhub.com.br/api](https://smmhub.com.br/api)).

1. Pegue sua chave em *Conta* no SMM Hub e coloque no `.env`: `SMM_API_KEY=...`, `SMM_API_URL=https://smmhub.com.br/api/v2`, `SMM_MOCK=false`.
2. Descubra os IDs dos serviços que quer revender: `npm run smm:check -- instagram seguidores` (busca por nome/categoria e mostra id, preço por 1.000, mínimo e máximo).
3. Atualize o catálogo com os IDs reais, por exemplo:
   ```sql
   UPDATE services SET provider_service_id = '123'
    WHERE product_id = (SELECT id FROM products WHERE slug = 'ig-seguidores');
   ```
4. Rode `npm run smm:check` sem argumentos: o relatório mostra, para cada pacote, custo no fornecedor, margem e problemas (serviço inexistente, quantidade fora do mínimo/máximo, prejuízo ou margem abaixo de 30%). Se a conta no SMM Hub estiver em USD, ajuste `SMM_FX_TO_BRL`.
5. O mesmo relatório fica em `GET /api/admin/smm/catalog-check`, e a lista de serviços em `GET /api/admin/smm/services?q=termo`.

Use serviços do tipo **Default** (link + quantidade). Tipos *Subscriptions* (assinatura por `username`) e *Custom Comments* exigem outros parâmetros e não são suportados pelo despacho atual; o relatório aponta quando um ID mapeado for de outro tipo.

## Testando com Postman / Insomnia

Base URL: `http://localhost:3000`

| # | Método | Rota | Observação |
|---|--------|------|------------|
| 1a | GET | `/api/products` | Catálogo (home) com preço "a partir de" |
| 1b | GET | `/api/products/:slug` | Página do produto com as variações (`variants[].id` = `serviceId`) |
| 2 | POST | `/api/checkout` | Cria pedido + PIX |
| 3 | GET | `/api/orders/:orderId` | Status para o front (polling) |
| 4 | POST | `/api/webhooks/payment` | Simula notificação do gateway |
| 5 | GET | `/api/admin/orders?status=erro_automacao` | Header `Authorization: Bearer <ADMIN_TOKEN>` |
| 6 | POST | `/api/admin/orders/:orderId/resend` | Reenvia pedido com erro |
| 7 | GET | `/api/admin/smm/balance` | Saldo no fornecedor |

**2. Checkout** — `POST /api/checkout`, body JSON:

```json
{
  "serviceId": 1,
  "link": "@seuperfil",
  "email": "cliente@email.com",
  "whatsapp": "(11) 98888-7777"
}
```

Resposta `201`:

```json
{
  "orderId": "4d240bc9-...",
  "amountCents": 890,
  "transactionId": "mock_e6c3f63d-...",
  "pix": { "copiaECola": "...", "qrCodeBase64": "iVBORw0KGgo...", "expiresAt": "2026-10-01T14:27:44.596Z" }
}
```

O `serviceId` é o `id` de uma das `variants` retornadas em `/api/products/:slug`. O tipo de link aceito vem do produto (`linkType`): `post` exige link de postagem (ex.: `https://www.instagram.com/p/C8abc123/`), `perfil` aceita `@usuario` ou link do perfil, e `perfil_ou_post` (Reposts) aceita os dois.

**4. Webhook (modo mock)** — `POST /api/webhooks/payment` usando o `transactionId` do passo 2:

```json
{ "type": "payment", "data": { "id": "mock_e6c3f63d-..." } }
```

No modo mock qualquer notificação de transação existente é tratada como paga. Depois disso, `GET /api/orders/:orderId` retorna `"paymentStatus": "aprovado"` e `"status": "enviado"`, e em até `JOB_INTERVAL_SECONDS` o job sincroniza o status para `concluido`.

Com Mercado Pago real, o webhook só é aceito com cabeçalhos `x-signature`/`x-request-id` válidos — use o simulador de notificações do painel do Mercado Pago.

**Testando "Erro na Automação"**: suba com `SMM_MOCK_FAIL=true`, faça checkout + webhook, veja o pedido em `/api/admin/orders?status=erro_automacao`, reinicie com `SMM_MOCK_FAIL=false` e chame `/api/admin/orders/:orderId/resend`.

## Observação sobre reenvio

Se o servidor cair no meio de uma chamada ao fornecedor, o pedido vai para `erro_automacao` com a mensagem "estado incerto" em vez de ser reenviado automaticamente — o fornecedor pode ter aceitado o pedido. Confira no painel dele antes de reenviar para não pagar duas vezes.
