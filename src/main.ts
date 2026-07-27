import 'tek-ms-ds/dist/style.css';
import { Stats } from './stats';
import type { StatsPeriod, TrendBucket } from './stats';

const app = document.querySelector<HTMLDivElement>('#app')!;

function withBenefice(trend: number[]): TrendBucket['benefice'][] {
  return trend.map((v) => Math.round((v * 0.29) / 500) * 500);
}

function genMonths(n: number, base: number, growth: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const seasonal = 1 + 0.12 * Math.sin(i / 2.3);
    out.push(Math.round((base * Math.pow(growth, i) * seasonal) / 1000) * 1000);
  }
  return out;
}

function buildTrend(labels: string[], ca: number[], keys?: string[]): TrendBucket[] {
  const benefice = withBenefice(ca);
  return labels.map((label, i) => ({
    key: keys?.[i] ?? label,
    label,
    ca: ca[i],
    benefice: benefice[i],
  }));
}

const sellers = [
  { id: 'v1', name: 'Awa Diop', zone: 'Dakar', phone: '77 000 00 00' },
  { id: 'v2', name: 'Moussa Ba', zone: 'Thiès', phone: '76 111 11 11' },
  { id: 'v3', name: 'Fatou Sarr', zone: 'Saint-Louis', phone: '78 222 22 22' },
];

const periods: StatsPeriod[] = [
  {
    key: '7j',
    label: '7 jours',
    delta: { pct: 12, positive: true, label: 'vs 7 jours précédents' },
    metrics: {
      v1: { ca: 45000, benefice: 13500 },
      v2: { ca: 62000, benefice: 18600 },
      v3: { ca: 30000, benefice: 9000 },
    },
    trend: buildTrend(
      ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7'],
      [14000, 17000, 15500, 19000, 21500, 23500, 26500]
    ),
  },
  {
    key: '4sem',
    label: '4 semaines',
    delta: { pct: 6, positive: true, label: 'vs 4 semaines précédentes' },
    metrics: {
      v1: { ca: 210000, benefice: 61000 },
      v2: { ca: 340000, benefice: 98600 },
      v3: { ca: 150000, benefice: 41000 },
    },
    trend: buildTrend(['S1', 'S2', 'S3', 'S4'], [150000, 165000, 180000, 205000]),
  },
  {
    key: '6mois',
    label: '6 mois',
    delta: { pct: 3, positive: false, label: 'vs 6 mois précédents' },
    metrics: {
      v1: { ca: 1450000, benefice: 402000 },
      v2: { ca: 1380000, benefice: 385000 },
      v3: { ca: 980000, benefice: 260000 },
    },
    trend: buildTrend(
      ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'],
      [520000, 580000, 610000, 640000, 690000, 770000]
    ),
  },
  {
    key: '2ans',
    label: '2 ans',
    delta: { pct: 21, positive: true, label: 'vs 2 ans précédents' },
    metrics: {
      v1: { ca: 9800000, benefice: 2650000 },
      v2: { ca: 12500000, benefice: 3400000 },
      v3: { ca: 7000000, benefice: 1850000 },
    },
    trend: buildTrend(
      Array.from({ length: 24 }, (_, i) =>
        i % 6 === 0 || i === 23 ? `M${i + 1}` : ''
      ),
      genMonths(24, 950000, 1.035),
      Array.from({ length: 24 }, (_, i) => `m${i + 1}`)
    ),
  },
];

const stats = new Stats(app);

stats.render({ sellers, periods, defaultPeriodKey: '7j', defaultMetric: 'ca' });
