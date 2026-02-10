const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN!;

export async function getRouteDirections(
  start: [number, number],
  end: [number, number]
) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&steps=true&access_token=${MAPBOX_TOKEN}`;

  const res = await fetch(url);
  const json = await res.json();

  return json.routes[0];
}
