import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { MilestonePopup } from '@/components/milestone-popup';
import { useTheme } from '@/hooks/use-theme';
import { ensureNotificationPermission } from '@/lib/notifications';
import { useApp } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const t = useTheme();
  const seedIfEmpty = useApp((s) => s.seedIfEmpty);

  useEffect(() => {
    seedIfEmpty();
    ensureNotificationPermission();
    SplashScreen.hideAsync();
  }, [seedIfEmpty]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="pet-form" options={{ presentation: 'modal', title: 'Ljubimac' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'Moj Ljubimac Premium' }} />
        <Stack.Screen name="entry/weight" options={{ presentation: 'modal', title: 'Novo merenje' }} />
        <Stack.Screen name="entry/vaccination" options={{ presentation: 'modal', title: 'Vakcinacija' }} />
        <Stack.Screen name="entry/medication" options={{ presentation: 'modal', title: 'Terapija / lek' }} />
        <Stack.Screen name="entry/checkup" options={{ presentation: 'modal', title: 'Veterinarski pregled' }} />
        <Stack.Screen name="entry/milestone" options={{ presentation: 'modal', title: 'Novi trenutak' }} />
        <Stack.Screen name="entry/reminder" options={{ presentation: 'modal', title: 'Podsetnik' }} />
        <Stack.Screen name="entry/food" options={{ presentation: 'modal', title: 'Ishrana' }} />
      </Stack>
      <MilestonePopup />
    </>
  );
}
