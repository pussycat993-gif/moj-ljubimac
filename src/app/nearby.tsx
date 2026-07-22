import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';

import { Btn, Card, Row, Screen, SectionTitle, Sub } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentLocation, openMapsSearch, type LocationOutcome, type LocationResult } from '@/lib/geo';

type Status = 'loading' | 'ready' | 'denied' | 'error';

export default function NearbyScreen() {
  const t = useTheme();
  const [status, setStatus] = useState<Status>('loading');
  const [loc, setLoc] = useState<LocationResult | null>(null);

  const applyOutcome = useCallback((res: LocationOutcome) => {
    if (res.ok) {
      setLoc(res.data);
      setStatus('ready');
    } else {
      setLoc(null);
      setStatus(res.reason === 'denied' ? 'denied' : 'error');
    }
  }, []);

  // Dugme „Pokušaj ponovo": vrati spinner pa ponovo čitaj lokaciju.
  const retry = useCallback(() => {
    setStatus('loading');
    getCurrentLocation().then(applyOutcome);
  }, [applyOutcome]);

  // Učitavanje pri otvaranju ekrana; setState je u .then callback-u (nije sinhron u efektu).
  useEffect(() => {
    let ignore = false;
    getCurrentLocation().then((res) => {
      if (!ignore) applyOutcome(res);
    });
    return () => {
      ignore = true;
    };
  }, [applyOutcome]);

  return (
    <Screen>
      <Text style={{ fontSize: 22, fontWeight: '700', color: t.text }}>U blizini</Text>
      <Sub>Pronađi veterinare i pet shopove oko svoje trenutne lokacije.</Sub>

      {status === 'loading' && (
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <ActivityIndicator color={t.accent} />
          <Text style={{ fontSize: 13, color: t.muted, marginTop: 12 }}>Tražim lokaciju…</Text>
        </Card>
      )}

      {status === 'denied' && (
        <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
          <Ionicons name="location-outline" size={34} color={t.muted} />
          <Text style={{ fontWeight: '700', fontSize: 15, color: t.text, marginTop: 10, textAlign: 'center' }}>
            Pristup lokaciji je odbijen
          </Text>
          <Text style={{ fontSize: 13, color: t.muted, marginTop: 4, textAlign: 'center' }}>
            Uključi lokaciju u podešavanjima da bismo prikazali mesta u tvojoj blizini.
          </Text>
          <Btn label="Otvori podešavanja" icon="settings-outline" onPress={() => Linking.openSettings()} />
          <Btn label="Pokušaj ponovo" kind="ghost" icon="refresh" onPress={retry} />
        </Card>
      )}

      {status === 'error' && (
        <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
          <Ionicons name="warning-outline" size={34} color={t.muted} />
          <Text style={{ fontWeight: '700', fontSize: 15, color: t.text, marginTop: 10, textAlign: 'center' }}>
            Ne mogu da odredim lokaciju
          </Text>
          <Text style={{ fontSize: 13, color: t.muted, marginTop: 4, textAlign: 'center' }}>
            Proveri da li je GPS uključen pa pokušaj ponovo.
          </Text>
          <Btn label="Pokušaj ponovo" icon="refresh" onPress={retry} />
        </Card>
      )}

      {status === 'ready' && (
        <>
          <Card>
            <Row
              icon="navigate"
              title={loc?.city ? `Tvoja lokacija: ${loc.city}` : 'Lokacija pronađena'}
              desc="Rezultati se otvaraju u aplikaciji za mape."
            />
          </Card>

          <SectionTitle>Pretraga</SectionTitle>
          <Btn
            label="Veterinari u blizini"
            icon="medkit"
            onPress={() => openMapsSearch('veterinar', loc?.coords)}
          />
          <Btn
            label="Pet shopovi u blizini"
            kind="ghost"
            icon="storefront"
            onPress={() => openMapsSearch('pet shop', loc?.coords)}
          />

          <View style={{ height: 8 }} />
          <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 12 }}>
            Uskoro: partnerske klinike i pet shopovi sa radnim vremenom i popustima za korisnike aplikacije.
          </Text>
        </>
      )}
    </Screen>
  );
}
