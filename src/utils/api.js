import axios from 'axios';
import { beginLoading, endLoading } from './loading';

export function getApiBaseUrl() {
  const base = import.meta.env.VITE_API_URL || '/api';
  return String(base).replace(/\/$/, '');
}

export const api = axios.create({
  baseURL: getApiBaseUrl()
});

api.interceptors.request.use(
  (config) => {
    beginLoading();
    config.__loadingStarted = true;
    return config;
  },
  (error) => {
    endLoading();
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    if (response?.config?.__loadingStarted) endLoading();
    return response;
  },
  (error) => {
    if (error?.config?.__loadingStarted) endLoading();
    return Promise.reject(error);
  }
);

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(url);
}

function joinUrl(base, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function apiFetch(input, init = {}) {
  beginLoading();
  try {
    const base = getApiBaseUrl();
    const url = typeof input === 'string'
      ? (isAbsoluteUrl(input) ? input : joinUrl(base, input))
      : input;
    return await fetch(url, init);
  } finally {
    endLoading();
  }
}

export async function apiFetchJson(input, init = {}) {
  const headers = new Headers(init.headers || {});
  let body = init.body;

  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const res = await apiFetch(input, { ...init, headers, body });
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data.error || data.message)) ? (data.error || data.message) : '请求失败';
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
