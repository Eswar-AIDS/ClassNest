import axios from 'axios';
export const apiBaseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
export const REQUEST_TIMEOUT_MS = 30000;
const api = axios.create({ baseURL: apiBaseURL, timeout: REQUEST_TIMEOUT_MS });
const inflight = new Map();
const slowRequestListeners = new Set();
const slowRequestTimers = new WeakMap();
let slowRequestCount = 0;

const notifySlowRequestListeners = () => {
  slowRequestListeners.forEach(listener => listener(slowRequestCount));
};

export const subscribeSlowRequests = listener => {
  slowRequestListeners.add(listener);
  listener(slowRequestCount);
  return () => slowRequestListeners.delete(listener);
};

const clearSlowRequestTimer = config => {
  const timer = slowRequestTimers.get(config);
  if (!timer) return;
  clearTimeout(timer);
  slowRequestTimers.delete(config);
  if (config.__classnestSlowStarted) {
    slowRequestCount = Math.max(0, slowRequestCount - 1);
    notifySlowRequestListeners();
  }
};

api.interceptors.request.use(config => {
  const token = localStorage.getItem('classnest_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const timer = setTimeout(() => {
    config.__classnestSlowStarted = true;
    slowRequestCount += 1;
    notifySlowRequestListeners();
  }, 2000);
  slowRequestTimers.set(config, timer);
  return config;
});
api.interceptors.response.use(response => {
  clearSlowRequestTimer(response.config);
  return response;
}, error => {
  if (error.config) clearSlowRequestTimer(error.config);
  if (error.response?.status === 401) {
    localStorage.removeItem('classnest_token');
    removeSessionCache(cacheKeys.authMe);
    removeSessionCache(cacheKeys.dashboardClasses);
    if (!location.pathname.match('/(login|register|reset-password)')) {
      sessionStorage.setItem('classnest_return_to', `${location.pathname}${location.search}${location.hash}`);
      location.href = '/login';
    }
  }
  return Promise.reject(error);
});
export const errorMessage = error => {
  if (error.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map(item => item.msg).join(' ');
  return detail || 'Something went wrong. Please try again.';
};
export const cacheKeys = {
  authMe: 'classnest_cache_auth_me',
  dashboardClasses: 'classnest_cache_dashboard_classes',
};
export const readSessionCache = key => {
  try {
    const cached = sessionStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};
export const writeSessionCache = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing; the app still works without it.
  }
};
export const removeSessionCache = key => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
};
export const getOnce = (url, config) => {
  const key = `${url}:${JSON.stringify(config || {})}`;
  if (!inflight.has(key)) {
    inflight.set(key, api.get(url, config).finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
};
export default api;
