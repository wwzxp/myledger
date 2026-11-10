@echo off
REM ---------------------------------------------------------------
REM myledger public tunnel (Cloudflare Tunnel, token mode)
REM
REM The tunnel token lives in tunnel-token.txt and is passed with
REM --token-file, never on the command line: an inline --token shows
REM up in the process list and in any crash dump.
REM
REM Keep this file ASCII-only (cmd.exe reads it with the ANSI code
REM page; UTF-8 Chinese comments can corrupt the script).
REM ---------------------------------------------------------------

setlocal
if "%AI_LEDGER_HOME%"=="" set "AI_LEDGER_HOME=E:\ai\apps\ai-ledger"
set "CF=E:\ai\tools\cloudflared\cloudflared.exe"
set "TOKEN_FILE=%AI_LEDGER_HOME%\tunnel-token.txt"
set "LOG=%AI_LEDGER_HOME%\cloudflared.log"
set "ERRLOG=%AI_LEDGER_HOME%\cloudflared.err.log"

if not exist "%CF%" (
  echo [fatal] cloudflared not found: %CF%
  exit /b 1
)
if not exist "%TOKEN_FILE%" (
  echo [fatal] token file not found: %TOKEN_FILE%
  exit /b 1
)

REM A second cloudflared would register duplicate connections.
powershell -NoProfile -Command ^
  "if (Get-Process cloudflared -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo [tunnel] cloudflared already running
  exit /b 0
)

echo [tunnel] starting, token=%TOKEN_FILE%
powershell -NoProfile -Command ^
  "Start-Process -FilePath '%CF%' -ArgumentList 'tunnel','--no-autoupdate','--loglevel','info','run','--token-file','%TOKEN_FILE%' -WorkingDirectory '%AI_LEDGER_HOME%' -WindowStyle Hidden -RedirectStandardOutput '%LOG%' -RedirectStandardError '%ERRLOG%'"
echo [tunnel] started, see %ERRLOG%
exit /b 0
