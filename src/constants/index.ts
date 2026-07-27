// toLocaleString('fr-FR') sépare les milliers par une espace fine insécable (U+202F),
// une espace insécable (U+00A0) ou une virgule selon l'environnement ICU du runtime.
const THOUSANDS_SEPARATORS = /[  ,]/g;

export function fmt(n: number): string {
  return (
    Math.round(n).toLocaleString('fr-FR').replace(THOUSANDS_SEPARATORS, ' ') +
    ' F'
  );
}

/** Format compact pour les petits espaces (barres de tendance) : 14000 -> "14k", 2500000 -> "2.5M". */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const millions = n / 1_000_000;
    return (
      (Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)) +
      'M'
    );
  }
  if (abs >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(Math.round(n));
}

export const SELLER_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
];

/** Classes de rang appliquées via `.mss-rank.<classe>` (voir styles injectés par le composant). */
export const RANK_TIERS = ['gold', 'silver', 'bronze'];

/** Nombre de points de tendance au-delà duquel les valeurs ne restent visibles qu'en version desktop. */
export const DENSE_TREND_THRESHOLD = 8;

/** Largeur d'écran (px) à partir de laquelle la mise en page desktop de tek-ms-ds s'active (cf. ses media queries). */
export const DESKTOP_BREAKPOINT = 880;
