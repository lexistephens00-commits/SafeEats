// src/screens/MapScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
} from "react-native";
import MapView, { Marker, Polyline, Region, LatLng } from "react-native-maps";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { decode } from "@googlemaps/polyline-codec";
import { useNavigation } from "@react-navigation/native";

type AutocompleteItem = {
  placeId: string; 
  primaryText: string;
  secondaryText?: string;
};

type GfPin = {
  id: string;
  name: string;
  coordinate: LatLng;
  safety?: "green" | "blue" | "yellow" | "red";
};

function getExtra(): any {
  // Works across Expo SDKs
  return (
    Constants.expoConfig?.extra ??
    (Constants as any).manifest?.extra ??
    {}
  );
}

const GREEN_ROUTE = "#1DB954"; // match your cover green

export default function MapScreen() {
  const navigation = useNavigation<any>();
  const mapRef = useRef<MapView>(null);

  const extra = getExtra();
  const GOOGLE_PLACES_API_KEY: string | undefined = extra.GOOGLE_PLACES_API_KEY;
  const GOOGLE_ROUTES_API_KEY: string | undefined = extra.GOOGLE_ROUTES_API_KEY ?? extra.GOOGLE_PLACES_API_KEY;

  const [permissionReady, setPermissionReady] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);

  const [destination, setDestination] = useState<LatLng | null>(null);

  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [routeSteps, setRouteSteps] = useState<any[]>([]);

  const [gfPins, setGfPins] = useState<GfPin[]>([]);

  const initialRegion: Region = useMemo(() => {
    // fallback if GPS not ready
    return {
      latitude: userLocation?.latitude ?? 40.5142, // ISU-ish fallback
      longitude: userLocation?.longitude ?? -88.9906,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    };
  }, [userLocation]);

  // 1) Get user location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      setPermissionReady(true);

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setUserLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      // Load GF pins once you have a location
      fetchGfPins(loc.coords.latitude, loc.coords.longitude).then(setGfPins).catch(() => {});
    })();
  }, []);

  // 2) Autocomplete as you type (debounced)
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    if (!GOOGLE_PLACES_API_KEY) {
      console.log("Missing GOOGLE_PLACES_API_KEY in app.json -> expo.extra");
      return;
    }

    const handle = setTimeout(() => {
      runAutocomplete(query).catch((e) => console.log("Autocomplete error:", e?.message ?? e));
    }, 250);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function runAutocomplete(text: string) {
    setSearching(true);

    // NOTE:
    // Places API “New” has different endpoints than the legacy /place/autocomplete/json.
    // If your project is still rejecting, it’s almost always “API not enabled / billing / key restrictions”.
    const url = "https://places.googleapis.com/v1/places:autocomplete";

    const body = {
      input: text,
      // Keep it simple for demo. You can add location bias later.
      // locationBias: { circle: { center: { latitude: ..., longitude: ... }, radius: 50000 } }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    if (!res.ok) {
      console.log("Autocomplete error:", res.status, JSON.stringify(json));
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const preds: AutocompleteItem[] =
      (json?.suggestions ?? []).map((s: any) => {
        const p = s?.placePrediction;
        return {
          placeId: p?.placeId,
          primaryText: p?.text?.text ?? p?.structuredFormat?.mainText?.text ?? "Result",
          secondaryText: p?.structuredFormat?.secondaryText?.text,
        };
      }) ?? [];

    setSuggestions(preds);
    setSearching(false);
  }

  async function fetchPlaceLatLng(placeId: string): Promise<LatLng | null> {
    if (!GOOGLE_PLACES_API_KEY) return null;

    // Place Details (New)
    const url = `https://places.googleapis.com/v1/places/${placeId}?fields=location`;

    const res = await fetch(url, {
      headers: { "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY },
    });

    const json = await res.json();
    if (!res.ok) {
      console.log("Place details error:", res.status, JSON.stringify(json));
      return null;
    }

    const loc = json?.location;
    if (!loc?.latitude || !loc?.longitude) return null;

    return { latitude: loc.latitude, longitude: loc.longitude };
  }

  // 3) Fetch real driving route via Routes API computeRoutes
  async function fetchDrivingRoute(origin: LatLng, dest: LatLng) {
    if (!GOOGLE_ROUTES_API_KEY) {
      console.log("Missing GOOGLE_ROUTES_API_KEY in app.json -> expo.extra");
      return;
    }

    // Routes API computeRoutes endpoint
    const url = "https://routes.googleapis.com/directions/v2:computeRoutes";

    const body = {
      origin: {
        location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } },
      },
      destination: {
        location: { latLng: { latitude: dest.latitude, longitude: dest.longitude } },
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      polylineQuality: "HIGH_QUALITY",
    };

    // Routes API uses a field mask pattern (only ask for what we need). :contentReference[oaicite:2]{index=2}
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_ROUTES_API_KEY,
        "X-Goog-FieldMask": "routes.polyline.encodedPolyline,routes.legs.steps",
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    if (!res.ok) {
      console.log("Routes error:", res.status, JSON.stringify(json));
      return;
    }

    const route0 = json?.routes?.[0];
    const encoded = route0?.polyline?.encodedPolyline as string | undefined;
    const steps = route0?.legs?.[0]?.steps ?? [];

    if (!encoded) return;

    const decoded = decode(encoded).map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
    setRouteCoords(decoded);
    setRouteSteps(steps);

    // zoom map to route
    requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(decoded, {
        edgePadding: { top: 160, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    });
  }

  // 4) GF pins loader (replace with your Worker)
  async function fetchGfPins(lat: number, lng: number): Promise<GfPin[]> {
    // TODO: swap this to your Cloudflare Worker endpoint later.
    // For demo: show a few fake pins near you.
    return [
      {
        id: "gf1",
        name: "GF Spot 1",
        coordinate: { latitude: lat + 0.01, longitude: lng + 0.01 },
        safety: "green",
      },
      {
        id: "gf2",
        name: "GF Spot 2",
        coordinate: { latitude: lat - 0.012, longitude: lng - 0.005 },
        safety: "blue",
      },
    ];
  }

  function clearSearch() {
    setQuery("");
    setSuggestions([]);
    setSearching(false);
  }

  function goToMe() {
    if (!userLocation) return;
    mapRef.current?.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      650
    );
  }

  async function onPickSuggestion(item: AutocompleteItem) {
    clearSearch();

    const latlng = await fetchPlaceLatLng(item.placeId);
    if (!latlng) return;

    setDestination(latlng);

    // animate camera
    mapRef.current?.animateToRegion(
      {
        latitude: latlng.latitude,
        longitude: latlng.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      650
    );

    // route if we have origin
    if (userLocation) {
      fetchDrivingRoute(userLocation, latlng).catch(() => {});
    }
  }

  async function onTapMap(e: any) {
    const coord: LatLng = e.nativeEvent.coordinate;
    setDestination(coord);
    clearSearch();

    if (userLocation) {
      fetchDrivingRoute(userLocation, coord).catch(() => {});
    }
  }

  function startNavigation() {
    if (!destination || routeCoords.length === 0) return;

console.log("ROUTES I CAN SEE:", navigation.getState().routeNames);


    navigation.navigate("Navigation", {
      routeCoords,
      steps: routeSteps,
      destination,
    });
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={permissionReady}
        onPress={onTapMap}
      >
        {/* GF pins layer */}
        {gfPins.map((p) => (
          <Marker
            key={p.id}
            coordinate={p.coordinate}
            title={p.name}
            // Later: use custom marker icons by safety color
          />
        ))}

        {/* Destination pin */}
        {destination && (
          <Marker
            coordinate={destination}
            title="Destination"
            pinColor="green"
          />
        )}

        {/* Driving route */}
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeWidth={6} strokeColor={GREEN_ROUTE} />
        )}
      </MapView>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search a city or place…"
            placeholderTextColor="#888"
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!!query && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearBtn}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {searching && (
          <Text style={styles.searchingText}>Searching…</Text>
        )}

        {suggestions.length > 0 && (
          <View style={styles.suggestBox}>
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={suggestions}
              keyExtractor={(i) => i.placeId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.suggestItem}
                  onPress={() => onPickSuggestion(item)}
                >
                  <Text style={styles.suggestMain}>{item.primaryText}</Text>
                  {!!item.secondaryText && (
                    <Text style={styles.suggestSub}>{item.secondaryText}</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* Return to me */}
      <TouchableOpacity style={styles.meBtn} onPress={goToMe}>
        <Text style={styles.meBtnText}>◎</Text>
      </TouchableOpacity>

      {/* Start nav */}
      <TouchableOpacity
        style={[styles.navBtn, (routeCoords.length === 0 || !destination) && { opacity: 0.5 }]}
        disabled={routeCoords.length === 0 || !destination}
        onPress={startNavigation}
      >
        <Text style={styles.navBtnText}>Start Navigation</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  searchWrap: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
  },
  searchRow: {
    backgroundColor: "white",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  input: { flex: 1, fontSize: 16 },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  clearText: { fontSize: 18 },

  searchingText: {
    marginTop: 8,
    color: "white",
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  suggestBox: {
    marginTop: 10,
    backgroundColor: "white",
    borderRadius: 14,
    overflow: "hidden",
    maxHeight: 260,
  },
  suggestItem: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eee" },
  suggestMain: { fontSize: 16, fontWeight: "600" },
  suggestSub: { fontSize: 13, color: "#666", marginTop: 2 },

  meBtn: {
    position: "absolute",
    right: 16,
    bottom: 140,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  meBtnText: { fontSize: 22, fontWeight: "700" },

  navBtn: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 60,
    backgroundColor: GREEN_ROUTE,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  navBtnText: { color: "white", fontSize: 16, fontWeight: "800" },
});
