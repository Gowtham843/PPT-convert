# Option C: let PowerPoint draw the slides, our HTML5 player animates them.
# Runs on the Windows worker (needs PowerPoint installed).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File export-pptx-layers.ps1 -Pptx C:\decks\deck.pptx -OutDir C:\decks\deck-layers
#
# Output (in OutDir):
#   s<N>-full.png      whole slide as PowerPoint draws it (reference for comparing)
#   s<N>-bg.png        slide with animated shapes hidden
#   s<N>-sp<ID>.png    one transparent image per animated shape
#   manifest.json      sizes, positions and PowerPoint's own animation list
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$Width = 1920
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Pptx = (Resolve-Path $Pptx).Path
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

function Get-ImageSize([string]$file) {
  $img = [System.Drawing.Image]::FromFile($file)
  try { return @{ w = $img.Width; h = $img.Height } } finally { $img.Dispose() }
}

$app = New-Object -ComObject PowerPoint.Application
# ReadOnly = true, Untitled = false, WithWindow = false
$pres = $app.Presentations.Open($Pptx, -1, 0, 0)
try {
  $sw = $pres.PageSetup.SlideWidth
  $sh = $pres.PageSetup.SlideHeight
  $height = [int][Math]::Round($Width * $sh / $sw)
  $slides = New-Object System.Collections.Generic.List[object]

  for ($s = 1; $s -le $pres.Slides.Count; $s++) {
    $slide = $pres.Slides.Item($s)

    # Collect every animation (main sequence + trigger sequences).
    $seqs = New-Object System.Collections.Generic.List[object]
    $seqs.Add($slide.TimeLine.MainSequence)
    for ($i = 1; $i -le $slide.TimeLine.InteractiveSequences.Count; $i++) {
      $seqs.Add($slide.TimeLine.InteractiveSequences.Item($i))
    }
    $shapes = [ordered]@{}
    $effects = New-Object System.Collections.Generic.List[object]
    for ($q = 0; $q -lt $seqs.Count; $q++) {
      $seq = $seqs[$q]
      for ($j = 1; $j -le $seq.Count; $j++) {
        $e = $seq.Item($j)
        $shapes[[string]$e.Shape.Id] = $e.Shape
        $effects.Add([ordered]@{
          shapeId     = [string]$e.Shape.Id
          effectType  = [int]$e.EffectType
          exit        = [int]$e.Exit
          duration    = $e.Timing.Duration
          delay       = $e.Timing.TriggerDelayTime
          trigger     = [int]$e.Timing.TriggerType
          interactive = ($q -gt 0)
        })
      }
    }

    # One image per animated shape. Shape.Export is a hidden PowerPoint API; 2 = PNG.
    $layers = New-Object System.Collections.Generic.List[object]
    $exported = New-Object System.Collections.Generic.List[object]
    foreach ($id in $shapes.Keys) {
      $shape = $shapes[$id]
      $file = "s$s-sp$id.png"
      try {
        $shape.Export((Join-Path $OutDir $file), 2)
        $size = Get-ImageSize (Join-Path $OutDir $file)
        $layers.Add([ordered]@{
          id = $id; name = $shape.Name; file = $file
          left = $shape.Left; top = $shape.Top; width = $shape.Width; height = $shape.Height
          imgW = $size.w; imgH = $size.h
        })
        $exported.Add($shape)
      } catch {
        Write-Warning "Slide $s shape $id ($($shape.Name)): export failed, kept in background. $_"
      }
    }

    $slide.Export((Join-Path $OutDir "s$s-full.png"), 'PNG', $Width, $height)
    foreach ($sp in $exported) { $sp.Visible = 0 }
    $slide.Export((Join-Path $OutDir "s$s-bg.png"), 'PNG', $Width, $height)
    foreach ($sp in $exported) { $sp.Visible = -1 }

    $slides.Add([ordered]@{
      index = $s; full = "s$s-full.png"; background = "s$s-bg.png"
      layers = $layers; effects = $effects
    })
    Write-Host "Slide $s : $($layers.Count) animated shape(s), $($effects.Count) effect(s)"
  }

  $manifest = [ordered]@{ slideWidthPt = $sw; slideHeightPt = $sh; imageWidth = $Width; imageHeight = $height; slides = $slides }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir 'manifest.json') -Encoding UTF8
  Write-Host "Done -> $OutDir"
} finally {
  $pres.Close()
  $app.Quit()
}
