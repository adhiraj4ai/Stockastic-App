# Frontend Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Backend API running on port 8000

## Initial Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the frontend directory:

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ML_SERVICE_URL=http://localhost:8001
```

**Note**: All environment variables accessible in the browser must be prefixed with `NEXT_PUBLIC_`

### 3. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Available Scripts

```bash
# Development server with hot reload
npm run dev

# Production build
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Environment Variables

### `NEXT_PUBLIC_API_URL`
- **Default**: `http://localhost:8000`
- **Description**: Backend Django API URL
- **Used in**: All API calls via `src/lib/api.ts`

### `NEXT_PUBLIC_ML_SERVICE_URL`
- **Default**: `http://localhost:8001`
- **Description**: ML Service API URL (if using separate service)
- **Used in**: Forecast-related API calls

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js app directory (routes)
│   │   ├── (authenticated)/    # Protected routes
│   │   │   ├── dashboard/
│   │   │   ├── portfolio/
│   │   │   ├── signals/
│   │   │   ├── strategies/
│   │   │   └── ...
│   │   └── login/              # Public routes
│   ├── components/             # Reusable React components
│   └── lib/                    # Utilities and API client
│       └── api.ts              # Axios API client
├── public/                     # Static assets
└── package.json
```

## Key Dependencies

- **Next.js 16**: React framework with App Router
- **React 19**: UI library
- **Tailwind CSS 4**: Styling
- **shadcn/ui**: UI component library
- **Axios**: HTTP client
- **ECharts**: Data visualization
- **Recharts**: Additional charting
- **Monaco Editor**: Code editor for strategies
- **Sonner**: Toast notifications

## API Integration

The frontend communicates with the backend via the Axios client in `src/lib/api.ts`:

```typescript
// Example API call
import api from '@/lib/api';

const response = await api.get('/api/stocks/signals/');
```

## Authentication

- Uses JWT tokens stored in cookies
- Protected routes are wrapped in authentication checks
- Login page redirects to dashboard on success

## Development Tips

### Hot Reload
Next.js automatically reloads when you save changes to files.

### API Errors
Check the browser console and Network tab for API errors. Ensure the backend is running on port 8000.

### CORS Issues
If you see CORS errors, verify:
1. Backend is running
2. `CORS_ALLOWED_ORIGINS` in backend includes `http://localhost:3000`
3. `NEXT_PUBLIC_API_URL` is set correctly

## Building for Production

```bash
# Create optimized production build
npm run build

# Start production server
npm start
```

The production build will be created in the `.next` directory.

## Troubleshooting

### Port Already in Use
If port 3000 is already in use:
```bash
# Kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Or run on a different port
PORT=3001 npm run dev
```

### Module Not Found
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Build Errors
```bash
# Clear Next.js cache
rm -rf .next
npm run build
```
