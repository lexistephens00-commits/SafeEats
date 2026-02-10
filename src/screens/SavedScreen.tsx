import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

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

function safetyLabel(s: SavedPlace["safety"]) {
  if (s === "green") return "Safe ✅";
  if (s === "blue") return "Good 👍";
  if (s === "yellow") return "Caution ⚠️";
  return "Avoid ⛔️";
}

export default function SavedScreen() {
  const [saved, setSaved] = useState<SavedPlace[]>([]);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const arr: SavedPlace[] = raw ? JSON.parse(raw) : [];
      // newest first
      arr.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
      setSaved(arr);
    } catch {
      setSaved([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function removePlace(id: string) {
    const next = saved.filter((p) => p.id !== id);
    setSaved(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Saved</Text>
      <Text style={styles.subtitle}>Restaurants you’ve saved for later</Text>

      {saved.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No saved places yet</Text>
          <Text style={styles.emptyText}>
            Tap a pin on the map and hit “Save to Favorites”.
          </Text>
        </View>
      ) : (
        <FlatList
          data={saved}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 30 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                {!!item.rating && (
                  <Text style={styles.meta}>⭐ {item.rating.toFixed(1)}</Text>
                )}
                <Text style={styles.meta}>{safetyLabel(item.safety)}</Text>
                {!!item.isChain && <Text style={styles.meta}>Chain</Text>}
              </View>

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() =>
                  Alert.alert("Remove?", `Remove ${item.name} from Saved?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => removePlace(item.id) },
                  ])
                }
              >
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: "white" },
  title: { fontSize: 28, fontWeight: "900", marginTop: 20 },
  subtitle: { marginTop: 6, color: "#666", fontWeight: "700" },

  emptyWrap: {
    marginTop: 28,
    backgroundColor: "#F5F6F7",
    borderRadius: 18,
    padding: 18,
  },
  emptyTitle: { fontSize: 18, fontWeight: "900" },
  emptyText: { marginTop: 8, color: "#555", fontWeight: "600", lineHeight: 20 },

  card: {
    marginTop: 12,
    backgroundColor: "#F5F6F7",
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  name: { fontSize: 16, fontWeight: "900" },
  meta: { marginTop: 6, color: "#555", fontWeight: "800" },

  removeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E2E2E2",
  },
  removeText: { fontWeight: "900" },
});
