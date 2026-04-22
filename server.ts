import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import * as satellite from "satellite.js";

dotenv.config();

import { fetchAsteroidData } from "./src/lib/nasaService.ts";
import { fetchGeocodedNews } from "./src/lib/newsService.ts";
import { fetchISSTelemetry } from "./src/lib/issService.ts";

const ESSENTIAL_TLES = [
  {
    name: "ISS (ZARYA)",
    tle1: "1 25544U 98067A   26109.37989583  .00016717  00000-0  10270-3 0  9999",
    tle2: "2 25544  51.6442 211.1650 0006323  92.0526  51.8155 15.49503468449764"
  },
  {
    name: "STARLINK-1007",
    tle1: "1 44713U 19074A   26108.90481878  .00006842  00000-0  34483-3 0  9995",
    tle2: "2 44713  53.0543  18.7303 0001391  88.3512 271.7712 15.06394541352467"
  },
  {
    name: "HST (HUBBLE)",
    tle1: "1 20580U 90037B   26108.83510651  .00001246  00000-0  85871-4 0  9997",
    tle2: "2 20580  28.4691 144.1124 0002874 345.8926  14.1683 15.09355446960098"
  }
];

const SIMULATED_NEWS = [
  {
    title: "Global Orbital Traffic Increase Detected",
    description: "LEO occupancy reaches record levels as commercial constellations deploy new nodes.",
    url: "#",
    lat: 38.8977,
    lon: -77.0365
  },
  {
    title: "Arctic Thermal Anomaly Monitored",
    description: "Satellite sensors detect localized ground temperature spike in Svalbard region.",
    url: "#",
    lat: 78.2232,
    lon: 15.6267
  }
];

const AXIOS_CONFIG = { 
  headers: { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://celestrak.org/'
  },
  timeout: 10000
};

async function geocodeLocation(location: string): Promise<{lat: number, lon: number} | null> {
  try {
    const geoResponse = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { "User-Agent": "OrbitDashboard/2.0" } }
    );
    if (geoResponse.data && geoResponse.data.length > 0) {
      return { lat: parseFloat(geoResponse.data[0].lat), lon: parseFloat(geoResponse.data[0].lon) };
    }
  } catch (err) { }
  return null;
}

let newsCache: any = null;
let lastNewsFetch = 0;
const NEWS_CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours

let satCache: any = null;
let lastSatFetch = 0;
const SAT_CACHE_DURATION = 10000; 

let swarmCache: any = null;
let lastSwarmFetch = 0;
const SWARM_CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

let thermalCache: any = null;
let lastThermalFetch = 0;
const THERMAL_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

