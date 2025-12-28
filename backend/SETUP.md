# Backend Setup Guide

## Prerequisites

- Python 3.14+
- PostgreSQL (running on port 5434)
- Redis server

## Initial Setup

### 1. Create Virtual Environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual values
# At minimum, update:
# - POSTGRES_PASSWORD
# - SECRET_KEY (for production)
```

### 4. Database Setup

Make sure PostgreSQL is running and create the required databases:

```sql
CREATE DATABASE stockastic;
CREATE DATABASE stock_market;
```

Run migrations:

```bash
python manage.py migrate
```

### 5. Start Redis

```bash
# Check if Redis is running
redis-cli ping  # Should return PONG

# If not running, start it:
redis-server
# or
brew services start redis  # macOS with Homebrew
```

### 6. Start Celery Worker

In a separate terminal:

```bash
cd backend
source venv/bin/activate
celery -A stockastic worker --loglevel=info
```

### 7. Start Django Development Server

```bash
python manage.py runserver
```

## Running Services

You need **3 terminals** running simultaneously:

1. **Django Server**: `python manage.py runserver`
2. **Celery Worker**: `celery -A stockastic worker --loglevel=info`
3. **Redis Server**: `redis-server` (or run as background service)

## Common Commands

### Database

```bash
# Create migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser
```

### Data Pipeline

```bash
# Update technical indicators
python manage.py update_technical_indicators

# Generate signals
python manage.py generate_signals

# Optimize strategies
python manage.py optimize_strategies --trials 30
```

### Celery

```bash
# Run worker
celery -A stockastic worker --loglevel=info

# Run with autoreload (development)
celery -A stockastic worker --loglevel=info --autoreload

# Run in background
celery -A stockastic worker --loglevel=info --detach
```

## Troubleshooting

### Missing Dependencies

If you get `ModuleNotFoundError`, install the missing package:

```bash
pip install django-filter  # Example
pip install redis
```

### Database Connection Issues

- Verify PostgreSQL is running on port 5434
- Check credentials in `.env`
- Ensure databases exist

### Celery Connection Issues

- Verify Redis is running: `redis-cli ping`
- Check `CELERY_BROKER_URL` in `.env`

## Environment Variables

See `.env.example` for all available configuration options.
