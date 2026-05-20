import { test } from "node:test";
import assert from "node:assert";
import { fetchGeocodedNews, SIMULATED_WORLD_NEWS } from "./newsService.ts";

test("fetchGeocodedNews returns SIMULATED_WORLD_NEWS when apiKey is missing", async () => {
  const result = await fetchGeocodedNews("");
  assert.deepStrictEqual(result, SIMULATED_WORLD_NEWS);
});

test("fetchGeocodedNews returns SIMULATED_WORLD_NEWS when apiKey is undefined", async () => {
  // @ts-ignore
  const result = await fetchGeocodedNews(undefined);
  assert.deepStrictEqual(result, SIMULATED_WORLD_NEWS);
});

test("fetchGeocodedNews returns SIMULATED_WORLD_NEWS when apiKey is null", async () => {
  // @ts-ignore
  const result = await fetchGeocodedNews(null);
  assert.deepStrictEqual(result, SIMULATED_WORLD_NEWS);
});
