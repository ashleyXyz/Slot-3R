$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Slot3R local preview: http://127.0.0.1:8765/'
Write-Host 'Keep this window open. Press Ctrl+C to stop the server.'
python -m http.server 8765 --bind 127.0.0.1
