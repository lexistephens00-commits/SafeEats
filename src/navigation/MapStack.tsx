import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MapScreen from "../screens/MapScreen";
import NavigationScreen from "../screens/NavigationScreen";

const Stack = createNativeStackNavigator();

export default function MapStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MapHome" component={MapScreen} />
      <Stack.Screen name="Navigation" component={NavigationScreen} />
    </Stack.Navigator>
  );
}
