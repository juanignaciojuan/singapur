const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const trafficRouter = require('./routes/traffic');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);

function missingRequiredEnvVars() {
  const requiredKeys = ['LTA_ACCOUNT_KEY', 'MAPBOX_ACCESS_TOKEN'];

  return requiredKeys.filter((key) => {
    const value = process.env[key];
    return !value || value.startsWith('your_');
  });
}

const missingKeys = missingRequiredEnvVars();

if (missingKeys.length > 0) {
  console.error('Startup blocked: missing required environment values.');
  console.error(`Missing: ${missingKeys.join(', ')}`);
  console.error('Create backend/.env from backend/.env.example and add real keys.');
  process.exit(1);
}

const app = express();

// Keep the HTTP surface minimal for production-leaning defaults.
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'sg-urban-traffic-backend',
    time: new Date().toISOString()
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    // Mapbox token is public by design, but centralized here for deployment consistency.
    mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN || '',
    pollIntervalMs: Number.parseInt(process.env.CACHE_TTL_MS || '15000', 10)
  });
});

app.use('/api', trafficRouter);

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }

  return res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Request failed:', error.message);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

app.listen(PORT, () => {
  console.log(`Urban traffic server running at http://localhost:${PORT}`);
});

/*
Explanation:
- Responsibility: Start the backend API and serve frontend static files from one runtime.
- Data flow: Browser -> Express API/static server -> LTA proxy routes and map assets.
- Dependencies: Express for web server, dotenv for environment config.

Beginner check-in questions:
- Why do we separate backend and frontend in this system?
- Why keep API keys in the backend .env file?
- What changes when this app is deployed behind a reverse proxy?
*/
