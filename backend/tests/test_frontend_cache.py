"""Regressões da entrega HTTP do frontend; não acessam banco nem executam migrações."""
import re
from urllib.parse import urljoin

from fastapi.testclient import TestClient

from app.core import db
from app.core.frontend import versao_frontend
from app.main import app


def test_paginas_carregam_estilos_e_scripts_da_mesma_versao(monkeypatch):
    def sem_banco(*args, **kwargs):
        raise AssertionError('Uma página ou asset público não deve consultar o banco.')
    monkeypatch.setattr(db, 'consultar', sem_banco)
    cliente = TestClient(app)  # Sem lifespan: teste exclusivo de HTML e assets.
    for rota in ('/', '/index.html', '/login', '/importacao.html', '/demandas/', '/administracao', '/primeiro-acesso'):
        pagina = cliente.get(rota)
        assert pagina.status_code == 200
        assert pagina.headers['cache-control'] == 'no-store'
        versao = pagina.headers['x-ui-version']
        recursos = re.findall(r'''(?:src|href)=["'](/ui/[^"']+)["']''', pagina.text)
        assert recursos
        assert not re.search(r'''(?:src|href)=["']/(?:scripts|styles|demandas/(?:scripts|styles))/''', pagina.text)
        for recurso in recursos:
            assert recurso.startswith('/ui/' + versao + '/')
            resposta = cliente.get(recurso)
            assert resposta.status_code == 200, recurso
            assert resposta.headers['cache-control'] == 'no-store'


def test_imports_internos_tambem_usam_urls_versionadas():
    cliente = TestClient(app)
    pendentes = []
    for rota in ('/', '/demandas/', '/administracao', '/primeiro-acesso', '/login', '/importacao.html'):
        pagina = cliente.get(rota)
        pendentes.extend(re.findall(r'''<script[^>]+src=["']([^"']+)''', pagina.text))
    lidos = set()
    while pendentes:
        url = pendentes.pop()
        if url in lidos:
            continue
        assert url.startswith('/ui/'), url
        resposta = cliente.get(url)
        assert resposta.status_code == 200, url
        lidos.add(url)
        for destino in re.findall(r'''\bfrom\s+["']([^"']+)["']''', resposta.text):
            pendentes.append(urljoin(url, destino))
    assert len(lidos) > 30  # Inclui os módulos internos do RH e a sessão compartilhada.


def test_urls_antigas_de_scripts_e_estilos_exigem_nova_resposta():
    cliente = TestClient(app)
    for url in ('/scripts/core/estado.js', '/scripts/core/render.js', '/scripts/features/presenca.js', '/styles/features/administracao.css'):
        resposta = cliente.get(url)
        assert resposta.status_code == 200
        assert resposta.headers['cache-control'] == 'no-store'


def test_alterar_modulo_interno_muda_versao_do_frontend(tmp_path):
    pasta = tmp_path / 'scripts' / 'core'
    pasta.mkdir(parents=True)
    modulo = pasta / 'render.js'
    modulo.write_text('export const panorama = true;', encoding='utf-8')
    anterior = versao_frontend(tmp_path)
    modulo.write_text('export const panorama = false;', encoding='utf-8')
    assert versao_frontend(tmp_path) != anterior
