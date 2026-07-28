import 'tek-ms-ds/dist/style.css';
import { Stats } from './stats';
import type { SellerActivityPoint, SellerDetail, StatsPeriod, TrendBucket } from './stats';

/** Fabrique un point d'activité de démo — approxime un pic horaire unique par jour. */
function activityPoint(
  label: string,
  ca: number,
  benefice: number,
  salesCount: number,
  peakHour?: number
): SellerActivityPoint {
  const active = salesCount > 0;
  return {
    label,
    ca,
    benefice,
    salesCount,
    active,
    firstSaleTime: active && peakHour !== undefined ? `${String(peakHour).padStart(2, '0')}:00` : null,
    lastSaleTime: active && peakHour !== undefined ? `${String(peakHour + 1).padStart(2, '0')}:00` : null,
    hourlyPattern: active && peakHour !== undefined ? [{ hour: peakHour, salesCount, ca }] : [],
  };
}

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

/** Ajoute un drill-down horaire de démo à un bucket — deux pics horaires plausibles. */
function withHourly(bucket: TrendBucket, morningHour: number, afternoonHour: number): TrendBucket {
  const morningCa = Math.round(bucket.ca * 0.55);
  const afternoonCa = bucket.ca - morningCa;
  return {
    ...bucket,
    firstSaleTime: `${String(morningHour).padStart(2, '0')}:00`,
    lastSaleTime: `${String(afternoonHour).padStart(2, '0')}:30`,
    hourlyPattern: [
      { hour: morningHour, salesCount: 3, ca: morningCa },
      { hour: afternoonHour, salesCount: 2, ca: afternoonCa },
    ],
  };
}

const sevenJoursTrend = buildTrend(
  ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7'],
  [14000, 17000, 15500, 19000, 21500, 23500, 26500]
).map((bucket, i) => withHourly(bucket, 9 + (i % 3), 15 + (i % 4)));

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
    trend: sevenJoursTrend,
    firstSaleTime: '08:30',
    lastSaleTime: '19:15',
    hourlyPattern: [
      { hour: 9, salesCount: 12, ca: 42000 },
      { hour: 13, salesCount: 18, ca: 63000 },
      { hour: 19, salesCount: 9, ca: 31500 },
    ],
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

const sellerDetails: Record<string, SellerDetail> = {
  v1: {
    email: 'v1',
    alert: { level: 'critical', message: 'Aucune vente depuis 3 jours' },
    firstSaleTime: '09:10',
    lastSaleTime: '17:45',
    lastActiveDayLabel: '24/07',
    defaultPeriodKey: '7j',
    periods: [
      {
        key: '7j',
        label: '7 jours',
        totalCa: 45000,
        totalBenefice: 13500,
        averageBasket: 4500,
        transactionsCount: 10,
        itemsSoldCount: 16,
        activeBucketsCount: 3,
        totalBucketsCount: 7,
        activity: [
          activityPoint('Lun', 12000, 3600, 3, 9),
          activityPoint('Mar', 18000, 5400, 4, 12),
          activityPoint('Mer', 15000, 4500, 3, 17),
          activityPoint('Jeu', 0, 0, 0),
          activityPoint('Ven', 0, 0, 0),
          activityPoint('Sam', 0, 0, 0),
          activityPoint('Dim', 0, 0, 0),
        ],
        hourlyPattern: [
          { hour: 9, salesCount: 2, ca: 9000 },
          { hour: 12, salesCount: 4, ca: 18000 },
          { hour: 17, salesCount: 4, ca: 18000 },
        ],
        topItems: [
          { name: 'Sac de riz 25kg', quantity: 6, ca: 24000 },
          { name: "Bidon d'huile 5L", quantity: 10, ca: 21000 },
        ],
      },
    ],
  },
  v2: {
    email: 'v2',
    alert: null,
    firstSaleTime: '08:05',
    lastSaleTime: '19:20',
    lastActiveDayLabel: "Aujourd'hui",
    defaultPeriodKey: '7j',
    periods: [
      {
        key: '7j',
        label: '7 jours',
        totalCa: 62000,
        totalBenefice: 18600,
        averageBasket: 5166,
        transactionsCount: 12,
        itemsSoldCount: 22,
        activeBucketsCount: 6,
        totalBucketsCount: 7,
        activity: [
          activityPoint('Lun', 8000, 2400, 2, 8),
          activityPoint('Mar', 9500, 2850, 2, 13),
          activityPoint('Mer', 11000, 3300, 2, 13),
          activityPoint('Jeu', 10500, 3150, 2, 19),
          activityPoint('Ven', 0, 0, 0),
          activityPoint('Sam', 12000, 3600, 2, 8),
          activityPoint('Dim', 11000, 3300, 2, 13),
        ],
        hourlyPattern: [
          { hour: 8, salesCount: 2, ca: 10300 },
          { hour: 13, salesCount: 6, ca: 30900 },
          { hour: 19, salesCount: 4, ca: 20600 },
        ],
        topItems: [
          { name: "Bidon d'huile 5L", quantity: 12, ca: 25200 },
          { name: 'Sac de riz 25kg', quantity: 8, ca: 32000 },
        ],
      },
    ],
  },
  v3: {
    email: 'v3',
    alert: { level: 'warning', message: 'Cadence en baisse de 24% vs la semaine dernière' },
    firstSaleTime: '10:00',
    lastSaleTime: '16:30',
    lastActiveDayLabel: "Aujourd'hui",
    defaultPeriodKey: '7j',
    periods: [
      {
        key: '7j',
        label: '7 jours',
        totalCa: 30000,
        totalBenefice: 9000,
        averageBasket: 5000,
        transactionsCount: 6,
        itemsSoldCount: 9,
        activeBucketsCount: 4,
        totalBucketsCount: 7,
        activity: [
          activityPoint('Lun', 7500, 2250, 2, 10),
          activityPoint('Mar', 0, 0, 0),
          activityPoint('Mer', 6000, 1800, 1, 16),
          activityPoint('Jeu', 0, 0, 0),
          activityPoint('Ven', 8500, 2550, 2, 10),
          activityPoint('Sam', 0, 0, 0),
          activityPoint('Dim', 8000, 2400, 1, 16),
        ],
        hourlyPattern: [
          { hour: 10, salesCount: 3, ca: 15000 },
          { hour: 16, salesCount: 3, ca: 15000 },
        ],
        topItems: [{ name: 'Vitamines C 1000', quantity: 9, ca: 30000 }],
      },
    ],
  },
};

const stats = new Stats(app);

stats.render({
  sellers,
  periods,
  defaultPeriodKey: '7j',
  defaultMetric: 'ca',
  onSellerSelect: (sellerId) => {
    const detail = sellerDetails[sellerId];
    if (detail) stats.showSellerDetail(detail);
  },
});
