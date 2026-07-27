const ROADS_SOURCE_ID = 'roads-source';
const SPEED_SOURCE_ID = 'speed-source';
const INCIDENT_SOURCE_ID = 'incident-source';
const CAMERA_SOURCE_ID = 'camera-source';

const ROADS_LAYER_ID = 'roads-layer';
const SPEED_LINE_LAYER_ID = 'speed-line-layer';
const SPEED_POINT_LAYER_ID = 'speed-point-layer';
const INCIDENT_GLOW_LAYER_ID = 'incident-glow-layer';
const INCIDENT_CORE_LAYER_ID = 'incident-core-layer';
const CAMERA_LAYER_ID = 'camera-layer';
const CAMERA_HALO_LAYER_ID = 'camera-halo-layer';

const LIVE_LAYER_IDS = [
  SPEED_LINE_LAYER_ID,
  SPEED_POINT_LAYER_ID,
  INCIDENT_GLOW_LAYER_ID,
  INCIDENT_CORE_LAYER_ID,
  CAMERA_HALO_LAYER_ID,
  CAMERA_LAYER_ID
];

function createEmptyFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: []
  };
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

  if (geometry.type === 'Point') {
    const point = sanitizePosition(geometry.coordinates);
    return point
      ? {
          type: 'Point',
          coordinates: point
        }
      : null;
  }

  if (geometry.type === 'LineString') {
    const points = geometry.coordinates.map((point) => sanitizePosition(point)).filter(Boolean);
    if (points.length < 2) {
      return null;
    }

    return {
      type: 'LineString',
      coordinates: points
    };
  }

  if (geometry.type === 'MultiLineString') {
    const lines = geometry.coordinates
      .map((line) => line.map((point) => sanitizePosition(point)).filter(Boolean))
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

function normalizeFeatureCollection(inputCollection, prefix) {
  const features = Array.isArray(inputCollection?.features) ? inputCollection.features : [];

  return {
    type: 'FeatureCollection',
    features: features
      .map((feature, index) => {
        const geometry = sanitizeGeometry(feature.geometry);
        if (!geometry) {
          return null;
        }

        const id = String(feature.id || feature.properties?.id || `${prefix}-${index}`);

        return {
          type: 'Feature',
          id,
          geometry,
          properties: {
            ...(feature.properties || {})
          }
        };
      })
      .filter(Boolean)
  };
}

function ensureSource(map, id) {
  if (map.getSource(id)) {
    return;
  }

  map.addSource(id, {
    type: 'geojson',
    data: createEmptyFeatureCollection()
  });
}

function speedColorExpression() {
  return [
    'match',
    ['get', 'status'],
    'free_flow',
    '#3be477',
    'moderate',
    '#f4e64c',
    'heavy',
    '#ff8a3d',
    'congested',
    '#ff465f',
    '#9aa0a8'
  ];
}

function ensureLayers(map) {
  if (!map.getLayer(ROADS_LAYER_ID)) {
    map.addLayer({
      id: ROADS_LAYER_ID,
      type: 'line',
      source: ROADS_SOURCE_ID,
      paint: {
        'line-color': '#d4dae3',
        'line-opacity': 0.2,
        'line-width': 0.55
      }
    });
  }

  if (!map.getLayer(SPEED_LINE_LAYER_ID)) {
    map.addLayer({
      id: SPEED_LINE_LAYER_ID,
      type: 'line',
      source: SPEED_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': speedColorExpression(),
        'line-opacity': 0.9,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          1.3,
          14,
          3.2
        ]
      }
    });
  }

  if (!map.getLayer(SPEED_POINT_LAYER_ID)) {
    map.addLayer({
      id: SPEED_POINT_LAYER_ID,
      type: 'circle',
      source: SPEED_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': speedColorExpression(),
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          2,
          14,
          5
        ],
        'circle-opacity': 0.9,
        'circle-stroke-width': 0.8,
        'circle-stroke-color': '#0e1014'
      }
    });
  }

  if (!map.getLayer(INCIDENT_GLOW_LAYER_ID)) {
    map.addLayer({
      id: INCIDENT_GLOW_LAYER_ID,
      type: 'circle',
      source: INCIDENT_SOURCE_ID,
      paint: {
        'circle-color': '#ff5d6d',
        'circle-blur': 0.6,
        'circle-opacity': ['interpolate', ['linear'], ['get', 'pulse'], 0, 0.12, 1, 0.35],
        'circle-radius': ['interpolate', ['linear'], ['get', 'pulse'], 0, 6, 1, 16]
      }
    });
  }

  if (!map.getLayer(INCIDENT_CORE_LAYER_ID)) {
    map.addLayer({
      id: INCIDENT_CORE_LAYER_ID,
      type: 'circle',
      source: INCIDENT_SOURCE_ID,
      paint: {
        'circle-color': '#ff3a4f',
        'circle-opacity': ['interpolate', ['linear'], ['get', 'pulse'], 0, 0.6, 1, 1],
        'circle-radius': ['interpolate', ['linear'], ['get', 'pulse'], 0, 2, 1, 5],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffd3d8'
      }
    });
  }

  if (!map.getLayer(CAMERA_HALO_LAYER_ID)) {
    map.addLayer({
      id: CAMERA_HALO_LAYER_ID,
      type: 'circle',
      source: CAMERA_SOURCE_ID,
      paint: {
        'circle-color': '#6fd6ff',
        'circle-opacity': 0.18,
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          4,
          14,
          8
        ]
      }
    });
  }

  if (!map.getLayer(CAMERA_LAYER_ID)) {
    map.addLayer({
      id: CAMERA_LAYER_ID,
      type: 'circle',
      source: CAMERA_SOURCE_ID,
      paint: {
        'circle-color': '#9de8ff',
        'circle-opacity': 0.95,
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          2.2,
          14,
          4.3
        ],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#10313d'
      }
    });
  }
}

