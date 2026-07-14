#!/usr/bin/env sh
set -eu

if [ ! -f .env.production ]; then
  echo "Missing .env.production. Copy .env.production.example and fill in real values."
  exit 1
fi

docker compose --env-file .env.production -f docker-compose.prod.yml config >/dev/null
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose --env-file .env.production -f docker-compose.prod.yml ps
