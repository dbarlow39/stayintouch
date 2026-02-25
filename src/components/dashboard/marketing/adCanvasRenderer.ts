import logoSrc from '@/assets/logo.jpg';
import fairHousingSrc from '@/assets/equal-housing-white.png';
import { MarketingListing, formatListingPrice } from '@/data/marketingListings';

const W = 1200;
const H = 630;
const SCALE = 2; // render at 2400×1260 for crisp output

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (imgRatio > boxRatio) {
    sw = img.naturalHeight * boxRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / boxRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export interface RenderOptions {
  listing: MarketingListing;
  bannerText: string;
  heroDataUrl: string | null;
  agentPhone: string;
}

export async function renderAdCanvas(opts: RenderOptions): Promise<string> {
  const { listing, bannerText, heroDataUrl, agentPhone } = opts;
  const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Hero photo
  if (heroDataUrl) {
    try {
      const heroImg = await loadImage(heroDataUrl);
      drawCover(ctx, heroImg, 0, 0, W, H);
    } catch (e) {
      console.warn('Could not draw hero photo', e);
    }
  }

  // Gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0.05)');
  grad.addColorStop(0.4, 'rgba(0,0,0,0.1)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.65)');
  grad.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Red banner
  const bannerH = 70;
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(0, 0, W, bannerH);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 36px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '5px';
  ctx.fillText(bannerText.toUpperCase(), W / 2, bannerH / 2);
  ctx.letterSpacing = '0px';

  // Logo in banner
  try {
    const logoImg = await loadImage(logoSrc);
    const logoH = 44;
    const logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH;
    ctx.drawImage(logoImg, W - logoW - 20, (bannerH - logoH) / 2, logoW, logoH);
  } catch {}

  // --- Bottom section ---
  const bottomPad = 36;
  let curY = H;

  // Agent bar
  const agentBarH = 56;
  curY -= 20; // bottom margin
  curY -= agentBarH;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, bottomPad, curY, W - bottomPad * 2, agentBarH, 8);
  ctx.fill();

  // Agent logo + name
  try {
    const logoImg = await loadImage(logoSrc);
    const lh = 36;
    const lw = (logoImg.naturalWidth / logoImg.naturalHeight) * lh;
    ctx.drawImage(logoImg, bottomPad + 14, curY + (agentBarH - lh) / 2, lw, lh);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText(listing.agent?.name || 'Agent', bottomPad + 14 + lw + 12, curY + agentBarH / 2 - 9);
    ctx.fillStyle = '#bbbbbb';
    ctx.font = '400 15px "Segoe UI", Arial, sans-serif';
    ctx.fillText(agentPhone, bottomPad + 14 + lw + 12, curY + agentBarH / 2 + 11);
  } catch {}

  // MLS number + Fair Housing logo
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cccccc';
  ctx.font = '400 15px "Segoe UI", Arial, sans-serif';
  const mlsText = `MLS# ${listing.mlsNumber}`;
  const mlsTextWidth = ctx.measureText(mlsText).width;
  ctx.fillText(mlsText, W - bottomPad - 14, curY + agentBarH / 2);

  // Fair Housing logo to the left of MLS#
  try {
    const fhImg = await loadImage(fairHousingSrc);
    const fhH = 30;
    const fhW = (fhImg.naturalWidth / fhImg.naturalHeight) * fhH;
    const fhX = W - bottomPad - 14 - mlsTextWidth - 10 - fhW;
    const fhY = curY + (agentBarH - fhH) / 2;
    ctx.drawImage(fhImg, fhX, fhY, fhW, fhH);
  } catch {}

  // Specs row
  curY -= 14; // gap
  const specsY = curY;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 29px "Segoe UI", Arial, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  const livableArea = listing.totalStructureArea || listing.sqft || 0;
  const specsText = `${listing.beds} Beds    ${listing.baths} Baths    ${livableArea.toLocaleString()} Sq Ft`;
  ctx.fillText(specsText, bottomPad, specsY);

  // Address
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  curY = specsY - 16;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#e0e0e0';
  ctx.font = '600 32px "Segoe UI", Arial, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.fillText(fullAddress, bottomPad, curY);

  // Price
  curY -= 32;
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 69px "Segoe UI", Arial, sans-serif';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillText(formatListingPrice(listing.price), bottomPad, curY);

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  return canvas.toDataURL('image/png');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export { loadImage, drawCover };
