[CmdletBinding()]
param(
  [string]$Version = "0.0.0",
  [string]$IdentityName = "com.relayclient.relay",
  [string]$Publisher = "CN=Relay Client",
  [string]$PublisherDisplayName = "Relay Client",
  [string]$DisplayName = "Relay",
  [string]$Description = "Cross-platform desktop API client",
  [string]$ExecutablePath = "build/bin/relay.exe",
  [string]$IconPath = "build/appicon.png",
  [string]$OutputPath = "",
  [string]$CertificatePath = "",
  [string]$CertificatePassword = "",
  [string]$TimestampUrl = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$DesktopRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "../..")).Path

function Resolve-DesktopPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return $Path
  }

  return (Join-Path $DesktopRoot $Path)
}

function ConvertTo-MsixVersion {
  param([Parameter(Mandatory = $true)][string]$InputVersion)

  $match = [regex]::Match($InputVersion, '(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?')
  if (-not $match.Success) {
    return "0.0.0.0"
  }

  $parts = @()
  for ($i = 1; $i -le 4; $i++) {
    $value = $match.Groups[$i].Value
    if ([string]::IsNullOrWhiteSpace($value)) {
      $parts += 0
      continue
    }

    $number = [int]$value
    if ($number -gt 65535) {
      throw "MSIX version component '$number' is out of range. Each component must be <= 65535."
    }
    $parts += $number
  }

  return ($parts -join ".")
}

function Resolve-WindowsSdkTool {
  param([Parameter(Mandatory = $true)][string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $roots = @()
  $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if ($programFilesX86) {
    $roots += (Join-Path $programFilesX86 "Windows Kits\10\bin")
  }
  if ($env:ProgramFiles) {
    $roots += (Join-Path $env:ProgramFiles "Windows Kits\10\bin")
  }

  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) {
      continue
    }

    $candidate = Get-ChildItem -LiteralPath $root -Recurse -Filter $Name -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '\\x64\\' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1

    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw "$Name was not found. Install the Windows SDK or add its x64 bin directory to PATH."
}

function Escape-Xml {
  param([AllowNull()][string]$Value)
  return [System.Security.SecurityElement]::Escape($Value)
}

function New-LogoAsset {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][int]$Size
  )

  Add-Type -AssemblyName System.Drawing

  $source = [System.Drawing.Image]::FromFile($SourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

      $scale = [Math]::Min($Size / $source.Width, $Size / $source.Height)
      $width = [int][Math]::Round($source.Width * $scale)
      $height = [int][Math]::Round($source.Height * $scale)
      $left = [int][Math]::Floor(($Size - $width) / 2)
      $top = [int][Math]::Floor(($Size - $height) / 2)

      $graphics.DrawImage($source, $left, $top, $width, $height)
      $bitmap.Save($DestinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

$msixVersion = ConvertTo-MsixVersion $Version
$executable = Resolve-DesktopPath $ExecutablePath
$icon = Resolve-DesktopPath $IconPath

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Windows executable was not found: $executable. Run 'wails build -platform windows/amd64 -nsis' first."
}
if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) {
  throw "Application icon was not found: $icon."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = "build/bin/relay-$msixVersion-windows-amd64.msix"
}
$output = Resolve-DesktopPath $OutputPath
$outputDir = Split-Path -Parent $output
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$stageRoot = Join-Path $DesktopRoot "build/msix/Relay"
$assetsDir = Join-Path $stageRoot "Assets"
if (Test-Path -LiteralPath $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

$exeName = Split-Path -Leaf $executable
Copy-Item -LiteralPath $executable -Destination (Join-Path $stageRoot $exeName) -Force

$binaryDir = Split-Path -Parent $executable
Get-ChildItem -LiteralPath $binaryDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -eq ".dll" } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $stageRoot -Force }

New-LogoAsset -SourcePath $icon -DestinationPath (Join-Path $assetsDir "Square44x44Logo.png") -Size 44
New-LogoAsset -SourcePath $icon -DestinationPath (Join-Path $assetsDir "Square150x150Logo.png") -Size 150
New-LogoAsset -SourcePath $icon -DestinationPath (Join-Path $assetsDir "StoreLogo.png") -Size 50

$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="$(Escape-Xml $IdentityName)" Publisher="$(Escape-Xml $Publisher)" Version="$msixVersion" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>$(Escape-Xml $DisplayName)</DisplayName>
    <PublisherDisplayName>$(Escape-Xml $PublisherDisplayName)</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application Id="Relay" Executable="$(Escape-Xml $exeName)" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="$(Escape-Xml $DisplayName)" Description="$(Escape-Xml $Description)" BackgroundColor="transparent" Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png" />
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient" />
    <Capability Name="privateNetworkClientServer" />
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@

Set-Content -LiteralPath (Join-Path $stageRoot "AppxManifest.xml") -Value $manifest -Encoding UTF8

$makeappx = Resolve-WindowsSdkTool "makeappx.exe"
& $makeappx pack /d $stageRoot /p $output /overwrite
if ($LASTEXITCODE -ne 0) {
  throw "makeappx failed with exit code $LASTEXITCODE."
}

if (-not [string]::IsNullOrWhiteSpace($CertificatePath)) {
  $cert = Resolve-DesktopPath $CertificatePath
  if (-not (Test-Path -LiteralPath $cert -PathType Leaf)) {
    throw "MSIX signing certificate was not found: $cert."
  }

  $signtool = Resolve-WindowsSdkTool "signtool.exe"
  $signArgs = @("sign", "/fd", "SHA256", "/f", $cert)
  if (-not [string]::IsNullOrWhiteSpace($CertificatePassword)) {
    $signArgs += @("/p", $CertificatePassword)
  }
  if (-not [string]::IsNullOrWhiteSpace($TimestampUrl)) {
    $signArgs += @("/tr", $TimestampUrl, "/td", "SHA256")
  }
  $signArgs += $output

  & $signtool @signArgs
  if ($LASTEXITCODE -ne 0) {
    throw "signtool failed with exit code $LASTEXITCODE."
  }
} else {
  Write-Warning "MSIX package was created unsigned. Pass -CertificatePath to sign an installable release package."
}

Write-Host "MSIX package: $output"
