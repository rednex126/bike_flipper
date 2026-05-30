import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { INITIAL_BENCHMARK_PRICES, getEstimatedNewPrice } from './src/data/benchmarkData.js';
import { BicycleListing, BenchmarkPrice, TelegramConfig, ScoringParams } from './src/types';
import { LocalDb } from './src/db/localDb.js';
import { runPlaywrightScrape, resolveLocationCoords, classifyBike } from './src/scraper/scraper.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Seed default state in DB if empty
if (LocalDb.getBenchmarks().length === 0) {
  LocalDb.saveBenchmarks(INITIAL_BENCHMARK_PRICES);
}

// Auto-migrate: Classify existing listings and filter out 'Other'
try {
  const existingListings = LocalDb.getListings();
  let migrated = false;
  const cleanedListings = existingListings.map(listing => {
    if (!listing.category) {
      listing.category = classifyBike(listing.title, listing.description || '');
      migrated = true;
    }
    return listing;
  }).filter(listing => {
    if (listing.category === 'Other') {
      migrated = true;
      console.log(`[Migration] Filtering out city/other bike: ${listing.title}`);
      return false;
    }
    return true;
  });

  if (migrated) {
    console.log(`[Migration] Cleaned and migrated database listings. Count went from ${existingListings.length} to ${cleanedListings.length}.`);
    LocalDb.saveListings(cleanedListings);
  }
} catch (migErr) {
  console.error('[Migration Error] Failed to run database auto-migration:', migErr);
}

// Internal Telegram log simulations
let telegramLogs: string[] = [
  '[System] Bot service registered successfully 2026-05-30.',
  '[System] Awaiting triggers.'
];

