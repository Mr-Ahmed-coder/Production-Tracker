# Render the existing book-and-spark vector mark with native Windows drawing APIs.
# No downloads, AI generation, extra packages or production services are required.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$publicRoot = Join-Path $projectRoot 'frontend/public'
$iconsRoot = Join-Path $publicRoot 'icons'
New-Item -ItemType Directory -Path $iconsRoot -Force | Out-Null
function Write-Icon([int]$size, [string]$output, [single]$artWidth) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#e8f3d6'))
    $scale = $size * $artWidth / 18
    $graphics.TranslateTransform(($size / 2 - 12 * $scale), ($size / 2 - 11 * $scale))
    $graphics.ScaleTransform($scale, $scale)
    $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#19281a'), 2.2)
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $book = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $book.AddBezier(3, 9.5, 6, 8, 9, 8.5, 12, 10)
    $book.AddBezier(12, 10, 15, 8.5, 18, 8, 21, 9.5)
    $book.AddLine(21, 9.5, 21, 18.5)
    $book.AddBezier(21, 18.5, 18, 17, 15, 17.5, 12, 19)
    $book.AddBezier(12, 19, 9, 17.5, 6, 17, 3, 18.5)
    $book.CloseFigure()
    $paper = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(36, 42, 69, 39))
    $graphics.FillPath($paper, $book)
    $graphics.DrawPath($pen, $book)
    $graphics.DrawLine($pen, 12, 10, 12, 19)
    $spark = [System.Drawing.Drawing2D.GraphicsPath]::new()
    [System.Drawing.PointF[]]$points = @(
        [System.Drawing.PointF]::new(12, 2.5), [System.Drawing.PointF]::new(13.8, 5.4),
        [System.Drawing.PointF]::new(17, 6.2), [System.Drawing.PointF]::new(14.7, 8.4),
        [System.Drawing.PointF]::new(15.3, 11.6), [System.Drawing.PointF]::new(12, 9.9),
        [System.Drawing.PointF]::new(8.7, 11.6), [System.Drawing.PointF]::new(9.3, 8.4),
        [System.Drawing.PointF]::new(7, 6.2), [System.Drawing.PointF]::new(10.2, 5.4)
    )
    $spark.AddPolygon($points)
    $lime = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#8db51f'))
    $graphics.FillPath($lime, $spark)
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    $lime.Dispose(); $paper.Dispose(); $spark.Dispose(); $book.Dispose(); $pen.Dispose()
    $graphics.Dispose(); $bitmap.Dispose()
}
Write-Icon 192 (Join-Path $iconsRoot 'icon-192.png') 0.58
Write-Icon 512 (Join-Path $iconsRoot 'icon-512.png') 0.58
Write-Icon 512 (Join-Path $iconsRoot 'maskable-512.png') 0.44
Write-Icon 180 (Join-Path $publicRoot 'apple-touch-icon.png') 0.58
Write-Output 'Generated Android, maskable and iOS icons from the existing brand mark.'
