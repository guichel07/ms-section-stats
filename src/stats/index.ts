import {
  fmt,
  fmtCompact,
  SELLER_COLORS,
  RANK_TIERS,
  DENSE_TREND_THRESHOLD,
} from '../constants';

export interface Metrics {
  ca: number;
  benefice: number;
}

export interface Seller {
  id: string;
  name: string;
  zone: string;
  phone: string;
}

export interface TrendBucket {
  key: string;
  label: string;
  ca: number;
  benefice: number;
  /**
   * Répartition exacte par vendeur pour ce point (clé = Seller.id).
   * Si absente, le composant estime la part de chaque vendeur au prorata de
   * son poids dans le total de la période — une approximation d'affichage,
   * pas une vraie donnée, tant que le back ne fournit pas le détail.
   */
  bySeller?: Record<string, Metrics>;
}

export interface PeriodDelta {
  pct: number;
  positive: boolean;
  label: string;
}

export interface StatsPeriod {
  key: string;
  label: string;
  /** Totaux CA/bénéfice par vendeur (clé = Seller.id) pour toute la période. */
  metrics: Record<string, Metrics>;
  /** Évolution vs la période équivalente précédente. */
  delta?: PeriodDelta;
  /** Points de la courbe d'évolution (jour, semaine, mois...) pour cette période. */
  trend: TrendBucket[];
}

export type StatsMetricKey = 'ca' | 'benefice';

export interface StatsOptions {
  sellers: Seller[];
  periods: StatsPeriod[];
  defaultPeriodKey?: string;
  defaultMetric?: StatsMetricKey;
}

const METRIC_LABEL: Record<StatsMetricKey, string> = {
  ca: "Chiffre d'affaires",
  benefice: 'Bénéfice',
};

const EMPTY_METRICS: Metrics = { ca: 0, benefice: 0 };

export class Stats {
  private readonly el: HTMLElement;
  private sellers: Seller[] = [];
  private periods: StatsPeriod[] = [];
  private currentPeriodKey = '';
  private currentMetric: StatsMetricKey = 'ca';
  private focusedBucketIndex: number | null = null;
  private eventsBound = false;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  render(options: StatsOptions): void {
    this.sellers = options.sellers;
    this.periods = options.periods;
    this.currentPeriodKey = options.defaultPeriodKey ?? this.periods[0]?.key ?? '';
    this.currentMetric = options.defaultMetric ?? 'ca';
    this.focusedBucketIndex = null;

    this.el.innerHTML = `
      <div class="section-view" id="section-stats">
        <div class="catalog-head">
          <h2>Statistiques</h2>
          <div class="sub">Ventes de toute l'équipe, par vendeur</div>
        </div>

        <div class="category-row" id="stats-period-row" style="margin:0 0 14px;"></div>

        <div class="stat-row" style="margin-bottom:14px;">
          <div class="stat-card mss-hero" id="stat-card-ca">
            <span class="stat-lab" id="stat-lab-ca">Chiffre d'affaires</span>
            <div class="mss-amt-row">
              <span class="stat-amt" id="stat-total">0 F</span>
              <span class="mss-delta" id="stat-delta"></span>
            </div>
            <span class="mss-foot" id="stat-foot"></span>
          </div>
          <div class="stat-card">
            <span class="stat-lab">Bénéfice</span>
            <span class="stat-amt mss-amt-benef" id="stat-benef-total">0 F</span>
          </div>
          <div class="stat-card">
            <span class="stat-lab">Meilleur vendeur</span>
            <span class="stat-amt" style="font-size:11.5px;" id="stat-top">—</span>
          </div>
        </div>

        <div class="mss-toolbar">
          <span class="mss-toolbar-title">Détail</span>
          <div class="mss-metric-switch" id="mss-metric-switch">
            <button type="button" class="mss-metric-btn" data-metric="ca">CA</button>
            <button type="button" class="mss-metric-btn" data-metric="benefice">Bénéfice</button>
          </div>
        </div>

        <div class="mss-trend-card">
          <div class="mss-trend-head">
            <span class="mss-trend-title" id="mss-trend-title"></span>
            <span class="mss-trend-total" id="mss-trend-total"></span>
          </div>
          <div class="mss-trend-grid" id="mss-trend-grid"></div>
          <div class="mss-trend-labels" id="mss-trend-labels"></div>
          <div class="mss-trend-hint">Clique un point pour un focus sur cette période</div>
        </div>

        <div class="mss-chart-card">
          <div class="mss-chart-title" id="mss-chart-title">Répartition par vendeur</div>
          <div id="stats-chart" class="mss-chart-grid"></div>
          <div class="mss-chart-labels" id="mss-chart-labels"></div>
        </div>

        <div class="clients-grid" id="sellers-grid"></div>
      </div>
    `;

    this.update();
    this.bindEvents();
  }

