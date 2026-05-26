import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { INITIAL_BENCHMARK_PRICES, getEstimatedNewPrice } from './src/data/benchmarkData.js';
import { BicycleListing, BenchmarkPrice, TelegramConfig, ScoringParams } from './src/types';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Active state in memory
let benchmarkPrices: BenchmarkPrice[] = [...INITIAL_BENCHMARK_PRICES];

// Initial preloaded listings simulated from dba.dk & guloggratis.dk
let mockListings: BicycleListing[] = [
  {
    id: 'l1',
    title: 'Specialized Tarmac SL7 Comp 56cm',
    description: 'Sælger min trofaste Specialized racercykel. Fremstår i super flot stand, kun kørt omkring 1200 km. Monteret med Shimano Ultegra. Sælges pga. manglende tid. Nypris var 30.000 kr. Kvittering dertil haves.',
    url: 'https://www.dba.dk/herrecykel-specialized-tarmac/id-109312389/',
    source: 'dba.dk',
    price: 16500,
    brand: 'Specialized',
    model: 'Tarmac SL7 Comp',
    size: '56 cm',
    condition: 'Like New',
    publishedAt: '25 mins ago',
    estimatedRetailNew: 29999,
    score: 87,
    resellEstimate: 21000,
    potentialMargin: 4500,
    potentialMarginPercent: 27,
    pros: ['Kort kørt distance (1200 km)', 'Populær og likvid størrelse 56', 'Original kvittering haves'],
    cons: ['Højere kapitalbinding', 'Standard dæk bør opgraderes'],
    recommendation: 'Køb straks! Tarmac SL7 i størrelse 56 er ekstremt likvid på det danske marked. Kan nemt shines op og videresælges for 21.000 DKK.',
    region: 'Hovedstaden',
    latitude: 55.6761,
    longitude: 12.5683
  },
  {
    id: 'l2',
    title: 'Canyon Grizl 7 Gravel AL',
    description: 'Super fed gravelcykel kværn. Str Medium. Har lidt ridser på overrøret efter en taske, ellers perfekt mekanisk. Shimano GRX 2x11 geargruppe. Købt i 2023. Fast pris.',
    url: 'https://www.guloggratis.dk/sport/cykler/gravel/annonce/canyon-grizl-7/',
    source: 'guloggratis.dk',
    price: 8500,
    brand: 'Canyon',
    model: 'Grizl 7',
    size: 'M',
    condition: 'Good',
    publishedAt: '2 hours ago',
    estimatedRetailNew: 15499,
    score: 82,
    resellEstimate: 11500,
    potentialMargin: 3000,
    potentialMarginPercent: 35,
    pros: ['Ekstremt populær gravel variant', 'Mekanisk i perfekt stand', 'Hurtig salgspotentiale'],
    cons: ['Kosmetisk ridse på overrør', 'Fast pris giver intet forhandlingsrum'],
    recommendation: 'Stærkt videresalg. Canyon Grizl is in constant high demand. Prisen på 8.500 kr efterlader god margin op til videresalgsprisen på ca. 11.500 kr.',
    region: 'Sjælland',
    latitude: 55.6419,
    longitude: 12.0878
  },
  {
    id: 'l3',
    title: 'Trek Domane AL 4 str. 54',
    description: 'Flot og velholdt Trek landevejscykel sælges. Størrelse 54 ideel til 172-180cm. Monteret med Shimano Tiagra. Lettere ridset bremsegreb efter et lille fald, men fungerer perfekt. Ny kæde og kassette monteret for 100km siden.',
    url: 'https://www.dba.dk/trek-domane-al-4-str-54/id-98124933/',
    source: 'dba.dk',
    price: 5200,
    brand: 'Trek',
    model: 'Domane AL 4 Gen 4',
    size: '54 cm',
    condition: 'Good',
    publishedAt: '4 hours ago',
    estimatedRetailNew: 12499,
    score: 91,
    resellEstimate: 8500,
    potentialMargin: 3300,
    potentialMarginPercent: 63,
    pros: ['Nyligt skiftet kæde og kassette', 'Perfekt begyndercykel (stor køberbase)', 'Høj efterspørgsel på str 54'],
    cons: ['Lettere slitage på bremsegreb', 'Saddle har et lille hul'],
    recommendation: 'Fremragende flip-emne! Lav indkøbspris (5.200 DKK) giver høj margin (63%). Minimal reparation påkrævet.',
    region: 'Syddanmark',
    latitude: 55.4038,
    longitude: 10.4024
  },
  {
    id: 'l4',
    title: 'Specialized Sirrus pendlercykel',
    description: 'Slidt herrecykel. Skal have ny kæde og bremsejustering. Gear fungerer fint. Trænger generelt til en kærlig hånd. Købes som beset. Str L',
    url: 'https://www.dba.dk/specialized-sirrus-str-l/id-19253488/',
    source: 'dba.dk',
    price: 1300,
    brand: 'Specialized',
    model: 'Sirrus 2.0',
    size: 'L',
    condition: 'Needs Service',
    publishedAt: '6 hours ago',
    estimatedRetailNew: 5999,
    score: 74,
    resellEstimate: 3200,
    potentialMargin: 1900,
    potentialMarginPercent: 146,
    pros: ['Meget lav kapitalbinding', 'Høj procentvis fortjeneste (146%)'],
    cons: ['Bremser og drivlinje kræver arbejdskraft', 'Mindre likvidt mærke til herrebrug i denne klasse'],
    recommendation: 'Godt vinterprojekt. Hvis du selv kan skifte kæde og justere bremser for 300 kr i dele, vinder du 1500 kr i rent afkast.',
    region: 'Midtjylland',
    latitude: 56.1567,
    longitude: 10.2108
  },
  {
    id: 'l5',
    title: 'Cervelo Caledonia landevejscykel',
    description: 'Cervelo Caledonia Roadbike. Str 56. Shimano 105. Fremstår som ny uden brugsspor. Kvittering fra Cykelexperten medfølger. Nypris 26.000 dkk.',
    url: 'https://www.guloggratis.dk/cervelo-caledonia/annonce-id84913/',
    source: 'guloggratis.dk',
    price: 18000,
    brand: 'Cervelo',
    model: 'Caledonia 105',
    size: '56 cm',
    condition: 'Like New',
    publishedAt: '12 hours ago',
    estimatedRetailNew: 25999,
    score: 65,
    resellEstimate: 19500,
    potentialMargin: 1500,
    potentialMarginPercent: 8,
    pros: ['Luksus cykel i absolut topstand', 'Original kvittering medfølger'],
    cons: ['Meget høj indkøbspris', 'Lav relativ margin (8%) understøtter ikke risikoen'],
    recommendation: 'Undgå til flip. Kun velegnet hvis du ønsker at beholde cyklen personligt. Marginen er for snæver.',
    region: 'Nordjylland',
    latitude: 57.0488,
    longitude: 9.9217
  }
];

