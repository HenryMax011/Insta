-- Schema idempotente: pode ser executado várias vezes com `npm run db:init`.
-- Requer PostgreSQL 13+ (gen_random_uuid nativo).

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Catálogo: um produto (página de venda) tem várias variações (quantidades ou pacotes)
-- description: parágrafos separados por linha em branco; trechos entre [[ ]] são destacados no front.
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id               SERIAL PRIMARY KEY,
  slug             VARCHAR(60)  NOT NULL UNIQUE,
  network          VARCHAR(20)  NOT NULL CHECK (network IN ('instagram', 'tiktok')),
  category         VARCHAR(30)  NOT NULL CHECK (category IN (
                     'seguidores', 'curtidas', 'visualizacoes', 'stories', 'comentarios',
                     'compartilhamentos', 'reposts', 'pacote_mensal')),
  name             VARCHAR(80)  NOT NULL,
  title            VARCHAR(120) NOT NULL,
  description      TEXT         NOT NULL,
  examples         TEXT[]       NOT NULL DEFAULT '{}',
  features         TEXT[]       NOT NULL DEFAULT '{}',
  link_type        VARCHAR(20)  NOT NULL CHECK (link_type IN ('perfil', 'post', 'perfil_ou_post')),
  -- Usado só para exibir o preço "DE" riscado. Deixe 0 se não houver preço de referência real.
  discount_percent INTEGER      NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  sort_order       INTEGER      NOT NULL DEFAULT 0,
  active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Variações vendáveis (preço de venda x ID do serviço no fornecedor)
CREATE TABLE IF NOT EXISTS services (
  id                  SERIAL PRIMARY KEY,
  product_id          INTEGER      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label               VARCHAR(40),
  description         VARCHAR(200),
  quantity            INTEGER      NOT NULL CHECK (quantity > 0),
  price_cents         INTEGER      NOT NULL CHECK (price_cents > 0),
  provider_service_id VARCHAR(32)  NOT NULL,
  active              BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (product_id, quantity)
);

-- Selo "Mais vendido" no front
ALTER TABLE services ADD COLUMN IF NOT EXISTS highlight BOOLEAN NOT NULL DEFAULT FALSE;

-- Drip-feed: o fornecedor entrega quantity/drip_runs a cada drip_interval_minutes (ex.: pacotes mensais)
ALTER TABLE services ADD COLUMN IF NOT EXISTS drip_runs INTEGER CHECK (drip_runs > 1);
ALTER TABLE services ADD COLUMN IF NOT EXISTS drip_interval_minutes INTEGER CHECK (drip_interval_minutes > 0);

-- ============================================================
-- Clientes
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      VARCHAR(254) NOT NULL UNIQUE,
  whatsapp   VARCHAR(13)  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============================================================
-- Pedidos
-- Ciclo de vida:
--   aguardando_pagamento -> pago -> processando -> enviado -> concluido | parcial
--                                         \-> erro_automacao (reenvio manual pelo admin)
--   aguardando_pagamento -> cancelado (PIX expirado/recusado)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID         NOT NULL REFERENCES customers(id),
  service_id        INTEGER      NOT NULL REFERENCES services(id),
  network           VARCHAR(20)  NOT NULL,
  service_name      VARCHAR(120) NOT NULL,
  link              VARCHAR(300) NOT NULL,
  quantity          INTEGER      NOT NULL CHECK (quantity > 0),
  amount_cents      INTEGER      NOT NULL CHECK (amount_cents > 0),
  contact_email     VARCHAR(254) NOT NULL,
  contact_whatsapp  VARCHAR(13)  NOT NULL,
  status            VARCHAR(30)  NOT NULL DEFAULT 'aguardando_pagamento' CHECK (status IN (
                      'aguardando_pagamento', 'pago', 'processando', 'enviado',
                      'concluido', 'parcial', 'erro_automacao', 'cancelado')),
  provider_order_id VARCHAR(64),
  provider_status   VARCHAR(40),
  provider_remains  INTEGER,
  provider_error    TEXT,
  dispatch_attempts INTEGER      NOT NULL DEFAULT 0,
  dispatched_at     TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status_updated ON orders (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_provider_order ON orders (provider_order_id);

-- Código do erro do fornecedor (ex.: SMM_NO_BALANCE), usado para reenvio automático seguro
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_error_code VARCHAR(40);

-- ============================================================
-- Pagamentos (1 cobrança PIX por pedido)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               UUID        NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  gateway                VARCHAR(30) NOT NULL,
  gateway_transaction_id VARCHAR(64) NOT NULL UNIQUE,
  status                 VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN (
                           'pendente', 'aprovado', 'expirado', 'recusado', 'reembolsado')),
  amount_cents           INTEGER     NOT NULL CHECK (amount_cents > 0),
  paid_amount_cents      INTEGER,
  pix_copia_cola         TEXT        NOT NULL,
  pix_qr_base64          TEXT        NOT NULL,
  expires_at             TIMESTAMPTZ NOT NULL,
  paid_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_pending_expiry ON payments (expires_at) WHERE status = 'pendente';

