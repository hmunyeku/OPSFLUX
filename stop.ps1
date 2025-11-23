# Script d'arrêt intelligent OPSFLUX (Windows PowerShell)
# Lit automatiquement la variable ENVIRONMENT depuis .env

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Blue
Write-Host "    OPSFLUX - Arrêt des services" -ForegroundColor Blue
Write-Host "================================================" -ForegroundColor Blue
Write-Host ""

# Charger .env
if (Test-Path ".env") {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

$ENVIRONMENT = $env:ENVIRONMENT
if ([string]::IsNullOrEmpty($ENVIRONMENT)) {
    $ENVIRONMENT = "local"
}

Write-Host "Mode: $ENVIRONMENT" -ForegroundColor Blue
Write-Host ""

# Arrêt selon le mode
if ($ENVIRONMENT -eq "local") {
    Write-Host "🛑 Arrêt des services en mode développement..." -ForegroundColor Yellow
    docker-compose down $args
}
else {
    Write-Host "🛑 Arrêt des services en mode production..." -ForegroundColor Yellow
    docker-compose -f docker-compose.yml down $args
}

Write-Host ""
Write-Host "✓ Services arrêtés" -ForegroundColor Red
Write-Host ""
Write-Host "================================================" -ForegroundColor Blue
