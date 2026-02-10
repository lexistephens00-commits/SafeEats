import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import MapView, { Marker, Polyline, Region, LatLng } from "react-native-maps";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { decode } from "@googlemaps/polyline-codec";
import { useNavigation } from "@react-navigation/native";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  rating?: number | null;
  isChain?: boolean;
  address?: string;
};

type SavedPlace = {
  id: string;
  name: string;
  safety: "green" | "blue" | "yellow" | "red";
  lat: number;
  lng: number;
  rating?: number | null;
  isChain?: boolean;
  address?: string;
  savedAt: number;
};

const STORAGE_KEY = "@gfreeway_saved_places_v1";

function getExtra(): any {
  return Constants.expoConfig?.extra ?? (Constants as any).manifest?.extra ?? {};
}

const GREEN_ROUTE = "#1DB954";

// Illinois bounding box (demo-only focus)
const IL_BOUNDS = {
  minLat: 36.97,
  maxLat: 42.51,
  minLng: -91.51,
  maxLng: -87.02,
};

function isInIllinois(lat: number, lng: number) {
  return (
    lat >= IL_BOUNDS.minLat &&
    lat <= IL_BOUNDS.maxLat &&
    lng >= IL_BOUNDS.minLng &&
    lng <= IL_BOUNDS.maxLng
  );
}

function clampSafety(s: any): "green" | "blue" | "yellow" | "red" {
  if (s === "green" || s === "blue" || s === "yellow" || s === "red") return s;
  return "green";
}

