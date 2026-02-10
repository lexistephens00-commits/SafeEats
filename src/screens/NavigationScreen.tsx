import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import MapView, { Marker, Polyline, LatLng } from "react-native-maps";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { useNavigation, useRoute } from "@react-navigation/native";

const GREEN_ROUTE = "#1DB954";

// ====== CAMERA LOCK (prevents “zooming out to the whole country”) ======
const LOCKED_ZOOM_ANDROID = 18.5; // tweak: higher = closer
const LOCKED_ALTITUDE_IOS = 350; // tweak: lower = closer (try 180–350)

// ---------- math helpers ----------
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// convert meters to a friendly phrase
function metersToPhrase(m: number) {
  if (!Number.isFinite(m)) return "";
  if (m < 20) return "now";
  if (m < 100) return `in ${Math.round(m / 5) * 5} meters`;
  if (m < 1000) return `in ${Math.round(m / 10) * 10} meters`;
  const km = m / 1000;
  return `in ${km.toFixed(1)} kilometers`;
}

// Clean “Head north on X toward Y” into something speakable
function speakableInstruction(raw?: string) {
  if (!raw) return "Continue";
  return raw.replace(/\n/g, ". ").replace(/\s+/g, " ").trim();
}

// Some Routes API steps have HTML-ish stuff occasionally; keep it safe
function safeText(s: any) {
  return speakableInstruction(String(s ?? ""));
}

