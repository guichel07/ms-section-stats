import type { StatsPeriod } from '../stats';

export function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ') + ' F';
}

export const DEFAULT_STATS_PERIODS: StatsPeriod[] = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
  { key: 'year', label: 'Année' },
];

export const SELLER_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

export const RANK_TIERS = ['gold', 'silver', 'bronze'];
