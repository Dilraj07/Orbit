import axios from "axios";
import { SatelliteTelemetry } from "../types";

export async function fetchISSTelemetry(): Promise<SatelliteTelemetry> {
  try {
    const response = await axios.get("https://api.wheretheiss.at/v1/satellites/25544");
    const data = response.data;
    
    return {
      name: "ISS (ZARYA)",
      latitude: data.latitude,
      longitude: data.longitude,
      altitude: data.altitude, // in km
      velocity: data.velocity, // in km/h
      timestamp: data.timestamp
    };
  } catch (error) {
    console.error("ISS Telemetry Error:", error);
    throw error;
  }
}
