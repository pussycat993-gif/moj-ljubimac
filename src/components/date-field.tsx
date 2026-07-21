import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDateTime } from '@/lib/dates';

/**
 * Polje za izbor datuma (i opciono vremena).
 * Android prikazuje picker kao dijalog, iOS inline — obe varijante su pokrivene.
 */
export function DateField({
  label,
  value,
  onChange,
  withTime = false,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  withTime?: boolean;
}) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');

  const handle = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (event.type === 'dismissed' || !selected) return;
    const next = new Date(value);
    if (mode === 'date') {
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    onChange(next);
    if (Platform.OS === 'android' && withTime && mode === 'date') {
      setMode('time');
      setShow(true);
    }
  };

  const open = () => {
    setMode('date');
    setShow(true);
  };

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: t.muted, marginBottom: 6 }}>{label}</Text>
      <Pressable
        onPress={open}
        style={{
          backgroundColor: t.surface,
          borderColor: t.line,
          borderWidth: 1.5,
          borderRadius: 12,
          paddingHorizontal: 14,
          minHeight: 48,
          justifyContent: 'center',
        }}>
        <Text style={{ fontSize: 15, color: t.text }}>
          {withTime ? formatDateTime(value.toISOString()) : formatDate(value.toISOString())}
        </Text>
      </Pressable>

      {show && (
        <DateTimePicker
          value={value}
          mode={Platform.OS === 'ios' ? (withTime ? 'datetime' : 'date') : mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handle}
        />
      )}
      {Platform.OS === 'ios' && show && (
        <Pressable onPress={() => setShow(false)} style={{ alignSelf: 'flex-end', padding: 8 }}>
          <Text style={{ color: t.accentDeep, fontWeight: '700' }}>Gotovo</Text>
        </Pressable>
      )}
    </View>
  );
}
