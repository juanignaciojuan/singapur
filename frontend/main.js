import {
  fetchAppConfig,
  fetchRoadNetwork,
  fetchTrafficSnapshot,
  fetchTrafficImages
} from './api.js';
import { createBaseMap, waitForMapReady } from './map.js';
import { createTrafficLayerController } from './trafficLayer.js';

const STATUS_ELEMENT_ID = 'system-status';
const TOOLTIP_ELEMENT_ID = 'traffic-tooltip';
const TOGGLE_BASEMAP_ID = 'toggle-basemap';
const TOGGLE_ROADS_ID = 'toggle-roads';
const TOGGLE_LIVE_ID = 'toggle-live';
const CAMERA_WINDOW_ID = 'camera-window';
const CAMERA_WINDOW_TITLE_ID = 'camera-window-title';
const CAMERA_WINDOW_META_ID = 'camera-window-meta';
const CAMERA_WINDOW_BODY_ID = 'camera-window-body';
const CAMERA_WINDOW_CLOSE_ID = 'camera-window-close';

const POLL_MIN_MS = 10000;
const POLL_MAX_MS = 30000;

let map = null;
let trafficController = null;
let pollTimerId = null;
let pollInFlight = false;
let activeTooltipLngLat = null;
let baseLayerIds = [];

const viewState = {
  // Default OFF to prioritize your static roads + live system layers.
  basemapVisible: false,
  roadsVisible: true,
  liveVisible: true
};

function clampPollMs(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  const fallback = 15000;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(POLL_MIN_MS, Math.min(POLL_MAX_MS, parsed));
}

function statusElement() {
  return document.getElementById(STATUS_ELEMENT_ID);
}

function tooltipElement() {
  return document.getElementById(TOOLTIP_ELEMENT_ID);
}

function elementById(elementId) {
  return document.getElementById(elementId);
}

function cameraWindowElement() {
  return elementById(CAMERA_WINDOW_ID);
}

function setCameraWindowVisible(isVisible) {
  const panel = cameraWindowElement();
  if (!panel) {
    return;
  }

  panel.classList.toggle('hidden', !isVisible);
}

function clearCameraWindow() {
  const titleElement = elementById(CAMERA_WINDOW_TITLE_ID);
  const metaElement = elementById(CAMERA_WINDOW_META_ID);
  const bodyElement = elementById(CAMERA_WINDOW_BODY_ID);

  if (titleElement) {
    titleElement.textContent = 'Camera Viewer';
  }

  if (metaElement) {
    metaElement.textContent = 'Click a camera point to open a feed.';
  }

  if (bodyElement) {
    bodyElement.innerHTML = '';
  }

  setCameraWindowVisible(false);
}

function renderCameraWindow({ cameraId, location, timestamp, imageUrl }) {
  const titleElement = elementById(CAMERA_WINDOW_TITLE_ID);
  const metaElement = elementById(CAMERA_WINDOW_META_ID);
  const bodyElement = elementById(CAMERA_WINDOW_BODY_ID);

  if (!titleElement || !metaElement || !bodyElement) {
    return;
  }

  titleElement.textContent = location || 'Traffic camera';

  const timeText = timestamp ? new Date(timestamp).toLocaleTimeString() : 'unknown time';
  metaElement.textContent = `Camera ${cameraId || 'unknown'} | ${timeText}`;

  bodyElement.innerHTML = imageUrl
    ? `<img class="camera-window-image" src="${escapeHtml(imageUrl)}" alt="Traffic camera ${escapeHtml(cameraId || '')}" />`
    : '<div class="camera-window-image-placeholder">Camera image unavailable</div>';

  setCameraWindowVisible(true);
}

function wireCameraWindowControls() {
  const closeButton = elementById(CAMERA_WINDOW_CLOSE_ID);
  if (!closeButton) {
    return;
  }

  closeButton.addEventListener('click', () => {
    clearCameraWindow();
  });
}

function toggleButtonState(button, isOn, label) {
  if (!button) {
    return;
  }

  button.classList.toggle('is-on', isOn);
  button.setAttribute('aria-pressed', isOn ? 'true' : 'false');
  button.textContent = `${label}: ${isOn ? 'ON' : 'OFF'}`;
}

function setBasemapVisible(isVisible) {
  viewState.basemapVisible = isVisible;

  baseLayerIds.forEach((layerId) => {
    if (!map.getLayer(layerId)) {
      return;
    }

    map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
  });

  toggleButtonState(elementById(TOGGLE_BASEMAP_ID), isVisible, 'Basemap');
}

function setRoadsVisible(isVisible) {
  viewState.roadsVisible = isVisible;
  trafficController.setRoadsVisible(isVisible);
  toggleButtonState(elementById(TOGGLE_ROADS_ID), isVisible, 'Static Roads');
}

function setLiveVisible(isVisible) {
  viewState.liveVisible = isVisible;
  trafficController.setLiveTrafficVisible(isVisible);
  toggleButtonState(elementById(TOGGLE_LIVE_ID), isVisible, 'Live Traffic');
}

function wireLayerControls() {
  const basemapButton = elementById(TOGGLE_BASEMAP_ID);
  const roadsButton = elementById(TOGGLE_ROADS_ID);
  const liveButton = elementById(TOGGLE_LIVE_ID);

  if (basemapButton) {
    basemapButton.addEventListener('click', () => {
      setBasemapVisible(!viewState.basemapVisible);
    });
  }

  if (roadsButton) {
    roadsButton.addEventListener('click', () => {
      setRoadsVisible(!viewState.roadsVisible);
    });
  }

  if (liveButton) {
    liveButton.addEventListener('click', () => {
      setLiveVisible(!viewState.liveVisible);
    });
  }

  toggleButtonState(basemapButton, viewState.basemapVisible, 'Basemap');
  toggleButtonState(roadsButton, viewState.roadsVisible, 'Static Roads');
  toggleButtonState(liveButton, viewState.liveVisible, 'Live Traffic');
}

