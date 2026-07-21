import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Card, EmptyState, H1, Row, Screen, Segmented, Sub, Tag } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { daysUntil, formatDateShort, relativeDays } from '@/lib/dates';
import {
  useActivePet,
  useApp,
  usePetCheckups,
  usePetMedications,
  usePetVaccinations,
} from '@/lib/store';
import type { Medication } from '@/lib/types';

type Pane = 'vax' | 'med' | 'chk';

export default function HealthScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pane, setPane] = useState<Pane>('vax');
  const pet = useActivePet();
  const vaccinations = usePetVaccinations(pet?.id);
  const medications = usePetMedications(pet?.id);
  const checkups = usePetCheckups(pet?.id);
  const deleteVaccination = useApp((s) => s.deleteVaccination);
  const deleteMedication = useApp((s) => s.deleteMedication);
  const deleteCheckup = useApp((s) => s.deleteCheckup);
  const updateMedication = useApp((s) => s.updateMedication);

  const confirmDelete = (what: string, run: () => void) =>
    Alert.alert('Obriši?', `„${what}" će biti trajno obrisano.`, [
      { text: 'Otkaži', style: 'cancel' },
      { text: 'Obriši', style: 'destructive', onPress: run },
    ]);

  const nextDose = (m: Medication): string | null => {
    if (!m.intervalDays || !m.lastGivenISO) return null;
    const d = new Date(m.lastGivenISO);
    d.setDate(d.getDate() + m.intervalDays);
    return d.toISOString();
  };

  return (
    <Screen>
      <View style={{ height: insets.top }} />
      <H1>Zdravstveni karton</H1>
      <Sub>Sve na jednom mestu — spremno za veterinara</Sub>

      <Segmented
        value={pane}
        onChange={(k) => setPane(k as Pane)}
        options={[
          { key: 'vax', label: 'Vakcine' },
          { key: 'med', label: 'Lekovi' },
          { key: 'chk', label: 'Pregledi' },
        ]}
      />

      {pane === 'vax' && (
        <>
          {vaccinations.length === 0 ? (
            <EmptyState icon="medkit" title="Nema vakcina" desc="Dodaj prvu vakcinaciju sa datumom i rokom važenja." />
          ) : (
            vaccinations.map((v) => {
              const expiring = v.validUntilISO ? daysUntil(v.validUntilISO) : null;
              return (
                <Card key={v.id} onPress={() => confirmDelete(v.name, () => deleteVaccination(v.id))}>
                  <Row
                    icon="shield-checkmark"
                    title={v.name}
                    desc={`Primljena ${formatDateShort(v.dateISO)}${
                      v.validUntilISO ? ` · važi do ${formatDateShort(v.validUntilISO)}` : ''
                    }${v.clinic ? ` · ${v.clinic}` : ''}`}
                    right={
                      expiring === null ? undefined : expiring <= 30 ? (
                        <Tag tone="warn">{expiring <= 0 ? 'istekla' : relativeDays(v.validUntilISO!)}</Tag>
                      ) : (
                        <Tag tone="ok">važeća</Tag>
                      )
                    }
                  />
                </Card>
              );
            })
          )}
          <Btn label="Dodaj vakcinu" icon="add" onPress={() => router.push('/entry/vaccination')} />
        </>
      )}

      {pane === 'med' && (
        <>
          {medications.length === 0 ? (
            <EmptyState icon="bandage" title="Nema terapija" desc="Dodaj lek sa dozom i intervalom ponavljanja." />
          ) : (
            medications.map((m) => {
              const next = nextDose(m);
              return (
                <Card key={m.id}>
                  <Row
                    icon="bandage"
                    title={m.name}
                    desc={[
                      m.dose,
                      m.intervalDays ? `na ${m.intervalDays} dana` : null,
                      next && m.active ? `sledeća doza ${formatDateShort(next)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    right={<Tag tone={m.active ? 'accent' : 'ok'}>{m.active ? 'aktivno' : 'završeno'}</Tag>}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Btn
                      label={m.active ? 'Označi kao završeno' : 'Ponovo aktiviraj'}
                      kind="ghost"
                      style={{ flex: 1 }}
                      onPress={() => updateMedication(m.id, { active: !m.active })}
                    />
                    <Btn
                      label="Obriši"
                      kind="danger"
                      style={{ flex: 1 }}
                      onPress={() => confirmDelete(m.name, () => deleteMedication(m.id))}
                    />
                  </View>
                </Card>
              );
            })
          )}
          <Btn label="Dodaj terapiju" icon="add" onPress={() => router.push('/entry/medication')} />
        </>
      )}

      {pane === 'chk' && (
        <>
          {checkups.length === 0 ? (
            <EmptyState icon="document-text" title="Nema pregleda" desc="Dodaj pregled i priloži PDF nalaz ili fotografiju." />
          ) : (
            checkups.map((c) => (
              <Card key={c.id} onPress={() => confirmDelete(c.title, () => deleteCheckup(c.id))}>
                <Row
                  icon="document-text"
                  title={c.title}
                  desc={[formatDateShort(c.dateISO), c.vet, c.notes].filter(Boolean).join(' · ')}
                />
                {c.attachments.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {c.attachments.map((a) => (
                      <Pressable
                        key={a.id}
                        onPress={async () => {
                          if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(a.uri);
                        }}
                        style={{
                          flexDirection: 'row',
                          gap: 6,
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
              </Card>
            ))
          )}
          <Btn label="Dodaj pregled" icon="add" onPress={() => router.push('/entry/checkup')} />
        </>
      )}
    </Screen>
  );
}
