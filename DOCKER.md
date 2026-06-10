# Docker Deployment Guide

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB+ RAM available for containers
- 10GB+ disk space

## Quick Start

### 1. Build and Start All Services

```bash
# Build all images
docker-compose build

# Start all services in detached mode
docker-compose up -d

# View logs
docker-compose logs -f
```

### 2. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Django Admin**: http://localhost:8000/admin

### 3. Create Superuser (First Time Only)

```bash
docker-compose exec backend python manage.py createsuperuser
```

## Services

The application runs 5 containerized services:

| Service | Container Name | Port | Description |
|---------|---------------|------|-------------|
| postgres | stockastic-postgres | 5432 | PostgreSQL 15 database |
| redis | stockastic-redis | 6379 | Redis cache & message broker |
| backend | stockastic-backend | 8000 | Django REST API |
| celery | stockastic-celery | - | Background task worker |
| frontend | stockastic-frontend | 3000 | Next.js web application |

## Common Commands

### Service Management

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart a specific service
docker-compose restart backend

# View service status
docker-compose ps

# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f backend
```

### Database Operations

```bash
# Run migrations
docker-compose exec backend python manage.py migrate

# Create migrations
docker-compose exec backend python manage.py makemigrations

# Access PostgreSQL shell
docker-compose exec postgres psql -U postgres -d stockastic

# Backup database
docker-compose exec postgres pg_dump -U postgres stockastic > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres stockastic < backup.sql
```

### Django Management

```bash
# Access Django shell
docker-compose exec backend python manage.py shell

# Create superuser
docker-compose exec backend python manage.py createsuperuser

# Collect static files
docker-compose exec backend python manage.py collectstatic --noinput

# Run custom management command
docker-compose exec backend python manage.py generate_signals
```

### Container Access

```bash
# Access backend container shell
docker-compose exec backend bash

# Access frontend container shell
docker-compose exec frontend sh

# Access PostgreSQL container
docker-compose exec postgres bash
```

## Data Persistence

Data is persisted in Docker volumes:

- `postgres_data` - PostgreSQL database files
- `redis_data` - Redis persistence files

### Backup Volumes

```bash
# Backup PostgreSQL volume
docker run --rm -v stockastic_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data

# Restore PostgreSQL volume
docker run --rm -v stockastic_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_backup.tar.gz -C /
```

## Development vs Production

### Development Mode (Current Setup)

The current docker-compose.yml is configured for development:
- Hot reload enabled for both frontend and backend
- Source code mounted as volumes
- Debug mode enabled
- Exposed ports for direct access

### Production Deployment

For production, you should:

1. **Use environment-specific compose file:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

2. **Set production environment variables:**
   - `DEBUG=False`
   - Strong `SECRET_KEY`
   - Proper `ALLOWED_HOSTS`
   - Use managed PostgreSQL (RDS, Cloud SQL)

3. **Add reverse proxy (Nginx):**
   - SSL/TLS termination
   - Static file serving
   - Load balancing

4. **Enable health checks and monitoring**

## Migrating from Local Setup

If you have existing data in local PostgreSQL (port 5434):

### 1. Export Local Data

```bash
# Export stockastic database
pg_dump -h localhost -p 5434 -U postgres stockastic > stockastic_backup.sql

# Export stock_market database
pg_dump -h localhost -p 5434 -U postgres stock_market > stock_market_backup.sql
```

### 2. Start Docker Services

```bash
docker-compose up -d postgres
# Wait for PostgreSQL to be ready
sleep 10
```

### 3. Import Data

```bash
# Import stockastic database
docker-compose exec -T postgres psql -U postgres stockastic < stockastic_backup.sql

# Import stock_market database
docker-compose exec -T postgres psql -U postgres stock_market < stock_market_backup.sql
```

### 4. Start Remaining Services

```bash
docker-compose up -d
```

## Troubleshooting

### Port Conflicts

If ports 3000, 5432, 6379, or 8000 are already in use:

```bash
# Find process using port
lsof -ti:3000

# Kill process
lsof -ti:3000 | xargs kill -9

# Or change port in docker-compose.yml
# Example: "3001:3000" instead of "3000:3000"
```

### Database Connection Issues

```bash
# Check if PostgreSQL is ready
docker-compose exec postgres pg_isready -U postgres

# View PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Celery Not Processing Tasks

```bash
# Check Celery logs
docker-compose logs celery

# Verify Redis connection
docker-compose exec backend python -c "import redis; r = redis.Redis(host='redis'); print(r.ping())"

# Restart Celery worker
docker-compose restart celery
```

### Frontend Build Errors

```bash
# Clear Next.js cache
docker-compose exec frontend rm -rf .next

# Rebuild frontend
docker-compose up -d --build frontend
```

### Container Won't Start

```bash
# View detailed logs
docker-compose logs <service-name>

# Check container status
docker-compose ps

# Rebuild specific service
docker-compose up -d --build <service-name>
```

### Out of Disk Space

```bash
# Remove unused Docker resources
docker system prune -a

# Remove specific volumes (WARNING: deletes data)
docker volume rm stockastic_postgres_data
docker volume rm stockastic_redis_data
```

## Cleanup

### Stop and Remove Containers

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose down -v

# Remove all images
docker-compose down --rmi all
```

### Complete Cleanup

```bash
# Remove everything including volumes
docker-compose down -v --rmi all

# Remove orphaned volumes
docker volume prune

# Remove unused networks
docker network prune
```

## Health Checks

All services have health checks configured:

```bash
# Check health status
docker-compose ps

# Services should show "healthy" status
```

## Logs and Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend

# Since specific time
docker-compose logs --since 2024-01-01T00:00:00 backend
```

### Resource Usage

```bash
# View resource usage
docker stats

# View specific container
docker stats stockastic-backend
```

## Environment Variables

Environment variables are loaded from `.env.docker`:

- `POSTGRES_DB` - Database name
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password
- `DB_HOST` - Database host (postgres container)
- `CELERY_BROKER_URL` - Redis URL for Celery
- `SECRET_KEY` - Django secret key
- `DEBUG` - Debug mode (True/False)

## Network

All services communicate through the `stockastic-network` bridge network:

```bash
# Inspect network
docker network inspect stockastic_stockastic-network

# View connected containers
docker network inspect stockastic_stockastic-network | grep Name
```

## Security Notes

> [!WARNING]
> **Production Security**
> 
> Before deploying to production:
> 1. Change all default passwords
> 2. Set `DEBUG=False`
> 3. Use strong `SECRET_KEY`
> 4. Configure proper `ALLOWED_HOSTS`
> 5. Enable HTTPS
> 6. Use secrets management
> 7. Regular security updates

## Backups

The NEPSE price and floorsheet history is the product's core data asset — it cannot be
refetched from any API. Nightly backups are mandatory.

### Automated Nightly Backup

The script `scripts/backup_db.sh` dumps the `stockastic` database, gzips it, writes it to
`backups/`, and prunes files older than 14 days.

**Host crontab (run at 02:00 every night):**

```
0 2 * * * cd /path/to/Stockastic && ./scripts/backup_db.sh >> backups/backup.log 2>&1
```

**Manual run:**

```bash
./scripts/backup_db.sh
```

### Restore from Backup

```bash
gunzip -c backups/<file>.sql.gz | docker-compose exec -T postgres psql -U postgres stockastic
```

Example:

```bash
gunzip -c backups/stockastic-20260610-020001.sql.gz | docker-compose exec -T postgres psql -U postgres stockastic
```

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Verify service health: `docker-compose ps`
3. Review this documentation
4. Check Docker and docker-compose versions
