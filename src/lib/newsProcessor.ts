import { GoogleGenAI, Type } from "@google/genai";
import axios from "axios";
import { NewsEvent } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function processNewsWithAI(rawArticles: any[]): Promise<NewsEvent[]> {
  try {
    const newsContent = rawArticles.map(a => `Title: ${a.title}\nDesc: ${a.description}`).join("\n---\n");

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Process the following news articles into a structured format for a situational awareness dashboard. 
      For each article, extract:
      1. The most likely topic.
      2. A severity score (1-10).
      3. A specific TERRESTRIAL ground-based location name (City, Country, or Region). DO NOT extract "Low Earth Orbit", "Space", or "Global".
      4. A one-sentence brief.
      Articles:
      ${newsContent}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              severity: { type: Type.NUMBER },
              location_name: { type: Type.STRING },
              brief: { type: Type.STRING },
              original_index: { type: Type.NUMBER, description: "Index of the source article" }
            },
            required: ["topic", "severity", "location_name", "brief", "original_index"]
          }
        }
      }
    });

    const structuredData = JSON.parse(response.text);
    const geocodedResults: NewsEvent[] = [];

    for (const item of structuredData) {
      try {
        const blacklist = ["low earth orbit", "space", "orbital", "global", "earth", "leo", "isso", "sky", "atmosphere", "satellite"];
        const loc = item.location_name?.toLowerCase()?.trim() || "";
        
        if (blacklist.some(term => loc.includes(term)) || loc.length < 3) {
          console.log("Skipping non-terrestrial geocoding for:", item.location_name);
          continue;
        }

        // Sequentially geocode via backend to maintain rate limits
        const geoRes = await axios.post("/api/news/geocode", { location: item.location_name });
        if (geoRes.data) {
          const original = rawArticles[item.original_index];
          geocodedResults.push({
            title: original.title,
            description: original.description,
            url: original.url,
            lat: geoRes.data.lat,
            lon: geoRes.data.lon,
            location: item.location_name,
            topic: item.topic,
            severity: item.severity,
            brief: item.brief
          });
        }
        // Small delay between geocodes
        await new Promise(r => setTimeout(r, 1100));
      } catch (err) {
        console.error("Geocode error for:", item.location_name);
      }
    }

    return geocodedResults;
  } catch (error) {
    console.error("AI News Compression Error:", error);
    return [];
  }
}
