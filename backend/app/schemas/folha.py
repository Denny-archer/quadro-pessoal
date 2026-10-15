"""Campos complementares de folha e histórico, persistidos em funcionarios.extra."""
from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StrictBool, StrictInt, field_validator, model_validator


class EstadoGratificacao(BaseModel):
    model_config = ConfigDict(extra='forbid')
    funcaoTipo: Literal['', 'fg', 'comissao'] = ''
    fgTipo: Literal['', 'chefia', 'assessor1', 'assessor2'] = ''
    nivel: Literal['', 'I', 'II', 'III', 'IV', 'V', 'VI'] = ''
    funcao: str = Field(default='', max_length=160)
    portariaFuncao: str = Field(default='', max_length=160)


class MudancaRemuneracao(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z0-9_.:-]+$')
    tipo: Literal['nivel', 'grat']
    data: dt.date
    de: Any
    para: Any
    deAuto: StrictBool = False
    ato: str = Field(default='', max_length=160)
    registradoEm: dt.datetime | None = None

    @field_validator('data', mode='before')
    @classmethod
    def data_iso(cls, valor):
        if not isinstance(valor, str) or len(valor) != 10:
            raise ValueError('A vigência deve usar AAAA-MM-DD.')
        return valor

    @field_validator('registradoEm')
    @classmethod
    def horario_com_fuso(cls, valor):
        if valor is not None and valor.tzinfo is None:
            raise ValueError('O horário de registro deve informar o fuso.')
        return valor

    @model_validator(mode='after')
    def valores_da_mudanca(self):
        if self.tipo == 'nivel':
            if any(type(v) is not int or not 1 <= v <= 30 for v in (self.de, self.para)):
                raise ValueError('Os níveis do histórico devem ser inteiros de 1 a 30.')
        else:
            if self.deAuto:
                raise ValueError('deAuto só se aplica a mudanças de nível.')
            self.de = EstadoGratificacao.model_validate(self.de).model_dump()
            self.para = EstadoGratificacao.model_validate(self.para).model_dump()
        return self


class CamposFolha(BaseModel):
    model_config = ConfigDict(extra='ignore')
    titulacaoPct: FiniteFloat = 0
    anuenioPct: FiniteFloat = Field(default=0, ge=0, le=50)
    dependentesIR: StrictInt = Field(default=0, ge=0, le=20)
    outrosDescontos: FiniteFloat = Field(default=0, ge=0)
    sindicalizado: StrictBool = False
    historicoRem: list[MudancaRemuneracao] = Field(default_factory=list, max_length=500)

    @field_validator('titulacaoPct', 'anuenioPct', 'outrosDescontos', mode='before')
    @classmethod
    def nao_booleano(cls, valor):
        if isinstance(valor, bool):
            raise ValueError('Informe um número, não um booleano.')
        return valor

    @field_validator('titulacaoPct')
    @classmethod
    def titulacao_conhecida(cls, valor):
        if valor not in (0, 7.5, 10, 12.5):
            raise ValueError('Titulação deve ser 0, 7,5, 10 ou 12,5%.')
        return valor

    @model_validator(mode='after')
    def historico_unico(self):
        ids, datas = set(), set()
        for mudanca in self.historicoRem:
            chave = (mudanca.tipo, mudanca.data)
            if mudanca.id in ids or chave in datas:
                raise ValueError('O histórico contém identificador ou vigência duplicada.')
            ids.add(mudanca.id)
            datas.add(chave)
        return self


class CamposDiaria(BaseModel):
    valorDiaria: FiniteFloat = Field(default=0, ge=0)

    @field_validator('valorDiaria', mode='before')
    @classmethod
    def nao_booleano(cls, valor):
        if isinstance(valor, bool):
            raise ValueError('Informe um número, não um booleano.')
        return valor
