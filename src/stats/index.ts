import {
  fmt,
  fmtCompact,
  SELLER_COLORS,
  RANK_TIERS,
  DENSE_TREND_THRESHOLD,
} from '../constants';
import type { StatsChatContext, StatsChatMessage } from '../ai';

/** Échappe le texte libre (saisie utilisateur, réponse IA) avant injection dans innerHTML — évite toute casse XSS. */
function escapeHtmlChat(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Rend le markdown minimal (gras **texte**) des réponses IA — échappe d'abord tout le texte, donc sans risque XSS. */
function renderChatMarkdown(text: string): string {
  return escapeHtmlChat(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

const CHAT_STYLES_ID = 'stats-chat-styles';

/** Styles du panneau IA, injectés une seule fois dans document.head (this.el est vidé à chaque render()). */
function injectChatStyles(): void {
  if (document.getElementById(CHAT_STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = CHAT_STYLES_ID;
  style.textContent = `
    .stats-chat-toggle { flex-shrink: 0; white-space: nowrap; }
    /* Le panneau IA réutilise .client-sidebar (même fiche que le détail vendeur) : largeur 400px,
       fond papier, coins arrondis et transition de largeur viennent du design system, pas d'ici. */
    .stats-chat-wrap { display: flex; flex-direction: column; max-height: calc(100vh - 64px); }
    .stats-chat-messages { flex: 1 1 auto; min-height: 60px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
    .stats-chat-msg { padding: 8px 11px; border-radius: 11px; font-size: 12.5px; line-height: 1.45; white-space: pre-wrap; max-width: 92%; }
    .stats-chat-msg-user { align-self: flex-end; background: var(--clay-bright); color: #fff; }
    .stats-chat-msg-assistant { align-self: flex-start; background: var(--paper-deep); color: var(--ink); }
    .stats-chat-loading { display: flex; gap: 4px; align-items: center; padding: 10px 14px; }
    .stats-chat-loading span { width: 5px; height: 5px; border-radius: 50%; background: var(--ink-muted); animation: statsChatBounce 1s infinite ease-in-out; }
    .stats-chat-loading span:nth-child(2) { animation-delay: .15s; }
    .stats-chat-loading span:nth-child(3) { animation-delay: .3s; }
    @keyframes statsChatBounce { 0%, 80%, to { opacity: .3; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
    .stats-chat-error { margin: 0 0 8px; padding: 8px 10px; border-radius: 9px; background: #b23a3324; color: var(--rust); font-size: 11.5px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .stats-chat-retry-btn { border: none; background: var(--rust); color: #fff; border-radius: 7px; padding: 4px 9px; font-size: 11px; cursor: pointer; flex-shrink: 0; }
    .stats-chat-input-row { display: flex; gap: 8px; padding-top: 10px; border-top: 1px solid var(--paper-line); flex-shrink: 0; }
    .stats-chat-input-row textarea { flex: 1; resize: none; border: 1.5px solid var(--paper-line); border-radius: 9px; padding: 7px 9px; font-family: inherit; font-size: 12px; color: var(--ink); }
    .stats-chat-input-row button { flex-shrink: 0; }
  `;
  document.head.appendChild(style);
}

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
  /** Heure de la première/dernière vente de ce bucket précis (drill-down), toute équipe confondue. */
  firstSaleTime?: string | null;
  lastSaleTime?: string | null;
  /** Heures de ce bucket précis (drill-down) — absent/vide si le back ne le fournit pas encore. */
  hourlyPattern?: SellerHourlyPoint[];
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
  /** Heure de la première/dernière vente (toute équipe) du dernier jour actif de la période. */
  firstSaleTime?: string | null;
  lastSaleTime?: string | null;
  /** Affluence heure par heure (toute équipe), agrégée sur toute la période — vue par défaut. */
  hourlyPattern?: SellerHourlyPoint[];
}

export type StatsMetricKey = 'ca' | 'benefice';

export type SellerAlertLevel = 'warning' | 'critical';

export interface SellerAlert {
  level: SellerAlertLevel;
  message: string;
}

export interface SellerHourlyPoint {
  hour: number;
  salesCount: number;
  ca: number;
}

/**
 * Un point par bucket de la période (jour/semaine/mois selon la clé) — sert à repérer
 * les creux d'activité. Porte aussi son propre drill-down horaire (firstSaleTime /
 * lastSaleTime / hourlyPattern scopés à ce bucket précis, pas à toute la période) —
 * même principe que ClientsOverview.selectDay dans ms-section-clients.
 */
export interface SellerActivityPoint {
  label: string;
  ca: number;
  benefice: number;
  salesCount: number;
  active: boolean;
  firstSaleTime: string | null;
  lastSaleTime: string | null;
  hourlyPattern: SellerHourlyPoint[];
}

export interface SellerTopItem {
  name: string;
  icon?: string;
  quantity: number;
  ca: number;
}

export interface SellerPeriodData {
  key: string;
  label: string;
  totalCa: number;
  totalBenefice: number;
  averageBasket: number;
  transactionsCount: number;
  itemsSoldCount: number;
  activeBucketsCount: number;
  totalBucketsCount: number;
  activity: SellerActivityPoint[];
  hourlyPattern: SellerHourlyPoint[];
  topItems: SellerTopItem[];
}

/**
 * Agrégat comportement + performance d'un vendeur — ne porte pas l'identité
 * (nom/zone/téléphone) : celle-ci vient déjà de `Seller` dans `this.sellers`,
 * le back (ms-order-service) ne connaît le vendeur que par son email.
 */
export interface SellerDetail {
  email: string;
  alert: SellerAlert | null;
  firstSaleTime: string | null;
  lastSaleTime: string | null;
  lastActiveDayLabel: string | null;
  periods: SellerPeriodData[];
  defaultPeriodKey?: string;
}

export interface StatsOptions {
  sellers: Seller[];
  periods: StatsPeriod[];
  defaultPeriodKey?: string;
  defaultMetric?: StatsMetricKey;
  onSellerSelect?: (sellerId: string) => void;
  /** IA conversationnelle ou repli local par mot-clé — reçoit l'historique complet (dernier message = la question en cours). */
  askStatsAi?: (history: StatsChatMessage[], context: StatsChatContext) => Promise<string>;
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
  private onSellerSelect?: (sellerId: string) => void;
  private currentSellerDetail: SellerDetail | null = null;
  private currentSellerRank = 1;
  private currentSellerPeriodKey: string | null = null;
  /** Index du bucket d'activité sélectionné (drill-down horaire) — null = vue agrégée sur toute la période. */
  private focusedActivityIndex: number | null = null;

  private askStatsAi?: (history: StatsChatMessage[], context: StatsChatContext) => Promise<string>;
  private chatPanelOpen = false;
  private chatMessages: StatsChatMessage[] = [];
  private chatLoading = false;
  private chatError: string | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  render(options: StatsOptions): void {
    injectChatStyles();
    this.sellers = options.sellers;
    this.periods = options.periods;
    this.currentPeriodKey = options.defaultPeriodKey ?? this.periods[0]?.key ?? '';
    this.currentMetric = options.defaultMetric ?? 'ca';
    this.focusedBucketIndex = null;
    this.onSellerSelect = options.onSellerSelect;
    this.askStatsAi = options.askStatsAi;
    this.currentSellerDetail = null;

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
          <button class="btn-cancel stats-chat-toggle" id="stats-chat-toggle" type="button">🤖 Assistant IA</button>
        </div>

        <div class="cs-trend-card" id="global-shift-wrap" style="display:none;">
          <div class="ss-shift-card" id="global-shift-card"></div>
        </div>

        <div class="cs-trend-card">
          <div class="cs-trend-head"><span class="cs-trend-title" id="global-hourly-title">Affluence — heure par heure</span></div>
          <div id="global-hourly-chart"></div>
        </div>

        <div class="mss-trend-card">
          <div class="mss-trend-head">
            <span class="mss-trend-title" id="mss-trend-title"></span>
            <span class="mss-trend-total" id="mss-trend-total"></span>
          </div>
          <div class="mss-trend-grid" id="mss-trend-grid"></div>
          <div class="mss-trend-labels" id="mss-trend-labels"></div>
          <div class="mss-trend-hint">Clique un point pour voir son détail heure par heure</div>
        </div>

        <div class="mss-chart-card">
          <div class="mss-chart-title" id="mss-chart-title">Répartition par vendeur</div>
          <div id="stats-chart" class="mss-chart-grid"></div>
          <div class="mss-chart-labels" id="mss-chart-labels"></div>
        </div>

        <div class="clients-body">
          <div class="clients-grid" id="sellers-grid"></div>
          <aside class="client-sidebar" id="seller-sidebar"></aside>
          <aside class="client-sidebar" id="stats-chat-panel-mount"></aside>
        </div>
      </div>
    `;

    this.update();
    this.renderChatPanel();
    this.bindEvents();
  }

  private renderChatPanel(): void {
    const mount = this.el.querySelector<HTMLElement>('#stats-chat-panel-mount');
    if (!mount) return;

    if (!this.chatPanelOpen) {
      mount.innerHTML = '';
      return;
    }

    const messagesHtml =
      this.chatMessages.length === 0
        ? '<div class="no-results"><span class="mark">Pose une question, ex : "quel vendeur a le plus vendu ?"</span></div>'
        : this.chatMessages
            .map((m) => `<div class="stats-chat-msg stats-chat-msg-${m.role}">${renderChatMarkdown(m.content)}</div>`)
            .join('');

    mount.innerHTML = `
      <div class="stats-chat-wrap">
        <div class="cs-head">
          <div class="avatar">🤖</div>
          <div class="cs-head-info"><h3 class="cs-name">Assistant Statistiques</h3></div>
          <button type="button" class="cs-close-btn" id="stats-chat-reset" aria-label="Effacer la conversation" title="Effacer la conversation">🗑</button>
          <button type="button" class="cs-close-btn" id="stats-chat-close" aria-label="Fermer">✕</button>
        </div>
        <div class="stats-chat-messages" id="stats-chat-messages">
          ${messagesHtml}
          ${this.chatLoading ? '<div class="stats-chat-msg stats-chat-msg-assistant stats-chat-loading"><span></span><span></span><span></span></div>' : ''}
        </div>
        ${
          this.chatError
            ? `<div class="stats-chat-error">${escapeHtmlChat(this.chatError)}<button type="button" id="stats-chat-retry" class="stats-chat-retry-btn">Réessayer</button></div>`
            : ''
        }
        <div class="stats-chat-input-row">
          <textarea id="stats-chat-input" rows="2" placeholder="Ex : quel vendeur a le plus vendu ?" ${this.chatLoading ? 'disabled' : ''}></textarea>
          <button type="button" id="stats-chat-send" class="btn-confirm" ${this.chatLoading ? 'disabled' : ''}>Envoyer</button>
        </div>
      </div>
    `;

    const list = mount.querySelector<HTMLElement>('#stats-chat-messages');
    if (list) list.scrollTop = list.scrollHeight;
  }

  private toggleChatPanel(): void {
    this.chatPanelOpen = !this.chatPanelOpen;
    this.renderChatPanel();
  }

  private closeChatPanel(): void {
    this.chatPanelOpen = false;
    this.renderChatPanel();
  }

  private resetChatConversation(): void {
    this.chatMessages = [];
    this.chatError = null;
    this.renderChatPanel();
  }

  private async sendChatMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this.chatLoading) return;

    if (!this.askStatsAi) {
      this.chatError = 'Assistant IA non disponible.';
      this.renderChatPanel();
      return;
    }

    this.chatMessages.push({ role: 'user', content: trimmed });
    const input = this.el.querySelector<HTMLTextAreaElement>('#stats-chat-input');
    if (input) input.value = '';
    await this.runChatRequest();
  }

  private async retryChatMessage(): Promise<void> {
    if (this.chatLoading) return;
    await this.runChatRequest();
  }

  private async runChatRequest(): Promise<void> {
    if (!this.askStatsAi) return;

    this.chatError = null;
    this.chatLoading = true;
    this.renderChatPanel();

    try {
      const answer = await this.askStatsAi([...this.chatMessages], {
        sellers: this.sellers,
        periods: this.periods,
      });
      this.chatMessages.push({ role: 'assistant', content: answer });
    } catch {
      this.chatError = "La réponse de l'assistant a échoué — réessaie.";
    } finally {
      this.chatLoading = false;
      this.renderChatPanel();
    }
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
    this.renderGlobalHourly(period, bucket);
    this.renderTrend(period, focused);
    this.renderSellerChart(ranked, displayMetrics);
    this.renderSellersGrid(ranked, displayMetrics);
  }

  /**
   * Affluence horaire toute équipe — l'agrégat de la période par défaut, ou le
   * drill-down du bucket sélectionné (clic sur une barre de "Évolution") sinon.
   * Même principe que le drill-down du side panel vendeur (voir renderSellerSidebar).
   */
  private renderGlobalHourly(period: StatsPeriod, focusedBucket: TrendBucket | undefined): void {
    const title = this.el.querySelector<HTMLElement>('#global-hourly-title');
    const chart = this.el.querySelector<HTMLElement>('#global-hourly-chart');
    const shiftWrap = this.el.querySelector<HTMLElement>('#global-shift-wrap');
    const shiftCard = this.el.querySelector<HTMLElement>('#global-shift-card');
    if (!title || !chart || !shiftWrap || !shiftCard) return;

    const points = focusedBucket ? (focusedBucket.hourlyPattern ?? []) : (period.hourlyPattern ?? []);
    const firstSaleTime = focusedBucket ? focusedBucket.firstSaleTime : period.firstSaleTime;
    const lastSaleTime = focusedBucket ? focusedBucket.lastSaleTime : period.lastSaleTime;

    title.textContent = focusedBucket
      ? `Affluence — heure par heure — ${focusedBucket.label}`
      : 'Affluence — heure par heure';
    chart.innerHTML = this.renderGlobalHourlyChart(points);

    if (firstSaleTime && lastSaleTime) {
      shiftWrap.style.display = '';
      shiftCard.innerHTML = `
        <span class="ss-shift-item">🕗 Première vente <b>${firstSaleTime}</b></span>
        <span class="ss-shift-item">🕖 Dernière vente <b>${lastSaleTime}</b></span>
      `;
    } else {
      shiftWrap.style.display = 'none';
      shiftCard.innerHTML = '';
    }
  }

  private globalHourlyHint(point: SellerHourlyPoint, isSelection: boolean): string {
    const prefix = isSelection ? '' : 'Pic : ';
    return `${prefix}${String(point.hour).padStart(2, '0')}h · ${point.salesCount} vente${point.salesCount === 1 ? '' : 's'} · ${fmt(point.ca)}`;
  }

  private renderGlobalHourlyChart(points: SellerHourlyPoint[]): string {
    if (points.length === 0) {
      return `<div class="no-results" style="padding:14px;"><span class="mark">Pas assez de données</span>sur cette période</div>`;
    }

    const max = Math.max(1, ...points.map((p) => p.salesCount));
    const peak = points.reduce((a, b) => (b.salesCount > a.salesCount ? b : a));

    return `
      <div class="co-hint" id="global-hourly-hint">${this.globalHourlyHint(peak, false)}</div>
      <div class="co-bar-grid co-bar-grid-hours" style="height:56px;">
        ${points
          .map(
            (p) => `
          <div class="co-bar-wrap" role="button" tabindex="0">
            <div class="co-bar${p.hour === peak.hour ? ' co-bar-peak' : ''}" style="height:${Math.round((p.salesCount / max) * 100)}%;"></div>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="co-bar-labels co-bar-labels-hours">
        ${points.map((p) => `<span>${p.hour % 3 === 0 ? String(p.hour).padStart(2, '0') : ''}</span>`).join('')}
      </div>
    `;
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
          <div class="client-card${s.id === this.currentSellerDetail?.email ? ' active' : ''}" data-seller-id="${s.id}" role="button" tabindex="0">
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

      if (target.closest('#stats-chat-toggle')) {
        this.toggleChatPanel();
        return;
      }

      if (target.closest('#stats-chat-close')) {
        this.closeChatPanel();
        return;
      }

      if (target.closest('#stats-chat-reset')) {
        this.resetChatConversation();
        return;
      }

      if (target.closest('#stats-chat-send')) {
        const input = this.el.querySelector<HTMLTextAreaElement>('#stats-chat-input');
        void this.sendChatMessage(input?.value ?? '');
        return;
      }

      if (target.closest('#stats-chat-retry')) {
        void this.retryChatMessage();
        return;
      }

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
        return;
      }

      const sellerCard = target.closest<HTMLElement>('#sellers-grid .client-card[data-seller-id]');
      if (sellerCard) {
        const id = sellerCard.dataset.sellerId;
        if (id) this.onSellerSelect?.(id);
        return;
      }

      if (target.closest('#ss-close-btn')) {
        this.closeSellerDetail();
        return;
      }

      const sellerPeriodChip = target.closest<HTMLElement>('[data-ss-period]');
      if (sellerPeriodChip) {
        const key = sellerPeriodChip.dataset.ssPeriod;
        if (key && key !== this.currentSellerPeriodKey) {
          this.currentSellerPeriodKey = key;
          // Les buckets changent de sens d'une période à l'autre (jour -> semaine...) :
          // un focus sur un bucket de l'ancienne période n'a plus de sens ici.
          this.focusedActivityIndex = null;
          this.renderSellerSidebar();
        }
        return;
      }

      const activityBar = target.closest<HTMLElement>('#ss-activity-chart [data-ss-activity-index]');
      if (activityBar) {
        const index = Number(activityBar.dataset.ssActivityIndex);
        this.focusedActivityIndex = this.focusedActivityIndex === index ? null : index;
        this.renderSellerSidebar();
      }
    });

    this.el.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'stats-chat-input' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendChatMessage((target as HTMLTextAreaElement).value);
      }
    });
  }

  private currentSellerPeriod(): SellerPeriodData | undefined {
    if (!this.currentSellerDetail) return undefined;
    return this.currentSellerDetail.periods.find(
      (p) => p.key === this.currentSellerPeriodKey
    );
  }

  /** Ouvre (ou rafraîchit) le side panel d'un vendeur — l'identité (nom/zone/tél) et le
   * rang viennent de `this.sellers` / du classement courant, l'agrégat de `detail`
   * (ms-order-service ne connaît le vendeur que par son email). */
  showSellerDetail(detail: SellerDetail): void {
    const seller = this.sellers.find((s) => s.id === detail.email);
    if (!seller) return;

    const period = this.getPeriod();
    const displayMetrics = period ? this.resolveDisplayMetrics(period) : new Map<string, Metrics>();
    const ranked = period ? this.getRanked(displayMetrics) : this.sellers;
    const rank = ranked.findIndex((s) => s.id === detail.email);

    this.currentSellerDetail = detail;
    this.currentSellerRank = rank >= 0 ? rank + 1 : this.sellers.length;
    this.currentSellerPeriodKey =
      detail.defaultPeriodKey ?? detail.periods[0]?.key ?? null;
    this.focusedActivityIndex = null;
    this.renderSellersGrid(ranked, displayMetrics);
    this.renderSellerSidebar();
  }

  closeSellerDetail(): void {
    this.currentSellerDetail = null;
    this.currentSellerPeriodKey = null;
    this.focusedActivityIndex = null;
    const sidebar = this.el.querySelector<HTMLElement>('#seller-sidebar');
    if (sidebar) sidebar.innerHTML = '';

    const period = this.getPeriod();
    if (!period) return;
    const displayMetrics = this.resolveDisplayMetrics(period);
    this.renderSellersGrid(this.getRanked(displayMetrics), displayMetrics);
  }

  private renderSellerSidebar(): void {
    const sidebar = this.el.querySelector<HTMLElement>('#seller-sidebar');
    const detail = this.currentSellerDetail;
    if (!sidebar || !detail) return;

    const seller = this.sellers.find((s) => s.id === detail.email);
    if (!seller) return;

    const period = this.currentSellerPeriod();
    const sellerInitials = seller.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const alertLevel = detail.alert?.level ?? 'ok';

    // Bucket sélectionné (drill-down) : ses propres heures/first-last sale, sinon
    // repli sur l'agrégat de toute la période (ou de la fiche pour first/last sale).
    const focusedBucket =
      period && this.focusedActivityIndex !== null
        ? period.activity[this.focusedActivityIndex]
        : undefined;
    const hourlyPoints = focusedBucket ? focusedBucket.hourlyPattern : (period?.hourlyPattern ?? []);
    const shiftFirstSale = focusedBucket ? focusedBucket.firstSaleTime : detail.firstSaleTime;
    const shiftLastSale = focusedBucket ? focusedBucket.lastSaleTime : detail.lastSaleTime;
    const shiftDayLabel = focusedBucket ? focusedBucket.label : detail.lastActiveDayLabel;
    const hourlyTitle = focusedBucket
      ? `Affluence — heure par heure — ${focusedBucket.label}`
      : 'Affluence — heure par heure';

    sidebar.innerHTML = `
      <div class="cs-head">
        <div class="ss-avatar-wrap">
          <div class="avatar" style="background:${SELLER_COLORS[(this.currentSellerRank - 1) % SELLER_COLORS.length]};">${sellerInitials}</div>
          <span class="ss-status-dot ss-status-${alertLevel}"></span>
        </div>
        <div class="cs-head-info">
          <h3 class="cs-name">${seller.name}</h3>
          <div class="cs-phone">${seller.zone} · ${seller.phone}</div>
          <span class="mss-rank ${RANK_TIERS[this.currentSellerRank - 1] ?? 'bronze'}">#${this.currentSellerRank}</span>
        </div>
        <button class="cs-close-btn" id="ss-close-btn" aria-label="Fermer">✕</button>
      </div>

      ${
        detail.alert
          ? `
        <div class="cs-alert${detail.alert.level === 'warning' ? ' cs-alert-warning' : ''}">
          <span class="cs-alert-icon">⚠️</span>
          <span class="cs-alert-text">${detail.alert.message}</span>
        </div>
      `
          : ''
      }

      ${
        shiftFirstSale && shiftLastSale
          ? `
        <div class="ss-shift-card">
          <span class="ss-shift-item">🕗 Première vente <b>${shiftFirstSale}</b></span>
          <span class="ss-shift-item">🕖 Dernière vente <b>${shiftLastSale}</b></span>
          <span class="ss-shift-day">${shiftDayLabel ?? ''}</span>
        </div>
      `
          : ''
      }

      <div class="cs-kpi-grid" id="ss-kpi-grid">${this.renderSellerKpis(period)}</div>
      <div class="cs-kpi-row-3" id="ss-kpi-row-3">${this.renderSellerKpiMinis(period)}</div>

      <div class="cs-trend-card">
        <div class="cs-trend-head"><span class="cs-trend-title" id="ss-hourly-title">${hourlyTitle}</span></div>
        <div id="ss-hourly-chart">${this.renderSellerHourly(hourlyPoints)}</div>
      </div>

      <div class="cs-trend-card">
        <div class="cs-trend-head"><span class="cs-trend-title">Activité — ${period?.label ?? ''}</span></div>
        <div id="ss-activity-chart">${this.renderSellerActivity(period)}</div>
      </div>

      <div class="category-row" id="ss-period-row">
        ${detail.periods
          .map(
            (p) =>
              `<div class="chip ${p.key === this.currentSellerPeriodKey ? 'active' : ''}" data-ss-period="${p.key}">${p.label}</div>`
          )
          .join('')}
      </div>

      <div class="cs-section-title">Top articles — ${period?.label ?? ''}</div>
      <div id="ss-top-items">${this.renderSellerTopItems(period)}</div>
    `;
  }

  private renderSellerKpis(period: SellerPeriodData | undefined): string {
    return `
      <div class="cs-kpi-card">
        <span class="cs-kpi-lab">CA généré</span>
        <span class="cs-kpi-val">${fmt(period?.totalCa ?? 0)}</span>
      </div>
      <div class="cs-kpi-card">
        <span class="cs-kpi-lab">Bénéfice</span>
        <span class="cs-kpi-val cs-benef">${fmt(period?.totalBenefice ?? 0)}</span>
      </div>
    `;
  }

  private renderSellerKpiMinis(period: SellerPeriodData | undefined): string {
    return `
      <div class="cs-kpi-mini">
        <span class="cs-kpi-lab">Panier moyen</span>
        <span class="cs-kpi-val">${fmt(period?.averageBasket ?? 0)}</span>
      </div>
      <div class="cs-kpi-mini">
        <span class="cs-kpi-lab">Transactions</span>
        <span class="cs-kpi-val">${period?.transactionsCount ?? 0}</span>
      </div>
      <div class="cs-kpi-mini">
        <span class="cs-kpi-lab">Articles vendus</span>
        <span class="cs-kpi-val">${period?.itemsSoldCount ?? 0}</span>
      </div>
    `;
  }

  private sellerHourlyHint(point: SellerHourlyPoint, isSelection: boolean): string {
    const prefix = isSelection ? '' : 'Pic : ';
    return `${prefix}${String(point.hour).padStart(2, '0')}h · ${point.salesCount} vente${point.salesCount === 1 ? '' : 's'} · ${fmt(point.ca)}`;
  }

  private renderSellerHourly(points: SellerHourlyPoint[]): string {
    if (points.length === 0) {
      return `<div class="no-results" style="padding:14px;"><span class="mark">Pas assez de données</span>sur cette période</div>`;
    }

    const max = Math.max(1, ...points.map((p) => p.salesCount));
    const peak = points.reduce((a, b) => (b.salesCount > a.salesCount ? b : a));

    return `
      <div class="co-hint" id="ss-hourly-hint">${this.sellerHourlyHint(peak, false)}</div>
      <div class="co-bar-grid co-bar-grid-hours" style="height:56px;">
        ${points
          .map(
            (p) => `
          <div class="co-bar-wrap" data-ss-hour="${p.hour}" role="button" tabindex="0">
            <div class="co-bar${p.hour === peak.hour ? ' co-bar-peak' : ''}" style="height:${Math.round((p.salesCount / max) * 100)}%;"></div>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="co-bar-labels co-bar-labels-hours">
        ${points.map((p) => `<span>${p.hour % 3 === 0 ? String(p.hour).padStart(2, '0') : ''}</span>`).join('')}
      </div>
    `;
  }

  /**
   * Barres grisées pour les buckets sans vente — pour que le creux d'activité saute aux
   * yeux. Cliquer une barre fait un drill-down : le graphique d'affluence horaire (et le
   * shift-card) au-dessus bascule sur les heures propres à ce bucket précis.
   */
  private renderSellerActivity(period: SellerPeriodData | undefined): string {
    const points = period?.activity ?? [];
    if (points.length === 0) {
      return `<div class="no-results" style="padding:14px;"><span class="mark">Pas assez de données</span>sur cette période</div>`;
    }

    const max = Math.max(1, ...points.map((p) => p.ca));

    return `
      <div class="co-hint">${period?.activeBucketsCount ?? 0} / ${period?.totalBucketsCount ?? 0} périodes actives — clique une barre pour voir ses heures</div>
      <div class="co-bar-grid">
        ${points
          .map(
            (p, i) => `
          <div class="co-bar-wrap" data-ss-activity-index="${i}" role="button" tabindex="0" title="${p.label} : ${p.active ? fmt(p.ca) : 'aucune vente'}">
            <div class="co-bar ${p.active ? '' : 'ss-bar-inactive'}${i === this.focusedActivityIndex ? ' co-bar-selected' : ''}" style="height:${p.active ? Math.round((p.ca / max) * 100) : 4}%;"></div>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="co-bar-labels">
        ${points.map((p) => `<span>${p.label}</span>`).join('')}
      </div>
    `;
  }

  private renderSellerTopItems(period: SellerPeriodData | undefined): string {
    if (!period || period.topItems.length === 0) {
      return `<div class="no-results" style="padding:14px;"><span class="mark">Aucune vente</span>sur cette période</div>`;
    }

    return period.topItems
      .map(
        (item) => `
        <div class="cs-product-row">
          <span class="cs-p-icon">${item.icon ?? '🛒'}</span>
          <div class="cs-p-info">
            <div class="cs-p-name">${item.name}</div>
            <div class="cs-p-freq">Vendu ${item.quantity} fois</div>
          </div>
          <span class="cs-p-ca">${fmt(item.ca)}</span>
        </div>
      `
      )
      .join('');
  }
}
