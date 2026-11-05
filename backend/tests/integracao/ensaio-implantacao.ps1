[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $PontoApiDir,
    [string] $DockerContext = 'desktop-linux',
    [switch] $ReusarImagens
)

$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $PSScriptRoot 'compose.yml'
$projeto = 'coffito-pass-ensaio-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$pontoAnterior = $env:PONTO_API_DIR
$pontoApi = (Resolve-Path -LiteralPath $PontoApiDir).Path
if (-not (Test-Path -LiteralPath (Join-Path $pontoApi 'migrations/002_integracao_rh.sql') -PathType Leaf)) {
    throw 'Informe a pasta api do repositório do Ponto que contém a migração 002.'
}
$env:PONTO_API_DIR = $pontoApi.Replace('\', '/')

function Invoke-Ensaio {
    & docker --context $DockerContext compose -f $composeFile -p $projeto @args
    if ($LASTEXITCODE -ne 0) {
        throw "Falha no Compose de ensaio ($LASTEXITCODE): $($args -join ' ')"
    }
}

try {
    $endpoint = & docker context inspect $DockerContext --format '{{.Endpoints.docker.Host}}'
    if ($LASTEXITCODE -ne 0 -or $endpoint -notmatch '^(npipe|unix)://') {
        throw 'Use um Docker local (socket Unix ou pipe Windows).'
    }

    Write-Host "Ensaio descartável: $projeto (PostgreSQL tmpfs; porta local 18002)."
    if (-not $ReusarImagens) {
        Invoke-Ensaio build rh
        Invoke-Ensaio build testes
    }
    Invoke-Ensaio up -d --wait db
    Invoke-Ensaio exec -T db createdb -U teste -T template0 rh_demandas_test
    Invoke-Ensaio exec -T db createdb -U teste -T template0 ponto_integracao_test
    $origem = 'postgresql://teste:teste-somente-local@db:5432/rh_demandas_test'
    Invoke-Ensaio run --rm --no-deps -e PYTHONPATH=/rh/backend -e "DATABASE_URL=$origem" testes python /rh/backend/tests/integracao/preparar_demandas.py
    Invoke-Ensaio exec -T db pg_dump -U teste -Fc -f /tmp/ensaio.dump rh_demandas_test
    Invoke-Ensaio exec -T db pg_restore -U teste -d rh_test --exit-on-error --single-transaction --no-owner --no-acl /tmp/ensaio.dump
    Invoke-Ensaio run --rm --no-deps -e PYTHONPATH=/rh/backend -e "DATABASE_URL=$origem" -e RH_TEST_RESTORE_DB=rh_test testes python /rh/backend/tests/integracao/verificar_restauracao.py

    Invoke-Ensaio up -d --wait rh
    Invoke-Ensaio run --rm --no-deps -e RH_TEST_PRESERVAR_DADOS=1 testes python /testes/verificar_integracao.py
    Invoke-Ensaio exec -T db psql -X -v ON_ERROR_STOP=1 -U teste -d rh_test -c "DO 'BEGIN IF NOT EXISTS (SELECT 1 FROM demandas.metas WHERE id = ''meta-teste'') THEN RAISE EXCEPTION ''Meta restaurada ausente''; END IF; END';"
    Write-Host 'Ensaio concluído: restore em base vazia, startup, envio, reenvio sem duplicação e preservação da meta restaurada.'
}
finally {
    try {
        if ($endpoint -match '^(npipe|unix)://') {
            Invoke-Ensaio down
        }
    }
    finally {
        $env:PONTO_API_DIR = $pontoAnterior
    }
}
