FROM python:3.12-slim

WORKDIR /app

# Install system dependencies and uv
RUN apt-get update && apt-get install -y \
    postgresql-client \
    gcc \
    python3-dev \
    musl-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=stockastic.settings

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies using uv (much faster than pip)
RUN uv pip install --system --no-cache -r requirements.txt

# Install additional dependencies that might be missing
RUN uv pip install --system --no-cache \
    django-filter \
    redis \
    celery[redis]

# Copy application code
COPY . .

# Make init script executable
RUN chmod +x /app/init-db.sh || true

# Expose port
EXPOSE 8000

# Default command (can be overridden in docker-compose)
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]


