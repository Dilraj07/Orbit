import { useState, useEffect } from "react";
import axios from "axios";
import Globe from "./components/Globe";
import { Asteroid, NewsEvent, SatelliteTelemetry } from "./types";
import { AlertCircle, Rocket, Globe as GlobeIcon, Activity, Radio, Cpu, Satellite, ShieldAlert, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { processNewsWithAI } from "./lib/newsProcessor";

export default function App() {
  const [asteroids, setAsteroids] = useState<Asteroid[]>([]);
  const [news, setNews] = useState<NewsEvent[]>([]);
  const [telemetry, setTelemetry] = useState<SatelliteTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date().toISOString().split('T')[1].split('.')[0]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toISOString().split('T')[1].split('.')[0]);
    }, 1000);

    const satelliteTimer = setInterval(async () => {
      try {
        const res = await axios.get("/api/satellites");
        if (res.data && res.data.length > 0) {
          setTelemetry(res.data[0]);
        }
      } catch (err) {
        console.error("Satellite link dropped:", err);
      }
    }, 5000); 

    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await axios.get("/api/asteroids");
        setAsteroids(res.data);
      } catch (err) {
        setError("Telemetry link failed. Retrying...");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const fetchNews = async () => {
      try {
        setNewsLoading(true);
        const res = await axios.get("/api/news/raw");
        if (res.data && Array.isArray(res.data)) {
          const processed = await processNewsWithAI(res.data);
          setNews(processed);
        } else {
          console.warn("Raw news sync returned invalid data shape:", res.data);
        }
      } catch (err) {
        console.error("News sync failed:", err);
      } finally {
        setNewsLoading(false);
      }
    };

    fetchData();
    fetchNews();
    
    const initialTelemetry = async () => {
      try {
        const res = await axios.get("/api/satellites");
        if (res.data && res.data.length > 0) {
          setTelemetry(res.data[0]);
        }
      } catch (err) { console.error(err); }
    };
    initialTelemetry();

    return () => {
      clearInterval(timer);
      clearInterval(satelliteTimer);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
      <header>
        <div className="flex items-center gap-4">
          <div className="font-serif text-2xl font-bold tracking-tighter">Orbit</div>
          <div className="badge bg-[#3b82f6]">Live Stream</div>
        </div>
        <div className="flex gap-6 font-mono text-[11px] text-[#9ca3af] uppercase tracking-wider items-center">
          <div className="flex items-center gap-2">
            <Radio className="w-3 h-3 text-[#10b981]" />
            <span>System: Nominal</span>
          </div>
          <span className="opacity-20">|</span>
          <div className="flex items-center gap-2">
            <span>UTC: {currentTime}</span>
          </div>
          <span className="opacity-20">|</span>
          <div className="flex items-center gap-2">
            <span>Active Assets: 1,422</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Satellite className="w-4 h-4 text-[#3b82f6]" />
        </div>
      </header>

      <div className="main-layout">
        {/* Left Panel: Deep Space Threats */}
        <aside className="panel">
          <div className="panel-header">
            <div className="panel-subtitle">Deep Space</div>
            <div className="panel-title">Threat Monitor</div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-40 text-[#9ca3af]">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <Activity className="w-6 h-6 opacity-50" />
                  </motion.div>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-950/20 text-[#ef4444] border-l-2 border-[#ef4444] rounded text-xs">
                  {error}
                </div>
              ) : (
                asteroids.map((ast) => (
                  <motion.div
                    key={ast.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`data-item relative ${ast.is_potentially_hazardous ? 'warning' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="data-label font-bold text-gray-100">{ast.name}</div>
                      {ast.is_potentially_hazardous && (
                        <span className="flex items-center gap-1 text-[8px] bg-red-600/20 text-red-500 px-1 border border-red-500/30 rounded font-bold animate-pulse">
                          <ShieldAlert className="w-2.5 h-2.5" />
                          HAZARD
                        </span>
                      )}
                    </div>
                    <div className="data-value mb-1 underline decoration-[#222] text-sm font-mono">
                      {(Math.round(parseFloat(ast.miss_distance)) / 149597870).toFixed(4)} AU
                    </div>
                    <div className="data-label text-[10px] opacity-70 leading-relaxed">
                      MAG: {ast.absolute_magnitude.toFixed(1)}H • Ø {Math.round(ast.estimated_diameter)}m<br/>
                      SPD: {Math.round(parseFloat(ast.velocity) * 3600).toLocaleString()} km/h
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </aside>

        {/* Center: Globe */}
        <section className="relative flex items-center justify-center bg-[radial-gradient(circle_at_center,#111_0%,#000_100%)]">
          <Globe asteroids={asteroids} news={news} />
        </section>

        {/* Right Panel: Global Events & ISS Telemetry */}
        <aside className="panel">
          <div className="flex flex-col h-full overflow-hidden">
            <div className="panel-header mb-4">
              <div className="panel-subtitle">Geospatial</div>
              <div className="panel-title flex items-center gap-2">
                Global Events
                {news.length > 0 && (
                  <span className="text-[9px] bg-[#3b82f6]/20 text-[#3b82f6] px-1.5 rounded uppercase font-bold animate-pulse">
                    Live Analysis
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
              {newsLoading ? (
                <div className="flex flex-col items-center justify-center h-40 text-[#9ca3af]">
                  <Activity className="w-4 h-4 animate-spin opacity-30" />
                  <span className="text-[9px] mt-2 uppercase tracking-widest font-mono">Agentic processing...</span>
                </div>
              ) : news.length === 0 ? (
                <div className="text-[10px] text-[#9ca3af] opacity-50 font-mono py-4 uppercase">
                  No geocoded events found.
                </div>
              ) : (
                news.map((item, idx) => (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={idx}
                    className={`p-2 border-l-2 mb-1 group cursor-pointer transition-all ${
                      (item.severity || 0) > 7 
                        ? 'bg-red-500/5 border-red-500 hover:bg-red-500/10' 
                        : 'bg-[#111] border-[#3b82f6] hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[8px] font-bold uppercase tracking-wider ${
                        (item.severity || 0) > 7 ? 'text-red-400' : 'text-[#3b82f6]'
                      }`}>
                        {item.topic || 'General'}
                      </span>
                      <span className="text-[8px] font-mono opacity-40">
                        LEV: {item.severity || 1}
                      </span>
                    </div>
                    <div className={`text-[11px] leading-tight font-medium mb-1 ${
                      (item.severity || 0) > 7 ? 'text-red-100' : 'text-gray-200'
                    }`}>
                      {item.brief || item.title}
                    </div>
                    <div className="flex items-center gap-2 text-[9px] opacity-60 font-mono uppercase mt-1 text-[#3b82f6]">
                      <GlobeIcon className="w-2.5 h-2.5" />
                      <span>{item.location || `${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}`}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-[#222]">
              <div className="panel-header mb-4">
                <div className="panel-subtitle">Telemetry</div>
                <div className="panel-title">ISS Tracking</div>
              </div>
              <div className="space-y-3">
                <div className="data-item">
                  <div className="data-label">Altitude</div>
                  <div className="data-value">{telemetry ? `${Math.round(telemetry.altitude).toLocaleString()} km` : '---'}</div>
                </div>
                <div className="data-item">
                  <div className="data-label">Orbital Speed</div>
                  <div className="data-value">{telemetry ? `${Math.round(telemetry.velocity).toLocaleString()} km/h` : '---'}</div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="footer-stats">
        <div className="flex items-center gap-2">
          <Cpu className="w-3 h-3 text-[#3b82f6]" />
          <span>CesiumJS 1.121</span>
        </div>
        <span>Memory: 412MB / 2048MB</span>
        <span>LATENCY: 42ms</span>
        <span className="ml-auto opacity-50">© 2026 Orbital Echo Labs</span>
      </footer>
    </div>
  );
}
