import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { mockMarketingListings, formatListingPrice, MarketingListing } from '@/data/marketingListings';
import { flexmlsApi } from '@/lib/api/flexmls';
import ContactForm from '@/components/dashboard/marketing/ContactForm';
import PhotoGallery from '@/components/dashboard/marketing/PhotoGallery';
import {
  ArrowLeft, Bed, Bath, Maximize, Calendar, MapPin, Home, Share2, Heart,
  Thermometer, Wind, Car, Layers, DollarSign, GraduationCap, Droplets, Building,
  Ruler, Clock, FileText, Facebook, Instagram, Twitter, Megaphone, Sparkles, Youtube, Linkedin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import ListingToolPanel from '@/components/dashboard/marketing/ListingToolPanel';

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  contingent: 'bg-blue-100 text-blue-800 border-blue-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  sold: 'bg-red-100 text-red-800 border-red-200',
  draft: 'bg-muted text-muted-foreground border-border',
};

function safeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>);
    if (keys.length > 0) return keys.join(', ');
    return '';
  }
  return String(val);
}

const DetailRow = ({ label, value }: { label: string; value: unknown }) => {
  const display = safeString(value);
  if (!display || display === 'N/A' || display === '0') return null;
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{display}</span>
    </div>
  );
};

const DetailSection = ({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) => (
  <div className="bg-card rounded-lg p-5 border border-border">
    <h3 className="text-lg font-bold text-card-foreground mb-3 flex items-center gap-2">
      <Icon className="w-5 h-5 text-primary" />
      {title}
    </h3>
    {children}
  </div>
);

const TagList = ({ items }: { items?: string[] }) => {
  if (!items || items.length === 0) return <p className="text-sm text-muted-foreground">Not available</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="px-2.5 py-1 bg-secondary text-secondary-foreground text-xs rounded-full">
          {item}
        </span>
      ))}
    </div>
  );
};

function safeListing(raw: any): MarketingListing {
  return {
    id: raw.id || '',
    mlsNumber: raw.mlsNumber || '',
    address: raw.address || '',
    city: raw.city || '',
    state: raw.state || '',
    zip: raw.zip || '',
    county: raw.county || '',
    subdivision: raw.subdivision || '',
    price: raw.price || 0,
    beds: raw.beds || 0,
    baths: raw.baths || 0,
    bathsFull: raw.bathsFull || 0,
    bathsHalf: raw.bathsHalf || 0,
    sqft: raw.sqft || 0,
    lotSize: raw.lotSize || 'N/A',
    yearBuilt: raw.yearBuilt || 0,
    propertyType: raw.propertyType || 'Residential',
    propertySubType: raw.propertySubType || '',
    status: raw.status || 'active',
    description: raw.description || '',
    features: Array.isArray(raw.features) ? raw.features : [],
    photos: Array.isArray(raw.photos) ? raw.photos : [],
    agent: {
      name: raw.agent?.name || 'Agent',
      phone: raw.agent?.phone || '',
      email: raw.agent?.email || '',
      photo: raw.agent?.photo || '',
    },
    coordinates: { lat: raw.coordinates?.lat || 0, lng: raw.coordinates?.lng || 0 },
    published: raw.published || false,
    daysOnMarket: raw.daysOnMarket || 0,
    heating: Array.isArray(raw.heating) ? raw.heating : [],
    cooling: Array.isArray(raw.cooling) ? raw.cooling : [],
    parking: Array.isArray(raw.parking) ? raw.parking : [],
    garageSpaces: raw.garageSpaces || 0,
    flooring: Array.isArray(raw.flooring) ? raw.flooring : [],
    appliances: Array.isArray(raw.appliances) ? raw.appliances : [],
    basement: safeString(raw.basement),
    roof: safeString(raw.roof),
    constructionMaterials: Array.isArray(raw.constructionMaterials) ? raw.constructionMaterials : [],
    stories: typeof raw.stories === 'number' ? raw.stories : 0,
    taxAnnualAmount: raw.taxAnnualAmount || 0,
    taxYear: raw.taxYear || 0,
    hoaFee: raw.hoaFee || 0,
    hoaFrequency: raw.hoaFrequency || '',
    waterSource: Array.isArray(raw.waterSource) ? raw.waterSource : [],
    sewer: Array.isArray(raw.sewer) ? raw.sewer : [],
    schoolDistrict: raw.schoolDistrict || '',
    elementarySchool: raw.elementarySchool || '',
    middleSchool: raw.middleSchool || '',
    highSchool: raw.highSchool || '',
    listDate: raw.listDate || '',
    pricePerSqft: raw.pricePerSqft || 0,
  };
}

