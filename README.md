# Stockastic - Stock Market Analysis Platform

A comprehensive stock market analysis platform for NEPSE (Nepal Stock Exchange) with strategy backtesting, signal generation, portfolio management, and ML-powered forecasting.

## Project Structure

```
Stockastic/
├── backend/          # Django REST API
├── frontend/         # Next.js web application
└── ml_service/       # Separate ML service (optional)
```

## Quick Start

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
python manage.py migrate

# Start Redis (required for Celery)
redis-server

# Start Celery worker (in a new terminal)
celery -A stockastic worker --loglevel=info

# Start Django server
python manage.py runserver
```

See [backend/SETUP.md](backend/SETUP.md) for detailed instructions.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
# Create .env.local with:
# NEXT_PUBLIC_API_URL=http://localhost:8000

# Start development server
npm run dev
```

See [frontend/SETUP.md](frontend/SETUP.md) for detailed instructions.

## Docker Deployment (Recommended)

The easiest way to run the entire stack is using Docker:

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Create superuser (first time only)
docker-compose exec backend python manage.py createsuperuser
```

Access the application at: `http://localhost:3000`

**Services included:**
- PostgreSQL 15 (port 5432)
- Redis 7 (port 6379)
- Django Backend (port 8000)
- Celery Worker
- Next.js Frontend (port 3000)

See [DOCKER.md](DOCKER.md) for comprehensive Docker documentation.

## Running the Application (Local Development)

You need **4 services** running simultaneously:

1. **PostgreSQL** (port 5434)
2. **Redis** (port 6379)
3. **Django Backend** (port 8000)
   ```bash
   cd backend && source venv/bin/activate && python manage.py runserver
   ```
4. **Celery Worker** (background tasks)
   ```bash
   cd backend && source venv/bin/activate && celery -A stockastic worker --loglevel=info
   ```
5. **Next.js Frontend** (port 3000)
   ```bash
   cd frontend && npm run dev
   ```

Access the application at: `http://localhost:3000`

## Key Features

### 📊 Strategy Management
- Create and backtest trading strategies using Python code
- Optimize strategies with hyperparameter tuning
- View performance metrics and equity curves

### 📈 Signal Generation
- Automated BUY/SELL signal generation
- Signal tracking with NEPSE compliance (3-day minimum holding)
- Strategy effectiveness analysis

### 💼 Portfolio Management
- Track multiple broker accounts
- Real-time portfolio valuation
- Transaction history and P&L tracking

### 🤖 ML Forecasting
- LSTM and Prophet forecasting models
- Hyperparameter optimization
- Forecast visualization and analysis

### 📉 Technical Analysis
- 50+ technical indicators
- Custom indicator combinations
- Real-time indicator updates

### 🔄 Data Pipeline
- Automated data synchronization
- Floorsheet data processing
- Price history management

## Technology Stack

### Backend
- **Django 5.2** - Web framework
- **Django REST Framework** - API
- **PostgreSQL** - Database
- **Celery** - Task queue
- **Redis** - Message broker
- **Pandas/NumPy** - Data processing
- **scikit-learn** - ML models
- **Prophet/LSTM** - Forecasting

### Frontend
- **Next.js 16** - React framework
- **React 19** - UI library
- **Tailwind CSS 4** - Styling
- **shadcn/ui** - Component library
- **ECharts/Recharts** - Visualization
- **Axios** - HTTP client

## Environment Configuration

### Backend (.env)
```bash
# Database
POSTGRES_DB=stockastic
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5434

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ML_SERVICE_URL=http://localhost:8001
```

## Common Commands

### Backend
```bash
# Update technical indicators
python manage.py update_technical_indicators

# Generate signals
python manage.py generate_signals

# Optimize strategies
python manage.py optimize_strategies --trials 30
```

### Frontend
```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

## Documentation

- [Docker Deployment Guide](DOCKER.md) ⭐ **Recommended**
- [Backend Setup Guide](backend/SETUP.md)
- [Frontend Setup Guide](frontend/SETUP.md)
- [Backend Environment Config](backend/.env.example)
- [Frontend Environment Config](frontend/ENV_TEMPLATE.md)

## Troubleshooting

### Backend Issues
- **Database connection**: Verify PostgreSQL is running on port 5434
- **Celery errors**: Ensure Redis is running (`redis-cli ping`)
- **Missing modules**: Install with `pip install <package>`

### Frontend Issues
- **API errors**: Check backend is running on port 8000
- **CORS errors**: Verify CORS settings in backend
- **Port in use**: Kill process with `lsof -ti:3000 | xargs kill -9`

## License

Private project - All rights reserved
