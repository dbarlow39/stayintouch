/**
 * Bullseye Pricing Model
 *
 * Tiered bracket system based on home price ranges.
 * As the price increases, brackets widen according to tier rates
 * from the Home Buyer Price Brackets model.
 *
 * Tiers:
 *   $100k – $199k  → 10.0% spread  ($10k brackets)
 *   $200k – $499k  → 12.5% spread  ($25k–$50k brackets)
 *   $500k – $999k  → 10.0% spread  ($50k–$90k brackets)
 *   $1.0M – $1.5M+ → 25.0% spread  ($250k+ brackets)
 */

interface BracketTier {
  /** Inclusive lower bound of the tier */
  minPrice: number;
  /** Exclusive upper bound (Infinity for the top tier) */
  maxPrice: number;
  /** Spread percentage expressed as a decimal (e.g. 0.10) */
  spreadPct: number;
  /** Fixed bracket width within this tier (derived from spreadsheet rows) */
  bracketWidth: number;
}

const TIERS: BracketTier[] = [
  { minPrice: 100_000, maxPrice: 200_000, spreadPct: 0.10, bracketWidth: 10_000 },
  { minPrice: 200_000, maxPrice: 500_000, spreadPct: 0.125, bracketWidth: 25_000 },
  { minPrice: 500_000, maxPrice: 1_000_000, spreadPct: 0.10, bracketWidth: 50_000 },
  { minPrice: 1_000_000, maxPrice: Infinity, spreadPct: 0.25, bracketWidth: 250_000 },
];

function getTier(price: number): BracketTier {
  for (const tier of TIERS) {
    if (price >= tier.minPrice && price < tier.maxPrice) return tier;
  }
  // Prices below $100k use the first tier; above $1.5M use the last
  if (price < TIERS[0].minPrice) return TIERS[0];
  return TIERS[TIERS.length - 1];
}

/**
 * Given a price, find the bracket it falls into.
 * Brackets start at round multiples of bracketWidth within the tier.
 * Returns { low, high } representing the bracket boundaries.
 */
function getBracket(price: number): { low: number; high: number } {
  const tier = getTier(price);
  const width = tier.bracketWidth;
  const low = Math.floor(price / width) * width;
  const high = low + width;
  return { low, high };
}

export interface BullseyePricing {
  /** The recommended listing price (top of bracket − $100) */
  bullseyePrice: number;
  /** Lower bracket comparison price */
  lowerPrice: number;
  /** Upper bracket comparison price */
  upperPrice: number;
  /** Bullseye bracket range */
  bullseyeBracket: { low: number; high: number };
  /** Lower bracket range */
  lowerBracket: { low: number; high: number };
  /** Upper bracket range */
  upperBracket: { low: number; high: number };
  /** Bracket width used */
  bracketWidth: number;
}

/**
 * Calculate the bullseye pricing for a given estimated home value.
 *
 * @param estimatedValue - The estimated market value of the property
 * @returns Full pricing breakdown with three bracket prices and ranges
 */
export function calculateBullseyePricing(estimatedValue: number): BullseyePricing {
  const bullseyeBracket = getBracket(estimatedValue);

  // Lower bracket: one bracket step below
  const lowerTier = getTier(bullseyeBracket.low - 1);
  const lowerWidth = lowerTier.bracketWidth;
  const lowerHigh = bullseyeBracket.low;
  const lowerLow = lowerHigh - lowerWidth;
  const lowerBracket = { low: Math.max(0, lowerLow), high: lowerHigh };

  // Upper bracket: one bracket step above
  const upperTier = getTier(bullseyeBracket.high);
  const upperWidth = upperTier.bracketWidth;
  const upperLow = bullseyeBracket.high;
  const upperHigh = upperLow + upperWidth;
  const upperBracket = { low: upperLow, high: upperHigh };

  return {
    bullseyePrice: bullseyeBracket.high - 100,
    lowerPrice: lowerBracket.high - 100,
    upperPrice: upperBracket.high - 100,
    bullseyeBracket,
    lowerBracket,
    upperBracket,
    bracketWidth: getTier(estimatedValue).bracketWidth,
  };
}

/**
 * Format a price as a compact label like "$400K" or "$1.25M"
 */
export function formatPriceCompact(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2).replace(/0+$/, "")}M`;
  }
  const k = value / 1_000;
  return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, "")}K`;
}

/**
 * Format a bracket range as a label like "$400K-$425K"
 */
export function formatBracketRangeLabel(bracket: { low: number; high: number }): string {
  return `${formatPriceCompact(bracket.low)}-${formatPriceCompact(bracket.high)}`;
}

/**
 * Format a price as currency like "$424,900"
 */
export function formatPriceCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
