-- =====================================================================
-- Quadro de Pessoal COFFITO — schema PostgreSQL 16
-- Idempotente: a aplicação roda este arquivo na subida (CREATE IF NOT EXISTS).
-- Datas sem hora em DATE; horários em TIME; valores em NUMERIC(12,2).
-- Dados de saúde: NÃO há coluna para CID/diagnóstico (LGPD, art. 11).
-- =====================================================================

CREATE TABLE IF NOT EXISTS schema_versao (
  versao      integer PRIMARY KEY,
  aplicado_em timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Usuários do sistema (quem acessa o painel)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            bigserial PRIMARY KEY,
  email         text NOT NULL,
  nome          text NOT NULL,
  senha_hash    text NOT NULL,                       -- bcrypt
  papel         text NOT NULL DEFAULT 'leitor'
                CHECK (papel IN ('admin','editor','leitor')),
  ativo         boolean NOT NULL DEFAULT true,
  ultimo_acesso timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_uk ON usuarios (lower(email));

-- ---------------------------------------------------------------------
-- Funcionários (empregados efetivos, comissionados, cedidos, estagiários, aprendizes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funcionarios (
  id                 text PRIMARY KEY,               -- id estável usado pelo painel
  nome               text NOT NULL CHECK (length(trim(nome)) > 0),
  matricula          text,
  admissao           date,
  cargo              text,                           -- cargo base (concurso)
  setor              text,                           -- lotação
  vinculo            text NOT NULL DEFAULT 'efetivo'
                     CHECK (vinculo IN ('efetivo','comissionado','cedido','estagiario','aprendiz')),
  situacao           text NOT NULL DEFAULT 'ativo'
                     CHECK (situacao IN ('ativo','cedido','inativo')),
  -- jornada
  regime             text NOT NULL DEFAULT 'Presencial'
                     CHECK (regime IN ('Presencial','Híbrido','Teletrabalho')),
  carga              smallint CHECK (carga BETWEEN 1 AND 60),         -- h/semana
  intervalo          smallint NOT NULL DEFAULT 60 CHECK (intervalo BETWEEN 0 AND 180), -- min
  entrada            time,
  saida              time,
  entrada_ho         time,
  saida_ho           time,
  semana             jsonb,                          -- grade híbrida: {"1":{"tipo":"P|H|M",...},...}
  -- nomeação / cessão
  funcao             text,
  funcao_tipo        text CHECK (funcao_tipo IN ('comissao','fg')),
  nivel              text CHECK (nivel IN ('I','II','III','IV','V','VI')),
  portaria_funcao    text,
  ingresso           text,
  orgao_origem       text,
  cedido_para        text,
  -- estágio / aprendizagem
  jornada_diaria     smallint CHECK (jornada_diaria IN (4,6)),
  instituicao        text,
  contrato_inicio    date,
  contrato_fim       date,
  providencia        text,
  -- benefícios
  usa_transporte     boolean NOT NULL DEFAULT false,
  valor_transporte   numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_transporte >= 0),
  beneficios_extras  jsonb NOT NULL DEFAULT '[]',    -- [{tipo,descricao,valor,recorrencia,meses[],inicio,fim}]
  abonos             jsonb,                          -- saldos de abono: {ref2024:{...},ref2025:{...},folgas2026:{...}}
  periodos_aquisitivos jsonb,                        -- controle de férias por período aquisitivo
  -- remuneração
  carreira           text CHECK (carreira IN ('analista','tecnico','apoio')),
  nivel_salarial     smallint CHECK (nivel_salarial BETWEEN 1 AND 30),
  fg_tipo            text CHECK (fg_tipo IN ('chefia','assessor2','assessor1')),
  bolsa_tipo         text CHECK (bolsa_tipo IN ('medio4','tecnico6','advocacia6','superior6','pos6')),
  -- controle
  extra              jsonb NOT NULL DEFAULT '{}',    -- campos auxiliares (origem de importação etc.)
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contrato_ordem CHECK (contrato_fim IS NULL OR contrato_inicio IS NULL OR contrato_fim >= contrato_inicio)
);
CREATE UNIQUE INDEX IF NOT EXISTS funcionarios_matricula_uk ON funcionarios (matricula) WHERE matricula IS NOT NULL AND matricula <> '';
CREATE INDEX IF NOT EXISTS funcionarios_nome_idx ON funcionarios (lower(nome));
CREATE INDEX IF NOT EXISTS funcionarios_vinculo_idx ON funcionarios (vinculo, situacao);

-- ---------------------------------------------------------------------
-- Ocorrências / lançamentos (férias, atestados, abonos, viagens, capacitações, banco de horas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ocorrencias (
  id               text PRIMARY KEY,
  funcionario_id   text NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  tipo             text NOT NULL
                   CHECK (tipo IN ('ferias','atestado','abono','viagem','capacitacao','banco')),
  inicio           date NOT NULL,
  fim              date NOT NULL,
  horas            numeric(6,2),                     -- banco de horas (+crédito/−débito), abono/capacitação parcial
  parcial          boolean NOT NULL DEFAULT false,   -- atestado: comparecimento / meio período (não conta dia)
  destino          text,                             -- viagem / capacitação
  obs              text,
  -- viagem
  diarias          numeric(6,2),
  -- férias
  parcela          text,
  aquisitivo       date,
  aquisitivo_fim   date,
  limite           date,                             -- data-limite de gozo do período aquisitivo
  abono_pecuniario smallint NOT NULL DEFAULT 0 CHECK (abono_pecuniario BETWEEN 0 AND 10),
  aviso_ferias     text,
  status_planilha  text,
  -- abono
  referencia_abono text,                             -- ref2024 | ref2025 | folgas2026 ...
  status_abono     text CHECK (status_abono IN ('agendado','gozado')),
  -- controle
  origem           text,                             -- de onde veio (tela, importação X)
  importacao_id    bigint,
  extra            jsonb NOT NULL DEFAULT '{}',
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT periodo_ordem CHECK (fim >= inicio)
);
CREATE INDEX IF NOT EXISTS ocorrencias_func_idx ON ocorrencias (funcionario_id, tipo, inicio);
CREATE INDEX IF NOT EXISTS ocorrencias_periodo_idx ON ocorrencias (inicio, fim);

-- ---------------------------------------------------------------------
-- Configurações (regras de benefícios, tabela salarial)
--   chave 'beneficios'  -> {aa, pctTemp, limite, modo, atModo, atFerias, feriados[]}
--   chave 'remuneracao' -> tabela da Estrutura Remuneratória (carreiras, comissão, FG, bolsas, benefícios)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config (
  chave         text PRIMARY KEY,
  valor         jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Tabela Auxiliar de Cargos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cargos_aux (
  id            bigserial PRIMARY KEY,
  cargo         text NOT NULL,
  descricao     text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Tabela Auxiliar Setorial 
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS setores_aux (
  id            bigserial PRIMARY KEY,
  setor         text NOT NULL,
  descricao     text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- Importações de planilhas (CSV/XLSX): pré-visualização e histórico
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS importacoes (
  id            bigserial PRIMARY KEY,
  tipo          text NOT NULL CHECK (tipo IN ('funcionarios','lancamentos')),
  arquivo       text NOT NULL,
  status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluida','descartada')),
  usuario_id    bigint REFERENCES usuarios(id) ON DELETE SET NULL,
  total_linhas  integer NOT NULL DEFAULT 0,
  inseridos     integer NOT NULL DEFAULT 0,
  atualizados   integer NOT NULL DEFAULT 0,
  ignorados     integer NOT NULL DEFAULT 0,
  com_erro      integer NOT NULL DEFAULT 0,
  plano         jsonb,                               -- operações validadas, aplicadas na confirmação
  mensagens     jsonb NOT NULL DEFAULT '[]',         -- [{linha, nivel: erro|aviso, texto}]
  criado_em     timestamptz NOT NULL DEFAULT now(),
  concluido_em  timestamptz
);
CREATE INDEX IF NOT EXISTS importacoes_criado_idx ON importacoes (criado_em DESC);

-- ---------------------------------------------------------------------
-- Auditoria: quem alterou o quê (LGPD — rastreabilidade)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id          bigserial PRIMARY KEY,
  usuario_id  bigint REFERENCES usuarios(id) ON DELETE SET NULL,
  acao        text NOT NULL CHECK (acao IN ('criar','alterar','excluir','importar','login')),
  tabela      text NOT NULL,
  registro_id text,
  antes       jsonb,
  depois      jsonb,
  em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auditoria_em_idx ON auditoria (em DESC);
CREATE INDEX IF NOT EXISTS auditoria_registro_idx ON auditoria (tabela, registro_id);

INSERT INTO schema_versao (versao) VALUES (1) ON CONFLICT DO NOTHING;

-- =====================================================================
-- v2 — Integração com o sistema de ponto
-- =====================================================================

-- Chaves de API dos sistemas integrados (guarda só o SHA-256 da chave)
CREATE TABLE IF NOT EXISTS integracao_chaves (
  id          bigserial PRIMARY KEY,
  nome        text NOT NULL,                         -- ex.: "Sistema de ponto - produção"
  prefixo     text NOT NULL,                         -- primeiros caracteres, para identificar na tela
  hash        text NOT NULL UNIQUE,                  -- sha256 hex da chave completa
  escopo      text NOT NULL DEFAULT 'ponto' CHECK (escopo IN ('ponto')),
  ativo       boolean NOT NULL DEFAULT true,
  criado_por  bigint REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz
);

-- Batidas recebidas do ponto (uma linha por marcação; idempotente por id_externo)
CREATE TABLE IF NOT EXISTS ponto_marcacoes (
  id             bigserial PRIMARY KEY,
  id_externo     text NOT NULL UNIQUE,               -- id da marcação no sistema de ponto
  matricula      text NOT NULL,
  funcionario_id text REFERENCES funcionarios(id) ON DELETE SET NULL,  -- NULL = matrícula não cadastrada no RH
  momento        timestamptz NOT NULL,
  tipo           text NOT NULL DEFAULT 'auto'
                 CHECK (tipo IN ('entrada','saida','saida_intervalo','retorno_intervalo','auto')),
  local          text NOT NULL DEFAULT 'presencial' CHECK (local IN ('presencial','remoto')),
  cancelada      boolean NOT NULL DEFAULT false,     -- marcação desconsiderada/ajustada no ponto
  origem         text,                               -- relógio, app, web, ajuste...
  recebido_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ponto_marcacoes_func_idx ON ponto_marcacoes (funcionario_id, momento);
CREATE INDEX IF NOT EXISTS ponto_marcacoes_momento_idx ON ponto_marcacoes (momento);
CREATE INDEX IF NOT EXISTS ponto_marcacoes_matricula_idx ON ponto_marcacoes (matricula) WHERE funcionario_id IS NULL;

INSERT INTO schema_versao (versao) VALUES (2) ON CONFLICT DO NOTHING;

-- v3 — sessões, limite compartilhado e resumos oficiais do sistema de ponto
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sessao_versao integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS login_tentativas (
  id bigserial PRIMARY KEY,
  ip text NOT NULL,
  momento timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_tentativas_ip_idx ON login_tentativas (ip, momento);
CREATE INDEX IF NOT EXISTS login_tentativas_momento_idx ON login_tentativas (momento);

CREATE TABLE IF NOT EXISTS ponto_vinculos (
  sistema text NOT NULL,
  colaborador_id text NOT NULL,
  funcionario_id text NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  PRIMARY KEY (sistema, colaborador_id),
  UNIQUE (sistema, funcionario_id)
);
CREATE TABLE IF NOT EXISTS ponto_resumos (
  sistema text NOT NULL,
  colaborador_id text NOT NULL,
  data date NOT NULL,
  versao bigint NOT NULL CHECK (versao > 0),
  matricula text NOT NULL,
  funcionario_id text REFERENCES funcionarios(id) ON DELETE SET NULL,
  dados jsonb NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sistema, colaborador_id, data)
);
CREATE INDEX IF NOT EXISTS ponto_resumos_func_idx ON ponto_resumos (funcionario_id, data);
CREATE TABLE IF NOT EXISTS ponto_sincronizacao (
  sistema text PRIMARY KEY,
  sinal_em timestamptz NOT NULL DEFAULT now(),
  pendentes integer NOT NULL DEFAULT 0 CHECK (pendentes >= 0),
  ultima_entrega timestamptz
);
INSERT INTO schema_versao (versao) VALUES (3) ON CONFLICT DO NOTHING;

-- Sessões individuais revogáveis. Armazenar apenas o hash do identificador aleatório.
CREATE TABLE IF NOT EXISTS auth_sessoes (
  token_hash char(64) PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessoes_usuario_idx ON auth_sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS auth_sessoes_expira_idx ON auth_sessoes (expira_em);
ALTER TABLE auditoria DROP CONSTRAINT IF EXISTS auditoria_acao_check;
ALTER TABLE auditoria ADD CONSTRAINT auditoria_acao_check
  CHECK (acao IN ('criar','alterar','excluir','importar','login','logout'));
INSERT INTO schema_versao (versao) VALUES (4) ON CONFLICT DO NOTHING;
