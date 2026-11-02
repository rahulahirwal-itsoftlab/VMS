@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM ITSOFTLAB360 / HRMSM Deployment Script
REM ============================================================

REM ================================
REM CHANGE VERSION ONLY HERE
REM ================================
set VERSION=1.0.7

REM ============================================================
REM ANSI COLOR CODES
REM ============================================================

for /F %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

set "RESET=%ESC%[0m"

set "RED=%ESC%[91m"
set "GREEN=%ESC%[92m"
set "YELLOW=%ESC%[93m"
set "BLUE=%ESC%[94m"
set "MAGENTA=%ESC%[95m"
set "CYAN=%ESC%[96m"
set "WHITE=%ESC%[97m"


REM ============================================================
REM HEADER
REM ============================================================

echo.
echo %CYAN%============================================================%RESET%
echo %GREEN%           DEPLOYMENT SCRIPT%RESET%
echo %CYAN%============================================================%RESET%
echo.
echo %YELLOW%Version:%RESET% %GREEN%v%VERSION%%RESET%
echo.


REM ============================================================
REM GIT ADD
REM ============================================================

echo %BLUE%[1/5]%RESET% %CYAN%Adding files...%RESET%

git add .

if errorlevel 1 (
    echo.
    echo %RED%ERROR: Git add failed!%RESET%
    exit /b 1
)

echo %GREEN%SUCCESS: Files added.%RESET%
echo.


REM ============================================================
REM GIT COMMIT
REM ============================================================

echo %BLUE%[2/5]%RESET% %CYAN%Creating commit...%RESET%

git commit -m "commit-v%VERSION%"

if errorlevel 1 (
    echo.
    echo %RED%ERROR: Git commit failed!%RESET%
    exit /b 1
)

echo %GREEN%SUCCESS: Commit created.%RESET%
echo.


REM ============================================================
REM PUSH MAIN
REM ============================================================

echo %BLUE%[3/5]%RESET% %CYAN%Pushing code to main...%RESET%

git push origin main

if errorlevel 1 (
    echo.
    echo %RED%ERROR: Git push failed!%RESET%
    exit /b 1
)

echo %GREEN%SUCCESS: Code pushed to main.%RESET%
echo.


REM ============================================================
REM CREATE TAG
REM ============================================================

echo %BLUE%[4/5]%RESET% %CYAN%Creating release tag...%RESET%

git tag -a v%VERSION% -m "Production release v%VERSION%"

if errorlevel 1 (
    echo.
    echo %RED%ERROR: Git tag creation failed!%RESET%
    exit /b 1
)

echo %GREEN%SUCCESS: Tag v%VERSION% created.%RESET%
echo.


REM ============================================================
REM PUSH TAG
REM ============================================================

echo %BLUE%[5/5]%RESET% %CYAN%Pushing release tag...%RESET%

git push origin v%VERSION%

if errorlevel 1 (
    echo.
    echo %RED%ERROR: Tag push failed!%RESET%
    exit /b 1
)

echo %GREEN%SUCCESS: Tag pushed successfully.%RESET%
echo.


REM ============================================================
REM SUCCESS
REM ============================================================

echo %GREEN%============================================================%RESET%
echo %GREEN%             DEPLOYMENT COMPLETED SUCCESSFULLY!%RESET%
echo %GREEN%============================================================%RESET%

echo.
echo %YELLOW%Released Version:%RESET% %GREEN%v%VERSION%%RESET%