import React, { useEffect, useState, useRef, useMemo } from "react";
import axios from "axios";
import * as satellite from "satellite.js";
import { 
  Viewer, 
  Entity, 
  PointGraphics, 
  LabelGraphics,
  PathGraphics,
  PolylineGraphics,
  EntityDescription 
} from "resium";
import { 
  Ion, 
  Cartesian3, 
  Color, 
  VerticalOrigin,
  HorizontalOrigin,
  LabelStyle,
  HeightReference,
  Cartesian2,
  JulianDate,
  SampledPositionProperty,
  ClockRange,
  ClockStep,
  PolylineDashMaterialProperty,
  CallbackProperty
} from "cesium";
import { Asteroid, NewsEvent, SatelliteTelemetry, SatelliteTLE, ThermalAlert } from "../types";

// Standard TLE for ISS (approximate)
const ISS_TLE = [
  "1 25544U 98067A   26109.37989583  .00016717  00000-0  10270-3 0  9999",
  "2 25544  51.6442 211.1650 0006323  92.0526  51.8155 15.49503468449764"
];

// Ground Stations
const GROUND_STATIONS = [
  { name: "Houston DSN", lat: 29.7604, lon: -95.3698 },
  { name: "Madrid Deep Space", lat: 40.4168, lon: -3.7038 },
  { name: "Canberra Station", lat: -35.2809, lon: 149.1300 },
  { name: "Tokyo Ground Link", lat: 35.6762, lon: 139.6503 },
];

