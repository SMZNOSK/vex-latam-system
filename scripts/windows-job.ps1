param(
    [string]$Script = 'scripts/start.js',
    [switch]$TestServer
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VexJob {
    [StructLayout(LayoutKind.Sequential)] public struct BasicLimits {
        public Int64 PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public UInt32 LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public UInt32 ActiveProcessLimit;
        public UIntPtr Affinity;
        public UInt32 PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] public struct IoCounters {
        public UInt64 ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public UInt64 ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)] public struct ExtendedLimits {
        public BasicLimits BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
}
'@
$job = [VexJob]::CreateJobObject([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) { throw 'No se pudo crear el control de procesos de Windows.' }
$child = $null
$gate = Join-Path ([IO.Path]::GetTempPath()) ('vex-job-' + [guid]::NewGuid().ToString('N') + '.ready')
try {
    $limits = New-Object VexJob+ExtendedLimits
    $basic = $limits.BasicLimitInformation
    $basic.LimitFlags = 0x2000 # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    $limits.BasicLimitInformation = $basic
    $size = [Runtime.InteropServices.Marshal]::SizeOf($limits)
    $memory = [Runtime.InteropServices.Marshal]::AllocHGlobal($size)
    try {
        [Runtime.InteropServices.Marshal]::StructureToPtr($limits, $memory, $false)
        if (-not [VexJob]::SetInformationJobObject($job, 9, $memory, $size)) { throw 'No se pudo configurar el control de procesos.' }
    } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($memory) }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $env:VEX_JOB_GATE = $gate
    $bootstrap = Join-Path $PSScriptRoot 'job-bootstrap.js'
    $childArgs = @('--env-file=.env', ('"' + $bootstrap + '"'), ('"' + $Script.Replace('"', '') + '"'))
    if ($TestServer) { $childArgs += '--test' }
    $child = Start-Process -FilePath $node -ArgumentList $childArgs -NoNewWindow -PassThru
    if (-not [VexJob]::AssignProcessToJobObject($job, $child.Handle)) {
        Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
        throw 'No se pudo asociar el bot al control de procesos. No se iniciara sin proteccion.'
    }
    [IO.File]::WriteAllText($gate, 'ready')
    $child.WaitForExit()
    exit $child.ExitCode
} finally {
    [void][VexJob]::CloseHandle($job)
    Remove-Item -LiteralPath $gate -Force -ErrorAction SilentlyContinue
}
