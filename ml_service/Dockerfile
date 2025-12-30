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
ENV DJANGO_SETTINGS_MODULE=ml_service.settings

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies using uv (much faster than pip)
RUN uv pip install --system --no-cache -r requirements.txt

# Install ML-specific dependencies
RUN uv pip install --system --no-cache \
    scikit-learn \
    tensorflow \
    prophet \
    optuna \
    joblib \
    pandas-ta

# Copy application code
COPY . .

# Expose port
EXPOSE 8001

# Default command (can be overridden in docker-compose)
CMD ["python", "manage.py", "runserver", "0.0.0.0:8001"]