export default function MapScreen() {
  const navigation = useNavigation<any>();
  const mapRef = useRef<MapView>(null);

  const extra = getExtra();
  const GOOGLE_PLACES_API_KEY: string | undefined = extra.GOOGLE_PLACES_API_KEY;
  const GOOGLE_ROUTES_API_KEY: string | undefined =
    extra.GOOGLE_ROUTES_API_KEY ?? extra.GOOGLE_PLACES_API_KEY;

  // Worker URL
  const WORKER_URL: string | undefined = extra.WORKER_URL;
  const FALLBACK_WORKER_URL = "https://safeeats-worker.lexistephens00.workers.dev";

  const [permissionReady, setPermissionReady] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);

  const [destination, setDestination] = useState<LatLng | null>(null);

  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [routeSteps, setRouteSteps] = useState<any[]>([]);

  const [gfPins, setGfPins] = useState<GfPin[]>([]);

  // ✅ NEW: include chains toggle
  const [includeChains, setIncludeChains] = useState(false);

  // ✅ NEW: pin pop-up + saved ids
  const [selectedPin, setSelectedPin] = useState<GfPin | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const initialRegion: Region = useMemo(() => {
    return {
      latitude: userLocation?.latitude ?? 40.5142,
      longitude: userLocation?.longitude ?? -88.9906,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    };
  }, [userLocation]);

  // ---------- storage helpers ----------
  async function loadSavedIds() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const arr: SavedPlace[] = raw ? JSON.parse(raw) : [];
      setSavedIds(new Set(arr.map((p) => p.id)));
    } catch {
      setSavedIds(new Set());
    }
  }

  async function savePlace(pin: GfPin) {
    const place: SavedPlace = {
      id: pin.id,
      name: pin.name,
      safety: clampSafety(pin.safety),
      lat: pin.coordinate.latitude,
      lng: pin.coordinate.longitude,
      rating: typeof pin.rating === "number" ? pin.rating : null,
      isChain: !!pin.isChain,
      address: pin.address,
      savedAt: Date.now(),
    };

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const arr: SavedPlace[] = raw ? JSON.parse(raw) : [];

    // de-dupe by id
    const next = [place, ...arr.filter((p) => p.id !== place.id)];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    setSavedIds((prev) => new Set(prev).add(place.id));
  }

  async function removePlaceById(id: string) {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const arr: SavedPlace[] = raw ? JSON.parse(raw) : [];
    const next = arr.filter((p) => p.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    setSavedIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  }

  async function toggleSave(pin: GfPin) {
    const isSaved = savedIds.has(pin.id);
    if (isSaved) {
      await removePlaceById(pin.id);
    } else {
      await savePlace(pin);
    }
  }

  // ---------- location ----------
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location Needed", "Please allow location to use navigation.");
        return;
      }

      setPermissionReady(true);

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const here = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(here);

      // load saved ids once
      loadSavedIds().catch(() => {});

      // load pins
      try {
        const pins = await fetchGfPins(here.latitude, here.longitude, includeChains);
        setGfPins(pins);
      } catch {
        // silent for demo
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ refresh pins when toggle changes
  useEffect(() => {
    if (!userLocation) return;
    fetchGfPins(userLocation.latitude, userLocation.longitude, includeChains)
      .then(setGfPins)
      .catch(() => {});
    // also refresh saved ids
    loadSavedIds().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeChains]);

  // ---------- autocomplete ----------
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
      runAutocomplete(query).catch((e) =>
        console.log("Autocomplete error:", e?.message ?? e)
      );
    }, 250);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function runAutocomplete(text: string) {
    setSearching(true);

    const url = "https://places.googleapis.com/v1/places:autocomplete";
    const body = { input: text };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
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
          primaryText:
            p?.text?.text ?? p?.structuredFormat?.mainText?.text ?? "Result",
          secondaryText: p?.structuredFormat?.secondaryText?.text,
        };
      }) ?? [];

    setSuggestions(preds);
    setSearching(false);
  }

  async function fetchPlaceLatLng(placeId: string): Promise<LatLng | null> {
    if (!GOOGLE_PLACES_API_KEY) return null;

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

  // ---------- routes ----------
  async function fetchDrivingRoute(origin: LatLng, dest: LatLng) {
    if (!GOOGLE_ROUTES_API_KEY) {
      console.log("Missing GOOGLE_ROUTES_API_KEY in app.json -> expo.extra");
      Alert.alert("Missing Key", "Routes API key is missing.");
      return;
    }

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
      Alert.alert("Route Error", "Couldn’t calculate a route right now. Try again.");
      return;
    }

    const route0 = json?.routes?.[0];
    const encoded = route0?.polyline?.encodedPolyline as string | undefined;
    const steps = route0?.legs?.[0]?.steps ?? [];

    if (!encoded) {
      Alert.alert("Route Error", "No route returned. Try a different destination.");
      return;
    }

    const decoded = decode(encoded).map(([lat, lng]) => ({
      latitude: lat,
      longitude: lng,
    }));

    setRouteCoords(decoded);
    setRouteSteps(steps);

    requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(decoded, {
        edgePadding: { top: 160, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    });
  }

  // ---------- pins ----------
  async function fetchGfPins(lat: number, lng: number, includeChainsFlag: boolean): Promise<GfPin[]> {
    const base = (WORKER_URL ?? FALLBACK_WORKER_URL).trim();
    if (!base) return [];

    if (!isInIllinois(lat, lng)) return [];

    const url =
      `${base}/gf-pins?lat=${lat}&lng=${lng}&radiusKm=25` +
      (includeChainsFlag ? `&includeChains=1` : ``);

    const res = await fetch(url);
    const json = await res.json();

    const pins: GfPin[] = (json?.pins ?? []).map((p: any) => ({
      id: String(p.id ?? `${p.lat},${p.lng}`),
      name: String(p.name ?? "GF Spot"),
      coordinate: { latitude: Number(p.lat), longitude: Number(p.lng) },
      safety: clampSafety(p.safety),
      rating: typeof p.rating === "number" ? p.rating : null,
      isChain: !!p.isChain,
      address: typeof p.address === "string" ? p.address : undefined,
    }));

    return pins.filter((p) => isInIllinois(p.coordinate.latitude, p.coordinate.longitude));
  }

  // ---------- UI helpers ----------
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

    mapRef.current?.animateToRegion(
      {
        latitude: latlng.latitude,
        longitude: latlng.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      650
    );

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

    Speech.stop();
    Speech.speak("Let's go, gluten free traveler!", { rate: 0.95, pitch: 1.05 });

    navigation.navigate("Navigation", {
      routeCoords,
      steps: routeSteps,
      destination,
    });
  }

  const selectedIsSaved = selectedPin ? savedIds.has(selectedPin.id) : false;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={permissionReady}
        onPress={onTapMap}
      >
        {/* GF pins */}
        {gfPins.map((p) => (
          <Marker
            key={p.id}
            coordinate={p.coordinate}
            title={p.name}
            pinColor={
              p.safety === "green"
                ? "green"
                : p.safety === "blue"
                ? "blue"
                : p.safety === "yellow"
                ? "gold"
                : "red"
            }
            onPress={() => setSelectedPin(p)}
          />
        ))}

        {/* Destination */}
        {destination && <Marker coordinate={destination} title="Destination" pinColor="green" />}

        {/* Route */}
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

        {searching && <Text style={styles.searchingText}>Searching…</Text>}

        {suggestions.length > 0 && (
          <View style={styles.suggestBox}>
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={suggestions}
              keyExtractor={(i) => i.placeId}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.suggestItem} onPress={() => onPickSuggestion(item)}>
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

      {/* Include chains toggle */}
      <TouchableOpacity
        style={[styles.toggleBtn, includeChains && styles.toggleBtnOn]}
        onPress={() => setIncludeChains((p) => !p)}
      >
        <Text style={[styles.toggleText, includeChains && styles.toggleTextOn]}>
          {includeChains ? "Chains: ON" : "Chains: OFF"}
        </Text>
      </TouchableOpacity>

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

      {/* ✅ Pin pop-up modal */}
      <Modal
        visible={!!selectedPin}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPin(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedPin(null)} />

        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{selectedPin?.name ?? ""}</Text>

          {!!selectedPin?.rating && (
            <Text style={styles.sheetMeta}>⭐ {selectedPin.rating.toFixed(1)}</Text>
          )}

          {!!selectedPin?.isChain && (
            <Text style={styles.sheetMeta}>Chain</Text>
          )}

          <Text style={styles.sheetMeta}>
            Safety: {selectedPin?.safety?.toUpperCase() ?? "—"}
          </Text>

          <TouchableOpacity
            style={[styles.saveBtn, selectedIsSaved && styles.saveBtnSaved]}
            onPress={async () => {
              if (!selectedPin) return;
              await toggleSave(selectedPin);
            }}
          >
            <Text style={styles.saveBtnText}>
              {selectedIsSaved ? "Saved ✓ (Tap to Unsave)" : "Save to Favorites"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedPin(null)}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
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
  clearBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
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
  suggestItem: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  suggestMain: { fontSize: 16, fontWeight: "600" },
  suggestSub: { fontSize: 13, color: "#666", marginTop: 2 },

  toggleBtn: {
    position: "absolute",
    top: 126,
    right: 16,
    backgroundColor: "white",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  toggleBtnOn: {
    backgroundColor: "#1DB954",
    borderColor: "#1DB954",
  },
  toggleText: { fontWeight: "900", color: "#111" },
  toggleTextOn: { color: "white" },

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

  // modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 22,
    backgroundColor: "white",
    borderRadius: 18,
    padding: 16,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  sheetTitle: { fontSize: 18, fontWeight: "900" },
  sheetMeta: { marginTop: 8, color: "#555", fontWeight: "800" },

  saveBtn: {
    marginTop: 14,
    backgroundColor: "#1DB954",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  saveBtnSaved: {
    backgroundColor: "#111",
  },
  saveBtnText: { color: "white", fontWeight: "900" },

  closeBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E4E4E4",
  },
  closeText: { fontWeight: "900" },
});
