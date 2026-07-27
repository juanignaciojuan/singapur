const axios = require('axios');
const cache = require('../cache/memoryCache');

const BASE_URL = 'https://datamall2.mytransport.sg/ltaodataservice/';
const DEFAULT_TTL_MS = Number.parseInt(process.env.CACHE_TTL_MS || '15000', 10);
const FLOW_FALLBACK_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
const PAGE_SIZE = 500;

const SG_BOUNDS = {
  lonMin: 103.55,
  lonMax: 104.10,
  latMin: 1.15,
  latMax: 1.49
};

const ltaClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    accept: 'application/json'
  }
});

function ensureApiKey() {
  const accountKey = process.env.LTA_ACCOUNT_KEY;
  if (!accountKey) {
    throw new Error('Missing LTA_ACCOUNT_KEY in backend .env file');
  }

  return accountKey;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isWithinSingaporeBounds(lon, lat) {
  return (
    lon >= SG_BOUNDS.lonMin &&
    lon <= SG_BOUNDS.lonMax &&
    lat >= SG_BOUNDS.latMin &&
    lat <= SG_BOUNDS.latMax
  );
}

function sanitizePosition(rawLon, rawLat) {
  const lon = parseNumber(rawLon);
  const lat = parseNumber(rawLat);

  if (lon === null || lat === null) {
    return null;
  }

  // Fallback guard so we do not render impossible points in the wrong region.
  if (!isWithinSingaporeBounds(lon, lat)) {
    return null;
  }

  return [lon, lat];
}

function pickPositionFromObject(record) {
  const lon =
    record.Longitude ||
    record.Lon ||
    record.longitude ||
    record.lon ||
    record.StartLon ||
    record.StartLongitude;

  const lat =
    record.Latitude ||
    record.Lat ||
    record.latitude ||
    record.lat ||
    record.StartLat ||
    record.StartLatitude;

  return sanitizePosition(lon, lat);
}

function statusFromSpeedBand(speedBandValue) {
  const speedBand = parseNumber(speedBandValue);

  if (speedBand === null) {
    return null;
  }

  if (speedBand <= 1) {
    return 'congested';
  }

  if (speedBand === 2) {
    return 'heavy';
  }

  if (speedBand === 3) {
    return 'moderate';
  }

  return 'free_flow';
}

function statusFromEstimatedSpeed(minimumSpeed, maximumSpeed) {
  const min = parseNumber(minimumSpeed);
  const max = parseNumber(maximumSpeed);

  if (min === null && max === null) {
    return null;
  }

  const estimated = max !== null && min !== null ? (max + min) / 2 : max !== null ? max : min;

  if (estimated < 20) {
    return 'congested';
  }

  if (estimated < 40) {
    return 'heavy';
  }

  if (estimated < 60) {
    return 'moderate';
  }

  return 'free_flow';
}

function speedBandFromVolume(volumeValue) {
  const volume = parseNumber(volumeValue);

  if (volume === null) {
    return null;
  }

  if (volume >= 900) {
    return 1;
  }

  if (volume >= 500) {
    return 2;
  }

  if (volume >= 200) {
    return 3;
  }

  return 4;
}

function parseDateHourStamp(dateText, hourText) {
  if (typeof dateText !== 'string') {
    return null;
  }

  const parts = dateText.split('/');
  if (parts.length !== 3) {
    return null;
  }

  const day = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10);
  const year = Number.parseInt(parts[2], 10);
  const hour = Number.parseInt(hourText || '0', 10);

  if (![day, month, year].every(Number.isFinite)) {
    return null;
  }

  return Date.UTC(year, month - 1, day, Number.isFinite(hour) ? hour : 0);
}

function latestTrafficFlowRows(rows) {
  let latestStamp = -Infinity;

  rows.forEach((row) => {
    const stamp = parseDateHourStamp(row.Date, row.HourOfDate);
    if (stamp !== null && stamp > latestStamp) {
      latestStamp = stamp;
    }
  });

  if (!Number.isFinite(latestStamp)) {
    return rows;
  }

  const dedupedByLink = new Map();

  rows.forEach((row) => {
    const stamp = parseDateHourStamp(row.Date, row.HourOfDate);
    if (stamp !== latestStamp) {
      return;
    }

    const linkId = row.LinkID || `${row.RoadName || 'road'}-${row.StartLon}-${row.StartLat}`;

    if (!dedupedByLink.has(linkId)) {
      dedupedByLink.set(linkId, row);
    }
  });

  return Array.from(dedupedByLink.values());
}

