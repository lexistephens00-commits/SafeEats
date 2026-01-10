// src/screens/MapScreen.tsx
import { View, StyleSheet } from "react-native";
import Mapbox from "@rnmapbox/maps";
import { useMemo, useRef, useState } from "react";
import type { Feature, Point } from "geojson";


import SearchOverlay from "../components/SearchOverlay";
import MapControls from "../components/MapControls";
import type { SearchPlace } from "../services/mapboxSearch";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string);

export default function MapScreen() {
  const cameraRef = useRef<Mapbox.Camera>(null);
  const [selected, setSelected] = useState<SearchPlace | null>(null);

  const selectedFeature = useMemo<Feature<Point> | null>(() => {
  if (!selected) return null;

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [selected.longitude, selected.latitude], // mutable array ✅
    },
    properties: {
      title: selected.name,
      address: selected.address ?? "",
    },
  };
}, [selected]);


  function handleSelectPlace(place: SearchPlace) {
    setSelected(place);

    // Stop following user and fly to selection
    cameraRef.current?.flyTo([place.longitude, place.latitude], 900);
    cameraRef.current?.zoomTo(14, 900);
  }

  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} logoEnabled={false}>
        <Mapbox.Camera
          ref={cameraRef}
          followUserLocation={!selected}
          followZoomLevel={14}
          animationMode="flyTo"
          animationDuration={900}
        />
        <Mapbox.UserLocation visible />

        {/* Selected destination pin */}
        {selectedFeature && (
          <Mapbox.ShapeSource id="selected" shape={selectedFeature}>
            <Mapbox.SymbolLayer
              id="selectedPin"
              style={{
                iconImage: "marker-15",
                iconSize: 1.3,
                iconAllowOverlap: true,
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </Mapbox.MapView>

      <SearchOverlay onSelectPlace={handleSelectPlace} />

      <MapControls
        onRecenter={() => {
          setSelected(null);
          // going back to follow user location happens automatically via followUserLocation={!selected}
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
