#!/bin/sh
# usage: ./checkjs.sh <route>  — dump console errors (Uncaught / Error) for a route
cd "$(dirname "$0")"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --enable-logging=stderr --v=0 \
  --virtual-time-budget=1500 --dump-dom "file://$PWD/ai-control-disney-v3.html#$1" 2>&1 >/dev/null | grep -E "CONSOLE|Uncaught" | head -20
