import { describe, expect, it, beforeEach } from 'vitest';
import { Stats } from './index';
import type { StatsPeriod } from './index';

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

  it('falls back to "—" when there are no sellers', () => {
    const stats = new Stats(root);
    stats.render({ sellers: [], periods });

    expect(root.querySelector('#stat-top')?.textContent).toBe('—');
    expect(root.querySelectorAll('.client-card').length).toBe(0);
  });
});