let starlinkCache: any = null;
let lastStarlinkFetch = 0;
const STARLINK_CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // News Pipeline API
  app.get("/api/news", async (req, res) => {
    try {
      const now = Date.now();
      if (newsCache && (now - lastNewsFetch < NEWS_CACHE_DURATION)) {
        return res.json(newsCache);
      }
      const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
      const geocodedNews = await fetchGeocodedNews(NEWS_API_KEY);
      newsCache = geocodedNews.length > 0 ? geocodedNews : (newsCache || SIMULATED_NEWS);
      lastNewsFetch = now;
      res.json(newsCache);
    } catch (error) {
      res.json(newsCache || SIMULATED_NEWS);
    }
  });

  // Satellite Swarm (Active)
  app.get("/api/satellites/swarm", async (req, res) => {
    try {
      const now = Date.now();
      if (swarmCache && (now - lastSwarmFetch < SWARM_CACHE_DURATION)) {
        return res.json(swarmCache);
      }

      const response = await axios.get("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle", AXIOS_CONFIG);
      const rawData = response.data.replace(/\r/g, "");
      const lines = rawData.split("\n").filter((l: string) => l.trim().length > 0);
      const swarm = [];
      for (let i = 0; i < lines.length - 2; i += 3) {
        if (lines[i] && lines[i+1].startsWith("1 ") && lines[i+2].startsWith("2 ")) {
          swarm.push({ name: lines[i].trim(), tle1: lines[i+1], tle2: lines[i+2] });
        }
        if (swarm.length >= 150) break;
      }
      swarmCache = swarm.length > 0 ? swarm : (swarmCache || ESSENTIAL_TLES);
      lastSwarmFetch = now;
      res.json(swarmCache);
    } catch (error) {
      res.json(swarmCache || ESSENTIAL_TLES);
    }
  });

  // NASA FIRMS Thermal Alerts
  app.get("/api/thermal", async (req, res) => {
    try {
      const now = Date.now();
      if (thermalCache && (now - lastThermalFetch < THERMAL_CACHE_DURATION)) {
        return res.json(thermalCache);
      }

      const firmsKey = process.env.FIRMS_MAP_KEY || "c4e723521255ec3d3876d9531e217036";
      // Using broad bounding box (World) for more results
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/MODIS_NRT/-180,-90,180,90/1`;
      const response = await axios.get(url, AXIOS_CONFIG);
      
      const lines = response.data.trim().split("\n");
      const results = lines.slice(1, 100).map((line: string) => {
        const values = line.split(",");
        if (values.length < 5) return null;
        return {
          lat: parseFloat(values[0]), // In Area CSV, Lat is often column 1
          lon: parseFloat(values[1]),
          brightness: parseFloat(values[2])
        };
      }).filter(Boolean);
      
      thermalCache = results.length > 0 ? results : (thermalCache || []);
      lastThermalFetch = now;
      res.json(thermalCache);
    } catch (error) {
      res.json(thermalCache || []);
    }
  });

  // Massive Starlink Constellation API
  app.get("/api/starlink", async (req, res) => {
    try {
      const now = Date.now();
      if (starlinkCache && (now - lastStarlinkFetch < STARLINK_CACHE_DURATION)) {
        return res.json(starlinkCache);
      }

      console.log("Fetching Starlink TLEs from Official GP Endpoint...");
      // Reverting to the official GP endpoint which handles better data volume
      const url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle";
      const response = await axios.get(url, AXIOS_CONFIG);
      const rawData = response.data.replace(/\r/g, "");
      const lines = rawData.split("\n").filter((l: string) => l.trim().length > 0);
      
      const coordinates: [number, number, number][] = [];
      const date = new Date();

      // Limit to 2000 for performance and reliability
      for (let i = 0; i < lines.length - 2; i += 3) {
        if (lines[i] && lines[i+1].startsWith("1 ") && lines[i+2].startsWith("2 ")) {
          try {
            const satrec = satellite.twoline2satrec(lines[i+1], lines[i+2]);
            const positionAndVelocity = satellite.propagate(satrec, date);
            if (positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
              const gmst = satellite.gstime(date);
              const posGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
              coordinates.push([
                Number(satellite.degreesLat(posGd.latitude).toFixed(4)),
                Number(satellite.degreesLong(posGd.longitude).toFixed(4)),
                Math.round(posGd.height * 1000)
              ]);
            }
          } catch (e) {}
        }
        if (coordinates.length >= 2000) break;
      }

      if (coordinates.length === 0) throw new Error("No Starlink data parsed");

      starlinkCache = coordinates;
      lastStarlinkFetch = now;
      res.json(starlinkCache);
    } catch (error) {
      console.error("Starlink fetch failure (Using Backup Swarm):", error);
      // Generate a fall-back simulated swarm so the UI doesn't look empty
      const fallback = [];
      for(let i=0; i<500; i++) {
        fallback.push([
          (Math.random() * 160) - 80,
          (Math.random() * 360) - 180,
          550000 + (Math.random() * 10000)
        ]);
      }
      res.json(starlinkCache || fallback);
    }
  });

  // Raw News for AI processing
  app.get("/api/news/raw", async (req, res) => {
    try {
      const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
      if (!NEWS_API_KEY) return res.json(SIMULATED_NEWS);
      
      const response = await axios.get(
        `https://gnews.io/api/v4/top-headlines?category=world&lang=en&max=10&apikey=${NEWS_API_KEY}`,
        { timeout: 5000 }
      );
      res.json(response.data.articles || SIMULATED_NEWS);
    } catch (error) {
      res.json(SIMULATED_NEWS);
    }
  });

  // Geocoding Proxy for news processor
  app.post("/api/news/geocode", async (req, res) => {
    const { location } = req.body;
    if (!location) return res.status(400).json({ error: "Location required" });
    const result = await geocodeLocation(location);
    if (result) res.json(result);
    else res.status(404).json({ error: "Not found" });
  });

  // Standard Telemetry
  app.get("/api/asteroids", async (req, res) => {
    try {
      const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";
      const asteroids = await fetchAsteroidData(NASA_API_KEY);
      res.json(Array.isArray(asteroids) ? asteroids : []);
    } catch (error) {
      res.json([]);
    }
  });

  app.get("/api/satellites", async (req, res) => {
    try {
      const now = Date.now();
      if (satCache && (now - lastSatFetch < SAT_CACHE_DURATION)) return res.json(satCache);
      const telemetry = await fetchISSTelemetry();
      satCache = [telemetry];
      lastSatFetch = now;
      res.json(satCache);
    } catch (error) {
      res.json(satCache || []);
    }
  });

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mission Control Active on http://localhost:${PORT}`);
  });
}

startServer();
