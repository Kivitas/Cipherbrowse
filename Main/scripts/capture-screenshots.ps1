Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$main = Join-Path $root "Main"
$screenshots = Join-Path $root "screenshots"

if (-not (Test-Path $screenshots)) {
  New-Item -ItemType Directory -Path $screenshots | Out-Null
}

Add-Type -AssemblyName System.Drawing

function Strip-Ansi {
  param([string]$Text)
  return [regex]::Replace($Text, "\x1B\[[0-9;?]*[ -/]*[@-~]", "")
}

function Invoke-CipherBrowse {
  param(
    [string]$Name,
    [string]$CommandText
  )

  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    Set-Content -Path $tmp -Value $CommandText -NoNewline -Encoding UTF8
    $output = Get-Content -Path $tmp -Raw | node (Join-Path $main "src\index.js") 2>&1 | Out-String
    return Strip-Ansi $output
  } finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
  }
}

function Save-TerminalPng {
  param(
    [string]$FilePath,
    [string]$Text,
    [string]$Title
  )

  $font = New-Object System.Drawing.Font("Consolas", 14, [System.Drawing.FontStyle]::Regular)
  $titleFont = New-Object System.Drawing.Font("Consolas", 16, [System.Drawing.FontStyle]::Bold)
  $measureBitmap = New-Object System.Drawing.Bitmap 1, 1
  $graphics = [System.Drawing.Graphics]::FromImage($measureBitmap)
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $bodyLines = ($Text -replace "`r","").Split("`n")
  $allLines = @($Title, "") + $bodyLines
  $maxLine = ($allLines | Measure-Object -Maximum Length).Maximum
  if (-not $maxLine) { $maxLine = 40 }

  $charSize = $graphics.MeasureString(("W" * [Math]::Max(1, [int]$maxLine)), $font)
  $lineHeight = [Math]::Ceiling($font.GetHeight($graphics) + 5)
  $titleHeight = [Math]::Ceiling($titleFont.GetHeight($graphics) + 10)
  $width = [Math]::Min(1800, [Math]::Max(960, [Math]::Ceiling($charSize.Width) + 40))
  $height = [Math]::Min(2200, [Math]::Max(420, ($bodyLines.Count * $lineHeight) + $titleHeight + 60))

  $graphics.Dispose()
  $measureBitmap.Dispose()

  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.Clear([System.Drawing.Color]::FromArgb(18, 18, 18))
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $titleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 165, 0))
  $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(134, 255, 92))
  $dimBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(185, 185, 185))

  $g.DrawString($Title, $titleFont, $titleBrush, 20, 16)
  $g.DrawString("CipherBrowse terminal capture", $font, $dimBrush, 20, 42)

  $y = 78
  foreach ($line in $bodyLines) {
    $g.DrawString($line, $font, $textBrush, 20, $y)
    $y += $lineHeight
    if ($y -gt ($height - $lineHeight)) { break }
  }

  $bitmap.Save($FilePath, [System.Drawing.Imaging.ImageFormat]::Png)

  $titleBrush.Dispose()
  $textBrush.Dispose()
  $dimBrush.Dispose()
  $g.Dispose()
  $bitmap.Dispose()
  $font.Dispose()
  $titleFont.Dispose()
}

$captures = @(
  @{ file = "01-home.png"; title = "Home"; text = Invoke-CipherBrowse -Name "home" -CommandText "/quit`n" },
  @{ file = "02-help.png"; title = "Full Help"; text = & node (Join-Path $main "src\\index.js") --help 2>&1 | Out-String | ForEach-Object { Strip-Ansi $_ } },
  @{ file = "03-doctor.png"; title = "Diagnostics"; text = & node (Join-Path $main "src\\index.js") "/doctor" 2>&1 | Out-String | ForEach-Object { Strip-Ansi $_ } },
  @{ file = "04-web-search.png"; title = "Web Search"; text = & node (Join-Path $main "src\\index.js") "/s cake recipe" 2>&1 | Out-String | ForEach-Object { Strip-Ansi $_ } },
  @{ file = "05-wiki-search.png"; title = "Wikipedia Search"; text = & node (Join-Path $main "src\\index.js") "/s wiki --query world war 2" 2>&1 | Out-String | ForEach-Object { Strip-Ansi $_ } },
  @{ file = "06-github-search.png"; title = "GitHub Search"; text = & node (Join-Path $main "src\\index.js") "/s github --query react hooks" 2>&1 | Out-String | ForEach-Object { Strip-Ansi $_ } },
  @{ file = "07-npm-search.png"; title = "npm Search"; text = & node (Join-Path $main "src\\index.js") "/s npm --query react" 2>&1 | Out-String | ForEach-Object { Strip-Ansi $_ } },
  @{ file = "08-mdn-search.png"; title = "MDN Search"; text = & node (Join-Path $main "src\\index.js") "/s mdn --query fetch" 2>&1 | Out-String | ForEach-Object { Strip-Ansi $_ } },
  @{ file = "09-image-search.png"; title = "Image Search"; text = & node (Join-Path $main "src\\index.js") "/s cake --images" 2>&1 | Out-String | ForEach-Object { Strip-Ansi $_ } },
  @{ file = "10-video-search.png"; title = "Video Search"; text = & node (Join-Path $main "src\\index.js") "/s yt --query cake" 2>&1 | Out-String | ForEach-Object { Strip-Ansi $_ } }
)

foreach ($capture in $captures) {
  Save-TerminalPng -FilePath (Join-Path $screenshots $capture.file) -Text $capture.text -Title $capture.title
}

Write-Host "Saved screenshots to $screenshots"
