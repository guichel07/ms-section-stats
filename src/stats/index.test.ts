import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Stats } from './index';
import type { SellerDetail, StatsPeriod } from './index';

const sellers = [
  { id: 'v1', name: 'Awa Diop', zone: 'Dakar', phone: '77 000 00 00' },
  { id: 'v2', name: 'Moussa Ba', zone: 'Thiès', phone: '76 111 11 11' },
];

const periods: StatsPeriod[] = [
  {
    key: 'day',
    label: 'Jour',
    delta: { pct: 5, positive: true, label: 'vs hier' },
    metrics: {
      v1: { ca: 100, benefice: 30 },
      v2: { ca: 300, benefice: 60 },
    },
    trend: [
      { key: 'j1', label: 'J1', ca: 60, benefice: 15 },
      { key: 'j2', label: 'J2', ca: 340, benefice: 75 },
    ],
  },
  {
    key: 'month',
    label: 'Mois',
    metrics: {
      v1: { ca: 1000, benefice: 250 },
      v2: { ca: 500, benefice: 90 },
    },
    trend: [{ key: 'm1', label: 'M1', ca: 1500, benefice: 340 }],
  },
];

describe('Stats', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
  });

  it('renders the summary and ranks sellers by CA for the default period', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods });

    const cards = root.querySelectorAll('.client-card .cname');
    expect(cards[0].textContent).toBe('Moussa Ba');
    expect(cards[1].textContent).toBe('Awa Diop');

    expect(root.querySelector('#stat-top')?.textContent).toBe('Moussa Ba');
    expect(root.querySelector('#stat-total')?.textContent).toBe('400 F');
    expect(root.querySelector('#stat-benef-total')?.textContent).toBe('90 F');
  });

  it('switches period when a chip is clicked', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods, defaultPeriodKey: 'day' });

    const monthChip = root.querySelector<HTMLElement>('[data-period="month"]')!;
    monthChip.click();

    const cards = root.querySelectorAll('.client-card .cname');
    expect(cards[0].textContent).toBe('Awa Diop');
    expect(root.querySelector('#stat-top')?.textContent).toBe('Awa Diop');
    expect(root.querySelector('.chip.active')?.textContent).toBe('Mois');
    expect(root.querySelector('#stat-total')?.textContent).toBe('1 500 F');
  });

  it('switches the driving metric to bénéfice when the switch is clicked', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods });

    const benefBtn = root.querySelector<HTMLElement>(
      '.mss-metric-btn[data-metric="benefice"]'
    )!;
    benefBtn.click();

    // v1 (30 F) devient premier car v2 (60 F) < v1... non : v2 a 60 > 30, donc v2 reste premier.
    const cards = root.querySelectorAll('.client-card .cname');
    expect(cards[0].textContent).toBe('Moussa Ba');
    expect(root.querySelector('.ctotal')?.textContent).toBe('60 F');
  });

  it('focuses a trend bucket and recomputes per-seller figures proportionally', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods, defaultPeriodKey: 'day' });

    root.querySelector<HTMLElement>('.mss-trend-bar-wrap[data-idx="1"]')!.click();

    // bucket J2 = 340 F, réparti au prorata (v1: 100/400, v2: 300/400)
    expect(root.querySelector('#stat-total')?.textContent).toBe('340 F');
    expect(root.querySelector('.ctotal')?.textContent).toBe('255 F'); // v2: 340 * 300/400

    // re-cliquer la même barre (re-query : le re-render a remplacé le nœud) annule le focus
    root.querySelector<HTMLElement>('.mss-trend-bar-wrap[data-idx="1"]')!.click();
    expect(root.querySelector('#stat-total')?.textContent).toBe('400 F');
  });

  it('uses the exact bySeller breakdown when provided instead of estimating', () => {
    const withExact: StatsPeriod[] = [
      {
        key: 'day',
        label: 'Jour',
        metrics: {
          v1: { ca: 100, benefice: 30 },
          v2: { ca: 300, benefice: 60 },
        },
        trend: [
          {
            key: 'j1',
            label: 'J1',
            ca: 400,
            benefice: 90,
            bySeller: {
              v1: { ca: 40, benefice: 10 },
              v2: { ca: 360, benefice: 80 },
            },
          },
        ],
      },
    ];

    const stats = new Stats(root);
    stats.render({ sellers, periods: withExact });

    root.querySelector<HTMLElement>('.mss-trend-bar-wrap[data-idx="0"]')!.click();

    expect(root.querySelector('#stat-total')?.textContent).toBe('400 F');
    expect(root.querySelector('.ctotal')?.textContent).toBe('360 F');
  });

  it('shows the aggregate hourly affluence by default, then drills into a bucket on click', () => {
    const periodsWithHourly: StatsPeriod[] = [
      {
        key: 'day',
        label: 'Jour',
        metrics: { v1: { ca: 100, benefice: 30 }, v2: { ca: 300, benefice: 60 } },
        firstSaleTime: '08:00',
        lastSaleTime: '20:00',
        hourlyPattern: [{ hour: 14, salesCount: 5, ca: 400 }],
        trend: [
          {
            key: 'j1',
            label: 'J1',
            ca: 60,
            benefice: 15,
            firstSaleTime: '09:00',
            lastSaleTime: '09:00',
            hourlyPattern: [{ hour: 9, salesCount: 1, ca: 60 }],
          },
          {
            key: 'j2',
            label: 'J2',
            ca: 340,
            benefice: 75,
            firstSaleTime: '11:00',
            lastSaleTime: '18:00',
            hourlyPattern: [
              { hour: 11, salesCount: 2, ca: 140 },
              { hour: 18, salesCount: 2, ca: 200 },
            ],
          },
        ],
      },
    ];

    const stats = new Stats(root);
    stats.render({ sellers, periods: periodsWithHourly, defaultPeriodKey: 'day' });

    expect(root.querySelector('#global-hourly-title')?.textContent).toBe('Affluence — heure par heure');
    expect(root.querySelector('#global-hourly-chart')?.textContent).toContain('14h');
    // Vue agrégée : le shift-card montre déjà le premier/dernier vente du dernier jour actif.
    expect(root.querySelector('#global-shift-card')?.textContent).toContain('08:00');
    expect(root.querySelector('#global-shift-card')?.textContent).toContain('20:00');

    root.querySelector<HTMLElement>('.mss-trend-bar-wrap[data-idx="1"]')!.click();

    expect(root.querySelector('#global-hourly-title')?.textContent).toBe('Affluence — heure par heure — J2');
    expect(root.querySelectorAll('#global-hourly-chart .co-bar-wrap').length).toBe(2);
    expect(root.querySelector('#global-shift-card')?.textContent).toContain('11:00');
    expect(root.querySelector('#global-shift-card')?.textContent).toContain('18:00');

    // Reclique la même barre -> retour à l'agrégat.
    root.querySelector<HTMLElement>('.mss-trend-bar-wrap[data-idx="1"]')!.click();
    expect(root.querySelector('#global-hourly-title')?.textContent).toBe('Affluence — heure par heure');
  });

  it('hides the global shift-card when the period carries no first/last sale time', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods });

    expect((root.querySelector('#global-shift-wrap') as HTMLElement).style.display).toBe('none');
    expect(root.querySelector('#global-hourly-chart')?.textContent).toContain('Pas assez de données');
  });

  it('falls back to "—" when there are no sellers', () => {
    const stats = new Stats(root);
    stats.render({ sellers: [], periods });

    expect(root.querySelector('#stat-top')?.textContent).toBe('—');
    expect(root.querySelectorAll('.client-card').length).toBe(0);
  });

  it('fires onSellerSelect with the seller id when a card is clicked', () => {
    const onSellerSelect = vi.fn();
    const stats = new Stats(root);
    stats.render({ sellers, periods, onSellerSelect });

    root.querySelector<HTMLElement>('.client-card[data-seller-id="v1"]')!.click();

    expect(onSellerSelect).toHaveBeenCalledWith('v1');
  });

  function sampleDetail(overrides: Partial<SellerDetail> = {}): SellerDetail {
    return {
      email: 'v2',
      alert: null,
      firstSaleTime: '08:32',
      lastSaleTime: '19:47',
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
          itemsSoldCount: 10,
          activeBucketsCount: 4,
          totalBucketsCount: 7,
          activity: [
            {
              label: 'Lun',
              ca: 5000,
              benefice: 1500,
              salesCount: 1,
              active: true,
              firstSaleTime: '09:00',
              lastSaleTime: '09:00',
              hourlyPattern: [{ hour: 9, salesCount: 1, ca: 5000 }],
            },
            {
              label: 'Mar',
              ca: 0,
              benefice: 0,
              salesCount: 0,
              active: false,
              firstSaleTime: null,
              lastSaleTime: null,
              hourlyPattern: [],
            },
          ],
          hourlyPattern: [{ hour: 14, salesCount: 6, ca: 30000 }],
          topItems: [{ name: 'Crème hydratante', quantity: 4, ca: 20000 }],
        },
      ],
      ...overrides,
    };
  }

  it('drills into a bucket\'s own hours when its activity bar is clicked', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods });
    stats.showSellerDetail(sampleDetail());

    // Vue agrégée par défaut : le hourlyPattern de la période (14h).
    expect(root.querySelector('#ss-hourly-title')?.textContent).toBe('Affluence — heure par heure');
    expect(root.querySelector('#ss-hourly-chart')?.textContent).toContain('14h');

    root.querySelector<HTMLElement>('#ss-activity-chart [data-ss-activity-index="0"]')!.click();

    // Focus sur "Lun" : bascule sur les heures propres à ce bucket (9h) et son shift-card.
    expect(root.querySelector('#ss-hourly-title')?.textContent).toBe('Affluence — heure par heure — Lun');
    expect(root.querySelector('#ss-hourly-chart')?.textContent).toContain('9h');
    expect(root.querySelector('#seller-sidebar .ss-shift-card')?.textContent).toContain('09:00');

    // Recliquer la même barre revient à l'agrégat.
    root.querySelector<HTMLElement>('#ss-activity-chart [data-ss-activity-index="0"]')!.click();
    expect(root.querySelector('#ss-hourly-title')?.textContent).toBe('Affluence — heure par heure');
  });

  it('resets the activity drill-down when switching seller period', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods });
    stats.showSellerDetail(
      sampleDetail({
        periods: [
          ...sampleDetail().periods,
          {
            key: '4sem',
            label: '4 semaines',
            totalCa: 90000,
            totalBenefice: 27000,
            averageBasket: 5000,
            transactionsCount: 18,
            itemsSoldCount: 30,
            activeBucketsCount: 4,
            totalBucketsCount: 4,
            activity: [],
            hourlyPattern: [{ hour: 10, salesCount: 3, ca: 20000 }],
            topItems: [],
          },
        ],
      })
    );

    root.querySelector<HTMLElement>('#ss-activity-chart [data-ss-activity-index="0"]')!.click();
    expect(root.querySelector('#ss-hourly-title')?.textContent).toContain('Lun');

    root.querySelector<HTMLElement>('[data-ss-period="4sem"]')!.click();

    expect(root.querySelector('#ss-hourly-title')?.textContent).toBe('Affluence — heure par heure');
    expect(root.querySelector('#ss-hourly-chart')?.textContent).toContain('10h');
  });

  it('opens the seller side panel with rank, KPIs and top items', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods });

    stats.showSellerDetail(sampleDetail());

    const sidebar = root.querySelector('#seller-sidebar')!;
    expect(sidebar.querySelector('.cs-name')?.textContent).toBe('Moussa Ba');
    expect(sidebar.querySelector('.mss-rank')?.textContent).toBe('#1');
    expect(sidebar.querySelector('.cs-kpi-val')?.textContent).toBe('30 000 F');
    expect(sidebar.textContent).toContain('Crème hydratante');
    expect(root.querySelector('.client-card[data-seller-id="v2"]')?.classList.contains('active')).toBe(true);
  });

  it('shows the alert banner when the seller detail carries one', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods });

    stats.showSellerDetail(
      sampleDetail({ alert: { level: 'critical', message: 'Aucune vente depuis 3 jours' } })
    );

    const alert = root.querySelector('#seller-sidebar .cs-alert');
    expect(alert?.textContent).toContain('Aucune vente depuis 3 jours');
    expect(alert?.classList.contains('cs-alert-warning')).toBe(false);
  });

  it('switches the displayed period when a seller period chip is clicked', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods });

    stats.showSellerDetail(
      sampleDetail({
        defaultPeriodKey: '7j',
        periods: [
          ...sampleDetail().periods,
          {
            key: '4sem',
            label: '4 semaines',
            totalCa: 90000,
            totalBenefice: 27000,
            averageBasket: 5000,
            transactionsCount: 18,
            itemsSoldCount: 30,
            activeBucketsCount: 4,
            totalBucketsCount: 4,
            activity: [],
            hourlyPattern: [],
            topItems: [],
          },
        ],
      })
    );

    root.querySelector<HTMLElement>('[data-ss-period="4sem"]')!.click();

    const sidebar = root.querySelector('#seller-sidebar')!;
    expect(sidebar.querySelector('.cs-kpi-val')?.textContent).toBe('90 000 F');
  });

  it('closes the seller side panel and clears the active card', () => {
    const stats = new Stats(root);
    stats.render({ sellers, periods });
    stats.showSellerDetail(sampleDetail());

    root.querySelector<HTMLElement>('#ss-close-btn')!.click();

    expect(root.querySelector('#seller-sidebar')?.innerHTML).toBe('');
    expect(root.querySelector('.client-card.active')).toBeNull();
  });
});
