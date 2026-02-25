import logoSrc from '@/assets/logo.jpg';
import fairHousingSrc from '@/assets/equal-housing-white.png';
import { MarketingListing, formatListingPrice } from '@/data/marketingListings';
import { RenderOptions, loadImage, drawCover } from './adCanvasRenderer';

const W = 1080;
const H = 1080;
const SCALE = 2;

export async function renderInstagramCanvas(opts: RenderOptions): Promise<string> {
  const { listing, bannerText, heroDataUrl, agentPhone } = opts;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1) Hero photo — fills ENTIRE canvas
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  if (heroDataUrl) {
    try {
      const heroImg = await loadImage(heroDataUrl);
      drawCover(ctx, heroImg, 0, 0, W, H);
    } catch (e) {
      console.warn('Could not draw hero photo', e);
    }
  }

  // 2) Dark gradient overlay on bottom ~45% for text readability
  const gradStart = H * 0.50;
  const grad = ctx.createLinearGradient(0, gradStart - 80, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.15, 'rgba(0,0,0,0.3)');
  grad.addColorStop(0.4, 'rgba(0,0,0,0.7)');
  grad.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, gradStart - 80, W, H - gradStart + 80);

  // 3) Red banner — overlaid in the transition area
  const bannerH = 58;
  const bannerY = H * 0.58;
  ctx.font = '800 34px "Segoe UI", Arial, sans-serif';
  const bannerTextW = ctx.measureText(bannerText.toUpperCase()).width;
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(0, bannerY, bannerTextW + 60, bannerH);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '3px';
  ctx.fillText(bannerText.toUpperCase(), 24, bannerY + bannerH / 2);
  ctx.letterSpacing = '0px';

  // 4) Specs bar — bordered row with address + specs
  const specBarH = 56;
  const specBarY = bannerY + bannerH + 10;

  // Border lines (thin white box)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(30, specBarY, W - 60, specBarH);

  // Specs text
  const livableArea = listing.totalStructureArea || listing.sqft || 0;
  const specsLine = `${listing.address.toUpperCase()}   ||   ${listing.beds} BEDS   |   ${listing.baths} BATHS   |   ${livableArea.toLocaleString()} SQ FT`;
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 21px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(specsLine, W / 2, specBarY + specBarH / 2);

  // 5) Bottom info — company, price, agent, phone, MLS
  const infoY = specBarY + specBarH + 24;
  const centerX = W / 2;

  // Company name
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 32px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('SELL FOR 1 PERCENT', centerX, infoY);

  // Price
  ctx.font = '700 48px "Segoe UI", Arial, sans-serif';
  ctx.fillText(formatListingPrice(listing.price), centerX, infoY + 40);

  // Agent name
  ctx.font = '600 26px "Segoe UI", Arial, sans-serif';
  ctx.fillText(listing.agent?.name || 'Agent', centerX, infoY + 100);

  // Phone
  if (agentPhone) {
    ctx.fillStyle = '#dddddd';
    ctx.font = '400 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText(agentPhone, centerX, infoY + 134);
  }

  // MLS number
  ctx.fillStyle = '#999999';
  ctx.font = '400 16px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`MLS# ${listing.mlsNumber}`, centerX, infoY + 168);

  // Logo bottom-left
  try {
    const logoImg = await loadImage(logoSrc);
    const lh = 50;
    const lw = (logoImg.naturalWidth / logoImg.naturalHeight) * lh;
    ctx.drawImage(logoImg, 28, H - lh - 18, lw, lh);
  } catch {}

  // Fair Housing logo bottom-right
  try {
    const fhImg = await loadImage(fairHousingSrc);
    const fhH = 36;
    const fhW = (fhImg.naturalWidth / fhImg.naturalHeight) * fhH;
    ctx.drawImage(fhImg, W - fhW - 28, H - fhH - 22, fhW, fhH);
  } catch {}

  return canvas.toDataURL('image/png');
}