function setStatus(lineA, lineB) {
  const element = statusElement();
  if (!element) {
    return;
  }

  element.textContent = lineB ? `${lineA} | ${lineB}` : lineA;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setTooltipVisibility(visible) {
  const element = tooltipElement();
  if (!element) {
    return;
  }

  element.classList.toggle('hidden', !visible);
}

function positionTooltip(lngLat) {
  const element = tooltipElement();
  if (!element || !map || !lngLat) {
    return;
  }

  const projected = map.project(lngLat);
  element.style.left = `${projected.x + 14}px`;
  element.style.top = `${projected.y + 14}px`;
}

function renderTooltip({ lngLat, title, status, body, imageUrl }) {
  const element = tooltipElement();
  if (!element) {
    return;
  }

  activeTooltipLngLat = lngLat;

  const imageSection = imageUrl
    ? `<img class="tooltip-image" src="${escapeHtml(imageUrl)}" alt="Traffic camera preview" />`
    : '<div class="tooltip-image-placeholder">Camera preview unavailable</div>';

  element.innerHTML = `
    <div class="tooltip-title">${escapeHtml(title)}</div>
    <div class="tooltip-status">Traffic: ${escapeHtml(status)}</div>
    <div class="tooltip-body">${escapeHtml(body)}</div>
    ${imageSection}
  `;

  positionTooltip(lngLat);
  setTooltipVisibility(true);
}

function hideTooltip() {
  activeTooltipLngLat = null;
  setTooltipVisibility(false);
}

async function refreshSnapshot() {
  const snapshot = await fetchTrafficSnapshot();
  const diffResult = trafficController.updateSnapshot(snapshot);

  setStatus(
    `Live @ ${new Date(snapshot.updatedAt).toLocaleTimeString()}`,
    `speed=${diffResult.speedCount} incidents=${diffResult.incidentCount}`
  );
}

async function refreshCameraPoints() {
  const cameraPayload = await fetchTrafficImages({ limit: 500 });
  const cameraResult = trafficController.updateCameraImages(cameraPayload.images || []);

  return cameraResult.cameraCount;
}

function startPolling(intervalMs) {
  if (pollTimerId !== null) {
    window.clearInterval(pollTimerId);
    pollTimerId = null;
  }

  pollTimerId = window.setInterval(async () => {
    if (pollInFlight) {
      return;
    }

    pollInFlight = true;

    try {
      await refreshSnapshot();
      await refreshCameraPoints();
    } catch (error) {
      console.error('Polling failed:', error);
      setStatus('Polling error', error.message);
    } finally {
      pollInFlight = false;
    }
  }, intervalMs);
}

function registerTrafficHoverHooks() {
  trafficController.enableTrafficHoverHooks({
    onHover: ({ feature, lngLat }) => {
      const props = feature.properties || {};
      const location = props.location || props.roadName || 'Road segment';
      const status = props.status || 'unknown';
      const message = props.message || 'No incident note';

      renderTooltip({
        lngLat,
        title: location,
        status,
        body: message,
        imageUrl: null
      });
    },
    onLeave: () => {
      hideTooltip();
    }
  });
}

function registerCameraClickHooks() {
  trafficController.enableCameraClickHooks({
    onClick: ({ feature }) => {
      const props = feature.properties || {};

      renderCameraWindow({
        cameraId: props.cameraId,
        location: props.location || 'Traffic camera',
        timestamp: props.timestamp,
        imageUrl: props.imageUrl || ''
      });
    }
  });
}

async function bootstrap() {
  setStatus('Booting urban system');

  const config = await fetchAppConfig();
  const pollMs = clampPollMs(config.pollIntervalMs);

  map = createBaseMap({
    containerId: 'map',
    accessToken: config.mapboxAccessToken
  });

  await waitForMapReady(map);

  // Capture existing style layers before custom data layers are added.
  baseLayerIds = (map.getStyle().layers || []).map((layer) => layer.id);

  trafficController = createTrafficLayerController(map);
  wireLayerControls();
  wireCameraWindowControls();

  const roadNetwork = await fetchRoadNetwork();
  trafficController.setRoadNetwork(roadNetwork);

  await refreshSnapshot();
  await refreshCameraPoints();
  startPolling(pollMs);
  registerTrafficHoverHooks();
  registerCameraClickHooks();
  setBasemapVisible(viewState.basemapVisible);

  map.on('move', () => {
    if (activeTooltipLngLat) {
      positionTooltip(activeTooltipLngLat);
    }
  });

  setStatus('Urban traffic system online', `polling=${pollMs}ms`);
}

bootstrap().catch((error) => {
  console.error('Application bootstrap failed:', error);
  setStatus('Startup failed', error.message);
});

/*
Explanation:
- Responsibility: Orchestrate app lifecycle (init map, fetch data, poll updates, handle hover interaction).
- Data flow: Config + roads + snapshot -> traffic layer controller -> map updates + tooltip updates.
- Dependencies: api module, map module, traffic layer module.

Beginner check-in questions:
- Why is polling bounded between 10 and 30 seconds?
- Why avoid full map reloads when updating real-time data?
- How do reusable hover hooks make phase-2 interactions easier to extend?
*/
