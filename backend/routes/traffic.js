const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const cache = require('../cache/memoryCache');
const ltaService = require('../services/ltaService');

const router = express.Router();

const ROADS_FILE_PATH = path.join(__dirname, '..', '..', 'SingaporeMap_Line.json');
const ROADS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function parseQueryNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizePosition(position) {
  if (!Array.isArray(position) || position.length < 2) {
    return null;
  }

  const lon = Number.parseFloat(position[0]);
  const lat = Number.parseFloat(position[1]);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  return [lon, lat];
}

function sanitizeGeometry(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    return null;
  }

  if (geometry.type === 'LineString') {
    const coords = geometry.coordinates
      .map((position) => sanitizePosition(position))
      .filter(Boolean);

    if (coords.length < 2) {
      return null;
    }

    return {
      type: 'LineString',
      coordinates: coords
    };
  }

  if (geometry.type === 'MultiLineString') {
    const lines = geometry.coordinates
      .map((line) => line.map((position) => sanitizePosition(position)).filter(Boolean))
      .filter((line) => line.length >= 2);

    if (lines.length === 0) {
      return null;
    }

    return {
      type: 'MultiLineString',
      coordinates: lines
    };
  }

  return null;
}

async function loadRoadNetworkGeoJson() {
  return cache.getOrSet('static:roads:geojson', ROADS_CACHE_TTL_MS, async () => {
    const rawFile = await fs.readFile(ROADS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(rawFile);
    const inputFeatures = Array.isArray(parsed.features) ? parsed.features : [];

    const features = inputFeatures
      .map((feature, index) => {
        const geometry = sanitizeGeometry(feature.geometry);
        if (!geometry) {
          return null;
        }

        return {
          type: 'Feature',
          id: feature.id || feature.properties?.OBJECTID || `road-${index}`,
          geometry,
          properties: {
            ...(feature.properties || {}),
            source: 'singapore-road-network-2021'
          }
        };
      })
      .filter(Boolean);

    return {
      type: 'FeatureCollection',
      name: parsed.name || 'SINGAPOREMAP_LINE',
      features
    };
  });
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.get(
  '/traffic/snapshot',
  asyncHandler(async (req, res) => {
    const snapshot = await ltaService.getTrafficSnapshot();
    res.json(snapshot);
  })
);

router.get(
  '/traffic/speed-bands',
  asyncHandler(async (req, res) => {
    const speedBands = await ltaService.getSpeedBandsGeoJson();
    res.json({
      updatedAt: new Date().toISOString(),
      speedBands
    });
  })
);

router.get(
  '/traffic/incidents',
  asyncHandler(async (req, res) => {
    const incidents = await ltaService.getIncidentsGeoJson();
    res.json({
      updatedAt: new Date().toISOString(),
      incidents
    });
  })
);

router.get(
  '/traffic/images',
  asyncHandler(async (req, res) => {
    const lon = req.query.lon;
    const lat = req.query.lat;

    const radiusKm = parseQueryNumber(req.query.radiusKm, 2);
    const limit = Math.max(1, Math.min(500, Number.parseInt(req.query.limit || '3', 10)));

    const images = lon && lat
      ? await ltaService.getImagesNear({ lon, lat, radiusKm, limit })
      : (await ltaService.getTrafficImages()).slice(0, limit);

    res.json({
      updatedAt: new Date().toISOString(),
      images
    });
  })
);

router.get(
  '/traffic/roads',
  asyncHandler(async (req, res) => {
    const roads = await loadRoadNetworkGeoJson();
    res.json(roads);
  })
);

module.exports = router;

/*
Explanation:
- Responsibility: Define backend endpoints used by the map frontend.
- Data flow: Frontend calls these routes -> routes call service/cache -> routes respond with normalized JSON.
- Dependencies: Express router, LTA service, and static road data loader.

Beginner check-in questions:
- Why should the browser call only backend routes instead of LTA directly?
- How does this route layer help security and future scaling?
- Why do we sanitize coordinates before rendering geospatial data?
*/
