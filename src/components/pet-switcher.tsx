import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FREE_PET_LIMIT, useApp } from '@/lib/store';

/** Traka sa ljubimcima na vrhu — promena ljubimca menja temu cele aplikacije. */
export function PetSwitcher() {
  const t = useTheme();
  const router = useRouter();
  const pets = useApp((s) => s.pets);
  const activePetId = useApp((s) => s.activePetId);
  const setActivePet = useApp((s) => s.setActivePet);
  const premium = useApp((s) => s.premium);

  const canAddFree = pets.length < FREE_PET_LIMIT;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {pets.map((p) => {
        const active = p.id === activePetId;
        return (
          <Pressable
            key={p.id}
            onPress={() => setActivePet(p.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1.5,
              borderColor: active ? t.accent : t.line,
              backgroundColor: active ? t.accentSoft : t.surface,
              borderRadius: 999,
              paddingVertical: 6,
              paddingLeft: 6,
              paddingRight: 14,
              minHeight: 44,
            }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: t.chip,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {p.photoUri ? (
                <Image source={{ uri: p.photoUri }} style={{ width: 32, height: 32 }} />
              ) : (
                <Ionicons name="paw" size={16} color={t.accentDeep} />
              )}
            </View>
            <Text style={{ fontWeight: '600', fontSize: 14, color: active ? t.text : t.muted }}>
              {p.name}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => router.push(premium || canAddFree ? '/pet-form' : '/paywall')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: t.line,
          backgroundColor: t.surface,
          borderRadius: 999,
          paddingHorizontal: 14,
          minHeight: 44,
          opacity: 0.85,
        }}>
        <Ionicons name="add" size={16} color={t.muted} />
        <Text style={{ fontWeight: '600', fontSize: 14, color: t.muted }}>Dodaj</Text>
        {!premium && !canAddFree ? <Ionicons name="lock-closed" size={13} color={t.gold} /> : null}
      </Pressable>
    </ScrollView>
  );
}
