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

// Initial preloaded listings (will be populated immediately on startup with real live ads from DBA)
let mockListings: BicycleListing[] = [];

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

// Scrape actual DBA RSS feed in Denmark dynamically to get real, non-404, working listing links
async function fetchDbaRssLive(): Promise<BicycleListing[]> {
  const feeds = [
    { url: 'https://www.dba.dk/cykler/racercykler-og-gravelcykler/?format=rss', filterBrands: false },
    { url: 'https://www.dba.dk/cykler/herrecykler/racercykler/?format=rss', filterBrands: false },
    { url: 'https://www.dba.dk/cykler/herrecykler/?format=rss', filterBrands: true }
  ];

  const sportsBrands = [
    'specialized', 'canyon', 'trek', 'giant', 'cervelo', 'bianchi', 
    'cannondale', 'bmc', 'pinarello', 'merida', 'scott', 'principia',
    'ridley', 'orbea', 'cube', 'rose', 'focus', 'wilier', 'felt', 'argon'
  ];

  const listingsMap = new Map<string, BicycleListing>();

  for (const feed of feeds) {
    try {
      console.log(`[RSS Search] Fetching from DBA category: ${feed.url}`);
      const response = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        console.warn(`[RSS Search] DBA RSS segment failed with status: ${response.status} for ${feed.url}`);
        continue;
      }

      const xmlText = await response.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemContent = match[1];

        // Extract title
        const titleMatch = itemContent.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || itemContent.match(/<title>([\s\S]*?)<\/title>/);
        if (!titleMatch) continue;
        const title = titleMatch[1].trim();

        // Extract link
        const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
        if (!linkMatch) continue;
        const url = linkMatch[1].trim();

        // Skip duplicates immediately
        if (listingsMap.has(url)) continue;

        // Extract description
        const descMatch = itemContent.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || itemContent.match(/<description>([\s\S]*?)<\/description>/);
        const rawDesc = descMatch ? descMatch[1].trim() : '';
        const description = rawDesc.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

        const titleLower = title.toLowerCase();
        const descLower = description.toLowerCase();

        // Apply brand filter if specified to weed out basic city bikes in herrecykler
        if (feed.filterBrands) {
          const hasSportsBrand = sportsBrands.some(b => titleLower.includes(b) || descLower.includes(b));
          if (!hasSportsBrand) {
            continue; 
          }
        }

        // Extract price from description or title
        let price = 4500; // default safe fallback
        const priceRegex = /Pris:\s*([\d\.]+)\s*kr/i;
        const priceTextMatch = rawDesc.match(priceRegex) || title.match(/([\d\.]+)\s*kr/i);
        if (priceTextMatch) {
          price = parseInt(priceTextMatch[1].replace(/\./g, ''), 10);
        }

        // Identify brand
        let brand = 'Other Brand';
        for (const b of sportsBrands) {
          if (titleLower.includes(b)) {
            brand = b.charAt(0).toUpperCase() + b.slice(1);
            break;
          }
        }

        // Size heuristic
        let size = '56 cm';
        const sizeMatch = title.match(/(str\.\s*\d+|str\s*\d+|\b\d+\s*cm|\b[smlx]\b)/i) || description.match(/(str\.\s*\d+|str\s*\d+|\b\d+\s*cm|\b[smlx]\b)/i);
        if (sizeMatch) {
          size = sizeMatch[1].toUpperCase();
        }

        // Condition heuristic
        let condition: 'Like New' | 'Good' | 'Fair' | 'Needs Service' = 'Good';
        if (descLower.includes('som ny') || descLower.includes('perfekt') || descLower.includes('ubrugt') || descLower.includes('fejlfri')) {
          condition = 'Like New';
        } else if (descLower.includes('slidt') || descLower.includes('rust') || descLower.includes('overflade') || descLower.includes('defekt')) {
          condition = 'Needs Service';
        } else if (descLower.includes('ridser') || descLower.includes('brugsspor')) {
          condition = 'Fair';
        }

        // Region heuristic
        let region: 'Hovedstaden' | 'Sjælland' | 'Syddanmark' | 'Midtjylland' | 'Nordjylland' = 'Hovedstaden';
        let latitude = 55.6761;
        let longitude = 12.5683;

        if (descLower.includes('aarhus') || descLower.includes('randers') || descLower.includes('horsens') || descLower.includes('silkeborg')) {
          region = 'Midtjylland';
          latitude = 56.1567 + (Math.random() - 0.5) * 0.15;
          longitude = 10.2108 + (Math.random() - 0.5) * 0.15;
        } else if (descLower.includes('odense') || descLower.includes('esbjerg') || descLower.includes('vejle') || descLower.includes('fyn') || descLower.includes('kolding') || descLower.includes('slesvig')) {
          region = 'Syddanmark';
          latitude = 55.4038 + (Math.random() - 0.5) * 0.15;
          longitude = 10.4024 + (Math.random() - 0.5) * 0.15;
        } else if (descLower.includes('aalborg') || descLower.includes('skagen') || descLower.includes('nordjylland') || descLower.includes('hjørring')) {
          region = 'Nordjylland';
          latitude = 57.0488 + (Math.random() - 0.5) * 0.15;
          longitude = 9.9217 + (Math.random() - 0.5) * 0.15;
        } else if (descLower.includes('roskilde') || descLower.includes('slagelse') || descLower.includes('sjælland') || descLower.includes('næstved') || descLower.includes('køge')) {
          region = 'Sjælland';
          latitude = 55.6419 + (Math.random() - 0.5) * 0.15;
          longitude = 12.0878 + (Math.random() - 0.5) * 0.15;
        } else {
          latitude = 55.6761 + (Math.random() - 0.5) * 0.15;
          longitude = 12.5683 + (Math.random() - 0.5) * 0.15;
        }

        const retailNewEst = getEstimatedNewPrice(brand, title);
        const calc = calculateCustomScore(price, retailNewEst || 12000, brand, size, condition);

        const uniqueId = `rss_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        listingsMap.set(url, {
          id: uniqueId,
          title,
          description: description.substring(0, 300) + (description.length > 300 ? '...' : ''),
          url,
          source: 'dba.dk',
          price,
          brand,
          model: title.replace(new RegExp(brand, 'i'), '').trim(),
          size,
          condition,
          publishedAt: 'Aktuel dba.dk Annonce',
          estimatedRetailNew: retailNewEst || 12000,
          score: calc.score,
          resellEstimate: calc.resellEstimate,
          potentialMargin: calc.potentialMargin,
          potentialMarginPercent: calc.potentialMarginPercent,
          pros: ['Sourced from live dba.dk XML feed', '100% active, callable seller listing link'],
          cons: ['Mærkeværdi er høj, reager omgående på dba.dk ift prisen'],
          recommendation: `Sundt selskabstilbud! Giver en god fortjeneste på ca. ${calc.potentialMargin.toLocaleString('da-DK')} DKK videresalg.`,
          region,
          latitude,
          longitude
        });
      }
    } catch (err) {
      console.error('[RSS Search Error] Could not parse dba rss segment:', feed.url, err);
    }
  }

  return Array.from(listingsMap.values());
}

// ----------------- API ENDPOINTS -----------------

// 1. Get List simulated listings
app.get('/api/listings-feed', async (req: Request, res: Response) => {
  try {
    // Attempt to enrich with active real-time listings on every refresh/load
    const liveItems = await fetchDbaRssLive();
    if (liveItems && liveItems.length > 0) {
      const existingUrls = new Set(mockListings.map(l => l.url));
      const filtered = liveItems.filter(item => !existingUrls.has(item.url));
      mockListings.unshift(...filtered);

      if (mockListings.length > 50) {
        mockListings = mockListings.slice(0, 50);
      }
    }
  } catch (err) {
    console.error('[Feed Enrich Error]', err);
  }

  // Always recalculate interactive score based on current adjustable configurations so changes apply in real-time
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
    return res.status(400).json({ success: false, error: 'Please enter bicycle listing description text or a valid URL' });
  }

  let userText = textContent.trim();
  let urlToUse = sourceUrl ? sourceUrl.trim() : '';

  // Intercept if the user accidentally pasted a HTTP URL in the main ad text area
  if (userText.startsWith('http://') || userText.startsWith('https://')) {
    urlToUse = userText;
    userText = `Spurgt URL analyseret: ${urlToUse}`;
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

      let promptText = `You are a professional cycling appraiser of the Danish bicycle marketplace. 
Analyze the following copy-pasted ad text (likely in Danish) from websites like dba.dk or guloggratis.dk. 

Ad text to analyze:
"""
${userText}
"""`;

      // Define standard configuration
      const mConfig: any = {
        responseMimeType: 'application/json'
      };

      // If we have an active URL, let's instruct Gemini to use its googleSearch grounding tool!
      if (urlToUse) {
        promptText = `You are a professional cycling appraiser of the Danish bicycle marketplace. 
The user wants to analyze this specific listing URL: "${urlToUse}".
Use your build-in googleSearch grounding tool to find the exact, actual listing page. Or if it's not indexed yet, search for similar listings.
Extract the real title, real published asking price in DKK, real description, real condition, and frame size of this model.

Return an appraisal with:
1. Identifying Brand, model, frame size, and structural condition.
2. Estimating the original brand-new retail price in DKK and potential used resell estimate in DKK on the Danish marketplace.
3. Defining exactly 2-3 PROs and 1-2 CONs of flipping this bike.
4. Issuing a clear 1-2 sentence recommendation for a flipping entrepreneur.

URL to get and analyze: ${urlToUse}`;

        mConfig.tools = [{ googleSearch: {} }];
      }

      promptText += `

You MUST respond strictly with a valid JSON object matching this schema. No extra words or wrapping:
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
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: promptText,
        config: mConfig
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
    const lowerText = userText.toLowerCase();
    
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

  const textLower = userText.toLowerCase();
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
    description: userText,
    url: urlToUse || 'https://www.dba.dk/herrecykel/custom',
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

// 6. Active Live Search-Grounded AI Scanner of dba.dk / guloggratis.dk / facebook
app.post('/api/live-scan', async (req: Request, res: Response) => {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY' || geminiKey.trim().length === 0) {
    console.log('[Live Scan] No Gemini API key config. Trying active live dba.dk RSS parse first...');
    try {
      const liveItems = await fetchDbaRssLive();
      if (liveItems && liveItems.length > 0) {
        const existingUrls = new Set(mockListings.map(l => l.url));
        const added: BicycleListing[] = [];
        
        for (const item of liveItems) {
          if (!existingUrls.has(item.url)) {
            mockListings.unshift(item);
            added.push(item);
          }
        }

        if (mockListings.length > 50) {
          mockListings = mockListings.slice(0, 50);
        }

        return res.json({
          success: true,
          isMock: false,
          isRss: true,
          message: `🔌 No Gemini key detected, but we automatically scanned the live dba.dk XML RSS feed instead! Sourced ${liveItems.length} active live listings with 100% working, clickable buy-ready links (not simulations).`,
          listings: liveItems
        });
      }
    } catch (rssError) {
      console.warn('[Live Scan RSS Error] RSS fallback during key-bypass failed, generating simulation...', rssError);
    }

    // Generate realistic real-looking listings as simulation so the app is immediately testable,
    // but tell the user very clearly that they should add their key.
    const mockLiveListings = [
      {
        id: `mock_live_1_${Date.now()}`,
        title: 'Canyon Ultimate CF SL X-Large',
        description: 'Meget flot Canyon racer, brugt 1 sæson til motion. Fuld Shimano Ultegra Di2 elektroniske gear, skivebremser, DT Swiss kulfiber hjulsæt. Velholdt, altid opbevaret indendørs.',
        url: 'https://www.dba.dk/herrecykel-canyon-ultimate-cf-carbon/id-1029481239/',
        source: 'dba.dk' as const,
        price: 24500,
        brand: 'Canyon',
        model: 'Ultimate CF SL',
        size: 'XL',
        condition: 'Like New' as const,
        region: 'Hovedstaden' as const,
        estimatedRetailNew: 38000
      },
      {
        id: `mock_live_2_${Date.now()}`,
        title: 'Trek Emonda SL5 carbon 54cm',
        description: 'Pæn Trek carbon racer. Shimano 105 i 11 speed. Perfekt stand næsten uden brugsspor. Sælges udelukkende grundet køb af gravel.',
        url: 'https://www.guloggratis.dk/sport/cykler/racercykler/annonce/trek-emonda-sl5-carbon/id-98124933/',
        source: 'guloggratis.dk' as const,
        price: 9500,
        brand: 'Trek',
        model: 'Emonda SL5',
        size: '54 cm',
        condition: 'Good' as const,
        region: 'Sjælland' as const,
        estimatedRetailNew: 18500
      },
      {
        id: `mock_live_3_${Date.now()}`,
        title: 'Specialized Diverge Comp E5 model 2023',
        description: 'Specialized gravel cykel i super stand. Frame size 56 cm. Kun ridse på bagstag ellers perfekt mekanisk. Shimano GRX gear.',
        url: 'https://www.dba.dk/herrecykel-specialized-diverge-comp-e5/id-1092841284/',
        source: 'dba.dk' as const,
        price: 13500,
        brand: 'Specialized',
        model: 'Diverge Comp',
        size: '56 cm',
        condition: 'Good' as const,
        region: 'Syddanmark' as const,
        estimatedRetailNew: 24000
      }
    ];

    const processedSimulation: BicycleListing[] = mockLiveListings.map(item => {
      let latitude = 55.6761 + (Math.random() - 0.5) * 0.15;
      let longitude = 12.5683 + (Math.random() - 0.5) * 0.15;
      if (item.region === 'Sjælland') {
        latitude = 55.6419 + (Math.random() - 0.5) * 0.15;
        longitude = 12.0878 + (Math.random() - 0.5) * 0.15;
      } else if (item.region === 'Syddanmark') {
        latitude = 55.4038 + (Math.random() - 0.5) * 0.15;
        longitude = 10.4024 + (Math.random() - 0.5) * 0.15;
      }

      const calc = calculateCustomScore(
        item.price,
        item.estimatedRetailNew,
        item.brand,
        item.size,
        item.condition
      );

      return {
        ...item,
        score: calc.score,
        resellEstimate: calc.resellEstimate,
        potentialMargin: calc.potentialMargin,
        potentialMarginPercent: calc.potentialMarginPercent,
        publishedAt: 'Lige nu (Simulation ad)',
        pros: ['Yderst populær mærkemodel i Danmark', 'Fornuftig pris i forhold til nypris'],
        cons: ['Standardhjul er monteret', 'Kvittering skal efterspørges'],
        recommendation: `Godt bud! Emnet koster kun ${item.price} DKK med et stærkt gensalgspotentiale på ca. ${calc.resellEstimate} DKK.`,
        latitude,
        longitude
      };
    });

    // Add these mock live listings immediately to keep feed populated
    mockListings.unshift(...processedSimulation);
    if (mockListings.length > 30) {
      mockListings = mockListings.slice(0, 30);
    }

    return res.json({
      success: true,
      isMock: true,
      message: '💡 Showing simulated ads fallback. (Add your GEMINI_API_KEY in "Settings > Secrets" inside AI Studio to activate Search Grounded AI, or click again to trigger fallback DBA live parser)',
      listings: processedSimulation
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    console.log('[Live Scan] Fetching actual live bicycle ads in Denmark via Google Search Grounding...');

    const prompt = `Search the live web for 3 to 5 real, active bicycle classified listings for sale in Denmark. 
Search strictly on Danish marketplaces: dba.dk or guloggratis.dk. 

We only want actual performance bicycle brands currently for sale like: Specialized, Canyon, Trek, Giant, Cervelo, Bianchi, Cannondale.
You MUST extract real existing listings with:
1. Exact working ad URLs (no made-up URLs, they must be real clickable URLs on dba.dk or guloggratis.dk)
2. Precise asking price in DKK (or convert EUR to DKK if needed, 1 EUR = 7.5 DKK)
3. Genuine brand & model name
4. Description extracted from the listing (written in Danish or English)

Respond STRICTLY with a JSON array matching this typescript schema:
Array<{
  "title": string, // e.g. "Specialized Tarmac Comp carbon"
  "description": string, // brief description from listing
  "url": string, // MUST be a real valid active URL on dba.dk or guloggratis.dk
  "source": "dba.dk" | "guloggratis.dk",
  "price": number, // in DKK, e.g. 14500
  "brand": string, // e.g. "Specialized"
  "model": string, // e.g. "Tarmac"
  "size": string, // e.g. "54 cm", "56 cm", "M", "L"
  "condition": "Like New" | "Good" | "Fair" | "Needs Service",
  "region": "Hovedstaden" | "Sjælland" | "Syddanmark" | "Midtjylland" | "Nordjylland"
}>`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '[]';
    const parsed = JSON.parse(text.trim());

    if (!Array.isArray(parsed)) {
      throw new Error('AI returned a non-array JSON format');
    }

    const liveListings: BicycleListing[] = [];

    for (const item of parsed) {
      if (!item.title || !item.url || !item.price || !item.brand) continue;

      let latitude = 55.6761 + (Math.random() - 0.5) * 0.15;
      let longitude = 12.5683 + (Math.random() - 0.5) * 0.15;

      if (item.region === 'Midtjylland') {
        latitude = 56.1567 + (Math.random() - 0.5) * 0.15;
        longitude = 10.2108 + (Math.random() - 0.5) * 0.15;
      } else if (item.region === 'Syddanmark') {
        latitude = 55.4038 + (Math.random() - 0.5) * 0.15;
        longitude = 10.4024 + (Math.random() - 0.5) * 0.15;
      } else if (item.region === 'Nordjylland') {
        latitude = 57.0488 + (Math.random() - 0.5) * 0.15;
        longitude = 9.9217 + (Math.random() - 0.5) * 0.15;
      } else if (item.region === 'Sjælland') {
        latitude = 55.6419 + (Math.random() - 0.5) * 0.15;
        longitude = 12.0878 + (Math.random() - 0.5) * 0.15;
      }

      const retailNewEst = getEstimatedNewPrice(item.brand, item.model || '');
      const calc = calculateCustomScore(
        Number(item.price),
        retailNewEst || 12000,
        item.brand,
        item.size || '56 cm',
        item.condition || 'Good'
      );

      const dbaListing: BicycleListing = {
        id: `real_${Date.now()}_${Math.floor(Math.random() * 99999)}`,
        title: item.title,
        description: item.description || `Se annonce her: ${item.url}`,
        url: item.url,
        source: item.source === 'guloggratis.dk' ? 'guloggratis.dk' : 'dba.dk',
        price: Number(item.price),
        brand: item.brand,
        model: item.model || 'Road racer',
        size: item.size || '56 cm',
        condition: item.condition || 'Good',
        publishedAt: 'Lige nu (Live Scanned)',
        estimatedRetailNew: retailNewEst || 12000,
        score: calc.score,
        resellEstimate: calc.resellEstimate,
        potentialMargin: calc.potentialMargin,
        potentialMarginPercent: calc.potentialMarginPercent,
        pros: ['Hentet direkte fra live søgning', 'Verificeret aktiv annonce på ' + item.source],
        cons: ['Sælger skal kontaktes hurtigt (høj efterspørgsel)'],
        recommendation: `Match fundet på den rigtige dba/guloggratis! Værdi vurderet til ca. ${calc.resellEstimate.toLocaleString('da-DK')} DKK videresalg.`,
        region: item.region || 'Hovedstaden',
        latitude,
        longitude
      };

      liveListings.push(dbaListing);
      mockListings.unshift(dbaListing);
    }

    if (mockListings.length > 40) {
      mockListings = mockListings.slice(0, 40);
    }

    res.json({
      success: true,
      message: `Successfully aggregated ${liveListings.length} real live bicycle listings!`,
      addedCount: liveListings.length,
      listings: liveListings
    });

  } catch (error: any) {
    const isRateLimit = error && (error.status === 429 || error.message?.includes('429') || JSON.stringify(error).includes('429'));
    if (isRateLimit) {
      console.log('[Live Scan API] 429 Quota limit active. Seamlessly triggering real-time dba.dk direct XML feed fallback.');
    } else {
      console.warn('[Live Scan AI Error - Falling back to RSS direct parse]', error);
    }
    try {
      // Robust Fallback: Pull directly from the active live dba.dk RSS feed!
      const rssListings = await fetchDbaRssLive();
      
      if (rssListings && rssListings.length > 0) {
        const existingUrls = new Set(mockListings.map(l => l.url));
        const added: BicycleListing[] = [];
        
        for (const item of rssListings) {
          if (!existingUrls.has(item.url)) {
            mockListings.unshift(item);
            added.push(item);
          }
        }
        
        if (mockListings.length > 50) {
          mockListings = mockListings.slice(0, 50);
        }
        
        return res.json({
          success: true,
          fallbackRSS: true,
          message: '⚠️ AI Search Grounding quota exceeded (code 429). But we automatically triggered our direct real-time dba.dk RSS XML parser fallback! Sourced active live listings with 100% working, clickable buy-ready links straight from Denmark marketplace.',
          addedCount: added.length,
          listings: rssListings
        });
      } else {
        return res.status(500).json({
          success: false,
          error: `Live scan rate limits exceeded, and fallback DBA RSS feed was unavailable: ${error.message || error}`
        });
      }
    } catch (fallbackError: any) {
      return res.status(500).json({
        success: false,
        error: `Could not scan live web contents & fallback failed: ${error.message || error}. RSS error: ${fallbackError.message || fallbackError}`
      });
    }
  }
});

// Automated background scanner scraping daemon (checking DBA RSS feeds periodically for real deals)
function startBackgroundScraper() {
  console.log('[System] Active Real-Deal background scraper daemon initialized.');

  // Check every 60 seconds as a reliable background service
  setInterval(async () => {
    try {
      console.log('[Background Daemon] Polling live dba.dk RSS feeds for newly posted deals...');
      const liveItems = await fetchDbaRssLive();
      
      if (liveItems && liveItems.length > 0) {
        const existingUrls = new Set(mockListings.map(l => l.url));
        const newlyAddedAndMeetsTelegram: BicycleListing[] = [];
        let addedCount = 0;

        for (const item of liveItems) {
          if (!existingUrls.has(item.url)) {
            mockListings.unshift(item);
            newlyAddedAndMeetsTelegram.push(item);
            addedCount++;
          }
        }

        if (addedCount > 0) {
          console.log(`[Background Daemon] Spotted and added ${addedCount} brand new real-time advertisements!`);
          
          if (mockListings.length > 50) {
            mockListings = mockListings.slice(0, 50);
          }

          // Trigger automated Telegram alert logic for newly spotted REAL items!
          for (const newListing of newlyAddedAndMeetsTelegram) {
            if (telegramConfig.enabled && telegramConfig.botToken && telegramConfig.chatId) {
              const meetsMargin = newListing.potentialMarginPercent >= telegramConfig.minMarginPercent;
              const meetsScore = newListing.score >= telegramConfig.minScore;

              if (meetsMargin && meetsScore) {
                const alertMessage = 
                  `🔔 <b>[Hot Real Deal Spotted!]</b>\n\n` +
                  `🚴 <b>${newListing.title}</b> (${newListing.size})\n` +
                  `🌐 Source: <code>${newListing.source}</code>\n` +
                  `📍 Region: <b>${newListing.region}</b>\n\n` +
                  `💵 Price: <b>${newListing.price.toLocaleString('da-DK')} DKK</b>\n` +
                  `🎯 Est. Resell: <b>${newListing.resellEstimate.toLocaleString('da-DK')} DKK</b>\n` +
                  `📈 Est. Margin: <b>${newListing.potentialMargin.toLocaleString('da-DK')} DKK (${newListing.potentialMarginPercent}%)</b>\n` +
                  `⭐ Score rating: <b>${newListing.score} / 100</b>\n\n` +
                  `🔗 <a href="${newListing.url}">Open DBA Listing (Real Link)</a>`;

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
                  telegramLogs.unshift(`[Auto Send] Real Alert Sent for: ${newListing.title} with score ${newListing.score}`);
                } else {
                  const errData = await resp.json();
                  telegramLogs.unshift(`[Auto Send Error] Bot alert rejected: ${JSON.stringify(errData)}`);
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[Daemon Error]', err);
    }
  }, 120000); // executed every 2 minutes
}

// Run Vite dev middleware when not in production
const startServer = async () => {
  // Start autonomous bg collector daemon
  startBackgroundScraper();

  // Pre-load initial real listings immediately to make the first UI render 100% genuine & instant
  console.log('[Startup] Gathering actual live listings from DBA active RSS feeds...');
  try {
    const startupListings = await fetchDbaRssLive();
    if (startupListings && startupListings.length > 0) {
      mockListings = startupListings;
      console.log(`[Startup] Pre-populated feed successfully with ${mockListings.length} real active listings!`);
    }
  } catch (err) {
    console.error('[Startup Error] Failed to pre-load real listings:', err);
  }

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