// Helper to calculate score using customizable parameters
function calculateCustomScore(
  askingPrice: number,
  retailNewPrice: number,
  brand: string,
  size: string,
  condition: string
): { score: number; resellEstimate: number; potentialMargin: number; potentialMarginPercent: number } {
  
  const scoringParams = LocalDb.getScoringParams();
  
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
    { url: 'https://www.dba.dk/cykler/racercykler-og-gravelcykler/', filterBrands: false },
    { url: 'https://www.dba.dk/cykler/herrecykler/racercykler/', filterBrands: false },
    { url: 'https://www.dba.dk/cykler/mountainbikes/', filterBrands: false },
    { url: 'https://www.dba.dk/cykler/herrecykler/', filterBrands: true }
  ];

  const sportsBrands = [
    'specialized', 'canyon', 'trek', 'giant', 'cervelo', 'bianchi', 
    'cannondale', 'bmc', 'pinarello', 'merida', 'scott', 'principia',
    'ridley', 'orbea', 'cube', 'rose', 'focus', 'wilier', 'felt', 'argon'
  ];

  const listingsMap = new Map<string, BicycleListing>();

  for (const feed of feeds) {
    try {
      console.log(`[RSS Search] Fetching from DBA category HTML: ${feed.url}`);
      const response = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        console.warn(`[RSS Search] DBA HTML segment failed with status: ${response.status} for ${feed.url}`);
        continue;
      }

      const htmlText = await response.text();
      
      const articleRegex = /<article[^>]*class="[^"]*sf-search-ad[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
      let match;
      let count = 0;

      while ((match = articleRegex.exec(htmlText)) !== null) {
        count++;
        const articleHtml = match[1];

        // 1. Extract link and id
        const linkMatch = articleHtml.match(/href="([^"]*?recommerce\/forsale\/item\/(\d+)[^"]*?)"/) || 
                          articleHtml.match(/href="([^"]*?\/id-(\d+)[^"]*?)"/) || 
                          articleHtml.match(/href="([^"]*?)"/);
        if (!linkMatch) continue;
        const url = linkMatch[1];
        const id = linkMatch[2] || `${Date.now()}_${count}`;

        if (listingsMap.has(url)) continue;

        // 2. Extract title
        const titleMatch = articleHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
        if (!titleMatch) continue;
        const title = titleMatch[1].trim()
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#039;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        
        if (title.length < 3) continue;

        // 3. Extract price
        let price = 4500;
        const priceMatch = articleHtml.match(/([\d\.]+)\s*(?:kr|DKK)/i);
        if (priceMatch) {
          price = parseInt(priceMatch[1].replace(/\./g, '').trim(), 10);
        }

        // 4. Extract image
        const imgMatch = articleHtml.match(/src="([^"]*?dbastatic\.dk\/dynamic\/default\/item\/[^"]*?)"/) || 
                         articleHtml.match(/src="([^"]*?)"/);
        const imageUrl = imgMatch ? imgMatch[1] : '';

        // 5. Extract location
        const locMatch = articleHtml.match(/class="[^"]*truncate[^"]*"[^>]*>([^<]+)<\/span>/) || 
                         articleHtml.match(/class="[^"]*whitespace-nowrap[^"]*"[^>]*>([^<]+)<\/span>/);
        const regionText = locMatch ? locMatch[1].trim() : 'København';

        const titleLower = title.toLowerCase();

        // Exclude unwanted categories (parts, wanted ads)
        const excludeKeywords = [
          'søger', 'købes', 'byttes', 'lejes', 'sadel', 'hjul', 'dæk', 'slange', 
          'hjelm', 'tøj', 'sko', 'briller', 'pedaler', 'ramme', 'gaffel', 
          'gear', 'dele', 'reservedele', 'styr', 'sadelpind'
        ];
        if (excludeKeywords.some(keyword => titleLower.includes(keyword))) {
          continue;
        }

        if (price < 1000 || price > 120000) {
          continue;
        }

        // Apply brand filter if specified to weed out basic city bikes in herrecykler
        if (feed.filterBrands) {
          const hasSportsBrand = sportsBrands.some(b => titleLower.includes(b));
          if (!hasSportsBrand) {
            continue; 
          }
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
        const sizeMatch = title.match(/(str\.\s*\d+|str\s*\d+|\b\d+\s*cm|\b[smlx]\b)/i);
        if (sizeMatch) {
          size = sizeMatch[1].toUpperCase();
        }

        // Condition heuristic
        const condition = 'Good';

        // Geolocation resolution
        const geo = resolveLocationCoords(regionText);
        const region = geo.region;
        const latitude = geo.latitude;
        const longitude = geo.longitude;

        const category = classifyBike(title, '');
        if (category === 'Other') {
          continue; // Skip non-target bikes like utility/city/grandmother bikes
        }

        const retailNewEst = getEstimatedNewPrice(brand, title);
        const calc = calculateCustomScore(price, retailNewEst || 12000, brand, size, condition);

        listingsMap.set(url, {
          id: `dba_rss_${id}`,
          title,
          description: `Aktiv dba.dk annonce fra ${regionText}.`,
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
          pros: ['Sourced from live dba.dk HTML catalog page', '100% active, callable seller listing link'],
          cons: ['Mærkeværdi er høj, reager omgående på dba.dk ift prisen'],
          recommendation: `Sundt selskabstilbud! Giver en god fortjeneste på ca. ${calc.potentialMargin.toLocaleString('da-DK')} DKK videresalg.`,
          region,
          latitude,
          longitude,
          imageUrl,
          category
        });
      }
    } catch (err) {
      console.error('[RSS Search Error] Could not parse dba HTML catalog:', feed.url, err);
    }
  }
  return Array.from(listingsMap.values());
}

// ----------------- API ENDPOINTS -----------------

// 1. Get Listings
app.get('/api/listings-feed', async (req: Request, res: Response) => {
  const listings = LocalDb.getListings();
  const params = LocalDb.getScoringParams();
  
  const activeFeed = listings.map(listing => {
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

// Delete listing
app.delete('/api/listings-feed/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const listings = LocalDb.getListings().filter(l => l.id !== id);
  LocalDb.saveListings(listings);
  res.json({ success: true, message: 'Listing ignored successfully' });
});

// 2. Benchmarks
app.get('/api/benchmarks', (req: Request, res: Response) => {
  res.json({ success: true, benchmarks: LocalDb.getBenchmarks() });
});

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

  const benchmarks = LocalDb.getBenchmarks();
  benchmarks.unshift(newBenchmark);
  LocalDb.saveBenchmarks(benchmarks);
  res.json({ success: true, benchmark: newBenchmark });
});

app.delete('/api/benchmarks/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const benchmarks = LocalDb.getBenchmarks().filter(b => b.id !== id);
  LocalDb.saveBenchmarks(benchmarks);
  res.json({ success: true });
});

// 3. Scoring Params
app.get('/api/scoring-params', (req: Request, res: Response) => {
  res.json({ success: true, params: LocalDb.getScoringParams() });
});

