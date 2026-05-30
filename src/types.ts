export interface BicycleListing {
  id: string;
  title: string;
  description: string;
  url: string;
  source: 'dba.dk' | 'guloggratis.dk' | 'facebook' | 'manual';
  price: number; // in DKK
  brand: string;
  model: string;
  size: string; // e.g. "54 cm", "M", "56 cm"
  condition: string; // e.g. "Like New", "Good", "Fair", "Heavily Used"
  publishedAt: string;
  estimatedRetailNew: number; // in DKK
  score: number; // 0 - 100
  potentialMargin: number; // in DKK
  potentialMarginPercent: number; // Margin vs resell estimate or vs retail
  resellEstimate: number; // in DKK
  pros: string[];
  cons: string[];
  recommendation: string;
  isCustomScored?: boolean;
  region: 'Hovedstaden' | 'Sjælland' | 'Syddanmark' | 'Midtjylland' | 'Nordjylland';
  latitude: number;
  longitude: number;
  category: 'Road' | 'Gravel' | 'MTB' | 'Sports' | 'Other';
}

export interface BenchmarkPrice {
  id: string;
  brand: string;
  model: string;
  retailNewPrice: number; // in DKK
  liquidity: 'High' | 'Medium' | 'Low';
  idealSizes: string[];
  averageUsedPrice: number; // in DKK
  category: 'Road' | 'Gravel' | 'MTB' | 'City';
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  minMarginPercent: number;
  minScore: number;
}

export interface ScoringParams {
  brandFactor: number; // weight 0-10
  sizeFactor: number;  // weight 0-10
  conditionFactor: number; // weight 0-10
  priceRatioFactor: number; // weight 0-10
}
