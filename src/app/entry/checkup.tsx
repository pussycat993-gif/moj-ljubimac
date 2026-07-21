import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Field, ModalScreen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { toISODate } from '@/lib/dates';
import { newId } from '@/lib/id';
import { pickImage, pickPdf } from '@/lib/media';
import { useActivePet, useApp } from '@/lib/store';
import type { Attachment } from '@/lib/types';

/** Besplatan paket: do 3 priloga po pregledu; Premium: bez limita. */
const FREE_ATTACHMENT_LIMIT = 3;

export default function CheckupEntry() {
  const t = useTheme();
  const router = useRouter();
  const pet = useActivePet();
  const premium = useApp((s) => s.premium);
  const addCheckup = useApp((s) => s.addCheckup);

  const [title, setTitle] = useState('');
  const [vet, setVet] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date());
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const guardLimit = (): boolean => {
    if (!premium && attachments.length >= FREE_ATTACHMENT_LIMIT) {
      Alert.alert('Premium', `Besplatni paket ima do ${FREE_ATTACHMENT_LIMIT} priloga po pregledu.`, [
        { text: 'U redu', style: 'cancel' },
        { text: 'Pogledaj Premium', onPress: () => router.push('/paywall') },
      ]);
      return false;
    }
    return true;
  };

  const addPhoto = async () => {
    if (!guardLimit()) return;
    const uri = await pickImage(false);
    if (uri) {
      setAttachments((a) => [...a, { id: newId(), uri, name: `foto-${a.length + 1}.jpg`, kind: 'image' }]);
    }
  };

  const addPdf = async () => {
    if (!guardLimit()) return;
    const doc = await pickPdf();
    if (doc) {
      setAttachments((a) => [...a, { id: newId(), uri: doc.uri, name: doc.name, kind: 'pdf' }]);
    }
  };

  const save = () => {
    if (!pet || !title.trim()) {
      Alert.alert('Naslov je obavezan', 'Unesi naziv pregleda, npr. Godišnji sistematski.');
      return;
    }
    addCheckup({
      petId: pet.id,
      title: title.trim(),
      dateISO: toISODate(date),
      vet: vet.trim() || undefined,
      notes: notes.trim() || undefined,
      attachments,
    });
    router.back();
  };

  return (
    <ModalScreen>
      <Field label="Naziv pregleda *" value={title} onChangeText={setTitle} placeholder="npr. Godišnji sistematski" autoFocus />
      <DateField label="Datum" value={date} onChange={setDate} />
      <Field label="Veterinar / klinika" value={vet} onChangeText={setVet} placeholder="npr. dr Jovana Perić" />
      <Field label="Napomene" value={notes} onChangeText={setNotes} placeholder="nalaz, preporuke…" multiline />

      {attachments.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {attachments.map((a) => (
            <Pressable
              key={a.id}
              onLongPress={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
              style={{
                backgroundColor: t.accentSoft,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.accentDeep }}>
                {a.kind === 'pdf' ? '📄' : '🖼️'} {a.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={{ fontSize: 12, color: t.muted, marginTop: 8 }}>
        Dugi pritisak na prilog ga uklanja.
      </Text>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn label="Dodaj foto" kind="ghost" icon="image" style={{ flex: 1 }} onPress={addPhoto} />
        <Btn label="Dodaj PDF" kind="ghost" icon="document" style={{ flex: 1 }} onPress={addPdf} />
      </View>
      <Btn label="Sačuvaj pregled" onPress={save} />
    </ModalScreen>
  );
}
