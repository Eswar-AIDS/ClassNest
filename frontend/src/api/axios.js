import axios from 'axios';
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api' });
api.interceptors.request.use(config => { const token=localStorage.getItem('classnest_token'); if(token) config.headers.Authorization=`Bearer ${token}`; return config });
api.interceptors.response.use(r=>r, error=>{ if(error.response?.status===401){ localStorage.removeItem('classnest_token'); if(!location.pathname.match('/(login|register)')) { sessionStorage.setItem('classnest_return_to', `${location.pathname}${location.search}${location.hash}`); location.href='/login'; } } return Promise.reject(error) });
export const errorMessage = error => { const detail=error.response?.data?.detail; if(Array.isArray(detail)) return detail.map(item=>item.msg).join(' '); return detail || 'Something went wrong. Please try again.'; };
export default api;
