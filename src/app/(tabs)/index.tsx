import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PetSwitcher } from '@/components/pet-switcher';
import { Sparkline } from '@/components/sparkline';
import { Btn, Card, EmptyState, H1, Row, Screen, SectionTitle, Sub, Tag } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ageString, daysUntil, daysUntilBirthday, formatDateShort, relativeDays } from '@/lib/dates';
import {
  useActivePet,
  useApp,
  usePetMedications,
  usePetReminders,
  usePetVaccinations,
  usePetWeights,
} from '@/lib/store';
import { SPECIES_LABEL } from '@/lib/types';

const logo = require('../../../assets/images/logo.png');

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const pet = useActivePet();
  const weights = usePetWeights(pet?.id);
  const vaccinations = usePetVaccinations(pet?.id);
  const medications = usePetMedications(pet?.id);
  const reminders = usePetReminders(pet?.id);
  const completeReminder = useApp((s) => s.completeReminder);

  const lastWeight = weights[weights.length - 1];
  const prevWeight = weights[weights.length - 2];
  const delta = lastWeight && prevWeight ? lastWeight.kg - prevWeight.kg : 0;

  const expiringVax = vaccinations.filter(
    (v) => v.validUntilISO && daysUntil(v.validUntilISO) <= 30
  ).length;
  const activeMeds = medications.filter((m) => m.active).length;

  return (
    <Screen>
      <View style={{ height: insets.top }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Image source={logo} style={{ width: 34, height: 35 }} contentFit="contain" />
        <Text style={{ fontSize: 17, fontWeight: '800', color: '#5C3A21', letterSpacing: 0.3 }}>
          MOJ LJUBIMAC
        </Text>
      </View>

      <PetSwitcher />

      {!pet ? (
        <>
          <View style={{ height: 16 }} />
          <EmptyState
            icon="paw"
            title="Dodaj prvog ljubimca"
            desc="Unesi ime, rasu, pol i datum rođenja da počnemo."
          />
          <Btn label="Dodaj ljubimca" onPress={() => router.push('/pet-form')} />
        </>
      ) : (
        <>
          <View style={{ marginTop: 18 }}>
            <H1>
              Zdravo, {pet.name}! {pet.sex === 'f' ? '🎀' : '🦴'}
            </H1>
            <Sub>
              {pet.breed || SPECIES_LABEL[pet.species]} · {pet.sex === 'f' ? 'ženka' : 'mužjak'} ·{' '}
              {ageString(pet.dob)}
            </Sub>
          </View>

          <Card>
            <Row
              icon="scale"
              title="Težina"
              desc={
                lastWeight
                  ? `${lastWeight.kg.toFixed(1).replace('.', ',')} kg · ${
                      delta === 0
                        ? 'bez promene'
                        : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1).replace('.', ',')} kg`
                    }`
                  : 'Još nema merenja'
              }
              right={
                lastWeight ? (
                  <Tag tone={Math.abs(delta) < 0.6 ? 'ok' : 'warn'}>
                    {Math.abs(delta) < 0.6 ? 'stabilno' : 'promena'}
                  </Tag>
                ) : undefined
              }
            />
            <Sparkline values={weights.map((w) => w.kg)} />
            <Btn label="Dodaj merenje" kind="ghost" icon="add" onPress={() => router.push('/entry/weight')} />
          </Card>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Kpi value={`${expiringVax}`} label="vakcine uskoro" />
            <Kpi value={`${activeMeds}`} label={activeMeds === 1 ? 'aktivna terapija' : 'aktivne terapije'} />
            <Kpi value={`${daysUntilBirthday(pet.dob)}`} label="dana do 🎂" />
          </View>

          <SectionTitle>Podsetnici</SectionTitle>
          {reminders.length === 0 ? (
            <EmptyState icon="notifications" title="Nema podsetnika" desc="Dodaj podsetnik za vakcinu, lek ili pregled." />
          ) : (
            reminders.map((r) => (
              <Card key={r.id}>
                <Row
                  icon="notifications"
                  title={r.title}
                  desc={formatDateShort(r.dateISO)}
                  right={<Tag tone={daysUntil(r.dateISO) <= 3 ? 'warn' : 'accent'}>{relativeDays(r.dateISO)}</Tag>}
                  onPress={() => completeReminder(r.id)}
                />
              </Card>
            ))
          )}
          <Btn label="Novi podsetnik" kind="ghost" icon="add" onPress={() => router.push('/entry/reminder')} />

          <SectionTitle>U blizini</SectionTitle>
          <Card onPress={() => router.push('/nearby')}>
            <Row
              icon="location"
              title="Veterinari i pet shopovi blizu vas"
              desc="Pronađi mesta oko svoje trenutne lokacije."
              right={<Ionicons name="chevron-forward" size={20} color={theme.muted} />}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.surface,
        borderColor: t.line,
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
      }}>
      <Text style={{ fontSize: 21, fontWeight: '800', color: t.text }}>{value}</Text>
      <Text style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
