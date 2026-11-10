@echo off
REM Stop the ai-ledger process listening on 8765 (matched by port,
REM so unrelated python processes are never killed).
REM Keep this file ASCII-only; see start-windows.cmd for the reason.
setlocal
powershell -NoProfile -Command ^
  "$c = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue; if (-not $c) { Write-Output '[ledger] nothing listening on 8765'; exit 0 }; foreach ($x in $c) { $p = Get-Process -Id $x.OwningProcess -ErrorAction SilentlyContinue; if ($p) { Write-Output ('[ledger] stopping PID ' + $p.Id); Stop-Process -Id $p.Id -Force } }; Start-Sleep -Seconds 1; $after = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue; if ($after) { Write-Output '[ledger] still listening' } else { Write-Output '[ledger] stopped' }"
exit /b 0
