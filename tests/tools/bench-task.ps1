<#
.SYNOPSIS
Tarea programada "RagdollBench": corre tests/tools/bench-run.js en la sesión interactiva de la consola física, para
dispararla por SSH sin nadie frente a la pantalla.

.DESCRIPTION
Tres usos:
- `-Register`: registra (o vuelve a registrar) la tarea, que corre solo cuando el usuario inició sesión, con privilegios
  elevados, sin disparador propio y sin arrancar con batería.
- `-Issue <n> -Label "<texto>"`: escribe bench-task.json junto al script, que la tarea lee al arrancar.
- Sin parámetros: lo que ejecuta la tarea. Si la sesión no es la de la consola (RDP conectado o desconectado), la pasa
  a la consola con tscon antes de abrir el navegador; después corre bench-run.js con la configuración y deja la salida
  en bench-task.log.

Disparo: `schtasks /run /tn RagdollBench`.
#>
param(
    [switch]$Register,
    [int]$Issue,
    [string]$Label
)

$ErrorActionPreference = "Stop"

$TaskName = "RagdollBench"
$ConfigFile = Join-Path $PSScriptRoot "bench-task.json"
$LogFile = Join-Path $PSScriptRoot "bench-task.log"
$Runner = Join-Path $PSScriptRoot "bench-run.js"
$RepositoryRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ConsoleSettleSeconds = 5
$TaskTimeLimitMinutes = 30

<#
.SYNOPSIS
Agrega una línea con hora al log de la corrida y la muestra.
#>
function Write-BenchLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

<#
.SYNOPSIS
Registra la tarea con la acción de correr este mismo script en modo ejecución.
#>
function Register-BenchTask {
    $shell = Join-Path $PSHOME "pwsh.exe"
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$PSCommandPath`""
    $action = New-ScheduledTaskAction -Execute $shell -Argument $arguments -WorkingDirectory $RepositoryRoot
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes $TaskTimeLimitMinutes)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "Tarea $TaskName registrada. Disparo: schtasks /run /tn $TaskName"
}

<#
.SYNOPSIS
Guarda el issue y el label que leerá la próxima corrida de la tarea.
#>
function Set-BenchConfig {
    if (-not $Issue -or -not $Label) { throw "Faltan -Issue <n> y -Label `"<texto>`"" }
    @{ issue = $Issue; label = $Label } | ConvertTo-Json | Set-Content -Path $ConfigFile
    Write-Host "Configuración guardada en $ConfigFile"
}

<#
.SYNOPSIS
Si este proceso no corre en la sesión de la consola física, la conecta a la consola con tscon.
#>
function Move-SessionToConsole {
    Add-Type -Namespace BenchTask -Name Kernel32 -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint WTSGetActiveConsoleSessionId();'
    $sessionId = (Get-Process -Id $PID).SessionId
    $consoleSessionId = [BenchTask.Kernel32]::WTSGetActiveConsoleSessionId()
    if ($sessionId -eq $consoleSessionId) {
        Write-BenchLog "La sesión $sessionId ya es la de la consola"
        return
    }
    Write-BenchLog "La sesión $sessionId no es la de la consola ($consoleSessionId): tscon $sessionId /dest:console"
    $output = & tscon $sessionId /dest:console 2>&1
    $exitCode = $LASTEXITCODE
    if ($output) { Write-BenchLog "tscon: $output" }
    if ($exitCode -ne 0) { throw "tscon falló con código $exitCode" }
    Start-Sleep -Seconds $ConsoleSettleSeconds
}

<#
.SYNOPSIS
Lo que ejecuta la tarea: lleva la sesión a la consola y corre la medición con la configuración guardada.
#>
function Invoke-BenchRun {
    Set-Content -Path $LogFile -Value ""
    try {
        if (-not (Test-Path $ConfigFile)) { throw "No existe $ConfigFile; correr antes bench-task.ps1 -Issue <n> -Label `"<texto>`"" }
        $config = Get-Content -Raw $ConfigFile | ConvertFrom-Json
        Write-BenchLog "Medición para el issue $($config.issue): $($config.label)"
        Move-SessionToConsole
        Set-Location $RepositoryRoot
        [Console]::OutputEncoding = [Text.Encoding]::UTF8
        & node $Runner --issue $config.issue --label $config.label 2>&1 | ForEach-Object { Write-BenchLog "$_" }
        $exitCode = $LASTEXITCODE
        Write-BenchLog "bench-run.js terminó con código $exitCode"
        exit $exitCode
    } catch {
        Write-BenchLog "ERROR: $($_.Exception.Message)"
        exit 1
    }
}

if ($Register) { Register-BenchTask }
elseif ($Issue -or $Label) { Set-BenchConfig }
else { Invoke-BenchRun }
