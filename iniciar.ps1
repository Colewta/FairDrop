param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$backendDir = Join-Path $projectRoot 'Backend'
$frontendDir = Join-Path $projectRoot 'Frontend'
$runtimeDir = Join-Path $projectRoot '.run'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$pythonExe = Join-Path $backendDir 'venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) {
    Write-Host 'Preparando Python para o FairDrop...'
    & py -3.12 -m venv (Join-Path $backendDir 'venv')
    if ($LASTEXITCODE -ne 0) { throw 'Instale Python 3.12 e execute novamente.' }
}
$requirementsPath = Join-Path $backendDir 'requirements.txt'
$stampPath = Join-Path $runtimeDir 'requirements.sha256'
$requiredHash = (Get-FileHash -LiteralPath $requirementsPath -Algorithm SHA256).Hash
$installedHash = if (Test-Path -LiteralPath $stampPath) { Get-Content -LiteralPath $stampPath -Raw } else { '' }
if ($installedHash.Trim() -ne $requiredHash) {
    Write-Host 'Preparando as dependencias. Isso acontece no primeiro uso ou apos atualizacoes...'
    & $pythonExe -m pip install -r $requirementsPath
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel instalar as dependencias. Confira a conexao com a internet.' }
    Set-Content -LiteralPath $stampPath -Value $requiredHash
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22 e execute novamente.' }
$lockPath = Join-Path $frontendDir 'package-lock.json'
$frontendStamp = Join-Path $runtimeDir 'frontend.sha256'
$lockHash = (Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash
$frontendHash = if (Test-Path -LiteralPath $frontendStamp) { Get-Content -LiteralPath $frontendStamp -Raw } else { '' }
if (-not (Test-Path -LiteralPath (Join-Path $frontendDir 'node_modules')) -or $frontendHash.Trim() -ne $lockHash) {
    Push-Location $frontendDir
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel preparar a interface.' }
        Set-Content -LiteralPath $frontendStamp -Value $lockHash
    }
    finally { Pop-Location }
}
function Test-FairDropUrl([string]$Url) {
    try { return (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2).StatusCode -eq 200 }
    catch { return $false }
}
if (Test-FairDropUrl 'http://127.0.0.1:8000/health') {
    $existingApi = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/openapi.json' -TimeoutSec 5
    if ($existingApi.info.title -ne 'FairDrop API' -or -not $existingApi.paths.'/students/{identifier}/scenario') {
        throw 'A porta 8000 esta em uso por outra aplicacao ou uma versao antiga. Encerre esse servico e abra novamente o Iniciar FairDrop.cmd.'
    }
}
if (-not (Test-FairDropUrl 'http://127.0.0.1:8000/health')) {
    Start-Process -FilePath $pythonExe -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000','--no-access-log' -WorkingDirectory $backendDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'backend.log') -RedirectStandardError (Join-Path $runtimeDir 'backend-error.log') | Out-Null
}
if (-not (Test-FairDropUrl 'http://127.0.0.1:5173')) {
    $vitePath = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
    Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"' + $vitePath + '"'),'--host','127.0.0.1','--port','5173','--strictPort' -WorkingDirectory $frontendDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'frontend.log') -RedirectStandardError (Join-Path $runtimeDir 'frontend-error.log') | Out-Null
}
Write-Host 'Iniciando o FairDrop...'
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ((Test-FairDropUrl 'http://127.0.0.1:8000/health') -and (Test-FairDropUrl 'http://127.0.0.1:5173')) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw "O servico ainda nao iniciou. Consulte os arquivos de log em $runtimeDir" }
Write-Host 'FairDrop pronto: http://localhost:5173'
Write-Host 'Clique em Experimentar com dados de exemplo para comecar.'
if ($OpenBrowser) { Start-Process 'http://localhost:5173' }
