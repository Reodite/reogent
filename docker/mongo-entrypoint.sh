#!/bin/bash
set -eu

keyFile=/data/db/.keyfile
if [ ! -s "$keyFile" ]; then
  umask 077
  openssl rand -base64 756 > "$keyFile.tmp"
  chown mongodb:mongodb "$keyFile.tmp"
  chmod 400 "$keyFile.tmp"
  mv "$keyFile.tmp" "$keyFile"
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
