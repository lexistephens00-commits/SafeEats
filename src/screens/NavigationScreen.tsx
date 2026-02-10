// src/screens/NavigationScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import MapView, { Marker, Polyline, LatLng } from "react-native-maps";
import * as Location from "expo-location";
import { useNavigation, useRoute } from "@react-navigation/native";

const GREEN_ROUTE = "#1DB954";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothCoord(prev: LatLng, next: LatLng, t = 0.25): LatLng {
  return {
    latitude: lerp(prev.latitude, next.latitude, t),
    longitude: lerp(prev.longitude, next.longitude, t),
  };
}

function distMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export default function NavigationScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();

  const { routeCoords, steps, destination } = route.params as {
    routeCoords: LatLng[];
    steps: any[];
    destination: LatLng;
  };

  const mapRef = useRef<MapView>(null);
  const lastCamTs = useRef(0);

  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [followMode, setFollowMode] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);

  const instruction = useMemo(() => {
    const s = steps?.[currentStep];
    return (
      s?.navigationInstruction?.instructions ??
      s?.maneuver?.instruction ??
      "Starting route…"
    );
  }, [steps, currentStep]);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      // Fit route once at start (then camera follow takes over)
      requestAnimationFrame(() => {
        if (routeCoords?.length) {
          mapRef.current?.fitToCoordinates(routeCoords, {
            edgePadding: { top: 180, right: 60, bottom: 220, left: 60 },
            animated: true,
          });
        }
      });

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 250, // helpful on Android; harmless on iOS
          distanceInterval: 1, // iOS respects this nicely
        },
        (loc) => {
          const here: LatLng = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };

          // Smooth the marker motion (glide toward new GPS fixes)
          setUserLoc((prev) => (prev ? smoothCoord(prev, here, 0.35) : here));

          // Heading is only reliable while moving; keep last good value
          if (
            typeof loc.coords.heading === "number" &&
            !Number.isNaN(loc.coords.heading)
          ) {
            setHeading(loc.coords.heading);
          }

          // Smooth camera follow (throttle + short duration)
          const now = Date.now();
          if (followMode && now - lastCamTs.current > 220) {
            lastCamTs.current = now;

            mapRef.current?.animateCamera(
              {
                center: here,
                heading: (loc.coords.heading ?? heading) || 0,
                pitch: 68,
                zoom: 18.3,
              },
              { duration: 240 }
            );
          }

          // Step advancement heuristic:
          const stepEnd = steps?.[currentStep]?.endLocation?.latLng;
          if (stepEnd?.latitude && stepEnd?.longitude) {
            const end = { latitude: stepEnd.latitude, longitude: stepEnd.longitude };
            if (distMeters(here, end) < 30 && currentStep < (steps?.length ?? 1) - 1) {
              setCurrentStep((p) => p + 1);
            }
          }
        }
      );
    })();

    return () => {
      sub?.remove();
    };
  }, [currentStep, steps, followMode, heading, routeCoords]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation={false}
        followsUserLocation={false}
        onPanDrag={() => setFollowMode(false)}
      >
        <Polyline coordinates={routeCoords} strokeWidth={6} strokeColor={GREEN_ROUTE} />

        {/* Moving marker */}
        {userLoc && (
          <Marker
            coordinate={userLoc}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={heading}
            title="You"
          >
            <View style={styles.carWrap}>
              <Text style={styles.carIcon}>➤</Text>
            </View>
          </Marker>
        )}

        <Marker coordinate={destination} title="Destination" pinColor="green" />
      </MapView>

      {/* Instruction banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Next</Text>
        <Text style={styles.bannerText}>{instruction}</Text>
      </View>

      {/* Exit */}
      <TouchableOpacity style={styles.exitBtn} onPress={() => nav.goBack()}>
        <Text style={styles.exitText}>Exit</Text>
      </TouchableOpacity>

      {/* Re-center */}
      <TouchableOpacity style={styles.followBtn} onPress={() => setFollowMode(true)}>
        <Text style={styles.followText}>Re-center</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  banner: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: "white",
    padding: 14,
    borderRadius: 16,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  bannerTitle: { fontSize: 12, color: "#666", fontWeight: "700" },
  bannerText: { fontSize: 18, fontWeight: "800", marginTop: 4 },

  exitBtn: {
    position: "absolute",
    bottom: 60,
    left: 16,
    right: 16,
    backgroundColor: "#111",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  exitText: { color: "white", fontWeight: "800" },

  followBtn: {
    position: "absolute",
    right: 16,
    bottom: 130,
    backgroundColor: "white",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  followText: { fontWeight: "800" },

  carWrap: {
    backgroundColor: "white",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 18,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  carIcon: {
    fontSize: 18,
    fontWeight: "900",
  },
});