function cameraImagesToFeatureCollection(images) {
  const safeImages = Array.isArray(images) ? images : [];

  return {
    type: 'FeatureCollection',
    features: safeImages
      .map((image, index) => {
        const coordinates = sanitizePosition(image.coordinates);
        if (!coordinates) {
          return null;
        }

        return {
          type: 'Feature',
          id: String(image.cameraId || image.id || `camera-${index}`),
          geometry: {
            type: 'Point',
            coordinates
          },
          properties: {
            cameraId: image.cameraId || image.id || `camera-${index}`,
            imageUrl: image.imageUrl || '',
            location: image.location || 'Traffic camera',
            timestamp: image.timestamp || ''
          }
        };
      })
      .filter(Boolean)
  };
}

function buildFeatureDigest(feature) {
  const props = feature.properties || {};

  return JSON.stringify({
    id: feature.id,
    geometry: feature.geometry,
    status: props.status,
    updatedAt: props.updatedAt,
    message: props.message,
    pulse: props.pulse
  });
}

function applyDiffToCollection(targetCollection, digestStore, nextFeatures) {
  const nextDigests = new Map();
  let changed = nextFeatures.length !== targetCollection.features.length;

  nextFeatures.forEach((feature) => {
    const id = String(feature.id);
    const digest = buildFeatureDigest(feature);

    nextDigests.set(id, digest);

    if (digestStore.get(id) !== digest) {
      changed = true;
    }
  });

  if (!changed) {
    for (const currentId of digestStore.keys()) {
      if (!nextDigests.has(currentId)) {
        changed = true;
        break;
      }
    }
  }

  if (changed) {
    targetCollection.features = nextFeatures;
    digestStore.clear();

    for (const [id, digest] of nextDigests.entries()) {
      digestStore.set(id, digest);
    }
  }

  return changed;
}

function nextPulse(index) {
  return (Math.sin(Date.now() / 500 + index) + 1) / 2;
}

function startIncidentPulseTicker(map, state) {
  if (state.pulseTimerId !== null) {
    return;
  }

  state.pulseTimerId = window.setInterval(() => {
    if (state.incidentData.features.length === 0) {
      return;
    }

    state.incidentData.features = state.incidentData.features.map((feature, index) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        pulse: nextPulse(index)
      }
    }));

    const incidentSource = map.getSource(INCIDENT_SOURCE_ID);
    if (incidentSource) {
      incidentSource.setData(state.incidentData);
    }
  }, 850);
}

function stopIncidentPulseTicker(state) {
  if (state.pulseTimerId !== null) {
    window.clearInterval(state.pulseTimerId);
    state.pulseTimerId = null;
  }
}

function setLayerVisibility(map, layerId, isVisible) {
  if (!map.getLayer(layerId)) {
    return;
  }

  map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
}