export default function Globe({ asteroids: initialAsteroids = [], news: initialNews = [] }: { asteroids?: Asteroid[], news?: NewsEvent[] }) {
  const [asteroids, setAsteroids] = useState<Asteroid[]>(initialAsteroids);
  const [satellites, setSatellites] = useState<SatelliteTelemetry[]>([]);
  const [swarm, setSwarm] = useState<SatelliteTLE[]>([]);
  const [thermal, setThermal] = useState<ThermalAlert[]>([]);
  const [news, setNews] = useState<NewsEvent[]>(initialNews);
  const [loading, setLoading] = useState(true);
  const [missionTime, setMissionTime] = useState(JulianDate.now());
  const [showStarlink, setShowStarlink] = useState(false);
  const [starlinkData, setStarlinkData] = useState<[number, number, number][]>([]);
  
  const viewerRef = useRef<any>(null);
  const swarmPathProperties = useRef<Map<string, SampledPositionProperty>>(new Map());

  // Manually manage swarm path history for trailing effect
  useEffect(() => {
    if (swarm.length === 0) return;
    
    swarm.forEach(sat => {
      if (!swarmPathProperties.current.has(sat.name)) {
        swarmPathProperties.current.set(sat.name, new SampledPositionProperty());
      }
      const prop = swarmPathProperties.current.get(sat.name)!;
      try {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        const date = JulianDate.toDate(missionTime);
        const positionAndVelocity = satellite.propagate(satrec, date);
        const positionEci = positionAndVelocity.position;
        if (typeof positionEci !== 'boolean' && positionEci) {
          const gmst = satellite.gstime(date);
          const gd = satellite.eciToGeodetic(positionEci, gmst);
          prop.addSample(missionTime, Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height * 1000));
        }
      } catch (e) {}
    });
  }, [missionTime, swarm]);

  // Synchronize swarm with Cesium clock
  const swarmProperties = useMemo(() => {
    return swarm.map(sat => {
      const property = swarmPathProperties.current.get(sat.name);
      return { name: sat.name, property };
    }).filter(s => s.property);
  }, [swarm]);

  // Update local mission time for UI and station uplinks
  useEffect(() => {
    const timer = setInterval(() => {
      if (viewerRef.current?.cesiumElement) {
        setMissionTime(viewerRef.current.cesiumElement.clock.currentTime);
      }
    }, 100); 
    return () => clearInterval(timer);
  }, []);

  // Sync props to state if they change
  useEffect(() => {
    if (initialAsteroids.length > 0) setAsteroids(initialAsteroids);
    if (initialNews.length > 0) setNews(initialNews);
  }, [initialAsteroids, initialNews]);

  // Orbital Path Calculation for ISS
  const issPathProperty = useMemo(() => {
    const property = new SampledPositionProperty();
    const satrec = satellite.twoline2satrec(ISS_TLE[0], ISS_TLE[1]);
    const start = new Date();
    
    // Calculate for next 90 minutes, 1-minute intervals
    for (let i = 0; i <= 90; i++) {
        const time = new Date(start.getTime() + i * 60000);
        
        const positionAndVelocity = satellite.propagate(satrec, time);
        const positionEci = positionAndVelocity.position;
        
        if (typeof positionEci !== 'boolean' && positionEci) {
            const gmst = satellite.gstime(time);
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);
            
            const position = Cartesian3.fromRadians(
                positionGd.longitude, 
                positionGd.latitude, 
                positionGd.height * 1000
            );
            
            property.addSample(JulianDate.fromDate(time), position);
        }
    }
    return property;
  }, []);

  // Phase 3: Data Fetching Logic (Unified visualization fetch)
  useEffect(() => {
    // Synchronize viewer clock with mission start
    if (viewerRef.current?.cesiumElement && issPathProperty) {
      const viewer = viewerRef.current.cesiumElement;
      const start = JulianDate.now();
      viewer.clock.startTime = start.clone();
      viewer.clock.stopTime = JulianDate.addMinutes(start, 90, new JulianDate());
      viewer.clock.currentTime = start.clone();
      viewer.clock.clockRange = ClockRange.LOOP_STOP;
      viewer.clock.shouldAnimate = true;
      viewer.clock.multiplier = 600; // 600x speed for visible revolution
    }
  }, [issPathProperty, viewerRef.current]);

  // Massive Starlink Data Fetching
  useEffect(() => {
    if (showStarlink && starlinkData.length === 0) {
      const fetchStarlink = async () => {
        try {
          const res = await axios.get("/api/starlink");
          setStarlinkData(res.data);
        } catch (e) {
          console.error("Failed to load Starlink constellation:", e);
        }
      };
      fetchStarlink();
    }
  }, [showStarlink]);

  // Efficient Starlink Entity Management (Bypassing React Reconciliation for 6,000+ entities)
  const starlinkEntitiesRef = useRef<any[]>([]);
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    if (showStarlink && starlinkData.length > 0) {
      // Clear existing first
      starlinkEntitiesRef.current.forEach(e => viewer.entities.remove(e));
      starlinkEntitiesRef.current = [];

      starlinkData.forEach((pos, idx) => {
        const ent = viewer.entities.add({
          position: Cartesian3.fromDegrees(pos[1], pos[0], pos[2]),
          point: {
            pixelSize: 2,
            color: Color.WHITE.withAlpha(0.4),
            distanceDisplayCondition: { near: 0, far: 30000000 }
          }
        });
        starlinkEntitiesRef.current.push(ent);
      });
    } else if (!showStarlink) {
      starlinkEntitiesRef.current.forEach(e => viewer.entities.remove(e));
      starlinkEntitiesRef.current = [];
    }

    return () => {
      starlinkEntitiesRef.current.forEach(e => viewer.entities.remove(e));
      starlinkEntitiesRef.current = [];
    };
  }, [showStarlink, starlinkData]);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        // Individual try/catch for each to allow partial dashboard loading
        const fetchSat = async () => {
          try {
            const res = await axios.get("/api/satellites");
            setSatellites(res.data);
          } catch (e) { console.error("ISS telemetry failed", e); }
        };

        const fetchSwarm = async () => {
          try {
            const res = await axios.get("/api/satellites/swarm");
            setSwarm(res.data);
          } catch (e) { console.error("Swarm telemetry failed", e); }
        };

        const fetchThermal = async () => {
          try {
            const res = await axios.get("/api/thermal");
            setThermal(res.data);
          } catch (e) { console.error("Thermal data failed", e); }
        };

        await Promise.allSettled([fetchSat(), fetchSwarm(), fetchThermal()]);
      } catch (err) {
        console.error("Critical Telemetry Sync Failure:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
    
    // Interval for real-time satellite updates
    const satInterval = setInterval(async () => {
      try {
        const satRes = await axios.get("/api/satellites");
        setSatellites(satRes.data);
      } catch (err) {
        console.error("Satellite link dropped:", err);
      }
    }, 5000);

    return () => clearInterval(satInterval);
  }, []);

  useEffect(() => {
    if (import.meta.env.VITE_CESIUM_ION_TOKEN) {
      Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
    }
    
    if (viewerRef.current?.cesiumElement) {
      const viewer = viewerRef.current.cesiumElement;
      
      // Sophisticated Dark mode viewing adjustments
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.showNightWaters = true;
      viewer.scene.globe.showWaterMask = true;
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.globe.showGroundAtmosphere = true;
      
      // Remove default credit for cleaner dashboard
      if (viewer.cesiumWidget.creditContainer) {
        viewer.cesiumWidget.creditContainer.style.display = "none";
      }
    }
  }, []);

  return (
    <div className="w-full h-full relative bg-black overflow-hidden flex items-center justify-center">
      {loading && (
        <div className="absolute z-50 flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#9ca3af]">Initial Orbit Sync...</span>
        </div>
      )}

      <Viewer
        ref={viewerRef}
        full
        timeline={false}
        animation={false}
        baseLayerPicker={false}
        geocoder={false}
        homeButton={false}
        infoBox={true}
        navigationHelpButton={false}
        sceneModePicker={false}
        selectionIndicator={false}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Deep Space Threats: Asteroids (Glowing Red) */}
        {Array.isArray(asteroids) && asteroids.map((ast) => (
          <Entity
            key={`ast-${ast.id}`}
            name={`Near-Earth Object: ${ast.name}`}
            position={Cartesian3.fromDegrees(
              0, 0, 10000000 // Simplified: Visualizing distance from Earth core for dashboard effect
            )}
            description={`
              <div style="font-family: sans-serif; padding: 10px; background: #000; color: #fff;">
                <h3 style="margin: 0; color: #ef4444;">${ast.name}</h3>
                <p><b>Miss Distance:</b> ${ast.miss_distance} km</p>
                <p><b>Diameter:</b> ${Math.round(ast.estimated_diameter)} m</p>
                <p><b>Velocity:</b> ${Math.round(parseFloat(ast.velocity)).toLocaleString()} km/h</p>
                <p><b>Hazard status:</b> ${ast.is_potentially_hazardous ? "CRITICAL" : "STABLE"}</p>
              </div>
            `}
          >
            <PointGraphics
              pixelSize={10}
              color={Color.fromCssColorString("#ef4444")}
              outlineColor={Color.WHITE.withAlpha(0.5)}
              outlineWidth={1}
            />
            <LabelGraphics
              text={ast.name}
              font="10px JetBrains Mono"
              style={LabelStyle.FILL_AND_OUTLINE}
              outlineWidth={2}
              verticalOrigin={VerticalOrigin.BOTTOM}
              pixelOffset={new Cartesian2(0, -12)}
              showBackground
              backgroundColor={Color.BLACK.withAlpha(0.7)}
            />
          </Entity>
        ))}

        {/* Kessler Swarm: Dense satellite field */}
        {swarmProperties.map((sat, idx) => (
          <Entity
            key={`swarm-${idx}`}
            name={sat?.name}
            position={sat?.property as any}
          >
            <PointGraphics
              pixelSize={4}
              color={Color.AQUA}
              outlineColor={Color.WHITE.withAlpha(0.6)}
              outlineWidth={1}
              distanceDisplayCondition={{ near: 0, far: 20000000 }}
            />
            <PathGraphics
              material={Color.AQUA.withAlpha(0.4)}
              width={1}
              leadTime={0}
              trailTime={300} // Short disappearing trail
            />
          </Entity>
        ))}

        {/* NASA Thermal Hotspots: Subtle anomalies */}
        {Array.isArray(thermal) && thermal.map((t, idx) => (
          <Entity
            key={`thermal-${idx}`}
            name="Active Heat Signature"
            position={Cartesian3.fromDegrees(t.lon, t.lat, 100)}
            description={`Detected Ground Temperature anomaly: ${t.brightness} K. Likely fire or industrial heat event.`}
          >
            <PointGraphics
              pixelSize={5}
              color={Color.ORANGE.withAlpha(0.7)}
              outlineColor={Color.YELLOW}
              outlineWidth={1}
              heightReference={HeightReference.CLAMP_TO_GROUND}
            />
          </Entity>
        ))}

        {/* Ground Stations & Uplinks */}
        {GROUND_STATIONS.map((gs, idx) => {
          const iss = Array.isArray(satellites) ? satellites.find(s => s.name?.includes("ISS")) : null;
          return (
            <React.Fragment key={`gs-${idx}`}>
              {/* Station Point */}
              <Entity
                name={gs.name}
                position={Cartesian3.fromDegrees(gs.lon, gs.lat)}
              >
                <PointGraphics
                  pixelSize={8}
                  color={Color.YELLOW}
                  outlineColor={Color.BLACK}
                  outlineWidth={1}
                />
                <LabelGraphics
                  text={gs.name}
                  font="8px JetBrains Mono"
                  pixelOffset={new Cartesian2(0, 10)}
                  showBackground
                />
              </Entity>
              
              {/* Dynamic Uplink to ISS */}
              {iss && (
                <Entity name={`Uplink: ${gs.name}`}>
                  <PolylineGraphics
                    positions={[
                      Cartesian3.fromDegrees(gs.lon, gs.lat),
                      issPathProperty.getValue(missionTime) || Cartesian3.fromDegrees(iss.longitude, iss.latitude, iss.altitude * 1000)
                    ]}
                    width={1}
                    material={new PolylineDashMaterialProperty({
                      color: Color.YELLOW.withAlpha(0.6),
                      dashLength: 20
                    })}
                  />
                </Entity>
              )}
            </React.Fragment>
          );
        })}

        {/* Orbital Assets: Satellites (Bright Cyan) + Path */}
        {Array.isArray(satellites) && satellites.map((sat, idx) => (
          <Entity
            key={`sat-${idx}`}
            name={sat.name}
            position={sat.name?.includes("ISS") ? issPathProperty : Cartesian3.fromDegrees(sat.longitude, sat.latitude, sat.altitude * 1000)}
            description={`
              <div style="font-family: sans-serif; padding: 10px; background: #000; color: #fff;">
                <h3 style="margin: 0; color: #3b82f6;">${sat.name}</h3>
                <p><b>Altitude:</b> ${Math.round(sat.altitude).toLocaleString()} km</p>
                <p><b>Orbital Speed:</b> ${Math.round(sat.velocity).toLocaleString()} km/h</p>
              </div>
            `}
          >
            <PointGraphics
              pixelSize={12}
              color={Color.CYAN}
              outlineColor={Color.WHITE}
              outlineWidth={2}
            />
            <PathGraphics
              material={Color.CYAN.withAlpha(0.8)}
              width={2}
              leadTime={0}
              trailTime={600} // Fading trail
            />
            <LabelGraphics
              text={sat.name}
              font="10px Inter"
              horizontalOrigin={HorizontalOrigin.LEFT}
              pixelOffset={new Cartesian2(10, 0)}
              showBackground
              backgroundColor={Color.BLACK.withAlpha(0.8)}
            />
          </Entity>
        ))}

        {/* Global Events: News Pointers (Clean White Entities) */}
        {Array.isArray(news) && news.map((n, idx) => (
          <Entity
            key={`news-${idx}`}
            name={n.title}
            position={Cartesian3.fromDegrees(n.lon, n.lat, 5000)}
            description={n.description}
          >
            <PointGraphics
              pixelSize={12}
              color={Color.WHITE}
              outlineColor={Color.fromCssColorString("#3b82f6")}
              outlineWidth={2}
            />
            <LabelGraphics
              text={n.title}
              font="bold 10px serif"
              fillColor={Color.WHITE}
              showBackground
              backgroundColor={Color.BLACK.withAlpha(0.5)}
              backgroundPadding={new Cartesian2(6, 4)}
              verticalOrigin={VerticalOrigin.TOP}
              pixelOffset={new Cartesian2(0, 10)}
              distanceDisplayCondition={{ near: 0, far: 5000000 }} // Only show when zoomed in
            />
          </Entity>
        ))}
      </Viewer>

      {/* Prominent Floating Controller */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
        <div className="bg-black/80 border border-white/20 p-4 rounded-xl shadow-2xl backdrop-blur-xl min-w-[200px]">
          <div className="flex flex-col gap-1 mb-4">
            <h2 className="text-white text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
              Mission Control
            </h2>
            <p className="text-[#9ca3af] text-[9px] uppercase tracking-tighter">Live Orbital Overlays</p>
          </div>
          
          <button 
            onClick={() => setShowStarlink(!showStarlink)}
            className={`w-full py-2 px-3 rounded text-[10px] font-mono uppercase tracking-widest transition-all cursor-pointer border ${
              showStarlink 
                ? "bg-blue-600 text-white border-blue-400 font-bold" 
                : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:border-white/20"
            }`}
          >
            {showStarlink ? "DISABLE STARLINK VIEW" : "ENABLE STARLINK VIEW"}
          </button>
        </div>
      </div>

      {/* Floating Brand Overlay */}
      <div className="absolute top-4 left-4 z-40">
        <h1 className="text-white font-serif text-3xl font-medium tracking-tight pointer-events-none">
          Orbit
        </h1>
        <p className="text-blue-500 text-[10px] font-mono font-bold uppercase tracking-[0.2em] opacity-80 pointer-events-none">
          Situational Awareness Stage
        </p>
      </div>

      {/* Simplified Legend for clarity */}
      <div className="absolute bottom-10 left-4 z-40 flex flex-col gap-2 bg-black/60 backdrop-blur-md p-3 border border-white/10 rounded-lg pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
          <span className="text-[10px] text-white/70 uppercase font-mono tracking-wider">Satellites (Live)</span>
        </div>
        {showStarlink && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white/60"></div>
            <span className="text-[10px] text-white/70 uppercase font-mono tracking-wider">Starlink Constellation</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-500"></div>
          <span className="text-[10px] text-white/70 uppercase font-mono tracking-wider">Heat Anomalies</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
          <span className="text-[10px] text-white/70 uppercase font-mono tracking-wider">Tracking Stations</span>
        </div>
      </div>
    </div>
  );
}
