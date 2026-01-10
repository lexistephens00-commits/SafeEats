// src/components/MapControls.tsx
import { View, Pressable, Text, StyleSheet } from "react-native";

export default function MapControls({
  onRecenter,
}: {
  onRecenter: () => void;
}) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable style={styles.btn} onPress={onRecenter}>
        <Text style={styles.txt}>Recenter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 12,
    bottom: 24,
    zIndex: 40,
  },
  btn: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#eee",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  txt: { color: "#111", fontWeight: "700" },
});
