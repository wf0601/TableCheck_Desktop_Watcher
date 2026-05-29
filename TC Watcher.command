#!/usr/bin/env bash
# Double-click this on your Desktop to launch the menubar app.
# To put it on your Desktop: drag-copy this file to ~/Desktop.
set -e
cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE
exec npm run ui
