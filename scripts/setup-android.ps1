# Setup Red Alert 2 / Yuri's Revenge assets for Android
param(
    [Parameter(Mandatory=$false, Position=0)]
    [string]$RetailDir = $env:RA2_RETAIL_DIR
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

if (-not $RetailDir) {
    Write-Host "Usage: .\scripts\setup-android.ps1 <path-to-ra2-install>" -ForegroundColor Yellow
    Write-Host "Example: .\scripts\setup-android.ps1 `"F:\Steam\steamapps\common\Command & Conquer Red Alert II`""
    exit 1
}

if (-not (Test-Path $RetailDir)) {
    Write-Error "Retail directory does not exist: $RetailDir"
    exit 1
}

Write-Host "==> Checking prerequisites..." -ForegroundColor Cyan

# Check Node / npm
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not found on PATH. Please install Node.js 18+."
    exit 1
}

# Check Java
if (-not (Get-Command javac -ErrorAction SilentlyContinue)) {
    Write-Error "Java JDK is not found on PATH. Please install JDK 17+."
    exit 1
}

# Install dependencies if node_modules is missing
if (-not (Test-Path "$Root\redalert2\node_modules")) {
    Write-Host "==> Installing web dependencies in redalert2/..." -ForegroundColor Cyan
    Push-Location "$Root\redalert2"
    npm install
    Pop-Location
}

# Ensure ffmpeg-static is available
if (-not (Test-Path "$Root\redalert2\node_modules\ffmpeg-static")) {
    Write-Host "==> Installing ffmpeg-static in redalert2/..." -ForegroundColor Cyan
    Push-Location "$Root\redalert2"
    npm install --save-dev ffmpeg-static
    Pop-Location
}

Write-Host "==> Running asset preparation script..." -ForegroundColor Cyan
$env:RA2_RETAIL_DIR = $RetailDir
npx tsx "$Root\scripts\prepare-gameres.ts"

Write-Host "`n==> Setup complete!" -ForegroundColor Green
Write-Host "You can now build the Android APK by running:" -ForegroundColor Green
Write-Host "  .\scripts\build-android.ps1 -Install`n" -ForegroundColor Yellow