const isPublicSite = () => {
  const host = window.location.hostname;
  return host.startsWith('listings.');
};

const ListingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState<MarketingListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const isPublic = isPublicSite();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await flexmlsApi.fetchSingleListing(id || '');
      if (result.success && result.data) {
        setListing(safeListing(result.data));
      } else {
        const mock = mockMarketingListings.find(l => l.id === id);
        if (mock) {
          setListing(safeListing(mock));
        } else {
          setListing(null);
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Loading listing...</p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Listing Not Found</h1>
          <Button variant="link" onClick={() => navigate(isPublic ? '/' : '/dashboard?tab=marketing')}>{isPublic ? 'Back to Listings' : 'Back to Marketing'}</Button>
        </div>
      </div>
    );
  }

  const photos = listing.photos?.length > 0 ? listing.photos : [];
  const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;
  const lat = listing.coordinates?.lat;
  const lng = listing.coordinates?.lng;
  const mapEmbedUrl = lat && lng
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`
    : null;

  const sidebarItems = [
    { id: 'facebook', label: 'Facebook', icon: Facebook, group: 'social' },
    { id: 'instagram', label: 'Instagram', icon: Instagram, group: 'social' },
    { id: 'youtube', label: 'YouTube', icon: Youtube, group: 'social' },
    { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, group: 'social' },
    { id: 'twitter', label: 'X / Twitter', icon: Twitter, group: 'social' },
    { id: 'paid-ads', label: 'Paid Ads', icon: Megaphone, group: 'advertising' },
    { id: 'ai-suggestions', label: 'AI Suggestions', icon: Sparkles, group: 'ai' },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Sidebar - hidden on public site */}
      {!isPublic && (
        <aside className="w-56 bg-card border-r border-border flex-shrink-0 sticky top-0 h-screen overflow-y-auto hidden md:block">
          <div className="p-4">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground mb-4" onClick={() => navigate('/dashboard?tab=marketing')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Marketing
            </Button>

            <div className="mb-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Post to Social</p>
              {sidebarItems.filter(i => i.group === 'social').map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTool(activeTool === item.id ? null : item.id)}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
                    activeTool === item.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mb-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Advertising</p>
              {sidebarItems.filter(i => i.group === 'advertising').map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTool(activeTool === item.id ? null : item.id)}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
                    activeTool === item.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </button>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">AI Tools</p>
              {sidebarItems.filter(i => i.group === 'ai').map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTool(activeTool === item.id ? null : item.id)}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors ${
                    activeTool === item.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0">
      {/* Tool Panel Overlay - hidden on public site */}
      {!isPublic && activeTool && (
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border p-4">
          <ListingToolPanel platform={activeTool} listing={listing} autoGenerate={activeTool === 'ai-suggestions'} />
        </div>
      )}
      {/* Top bar */}
      <div className="bg-primary text-primary-foreground sticky top-0 z-50">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 md:hidden" onClick={() => navigate(isPublic ? '/' : '/dashboard?tab=marketing')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {isPublic ? 'Listings' : 'Back'}
          </Button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10">
              <Heart className="w-4 h-4 mr-1" /> Save
            </Button>
            <Button variant="ghost" size="sm" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10">
              <Share2 className="w-4 h-4 mr-1" /> Share
            </Button>
          </div>
        </div>
      </div>

      {/* Photo Gallery */}
      <PhotoGallery photos={photos} address={listing.address} />

      <main className="container mx-auto px-6 py-8">
        {/* Price + Address Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">{formatListingPrice(listing.price)}</h1>
              <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full border ${statusStyles[listing.status] || statusStyles.active}`}>
                {(listing.status || 'active').charAt(0).toUpperCase() + (listing.status || 'active').slice(1)}
              </span>
            </div>
            <p className="text-lg text-foreground font-medium flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-primary" />
              {fullAddress}
            </p>
            <div className="flex items-center gap-6 text-muted-foreground mt-3">
              <span className="flex items-center gap-1.5 text-base"><Bed className="w-5 h-5" /> <strong className="text-foreground">{listing.beds}</strong> bd</span>
              <span className="flex items-center gap-1.5 text-base"><Bath className="w-5 h-5" /> <strong className="text-foreground">{listing.baths}</strong> ba</span>
              {listing.bathsHalf ? <span className="text-base"><strong className="text-foreground">{listing.bathsHalf}</strong> half ba</span> : null}
              <span className="flex items-center gap-1.5 text-base"><Maximize className="w-5 h-5" /> <strong className="text-foreground">{(listing.sqft || 0).toLocaleString()}</strong> sqft</span>
              {listing.pricePerSqft ? <span className="text-sm text-muted-foreground">· ${listing.pricePerSqft}/sqft</span> : null}
            </div>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-sm text-muted-foreground flex items-center gap-1 justify-end"><Clock className="w-4 h-4" /> {listing.daysOnMarket} days on market</p>
            <p className="text-xs text-muted-foreground mt-1">MLS# {listing.mlsNumber}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <section>
              <h2 className="text-2xl font-bold text-foreground mb-3">About This Home</h2>
              <p className="text-muted-foreground leading-relaxed text-base whitespace-pre-line">{listing.description}</p>
              {listing.listDate && (
                <p className="text-xs text-muted-foreground mt-3">Listed on {new Date(listing.listDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              )}
            </section>

            <Separator />

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Facts & Features</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DetailSection icon={Home} title="Interior Details">
                  <DetailRow label="Bedrooms" value={listing.beds} />
                  <DetailRow label="Full Bathrooms" value={listing.bathsFull} />
                  <DetailRow label="Half Bathrooms" value={listing.bathsHalf} />
                  <DetailRow label="Total Sq Ft" value={(listing.sqft || 0).toLocaleString()} />
                  <DetailRow label="Stories" value={listing.stories} />
                  <DetailRow label="Basement" value={listing.basement} />
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Flooring</p>
                    <TagList items={listing.flooring} />
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Appliances</p>
                    <TagList items={listing.appliances} />
                  </div>
                </DetailSection>

                <DetailSection icon={Building} title="Building Details">
                  <DetailRow label="Property Type" value={listing.propertyType} />
                  <DetailRow label="Sub Type" value={listing.propertySubType} />
                  <DetailRow label="Year Built" value={listing.yearBuilt} />
                  <DetailRow label="Lot Size" value={listing.lotSize} />
                  <DetailRow label="Roof" value={listing.roof} />
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Construction</p>
                    <TagList items={listing.constructionMaterials} />
                  </div>
                </DetailSection>

                <DetailSection icon={Thermometer} title="Heating & Cooling">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Heating</p>
                      <TagList items={listing.heating} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Cooling</p>
                      <TagList items={listing.cooling} />
                    </div>
                  </div>
                </DetailSection>

                <DetailSection icon={Car} title="Parking">
                  <DetailRow label="Garage Spaces" value={listing.garageSpaces} />
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Parking Features</p>
                    <TagList items={listing.parking} />
                  </div>
                </DetailSection>

                <DetailSection icon={Droplets} title="Utilities">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Water Source</p>
                      <TagList items={listing.waterSource} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Sewer</p>
                      <TagList items={listing.sewer} />
                    </div>
                  </div>
                </DetailSection>

                <DetailSection icon={DollarSign} title="Financial">
                  <DetailRow label="Annual Taxes" value={listing.taxAnnualAmount ? `$${listing.taxAnnualAmount.toLocaleString()}` : undefined} />
                  <DetailRow label="Tax Year" value={listing.taxYear} />
                  <DetailRow label="HOA Fee" value={listing.hoaFee ? `$${listing.hoaFee}${listing.hoaFrequency ? ` / ${listing.hoaFrequency}` : ''}` : undefined} />
                  <DetailRow label="Price / Sq Ft" value={listing.pricePerSqft ? `$${listing.pricePerSqft}` : undefined} />
                </DetailSection>
              </div>
            </section>

            <Separator />

            {(listing.schoolDistrict || listing.elementarySchool || listing.middleSchool || listing.highSchool) && (
              <>
                <DetailSection icon={GraduationCap} title="Schools">
                  <DetailRow label="School District" value={listing.schoolDistrict} />
                  <DetailRow label="Elementary School" value={listing.elementarySchool} />
                  <DetailRow label="Middle School" value={listing.middleSchool} />
                  <DetailRow label="High School" value={listing.highSchool} />
                </DetailSection>
                <Separator />
              </>
            )}

            {listing.features.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">Features & Amenities</h2>
                <div className="flex flex-wrap gap-2">
                  {listing.features.map((feature) => (
                    <span key={feature} className="px-3 py-1.5 bg-secondary text-secondary-foreground text-sm rounded-full">
                      {feature}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <Separator />

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Location & Neighborhood</h2>
              {listing.subdivision && (
                <p className="text-sm text-muted-foreground mb-3">Subdivision: <span className="font-medium text-foreground">{listing.subdivision}</span></p>
              )}
              {listing.county && (
                <p className="text-sm text-muted-foreground mb-3">County: <span className="font-medium text-foreground">{listing.county}</span></p>
              )}
              {mapEmbedUrl ? (
                <div className="rounded-lg overflow-hidden border border-border h-80">
                  <iframe
                    src={mapEmbedUrl}
                    className="w-full h-full"
                    title={`Map of ${listing.address}`}
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border h-80 flex items-center justify-center bg-muted">
                  <p className="text-muted-foreground">Map not available</p>
                </div>
              )}
            </section>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Agent Card */}
            <div className="bg-card rounded-lg p-5 border border-border sticky top-20">
              <h3 className="text-lg font-bold text-card-foreground mb-1">Listed by</h3>
              <p className="text-foreground font-medium">{listing.agent.name}</p>
              {(() => {
                const agentPhoneMap: Record<string, string> = {
                  'David E Barlow': '614-778-6616',
                  'Jaysen E Barlow': '614-579-1442',
                  'Jaime Barlow': '614-493-8541',
                };
                const phone = (listing.agent.phone && !/^\*+$/.test(listing.agent.phone))
                  ? listing.agent.phone
                  : agentPhoneMap[listing.agent.name] || '';
                return phone ? (
                  <a href={`tel:${phone}`} className="text-sm text-primary hover:underline block mt-1">
                    {phone}
                  </a>
                ) : null;
              })()}
              {listing.agent.email && (
                <a href={`mailto:${listing.agent.email}`} className="text-sm text-primary hover:underline block mt-1">
                  {listing.agent.email}
                </a>
              )}
              <Separator className="my-4" />
              <ContactForm address={listing.address} agentName={listing.agent.name} />
            </div>
          </div>
        </div>
      </main>
      </div>{/* end flex-1 */}
    </div>
  );
};

export default ListingDetail;
