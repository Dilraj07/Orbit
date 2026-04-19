import axios from "axios";

export const fetchAsteroidData = async (apiKey = "DEMO_KEY") => {
  const today = new Date().toISOString().split("T")[0];
  try {
    const response = await axios.get(
      `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${apiKey}`
    );

    const neoData = response.data.near_earth_objects[today] || [];
    
    return neoData.map((neo: any) => ({
      id: neo.id,
      name: neo.name,
      approach_date: neo.close_approach_data[0]?.close_approach_date_full,
      miss_distance: neo.close_approach_data[0]?.miss_distance.kilometers,
      estimated_diameter: neo.estimated_diameter.meters.estimated_diameter_max,
      is_potentially_hazardous: neo.is_potentially_hazardous_asteroid,
      velocity: neo.close_approach_data[0]?.relative_velocity.kilometers_per_second,
      absolute_magnitude: neo.absolute_magnitude_h,
    }));
  } catch (error) {
    console.error("NASA API Error:", error);
    throw error;
  }
};
