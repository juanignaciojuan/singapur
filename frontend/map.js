// Map setup module for Singapore urban visualization.
// We use Mapbox GL JS native map/layer primitives for stable performance.
export function createBaseMap({ containerId, accessToken }) {
  if (!accessToken) {
    throw new Error('Missing Mapbox access token from backend /api/config');
  }

  mapboxgl.accessToken = accessToken;

  const map = new mapboxgl.Map({
    container: containerId,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [103.8198, 1.3521],
    zoom: 11.3,
    pitch: 0,
    bearing: 0,
    antialias: true,
    attributionControl: false
  });

  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  map.addControl(
    new mapboxgl.NavigationControl({
      showCompass: false,
      showZoom: true
    }),
    'top-right'
  );

  map.once('load', () => {
    hideSymbolLayers(map);
  });

  return map;
}

export function waitForMapReady(map) {
  return new Promise((resolve) => {
    if (map.isStyleLoaded()) {
      resolve();
      return;
    }

    map.once('load', resolve);
  });
}

function hideSymbolLayers(map) {
  const style = map.getStyle();
  const layers = Array.isArray(style.layers) ? style.layers : [];

  // Minimal system aesthetic: hide labels/icons so traffic dynamics are the focus.
  layers
    .filter((layer) => layer.type === 'symbol')
    .forEach((layer) => {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    });
}

/*
Explanation:
- Responsibility: Initialize the Mapbox map with a controlled 2D, dark baseline.
- Data flow: main module requests config -> this module creates map -> traffic layers attach later.
- Dependencies: Global mapboxgl loaded in index.html.

Beginner check-in questions:
- How does Mapbox convert coordinates into screen space?
- Why keep pitch at 0 for this computational systems view?
- Why use WebGL map layers instead of DOM elements for many geospatial objects?
*/
