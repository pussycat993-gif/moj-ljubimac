import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Btn } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/dates';
import { shareMilestone, shareViaApp } from '@/lib/share';
import { useActivePet, usePetMilestones } from '@/lib/store';

/** Popup se prikazuje jednom po pokretanju aplikacije. */
let shownThisSession = false;

const RECENT_DAYS = 7;

export function MilestonePopup() {
  const t = useTheme();
  const pet = useActivePet();
  const milestones = usePetMilestones(pet?.id);
  const [visible, setVisible] = useState(false);

  const latest = milestones[0];
  const latestDateISO = latest?.dateISO;

  useEffect(() => {
    // Provera „svežine" u efektu, ne u renderu (Date.now nije čist za render).
    const isRecent =
      !!latestDateISO &&
      Date.now() - new Date(latestDateISO).getTime() < RECENT_DAYS * 86_400_000;
    if (!shownThisSession && isRecent) {
      shownThisSession = true;
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, [latestDateISO]);

  if (!latest || !pet) return null;

  const shareButtons = [
    {
      key: 'fb',
      label: 'Facebook',
      icon: 'logo-facebook' as const,
      onPress: () => shareMilestone(latest, pet.name),
    },
    {
      key: 'ig',
      label: 'Instagram',
      icon: 'logo-instagram' as const,
      onPress: () => shareMilestone(latest, pet.name),
    },
    {
      key: 'viber',
      label: 'Viber',
      icon: 'call' as const,
      onPress: () => shareViaApp('viber', latest, pet.name),
    },
    {
      key: 'wa',
      label: 'WhatsApp',
      icon: 'logo-whatsapp' as const,
      onPress: () => shareViaApp('whatsapp', latest, pet.name),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,18,0.55)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            padding: 22,
            paddingBottom: 34,
          }}>
          <View
            style={{
              borderRadius: 18,
              padding: 22,
              alignItems: 'center',
              backgroundColor: t.accentSoft,
              borderWidth: 1,
              borderColor: t.line,
            }}>
            {latest.photoUri ? (
              <Image
                source={{ uri: latest.photoUri }}
                style={{ width: 96, height: 96, borderRadius: 16, marginBottom: 10 }}
              />
            ) : (
              <Text style={{ fontSize: 40 }}>🐾✨</Text>
            )}
            <Text style={{ fontSize: 21, fontWeight: '700', color: t.text, textAlign: 'center', marginTop: 6 }}>
              {pet.name}: {latest.title}
            </Text>
            <Text style={{ fontSize: 13, color: t.muted, marginTop: 6 }}>
              Novi trenutak · {formatDate(latest.dateISO)}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {shareButtons.map((b) => (
              <Pressable
                key={b.key}
                onPress={b.onPress}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    minHeight: 56,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: t.line,
                    backgroundColor: t.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                  },
                  pressed && { opacity: 0.7 },
                ]}>
                <Ionicons name={b.icon} size={20} color={t.accentDeep} />
                <Text style={{ fontSize: 10, fontWeight: '600', color: t.muted }}>{b.label}</Text>
              </Pressable>
            ))}
          </View>

          <Btn label="Zatvori" kind="ghost" onPress={() => setVisible(false)} />
        </View>
      </View>
    </Modal>
  );
}