  private getPeriod(): StatsPeriod | undefined {
    return this.periods.find((p) => p.key === this.currentPeriodKey);
  }

  private getSellerMetrics(period: StatsPeriod, sellerId: string): Metrics {
    return period.metrics[sellerId] ?? EMPTY_METRICS;
  }

  /**
   * Résout les métriques affichées par vendeur : les totaux de la période,
   * ou — si un point de tendance est sélectionné — les valeurs de ce point,
   * réparties par vendeur (exactes si `bySeller` est fourni, estimées au
   * prorata sinon).
   */
  private resolveDisplayMetrics(period: StatsPeriod): Map<string, Metrics> {
    const result = new Map<string, Metrics>();

    if (this.focusedBucketIndex === null) {
      for (const seller of this.sellers) {
        result.set(seller.id, this.getSellerMetrics(period, seller.id));
      }
      return result;
    }

    const bucket = period.trend[this.focusedBucketIndex];
    const totalCa = this.sellers.reduce(
      (sum, s) => sum + this.getSellerMetrics(period, s.id).ca,
      0
    );
    const totalBenefice = this.sellers.reduce(
      (sum, s) => sum + this.getSellerMetrics(period, s.id).benefice,
      0
    );

    for (const seller of this.sellers) {
      const exact = bucket?.bySeller?.[seller.id];
      if (exact) {
        result.set(seller.id, exact);
        continue;
      }
      const full = this.getSellerMetrics(period, seller.id);
      result.set(seller.id, {
        ca: totalCa > 0 ? (bucket?.ca ?? 0) * (full.ca / totalCa) : 0,
        benefice:
          totalBenefice > 0
            ? (bucket?.benefice ?? 0) * (full.benefice / totalBenefice)
            : 0,
      });
    }
    return result;
  }

  private getRanked(displayMetrics: Map<string, Metrics>): Seller[] {
    return [...this.sellers].sort(
      (a, b) =>
        (displayMetrics.get(b.id)?.[this.currentMetric] ?? 0) -
        (displayMetrics.get(a.id)?.[this.currentMetric] ?? 0)
    );
  }

  /** Ré-affiche tout ce qui dépend de l'état courant (période / métrique / focus), sans reconstruire le squelette. */
  private update(): void {
    const period = this.getPeriod();
    if (!period) return;

    const displayMetrics = this.resolveDisplayMetrics(period);
    const ranked = this.getRanked(displayMetrics);
    const focused = this.focusedBucketIndex !== null;
    const bucket = focused ? period.trend[this.focusedBucketIndex as number] : undefined;

    this.renderPeriodChips();
    this.renderMetricSwitch();
    this.renderStatCards(period, ranked, focused, bucket);
    this.renderTrend(period, focused);
    this.renderSellerChart(ranked, displayMetrics);
    this.renderSellersGrid(ranked, displayMetrics);
  }

  private renderPeriodChips(): void {
    const row = this.el.querySelector<HTMLElement>('#stats-period-row');
    if (!row) return;

    row.innerHTML = this.periods
      .map(
        (p) =>
          `<div class="chip ${p.key === this.currentPeriodKey ? 'active' : ''}" data-period="${p.key}">${p.label}</div>`
      )
      .join('');
  }

  private renderMetricSwitch(): void {
    this.el
      .querySelectorAll<HTMLElement>('.mss-metric-btn')
      .forEach((btn) => {
        btn.classList.toggle(
          'active',
          btn.dataset.metric === this.currentMetric
        );
      });
  }

