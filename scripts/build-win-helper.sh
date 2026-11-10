#!/usr/bin/env bash
# Builds desktop/bin-win/winhelper.exe (C#, .NET Framework 4.7.2, AnyCPU) on macOS or Windows.
# Needs the .NET SDK: `dotnet` on PATH, or DOTNET=/path/to/dotnet.
set -euo pipefail
cd "$(dirname "$0")/.."
DOTNET="${DOTNET:-dotnet}"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
"$DOTNET" build desktop/native/win/winhelper.csproj -c Release -o desktop/native/win/out -p:EnableWindowsTargeting=true --nologo -v quiet
mkdir -p desktop/bin-win
cp desktop/native/win/out/winhelper.exe desktop/native/win/out/winhelper.exe.config desktop/bin-win/
ls -l desktop/bin-win
