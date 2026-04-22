import axios from "axios";
import { NewsEvent } from "../types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MAJOR_LOCATIONS = [
  "New York", "London", "Tokyo", "Paris", "Berlin", "Sydney", "Mumbai", "Shanghai", 
  "Moscow", "Dubai", "Singapore", "Los Angeles", "Chicago", "Toronto", "Madrid", 
  "Rome", "Beijing", "Seoul", "Bangkok", "Istanbul", "Cairo", "Nairobi", "Johannesburg",
  "Mexico City", "Buenos Aires", "San Francisco", "Seattle", "Hong Kong"
];

const SIMULATED_WORLD_NEWS: NewsEvent[] = [
  {
    title: "Orbital Debris Density Spike Detected",
    description: "Multi-sensor tracking confirms increased debris concentration in Sun-Synchronous Orbit (SSO).",
    url: "#",
    lat: -34.6037,
    lon: -58.3816,
    location: "Buenos Aires, Argentina (Ground HQ)"
  },
  {
    title: "Ground Uplink Status: Nominal",
    description: "Deep Space Network nodes in Madrid and Canberra reporting 100% throughput for lunar relays.",
    url: "#",
    lat: 40.4168,
    lon: -3.7038,
    location: "Madrid, Spain"
  }
];

export async function fetchGeocodedNews(apiKey: string): Promise<NewsEvent[]> {
  try {
    if (!apiKey || apiKey === "") {
      console.warn("GNews API Key is missing. Using Simulated Intelligence Feed.");
      return SIMULATED_WORLD_NEWS;
    }

    // 1. Fetch from GNews
    const newsResponse = await axios.get(
      `https://gnews.io/api/v4/top-headlines?category=world&lang=en&max=5&apikey=${apiKey}`,
      { timeout: 5000 }
    );

    const articles = newsResponse.data.articles || [];
    const geocodedArticles: NewsEvent[] = [];

    // 2. Process and Geocode articles sequentially with rate limiting (1.1s delay)
    for (const article of articles) {
      // Basic extraction: check Title and Description for major locations
      const content = `${article.title} ${article.description}`.toLowerCase();
      let foundLocation = MAJOR_LOCATIONS.find(loc => content.includes(loc.toLowerCase()));

      // If no major location found, skip for now to maintain geocoding accuracy
      if (!foundLocation) continue;

      try {
        // Rate limiting for Nominatim (1 req/sec)
        await delay(1100);

        const geoResponse = await axios.get(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(foundLocation)}&format=json&addressdetails=1&limit=1`,
          {
            headers: {
              "User-Agent": "OrbitDashboard/1.0 (cosdilraj07@gmail.com)"
            }
          }
        );

        if (geoResponse.data && geoResponse.data.length > 0) {
          const { lat, lon, address, display_name } = geoResponse.data[0];
          
          // Construct a cleaner location string
          const city = address?.city || address?.town || address?.village || foundLocation;
          const country = address?.country || "";
          const locationString = country ? `${city}, ${country}` : city;

          geocodedArticles.push({
            title: article.title,
            description: article.description,
            url: article.url,
            lat: parseFloat(lat),
            lon: parseFloat(lon),
            location: locationString
          });
        }
      } catch (err) {
        console.error(`Geocoding failed for location: ${foundLocation}`, err);
      }
    }

    return geocodedArticles;
  } catch (error) {
    console.error("News Pipeline Error:", error);
    return [];
  }
}