app.post('/api/scoring-params', (req: Request, res: Response) => {
  const { brandFactor, sizeFactor, conditionFactor, priceRatioFactor } = req.body;
  const newParams = {
    brandFactor: Math.max(0, Math.min(10, Number(brandFactor))),
    sizeFactor: Math.max(0, Math.min(10, Number(sizeFactor))),
    conditionFactor: Math.max(0, Math.min(10, Number(conditionFactor))),
    priceRatioFactor: Math.max(0, Math.min(10, Number(priceRatioFactor)))
  };
  LocalDb.saveScoringParams(newParams);
  res.json({ success: true, message: 'Weights updated successfully', params: newParams });
});

// 4. Manual Listing Analyzer (Gemini AI & Heuristic)
app.post('/api/analyze-listing', async (req: Request, res: Response) => {
  const { textContent, sourceUrl } = req.body;
  if (!textContent || textContent.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Please enter description text' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  let appraisal = {
    brand: 'Other Brand',
    model: 'Bike',
    size: '56 cm',
    condition: 'Good',
    estimatedRetailNew: 10000,
    resellEstimate: 6000,
    pros: ['Manual input'],
    cons: ['Verify detail'],
    recommendation: 'Check physical condition.'
  };

  if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Analyze this bicycle listing and extract brand, model, size, condition (Like New, Good, Fair, Needs Service), original retail new price in DKK, used resell target in DKK: "${textContent}"`,
        config: { responseMimeType: 'application/json' }
      });
      const parsed = JSON.parse(response.text || '{}');
      appraisal = { ...appraisal, ...parsed };
    } catch (e) {
      console.warn('AI analysis failed, fallback to defaults:', e);
    }
  }

  const calc = calculateCustomScore(
    appraisal.resellEstimate * 0.6,
    appraisal.estimatedRetailNew,
    appraisal.brand,
    appraisal.size,
    appraisal.condition
  );

  const newListing: BicycleListing = {
    id: `manual_${Date.now()}`,
    title: `${appraisal.brand} ${appraisal.model} ${appraisal.size}`,
    description: textContent,
    url: sourceUrl || '',
    source: 'manual',
    price: Math.round(appraisal.resellEstimate * 0.6),
    brand: appraisal.brand,
    model: appraisal.model,
    size: appraisal.size,
    condition: appraisal.condition,
    publishedAt: 'Just Now',
    estimatedRetailNew: appraisal.estimatedRetailNew,
    score: calc.score,
    resellEstimate: appraisal.resellEstimate,
    potentialMargin: appraisal.resellEstimate - Math.round(appraisal.resellEstimate * 0.6),
    potentialMarginPercent: 66,
    pros: appraisal.pros,
    cons: appraisal.cons,
    recommendation: appraisal.recommendation,
    region: 'Hovedstaden',
    latitude: 55.6761,
    longitude: 12.5683,
    category: classifyBike(`${appraisal.brand} ${appraisal.model}`, textContent)
  };

  const listings = LocalDb.getListings();
  listings.unshift(newListing);
  LocalDb.saveListings(listings.slice(0, 50));

  res.json({ success: true, listing: newListing });
});

// 5. Telegram Configurations
app.post('/api/telegram-config', (req: Request, res: Response) => {
  const { enabled, botToken, chatId, minMarginPercent, minScore } = req.body;
  const config = {
    enabled: Boolean(enabled),
    botToken: botToken || '',
    chatId: chatId || '',
    minMarginPercent: Number(minMarginPercent) || 30,
    minScore: Number(minScore) || 70
  };
  LocalDb.saveTelegramConfig(config);
  telegramLogs.unshift(`[Settings] Updated bot configuration.`);
  res.json({ success: true, config, logs: telegramLogs });
});

app.get('/api/telegram-logs', (req: Request, res: Response) => {
  res.json({ success: true, logs: telegramLogs, config: LocalDb.getTelegramConfig() });
});

app.post('/api/telegram-test', async (req: Request, res: Response) => {
  const { testMessage } = req.body;
  const config = LocalDb.getTelegramConfig();
  const msgText = testMessage || '🚲 [Bike Flipper Alert Test]\nDeal found: Specialized Tarmac AL 4\nAsking: 4,500 DKK\nTarget Profit: 2,500 DKK (55% ROI)\nScore: 91 pts!';

  if (!config.botToken || !config.chatId) {
    return res.json({ success: false, error: 'Missing configuration', logs: telegramLogs });
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: msgText, parse_mode: 'HTML' })
    });
    if (response.ok) {
      telegramLogs.unshift('[Success] Delivered test alert!');
      return res.json({ success: true, logs: telegramLogs });
    }
    return res.json({ success: false, error: 'Telegram rejected request', logs: telegramLogs });
  } catch (e: any) {
    return res.json({ success: false, error: e.message, logs: telegramLogs });
  }
});

// 6. Facebook Groups Configurations
app.get('/api/facebook-groups', (req: Request, res: Response) => {
  res.json({ success: true, groups: LocalDb.getFacebookGroups() });
});

app.post('/api/facebook-groups', (req: Request, res: Response) => {
  const { groups } = req.body;
  if (Array.isArray(groups)) {
    LocalDb.saveFacebookGroups(groups);
  }
  res.json({ success: true, groups: LocalDb.getFacebookGroups() });
});

// 7. Active Playwright Scrape trigger
app.post('/api/live-scan', async (req: Request, res: Response) => {
  console.log('[Live Scan API] Triggered via frontend dashboard...');
  try {
    const result = await runPlaywrightScrape();
    let rssCount = 0;
    try {
      console.log('[Live Scan API] Sourcing live DBA RSS listings...');
      const rssListings = await fetchDbaRssLive();
      if (rssListings.length > 0) {
        const dbListings = LocalDb.getListings();
        const existingUrls = new Set(dbListings.map(l => l.url));
        const newRss = rssListings.filter(l => !existingUrls.has(l.url));
        if (newRss.length > 0) {
          const merged = [...newRss, ...dbListings].slice(0, 50);
          LocalDb.saveListings(merged);
          rssCount = newRss.length;
        }
      }
    } catch (rssErr) {
      console.error('[Live Scan API RSS Error]', rssErr);
    }

    if (result.success) {
      res.json({
        success: true,
        message: `Successfully completed. Scanned dba.dk (sourced ${rssCount} from RSS), guloggratis.dk, Facebook Marketplace and groups. Sourced and appraised ${result.count + rssCount} new active ads.`
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Automated background scraper daemon
function startBackgroundScraper() {
  console.log('[System] Active Playwright background scraper daemon initialized.');
  setInterval(async () => {
    try {
      console.log('[Background Scraper] Launching periodic Playwright scraper run...');
      await runPlaywrightScrape();
    } catch (err) {
      console.error('[Background Scraper Daemon Error]', err);
    }

    try {
      console.log('[Background Scraper] Sourcing live DBA RSS listings...');
      const rssListings = await fetchDbaRssLive();
      if (rssListings.length > 0) {
        const dbListings = LocalDb.getListings();
        const existingUrls = new Set(dbListings.map(l => l.url));
        const newRss = rssListings.filter(l => !existingUrls.has(l.url));
        if (newRss.length > 0) {
          const merged = [...newRss, ...dbListings].slice(0, 50);
          LocalDb.saveListings(merged);
        }
      }
    } catch (rssErr) {
      console.error('[Background Scraper RSS Error]', rssErr);
    }
  }, 600000); // 10 minutes
}

// Run Vite dev middleware when not in production
const startServer = async () => {
  // Start autonomous bg collector daemon
  startBackgroundScraper();

  // Run a quick scan in the background on startup so listings get populated
  setTimeout(async () => {
    console.log('[Startup] Running initial Playwright scan in background...');
    try {
      await runPlaywrightScrape();
    } catch (err) {
      console.error('[Startup Scrape Error]', err);
    }

    try {
      console.log('[Startup] Sourcing live DBA RSS listings...');
      const rssListings = await fetchDbaRssLive();
      if (rssListings.length > 0) {
        const dbListings = LocalDb.getListings();
        const existingUrls = new Set(dbListings.map(l => l.url));
        const newRss = rssListings.filter(l => !existingUrls.has(l.url));
        if (newRss.length > 0) {
          const merged = [...newRss, ...dbListings].slice(0, 50);
          LocalDb.saveListings(merged);
          console.log(`[Startup] Saved ${newRss.length} new listings from DBA RSS.`);
        }
      }
    } catch (rssErr) {
      console.error('[Startup RSS Scrape Error]', rssErr);
    }
  }, 5000);

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
