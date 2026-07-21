import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Card, EmptyState, H1, Row, Screen, SectionTitle, Sub, Tag } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useActivePet, useApp, usePetFood, usePetStools, usePetWeights } from '@/lib/store';
import { STOOL_EMOJI, STOOL_LABEL, type StoolQuality } from '@/lib/types';

const QUALITIES: StoolQuality[] = ['odlicna', 'normalna', 'meka', 'problem'];

export default function FoodScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pet = useActivePet();
  const food = usePetFood(pet?.id);
  const stools = usePetStools(pet?.id);
  const weights = usePetWeights(pet?.id);
  const premium = useApp((s) => s.premium);
  const addStool = useApp((s) => s.addStool);

  /* Analitika: procenat odličnih/normalnih stolica u poslednjih 30 dana + trend težine.
     U useMemo — i zbog performansi i zbog React pravila čistoće (Date.now u renderu). */
  // „Sada" uhvaćeno jednom po montiranju ekrana — dozvoljeno mesto za Date.now().
  const [now] = useState(() => Date.now());
  const { recent, goodShare, weightDelta } = useMemo(() => {
    const monthAgo = now - 30 * 86_400_000;
    const recentStools = stools.filter((s) => new Date(s.dateISO).getTime() >= monthAgo);
    return {
      recent: recentStools,
      goodShare:
        recentStools.length === 0
          ? null
          : Math.round(
              (recentStools.filter((s) => s.quality === 'odlicna' || s.quality === 'normalna')
                .length /
                recentStools.length) *
                100
            ),
      weightDelta: weights.length >= 2 ? weights[weights.length - 1].kg - weights[0].kg : null,
    };
  }, [now, stools, weights]);

  return (
    <Screen>
      <View style={{ height: insets.top }} />
      <H1>Ishrana</H1>
      <Sub>{food?.brand ? `Trenutni brend: ${food.brand}` : 'Brend hrane još nije unet'}</Sub>

      <Card>
        <Row
          icon="restaurant"
          title="Dnevni obrok"
          desc={
            food?.dailyGrams
              ? `${food.dailyGrams} g dnevno${food.notes ? ` · ${food.notes}` : ''}`
              : 'Unesi brend i dnevnu količinu'
          }
        />
        <Btn label="Izmeni ishranu" kind="ghost" onPress={() => router.push('/entry/food')} />
      </Card>

      <SectionTitle>Kakva je stolica danas?</SectionTitle>
      <Card>
        <Text style={{ fontSize: 13, color: t.muted }}>
          Beleženje pomaže da vidiš kako brend hrane utiče na varenje.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {QUALITIES.map((q) => (
            <Pressable
              key={q}
              onPress={() => {
                if (!pet) return;
                addStool(pet.id, q);
                Alert.alert('Zabeleženo', `Stolica: ${STOOL_LABEL[q]}`);
              }}
              style={({ pressed }) => [
                {
                  flex: 1,
                  minHeight: 56,
                  borderWidth: 1.5,
                  borderColor: t.line,
                  backgroundColor: t.surface,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                pressed && { borderColor: t.accent, transform: [{ scale: 0.95 }] },
              ]}>
              <Text style={{ fontSize: 20 }}>{STOOL_EMOJI[q]}</Text>
              <Text style={{ fontSize: 10.5, fontWeight: '600', color: t.muted }}>{STOOL_LABEL[q]}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {stools.length > 0 && (
        <Card>
          <Text style={{ fontSize: 13, color: t.muted }}>
            Poslednji zapisi:{' '}
            {stools.slice(0, 8).map((s) => STOOL_EMOJI[s.quality]).join(' ')}
          </Text>
        </Card>
      )}

      <SectionTitle>Analitika ishrane</SectionTitle>
      {premium ? (
        recent.length === 0 && weightDelta === null ? (
          <EmptyState icon="stats-chart" title="Još nema podataka" desc="Beleži stolicu i težinu — analitika se pravi sama." />
        ) : (
          <Card>
            <Row
              icon="stats-chart"
              title={
                goodShare === null
                  ? 'Nema zapisa u poslednjih 30 dana'
                  : `${food?.brand ?? 'Trenutna hrana'} → ${goodShare}% dobrih stolica`
              }
              desc={
                weightDelta === null
                  ? 'Poslednjih 30 dana'
                  : `Poslednjih 30 dana · težina ${weightDelta >= 0 ? '+' : '−'}${Math.abs(weightDelta)
                      .toFixed(1)
                      .replace('.', ',')} kg`
              }
              right={goodShare !== null && goodShare >= 75 ? <Tag tone="ok">dobro ide</Tag> : undefined}
            />
          </Card>
        )
      ) : (
        <Card style={{ opacity: 0.8 }}>
          <Row
            icon="stats-chart"
            title="Korelacija hrane, stolice i težine"
            desc="Vidi kako promena brenda utiče na varenje i kilažu."
            right={<Tag tone="gold">🔒 Premium</Tag>}
          />
          <Btn label="Otključaj punu analitiku" kind="ghost" onPress={() => router.push('/paywall')} />
        </Card>
      )}
    </Screen>
  );
}
