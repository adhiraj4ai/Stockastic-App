import axios from 'axios';
import Cookies from 'js-cookie';
import type { SavedAnalysis, SavedAnalysisDraft } from '@/components/chat/types';

const getApiBaseUrl = () => {
    const url = process.env.NEXT_PUBLIC_API_URL;
    if (!url || url === '/') return 'http://localhost:8000';
    return url;
};

export const API_BASE_URL = getApiBaseUrl();
const ML_SERVICE_URL = process.env.NEXT_PUBLIC_ML_SERVICE_URL || 'http://localhost:8001';

// Main backend API client
const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    xsrfCookieName: 'csrftoken',
    xsrfHeaderName: 'X-CSRFToken',
    withXSRFToken: true,
});

// ML service API client
export const mlApi = axios.create({
    baseURL: ML_SERVICE_URL,
    withCredentials: true,
    xsrfCookieName: 'csrftoken',
    xsrfHeaderName: 'X-CSRFToken',
    withXSRFToken: true,
});

// Helper to clear session
const logoutAndRedirect = async () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    // The auth tokens live in HttpOnly cookies, which JS cannot delete. Only the
    // server can expire them (via Set-Cookie). Without this call the refresh_token
    // survives, so the route middleware — which only checks the JWT exp, not
    // backend validity — keeps treating the session as live and bounces
    // /login → /market forever, hammering /api/auth/token/refresh/ into a 429 loop.
    try {
        await axios.post(
            `${API_BASE_URL}/api/auth/logout/`,
            {},
            { withCredentials: true, headers: { 'X-CSRFToken': Cookies.get('csrftoken') || '' } },
        );
    } catch {
        // Offline or throttled: still redirect. A stale cookie is better than
        // trapping the user on a broken page.
    }

    // Best-effort clear of any non-HttpOnly cookies wrongly written in the past.
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';

    window.location.href = '/login';
};

// Request interceptor: The browser now handles the access_token cookie automatically 
// via withCredentials: true. No manual Authorization header injection is needed.
const addAuthInterceptor = (client: typeof api) => {
    client.interceptors.request.use(
        (config) => config,
        (error) => Promise.reject(error)
    );
};

// Apply interceptors to both API clients
addAuthInterceptor(api);
addAuthInterceptor(mlApi);

let isRefreshing = false;
let failedQueue: Array<{
    resolve: (value?: any) => void;
    reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve();
        }
    });
    failedQueue = [];
};

const refreshAccessToken = async () => {
    try {
        console.log('Attempting to refresh access token via HttpOnly cookies...');
        await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {}, { withCredentials: true });
        processQueue(null);
    } catch (refreshError) {
        processQueue(refreshError);
        console.error('Session expired or refresh failed. Logging out...');
        await logoutAndRedirect();
        throw refreshError;
    } finally {
        isRefreshing = false;
    }
};

const handleNetworkError = async (error: any) => {
    if (error.code !== 'ERR_NETWORK' && error.response) {
        return;
    }
    console.error('Terminal backend connection error. Verifying system status...');
    if (typeof window === 'undefined') {
        return;
    }
    try {
        const healthUrl = API_BASE_URL + '/api/stocks/health-check/';
        const healthCheck = await axios.get(healthUrl, { timeout: 2000, withCredentials: true });
        if (healthCheck.data.status === 'online') {
            console.log('Backend is reachable. Treating previous error as transient.');
            window.dispatchEvent(new CustomEvent('terminal-online'));
        } else {
            window.dispatchEvent(new CustomEvent('terminal-offline'));
        }
    } catch (healthErr) {
        console.error('Health check failed. Signaling system offline.');
        window.dispatchEvent(new CustomEvent('terminal-offline'));
    }
};

// Response interceptor for global error handling and JWT refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response ? error.response.status : null;

        if (status === 401 && !originalRequest._retry) {
            // Mark the request as retried BEFORE anything else. Both the leader
            // and the queued followers share this guard: a request that 401s
            // again after its single retry must NOT re-enter the refresh path,
            // or concurrent pollers ping-pong queue→retry→401→queue forever and
            // hammer /api/auth/token/refresh/ into a 429 storm.
            originalRequest._retry = true;

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then(() => api(originalRequest))
                    .catch((err) => Promise.reject(err));
            }

            isRefreshing = true;

            try {
                await refreshAccessToken();
                return api(originalRequest);
            } catch (refreshError) {
                return Promise.reject(refreshError);
            }
        }

        await handleNetworkError(error);
        return Promise.reject(error);
    }
);

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export interface ChatSession {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
}

export const chatApi = {
    getSessions: () => api.get<ChatSession[]>('/api/chat/sessions/'),
    createSession: (title: string = 'New Chat') => api.post<ChatSession>('/api/chat/sessions/', { title }),
    renameSession: (id: string, title: string) => api.patch<ChatSession>(`/api/chat/sessions/${id}/`, { title }),
    deleteSession: (id: string) => api.delete(`/api/chat/sessions/${id}/`),
    getMessages: (sessionId: string) => api.get<ChatMessage[]>(`/api/chat/sessions/${sessionId}/messages/`),
    addMessage: (sessionId: string, role: string, content: string) =>
        api.post<ChatMessage[]>(`/api/chat/sessions/${sessionId}/add_message/`, { role, content }),
    streamMessage: async (sessionId: string, role: string, content: string, onChunk: (chunk: string) => void) => {
        const baseURL = API_BASE_URL;

        const response = await fetch(`${baseURL}/api/chat/sessions/${sessionId}/stream_message/`, {
            method: 'POST',
            credentials: 'include', 
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': Cookies.get('csrftoken') || '',
            },
            body: JSON.stringify({ role, content })
        });

        if (!response.ok) {
            console.error('Stream request failed:', response.status, response.statusText);
            if (response.status === 401) {
                console.error('Token expired during streaming. Redirecting to login.');
                await logoutAndRedirect();
                return;
            }
            throw new Error(`Failed to stream: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) return;

        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // Keep the last partial line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(trimmedLine.slice(6));
                        if (data.content) {
                            onChunk(data.content);
                        } else if (data.error) {
                            console.error('Streaming error from backend:', data.error);
                        }
                    } catch (e) {
                        console.error('Error parsing stream chunk JSON:', e, 'Line:', trimmedLine);
                    }
                }
            }
        }
    }
};

export const savedApi = {
    list: (params: Record<string, string> = {}) => {
        const qs = new URLSearchParams(params).toString();
        return api.get<SavedAnalysis[]>(`/api/chat/saved/${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => api.get<SavedAnalysis>(`/api/chat/saved/${id}/`),
    create: (payload: Partial<SavedAnalysisDraft>) =>
        api.post<SavedAnalysis>('/api/chat/saved/', payload),
    update: (id: string, payload: Partial<SavedAnalysis>) =>
        api.patch<SavedAnalysis>(`/api/chat/saved/${id}/`, payload),
    remove: (id: string) => api.delete(`/api/chat/saved/${id}/`),
    suggest: (q: string) =>
        api.get<SavedAnalysis[]>(`/api/chat/saved/suggest/?q=${encodeURIComponent(q)}`),
    draft: (sessionId: string, messageId?: string) =>
        api.post<SavedAnalysisDraft>(
            `/api/chat/sessions/${sessionId}/bookmark_draft/`,
            messageId ? { message_id: messageId } : {},
        ),
};

export default api;
