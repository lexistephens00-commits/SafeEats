// src/api/safeeatsProxy.ts

// ✅ Update this if your worker URL changes
const PROXY_BASE_URL = "https://safeeats-proxy.lexistephens00.workers.dev";

// This matches the shape you pasted from the proxy
export type Place = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
};

// Helpful error formatter
async function parseError(res: Response) {
  try {
    const data = await res.json();
    const msg =
      data?.error ||
      data?.message ||
      `Request failed (${res.status} ${res.statusText})`;
    return msg;
  } catch {
    return `Request failed (${res.status} ${res.statusText})`;
  }
}

/**
 * Nearby search around a point (used for "near me" pins)
 * Expected proxy response: { places: Place[] }
 * Endpoint example: /nearby?lat=...&lng=...&radius=1500
 */
export async function fetchNearbyRestaurants(params: {
  lat: number;
  lng: number;
  radius?: number;
}): Promise<Place[]> {
  const { lat, lng, radius = 1500 } = params;

  const url =
    `${PROXY_BASE_URL}/nearby` +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lng=${encodeURIComponent(String(lng))}` +
    `&radius=${encodeURIComponent(String(radius))}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(await parseError(res));

  const data = await res.json();
  return (data.places ?? []) as Place[];
}

/**
 * Text search (used by the search bar)
 * Expected proxy response: { places: Place[] }
 * Endpoint example: /textsearch?query=gluten%20free%20near%20Chicago
 */
export async function textSearchRestaurants(params: {
  query: string;
}): Promise<Place[]> {
  const { query } = params;

  const url =
    `${PROXY_BASE_URL}/textsearch` +
    `?query=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(await parseError(res));

  const data = await res.json();
  return (data.places ?? []) as Place[];
}