  private renderStatCards(
    period: StatsPeriod,
    ranked: Seller[],
    focused: boolean,
    bucket: TrendBucket | undefined
  ): void {
    const totalCa = this.sellers.reduce(
      (sum, s) => sum + this.getSellerMetrics(period, s.id).ca,
      0
    );
    const totalBenefice = this.sellers.reduce(
      (sum, s) => sum + this.getSellerMetrics(period, s.id).benefice,
      0
    );

    const displayCa = focused ? (bucket?.ca ?? 0) : totalCa;
    const displayBenefice = focused ? (bucket?.benefice ?? 0) : totalBenefice;

    const labEl = this.el.querySelector<HTMLElement>('#stat-lab-ca');
    const totalEl = this.el.querySelector<HTMLElement>('#stat-total');
    const benefEl = this.el.querySelector<HTMLElement>('#stat-benef-total');
    const topEl = this.el.querySelector<HTMLElement>('#stat-top');
    const deltaEl = this.el.querySelector<HTMLElement>('#stat-delta');
    const footEl = this.el.querySelector<HTMLElement>('#stat-foot');
    const cardEl = this.el.querySelector<HTMLElement>('#stat-card-ca');

    if (labEl) {
      labEl.textContent =
        "Chiffre d'affaires" + (focused ? ` · ${bucket?.label ?? ''}` : '');
    }
    if (totalEl) totalEl.textContent = fmt(displayCa);
    if (benefEl) benefEl.textContent = fmt(displayBenefice);
    if (topEl) topEl.textContent = ranked[0]?.name ?? '—';

    if (deltaEl && footEl && cardEl) {
      if (focused) {
        deltaEl.style.display = 'none';
        footEl.innerHTML = `Focus sur ${bucket?.label ?? ''} — <span class="mss-focus-clear" id="mss-focus-clear">revenir à la période</span>`;
        footEl.classList.add('mss-foot-focus');
        cardEl.classList.add('mss-focused');
      } else if (period.delta) {
        deltaEl.style.display = '';
        deltaEl.textContent = `${period.delta.positive ? '+' : ''}${period.delta.pct}%`;
        deltaEl.className = `mss-delta ${period.delta.positive ? 'pos' : 'neg'}`;
        footEl.textContent = period.delta.label;
        footEl.classList.remove('mss-foot-focus');
        cardEl.classList.remove('mss-focused');
      } else {
        deltaEl.style.display = 'none';
        footEl.textContent = '';
        footEl.classList.remove('mss-foot-focus');
        cardEl.classList.remove('mss-focused');
      }
    }
  }

  private renderTrend(period: StatsPeriod, focused: boolean): void {
    const titleEl = this.el.querySelector<HTMLElement>('#mss-trend-title');
    const totalEl = this.el.querySelector<HTMLElement>('#mss-trend-total');
    const gridEl = this.el.querySelector<HTMLElement>('#mss-trend-grid');
    const labelsEl = this.el.querySelector<HTMLElement>('#mss-trend-labels');
    if (!titleEl || !totalEl || !gridEl || !labelsEl) return;

    const trend = period.trend;
    const metricKey = this.currentMetric;
    const values = trend.map((b) => b[metricKey]);
    const max = Math.max(1, ...values);
    const dense = trend.length > DENSE_TREND_THRESHOLD;

    titleEl.textContent = `Évolution — ${period.label.toLowerCase()}`;

    if (focused && this.focusedBucketIndex !== null) {
      totalEl.textContent = `${trend[this.focusedBucketIndex]?.label ?? ''} sélectionné`;
      totalEl.classList.add('mss-focus-active');
    } else {
      totalEl.textContent = fmt(values.reduce((s, v) => s + v, 0));
      totalEl.classList.remove('mss-focus-active');
    }

    gridEl.className = `mss-trend-grid ${dense ? 'mss-dense' : ''}`;
    gridEl.innerHTML = trend
      .map((bucket, idx) => {
        const value = bucket[metricKey];
        const pct = Math.round((value / max) * 100);
        const isFocused = idx === this.focusedBucketIndex;
        return `
          <div class="mss-trend-bar-wrap ${isFocused ? 'mss-focused' : ''}" data-idx="${idx}" title="${bucket.label} : ${fmt(value)}">
            <span class="mss-trend-val" style="bottom:${pct}%;">${fmtCompact(value)}</span>
            <div class="mss-trend-bar mss-metric-${metricKey} ${idx === trend.length - 1 ? 'mss-endpoint' : ''}" style="height:${pct}%;"></div>
          </div>
        `;
      })
      .join('');

    labelsEl.innerHTML = trend
      .map((bucket) => `<span>${bucket.label}</span>`)
      .join('');
  }

