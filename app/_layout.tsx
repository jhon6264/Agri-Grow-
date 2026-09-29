import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StatusBar } from 'react-native';
import 'react-native-reanimated';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { enableForegroundReminders } from '@/src/calendar/reminders';
import { ContentProvider } from '@/src/others/ContentProvider';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => { enableForegroundReminders(); }, []);
  const [loaded, error] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const navigationTheme = colorScheme === 'dark'
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.surfaceElevated,
          text: colors.text,
          border: colors.border,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.surfaceElevated,
          text: colors.text,
          border: colors.border,
        },
      };

  return (
    <KeyboardProvider preload={false}>
      <ContentProvider><ThemeProvider value={navigationTheme}>
        <StatusBar
          backgroundColor="transparent"
          barStyle={colors.statusBar === 'dark' ? 'dark-content' : 'light-content'}
          translucent={Platform.OS === 'android'}
        />
        <Stack>
          <Stack.Screen
            name="(tabs)"
            options={{
              contentStyle: { backgroundColor: 'transparent' },
              headerShown: false,
              navigationBarColor: 'transparent',
              navigationBarTranslucent: true,
              statusBarBackgroundColor: 'transparent',
              statusBarTranslucent: true,
            }}
          />
          <Stack.Screen
            name="modal"
            options={{
              presentation: 'modal',
              title: 'About AgriGrow',
              headerStyle: { backgroundColor: colors.surfaceElevated },
              headerTintColor: colors.text,
              headerTitleStyle: { fontFamily: 'IBMPlexMono_600SemiBold' },
            }}
          />
          <Stack.Screen name="weather" options={{ headerShown: false, contentStyle: { backgroundColor: '#F7FAF4' } }} />
          <Stack.Screen name="market-prices" options={{ headerShown: false, contentStyle: { backgroundColor: '#F7FAF4' } }} />
          <Stack.Screen name="almanac" options={{ headerShown: false, contentStyle: { backgroundColor: '#F7FAF4' } }} />
        </Stack>
      </ThemeProvider></ContentProvider>
    </KeyboardProvider>
  );
}
