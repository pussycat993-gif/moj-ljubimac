import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { RADIUS } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Skrol-omotač ekrana sa pozadinom teme i prostorom za tab bar. */
export function Screen({ children }: PropsWithChildren) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Omotač za modalne forme. */
export function ModalScreen({ children }: PropsWithChildren) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function H1({ children }: PropsWithChildren) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 26, fontWeight: '700', color: t.text, lineHeight: 32 }}>
      {children}
    </Text>
  );
}

export function Sub({ children }: PropsWithChildren) {
  const t = useTheme();
  return <Text style={{ fontSize: 14, color: t.muted, marginTop: 4 }}>{children}</Text>;
}

export function SectionTitle({ children }: PropsWithChildren) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 19, fontWeight: '700', color: t.text, marginTop: 22, marginBottom: 4 }}>
      {children}
    </Text>
  );
}

export function Card({
  children,
  onPress,
  style,
}: PropsWithChildren<{ onPress?: () => void; style?: StyleProp<ViewStyle> }>) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: RADIUS,
    padding: 16,
    marginTop: 12,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

/** Red sa ikonicom, naslovom, opisom i opcionim sadržajem desno. */
export function Row({
  icon,
  title,
  desc,
  right,
  onPress,
}: {
  icon: IconName;
  title: string;
  desc?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: t.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name={icon} size={20} color={t.accentDeep} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: '600', fontSize: 15, color: t.text }}>{title}</Text>
        {desc ? <Text style={{ fontSize: 13, color: t.muted, marginTop: 2 }}>{desc}</Text> : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {content}
    </Pressable>
  );
}

export function Tag({
  children,
  tone = 'accent',
}: PropsWithChildren<{ tone?: 'accent' | 'ok' | 'warn' | 'gold' }>) {
  const t = useTheme();
  const map = {
    accent: { bg: t.accentSoft, fg: t.accentDeep },
    ok: { bg: t.okSoft, fg: t.ok },
    warn: { bg: t.warnSoft, fg: t.warn },
    gold: { bg: t.goldSoft, fg: t.gold },
  }[tone];
  return (
    <View style={{ backgroundColor: map.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: map.fg }}>{children}</Text>
    </View>
  );
}

export function Btn({
  label,
  onPress,
  kind = 'primary',
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : t.surface;
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? t.danger : t.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          borderRadius: 14,
          backgroundColor: bg,
          borderWidth: kind === 'primary' ? 0 : 1.5,
          borderColor: kind === 'danger' ? t.danger : t.line,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          marginTop: 14,
        },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ fontSize: 15, fontWeight: '700', color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.chip, borderRadius: 12, padding: 4, marginTop: 14 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? t.surface : 'transparent',
            }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: on ? t.text : t.muted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: t.muted, marginBottom: 6 }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={{
          backgroundColor: t.surface,
          borderColor: t.line,
          borderWidth: 1.5,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 15,
          color: t.text,
          minHeight: 48,
        }}
      />
    </View>
  );
}

export function EmptyState({ icon, title, desc }: { icon: IconName; title: string; desc: string }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <Ionicons name={icon} size={34} color={t.muted} />
      <Text style={{ fontWeight: '700', fontSize: 15, color: t.text, marginTop: 10 }}>{title}</Text>
      <Text style={{ fontSize: 13, color: t.muted, marginTop: 4, textAlign: 'center' }}>{desc}</Text>
    </Card>
  );
}
