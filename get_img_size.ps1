Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("c:\Users\LTC\Documents\A\RPGame\public\assets\green-portal.png")
Write-Host "Width:" $img.Width "Height:" $img.Height
$img.Dispose()
