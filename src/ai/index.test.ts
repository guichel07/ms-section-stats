import { afterEach, describe, expect, it, vi } from 'vitest';
import { localStatsSearch, StatsChatClient, StatsChatError, type StatsChatContext } from './index';
import type { Seller, StatsPeriod } from '../stats';

function makeSeller(overrides: Partial<Seller> = {}): Seller {
  return { id: 's1', name: 'Jean-Pierre Nkomo', zone: 'Bacongo', phone: '+242051112233', ...overrides };
}

function makePeriod(overrides: Partial<StatsPeriod> = {}): StatsPeriod {
  return {
    key: '7jours',
    label: '7 jours',
    metrics: { s1: { ca: 124000, benefice: 45000 } },
    trend: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('localStatsSearch', () => {
  it('finds a matching seller and reports real CA/bénéfice per period', () => {
    const context: StatsChatContext = { sellers: [makeSeller()], periods: [makePeriod()] };
    const result = localStatsSearch('combien a vendu Jean-Pierre ?', context);
    expect(result).toContain('Jean-Pierre Nkomo');
    expect(result).toContain('124000 F');
  });

  it('finds a matching period and reports the real total CA', () => {
    const context: StatsChatContext = { sellers: [makeSeller()], periods: [makePeriod({ label: '4 semaines' })] };
    const result = localStatsSearch('quel est le total sur 4 semaines ?', context);
    expect(result).toContain('4 semaines');
    expect(result).toContain('124000 F');
  });

  it('returns an honest "no match" message instead of inventing a seller', () => {
    const context: StatsChatContext = { sellers: [makeSeller()], periods: [makePeriod()] };
    const result = localStatsSearch('Fatou Sarr', context);
    expect(result).toContain('Aucun vendeur');
  });
});

describe('StatsChatClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const context: StatsChatContext = { sellers: [makeSeller()], periods: [makePeriod()] };

  it('rejects a request when no provider is configured', async () => {
    const client = new StatsChatClient();
    await expect(client.ask([{ role: 'user', content: 'x' }], context)).rejects.toMatchObject({
      code: 'missing_credentials',
    });
  });

  it('rejects configuration with an empty api key', () => {
    const client = new StatsChatClient();
    expect(() => client.configure({ provider: 'claude', apiKey: '  ' })).toThrow(StatsChatError);
  });

  it('calls Claude with the conversation history and a real-stats system prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'Jean-Pierre a fait 124000 F.' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new StatsChatClient();
    client.configure({ provider: 'claude', apiKey: 'sk-ant-test' });

    const answer = await client.ask([{ role: 'user', content: 'meilleur vendeur ?' }], context);

    expect(answer).toBe('Jean-Pierre a fait 124000 F.');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.system).toContain('Jean-Pierre Nkomo');
    expect(body.system).toContain('124000 F');
    expect(body.messages).toEqual([{ role: 'user', content: 'meilleur vendeur ?' }]);
  });

  it('includes exact sale times and the day/week trend breakdown in the system prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const detailedContext: StatsChatContext = {
      sellers: [makeSeller()],
      periods: [
        makePeriod({
          firstSaleTime: '08:15',
          lastSaleTime: '19:42',
          hourlyPattern: [{ hour: 12, salesCount: 7, ca: 84200 }],
          trend: [
            {
              key: 'j1',
              label: 'Lundi',
              ca: 50000,
              benefice: 18000,
              firstSaleTime: '09:00',
              lastSaleTime: '17:30',
              bySeller: { s1: { ca: 50000, benefice: 18000 } },
            },
          ],
        }),
      ],
    };

    const client = new StatsChatClient();
    client.configure({ provider: 'claude', apiKey: 'sk-ant-test' });
    await client.ask([{ role: 'user', content: 'à quelle heure exacte ?' }], detailedContext);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.system).toContain('08:15');
    expect(body.system).toContain('19:42');
    expect(body.system).toContain('12h (7 ventes, 84200 F)');
    expect(body.system).toContain('Lundi');
    expect(body.system).toContain('09:00');
    expect(body.system).toContain('17:30');
    expect(body.system).toContain('Jean-Pierre Nkomo : 50000 F');
  });

  it('throws a request_failed error on a non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    const client = new StatsChatClient();
    client.configure({ provider: 'claude', apiKey: 'sk-ant-test' });

    await expect(client.ask([{ role: 'user', content: 'x' }], context)).rejects.toMatchObject({
      code: 'request_failed',
    });
  });
});