// In-Memory active user settings
let scoringParams: ScoringParams = {
  brandFactor: 8,
  sizeFactor: 9,
  conditionFactor: 7,
  priceRatioFactor: 10
};

let telegramConfig: TelegramConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
  minMarginPercent: 30,
  minScore: 75
};

// Internal Telegram log simulations
let telegramLogs: string[] = [
  '[System] Bot service registered successfully 2026-05-25.',
  '[System] Awaiting webhook triggers.'
];

// Helper to calculate score using customizable parameters
function calculateCustomScore(
  askingPrice: number,
  retailNewPrice: number,
  brand: string,
  size: string,
  condition: string
): { score: number; resellEstimate: number; potentialMargin: number; potentialMarginPercent: number } {
  
  // 1. Ratio Score (Asking Price compared to New Retail)
  // Higher ratio is worse. If asking price is 40% of new retail, score is high.
  const priceRatio = askingPrice / retailNewPrice;
  let priceRatioScore = 100;
  if (priceRatio < 0.3) priceRatioScore = 100; // amazing deal
  else if (priceRatio > 0.8) priceRatioScore = 20; // bad deal
  else {
    priceRatioScore = Math.round(100 - (priceRatio - 0.3) * 160);
  }
  priceRatioScore = Math.max(0, Math.min(100, priceRatioScore));

  // 2. Brand weight (Liquid brands Trek, Canyon, Specialized get premium)
  const normBrand = brand.toLowerCase().trim();
  let brandScore = 50;
  if (['specialized', 'trek', 'canyon', 'cervelo', 'cannondale'].includes(normBrand)) {
    brandScore = 95;
  } else if (['giant', 'scott', 'bianchi', 'pinarello'].includes(normBrand)) {
    brandScore = 80;
  } else if (['kildemoes', 'centurion', 'mbk', 'cube'].includes(normBrand)) {
    brandScore = 60;
  }

  // 3. Size weight (Common sizes seller faster: 52, 54, 56, 58, S, M, L)
  const normSize = size.toLowerCase().trim().replace(/\s+/g, '');
  let sizeScore = 50;
  if (['54', '54cm', '56', '56cm', 'm', 'l'].some(s => normSize.includes(s))) {
    sizeScore = 100;
  } else if (['52', '52cm', '58', '58cm', 's'].some(s => normSize.includes(s))) {
    sizeScore = 85;
  } else if (['60', '60cm', 'xs', 'xl', 'xxl'].some(s => normSize.includes(s))) {
    sizeScore = 60;
  }

  // 4. Condition weight
  let conditionScore = 50;
  const normCond = condition.toLowerCase().trim();
  if (normCond.includes('new') || normCond.includes('perfekt') || normCond.includes('som ny')) {
    conditionScore = 95;
  } else if (normCond.includes('good') || normCond.includes('velholdt') || normCond.includes('lidt brugt')) {
    conditionScore = 80;
  } else if (normCond.includes('fair') || normCond.includes('brugt')) {
    conditionScore = 60;
  } else if (normCond.includes('service') || normCond.includes('slidt') || normCond.includes('kærlig')) {
    conditionScore = 40;
  }

  // Weighted Combination
  const totalWeight =
    scoringParams.brandFactor +
    scoringParams.sizeFactor +
    scoringParams.conditionFactor +
    scoringParams.priceRatioFactor;

  const score = Math.round(
    (brandScore * scoringParams.brandFactor +
      sizeScore * scoringParams.sizeFactor +
      conditionScore * scoringParams.conditionFactor +
      priceRatioScore * scoringParams.priceRatioFactor) /
      totalWeight
  );

  // Reasonable Resell value is around 60% of Retail New for 'Like New', 50% for 'Good', 40% for 'Fair', 25% for 'Needs Service'
  let resellMultiplier = 0.5;
  if (normCond.includes('new') || normCond.includes('som ny')) resellMultiplier = 0.65;
  else if (normCond.includes('good') || normCond.includes('velholdt')) resellMultiplier = 0.52;
  else if (normCond.includes('fair') || normCond.includes('brugt')) resellMultiplier = 0.40;
  else resellMultiplier = 0.28;

  const resellEstimate = Math.round(retailNewPrice * resellMultiplier);
  const potentialMargin = Math.round(resellEstimate - askingPrice);
  const potentialMarginPercent = askingPrice > 0 ? Math.round((potentialMargin / askingPrice) * 100) : 0;

  return {
    score,
    resellEstimate,
    potentialMargin,
    potentialMarginPercent
  };
}