-- ============================================================
-- Log imutável de notificações recebidas do gateway (auditoria)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_events (
  id                     BIGSERIAL PRIMARY KEY,
  payment_id             UUID        REFERENCES payments(id) ON DELETE SET NULL,
  gateway_transaction_id VARCHAR(64) NOT NULL,
  status                 VARCHAR(30),
  payload                JSONB,
  received_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_tx ON payment_events (gateway_transaction_id);

-- ============================================================
-- Triggers de updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_services_updated ON services;
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Seed do catálogo (ajuste provider_service_id para os IDs reais do seu fornecedor)
-- ============================================================
INSERT INTO products (slug, network, category, name, title, description, examples, features, link_type, discount_percent, sort_order) VALUES
  ('ig-seguidores', 'instagram', 'seguidores', 'Seguidores', 'Comprar Seguidores',
   'Seguidores [[Brasileiros e Reais]] para o seu perfil, Não precisamos da senha, [[Compra 100% Segura.]]',
   '{}', '{}', 'perfil', 38, 1),
  ('ig-curtidas', 'instagram', 'curtidas', 'Curtidas', 'Comprar Curtidas',
   'Curtidas Brasileiras para o seu [[Reels ou Postagem]], Não precisamos da senha, [[Compra 100% Segura.]]',
   '{}', '{}', 'post', 38, 2),
  ('ig-visualizacoes', 'instagram', 'visualizacoes', 'Visualizações Reels', 'Comprar Visualizações Reels',
   'Visualizações para o seu [[Reels ou Vídeo]], entrega rápida, Não precisamos da senha, [[Compra 100% Segura.]]',
   '{}', '{}', 'post', 38, 3),
  ('ig-stories', 'instagram', 'stories', 'Visualizações Stories', 'Comprar Visualizações Stories',
   'Perfis Brasileiros Reais, o Único com [[Alcance e Impressões]] nos Insights, Não precisamos da senha, [[Compra 100% Segura.]]',
   '{}', '{}', 'perfil', 38, 4),
  ('ig-comentarios', 'instagram', 'comentarios', 'Comentários', 'Comprar Comentários Prontos',
   'Comentários Brasileiros Prontos Aleatórios, para seu [[Reels ou Postagem]], Não precisamos da senha, [[Compra 100% Segura.]]',
   ARRAY['Amei 😍', '😁😁😁😁👏👏', 'Perfeição 😍', '❤️❤️❤️', '😱👏👏👏', 'Sensacional 🔝🔝🔝'], '{}', 'post', 38, 5),
  ('ig-compartilhamentos', 'instagram', 'compartilhamentos', 'Compartilhamentos', 'Comprar Compartilhamentos',
   'Compartilhamentos para o seu [[Reels ou Postagem]], aumentando o alcance, Não precisamos da senha, [[Compra 100% Segura.]]',
   '{}', '{}', 'post', 38, 6),
  ('ig-reposts', 'instagram', 'reposts', 'Reposts', 'Comprar Reposts',
   E'Reposts para o seu [[Reels ou Postagem]] alcançar novos públicos, Não precisamos da senha, [[Compra 100% Segura.]]\n\nCaso preencha o perfil, serão enviados os reposts na primeira publicação que o sistema identificar.',
   '{}', '{}', 'perfil_ou_post', 38, 7),
  ('ig-pacotes-mensais', 'instagram', 'pacote_mensal', 'Pacotes Mensais', 'Pacotes Mensais',
   'Views automáticas em [[todos os seus Stories]] durante o mês, Não precisamos da senha, [[Compra 100% Segura.]]',
   '{}', ARRAY['Entrega diária automática', '1 Mês de Duração'], 'perfil', 38, 8),
  ('tt-seguidores', 'tiktok', 'seguidores', 'Seguidores', 'Comprar Seguidores TikTok',
   'Seguidores para o seu perfil do [[TikTok]], Não precisamos da senha, [[Compra 100% Segura.]]',
   '{}', '{}', 'perfil', 38, 1),
  ('tt-curtidas', 'tiktok', 'curtidas', 'Curtidas', 'Comprar Curtidas TikTok',
   'Curtidas para o seu [[vídeo do TikTok]], Não precisamos da senha, [[Compra 100% Segura.]]',
   '{}', '{}', 'post', 38, 2),
  ('tt-visualizacoes', 'tiktok', 'visualizacoes', 'Visualizações', 'Comprar Visualizações TikTok',
   'Visualizações para o seu [[vídeo do TikTok]], Não precisamos da senha, [[Compra 100% Segura.]]',
   '{}', '{}', 'post', 38, 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (product_id, quantity, price_cents, label, description, provider_service_id)
SELECT p.id, v.quantity, v.price_cents, v.label, v.description, v.provider_service_id
FROM (VALUES
  ('ig-seguidores', 100, 690, NULL, NULL, '1067'),
  ('ig-seguidores', 250, 1690, NULL, NULL, '1067'),
  ('ig-seguidores', 500, 2790, NULL, NULL, '1067'),
  ('ig-seguidores', 1000, 4790, NULL, NULL, '1067'),
  ('ig-seguidores', 2500, 11290, NULL, NULL, '1067'),
  ('ig-seguidores', 5000, 20990, NULL, NULL, '1067'),

  ('ig-curtidas', 100, 690, NULL, NULL, '120'),
  ('ig-curtidas', 250, 1490, NULL, NULL, '120'),
  ('ig-curtidas', 500, 2490, NULL, NULL, '120'),
  ('ig-curtidas', 1000, 4090, NULL, NULL, '120'),
  ('ig-curtidas', 2500, 8790, NULL, NULL, '120'),

  ('ig-visualizacoes', 1000, 390, NULL, NULL, '800'),
  ('ig-visualizacoes', 2500, 990, NULL, NULL, '800'),
  ('ig-visualizacoes', 5000, 1790, NULL, NULL, '800'),
  ('ig-visualizacoes', 10000, 3190, NULL, NULL, '800'),

  ('ig-stories', 100, 390, NULL, NULL, '1006'),
  ('ig-stories', 250, 990, NULL, NULL, '1006'),
  ('ig-stories', 500, 1790, NULL, NULL, '1006'),
  ('ig-stories', 1000, 3190, NULL, NULL, '1006'),
  ('ig-stories', 2500, 7190, NULL, NULL, '1006'),
  ('ig-stories', 5000, 12790, NULL, NULL, '1006'),
  ('ig-stories', 7500, 18490, NULL, NULL, '1006'),
  ('ig-stories', 10000, 23290, NULL, NULL, '1006'),

  ('ig-comentarios', 5, 790, NULL, NULL, '992'),
  ('ig-comentarios', 10, 1490, NULL, NULL, '992'),
  ('ig-comentarios', 20, 2690, NULL, NULL, '992'),
  ('ig-comentarios', 35, 4590, NULL, NULL, '992'),
  ('ig-comentarios', 50, 6490, NULL, NULL, '992'),
  ('ig-comentarios', 75, 9590, NULL, NULL, '992'),
  ('ig-comentarios', 100, 12490, NULL, NULL, '992'),
  ('ig-comentarios', 150, 18490, NULL, NULL, '992'),
  ('ig-comentarios', 200, 24090, NULL, NULL, '992'),
  ('ig-comentarios', 300, 35490, NULL, NULL, '992'),
  ('ig-comentarios', 400, 46690, NULL, NULL, '992'),
  ('ig-comentarios', 500, 57190, NULL, NULL, '992'),

  ('ig-compartilhamentos', 100, 690, NULL, NULL, '140'),
  ('ig-compartilhamentos', 250, 1490, NULL, NULL, '140'),
  ('ig-compartilhamentos', 500, 2490, NULL, NULL, '140'),
  ('ig-compartilhamentos', 1000, 4090, NULL, NULL, '140'),

  ('ig-reposts', 50, 790, NULL, NULL, '943'),
  ('ig-reposts', 100, 1490, NULL, NULL, '943'),
  ('ig-reposts', 250, 3190, NULL, NULL, '943'),
  ('ig-reposts', 500, 5590, NULL, NULL, '943'),

  -- Pacotes mensais: quantity = total estimado no mês; use um serviço "drip-feed"/assinatura do fornecedor.
  ('ig-pacotes-mensais', 7500, 4790, 'Iniciante', '230 a 250 Views por Dia nos Stories', '123'),
  ('ig-pacotes-mensais', 15000, 7990, 'VIP', '480 a 500 Views por Dia nos Stories', '123'),
  ('ig-pacotes-mensais', 30000, 14490, 'Expert', '980 a 1.000 Views por Dia nos Stories', '123'),
  ('ig-pacotes-mensais', 60000, 24090, 'Influencer', '1.950 a 2.000 Views por Dia nos Stories', '123'),

  ('tt-seguidores', 100, 790, NULL, NULL, '940'),
  ('tt-seguidores', 500, 3190, NULL, NULL, '940'),
  ('tt-seguidores', 1000, 5590, NULL, NULL, '940'),

  ('tt-curtidas', 250, 690, NULL, NULL, '913'),
  ('tt-curtidas', 500, 1090, NULL, NULL, '913'),
  ('tt-curtidas', 1000, 1990, NULL, NULL, '913'),

  ('tt-visualizacoes', 1000, 290, NULL, NULL, '876'),
  ('tt-visualizacoes', 5000, 1590, NULL, NULL, '876'),
  ('tt-visualizacoes', 10000, 2590, NULL, NULL, '876')
) AS v(product_slug, quantity, price_cents, label, description, provider_service_id)
JOIN products p ON p.slug = v.product_slug
ON CONFLICT (product_id, quantity) DO NOTHING;

UPDATE services s SET highlight = TRUE
  FROM products p
 WHERE s.product_id = p.id
   AND (p.slug, s.quantity) IN (
     ('ig-seguidores', 1000), ('ig-curtidas', 500), ('ig-visualizacoes', 5000), ('ig-stories', 1000),
     ('ig-comentarios', 75), ('ig-compartilhamentos', 500), ('ig-reposts', 100), ('ig-pacotes-mensais', 15000),
     ('tt-seguidores', 500), ('tt-curtidas', 500), ('tt-visualizacoes', 5000))
   AND NOT s.highlight;

-- Pacotes mensais: 30 entregas diárias (quantity é o total do mês)
UPDATE services s SET drip_runs = 30, drip_interval_minutes = 1440
  FROM products p
 WHERE s.product_id = p.id AND p.slug = 'ig-pacotes-mensais' AND s.drip_runs IS NULL;

-- Último envio de cada alerta com cooldown; fica no banco para valer entre instâncias (Vercel) e restarts.
CREATE TABLE IF NOT EXISTS alert_cooldowns (
  key          VARCHAR(60) PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase expõe o schema public pela API REST (chave anon). Com RLS ligado e sem policies, essa API
-- não lê nem grava nada; o backend conecta como dono das tabelas e não é afetado.
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE services       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_cooldowns ENABLE ROW LEVEL SECURITY;
