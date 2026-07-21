import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Field, ModalScreen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { toISODate } from '@/lib/dates';
import { pickImage } from '@/lib/media';
import { shareMilestone } from '@/lib/share';
import { useActivePet, useApp } from '@/lib/store';

export default function MilestoneEntry() {
  const t = useTheme();
  const router = useRouter();
  const pet = useActivePet();
  const addMilestone = useApp((s) => s.addMilestone);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [photoUri, setPhotoUri] = useState<string | undefined>();

  const choosePhoto = () =>
    Alert.alert('Fotografija', 'Odakle?', [
      { text: 'Kamera', onPress: async () => setPhotoUri((await pickImage(true)) ?? photoUri) },
      { text: 'Galerija', onPress: async () => setPhotoUri((await pickImage(false)) ?? photoUri) },
      { text: 'Otkaži', style: 'cancel' },
    ]);

  const save = (thenShare: boolean) => {
    if (!pet || !title.trim()) {
      Alert.alert('Naslov je obavezan', 'npr. „Preselio se u novu kuću 🏡"');
      return;
    }
    const milestone = addMilestone({
      petId: pet.id,
      title: title.trim(),
      description: description.trim() || undefined,
      dateISO: toISODate(date),
      photoUri,
    });
    router.back();
    if (thenShare) {
      // Kratka pauza da se modal zatvori pre otvaranja share sheet-a.
      setTimeout(() => shareMilestone(milestone, pet.name), 400);
    }
  };

  return (
    <ModalScreen>
      <Field label="Šta se desilo? *" value={title} onChangeText={setTitle} placeholder="npr. Prvi dan na plaži 🌊" autoFocus />
      <Field label="Opis" value={description} onChangeText={setDescription} placeholder="detalji za priču…" multiline />
      <DateField label="Datum" value={date} onChange={setDate} />

      <Pressable onPress={choosePhoto} style={{ marginTop: 14 }}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ height: 160, borderRadius: 12 }} contentFit="cover" />
        ) : (
          <View
            style={{
              height: 100,
              borderRadius: 12,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: t.line,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.surface,
            }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.muted }}>＋ Dodaj fotografiju</Text>
          </View>
        )}
      </Pressable>

      <Btn label="Sačuvaj i podeli" icon="share-social" onPress={() => save(true)} />
      <Btn label="Samo sačuvaj" kind="ghost" onPress={() => save(false)} />
    </ModalScreen>
  );
}