  private renderSellerChart(
    ranked: Seller[],
    displayMetrics: Map<string, Metrics>
  ): void {
    const titleEl = this.el.querySelector<HTMLElement>('#mss-chart-title');
    const chart = this.el.querySelector<HTMLElement>('#stats-chart');
    const labelsEl = this.el.querySelector<HTMLElement>('#mss-chart-labels');
    if (!titleEl || !chart || !labelsEl) return;

    const metricKey = this.currentMetric;
    const focused = this.focusedBucketIndex !== null;
    const period = this.getPeriod();
    const bucketLabel =
      focused && period ? period.trend[this.focusedBucketIndex as number]?.label : undefined;

    titleEl.innerHTML = focused
      ? `Répartition — <b>${bucketLabel ?? ''}</b>`
      : `Répartition par vendeur (${metricKey === 'ca' ? 'CA' : 'bénéfice'})`;

    const max = Math.max(
      1,
      ...ranked.map((s) => displayMetrics.get(s.id)?.[metricKey] ?? 0)
    );

    chart.className = `mss-chart-grid mss-metric-${metricKey}`;
    chart.innerHTML = ranked
      .map((s, idx) => {
        const value = displayMetrics.get(s.id)?.[metricKey] ?? 0;
        const height = Math.round((value / max) * 100);

        return `
          <div class="mss-chart-bar-wrap">
            <span class="mss-chart-val">${fmtCompact(value)}</span>
            <div title="${s.name}" class="mss-chart-bar ${idx === 0 ? 'mss-top' : ''}" style="height:${height}%; background:${SELLER_COLORS[idx % SELLER_COLORS.length]};"></div>
          </div>
        `;
      })
      .join('');

    labelsEl.innerHTML = ranked
      .map((s) => `<span>${s.name.split(' ')[0]}</span>`)
      .join('');
  }

  private renderSellersGrid(
    ranked: Seller[],
    displayMetrics: Map<string, Metrics>
  ): void {
    const grid = this.el.querySelector<HTMLElement>('#sellers-grid');
    if (!grid) return;

    const metricKey = this.currentMetric;
    const secondaryKey: StatsMetricKey = metricKey === 'ca' ? 'benefice' : 'ca';

    grid.innerHTML = ranked
      .map((s, idx) => {
        const initials = s.name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        const metrics = displayMetrics.get(s.id) ?? EMPTY_METRICS;

        return `
          <div class="client-card">
            <div class="avatar" style="background:${SELLER_COLORS[idx % SELLER_COLORS.length]};">${initials}</div>
            <div class="info">
              <div class="cname">${s.name}</div>
              <div class="czone">${s.zone}</div>
              <div class="cphone">${s.phone}</div>
              <div class="cstats">
                <span class="ctotal">${fmt(metrics[metricKey])}</span>
                <span class="mss-rank ${RANK_TIERS[idx] ?? 'bronze'}">#${idx + 1}</span>
              </div>
              <div class="mss-secondary">${METRIC_LABEL[secondaryKey]} <b>${fmt(metrics[secondaryKey])}</b></div>
            </div>
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
      const target = e.target as HTMLElement;

      const chip = target.closest<HTMLElement>('.chip[data-period]');
      if (chip) {
        const key = chip.dataset.period;
        if (key && key !== this.currentPeriodKey) {
          this.currentPeriodKey = key;
          this.focusedBucketIndex = null;
          this.update();
        }
        return;
      }

      const metricBtn = target.closest<HTMLElement>('.mss-metric-btn');
      if (metricBtn) {
        const metric = metricBtn.dataset.metric as StatsMetricKey | undefined;
        if (metric && metric !== this.currentMetric) {
          this.currentMetric = metric;
          this.update();
        }
        return;
      }

      const clearFocus = target.closest<HTMLElement>('#mss-focus-clear');
      if (clearFocus) {
        this.focusedBucketIndex = null;
        this.update();
        return;
      }

      const bar = target.closest<HTMLElement>('.mss-trend-bar-wrap');
      if (bar) {
        const idx = Number(bar.dataset.idx);
        this.focusedBucketIndex = this.focusedBucketIndex === idx ? null : idx;
        this.update();
      }
    });
  }
}
