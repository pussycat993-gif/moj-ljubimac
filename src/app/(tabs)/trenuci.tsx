import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Card, EmptyState, H1, Screen, Sub } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/dates';
import { shareMilestone } from '@/lib/share';
import { useActivePet, useApp, usePetMilestones } from '@/lib/store';

export default function MomentsScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pet = useActivePet();
  const milestones = usePetMilestones(pet?.id);
  const deleteMilestone = useApp((s) => s.deleteMilestone);

  return (
    <Screen>
      <View style={{ height: insets.top }} />
      <H1>Trenuci 📸</H1>
      <Sub>{pet ? `${pet.name}${pet.sex === 'f' ? 'ina' : 'ova'} priča, od prvog dana` : 'Priča tvog ljubimca'}</Sub>

      {milestones.length === 0 ? (
        <EmptyState
          icon="images"
          title="Još nema trenutaka"
          desc="Dodaj prvi: rođendan, selidbu, novi trik — sa fotografijom."
        />
      ) : (
        <View style={{ marginTop: 8 }}>
          {milestones.map((m) => (
            <Card key={m.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: t.accentDeep, letterSpacing: 0.4 }}>
                  {formatDate(m.dateISO).toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <Pressable onPress={() => pet && shareMilestone(m, pet.name)} hitSlop={10}>
                    <Ionicons name="share-social" size={19} color={t.accentDeep} />
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      Alert.alert('Obriši trenutak?', m.title, [
                        { text: 'Otkaži', style: 'cancel' },
                        { text: 'Obriši', style: 'destructive', onPress: () => deleteMilestone(m.id) },
                      ])
                    }
                    hitSlop={10}>
                    <Ionicons name="trash" size={19} color={t.muted} />
                  </Pressable>
                </View>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: t.text, marginTop: 6 }}>{m.title}</Text>
              {m.description ? (
                <Text style={{ fontSize: 13, color: t.muted, marginTop: 4 }}>{m.description}</Text>
              ) : null}
              {m.photoUri ? (
                <Image
                  source={{ uri: m.photoUri }}
                  style={{ height: 180, borderRadius: 12, marginTop: 10 }}
                  contentFit="cover"
                />
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <Btn label="Dodaj trenutak" icon="add" onPress={() => router.push('/entry/milestone')} />
    </Screen>
  );
}
