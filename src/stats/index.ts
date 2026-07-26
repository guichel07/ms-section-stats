import {
  fmt,
  DEFAULT_STATS_PERIODS,
  SELLER_COLORS,
  RANK_TIERS,
} from '../constants';

export interface StatsPeriod {
  key: string;
  label: string;
}

export interface Seller {
  name: string;
  zone: string;
  phone: string;
  sales: Record<string, number>;
}

export interface StatsOptions {
  sellers: Seller[];
  periods?: StatsPeriod[];
  defaultPeriod?: string;
}

export class Stats {
  private readonly el: HTMLElement;
  private sellers: Seller[] = [];
  private periods: StatsPeriod[] = DEFAULT_STATS_PERIODS;
  private currentPeriod = '';
  private eventsBound = false;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  render(options: StatsOptions): void {
    this.sellers = options.sellers;
    this.periods = options.periods ?? DEFAULT_STATS_PERIODS;
    this.currentPeriod = options.defaultPeriod ?? this.periods[0]?.key ?? '';

    this.el.innerHTML = `
      <div class="section-view" id="section-stats">
        <div class="catalog-head">
          <h2>Statistiques</h2>
          <div class="sub">Ventes de toute l'équipe, par vendeur</div>
        </div>
        <div class="stat-row">
          <div class="stat-card"><span class="stat-lab">Total période</span><span class="stat-amt" id="stat-total">0 F</span></div>
          <div class="stat-card"><span class="stat-lab">Vendeurs</span><span class="stat-amt" id="stat-count">0</span></div>
          <div class="stat-card"><span class="stat-lab">Meilleur vendeur</span><span class="stat-amt" id="stat-top" style="font-size:11.5px;">—</span></div>
        </div>
        <div id="stats-chart" style="display:flex; align-items:flex-end; gap:10px; height:110px; margin:16px 0 14px; padding:14px 16px 10px; background:#fff; border:1px solid var(--paper-line); border-radius:14px;"></div>
        <div class="category-row" id="stats-period-row" style="margin:0 0 12px;"></div>
        <div class="clients-grid" id="sellers-grid"></div>
      </div>
    `;

    this.renderPeriodChips();
    this.renderSellersGrid();
    this.renderSummary();
    this.renderChart();
    this.bindEvents();
  }

  private getRanked(): Seller[] {
    return [...this.sellers].sort(
      (a, b) =>
        (b.sales[this.currentPeriod] ?? 0) - (a.sales[this.currentPeriod] ?? 0)
    );
  }

  private renderPeriodChips(): void {
    const row = this.el.querySelector<HTMLElement>('#stats-period-row');
    if (!row) return;

    row.innerHTML = this.periods
      .map(
        (p) =>
          `<div class="chip ${p.key === this.currentPeriod ? 'active' : ''}" data-period="${p.key}">${p.label}</div>`
      )
      .join('');
  }

  private renderSellersGrid(): void {
    const grid = this.el.querySelector<HTMLElement>('#sellers-grid');
    if (!grid) return;

    const ranked = this.getRanked();

    grid.innerHTML = ranked
      .map((s, idx) => {
        const initials = s.name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        return `
          <div class="client-card">
            <div class="avatar" style="background:${SELLER_COLORS[idx % SELLER_COLORS.length]};">${initials}</div>
            <div class="info">
              <div class="cname">${s.name}</div>
              <div class="czone">${s.zone}</div>
              <div class="cphone">${s.phone}</div>
              <div class="cstats">
                <span class="ctotal">${fmt(s.sales[this.currentPeriod] ?? 0)}</span>
                <span class="ctag ${RANK_TIERS[idx] ?? 'new'}">#${idx + 1}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  private renderSummary(): void {
    const ranked = this.getRanked();
    const total = ranked.reduce(
      (sum, s) => sum + (s.sales[this.currentPeriod] ?? 0),
      0
    );

    const totalEl = this.el.querySelector<HTMLElement>('#stat-total');
    const countEl = this.el.querySelector<HTMLElement>('#stat-count');
    const topEl = this.el.querySelector<HTMLElement>('#stat-top');

    if (totalEl) totalEl.textContent = fmt(total);
    if (countEl) countEl.textContent = String(this.sellers.length);
    if (topEl) topEl.textContent = ranked[0]?.name ?? '—';
  }

  private renderChart(): void {
    const chart = this.el.querySelector<HTMLElement>('#stats-chart');
    if (!chart) return;

    const ranked = this.getRanked();
    const max = Math.max(
      1,
      ...ranked.map((s) => s.sales[this.currentPeriod] ?? 0)
    );

    chart.innerHTML = ranked
      .map((s, idx) => {
        const value = s.sales[this.currentPeriod] ?? 0;
        const height = Math.round((value / max) * 100);

        return `
          <div style="flex:1; height:100%; display:flex; align-items:flex-end;">
            <div title="${s.name}" style="width:100%; max-width:28px; margin:0 auto; height:${height}%; min-height:2px; border-radius:6px 6px 0 0; background:${SELLER_COLORS[idx % SELLER_COLORS.length]};"></div>
          </div>
        `;
      })
      .join('');
  }

  private bindEvents(): void {
    if (this.eventsBound) return;
    this.eventsBound = true;

    // Délégation d'événements : un seul listener posé une fois sur le point de montage.
    this.el.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
      if (!chip) return;

      const period = chip.dataset.period;
      if (!period || period === this.currentPeriod) return;

      this.currentPeriod = period;
      this.renderPeriodChips();
      this.renderSellersGrid();
      this.renderSummary();
      this.renderChart();
    });
  }
}