// ----------------- API ENDPOINTS -----------------

// 1. Get List simulated listings
app.get('/api/listings-feed', (req: Request, res: Response) => {
  // Always recalculate interactive score based on the current adjustable configurations so changes apply in real-time
  const activeFeed = mockListings.map(listing => {
    const calc = calculateCustomScore(
      listing.price,
      listing.estimatedRetailNew,
      listing.brand,
      listing.size,
      listing.condition
    );
    return {
      ...listing,
      score: calc.score,
      resellEstimate: calc.resellEstimate,
      potentialMargin: calc.potentialMargin,
      potentialMarginPercent: calc.potentialMarginPercent
    };
  });
  res.json({ success: true, listings: activeFeed });
});

// Delete or ignore listing from the feed
app.delete('/api/listings-feed/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  mockListings = mockListings.filter(l => l.id !== id);
  res.json({ success: true, message: 'Listing ignored successfully' });
});

// 2. Get Benchmarks
app.get('/api/benchmarks', (req: Request, res: Response) => {
  res.json({ success: true, benchmarks: benchmarkPrices });
});

// Create new Benchmark
app.post('/api/benchmarks', (req: Request, res: Response) => {
  const { brand, model, retailNewPrice, liquidity, idealSizes, category } = req.body;
  if (!brand || !model || !retailNewPrice) {
    return res.status(400).json({ success: false, error: 'Brand, Model and Retail Price are required' });
  }

  const newBenchmark: BenchmarkPrice = {
    id: `b${Date.now()}`,
    brand,
    model,
    retailNewPrice: Number(retailNewPrice),
    liquidity: liquidity || 'Medium',
    idealSizes: Array.isArray(idealSizes) ? idealSizes : ['M', 'L', '54 cm', '56 cm'],
    averageUsedPrice: Math.round(Number(retailNewPrice) * 0.55),
    category: category || 'Road'
  };

  benchmarkPrices.unshift(newBenchmark);
  res.json({ success: true, benchmark: newBenchmark });
});

