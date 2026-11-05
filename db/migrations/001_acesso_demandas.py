"""Identidade, organização e módulo de demandas; somente alterações aditivas."""
def aplicar(cur):
    comandos = [
        "ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_papel_check",
        "UPDATE usuarios SET papel='colaborador', sessao_versao=sessao_versao+1 WHERE papel IN ('leitor','editor')",
        "ALTER TABLE usuarios ALTER COLUMN papel SET DEFAULT 'colaborador'",
        "ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check CHECK (papel IN ('admin','gestor','colaborador'))",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS trocar_senha boolean NOT NULL DEFAULT false",
        "ALTER TABLE setores_aux ADD COLUMN IF NOT EXISTS codigo text",
        "ALTER TABLE setores_aux ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true",
        "ALTER TABLE cargos_aux ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true",
        "ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS setor_id bigint REFERENCES setores_aux(id) ON DELETE RESTRICT",
        "ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS cargo_id bigint REFERENCES cargos_aux(id) ON DELETE RESTRICT",
        """CREATE TABLE usuario_funcionario (
            usuario_id bigint PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
            funcionario_id text NOT NULL UNIQUE REFERENCES funcionarios(id) ON DELETE RESTRICT,
            concedido_por bigint REFERENCES usuarios(id), atualizado_em timestamptz NOT NULL DEFAULT now())""",
        """CREATE TABLE gestores_setores (
            usuario_id bigint REFERENCES usuarios(id) ON DELETE RESTRICT,
            setor_id bigint REFERENCES setores_aux(id) ON DELETE RESTRICT,
            ativo boolean NOT NULL DEFAULT true, concedido_por bigint REFERENCES usuarios(id),
            atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(usuario_id,setor_id))""",
        """CREATE TABLE funcionario_lotacoes (
            id bigserial PRIMARY KEY, funcionario_id text NOT NULL REFERENCES funcionarios(id) ON DELETE RESTRICT,
            setor_id bigint NOT NULL REFERENCES setores_aux(id) ON DELETE RESTRICT,
            inicio timestamptz NOT NULL DEFAULT now(), fim timestamptz, usuario_id bigint REFERENCES usuarios(id),
            CHECK (fim IS NULL OR fim>=inicio))""",
        "CREATE UNIQUE INDEX funcionario_lotacao_aberta ON funcionario_lotacoes(funcionario_id) WHERE fim IS NULL",
        """CREATE TABLE acesso_revisoes (
            usuario_id bigint PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
            revisao bigint NOT NULL DEFAULT 0, atualizado_em timestamptz NOT NULL DEFAULT now())""",
        "INSERT INTO acesso_revisoes(usuario_id) SELECT id FROM usuarios",
        """INSERT INTO setores_aux(setor)
            SELECT DISTINCT f.setor FROM funcionarios f WHERE nullif(trim(f.setor),'') IS NOT NULL
            AND NOT EXISTS(SELECT 1 FROM setores_aux s WHERE s.setor=f.setor)""",
        """INSERT INTO cargos_aux(cargo)
            SELECT DISTINCT f.cargo FROM funcionarios f WHERE nullif(trim(f.cargo),'') IS NOT NULL
            AND NOT EXISTS(SELECT 1 FROM cargos_aux s WHERE s.cargo=f.cargo)""",
        """UPDATE funcionarios f SET setor_id=s.id FROM
            (SELECT setor,min(id) id FROM setores_aux GROUP BY setor HAVING count(*)=1) s WHERE f.setor=s.setor""",
        """UPDATE funcionarios f SET cargo_id=s.id FROM
            (SELECT cargo,min(id) id FROM cargos_aux GROUP BY cargo HAVING count(*)=1) s WHERE f.cargo=s.cargo""",
        "INSERT INTO funcionario_lotacoes(funcionario_id,setor_id) SELECT id,setor_id FROM funcionarios WHERE setor_id IS NOT NULL",
        "CREATE INDEX funcionarios_setor_id ON funcionarios(setor_id)",
        "CREATE SCHEMA demandas",
        """CREATE TABLE demandas.demandas (
            id text PRIMARY KEY, funcionario_id text REFERENCES funcionarios(id) ON DELETE RESTRICT,
            setor_id bigint NOT NULL REFERENCES setores_aux(id) ON DELETE RESTRICT,
            titulo text NOT NULL, processo text NOT NULL DEFAULT '', link text NOT NULL DEFAULT '',
            prioridade text NOT NULL CHECK(prioridade IN ('alta','media','baixa')),
            prazo date, status text NOT NULL CHECK(status IN ('afazer','andamento','aguardando','concluida')),
            inicio date, concluido_em date, modelo_id text, dados jsonb NOT NULL DEFAULT '{}',
            versao integer NOT NULL DEFAULT 1, criado_por bigint REFERENCES usuarios(id),
            atualizado_por bigint REFERENCES usuarios(id), criado_em timestamptz NOT NULL DEFAULT now(),
            atualizado_em timestamptz NOT NULL DEFAULT now(), excluido_em timestamptz)""",
        "CREATE INDEX demandas_responsavel ON demandas.demandas(funcionario_id) WHERE excluido_em IS NULL",
        "CREATE INDEX demandas_setor ON demandas.demandas(setor_id) WHERE excluido_em IS NULL",
        """CREATE TABLE demandas.checklist_itens (
            demanda_id text REFERENCES demandas.demandas(id) ON DELETE RESTRICT, id text,
            ordem integer NOT NULL, texto text NOT NULL, prazo date, feito boolean NOT NULL DEFAULT false,
            feito_em date, atualizado_por bigint REFERENCES usuarios(id), PRIMARY KEY(demanda_id,id))""",
        """CREATE TABLE demandas.modelos (
            id text PRIMARY KEY, nome text NOT NULL, dados jsonb NOT NULL DEFAULT '{}',
            versao integer NOT NULL DEFAULT 1, criado_por bigint REFERENCES usuarios(id),
            atualizado_por bigint REFERENCES usuarios(id), atualizado_em timestamptz NOT NULL DEFAULT now(), excluido_em timestamptz)""",
        """CREATE TABLE demandas.modelo_etapas (
            modelo_id text REFERENCES demandas.modelos(id) ON DELETE RESTRICT,
            ordem integer NOT NULL, texto text NOT NULL, prazo_dias integer CHECK(prazo_dias>=0), PRIMARY KEY(modelo_id,ordem))""",
        "ALTER TABLE demandas.demandas ADD FOREIGN KEY(modelo_id) REFERENCES demandas.modelos(id) ON DELETE RESTRICT",
        """CREATE TABLE demandas.metas (
            id text PRIMARY KEY, setor_id bigint NOT NULL REFERENCES setores_aux(id) ON DELETE RESTRICT,
            titulo text NOT NULL, dados jsonb NOT NULL DEFAULT '{}', versao integer NOT NULL DEFAULT 1,
            criado_por bigint REFERENCES usuarios(id), atualizado_por bigint REFERENCES usuarios(id),
            atualizado_em timestamptz NOT NULL DEFAULT now(), excluido_em timestamptz)""",
        """CREATE TABLE demandas.meta_etapas (
            meta_id text REFERENCES demandas.metas(id) ON DELETE RESTRICT,
            ordem integer NOT NULL, dados jsonb NOT NULL, PRIMARY KEY(meta_id,ordem))""",
    ]
    for sql in comandos:
        cur.execute(sql)
