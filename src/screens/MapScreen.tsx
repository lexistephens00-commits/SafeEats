import { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { fetchNearbyRestaurants } from "../api/safeeatsProxy";
import { Place } from "../types/places";

export default function MapScreen() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [radius, setRadius] = useState(1500);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Location permission denied");

      const loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      setUserLoc({ lat, lng });

      const results = await fetchNearbyRestaurants({ lat, lng, radius });
      setPlaces(results.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)));
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius]);

  const region = useMemo(() => {
    if (!userLoc) {
      return { latitude: 40.5142, longitude: -88.9906, latitudeDelta: 0.03, longitudeDelta: 0.03 };
    }
    return { latitude: userLoc.lat, longitude: userLoc.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 };
  }, [userLoc]);

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region}>
        {userLoc && (
          <Marker coordinate={{ latitude: userLoc.lat, longitude: userLoc.lng }} title="You" pinColor="blue" />
        )}

        {places.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.name}
            description={
              p.rating
                ? `${p.rating}⭐ (${p.userRatingCount ?? 0}) • ${p.address}`
                : p.address
            }
          />
        ))}
      </MapView>

      <View style={styles.bottom}>
        {loading ? (
          <View style={styles.row}>
            <ActivityIndicator />
            <Text style={styles.bottomText}>Loading nearby restaurants…</Text>
          </View>
        ) : err ? (
          <View>
            <Text style={[styles.bottomText, { fontWeight: "700" }]}>Couldn’t load places</Text>
            <Text style={styles.sub}>{err}</Text>
            <Pressable style={styles.btn} onPress={load}>
              <Text style={styles.btnText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Text style={styles.bottomText}>Found {places.length} restaurants</Text>
            <View style={[styles.row, { marginTop: 8 }]}>
              <Pressable style={styles.btnSm} onPress={() => setRadius(1000)}>
                <Text style={styles.btnText}>1 km</Text>
              </Pressable>
              <Pressable style={styles.btnSm} onPress={() => setRadius(1500)}>
                <Text style={styles.btnText}>1.5 km</Text>
              </Pressable>
              <Pressable style={styles.btnSm} onPress={() => setRadius(3000)}>
                <Text style={styles.btnText}>3 km</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  bottom: { padding: 12, backgroundColor: "white", borderTopWidth: 1, borderTopColor: "#eee" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  bottomText: { fontSize: 14, color: "#111" },
  sub: { marginTop: 6, color: "#555" },
  btn: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#111", alignSelf: "flex-start" },
  btnSm: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#111" },
  btnText: { color: "white", fontWeight: "700" },
});
