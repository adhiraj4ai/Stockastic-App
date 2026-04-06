FROM python:3.12-slim

WORKDIR /app

# Install system dependencies, build tools for TA-Lib, and uv
RUN apt-get update && apt-get install -y \
    postgresql-client \
    gcc \
    python3-dev \
    curl \
    ca-certificates \
    build-essential \
    wget \
    autotools-dev \
    && rm -rf /var/lib/apt/lists/*

# Install TA-Lib C library (Required for Python TA-Lib)
# We update config.guess and config.sub to support modern architectures like aarch64
RUN wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz && \
    tar -xzf ta-lib-0.4.0-src.tar.gz && \
    cp /usr/share/misc/config.guess ./ta-lib/config.guess && \
    cp /usr/share/misc/config.sub ./ta-lib/config.sub && \
    cd ta-lib/ && \
    ./configure --prefix=/usr && \
    make && \
    make install && \
    cd .. && \
    rm -rf ta-lib ta-lib-0.4.0-src.tar.gz

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

# Copy entrypoint script
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Expose port
EXPOSE 8000

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]

# Default command
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]


