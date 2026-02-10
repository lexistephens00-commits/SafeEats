import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MapStack from "./MapStack";
import PlacesScreen from "../screens/PlacesScreen";
import SavedScreen from "../screens/SavedScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Map" component={MapStack} />
      <Tab.Screen name="Places" component={PlacesScreen} />
      <Tab.Screen name="Saved" component={SavedScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
