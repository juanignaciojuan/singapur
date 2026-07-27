// Frontend API client that talks only to backend routes.
// This protects secret keys and keeps all upstream contracts centralized.
const API_BASE = '/api';
const hoverImageCache = new Map();

async function requestJson(path) {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${path} failed: ${response.status} ${text}`);
  }

  return response.json();
}

function createHoverCacheKey(lon, lat) {
  const lonKey = Number.parseFloat(lon).toFixed(4);
  const latKey = Number.parseFloat(lat).toFixed(4);
  return `${lonKey},${latKey}`;
}

export function fetchAppConfig() {
  return requestJson('/config');
}

export function fetchRoadNetwork() {
  return requestJson('/traffic/roads');
}

export function fetchTrafficSnapshot() {
  return requestJson('/traffic/snapshot');
}

export function fetchTrafficImages({ limit = 500 } = {}) {
  const searchParams = new URLSearchParams({
    limit: String(limit)
  });

  return requestJson(`/traffic/images?${searchParams.toString()}`);
}

export async function fetchTrafficImagesNear({ lon, lat, radiusKm = 2, limit = 3 }) {
  const cacheKey = createHoverCacheKey(lon, lat);
  const now = Date.now();
  const cached = hoverImageCache.get(cacheKey);

  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  const searchParams = new URLSearchParams({
    lon: String(lon),
    lat: String(lat),
    radiusKm: String(radiusKm),
    limit: String(limit)
  });

  const payload = await requestJson(`/traffic/images?${searchParams.toString()}`);

  hoverImageCache.set(cacheKey, {
    data: payload,
    expiresAt: now + 10000
  });

  return payload;
}

/*
Explanation:
- Responsibility: Provide a tiny API abstraction for frontend modules.
- Data flow: UI modules call this file -> this file calls backend -> returns parsed JSON.
- Dependencies: Browser fetch API only.

Beginner check-in questions:
- Why should frontend code call only backend endpoints?
- Why add a tiny client-side cache even if backend already caches?
- What breaks if API shapes are used directly across many UI files?
*/
