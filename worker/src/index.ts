export interface Env {
  GOOGLE_MAPS_API_KEY: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function badRequest(message: string) {
  return json({ ok: false, error: message }, 400);
}

function getParam(url: URL, key: string) {
  return (url.searchParams.get(key) ?? "").trim();
}

/* ---------- Types ---------- */

type SafetyColor = "green" | "yellow" | "blue" | "red";

type PlaceOut = {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  ratingCount?: number;
  mapsUrl?: string;
  website?: string;
  primaryType?: string;
  types?: string[];

  // NEW
  gfSupported: boolean;
  safetyColor: SafetyColor;
  safetyReasons: string[];
};

/* ---------- Helpers ---------- */

function norm(s?: string) {
  return (s ?? "").toLowerCase();
}

function hasType(p: { primaryType?: string; types?: string[] }, t: string) {
  return p.primaryType === t || p.types?.includes(t);
}

const FLOUR_HEAVY = new Set([
  "pizza_restaurant",
  "bakery",
  "sandwich_shop",
]);

const FAST_FOOD = new Set([
  "fast_food_restaurant",
  "meal_takeaway",
  "meal_delivery",
]);

/* ---------- Gluten Safety Classification ---------- */

function classifyGlutenSafety(
  p: Omit<PlaceOut, "gfSupported" | "safetyColor" | "safetyReasons">
): Pick<PlaceOut, "gfSupported" | "safetyColor" | "safetyReasons"> {
  const name = norm(p.name);
  const types = p.types ?? [];

  const reasons: string[] = [];

  // Explicit gluten-free signals (rare = green)
  if (
    name.includes("gluten free") ||
    name.includes("gluten-free") ||
    name.includes("celiac")
  ) {
    return {
      gfSupported: true,
      safetyColor: "green",
      safetyReasons: ["Dedicated or explicitly gluten-free focused"],
    };
  }

  // Flour-heavy kitchens → red
  if (types.some(t => FLOUR_HEAVY.has(t))) {
    return {
      gfSupported: true,
      safetyColor: "red",
      safetyReasons: ["Flour-heavy kitchen with high cross-contamination risk"],
    };
  }

  // Fast food → blue
  if (types.some(t => FAST_FOOD.has(t))) {
    return {
      gfSupported: true,
      safetyColor: "blue",
      safetyReasons: ["Limited gluten-free options; shared prep space"],
    };
  }

  // Default restaurant → yellow
  return {
    gfSupported: true,
    safetyColor: "yellow",
    safetyReasons: ["Offers gluten-free options but shared kitchen"],
  };
}

/* ---------- Simplify + Enrich ---------- */

function simplifyPlaces(data: any): PlaceOut[] {
  const places = Array.isArray(data?.places) ? data.places : [];

  return places.map((p: any) => {
    const base = {
      id: p.id,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      rating: p.rating,
      ratingCount: p.userRatingCount,
      mapsUrl: p.googleMapsUri,
      website: p.websiteUri,
      primaryType: p.primaryType,
      types: p.types,
    };

    return {
      ...base,
      ...classifyGlutenSafety(base),
    };
  });
}

/* ---------- Worker ---------- */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (request.method !== "GET") {
      return badRequest("Only GET is supported.");
    }

    if (!env.GOOGLE_MAPS_API_KEY) {
      return json({ ok: false, error: "Missing GOOGLE_MAPS_API_KEY" }, 500);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "safeeats-worker" });
    }

    /* ---------- Nearby ---------- */

    if (url.pathname === "/places/nearby") {
      const lat = Number(getParam(url, "lat"));
      const lng = Number(getParam(url, "lng"));
      const radius = Number(getParam(url, "radius") || "3000");

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return badRequest("lat and lng are required numbers");
      }

      const resp = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.primaryType,places.types",
        },
        body: JSON.stringify({
          includedTypes: ["restaurant"],
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius,
            },
          },
          languageCode: "en",
          regionCode: "US",
        }),
      });

      const data = await resp.json();
      return json({ ok: resp.ok, items: simplifyPlaces(data) }, resp.status);
    }

    /* ---------- Text Search ---------- */

    if (url.pathname === "/places/textsearch") {
      const query = getParam(url, "query");
      if (!query) return badRequest("query is required");

      const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.primaryType,places.types",
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: "en",
          regionCode: "US",
        }),
      });

      const data = await resp.json();
      return json({ ok: resp.ok, items: simplifyPlaces(data) }, resp.status);
    }

    return json({ ok: false, error: "Not found" }, 404);
  },
};
