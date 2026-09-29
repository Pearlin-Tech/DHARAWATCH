const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Base fetch wrapper to handle errors and JSON parsing.
 */
async function fetchClient(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorBody}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  get: (endpoint) => fetchClient(endpoint),
  post: (endpoint, body) => fetchClient(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => fetchClient(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => fetchClient(endpoint, { method: 'DELETE' }),
};
