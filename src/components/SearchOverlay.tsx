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
} from "react-native";
import { searchPlacesMapbox, type SearchPlace } from "../services/mapboxSearch";

export default function SearchOverlay({
  onSelectPlace,
}: {
  onSelectPlace: (place: SearchPlace) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<SearchPlace[]>([]);

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

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

      if (r.length >0) {
        onSelectPlace(r[0]);
        setResults([]);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }
  
  return (
  <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {/* ✅ Touch shield: when results are open, this blocks the map from stealing taps */}
    {results.length > 0 && (
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          Keyboard.dismiss();
          setResults([]);
        }}
      />
    )}

    {/* UI container */}
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
        <Pressable style={styles.goBtn} onPress={runSearchNow}>
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.goText}>Go</Text>
          )}
        </Pressable>
      </View>

      {(err || results.length > 0) && (
        <View style={styles.panel} pointerEvents="auto">
          {err ? <Text style={styles.err}>{err}</Text> : null}

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  // ✅ Tap confirmation (remove later)
                  console.log("Tapped result:", item.name);

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
      )}
    </View>
  </View>
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

  panel: {
    marginTop: 10,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden",
    maxHeight: 260,
    zIndex: 9999,

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