function normalizeTrafficStatus(record) {
  return (
    statusFromSpeedBand(record.SpeedBand || record.Band) ||
    statusFromEstimatedSpeed(record.MinimumSpeed, record.MaximumSpeed) ||
    statusFromSpeedBand(speedBandFromVolume(record.Volume)) ||
    'unknown'
  );
}

function normalizeSpeedBandsToGeoJson(items) {
  const features = [];

  items.forEach((item, index) => {
    const start = sanitizePosition(
      item.StartLon || item.StartLongitude,
      item.StartLat || item.StartLatitude
    );

    const end = sanitizePosition(
      item.EndLon || item.EndLongitude,
      item.EndLat || item.EndLatitude
    );

    const fallbackPoint = pickPositionFromObject(item);

    let geometry = null;

    if (start && end) {
      geometry = {
        type: 'LineString',
        coordinates: [start, end]
      };
    } else if (fallbackPoint) {
      // If segment coordinates are missing, we still render a point so data is visible.
      geometry = {
        type: 'Point',
        coordinates: fallbackPoint
      };
    }

    if (!geometry) {
      return;
    }

    const status = normalizeTrafficStatus(item);
    const minSpeed = parseNumber(item.MinimumSpeed);
    const maxSpeed = parseNumber(item.MaximumSpeed);

    features.push({
      type: 'Feature',
      id: item.LinkID || item.SegmentID || item.ID || `speed-${index}`,
      geometry,
      properties: {
        source:
          item.dataMode === 'traffic_flow_fallback'
            ? 'lta-traffic-flow-fallback'
            : 'lta-traffic-speed-bands',
        status,
        speedBand: parseNumber(item.SpeedBand || item.Band || speedBandFromVolume(item.Volume)),
        volume: parseNumber(item.Volume),
        minSpeed,
        maxSpeed,
        roadName: item.RoadName || item.Name || 'Unnamed road segment',
        location: item.Location || item.RoadName || 'Unknown location',
        updatedAt: new Date().toISOString()
      }
    });
  });

  return {
    type: 'FeatureCollection',
    features
  };
}

function normalizeIncidentsToGeoJson(items) {
  const features = [];

  items.forEach((item, index) => {
    const point = sanitizePosition(
      item.Longitude || item.Lon,
      item.Latitude || item.Lat
    ) || pickPositionFromObject(item);

    if (!point) {
      return;
    }

    features.push({
      type: 'Feature',
      id: item.MessageID || item.IncidentID || `incident-${index}`,
      geometry: {
        type: 'Point',
        coordinates: point
      },
      properties: {
        source: 'lta-traffic-incidents',
        type: item.Type || item.IncidentType || 'Incident',
        location: item.RoadName || item.Location || 'Unknown location',
        message: item.Message || item.Description || '',
        updatedAt: new Date().toISOString()
      }
    });
  });

  return {
    type: 'FeatureCollection',
    features
  };
}

