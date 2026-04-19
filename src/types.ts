export interface Asteroid {
  id: string;
  name: string;
  approach_date: string;
  miss_distance: string;
  estimated_diameter: number;
  is_potentially_hazardous: boolean;
  velocity: string;
  absolute_magnitude: number;
}

export interface NewsEvent {
  title: string;
  description: string;
  url: string;
  lat: number;
  lon: number;
  location?: string;
  topic?: string;
  severity?: number;
  brief?: string;
}

export interface SatelliteTelemetry {
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  timestamp: number;
}

export interface SatelliteTLE {
  name: string;
  tle1: string;
  tle2: string;
}

export interface ThermalAlert {
  lat: number;
  lon: number;
  brightness: number;
}
