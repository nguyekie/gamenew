# Trien khai production

## Dieu kien

- VPS Ubuntu co Docker Engine va Docker Compose plugin.
- Domain co ban ghi A/AAAA tro ve VPS.
- Firewall cho phep TCP 80, 443 va cong SSH.

## Cai dat lan dau

```bash
git clone <REPOSITORY_URL> aetherion-strategy
cd aetherion-strategy
cp .env.production.example .env.production
nano .env.production
sh scripts/deploy-production.sh
```

`DOMAIN` khong bao gom `https://`. `POSTGRES_PASSWORD` nen dai it nhat 32 ky tu va chi dung ky tu URL-safe vi gia tri nay duoc chen vao `DATABASE_URL`.

## Kiem tra

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=100
curl https://YOUR_DOMAIN/api/health
```

Caddy tu dong cap va gia han chung chi HTTPS. API dung `/api`; WebSocket realtime dung `/realtime` tren cung domain.

## Cap nhat

```bash
git pull --ff-only
sh scripts/deploy-production.sh
```

## Sao luu PostgreSQL

```bash
set -a; . ./.env.production; set +a
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > aetherion-backup.sql
```

Luu file backup ra khoi VPS. Khong commit `.env.production` hoac file backup vao Git.
