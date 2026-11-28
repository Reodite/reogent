#!/bin/bash
set -eu

if [ -z "${MONGO_INITDB_ROOT_USERNAME:-}" ] || [ -z "${MONGO_INITDB_ROOT_PASSWORD:-}" ]; then
  echo "MONGO_INITDB_ROOT_USERNAME and MONGO_INITDB_ROOT_PASSWORD are required" >&2
  exit 1
fi
if [ -z "${MONGODB_APP_USERNAME:-}" ] || [ -z "${MONGODB_APP_PASSWORD:-}" ]; then
  echo "MONGODB_APP_USERNAME and MONGODB_APP_PASSWORD are required" >&2
  exit 1
fi
if ! [[ "$MONGODB_APP_USERNAME" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "MONGODB_APP_USERNAME must use URI-safe characters" >&2
  exit 1
fi
if ! [[ "$MONGODB_APP_PASSWORD" =~ ^[A-Fa-f0-9]+$ ]]; then
  echo "MONGODB_APP_PASSWORD must be hexadecimal for Mongo URI interpolation" >&2
  exit 1
fi

username="$(printf '%s' "$MONGODB_APP_USERNAME" | jq -Rs .)"
password="$(printf '%s' "$MONGODB_APP_PASSWORD" | jq -Rs .)"

mongosh --quiet reodite --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.createUser({user: $username, pwd: $password, roles: [{role: 'readWrite', db: 'reodite'}]})"

if [ -n "${MONGODB_TEST_USERNAME:-}" ] && [ -n "${MONGODB_TEST_PASSWORD:-}" ]; then
  testUsername="$(printf '%s' "$MONGODB_TEST_USERNAME" | jq -Rs .)"
  testPassword="$(printf '%s' "$MONGODB_TEST_PASSWORD" | jq -Rs .)"
  mongosh --quiet reodite --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.createUser({user: $testUsername, pwd: $testPassword, roles: [{role: 'readWrite', db: 'reodite_test'}]})"
fi
