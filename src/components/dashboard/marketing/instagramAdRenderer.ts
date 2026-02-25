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

  // ---- Layout zones ----
  const heroH = 640;
  const specBarH = 70;
  const bottomH = H - heroH - specBarH;

  // 1) Dark background
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, W, H);

  // 2) Hero photo — fills top portion
  if (heroDataUrl) {
    try {
      const heroImg = await loadImage(heroDataUrl);
      drawCover(ctx, heroImg, 0, 0, W, heroH);
    } catch (e) {
      console.warn('Could not draw hero photo', e);
    }
  }

  // Subtle gradient at bottom of hero
  const heroGrad = ctx.createLinearGradient(0, heroH - 180, 0, heroH);
  heroGrad.addColorStop(0, 'rgba(0,0,0,0)');
  heroGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = heroGrad;
  ctx.fillRect(0, heroH - 180, W, 180);

  // 3) Red banner — overlaid at lower-left of hero
  const bannerH2 = 60;
  const bannerY = heroH - specBarH - bannerH2 - 20;
  ctx.font = '800 34px "Segoe UI", Arial, sans-serif';
  const bannerTextW = ctx.measureText(bannerText.toUpperCase()).width;
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(0, bannerY, bannerTextW + 60, bannerH2);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '3px';
  ctx.fillText(bannerText.toUpperCase(), 24, bannerY + bannerH2 / 2);
  ctx.letterSpacing = '0px';

  // 4) Specs bar — bordered row with address + specs
  const specBarY = heroH;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, specBarY, W, specBarH);

  // Border lines
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, specBarY + 8);
  ctx.lineTo(W - 30, specBarY + 8);
  ctx.moveTo(30, specBarY + specBarH - 8);
  ctx.lineTo(W - 30, specBarY + specBarH - 8);
  ctx.stroke();

  // Specs text
  const livableArea = listing.totalStructureArea || listing.sqft || 0;
  const specsLine = `${listing.address.toUpperCase()}   ||   ${listing.beds} BEDS   |   ${listing.baths} BATHS   |   ${livableArea.toLocaleString()} SQ FT`;
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 22px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(specsLine, W / 2, specBarY + specBarH / 2);

  // 5) Bottom info section
  const botY = specBarY + specBarH;

  const centerX = W / 2;
  const infoStartY = botY + 40;

  // Company name
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 36px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('SELL FOR 1 PERCENT', centerX, infoStartY);

  // Price
  ctx.font = '700 56px "Segoe UI", Arial, sans-serif';
  ctx.fillText(formatListingPrice(listing.price), centerX, infoStartY + 46);

  // Agent name + phone
  ctx.font = '600 28px "Segoe UI", Arial, sans-serif';
  const agentName = listing.agent?.name || 'Agent';
  ctx.fillText(agentName, centerX, infoStartY + 116);

  if (agentPhone) {
    ctx.fillStyle = '#dddddd';
    ctx.font = '400 26px "Segoe UI", Arial, sans-serif';
    ctx.fillText(agentPhone, centerX, infoStartY + 152);
  }

  // MLS number
  ctx.fillStyle = '#999999';
  ctx.font = '400 18px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`MLS# ${listing.mlsNumber}`, centerX, infoStartY + 192);

  // Logo bottom-left
  try {
    const logoImg = await loadImage(logoSrc);
    const lh = 55;
    const lw = (logoImg.naturalWidth / logoImg.naturalHeight) * lh;
    ctx.drawImage(logoImg, 30, botY + bottomH - lh - 20, lw, lh);
  } catch {}

  // Fair Housing logo bottom-right
  try {
    const fhImg = await loadImage(fairHousingSrc);
    const fhH = 40;
    const fhW = (fhImg.naturalWidth / fhImg.naturalHeight) * fhH;
    ctx.drawImage(fhImg, W - fhW - 30, botY + bottomH - fhH - 25, fhW, fhH);
  } catch {}

  return canvas.toDataURL('image/png');
}
