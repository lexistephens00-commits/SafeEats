import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MapStack from "./MapStack";
import SavedScreen from "../screens/SavedScreen";
import ProfileStack from "./ProfileStack";

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Map" component={MapStack} />
      <Tab.Screen name="Saved" component={SavedScreen} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}
