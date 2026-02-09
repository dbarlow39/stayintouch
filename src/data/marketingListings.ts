export interface MarketingListing {
  id: string;
  mlsNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  subdivision?: string;
  price: number;
  beds: number;
  baths: number;
  bathsFull?: number;
  bathsHalf?: number;
  sqft: number;
  lotSize: string;
  yearBuilt: number;
  propertyType: string;
  propertySubType?: string;
  status: 'active' | 'pending' | 'sold' | 'draft' | 'contingent';
  description: string;
  features: string[];
  photos: string[];
  agent: {
    name: string;
    phone: string;
    email: string;
    photo: string;
  };
  coordinates: { lat: number; lng: number };
  published: boolean;
  daysOnMarket: number;
  heating?: string[];
  cooling?: string[];
  parking?: string[];
  garageSpaces?: number;
  flooring?: string[];
  appliances?: string[];
  basement?: string;
  roof?: string;
  constructionMaterials?: string[];
  stories?: number;
  taxAnnualAmount?: number;
  taxYear?: number;
  hoaFee?: number;
  hoaFrequency?: string;
  listingTerms?: string[];
  waterSource?: string[];
  sewer?: string[];
  schoolDistrict?: string;
  elementarySchool?: string;
  middleSchool?: string;
  highSchool?: string;
  listDate?: string;
  pricePerSqft?: number;
}

export const mockMarketingListings: MarketingListing[] = [
  {
    id: '1',
    mlsNumber: 'CBR-224501',
    address: '4821 Muirfield Village Dr',
    city: 'Dublin',
    state: 'OH',
    zip: '43017',
    price: 895000,
    beds: 5,
    baths: 4,
    sqft: 4200,
    lotSize: '0.65 acres',
    yearBuilt: 2018,
    propertyType: 'Single Family',
    status: 'active',
    description: 'Stunning contemporary home in prestigious Muirfield Village. This exquisite residence features soaring ceilings, a gourmet kitchen with premium appliances, and a luxurious primary suite.',
    features: ['Heated Pool', 'Gourmet Kitchen', 'Home Theater', '3-Car Garage', 'Smart Home', 'Wine Cellar'],
    photos: [],
    agent: { name: 'Sarah Mitchell', phone: '(614) 555-0142', email: 'sarah@realty.com', photo: '' },
    coordinates: { lat: 40.0992, lng: -83.1538 },
    published: true,
    daysOnMarket: 12,
  },
  {
    id: '2',
    mlsNumber: 'CBR-224502',
    address: '1287 German Village Way',
    city: 'Columbus',
    state: 'OH',
    zip: '43206',
    price: 475000,
    beds: 3,
    baths: 2,
    sqft: 2100,
    lotSize: '0.15 acres',
    yearBuilt: 1895,
    propertyType: 'Single Family',
    status: 'active',
    description: 'Beautifully restored brick home in the heart of German Village. Original hardwood floors, exposed brick walls, and modern updates throughout.',
    features: ['Exposed Brick', 'Hardwood Floors', 'Updated Kitchen', 'Fenced Yard', 'Walk to Shops', 'Original Details'],
    photos: [],
    agent: { name: 'Sarah Mitchell', phone: '(614) 555-0142', email: 'sarah@realty.com', photo: '' },
    coordinates: { lat: 39.9480, lng: -82.9930 },
    published: true,
    daysOnMarket: 5,
  },
  {
    id: '3',
    mlsNumber: 'CBR-224503',
    address: '9950 Scioto Reserve Blvd',
    city: 'Powell',
    state: 'OH',
    zip: '43065',
    price: 1250000,
    beds: 6,
    baths: 5,
    sqft: 6800,
    lotSize: '1.2 acres',
    yearBuilt: 2021,
    propertyType: 'Single Family',
    status: 'active',
    description: 'Magnificent estate in Scioto Reserve. This architectural masterpiece offers grand entertaining spaces, a resort-style backyard, and every luxury amenity imaginable.',
    features: ['Resort Pool', 'Guest Suite', 'Home Office', '4-Car Garage', 'Elevator', 'Sport Court'],
    photos: [],
    agent: { name: 'James Crawford', phone: '(614) 555-0198', email: 'james@realty.com', photo: '' },
    coordinates: { lat: 40.1750, lng: -83.0900 },
    published: false,
    daysOnMarket: 0,
  },
];

export const formatListingPrice = (price: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
