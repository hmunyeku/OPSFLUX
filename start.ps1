# Script de démarrage intelligent OPSFLUX (Windows PowerShell)
# Lit automatiquement la variable ENVIRONMENT depuis .env

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Blue
Write-Host "    OPSFLUX - Démarrage automatique" -ForegroundColor Blue
Write-Host "================================================" -ForegroundColor Blue
Write-Host ""

# Charger le fichier .env s'il existe
if (Test-Path ".env") {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
    Write-Host "✓ Fichier .env chargé" -ForegroundColor Green
}
else {
    Write-Host "✗ Fichier .env introuvable!" -ForegroundColor Red
    Write-Host "➜ Créez un fichier .env basé sur .env.example" -ForegroundColor Yellow
    exit 1
}

# Récupérer ENVIRONMENT
$ENVIRONMENT = $env:ENVIRONMENT
if ([string]::IsNullOrEmpty($ENVIRONMENT)) {
    Write-Host "⚠  Variable ENVIRONMENT non définie, utilisation de 'local' par défaut" -ForegroundColor Yellow
    $ENVIRONMENT = "local"
}

Write-Host "Mode détecté: $ENVIRONMENT" -ForegroundColor Blue
Write-Host ""

# Démarrage selon le mode
if ($ENVIRONMENT -eq "local") {
    Write-Host "🚀 Démarrage en mode DÉVELOPPEMENT LOCAL" -ForegroundColor Green
    Write-Host "   - Hot reload activé" -ForegroundColor Blue
    Write-Host "   - Ports mappés: Backend :8000, Frontend :3000, Adminer :8080" -ForegroundColor Blue
    Write-Host "   - Fichiers montés depuis: $(Get-Location)" -ForegroundColor Blue
    Write-Host ""

    # En mode local, docker-compose.override.yml s'applique automatiquement
    docker-compose up -d $args

    Write-Host ""
    Write-Host "✓ Services démarrés en mode développement" -ForegroundColor Green
    Write-Host ""
    Write-Host "Accès local:" -ForegroundColor Blue
    Write-Host "  Backend API:  " -NoNewline -ForegroundColor Blue
    Write-Host "http://localhost:8000" -ForegroundColor Green
    Write-Host "  Swagger UI:   " -NoNewline -ForegroundColor Blue
    Write-Host "http://localhost:8000/api/schema/swagger-ui/" -ForegroundColor Green
    Write-Host "  Frontend:     " -NoNewline -ForegroundColor Blue
    Write-Host "http://localhost:3000" -ForegroundColor Green
    Write-Host "  Adminer (DB): " -NoNewline -ForegroundColor Blue
    Write-Host "http://localhost:8080" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Logs: docker-compose logs -f [service]" -ForegroundColor Yellow
    Write-Host "🛑 Arrêt: docker-compose down" -ForegroundColor Yellow
}
elseif ($ENVIRONMENT -eq "production" -or $ENVIRONMENT -eq "staging") {
    Write-Host "🚀 Démarrage en mode PRODUCTION" -ForegroundColor Green
    Write-Host "   - Traefik reverse proxy" -ForegroundColor Blue
    Write-Host "   - SSL automatique (Let's Encrypt)" -ForegroundColor Blue
    Write-Host "   - Domaine: $env:DOMAIN" -ForegroundColor Blue
    Write-Host ""

    # En mode production, ignorer docker-compose.override.yml
    docker-compose -f docker-compose.yml up -d $args

    Write-Host ""
    Write-Host "✓ Services démarrés en mode production" -ForegroundColor Green
    Write-Host ""
    Write-Host "Accès production:" -ForegroundColor Blue
    Write-Host "  Application: " -NoNewline -ForegroundColor Blue
    Write-Host "https://$env:DOMAIN" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Logs: docker-compose -f docker-compose.yml logs -f [service]" -ForegroundColor Yellow
    Write-Host "🛑 Arrêt: docker-compose -f docker-compose.yml down" -ForegroundColor Yellow
}
else {
    Write-Host "✗ ENVIRONMENT invalide: '$ENVIRONMENT'" -ForegroundColor Red
    Write-Host "➜ Valeurs acceptées: local, staging, production" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Blue
