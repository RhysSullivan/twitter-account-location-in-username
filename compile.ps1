param(
    [Parameter(Mandatory = $true)][string]$ApiKey,
    [Parameter(Mandatory = $true)][string]$ApiSecret
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $Root
$BuildDir = Join-Path $Root "dist\firefox"

# Clean and recreate build dir
if (Test-Path $BuildDir) {
    Remove-Item $BuildDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $BuildDir | Out-Null

# Mirror files into build dir, excluding server/codegen artifacts
robocopy $Root $BuildDir /MIR /XD "server" "web-ext-artifacts" "dist" ".git" /XF "*.env" "output.xpi" "output.zip" "*.bash" "*.sh" | Out-Null
if ($LASTEXITCODE -gt 3) {
    Write-Error "robocopy failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# Use Firefox-specific manifest
Copy-Item (Join-Path $Root "manifest.firefox.json") (Join-Path $BuildDir "manifest.json") -Force

Write-Host "Signing Firefox extension via npx web-ext (channel=unlisted)..."
$args = @(
    "web-ext", "sign",
    "--channel", "unlisted",
    "--api-key", $ApiKey,
    "--api-secret", $ApiSecret,
    "--source-dir", $BuildDir,
    "--artifacts-dir", (Join-Path $Root "web-ext-artifacts"),
    "--ignore-files", "server/**",
    "--ignore-files", "*.env",
    "--ignore-files", "dist/**"
)

& npx @args
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "Firefox XPI signing complete. Artifacts in $(Join-Path $Root 'web-ext-artifacts')."
