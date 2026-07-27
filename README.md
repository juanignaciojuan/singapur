# Singapore Urban Traffic System

Production-leaning local prototype for visualizing Singapore traffic as a live computational urban map.

## Stack

- Frontend: Mapbox GL JS + vanilla ES modules
- Backend: Node.js + Express + Axios + dotenv
- Data: LTA DataMall (Traffic Speed Bands, Traffic Incidents, Traffic Images) + static Singapore road network

## Project Structure

```text
backend/
  cache/
    memoryCache.js
  routes/
    traffic.js
  services/
    ltaService.js
  .env.example
  package.json
  server.js
frontend/
  api.js
  index.html
  main.js
  map.js
  style.css
  trafficLayer.js
SingaporeMap_Line.json
SingaporeMap_Polygon.json
README.md
```

## Why This Rendering Approach

This implementation uses Mapbox native GeoJSON layers for dynamic traffic state instead of a custom shader layer.

Reason:
- More stable and faster to maintain for a production-leaning prototype.
- Efficient GPU rendering with line/circle layers already optimized by Mapbox GL JS.
- Supports diff-based source updates and hover interaction without introducing custom WebGL complexity too early.

## Setup (Step by Step)

1. Install backend dependencies:

```bash
cd backend
npm install
```

2. Create backend environment file:

```bash
copy .env.example .env
```

3. Fill required keys in backend .env:

- LTA_ACCOUNT_KEY
- MAPBOX_ACCESS_TOKEN

4. Run the server from backend:

```bash
npm start
```

5. Open the app:

- http://localhost:3000

## Runtime Behavior

- Frontend polls backend every 10 to 30 seconds (default 15 seconds).
- Backend caches LTA responses to reduce upstream load and respect shared API usage.
- Frontend applies diff-based updates and only pushes source updates when data changed.
- Hovering traffic features triggers backend image lookup for nearby camera previews.

## API Endpoints

- GET /api/health
- GET /api/config
- GET /api/traffic/snapshot
- GET /api/traffic/speed-bands
- GET /api/traffic/incidents
- GET /api/traffic/images?lon=103.8&lat=1.32&radiusKm=2&limit=1
- GET /api/traffic/roads

## Security Notes

- LTA key is backend-only via .env.
- Frontend never calls LTA directly.
- Request frequency is bounded by polling + server cache TTL.

## Geospatial Notes

- Static roads are sanitized to valid [lon, lat] pairs before rendering.
- Dynamic LTA features are normalized and bounded to Singapore coordinate range.
- Missing segment coordinates fall back to point rendering, so sparse records still remain visible.
