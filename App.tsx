import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PracticeProvider } from "./src/context/PracticeContext";
import { RootStackParamList } from "./src/navigation/types";
import { DigitalTwinProfileScreen } from "./src/screens/DigitalTwinProfileScreen";
import { FeedbackReportScreen } from "./src/screens/FeedbackReportScreen";
import { HomeDashboardScreen } from "./src/screens/HomeDashboardScreen";
import { PracticeRecordingScreen } from "./src/screens/PracticeRecordingScreen";
import { RealTimeAnalysisScreen } from "./src/screens/RealTimeAnalysisScreen";
import { StudioOpsScreen } from "./src/screens/StudioOpsScreen";
import { colors } from "./src/theme/colors";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.panel,
    border: "transparent",
    primary: colors.cyan,
    text: colors.textPrimary
  }
};

export default function App() {
  return (
    <SafeAreaProvider>
      <PracticeProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: "slide_from_right",
              contentStyle: { backgroundColor: colors.background }
            }}
          >
            <Stack.Screen name="Home" component={HomeDashboardScreen} />
            <Stack.Screen name="Practice" component={PracticeRecordingScreen} />
            <Stack.Screen name="Analysis" component={RealTimeAnalysisScreen} />
            <Stack.Screen name="Feedback" component={FeedbackReportScreen} />
            <Stack.Screen name="Profile" component={DigitalTwinProfileScreen} />
            <Stack.Screen name="StudioOps" component={StudioOpsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </PracticeProvider>
    </SafeAreaProvider>
  );
}
