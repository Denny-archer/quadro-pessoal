"""Contrato HTTP da integração: durações em segundos e instantes com fuso."""
import datetime as dt
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from ..services import presenca

MAX_LOTE = 1000

class Registro(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1, max_length=100)
    momento: dt.datetime
    acao: Literal['entrada', 'saida']
    local: Literal['presencial', 'remoto']
    origem: Literal['registro', 'justificativa'] = 'registro'

    @field_validator('momento')
    @classmethod
    def fuso(cls, valor):
        if valor.tzinfo is None:
            raise ValueError('Informe o fuso horário da marcação.')
        return valor


class Resumo(BaseModel):
    model_config = ConfigDict(extra='forbid')
    sistema: Literal['sistema-ponto'] = 'sistema-ponto'
    colaborador_id: str = Field(min_length=1, max_length=100)
    matricula: str = Field(max_length=30)
    data: dt.date
    versao: int = Field(gt=0)
    gerado_em: dt.datetime
    marcacoes: list[Registro] = Field(max_length=1000)
    segundos_registrados: int = Field(ge=0, le=86400)
    segundos_presenciais: int = Field(ge=0, le=86400)
    segundos_remotos: int = Field(ge=0, le=86400)
    segundos_nao_classificados: int = Field(ge=0, le=86400)
    segundos_oficiais: int = Field(ge=-315360000, le=315360000)
    carga_esperada_segundos: int = Field(ge=0, le=86400)
    saldo_segundos: int = Field(ge=-315360000, le=315360000)
    situacao_ponto: str = Field(min_length=1, max_length=100)
    pendencias: list[Literal['INTERVALO_ABERTO', 'MODALIDADES_DIVERGENTES', 'JORNADA_INDEFINIDA']] = Field(default_factory=list, max_length=10)

    @field_validator('matricula', 'colaborador_id')
    @classmethod
    def limpar(cls, valor):
        return valor.strip()

    @model_validator(mode='after')
    def consistente(self):
        agora = dt.datetime.now(dt.timezone.utc)
        if not self.colaborador_id or self.gerado_em.tzinfo is None:
            raise ValueError('Identificador e fuso de gerado_em são obrigatórios.')
        if self.data > agora.astimezone(presenca.FUSO).date() or self.gerado_em > agora + dt.timedelta(minutes=10):
            raise ValueError('Resumo no futuro.')
        if len({m.id for m in self.marcacoes}) != len(self.marcacoes):
            raise ValueError('Identificadores de marcação repetidos.')
        if any(m.momento.astimezone(presenca.FUSO).date() != self.data or m.momento > agora + dt.timedelta(minutes=10)
               for m in self.marcacoes):
            raise ValueError('Marcação fora do dia de referência ou no futuro.')
        ordenadas = sorted(self.marcacoes, key=lambda m: (m.momento, (0, int(m.id)) if m.id.isdigit() else (1, m.id)))
        if ordenadas != self.marcacoes:
            raise ValueError('Envie as marcações em ordem cronológica e de identificador.')
        if any(m.acao != ('entrada' if i % 2 == 0 else 'saida') for i, m in enumerate(self.marcacoes)):
            raise ValueError('Ações não correspondem aos pares cronológicos do ponto.')
        totais = {'presencial': 0, 'remoto': 0, 'nao_classificado': 0}
        for i in range(0, len(self.marcacoes) - 1, 2):
            a, b = self.marcacoes[i:i + 2]
            segundos = int((b.momento - a.momento).total_seconds())
            totais[a.local if a.local == b.local else 'nao_classificado'] += segundos
        if (self.segundos_presenciais, self.segundos_remotos, self.segundos_nao_classificados) != tuple(totais.values()):
            raise ValueError('Totais registrados não correspondem às marcações.')
        if self.segundos_registrados != sum(totais.values()):
            raise ValueError('Total registrado inconsistente.')
        return self


class LoteResumos(BaseModel):
    model_config = ConfigDict(extra='forbid')
    resumos: list[Resumo] = Field(min_length=1, max_length=100)


class Sinal(BaseModel):
    model_config = ConfigDict(extra='forbid')
    sistema: Literal['sistema-ponto'] = 'sistema-ponto'
    pendentes: int = Field(ge=0, le=100000000)
    ultima_entrega: dt.datetime | None = None


class Marcacao(BaseModel):
    id: str = Field(min_length=1, max_length=100, description="Identificador único da batida no ponto")
    matricula: str = Field(min_length=1, max_length=30)
    momento: dt.datetime = Field(description="Data e hora com fuso, ex.: 2026-10-06T08:02:11-03:00")
    tipo: Literal["entrada", "saida", "saida_intervalo", "retorno_intervalo", "auto"] = "auto"
    local: Literal["presencial", "remoto"] = "presencial"
    cancelada: bool = False
    origem: str | None = Field(default=None, max_length=60)

    @field_validator('id', 'matricula')
    @classmethod
    def nao_vazio(cls, v):
        if not v.strip():
            raise ValueError('Campo vazio.')
        return v.strip()

    @field_validator("momento")
    @classmethod
    def com_fuso(cls, v: dt.datetime):
        if v.tzinfo is None:                       # sem fuso: horário de Brasília
            v = v.replace(tzinfo=presenca.FUSO)
        agora = dt.datetime.now(dt.timezone.utc)
        if v > agora + dt.timedelta(minutes=10):
            raise ValueError("momento no futuro")
        if v < agora - dt.timedelta(days=400):
            raise ValueError("momento com mais de 400 dias")
        return v


class Lote(BaseModel):
    marcacoes: list[Marcacao] = Field(min_length=1, max_length=MAX_LOTE)


class NovaChave(BaseModel):
    nome: str = Field(min_length=3, max_length=80)
