param([switch]$Install, [switch]$PrintPath)
$ErrorActionPreference = 'Stop'

function Find-Git {
    $command = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $candidates = @()
    if ($command) { $candidates += $command.Source }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, "$env:LOCALAPPDATA\Programs")) {
        if ($base) { $candidates += Join-Path $base 'Git\cmd\git.exe' }
    }
    foreach ($key in @('HKCU:\SOFTWARE\GitForWindows', 'HKLM:\SOFTWARE\GitForWindows')) {
        $entry = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
        if ($entry.InstallPath) { $candidates += Join-Path $entry.InstallPath 'cmd\git.exe' }
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $version = & $candidate --version 2>$null
            if ($LASTEXITCODE -eq 0 -and $version -match '^git version ') { return $candidate }
        }
    }
    return $null
}

try {
    $gitPath = Find-Git
    if (-not $gitPath -and $Install) {
        $winget = Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue
        if (-not $winget) {
            Write-Host 'No se encontro WinGet. Instala Git desde https://git-scm.com/install/windows y vuelve a abrir el arrancador.'
            exit 1
        }
        Write-Host 'Instalando Git for Windows. Windows puede solicitar autorizacion para instalar.'
        & $winget.Source install --id Git.Git --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
        $installResult = $LASTEXITCODE
        # Localizar la instalacion nueva aunque esta ventana conserve el PATH anterior.
        $gitPath = Find-Git
        if (-not $gitPath) {
            Write-Host "No se pudo localizar Git tras la instalacion (codigo $installResult)."
            Write-Host 'Instalacion oficial: https://git-scm.com/install/windows'
            exit 1
        }
    }
    if (-not $gitPath) { exit 2 }
    if ($PrintPath) { Write-Output $gitPath }
    else { Write-Host "Git listo: $gitPath" }
    exit 0
} catch {
    [Console]::Error.WriteLine("No se pudo preparar Git: $($_.Exception.Message)")
    exit 1
}
