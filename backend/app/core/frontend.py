"""Entrega o frontend com URLs que mudam junto com seus arquivos."""
import hashlib
import re
from pathlib import Path

from fastapi.responses import HTMLResponse

from .paths import FRONTEND


PASTAS_PUBLICAS = ('scripts', 'styles', 'assets', 'demandas/scripts', 'demandas/styles')


def versao_frontend(raiz: Path) -> str:
    arquivos = [*raiz.glob('*.html'), *(raiz / 'demandas').glob('*.html')]
    for pasta in PASTAS_PUBLICAS:
        arquivos.extend(p for p in (raiz / pasta).rglob('*') if p.is_file())
    resumo = hashlib.sha256()
    for arquivo in sorted(arquivos):
        resumo.update(arquivo.relative_to(raiz).as_posix().encode('utf-8') + b'\0')
        resumo.update(arquivo.read_bytes())
        resumo.update(b'\0')
    return resumo.hexdigest()[:16]


VERSAO_FRONTEND = versao_frontend(FRONTEND)
PREFIXO_FRONTEND = '/ui/' + VERSAO_FRONTEND
RECURSO_HTML = re.compile(r'''(\b(?:src|href)=["'])(/(?:scripts|styles|assets|demandas/(?:scripts|styles))/[^"']+)(["'])''')


def pagina_frontend(arquivo: str) -> HTMLResponse:
    conteudo = (FRONTEND / arquivo).read_text(encoding='utf-8-sig')
    # Imports relativos dos módulos herdam o prefixo, inclusive os módulos internos.
    conteudo = RECURSO_HTML.sub(lambda m: m[1] + PREFIXO_FRONTEND + m[2] + m[3], conteudo)
    return HTMLResponse(conteudo, headers={'Cache-Control': 'no-store', 'X-UI-Version': VERSAO_FRONTEND})
