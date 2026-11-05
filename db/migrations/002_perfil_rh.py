"""Perfil RH: lança ocorrencias, sem alterar cadastro nem administração de usuários."""
def aplicar(cur):
    for sql in [
        "ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_papel_check",
        "ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check CHECK (papel IN ('admin', 'gestor', 'colaborador', 'rh'))",
    ]:
        cur.execute(sql)