function normalizeTrafficImages(items) {
  return items
    .map((item, index) => {
      const coordinates = sanitizePosition(item.Longitude, item.Latitude);
      if (!coordinates) {
        return null;
      }

      return {
        id: item.CameraID || `camera-${index}`,
        cameraId: item.CameraID || `camera-${index}`,
        imageUrl: item.ImageLink || item.ImageURL || item.ImageUrl || item.Url || '',
        location: item.Location || item.CameraID || 'Traffic camera',
        coordinates,
        timestamp: item.Timestamp || new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(pointA, pointB) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(pointB[1] - pointA[1]);
  const dLon = toRadians(pointB[0] - pointA[0]);
  const lat1 = toRadians(pointA[1]);
  const lat2 = toRadians(pointB[1]);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

async function fetchPaged(endpointPath) {
  const accountKey = ensureApiKey();
  let skip = 0;
  const allRows = [];

  while (true) {
    const response = await ltaClient.get(endpointPath, {
      params: { $skip: skip },
      headers: {
        AccountKey: accountKey
      }
    });

    const value = response.data && (response.data.value || response.data.Value);
    const rows = Array.isArray(value) ? value : [];

    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }

    skip += PAGE_SIZE;

    // Safety stop to prevent an accidental infinite paging loop.
    if (skip > 20000) {
      break;
    }
  }

  return allRows;
}

async function fetchWithFallback(endpointCandidates) {
  let lastError = null;

  for (const endpoint of endpointCandidates) {
    try {
      return await fetchPaged(endpoint);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to fetch LTA endpoint candidates');
}

async function fetchTrafficFlowAsSpeedRows() {
  const flowRows = await fetchWithFallback(['TrafficFlow']);
  const flowLink = flowRows[0] && flowRows[0].Link;

  if (!flowLink) {
    return [];
  }

  const response = await axios.get(flowLink, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      accept: 'application/json'
    }
  });

  const payload = response.data || {};
  const valueRows = Array.isArray(payload.Value)
    ? payload.Value
    : Array.isArray(payload.value)
      ? payload.value
      : [];

  const latestRows = latestTrafficFlowRows(valueRows);

  return latestRows.map((row) => ({
    ...row,
    dataMode: 'traffic_flow_fallback',
    SpeedBand: speedBandFromVolume(row.Volume)
  }));
}

function getTrafficSpeedBandsRaw() {
  return cache.getOrSet('lta:speed-bands:raw', DEFAULT_TTL_MS, async () => {
    try {
      return await fetchWithFallback(['TrafficSpeedBandsv2', 'TrafficSpeedBands']);
    } catch (error) {
      const statusCode = error.response && error.response.status;

      // Some DataMall accounts no longer expose TrafficSpeedBands directly.
      if (statusCode === 404) {
        return cache.getOrSet('lta:speed-flow-fallback:raw', FLOW_FALLBACK_TTL_MS, () =>
          fetchTrafficFlowAsSpeedRows()
        );
      }

      throw error;
    }
  });
}

function getTrafficIncidentsRaw() {
  return cache.getOrSet('lta:incidents:raw', DEFAULT_TTL_MS, async () =>
    fetchWithFallback(['TrafficIncidents'])
  );
}

function getTrafficImagesRaw() {
  return cache.getOrSet('lta:images:raw', 30000, async () =>
    fetchWithFallback(['Traffic-Imagesv2', 'Traffic-Images'])
  );
}

async function getSpeedBandsGeoJson() {
  const rows = await getTrafficSpeedBandsRaw();
  return normalizeSpeedBandsToGeoJson(rows);
}

async function getIncidentsGeoJson() {
  const rows = await getTrafficIncidentsRaw();
  return normalizeIncidentsToGeoJson(rows);
}

async function getTrafficImages() {
  const rows = await getTrafficImagesRaw();
  return normalizeTrafficImages(rows);
}

async function getImagesNear({ lon, lat, radiusKm = 2, limit = 3 }) {
  const point = sanitizePosition(lon, lat);
  const images = await getTrafficImages();

  if (!point) {
    return images.slice(0, limit);
  }

  const rankedImages = images
    .map((image) => ({
      ...image,
      distanceKm: haversineDistanceKm(point, image.coordinates)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .filter((image) => image.distanceKm <= radiusKm);

  return (rankedImages.length > 0 ? rankedImages : images.map((image) => ({
    ...image,
    distanceKm: haversineDistanceKm(point, image.coordinates)
  })).sort((a, b) => a.distanceKm - b.distanceKm)).slice(0, limit);
}

async function getTrafficSnapshot() {
  const [speedBandsResult, incidentsResult] = await Promise.allSettled([
    getSpeedBandsGeoJson(),
    getIncidentsGeoJson()
  ]);

  const speedBands =
    speedBandsResult.status === 'fulfilled'
      ? speedBandsResult.value
      : { type: 'FeatureCollection', features: [] };

  const incidents =
    incidentsResult.status === 'fulfilled'
      ? incidentsResult.value
      : { type: 'FeatureCollection', features: [] };

  const warnings = [];

  if (speedBandsResult.status === 'rejected') {
    warnings.push('Speed dataset unavailable for current key; returning empty speed bands.');
  }

  if (incidentsResult.status === 'rejected') {
    warnings.push('Incident dataset unavailable for current key; returning empty incidents.');
  }

  return {
    updatedAt: new Date().toISOString(),
    speedBands,
    incidents,
    warnings,
    stats: {
      speedBandCount: speedBands.features.length,
      incidentCount: incidents.features.length
    }
  };
}

module.exports = {
  getSpeedBandsGeoJson,
  getIncidentsGeoJson,
  getTrafficImages,
  getImagesNear,
  getTrafficSnapshot
};

/*
Explanation:
- Responsibility: Fetch, normalize, and cache LTA datasets for safe frontend consumption.
- Data flow: Routes call this service -> service reads cache or upstream -> service returns normalized geospatial payloads.
- Dependencies: axios for HTTP, memory cache for TTL reuse.

Beginner check-in questions:
- Why do we separate backend and frontend in this system?
- What is a geospatial projection and why does it matter when mapping coordinates?
- Why do we normalize API fields before sending them to the browser?
*/
