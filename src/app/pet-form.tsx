import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Field, ModalScreen, Segmented } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { toISODate } from '@/lib/dates';
import { pickImage } from '@/lib/media';
import { cancelScheduled, scheduleBirthday } from '@/lib/notifications';
import { useApp } from '@/lib/store';
import type { Sex, Species } from '@/lib/types';

export default function PetForm() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useApp((s) => s.pets.find((p) => p.id === id));
  const addPet = useApp((s) => s.addPet);
  const updatePet = useApp((s) => s.updatePet);

  const [name, setName] = useState(existing?.name ?? '');
  const [species, setSpecies] = useState<Species>(existing?.species ?? 'pas');
  const [breed, setBreed] = useState(existing?.breed ?? '');
  const [sex, setSex] = useState<Sex>(existing?.sex ?? 'f');
  const [dob, setDob] = useState(existing ? new Date(existing.dob) : new Date());
  const [microchip, setMicrochip] = useState(existing?.microchip ?? '');
  const [neutered, setNeutered] = useState(existing?.neutered ?? false);
  const [photoUri, setPhotoUri] = useState(existing?.photoUri);

  const choosePhoto = () =>
    Alert.alert('Fotografija', 'Odakle?', [
      { text: 'Kamera', onPress: async () => setPhotoUri((await pickImage(true)) ?? photoUri) },
      { text: 'Galerija', onPress: async () => setPhotoUri((await pickImage(false)) ?? photoUri) },
      { text: 'Otkaži', style: 'cancel' },
    ]);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Ime je obavezno', 'Unesi ime ljubimca.');
      return;
    }
    const data = {
      name: name.trim(),
      species,
      breed: breed.trim(),
      sex,
      dob: toISODate(dob),
      microchip: microchip.trim() || undefined,
      neutered,
      photoUri,
    };
    if (existing) {
      // Rođendan se možda promenio — otkaži staru notifikaciju pa zakaži novu.
      await cancelScheduled(existing.birthdayNotifId);
      const birthdayNotifId = (await scheduleBirthday(data)) ?? undefined;
      updatePet(existing.id, { ...data, birthdayNotifId });
    } else {
      const pet = addPet(data);
      const birthdayNotifId = (await scheduleBirthday(data)) ?? undefined;
      if (birthdayNotifId) updatePet(pet.id, { birthdayNotifId });
    }
    router.back();
  };

  return (
    <ModalScreen>
      <Pressable onPress={choosePhoto} style={{ alignSelf: 'center', marginTop: 4 }}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: 96, height: 96, borderRadius: 48 }} />
        ) : (
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: t.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ fontSize: 34 }}>🐾</Text>
          </View>
        )}
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.accentDeep, textAlign: 'center', marginTop: 8 }}>
          {photoUri ? 'Promeni fotografiju' : 'Dodaj fotografiju'}
        </Text>
      </Pressable>

      <Field label="Ime *" value={name} onChangeText={setName} placeholder="npr. Luna" />

      <Text style={{ fontSize: 13, fontWeight: '600', color: t.muted, marginTop: 14 }}>Vrsta</Text>
      <Segmented
        value={species}
        onChange={(k) => setSpecies(k as Species)}
        options={[
          { key: 'pas', label: 'Pas' },
          { key: 'macka', label: 'Mačka' },
          { key: 'drugo', label: 'Drugo' },
        ]}
      />

      <Field label="Rasa" value={breed} onChangeText={setBreed} placeholder="npr. Zlatni retriver" />

      <Text style={{ fontSize: 13, fontWeight: '600', color: t.muted, marginTop: 14 }}>
        Pol (menja temu aplikacije)
      </Text>
      <Segmented
        value={sex}
        onChange={(k) => setSex(k as Sex)}
        options={[
          { key: 'f', label: 'Ženka 🎀' },
          { key: 'm', label: 'Mužjak 🌿' },
        ]}
      />

      <DateField label="Datum rođenja" value={dob} onChange={setDob} />

      <Field
        label="Broj mikročipa"
        value={microchip}
        onChangeText={setMicrochip}
        keyboardType="number-pad"
        placeholder="15 cifara"
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>Sterilisan/a</Text>
        <Switch value={neutered} onValueChange={setNeutered} trackColor={{ true: t.accent }} />
      </View>

      <Btn label={existing ? 'Sačuvaj izmene' : 'Dodaj ljubimca'} onPress={save} />
    </ModalScreen>
  );
}
