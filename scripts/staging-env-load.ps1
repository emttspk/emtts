# Staging Environment Loader for PowerShell
#
# Loads .env.staging.local into the current PowerShell session
# Preserves shell env precedence (existing vars are not overwritten)
#
# Usage:
#   . .\scripts\staging-env-load.ps1
#
# Or add to your PowerShell profile for auto-loading

$stagingEnvFile = ".env.staging.local"
$stagingEnvExample = ".env.staging.local.example"

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  STAGING ENVIRONMENT LOADER (PowerShell)                 ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check if .env.staging.local exists
if (-not (Test-Path $stagingEnvFile)) {
  Write-Host "⚠️  .env.staging.local not found!" -ForegroundColor Yellow
  Write-Host "`nTo set up staging environment:`n" -ForegroundColor White
  
  if (Test-Path $stagingEnvExample) {
    Write-Host "  1. Copy template:" -ForegroundColor Green
    Write-Host "     Copy-Item .env.staging.local.example .env.staging.local`n"
    Write-Host "  2. Edit .env.staging.local with real R2 credentials" -ForegroundColor Green
    Write-Host "  3. Re-run this script: . .\scripts\staging-env-load.ps1`n"
  } else {
    Write-Host "  1. Template file not found. Please check repository setup." -ForegroundColor Red
  }
  
  exit 1
}

# Parse and load .env.staging.local
Write-Host "[Loading] Parsing .env.staging.local..." -ForegroundColor White

$loadedCount = 0
$skippedCount = 0

Get-Content $stagingEnvFile | ForEach-Object {
  $line = $_.Trim()
  
  # Skip comments and empty lines
  if ($line.StartsWith("#") -or [string]::IsNullOrWhiteSpace($line)) {
    return
  }
  
  # Parse KEY=value
  if ($line -match "^([^=]+)=(.*)$") {
    $key = $matches[1].Trim()
    $value = $matches[2].Trim()
    
    # Remove surrounding quotes if present
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or 
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    
    # Check if variable already exists in shell (respect shell precedence)
    $existing = [Environment]::GetEnvironmentVariable($key)
    if ($null -eq $existing -or [string]::IsNullOrWhiteSpace($existing)) {
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
      $loadedCount++
    } else {
      $skippedCount++
    }
  }
}

Write-Host "[Loaded] $loadedCount variables set, $skippedCount shell overrides skipped" -ForegroundColor Green
Write-Host "`n[Next] Verify env configuration:" -ForegroundColor White
Write-Host "   npm run staging:env:check`n" -ForegroundColor Cyan
