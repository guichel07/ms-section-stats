import { describe, expect, it, beforeEach } from 'vitest';
import { Stats } from './index';

const sellers = [
  { name: 'Awa Diop', zone: 'Dakar', phone: '77 000 00 00', sales: { day: 100, month: 1000 } },
  { name: 'Moussa Ba', zone: 'Thiès', phone: '76 111 11 11', sales: { day: 300, month: 500 } },
];

describe('Stats', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
  });

  it('renders the summary and ranks sellers by the default period', () => {
    const stats = new Stats(root, { sellers });
    stats.render();

    const cards = root.querySelectorAll('.client-card .cname');
    expect(cards[0].textContent).toBe('Moussa Ba');
    expect(cards[1].textContent).toBe('Awa Diop');

    expect(root.querySelector('#stat-count')?.textContent).toBe('2');
    expect(root.querySelector('#stat-top')?.textContent).toBe('Moussa Ba');
    expect(root.querySelector('#stat-total')?.textContent).toBe('400 F');
  });

  it('switches period and re-renders when a chip is clicked', () => {
    const stats = new Stats(root, { periods: [{ key: 'day', label: 'Jour' }, { key: 'month', label: 'Mois' }], sellers, defaultPeriod: 'day' });
    stats.render();

    const monthChip = root.querySelector<HTMLElement>('[data-period="month"]')!;
    monthChip.click();

    const cards = root.querySelectorAll('.client-card .cname');
    expect(cards[0].textContent).toBe('Awa Diop');
    expect(root.querySelector('#stat-top')?.textContent).toBe('Awa Diop');
    expect(root.querySelector('.chip.active')?.textContent).toBe('Mois');
  });

  it('falls back to "—" when there are no sellers', () => {
    const stats = new Stats(root, { sellers: [] });
    stats.render();

    expect(root.querySelector('#stat-top')?.textContent).toBe('—');
    expect(root.querySelector('#stat-count')?.textContent).toBe('0');
  });
});
