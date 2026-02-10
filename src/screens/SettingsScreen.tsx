import React from "react";
import { View, Text, Switch, Pressable } from "react-native";
import { useSettingsStore } from "../store/settingsStore";

export default function SettingsScreen() {
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const resetSettings = useSettingsStore((s) => s.resetSettings);

  const bumpRadius = async (delta: number) => {
    const next = Math.max(1, Math.min(25, settings.searchRadiusMiles + delta));
    await setSettings({ searchRadiusMiles: next });
  };

  const bumpSafety = async (delta: number) => {
    const next = Math.max(0, Math.min(100, settings.minSafetyScore + delta));
    await setSettings({ minSafetyScore: next });
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 18 }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>Settings</Text>

      <Row label="Gluten-free only">
        <Switch
          value={settings.glutenFreeOnly}
          onValueChange={(v) => setSettings({ glutenFreeOnly: v })}
        />
      </Row>

      <Row label="Dairy-free">
        <Switch
          value={settings.dairyFree}
          onValueChange={(v) => setSettings({ dairyFree: v })}
        />
      </Row>

      <Row label="Nut-free">
        <Switch
          value={settings.nutFree}
          onValueChange={(v) => setSettings({ nutFree: v })}
        />
      </Row>

      <Row label="Show GF pins">
        <Switch
          value={settings.showGfPins}
          onValueChange={(v) => setSettings({ showGfPins: v })}
        />
      </Row>

      <StepperRow
        label={`Search radius (${settings.units})`}
        value={`${settings.searchRadiusMiles}`}
        onMinus={() => bumpRadius(-1)}
        onPlus={() => bumpRadius(1)}
      />

      <StepperRow
        label="Minimum safety score"
        value={`${settings.minSafetyScore}`}
        onMinus={() => bumpSafety(-5)}
        onPlus={() => bumpSafety(5)}
      />

      <Row label="Notifications">
        <Switch
          value={settings.notifications}
          onValueChange={(v) => setSettings({ notifications: v })}
        />
      </Row>

      <Pressable
        onPress={resetSettings}
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <Text style={{ fontWeight: "700" }}>Reset to defaults</Text>
      </Pressable>
    </View>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "600" }}>{label}</Text>
      {children}
    </View>
  );
}

function StepperRow({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: "600" }}>
        {label}: {value}
      </Text>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onMinus}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderRadius: 12,
          }}
        >
          <Text style={{ fontWeight: "700" }}>-</Text>
        </Pressable>

        <Pressable
          onPress={onPlus}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderRadius: 12,
          }}
        >
          <Text style={{ fontWeight: "700" }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