// Remove Benchmark
app.delete('/api/benchmarks/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  benchmarkPrices = benchmarkPrices.filter(b => b.id !== id);
  res.json({ success: true });
});

// 3. Update Custom Scoring Parameters
app.get('/api/scoring-params', (req: Request, res: Response) => {
  res.json({ success: true, params: scoringParams });
});

app.post('/api/scoring-params', (req: Request, res: Response) => {
  const { brandFactor, sizeFactor, conditionFactor, priceRatioFactor } = req.body;
  scoringParams = {
    brandFactor: Math.max(0, Math.min(10, Number(brandFactor))),
    sizeFactor: Math.max(0, Math.min(10, Number(sizeFactor))),
    conditionFactor: Math.max(0, Math.min(10, Number(conditionFactor))),
    priceRatioFactor: Math.max(0, Math.min(10, Number(priceRatioFactor)))
  };
  res.json({ success: true, message: 'Weights updated successfully', params: scoringParams });
});

// 4. Gemini and Heuristic Copy-Paste Listing Analyzer
app.post('/api/analyze-listing', async (req: Request, res: Response) => {
  const { textContent, sourceUrl } = req.body;

  if (!textContent || textContent.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Please enter bicycle listing description text' });
  }

  // Keep track of whether we used AI or heuristic
  let isAiUsed = false;
  let parsedJson: any = null;

  // Let's check environment for Gemini API Key
  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `You are a professional cycling appraiser of the Danish bicycle marketplace. 
Analyze the following copy-pasted ad text (likely in Danish) from websites like dba.dk or guloggratis.dk. 

Ad text to analyze:
"""
${textContent}
"""

Follow these instructions strictly:
1. Translate and identify key attributes: Brand, model, frame size, structural condition.
2. Estimate the brand-new original retail price in DKK (Danish Krone) (original estimated retail value if bought from dealer) and potential used resell estimate in DKK on the Danish marketplace.
3. Identify exactly 2-3 PROs and exactly 1-2 CONs of flipping this bike based on the text.
4. Issue a clear 1-2 sentence recommendation for a flipping entrepreneur.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "brand": "extracted brand (e.g., Specialized, Trek, Canyon)",
  "model": "extracted model name",
  "size": "extracted size e.g. 54 cm, 56 cm, M, L",
  "condition": "Must be exactly one of: 'Like New', 'Good', 'Fair', 'Needs Service'",
  "askingPrice": number indicating the asking price extracted from the text in DKK (default 0 if not found),
  "estimatedRetailNew": number indicating best guess of original new price in DKK (e.g. 15000),
  "resellEstimate": number indicating potential resell target in DKK (typically 50-70% of new),
  "pros": ["array of strings"],
  "cons": ["array of strings"],
  "recommendation": "1-2 sentences recommendation"
}`,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const text = response.text || '';
      parsedJson = JSON.parse(text.trim());
      isAiUsed = true;
    } catch (aiError) {
      console.error('Gemini API query failed, falling back to heuristic:', aiError);
    }
  }

  // Fallback heuristic if Gemini isn't available or errored
  if (!isAiUsed) {
    // Basic heuristics
    const lowerText = textContent.toLowerCase();
    
    // Brand detection
    let brand = 'Other Brand';
    if (lowerText.includes('specialized')) brand = 'Specialized';
    else if (lowerText.includes('trek')) brand = 'Trek';
    else if (lowerText.includes('canyon')) brand = 'Canyon';
    else if (lowerText.includes('giant')) brand = 'Giant';
    else if (lowerText.includes('scott')) brand = 'Scott';
    else if (lowerText.includes('cannondale')) brand = 'Cannondale';
    else if (lowerText.includes('cervelo')) brand = 'Cervelo';

    // Model detection basic guesswork
    let model = 'Road/Gravel Spec';
    const models = ['tarmac', 'grizl', 'endurace', 'domane', 'marlin', 'sirrus', 'topstone', 'caledonia'];
    for (const m of models) {
      if (lowerText.includes(m)) {
        model = m.charAt(0).toUpperCase() + m.slice(1);
        break;
      }
    }

    // Size detection e.g. "str. 54" "str 56" "size M"
    let size = 'M';
    const sizeMatches = textContent.match(/(str|str\.|size|størrelse)\s*([5][24680]|m|l|s|xl)/i);
    if (sizeMatches && sizeMatches[2]) {
      size = sizeMatches[2].trim().toUpperCase();
      if (!isNaN(Number(size))) size = size + ' cm';
    } else {
      // Look for standalone numbers
      const standMatch = textContent.match(/\b(52|54|56|58)\b/);
      if (standMatch) size = standMatch[1] + ' cm';
    }

    // Condition heuristic
    let condition = 'Good';
    if (lowerText.includes('perfekt') || lowerText.includes('som ny') || lowerText.includes('ubrugt') || lowerText.includes('like new')) {
      condition = 'Like New';
    } else if (lowerText.includes('slidt') || lowerText.includes('kærlig') || lowerText.includes('needs service') || lowerText.includes('repareres')) {
      condition = 'Needs Service';
    } else if (lowerText.includes('ridser') || lowerText.includes('lidt rust') || lowerText.includes('fair')) {
      condition = 'Fair';
    }

    // Asking price search
    let askingPrice = 3500;
    const priceMatch = textContent.match(/(pris|sælges til|kr\.|dkk|kr)\s*([0-9]{1,3}[.,]?[0-9]{3})/i);
    if (priceMatch && priceMatch[2]) {
      askingPrice = parseInt(priceMatch[2].replace(/[.,]/g, ''));
    } else {
      // Simple digit scanning
      const digits = textContent.match(/\b([1-9][0-9]{2,4})\b/);
      if (digits) askingPrice = parseInt(digits[1]);
    }

    // Get retail lookups
    const estimatedRetailNew = getEstimatedNewPrice(brand, model);

    // Calculate resell & stats
    const resellMultiplier = condition === 'Like New' ? 0.65 : condition === 'Good' ? 0.52 : condition === 'Fair' ? 0.4 : 0.28;
    const resellEstimate = Math.round(estimatedRetailNew * resellMultiplier);

    // Create realistic pros & cons heuristically
    const pros: string[] = ['Populært mærke med stabilt brugtmarked'];
    if (['54 cm', '56 cm', 'M'.toLowerCase()].includes(size.toLowerCase())) {
      pros.push('Likvid genkendelig rammestørrelse');
    }
    if (condition === 'Like New') {
      pros.push('Minimal kosmetisk klargøring påkrævet');
    }

    const cons: string[] = [];
    if (condition === 'Needs Service') {
      cons.push('Kræver mekanisk gennemsyn og merværdi-reparation');
    } else {
      cons.push('Sælger fastsætter ofte prisen højt i første uger');
    }

    const recommendation = `Heuristisk vurdering: Godt mærke (${brand}). Pris på ${askingPrice} DKK virker fornuftig, og efterlader råderum mod videresalg ${resellEstimate} DKK.`;

    parsedJson = {
      brand,
      model,
      size,
      condition,
      askingPrice,
      estimatedRetailNew,
      resellEstimate,
      pros,
      cons,
      recommendation
    };
  }

  // Recalculate scoring based on current parameter configurations in dashboard
  const stats = calculateCustomScore(
    parsedJson.askingPrice || 3000,
    parsedJson.estimatedRetailNew || 10000,
    parsedJson.brand,
    parsedJson.size,
    parsedJson.condition
  );

  // Detect region based on content text heuristics
  let region: 'Hovedstaden' | 'Sjælland' | 'Syddanmark' | 'Midtjylland' | 'Nordjylland' = 'Hovedstaden';
  let latitude = 55.6761;
  let longitude = 12.5683;

  const textLower = textContent.toLowerCase();
  if (textLower.includes('aarhus') || textLower.includes('randers') || textLower.includes('horsens') || textLower.includes('midtjylland') || textLower.includes('silkeborg') || textLower.includes('viborg')) {
    region = 'Midtjylland';
    latitude = 56.1567 + (Math.random() - 0.5) * 0.15;
    longitude = 10.2108 + (Math.random() - 0.5) * 0.15;
  } else if (textLower.includes('odense') || textLower.includes('esbjerg') || textLower.includes('kolding') || textLower.includes('vejle') || textLower.includes('fyn') || textLower.includes('sønderjylland') || textLower.includes('syddanmark')) {
    region = 'Syddanmark';
    latitude = 55.4038 + (Math.random() - 0.5) * 0.15;
    longitude = 10.4024 + (Math.random() - 0.5) * 0.15;
  } else if (textLower.includes('aalborg') || textLower.includes('hjørring') || textLower.includes('frederikshavn') || textLower.includes('nordjylland') || textLower.includes('thy')) {
    region = 'Nordjylland';
    latitude = 57.0488 + (Math.random() - 0.5) * 0.15;
    longitude = 9.9217 + (Math.random() - 0.5) * 0.15;
  } else if (textLower.includes('roskilde') || textLower.includes('slagelse') || textLower.includes('næstved') || textLower.includes('køge') || textLower.includes('sjælland')) {
    region = 'Sjælland';
    latitude = 55.6419 + (Math.random() - 0.5) * 0.15;
    longitude = 12.0878 + (Math.random() - 0.5) * 0.15;
  } else {
    latitude = 55.6761 + (Math.random() - 0.5) * 0.15;
    longitude = 12.5683 + (Math.random() - 0.5) * 0.15;
  }

  const finalListing: BicycleListing = {
    id: `custom_${Date.now()}`,
    title: parsedJson.brand + ' ' + parsedJson.model + ' ' + parsedJson.size,
    description: textContent,
    url: sourceUrl || 'https://www.dba.dk/herrecykel/custom',
    source: 'manual',
    price: parsedJson.askingPrice || 3000,
    brand: parsedJson.brand,
    model: parsedJson.model,
    size: parsedJson.size,
    condition: parsedJson.condition,
    publishedAt: 'Lige nu (Analyseret)',
    estimatedRetailNew: parsedJson.estimatedRetailNew || 10000,
    score: stats.score,
    resellEstimate: stats.resellEstimate,
    potentialMargin: stats.potentialMargin,
    potentialMarginPercent: stats.potentialMarginPercent,
    pros: parsedJson.pros || ['Fornuftigt emne'],
    cons: parsedJson.cons || ['Standard brugsspor'],
    recommendation: parsedJson.recommendation || 'Potentiale til stede',
    isCustomScored: true,
    region,
    latitude,
    longitude
  };

  // Prepend to feed
  mockListings.unshift(finalListing);

  res.json({
    success: true,
    listing: finalListing,
    isAiUsed
  });
});

