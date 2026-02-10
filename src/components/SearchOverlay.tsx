// src/components/SearchOverlay.tsx
import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  Keyboard,
  ActivityIndicator,
  Modal,
} from "react-native";
import { searchPlacesMapbox, type SearchPlace } from "../services/mapboxSearch";

export default function SearchOverlay({
  onSelectPlace,
  onOpenChange,
}: {
  onSelectPlace: (place: SearchPlace) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<SearchPlace[]>([]);

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  // Tell parent when dropdown/modal is open (so MapScreen can disable map gestures)
  useEffect(() => {
    onOpenChange?.(!!err || results.length > 0);
  }, [err, results.length, onOpenChange]);

  // Debounced search while typing
  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setErr(null);
      return;
    }

    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await searchPlacesMapbox(query, 6);
        setResults(r);
      } catch (e: any) {
        setErr(e?.message ?? "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [query, canSearch]);

  async function runSearchNow() {
    const q = query.trim();
    if (q.length < 2) return;

    Keyboard.dismiss();
    setLoading(true);
    setErr(null);
    try {
      const r = await searchPlacesMapbox(q, 8);
      setResults(r);

      // Optional: auto-zoom on "Go" to best result
      if (r.length > 0) {
        onSelectPlace(r[0]);
        setResults([]); // close results after auto-select
      }
    } catch (e: any) {
      setErr(e?.message ?? "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const modalVisible = !!err || results.length > 0;

  return (
    <>
      {/* Search bar stays on top of the map */}
      <View style={styles.wrap}>
        <View style={styles.bar}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search anywhere (city, address, restaurant)…"
            placeholderTextColor="#666"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={runSearchNow}
            autoCorrect={false}
            autoCapitalize="none"
          />

          {
            query.length > 0 && (
              <Pressable
                style={styles.clearBtn}
                onPress={() => {
                  setQuery("");
                    setResults([]);
                    setErr(null);
                    Keyboard.dismiss();
          }}
          hitSlop={10}
          >
            <Text style={styles.clearText}>×</Text>
            </Pressable>
            )}

          <Pressable style={styles.goBtn} onPress={runSearchNow}>
            {loading ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.goText}>Go</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* ✅ Modal results: always tappable above Mapbox on iOS */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          Keyboard.dismiss();
          setResults([]);
        }}
      >
        {/* Tap outside closes */}
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            Keyboard.dismiss();
            setResults([]);
          }}
        />

        {/* Dropdown panel */}
        <View style={styles.modalPanel} pointerEvents="auto">
          {err ? <Text style={styles.err}>{err}</Text> : null}

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  // ✅ On-device proof that taps are registering (remove later)

                  Keyboard.dismiss();
                  setResults([]);
                  onSelectPlace(item);
                }}
              >
                <Text style={styles.name}>{item.name}</Text>
                {!!item.address && (
                  <Text style={styles.addr} numberOfLines={1}>
                    {item.address}
                  </Text>
                )}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 56,
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  clearBtn: {
    height: 42,
    width: 42,
    borderRadius: 12,
    backgroundColor: "f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: {
    fontSize: 24,
    color: "#111",
    fontWeight: "700",
    lineHeight: 22,
  },
  bar: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  input: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#f6f6f6",
    color: "#111",
  },
  goBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 54,
  },
  goText: { color: "white", fontWeight: "700" },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },

  modalPanel: {
    position: "absolute",
    top: 56 + 62, // search bar top + bar height-ish
    left: 12,
    right: 12,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
    maxHeight: 320,
  },

  err: {
    padding: 12,
    color: "#b00020",
    fontWeight: "600",
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f2f2f2",
  },
  name: { fontSize: 14, fontWeight: "700", color: "#111" },
  addr: { marginTop: 2, fontSize: 12, color: "#666" },
});