export function createTrafficLayerController(map) {
  ensureSource(map, ROADS_SOURCE_ID);
  ensureSource(map, SPEED_SOURCE_ID);
  ensureSource(map, INCIDENT_SOURCE_ID);
  ensureSource(map, CAMERA_SOURCE_ID);
  ensureLayers(map);

  const state = {
    roadsData: createEmptyFeatureCollection(),
    speedData: createEmptyFeatureCollection(),
    incidentData: createEmptyFeatureCollection(),
    cameraData: createEmptyFeatureCollection(),
    speedDigest: new Map(),
    incidentDigest: new Map(),
    cameraDigest: new Map(),
    trafficHoverHandlers: [],
    cameraHoverHandlers: [],
    cameraClickHandlers: [],
    pulseTimerId: null
  };

  startIncidentPulseTicker(map, state);

  function setRoadNetwork(roadCollection) {
    const normalizedRoads = normalizeFeatureCollection(roadCollection, 'road');
    state.roadsData = normalizedRoads;

    const roadsSource = map.getSource(ROADS_SOURCE_ID);
    if (roadsSource) {
      roadsSource.setData(state.roadsData);
    }
  }

  function updateSnapshot(snapshot) {
    const nextSpeed = normalizeFeatureCollection(snapshot?.speedBands || createEmptyFeatureCollection(), 'speed');
    const nextIncidents = normalizeFeatureCollection(snapshot?.incidents || createEmptyFeatureCollection(), 'incident');

    nextIncidents.features = nextIncidents.features.map((feature, index) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        pulse: nextPulse(index)
      }
    }));

    const speedChanged = applyDiffToCollection(state.speedData, state.speedDigest, nextSpeed.features);
    const incidentChanged = applyDiffToCollection(
      state.incidentData,
      state.incidentDigest,
      nextIncidents.features
    );

    if (speedChanged) {
      const speedSource = map.getSource(SPEED_SOURCE_ID);
      if (speedSource) {
        speedSource.setData(state.speedData);
      }
    }

    if (incidentChanged) {
      const incidentSource = map.getSource(INCIDENT_SOURCE_ID);
      if (incidentSource) {
        incidentSource.setData(state.incidentData);
      }
    }

    return {
      speedChanged,
      incidentChanged,
      speedCount: state.speedData.features.length,
      incidentCount: state.incidentData.features.length
    };
  }

  function updateCameraImages(images) {
    const nextCameras = normalizeFeatureCollection(cameraImagesToFeatureCollection(images), 'camera');
    const cameraChanged = applyDiffToCollection(state.cameraData, state.cameraDigest, nextCameras.features);

    if (cameraChanged) {
      const cameraSource = map.getSource(CAMERA_SOURCE_ID);
      if (cameraSource) {
        cameraSource.setData(state.cameraData);
      }
    }

    return {
      cameraChanged,
      cameraCount: state.cameraData.features.length
    };
  }

  function removeHoverHandlers(handlers) {
    handlers.forEach((handler) => {
      map.off(handler.event, handler.layerId, handler.fn);
    });
  }

  function removeTrafficHoverHooks() {
    removeHoverHandlers(state.trafficHoverHandlers);
    state.trafficHoverHandlers = [];
    map.getCanvas().style.cursor = '';
  }

  function removeCameraHoverHooks() {
    removeHoverHandlers(state.cameraHoverHandlers);
    state.cameraHoverHandlers = [];
    map.getCanvas().style.cursor = '';
  }

  function removeCameraClickHooks() {
    removeHoverHandlers(state.cameraClickHandlers);
    state.cameraClickHandlers = [];
    map.getCanvas().style.cursor = '';
  }

  function enableTrafficHoverHooks({ onHover, onLeave }) {
    removeTrafficHoverHooks();

    const enterHandler = (event) => {
      const feature = event.features && event.features[0];

      if (!feature) {
        return;
      }

      map.getCanvas().style.cursor = 'crosshair';

      if (onHover) {
        onHover({
          feature,
          lngLat: event.lngLat
        });
      }
    };

    const moveHandler = (event) => {
      const feature = event.features && event.features[0];

      if (!feature) {
        return;
      }

      if (onHover) {
        onHover({
          feature,
          lngLat: event.lngLat
        });
      }
    };

    const leaveHandler = () => {
      map.getCanvas().style.cursor = '';
      if (onLeave) {
        onLeave();
      }
    };

    [SPEED_LINE_LAYER_ID, SPEED_POINT_LAYER_ID].forEach((layerId) => {
      map.on('mouseenter', layerId, enterHandler);
      map.on('mousemove', layerId, moveHandler);
      map.on('mouseleave', layerId, leaveHandler);

      state.trafficHoverHandlers.push({ event: 'mouseenter', layerId, fn: enterHandler });
      state.trafficHoverHandlers.push({ event: 'mousemove', layerId, fn: moveHandler });
      state.trafficHoverHandlers.push({ event: 'mouseleave', layerId, fn: leaveHandler });
    });
  }

  function enableCameraHoverHooks({ onHover, onLeave }) {
    removeCameraHoverHooks();

    const enterHandler = (event) => {
      const feature = event.features && event.features[0];

      if (!feature) {
        return;
      }

      map.getCanvas().style.cursor = 'pointer';

      if (onHover) {
        onHover({
          feature,
          lngLat: event.lngLat
        });
      }
    };

    const moveHandler = (event) => {
      const feature = event.features && event.features[0];

      if (!feature) {
        return;
      }

      if (onHover) {
        onHover({
          feature,
          lngLat: event.lngLat
        });
      }
    };

    const leaveHandler = () => {
      map.getCanvas().style.cursor = '';
      if (onLeave) {
        onLeave();
      }
    };

    [CAMERA_LAYER_ID, CAMERA_HALO_LAYER_ID].forEach((layerId) => {
      map.on('mouseenter', layerId, enterHandler);
      map.on('mousemove', layerId, moveHandler);
      map.on('mouseleave', layerId, leaveHandler);

      state.cameraHoverHandlers.push({ event: 'mouseenter', layerId, fn: enterHandler });
      state.cameraHoverHandlers.push({ event: 'mousemove', layerId, fn: moveHandler });
      state.cameraHoverHandlers.push({ event: 'mouseleave', layerId, fn: leaveHandler });
    });
  }

  function enableCameraClickHooks({ onClick }) {
    removeCameraClickHooks();

    const enterHandler = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const leaveHandler = () => {
      map.getCanvas().style.cursor = '';
    };

    const clickHandler = (event) => {
      const feature = event.features && event.features[0];
      if (!feature || !onClick) {
        return;
      }

      onClick({
        feature,
        lngLat: event.lngLat
      });
    };

    [CAMERA_LAYER_ID, CAMERA_HALO_LAYER_ID].forEach((layerId) => {
      map.on('mouseenter', layerId, enterHandler);
      map.on('mouseleave', layerId, leaveHandler);
      map.on('click', layerId, clickHandler);

      state.cameraClickHandlers.push({ event: 'mouseenter', layerId, fn: enterHandler });
      state.cameraClickHandlers.push({ event: 'mouseleave', layerId, fn: leaveHandler });
      state.cameraClickHandlers.push({ event: 'click', layerId, fn: clickHandler });
    });
  }

  function setRoadsVisible(isVisible) {
    setLayerVisibility(map, ROADS_LAYER_ID, isVisible);
  }

  function setLiveTrafficVisible(isVisible) {
    LIVE_LAYER_IDS.forEach((layerId) => {
      setLayerVisibility(map, layerId, isVisible);
    });

    if (isVisible) {
      startIncidentPulseTicker(map, state);
    } else {
      stopIncidentPulseTicker(state);
    }
  }

  function destroy() {
    removeTrafficHoverHooks();
    removeCameraHoverHooks();
    removeCameraClickHooks();
    stopIncidentPulseTicker(state);
  }

  return {
    setRoadNetwork,
    updateSnapshot,
    updateCameraImages,
    enableTrafficHoverHooks,
    enableCameraHoverHooks,
    enableCameraClickHooks,
    setRoadsVisible,
    setLiveTrafficVisible,
    destroy
  };
}

/*
Explanation:
- Responsibility: Render and update roads, speed states, and incidents as GPU map layers.
- Data flow: main module sends road/snapshot payloads -> this module diffs and updates map sources/layers.
- Dependencies: Mapbox map instance and GeoJSON payloads from backend.

Beginner check-in questions:
- Why choose native GeoJSON layers here instead of building a custom WebGL shader first?
- How does diff-based updating reduce unnecessary redraw work?
- Why are pulsing incidents rendered in map layers instead of HTML markers?
*/
