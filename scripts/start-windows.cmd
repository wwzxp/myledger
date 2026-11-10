@echo off
REM ---------------------------------------------------------------
REM ai-ledger launcher (Windows)
REM
REM Fixed config and database; no parameter overrides, so a dev
REM instance can never connect to the production database by accident.
REM   config : %AI_LEDGER_HOME%\ai-ledger.toml
REM   db     : decided by [database] path in that config
REM   listen : 127.0.0.1:8765 (loopback only)
REM
REM Usage:
REM   start-windows.cmd              foreground (logs to console)
REM   start-windows.cmd /background  background
REM
REM Change AI_LEDGER_HOME to relocate the deployment directory.
REM
REM NOTE: keep this file ASCII-only. cmd.exe decodes batch files with
REM the ANSI code page (936 on zh-CN); UTF-8 Chinese comments get
REM mangled and can turn a REM line into an executed command.
REM ---------------------------------------------------------------

setlocal
if "%AI_LEDGER_HOME%"=="" set "AI_LEDGER_HOME=E:\ai\apps\ai-ledger"
set "PY=%AI_LEDGER_HOME%\.venv\Scripts\python.exe"
set "CONFIG=%AI_LEDGER_HOME%\ai-ledger.toml"
set "LOG=%AI_LEDGER_HOME%\run.log"
set "ERRLOG=%AI_LEDGER_HOME%\run.err.log"

if not exist "%PY%" (
  echo [fatal] python not found: %PY%
  exit /b 1
)
if not exist "%CONFIG%" (
  echo [fatal] config not found: %CONFIG%
  exit /b 1
)

cd /d "%AI_LEDGER_HOME%"

REM A second instance cannot bind the port and becomes an orphan.
powershell -NoProfile -Command ^
  "if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo [ledger] already running on 8765
  exit /b 0
)

if /i "%~1"=="/background" goto background

echo [ledger] foreground, config=%CONFIG%
"%PY%" -m app --config "%CONFIG%" dashboard --port 8765 1>>"%LOG%" 2>>"%ERRLOG%"
exit /b %ERRORLEVEL%

:background
echo [ledger] background, config=%CONFIG%
powershell -NoProfile -Command ^
  "Start-Process -FilePath '%PY%' -ArgumentList '-m','app','--config','%CONFIG%','dashboard','--port','8765' -WorkingDirectory '%AI_LEDGER_HOME%' -WindowStyle Hidden -RedirectStandardOutput '%LOG%' -RedirectStandardError '%ERRLOG%'"
echo [ledger] started, http://127.0.0.1:8765
exit /b 0
