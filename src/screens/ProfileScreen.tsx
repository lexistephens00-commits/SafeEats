import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useSettingsStore } from "../store/settingsStore";

export default function ProfileScreen({ navigation }: any) {
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const [name, setName] = useState(settings.displayName);

  useEffect(() => {
    setName(settings.displayName);
  }, [settings.displayName]);

  const summary = useMemo(() => {
    const filters = [
      settings.glutenFreeOnly ? "Gluten-free" : null,
      settings.dairyFree ? "Dairy-free" : null,
      settings.nutFree ? "Nut-free" : null,
    ].filter(Boolean);

    return {
      filters: filters.length ? filters.join(" • ") : "None selected",
      pins: settings.showGfPins ? "On" : "Off",
      radius: `${settings.searchRadiusMiles} ${settings.units}`,
      safety: `${settings.minSafetyScore}+`,
    };
  }, [settings]);

  async function saveName() {
    const cleaned = name.trim();
    await setSettings({ displayName: cleaned.length ? cleaned : "User" });
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>Profile</Text>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Display name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={saveName}
          placeholder="Your name"
          style={{
            padding: 12,
            borderWidth: 1,
            borderRadius: 12,
          }}
        />
        <Text style={{ opacity: 0.7 }}>
          Saves automatically when you tap out.
        </Text>
      </View>

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Preferences</Text>
        <Row label="Filters" value={summary.filters} />
        <Row label="GF Pins" value={summary.pins} />
        <Row label="Search radius" value={summary.radius} />
        <Row label="Safety threshold" value={summary.safety} />
      </View>

      <Pressable
        onPress={() => navigation.navigate("Settings")}
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          alignItems: "center",
        }}
      >
        <Text style={{ fontWeight: "700" }}>Open Settings</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ fontSize: 14, fontWeight: "600", opacity: 0.8 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
