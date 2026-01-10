// src/services/mapboxSearch.ts
export type SearchPlace = {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
};

type MapboxGeocodeResponse = {
  features: Array<{
    id: string;
    place_name: string;
    text: string;
    center: [number, number]; // [lng, lat]
  }>;
};

export async function searchPlacesMapbox(query: string, limit = 6): Promise<SearchPlace[]> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error("Missing Mapbox token (EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN).");

  const q = query.trim();
  if (!q) return [];

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    `&autocomplete=true&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mapbox search failed (${res.status}). ${text}`);
  }

  const data = (await res.json()) as MapboxGeocodeResponse;

  return (data.features ?? []).map((f) => ({
    id: f.id,
    name: f.text,
    address: f.place_name,
    longitude: f.center[0],
    latitude: f.center[1],
  }));
}