// --- snap-to-line helpers ---
// Project onto each segment; choose closest point.
// Uses a local “meters-ish” coordinate system so projection works well.
function closestPointOnPolyline(
  p: LatLng,
  line: LatLng[]
): { point: LatLng; distanceMeters: number; index: number } {
  if (!line?.length) return { point: p, distanceMeters: Infinity, index: -1 };
  if (line.length === 1) return { point: line[0], distanceMeters: distMeters(p, line[0]), index: 0 };

  const lat0 = p.latitude * (Math.PI / 180);
  const mPerDegLat = 111132.92;
  const mPerDegLon = 111320 * Math.cos(lat0);

  const toXY = (ll: LatLng) => ({
    x: (ll.longitude - p.longitude) * mPerDegLon,
    y: (ll.latitude - p.latitude) * mPerDegLat,
  });

  const fromXY = (x: number, y: number): LatLng => ({
    latitude: p.latitude + y / mPerDegLat,
    longitude: p.longitude + x / mPerDegLon,
  });

  let bestDist2 = Number.POSITIVE_INFINITY;
  let bestPoint: LatLng = line[0];
  let bestIdx = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const a = toXY(line[i]);
    const b = toXY(line[i + 1]);

    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = 0 - a.x;
    const apy = 0 - a.y;

    const abLen2 = abx * abx + aby * aby;
    const t = abLen2 > 0 ? clamp((apx * abx + apy * aby) / abLen2, 0, 1) : 0;

    const projX = a.x + t * abx;
    const projY = a.y + t * aby;

    const d2 = projX * projX + projY * projY;

    if (d2 < bestDist2) {
      bestDist2 = d2;
      bestPoint = fromXY(projX, projY);
      bestIdx = i;
    }
  }

  return { point: bestPoint, distanceMeters: Math.sqrt(bestDist2), index: bestIdx };
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

  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [snappedLoc, setSnappedLoc] = useState<LatLng | null>(null);
  const [offRouteMeters, setOffRouteMeters] = useState<number>(0);

  const [heading, setHeading] = useState<number>(0);
  const headingRef = useRef<number>(0);

  const [followMode, setFollowMode] = useState(true);

  // voice settings
  const [voiceOn, setVoiceOn] = useState(true);

  // current step index
  const [currentStep, setCurrentStep] = useState(0);

  // refs used to prevent spam
  const lastSpokenStepRef = useRef<number>(-1);
  const lastApproachSpokenRef = useRef<number>(-1);
  const lastSpeakTsRef = useRef<number>(0);

  // camera throttle
  const lastCamTsRef = useRef<number>(0);

  const instruction = useMemo(() => {
    const s = steps?.[currentStep];
    return (
      s?.navigationInstruction?.instructions ??
      s?.maneuver?.instruction ??
      "Starting route…"
    );
  }, [steps, currentStep]);

  // Speak helper with throttling
  function say(text: string) {
    if (!voiceOn) return;
    const now = Date.now();
    if (now - lastSpeakTsRef.current < 900) return; // throttle
    lastSpeakTsRef.current = now;

    Speech.stop();
    Speech.speak(text, {
      rate: 0.95,
      pitch: 1.02,
      language: "en-US",
    });
  }

  // When nav starts, say your fun line once (optional)
  useEffect(() => {
    if (!voiceOn) return;
    say("Let's go, gluten free traveler!");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit route on start
  useEffect(() => {
    requestAnimationFrame(() => {
      if (routeCoords?.length) {
        mapRef.current?.fitToCoordinates(routeCoords, {
          edgePadding: { top: 180, right: 60, bottom: 220, left: 60 },
          animated: true,
        });
      }
    });
  }, [routeCoords]);

  // MAIN: watch GPS and update step + voice prompts + snapping + camera
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 300,
          distanceInterval: 1,
        },
        (loc) => {
          const hereRaw: LatLng = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };

          setUserLoc(hereRaw);

          // heading for arrow + ref for camera (no stale closure)
          if (typeof loc.coords.heading === "number" && !Number.isNaN(loc.coords.heading)) {
            setHeading(loc.coords.heading);
            if (loc.coords.heading > 0) headingRef.current = loc.coords.heading;
          }

          // --- SNAP TO LINE ---
          const snap = closestPointOnPolyline(hereRaw, routeCoords || []);
          setOffRouteMeters(snap.distanceMeters);

          // only “snap” if you're reasonably close to the route
          const SNAP_THRESHOLD = 35; // meters
          const hereForNav = snap.distanceMeters <= SNAP_THRESHOLD ? snap.point : hereRaw;

          setSnappedLoc(snap.distanceMeters <= SNAP_THRESHOLD ? snap.point : null);

          // --- CAMERA FOLLOW (LOCKED: prevents zoom-out creep) ---
          if (followMode && mapRef.current) {
            const now = Date.now();
            if (now - lastCamTsRef.current > 180) {
              lastCamTsRef.current = now;

              const camera: any = {
                center: hereForNav,
                heading: headingRef.current || 0,
                pitch: 70,
              };

              // lock zoom every update
              if (Platform.OS === "ios") {
                camera.altitude = LOCKED_ALTITUDE_IOS;
              } else {
                camera.zoom = LOCKED_ZOOM_ANDROID;
              }

              // setCamera is more stable than animateCamera here
              mapRef.current.setCamera(camera);
            }
          }

          // --- Step logic + voice ---
          const s = steps?.[currentStep];
          const stepEnd = s?.endLocation?.latLng;

          if (stepEnd?.latitude && stepEnd?.longitude) {
            const end: LatLng = { latitude: stepEnd.latitude, longitude: stepEnd.longitude };
            const d = distMeters(hereForNav, end);

            // “Approaching” cue once per step
            const approachThreshold = 140;
            if (d < approachThreshold && lastApproachSpokenRef.current !== currentStep) {
              lastApproachSpokenRef.current = currentStep;

              const raw = safeText(s?.navigationInstruction?.instructions);
              const phrase = metersToPhrase(d);
              say(`${phrase}, ${raw}`);
            }

            // “Do it now” + advance step
            const advanceThreshold = 25;
            if (d < advanceThreshold) {
              if (lastSpokenStepRef.current !== currentStep) {
                lastSpokenStepRef.current = currentStep;
                const raw = safeText(s?.navigationInstruction?.instructions);
                say(raw);
              }

              if (currentStep < (steps?.length ?? 1) - 1) {
                setCurrentStep((p) => p + 1);
              } else {
                say("You have arrived.");
              }
            }
          }
        }
      );
    })();

    return () => {
      sub?.remove();
    };
  }, [currentStep, steps, followMode, voiceOn, routeCoords]);

  const carPos = snappedLoc ?? userLoc;

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

        {carPos && (
          <Marker
            coordinate={carPos}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={heading}
            tracksViewChanges={false}
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
        <Text style={styles.bannerSub}>
          {offRouteMeters <= 35 ? "Snapped to route" : `Off route: ${Math.round(offRouteMeters)}m`}
        </Text>
      </View>

      {/* Exit */}
      <TouchableOpacity style={styles.exitBtn} onPress={() => nav.goBack()}>
        <Text style={styles.exitText}>Exit</Text>
      </TouchableOpacity>

      {/* Re-center */}
      <TouchableOpacity style={styles.followBtn} onPress={() => setFollowMode(true)}>
        <Text style={styles.followText}>Re-center</Text>
      </TouchableOpacity>

      {/* Voice toggle */}
      <TouchableOpacity
        style={[styles.voiceBtn, !voiceOn && { opacity: 0.6 }]}
        onPress={() => {
          Speech.stop();
          setVoiceOn((v) => !v);
        }}
      >
        <Text style={styles.voiceText}>{voiceOn ? "Voice: On" : "Voice: Off"}</Text>
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
  bannerSub: { marginTop: 6, color: "#777", fontSize: 12, fontWeight: "600" },

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

  voiceBtn: {
    position: "absolute",
    left: 16,
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
  voiceText: { fontWeight: "800" },

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
  carIcon: { fontSize: 18, fontWeight: "900" },
});
