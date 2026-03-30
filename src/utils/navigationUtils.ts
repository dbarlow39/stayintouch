/**
 * Filters navigation items for buyer representation views.
 * When representationType is 'buyer', only Back, Back to Property Info, and My Properties are shown.
 * Seller representation keeps all navigation items unchanged.
 */
export const filterNavForRepType = <T extends { label: string }>(
  navigationItems: T[],
  representationType?: string
): T[] => {
  if (representationType !== 'buyer') return navigationItems;
  
  const allowedLabels = ['Back', 'Back to Property Info', 'My Properties'];
  return navigationItems.filter(item => allowedLabels.includes(item.label));
};
