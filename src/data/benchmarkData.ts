import { BenchmarkPrice } from '../types';

export const INITIAL_BENCHMARK_PRICES: BenchmarkPrice[] = [
  {
    id: 'b1',
    brand: 'Canyon',
    model: 'Grizl 7',
    retailNewPrice: 15499,
    liquidity: 'High',
    idealSizes: ['S', 'M', 'L', '54 cm', '56 cm'],
    averageUsedPrice: 10500,
    category: 'Gravel'
  },
  {
    id: 'b2',
    brand: 'Canyon',
    model: 'Endurace CF 7',
    retailNewPrice: 16990,
    liquidity: 'High',
    idealSizes: ['S', 'M', 'L', '54 cm', '56 cm'],
    averageUsedPrice: 11000,
    category: 'Road'
  },
  {
    id: 'b3',
    brand: 'Specialized',
    model: 'Tarmac SL7 Comp',
    retailNewPrice: 29999,
    liquidity: 'High',
    idealSizes: ['52 cm', '54 cm', '56 cm', '58 cm'],
    averageUsedPrice: 19500,
    category: 'Road'
  },
  {
    id: 'b4',
    brand: 'Specialized',
    model: 'Sirrus 2.0',
    retailNewPrice: 5999,
    liquidity: 'Medium',
    idealSizes: ['M', 'L', 'XL'],
    averageUsedPrice: 3200,
    category: 'City'
  },
  {
    id: 'b5',
    brand: 'Trek',
    model: 'Domane AL 4 Gen 4',
    retailNewPrice: 12499,
    liquidity: 'High',
    idealSizes: ['52 cm', '54 cm', '56 cm'],
    averageUsedPrice: 8000,
    category: 'Road'
  },
  {
    id: 'b6',
    brand: 'Trek',
    model: 'Marlin 7 Gen 3',
    retailNewPrice: 7499,
    liquidity: 'High',
    idealSizes: ['M', 'ML', 'L'],
    averageUsedPrice: 4500,
    category: 'MTB'
  },
  {
    id: 'b7',
    brand: 'Cervelo',
    model: 'Caledonia 105',
    retailNewPrice: 25999,
    liquidity: 'Medium',
    idealSizes: ['54 cm', '56 cm'],
    averageUsedPrice: 16500,
    category: 'Gravel'
  },
  {
    id: 'b8',
    brand: 'Giant',
    model: 'TCR Advanced Disc',
    retailNewPrice: 19499,
    liquidity: 'High',
    idealSizes: ['M', 'ML', 'L'],
    averageUsedPrice: 12000,
    category: 'Road'
  },
  {
    id: 'b9',
    brand: 'Scott',
    model: 'Speedster Gravel 30',
    retailNewPrice: 11999,
    liquidity: 'Medium',
    idealSizes: ['S', 'M', 'L'],
    averageUsedPrice: 7200,
    category: 'Gravel'
  },
  {
    id: 'b10',
    brand: 'Cannondale',
    model: 'Topstone 1',
    retailNewPrice: 16499,
    liquidity: 'High',
    idealSizes: ['S', 'M', 'L', '54 cm', '56 cm'],
    averageUsedPrice: 10500,
    category: 'Gravel'
  }
];

export function getEstimatedNewPrice(brand: string, model: string): number {
  const normBrand = brand.toLowerCase().trim();
  const normModel = model.toLowerCase().trim();

  // Try exact brand-model lookup
  const found = INITIAL_BENCHMARK_PRICES.find(
    (bp) =>
      bp.brand.toLowerCase() === normBrand &&
      (normModel.includes(bp.model.toLowerCase()) || bp.model.toLowerCase().includes(normModel))
  );

  if (found) return found.retailNewPrice;

  // Let's do fallback based on brand value tiers if unknown model
  if (['specialized', 'trek', 'cervelo', 'canyon', 'canyon', 'cannondale'].includes(normBrand)) {
    return 15000; // Premium mid tier average DKK
  }

  return 8000; // Normal tier average DKK
}