// 5. Telegram Webhook simulation or Test endpoint
app.post('/api/telegram-config', (req: Request, res: Response) => {
  const { enabled, botToken, chatId, minMarginPercent, minScore } = req.body;
  
  telegramConfig = {
    enabled: Boolean(enabled),
    botToken: botToken || '',
    chatId: chatId || '',
    minMarginPercent: Number(minMarginPercent) || 30,
    minScore: Number(minScore) || 70
  };

  const statusStr = telegramConfig.enabled ? 'Enabled 🔥' : 'Disabled 💤';
  telegramLogs.unshift(`[Settings] Updated bot configuration. Status: ${statusStr}. Threshold: ${telegramConfig.minMarginPercent}% margin / ${telegramConfig.minScore} Score.`);

  res.json({ success: true, config: telegramConfig, logs: telegramLogs });
});

app.get('/api/telegram-logs', (req: Request, res: Response) => {
  res.json({ success: true, logs: telegramLogs, config: telegramConfig });
});

app.post('/api/telegram-test', async (req: Request, res: Response) => {
  const { testMessage } = req.body;
  const msgText = testMessage || '🚲 [Bike Flipper Alert Test]\nDeal found: Specialized Tarmac AL 4\nAsking: 4,500 DKK\nTarget Profit: 2,500 DKK (55% ROI)\nScore: 91 pts!';

  telegramLogs.unshift(`[Outgoing] Sending test message: "${msgText.slice(0, 30)}..."`);

  if (!telegramConfig.botToken || !telegramConfig.chatId) {
    telegramLogs.unshift(`[Error] Telegram test aborted. Missing botToken or chatId in configuration.`);
    return res.json({ 
      success: false, 
      error: 'Please fill in both Telegram Bot Token and Chat ID to run a live test.',
      logs: telegramLogs 
    });
  }

  try {
    // Attempt real HTTP post to Telegram standard endpoint
    const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramConfig.chatId,
        text: msgText,
        parse_mode: 'HTML'
      })
    });

    if (response.ok) {
      telegramLogs.unshift(`[Success] Live Bot notification delivered successfully with Chat ID: ${telegramConfig.chatId}.`);
      return res.json({ 
        success: true, 
        message: 'Alert delivered successfully to Telegram!', 
        logs: telegramLogs 
      });
    } else {
      const respData = await response.json();
      telegramLogs.unshift(`[API Error] Telegram API returned non-200. Detail: ${JSON.stringify(respData)}`);
      return res.json({ 
        success: false, 
        error: `Telegram server rejected token/chatId configuration. check inputs.`,
        logs: telegramLogs 
      });
    }
  } catch (error: any) {
    telegramLogs.unshift(`[Connection Error] Could not connect to telegram servers: ${error.message}`);
    return res.json({ 
      success: false, 
      error: `Connection to Telegram failed: ${error.message || error}`,
      logs: telegramLogs 
    });
  }
});

