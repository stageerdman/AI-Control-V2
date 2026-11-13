#!/bin/sh
# usage: ./shoot.sh <route> <out-name> [WxH]   — headless Chrome screenshot into shots/
cd "$(dirname "$0")"
SIZE=${3:-1440,900}
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size="$SIZE" --virtual-time-budget=2000 --force-prefers-reduced-motion --screenshot="shots/$2.png" \
  "file://$PWD/ai-control-disney-v3.html#$1" 2>/dev/null
