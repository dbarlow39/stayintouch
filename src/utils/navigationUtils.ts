/**
 * Navigation items are no longer filtered by representation type.
 * Buyer Working Deals now show the same navigation as Seller Working Deals.
 * Kept as a pass-through so all call sites remain unchanged.
 */
export const filterNavForRepType = <T extends { label: string }>(
  navigationItems: T[],
  _representationType?: string
): T[] => navigationItems;
