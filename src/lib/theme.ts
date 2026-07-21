import type { Sex } from './types';

/** Braon iz logotipa „Moj Ljubimac" — koristi se za brend elemente nezavisno od teme. */
export const BRAND = '#5C3A21';

export interface Theme {
  sex: Sex;
  accent: string;
  accentDeep: string;
  accentSoft: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  chip: string;
  danger: string;
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  gold: string;
  goldSoft: string;
}

const base = {
  surface: '#FFFFFF',
  danger: '#C0392B',
  ok: '#2E6B39',
  okSoft: '#E2F2E4',
  warn: '#8A5A16',
  warnSoft: '#FBEEDC',
  gold: '#7A6A2E',
  goldSoft: '#F0EBDC',
};

/** Tema za ženku — topla roze. */
const female: Theme = {
  sex: 'f',
  accent: '#C24A63',
  accentDeep: '#9E3A50',
  accentSoft: '#F7E3E7',
  bg: '#FBF5F4',
  text: '#2B1E22',
  muted: '#8A6E75',
  line: '#EFDDE0',
  chip: '#F3E7E9',
  ...base,
};

/** Tema za mužjaka — duboka zelena. */
const male: Theme = {
  sex: 'm',
  accent: '#1F7A6B',
  accentDeep: '#155E52',
  accentSoft: '#DDF0EB',
  bg: '#F3F8F6',
  text: '#182420',
  muted: '#66807A',
  line: '#DCEAE5',
  chip: '#E6F1ED',
  ...base,
};

export const THEMES: Record<Sex, Theme> = { f: female, m: male };

export const SPACING = 8;
export const RADIUS = 16;
