import axios from 'axios';

/**
 * Backend API Base URL:
 * - Uses VITE_API_URL environment variable if defined (e.g., "https://aizen-backend.onrender.com")
 * - If not provided or empty, defaults to '' which allows relative URLs through Vite dev server proxy
 */
const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');

// Configure default axios baseURL globally so direct axios calls automatically resolve
if (API_BASE_URL) {
  axios.defaults.baseURL = API_BASE_URL;
}

// Configured Axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Derives the real-time WebSocket URL:
 * - If VITE_API_URL is provided:
 *     https://... -> wss://...
 *     http://...  -> ws://...
 * - Otherwise defaults to window.location (wss:// on https, ws:// on http)
 */
export const getWebSocketUrl = () => {
  if (API_BASE_URL) {
    try {
      const url = new URL(API_BASE_URL);
      const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${url.host}/ws`;
    } catch {
      const isHttps = window.location.protocol === 'https:';
      const cleanHost = API_BASE_URL.replace(/^https?:\/\//, '');
      return `${isHttps ? 'wss:' : 'ws:'}//${cleanHost}/ws`;
    }
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

export default apiClient;
