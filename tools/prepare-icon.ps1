$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = [Drawing.Image]::FromFile((Join-Path $projectRoot 'pic/icon.png'))
try {
    $entries = @()
    foreach ($size in @(16,24,32,48,64,128,256)) {
        $bitmap = New-Object Drawing.Bitmap($size,$size)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($source,0,0,$size,$size)
            $stream = New-Object IO.MemoryStream
            try {
                $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
                $entries += @{ Size=$size; Bytes=$stream.ToArray() }
            } finally { $stream.Dispose() }
            if ($size -eq 64) {
                $rgba = New-Object byte[] ($size*$size*4)
                for ($y=0; $y -lt $size; $y++) {
                    for ($x=0; $x -lt $size; $x++) {
                        $pixel=$bitmap.GetPixel($x,$y); $offset=($y*$size+$x)*4
                        $rgba[$offset]=$pixel.R; $rgba[$offset+1]=$pixel.G
                        $rgba[$offset+2]=$pixel.B; $rgba[$offset+3]=$pixel.A
                    }
                }
                [IO.File]::WriteAllBytes((Join-Path $projectRoot 'pic/icon.rgba'),$rgba)
            }
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
    $file = [IO.File]::Create((Join-Path $projectRoot 'pic/icon.ico'))
    $writer = New-Object IO.BinaryWriter($file)
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$entries.Count)
        $offset=6+16*$entries.Count
        foreach ($entry in $entries) {
            $dimension=if($entry.Size -eq 256){0}else{$entry.Size}
            $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$entry.Bytes.Length); $writer.Write([uint32]$offset)
            $offset += $entry.Bytes.Length
        }
        foreach ($entry in $entries) { $writer.Write([byte[]]$entry.Bytes) }
    } finally { $writer.Dispose(); $file.Dispose() }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'pic/icon.png') -Destination (Join-Path $projectRoot 'ui/app-icon.png') -Force
} finally { $source.Dispose() }
