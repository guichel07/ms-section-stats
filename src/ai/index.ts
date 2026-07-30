import type { Seller, StatsPeriod } from '../stats';

export type ChatAiProvider = 'claude' | 'gemini';

export interface ChatAiCredentials {
  provider: ChatAiProvider;
  apiKey: string;
  model?: string;
}

export interface StatsChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StatsChatContext {
  sellers: Seller[];
  periods: StatsPeriod[];
}

const DEFAULT_CHAT_MODELS: Record<ChatAiProvider, string> = {
  claude: 'claude-sonnet-5',
  gemini: 'gemini-2.5-flash',
};

export type StatsChatErrorCode = 'missing_credentials' | 'request_failed' | 'invalid_response';

export class StatsChatError extends Error {
  readonly code: StatsChatErrorCode;

  constructor(code: StatsChatErrorCode, message: string) {
    super(message);
    this.name = 'StatsChatError';
    this.code = code;
  }
}

/**
 * Résume les vraies statistiques de vente (par vendeur, par période, avec le détail heure par
 * heure et jour par jour déjà calculé côté agrégat) en texte compact — jamais de donnée inventée.
 * Inclut tout ce que la page affiche réellement, pour que l'IA puisse répondre avec des jours/heures exacts.
 */
function buildContextText(context: StatsChatContext): string {
  if (context.periods.length === 0) return 'Aucune période de statistiques disponible.';

  const sellerName = (id: string): string => context.sellers.find((s) => s.id === id)?.name ?? id;

  return context.periods
    .map((p) => {
      const perSeller = Object.entries(p.metrics)
        .map(([sellerId, m]) => `${sellerName(sellerId)} : ${m.ca} F de CA, ${m.benefice} F de bénéfice`)
        .join(' ; ');
      const delta = p.delta ? ` (évolution : ${p.delta.label})` : '';

      const saleHours =
        p.firstSaleTime || p.lastSaleTime
          ? ` Première vente à ${p.firstSaleTime ?? 'heure inconnue'}, dernière vente à ${p.lastSaleTime ?? 'heure inconnue'}.`
          : '';

      const hourly =
        p.hourlyPattern && p.hourlyPattern.length > 0
          ? ` Affluence heure par heure : ${p.hourlyPattern
              .map((h) => `${h.hour}h (${h.salesCount} ventes, ${h.ca} F)`)
              .join(', ')}.`
          : '';

      const trendText =
        p.trend.length > 0
          ? ` Détail par point de la courbe (jour/semaine selon la période) : ${p.trend
              .map((t) => {
                const times =
                  t.firstSaleTime || t.lastSaleTime ? ` [${t.firstSaleTime ?? '?'} → ${t.lastSaleTime ?? '?'}]` : '';
                const bySellerText = t.bySeller
                  ? ` (${Object.entries(t.bySeller)
                      .map(([sid, m]) => `${sellerName(sid)} : ${m.ca} F`)
                      .join(', ')})`
                  : '';
                return `${t.label} : ${t.ca} F CA, ${t.benefice} F bénéfice${times}${bySellerText}`;
              })
              .join(' ; ')}.`
          : '';

      return `- Période "${p.label}"${delta} : ${perSeller || 'aucune vente'}.${saleHours}${hourly}${trendText}`;
    })
    .join('\n');
}

function buildSystemPrompt(context: StatsChatContext): string {
  return `Tu es l'assistant Statistiques de Mama Solution. Réponds en français, de façon concise et factuelle.
Tu dois t'appuyer UNIQUEMENT sur les données réelles ci-dessous — n'invente jamais un vendeur, un montant ou une période qui n'y figure pas.
Si l'information demandée n'est pas dans ces données, dis-le clairement plutôt que d'inventer une réponse.

Données réelles des ventes par vendeur et par période :
${buildContextText(context)}`;
}

const SEARCH_STOPWORDS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'ou', 'a', 'au', 'aux', 'en', 'sur',
  'pour', 'par', 'qui', 'que', 'nous', 'vous', 'ils', 'elle', 'il', 'on', 'ce', 'cette', 'ces',
  'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'avec', 'sans', 'plus', 'quel', 'quelle', 'vendeur',
]);

function matchesQuestion(name: string, questionLower: string): boolean {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !SEARCH_STOPWORDS.has(w))
    .some((word) => questionLower.includes(word));
}

/** Repli hors-ligne, sans appel réseau : recherche par mot-clé (vendeur ou période) dans les vraies stats — utilisé quand aucune IA n'est configurée. */
export function localStatsSearch(question: string, context: StatsChatContext): string {
  const q = question.toLowerCase();
  const lines: string[] = [];

  for (const seller of context.sellers) {
    if (!matchesQuestion(seller.name, q)) continue;
    for (const period of context.periods) {
      const metrics = period.metrics[seller.id];
      if (metrics) {
        lines.push(`${seller.name}, sur "${period.label}" : ${metrics.ca} F de CA, ${metrics.benefice} F de bénéfice.`);
      }
    }
  }

  for (const period of context.periods) {
    if (!matchesQuestion(period.label, q)) continue;
    const total = Object.values(period.metrics).reduce((sum, m) => sum + m.ca, 0);
    lines.push(`Période "${period.label}" : ${total} F de CA au total.`);
  }

  if (lines.length === 0) {
    return "Aucun vendeur ni période correspondant trouvé dans les données réelles (aucune IA configurée pour une recherche plus large — recherche par mot-clé uniquement).";
  }
  return lines.join('\n');
}

export class StatsChatClient {
  private credentials: ChatAiCredentials | null = null;

  configure(credentials: ChatAiCredentials): void {
    if (!credentials.apiKey.trim()) {
      throw new StatsChatError('missing_credentials', "La clé d'API ne peut pas être vide");
    }
    this.credentials = credentials;
  }

  isConfigured(): boolean {
    return this.credentials !== null;
  }

  async ask(history: StatsChatMessage[], context: StatsChatContext): Promise<string> {
    if (!this.credentials) {
      throw new StatsChatError('missing_credentials', "Aucun fournisseur IA n'est configuré (Claude ou Gemini)");
    }

    const system = buildSystemPrompt(context);
    return this.credentials.provider === 'claude'
      ? this.callClaude(this.credentials, system, history)
      : this.callGemini(this.credentials, system, history);
  }

  private async callClaude(
    credentials: ChatAiCredentials,
    system: string,
    history: StatsChatMessage[]
  ): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': credentials.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: credentials.model ?? DEFAULT_CHAT_MODELS.claude,
        max_tokens: 2048,
        system,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      throw new StatsChatError('request_failed', `L'appel à Claude a échoué (HTTP ${response.status})`);
    }

    const data = (await response.json()) as {
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
    };
    const text = data.content?.find((block) => block.type === 'text')?.text;
    if (!text) {
      const hint = data.stop_reason === 'max_tokens' ? ' (réponse coupée, réessaie)' : '';
      throw new StatsChatError('invalid_response', `Claude a renvoyé une réponse vide${hint}`);
    }
    return text;
  }

  private async callGemini(
    credentials: ChatAiCredentials,
    system: string,
    history: StatsChatMessage[]
  ): Promise<string> {
    const model = credentials.model ?? DEFAULT_CHAT_MODELS.gemini;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${credentials.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: history.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        }),
      }
    );

    if (!response.ok) {
      throw new StatsChatError('request_failed', `L'appel à Gemini a échoué (HTTP ${response.status})`);
    }

    const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new StatsChatError('invalid_response', 'Gemini a renvoyé une réponse vide');
    }
    return text;
  }
}
