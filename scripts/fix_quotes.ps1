$content = Get-Content '.\scripts\params2_cognitive_api.ps1' -Raw -Encoding UTF8
$content = $content -replace [char]0x2018, "'"
$content = $content -replace [char]0x2019, "'"
$content = $content -replace [char]0x201C, '"'
$content = $content -replace [char]0x201D, '"'
$content | Set-Content '.\scripts\params2_cognitive_api.ps1' -NoNewline -Encoding UTF8
Write-Host "Fixed smart quotes in params2_cognitive_api.ps1"

