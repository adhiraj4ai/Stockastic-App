import axios from 'axios';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
});

// Helper to clear session
const logoutAndRedirect = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    // Clear cookies
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';

    // Force redirect to login
    window.location.href = '/login';
};

// Request interceptor for auth token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor for global error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response ? error.response.status : null;
        const detail = error.response?.data?.detail;

        // Check for 401 or specific invalid token error messages
        if (status === 401 || (detail && detail.includes('token not valid'))) {
            console.error('Session expired or invalid token. Logging out...');
            logoutAndRedirect();
        }

        return Promise.reject(error);
    }
);

export default api;
