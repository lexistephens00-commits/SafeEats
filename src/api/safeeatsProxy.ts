import { Place } from "../types/places";

const PROXY_BASE_URL = "https://safeeats-proxy.lexistephens00.workers.dev";

export async function fetchNearbyRestaurants(params: {
  lat: number;
  lng: number;
  radius?: number;
}): Promise<Place[]> {
  const { lat, lng, radius = 1500 } = params;

  const url = `${PROXY_BASE_URL}/nearby?lat=${encodeURIComponent(
    lat
  )}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      data?.error
        ? `${data.error}${data.status ? ` (${data.status})` : ""}`
        : "Proxy error"
    );
  }

  return (data.places ?? []) as Place[];
}