// Automated background scanner simulation daemon
function startBackgroundScraper() {
  const brands = ['Specialized', 'Canyon', 'Trek', 'Giant', 'Cervelo', 'Bianchi', 'Cannondale', 'BMC', 'Pinarello'];
  const models: Record<string, { name: string; retail: number }[]> = {
    'Specialized': [
      { name: 'Tarmac SL6', retail: 18000 },
      { name: 'Tarmac SL7 Pro', retail: 42000 },
      { name: 'Allez Sprint', retail: 14000 },
      { name: 'Diverge Comp', retail: 24000 }
    ],
    'Canyon': [
      { name: 'Grizl CF SL', retail: 22000 },
      { name: 'Endurace AL 7', retail: 11500 },
      { name: 'Ultimate CF SLX', retail: 48000 }
    ],
    'Trek': [
      { name: 'Domane AL 2', retail: 8500 },
      { name: 'Emonda ALR 5', retail: 16500 },
      { name: 'Madone SL 6', retail: 38000 }
    ],
    'Giant': [
      { name: 'TCR Advanced', retail: 19500 },
      { name: 'Defy Advanced', retail: 18000 }
    ],
    'Cervelo': [
      { name: 'Caledonia 5', retail: 45000 },
      { name: 'Soloist 105', retail: 32000 }
    ],
    'Bianchi': [
      { name: 'Oltre XR3', retail: 34000 },
      { name: 'Infinito CV', retail: 29000 }
    ]
  };

  const conditions = ['Like New', 'Good', 'Fair'];
  const sizes = ['52 cm', '54 cm', '56 cm', '58 cm'];
  const regions = [
    { name: 'Hovedstaden' as const, lat: 55.6761, lng: 12.5683 },
    { name: 'Sjælland' as const, lat: 55.6419, lng: 12.0878 },
    { name: 'Syddanmark' as const, lat: 55.4038, lng: 10.4024 },
    { name: 'Midtjylland' as const, lat: 56.1567, lng: 10.2108 },
    { name: 'Nordjylland' as const, lat: 57.0488, lng: 9.9217 }
  ];
  const sources = ['dba.dk' as const, 'guloggratis.dk' as const, 'facebook' as const];

  setInterval(async () => {
    // 40% chance to generate a listing each interval step to keep feed dynamic
    if (Math.random() > 0.4) return;

    try {
      const brand = brands[Math.floor(Math.random() * brands.length)];
      const modelList = models[brand] || [{ name: 'Road Tourer', retail: 12000 }];
      const modelObj = modelList[Math.floor(Math.random() * modelList.length)];
      
      const condition = conditions[Math.floor(Math.random() * conditions.length)];
      const size = sizes[Math.floor(Math.random() * sizes.length)];
      const regionObj = regions[Math.floor(Math.random() * regions.length)];
      const source = sources[Math.floor(Math.random() * sources.length)];

      const discountFactor = 0.22 + Math.random() * 0.45; // 22% to 67% of new retail price
      const askingPrice = Math.round((modelObj.retail * discountFactor) / 100) * 100;
      
      // Calculate flipper score factors
      const calc = calculateCustomScore(askingPrice, modelObj.retail, brand, size, condition);

      const dbaId = Math.floor(10000000 + Math.random() * 90000000);
      let url = `https://www.dba.dk/annonce/${dbaId}`;
      if (source === 'guloggratis.dk') {
        url = `https://www.guloggratis.dk/annonce/id-${dbaId}`;
      } else if (source === 'facebook') {
        url = `https://www.facebook.com/marketplace/item/${dbaId}`;
      }

      // Slightly offset coordinates
      const latOffset = (Math.random() - 0.5) * 0.15;
      const lngOffset = (Math.random() - 0.5) * 0.15;

      const newListing: BicycleListing = {
        id: `auto_${Date.now()}`,
        title: `${brand} ${modelObj.name}`,
        description: `Super lækker ${brand} cykel i størrelse ${size}. Standen er vurderet som ${condition}. Sælges super hurtigt. Afhentes i ${regionObj.name}.`,
        url,
        source,
        price: askingPrice,
        brand,
        model: modelObj.name,
        size,
        condition,
        publishedAt: 'Lige nu',
        estimatedRetailNew: modelObj.retail,
        score: calc.score,
        resellEstimate: calc.resellEstimate,
        potentialMargin: calc.potentialMargin,
        potentialMarginPercent: calc.potentialMarginPercent,
        pros: ['Rigtig god pris', `Lækker populær model fra ${brand}`, 'Nemt videresalgspotentiale'],
        cons: ['Brugsridser forekommer', 'Kæde bør smøres'],
        recommendation: `Match fundet! Estimerede gensalgspris er ${calc.resellEstimate} DKK, hvilket giver dig en mærkbar fortjenste på ${calc.potentialMarginPercent}%.`,
        region: regionObj.name,
        latitude: regionObj.lat + latOffset,
        longitude: regionObj.lng + lngOffset
      };

      // Add to feed (limit to 30 items max to prevent leakage)
      mockListings.unshift(newListing);
      if (mockListings.length > 30) {
        mockListings = mockListings.slice(0, 30);
      }

      // If Telegram integration is active, let's fire a real telegram alert automatically!
      if (telegramConfig.enabled && telegramConfig.botToken && telegramConfig.chatId) {
        const meetsMargin = newListing.potentialMarginPercent >= telegramConfig.minMarginPercent;
        const meetsScore = newListing.score >= telegramConfig.minScore;

        if (meetsMargin && meetsScore) {
          const alertMessage = 
            `🔔 <b>[Bike Flipper Scanner Active]</b>\n\n` +
            `🚴 <b>${newListing.title}</b> (${newListing.size})\n` +
            `🌐 Source: <code>${newListing.source}</code>\n` +
            `📍 Region: <b>${newListing.region}</b>\n\n` +
            `💵 Price: <b>${newListing.price.toLocaleString('da-DK')} DKK</b>\n` +
            `🎯 Est. Resell: <b>${newListing.resellEstimate.toLocaleString('da-DK')} DKK</b>\n` +
            `📈 Est. Margin: <b>${newListing.potentialMargin.toLocaleString('da-DK')} DKK (${newListing.potentialMarginPercent}%)</b>\n` +
            `⭐ Score rating: <b>${newListing.score} / 100</b>\n\n` +
            `🔗 <a href="${newListing.url}">View Listing Link</a>`;

          const tgUrl = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
          const resp = await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramConfig.chatId,
              text: alertMessage,
              parse_mode: 'HTML'
            })
          });

          if (resp.ok) {
            telegramLogs.unshift(`[Auto Send] Sent automatic push notification for hot deal: ${newListing.title} (${newListing.score} pts).`);
          } else {
            const errData = await resp.json();
            telegramLogs.unshift(`[Auto Error] Bot alert rejected: ${JSON.stringify(errData)}`);
          }
        }
      }
    } catch (err: any) {
      console.error('[Daemon Error]', err);
    }
  }, 10000); // execute every 10 seconds for ultra-responsive testing in AI Studio!
}

// Run Vite dev middleware when not in production
const startServer = async () => {
  // Start autonomous bg collector daemon
  startBackgroundScraper();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is booted and actively routing on http://localhost:${PORT}`);
  });
};

startServer();
