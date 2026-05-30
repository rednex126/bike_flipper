import { chromium } from 'playwright';
import { GoogleGenAI } from '@google/genai';
import { LocalDb } from '../db/localDb';
import { BicycleListing, ScoringParams, TelegramConfig } from '../types';
import { getEstimatedNewPrice } from '../data/benchmarkData';

export function resolveLocationCoords(locationText: string): {
  region: 'Hovedstaden' | 'Sjælland' | 'Syddanmark' | 'Midtjylland' | 'Nordjylland';
  latitude: number;
  longitude: number;
} {
  const locLower = (locationText || '').toLowerCase().trim();
  
  // Defaults
  let region: 'Hovedstaden' | 'Sjælland' | 'Syddanmark' | 'Midtjylland' | 'Nordjylland' = 'Hovedstaden';
  let latitude = 55.6761;
  let longitude = 12.5683;

  if (locLower.includes('aarhus') || locLower.includes('randers') || locLower.includes('horsens') || locLower.includes('silkeborg') || locLower.includes('herning') || locLower.includes('viborg') || locLower.includes('holstebro') || locLower.includes('midtjylland')) {
    region = 'Midtjylland';
    if (locLower.includes('aarhus')) { latitude = 56.1567; longitude = 10.2108; }
    else if (locLower.includes('randers')) { latitude = 56.4607; longitude = 10.0364; }
    else if (locLower.includes('horsens')) { latitude = 55.8606; longitude = 9.8503; }
    else if (locLower.includes('viborg')) { latitude = 56.4520; longitude = 9.4019; }
    else if (locLower.includes('silkeborg')) { latitude = 56.1697; longitude = 9.5451; }
    else if (locLower.includes('herning')) { latitude = 56.1393; longitude = 8.9738; }
    else if (locLower.includes('holstebro')) { latitude = 56.3601; longitude = 8.6161; }
    else { latitude = 56.2000; longitude = 9.5000; }
  } else if (locLower.includes('odense') || locLower.includes('esbjerg') || locLower.includes('vejle') || locLower.includes('kolding') || locLower.includes('sønderborg') || locLower.includes('fyn') || locLower.includes('syddanmark')) {
    region = 'Syddanmark';
    if (locLower.includes('odense')) { latitude = 55.4038; longitude = 10.4024; }
    else if (locLower.includes('esbjerg')) { latitude = 55.4702; longitude = 8.4519; }
    else if (locLower.includes('vejle')) { latitude = 55.7090; longitude = 9.5350; }
    else if (locLower.includes('kolding')) { latitude = 55.4904; longitude = 9.4721; }
    else if (locLower.includes('sønderborg')) { latitude = 54.9138; longitude = 9.7822; }
    else { latitude = 55.3000; longitude = 9.3000; }
  } else if (locLower.includes('aalborg') || locLower.includes('skagen') || locLower.includes('hjørring') || locLower.includes('nordjylland')) {
    region = 'Nordjylland';
    if (locLower.includes('aalborg')) { latitude = 57.0488; longitude = 9.9217; }
    else if (locLower.includes('hjørring')) { latitude = 57.4652; longitude = 9.9850; }
    else { latitude = 57.1000; longitude = 9.8000; }
  } else if (locLower.includes('roskilde') || locLower.includes('slagelse') || locLower.includes('næstved') || locLower.includes('køge') || locLower.includes('sjælland')) {
    region = 'Sjælland';
    if (locLower.includes('roskilde')) { latitude = 55.6419; longitude = 12.0878; }
    else if (locLower.includes('slagelse')) { latitude = 55.4028; longitude = 11.3547; }
    else if (locLower.includes('næstved')) { latitude = 55.2299; longitude = 11.7609; }
    else if (locLower.includes('køge')) { latitude = 55.4580; longitude = 12.1821; }
    else { latitude = 55.5000; longitude = 11.8000; }
  } else {
    region = 'Hovedstaden';
    if (locLower.includes('taastrup')) { latitude = 55.6517; longitude = 12.2743; }
    else if (locLower.includes('hillerød')) { latitude = 55.9288; longitude = 12.3009; }
    else { latitude = 55.6761; longitude = 12.5683; }
  }

  latitude += (Math.random() - 0.5) * 0.04;
  longitude += (Math.random() - 0.5) * 0.04;

  return { region, latitude, longitude };
}

export function classifyBike(title: string, description: string): 'Road' | 'Gravel' | 'MTB' | 'Sports' | 'Other' {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  // 1. Check for Gravel
  if (
    text.includes('gravel') || 
    text.includes('grizl') || 
    text.includes('topstone') || 
    text.includes('diverge') ||
    text.includes('checkpoint') ||
    text.includes('aspero') ||
    text.includes('gravelcykel')
  ) {
    return 'Gravel';
  }
  
  // 2. Check for Mountain Bike (MTB)
  if (
    text.includes('mountainbike') || 
    text.includes('mtb') || 
    text.includes('hardtail') || 
    text.includes('full suspension') || 
    text.includes('fullsu') ||
    text.includes('dæmper') ||
    text.includes('skovcykel') || 
    text.includes('marlin') || 
    text.includes('scott scale') || 
    text.includes('superfly') || 
    text.includes('chisel') || 
    text.includes('rockhopper') ||
    text.includes('trail') ||
    text.includes('downhill') ||
    text.includes('cross country') ||
    text.includes('epic') ||
    text.includes('spark')
  ) {
    return 'MTB';
  }
  
  // 3. Check for Road Bike
  if (
    text.includes('racer') || 
    text.includes('landevej') || 
    text.includes('road') || 
    text.includes('tarmac') || 
    text.includes('madone') || 
    text.includes('domane') || 
    text.includes('emonda') || 
    text.includes('endurace') || 
    text.includes('ultimate') || 
    text.includes('cervelo') || 
    text.includes('felt') || 
    text.includes('principia rcs') ||
    text.includes('racercykel') ||
    text.includes('carboncykel') ||
    text.includes('tt-cykel') ||
    text.includes('triathlon') ||
    text.includes('venge') ||
    text.includes('roubaix') ||
    text.includes('allez')
  ) {
    return 'Road';
  }
  
  // 4. Check for Sports/Hybrid
  if (
    text.includes('sport') || 
    text.includes('motion') || 
    text.includes('hybrid') || 
    text.includes('cross') || 
    text.includes('fitness') || 
    text.includes('principia') || 
    text.includes('mbk') || 
    text.includes('kildemoes sport') || 
    text.includes('trek fx') || 
    text.includes('specialized sirrus') ||
    text.includes('hverdagsracer') ||
    text.includes('street')
  ) {
    return 'Sports';
  }
  
  return 'Other';
}


// Helper to download image as base64
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    let mimeType = res.headers.get('content-type') || 'image/jpeg';
    if (!mimeType.startsWith('image/')) {
      mimeType = 'image/jpeg';
    }
    
    return { data: base64, mimeType };
  } catch (err) {
    console.error('[Scraper] Failed to fetch image as base64:', url, err);
    return null;
  }
}

// Scrape DBA.dk search page
async function scrapeDba(page: any): Promise<any[]> {
  const urls = [
    'https://www.dba.dk/cykler/racercykler-og-gravelcykler/',
    'https://www.dba.dk/cykler/mountainbikes/'
  ];
  const allItems: any[] = [];
  for (const url of urls) {
    console.log(`[Playwright Scraper] Loading DBA: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);

      // Attempt to dismiss cookie banner
      try {
        await page.click('#declineButton', { timeout: 3000 }).catch(() => {});
        await page.click('button:has-text("Accepter")', { timeout: 3000 }).catch(() => {});
      } catch(e) {}

      const items = await page.evaluate(() => {
        // Look for article tags or dbaCard classes
        const cards = Array.from(document.querySelectorAll('article, .dbaCard, tr.dbaCard'));
        return cards.map(card => {
          // Find the link
          const linkEl = card.querySelector('a.sf-search-ad-link, a[href*="/item/"], a[href*="/id-"], a[class*="link"]');
          if (!linkEl) return null;
          
          const href = linkEl.getAttribute('href') || '';
          const fullUrl = href.startsWith('http') ? href : `https://www.dba.dk${href}`;

          // Extract title
          const titleEl = card.querySelector('h2, [class*="title"]');
          let title = titleEl ? titleEl.textContent?.trim() || '' : '';
          if (!title) {
            title = linkEl.getAttribute('title') || linkEl.getAttribute('aria-label') || '';
          }
          if (!title) return null;
          
          // Extract price
          let price = 0;
          const text = card.textContent || '';
          const priceMatch = text.match(/([\d\.]+)\s*kr/i);
          if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/\./g, ''), 10);
          } else {
            const priceEl = card.querySelector('.price, [class*="price"]');
            if (priceEl) {
              const txt = priceEl.textContent || '';
              const num = txt.replace(/\D/g, '');
              price = num ? parseInt(num, 10) : 0;
            }
          }

          // Extract image
          const imgEl = card.querySelector('img');
          const imageUrl = imgEl ? imgEl.getAttribute('src') || imgEl.getAttribute('data-original') || imgEl.getAttribute('data-src') || '' : '';

          // Description snippet
          const descEl = card.querySelector('.details, [class*="description"], p');
          const description = descEl ? descEl.textContent?.trim() || '' : '';

          // Extract location
          const locEl = card.querySelector('div.text-xs.s-text-subtle span, [class*="location"], span[class*="truncate"]');
          const location = locEl ? locEl.textContent?.trim() || 'København' : 'København';

          return {
            title,
            url: fullUrl,
            price,
            imageUrl,
            description,
            location,
            source: 'dba.dk' as const
          };
        }).filter(item => item && item.price > 0 && item.title);
      });
      allItems.push(...items);
    } catch(err) {
      console.error(`[Scraper] Error loading DBA URL ${url}:`, err);
    }
  }

  console.log(`[Playwright Scraper] Sourced ${allItems.length} raw listings from DBA.`);
  return allItems;
}

// Scrape GulogGratis.dk search page
async function scrapeGulogGratis(page: any): Promise<any[]> {
  const urls = [
    'https://www.guloggratis.dk/kategori/q-racer',
    'https://www.guloggratis.dk/kategori/q-mountainbike'
  ];
  const allItems: any[] = [];
  
  for (const url of urls) {
    console.log(`[Playwright Scraper] Loading GulogGratis: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);

      try {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const okButton = buttons.find(b => b.textContent?.trim() === 'OK');
          if (okButton) okButton.click();
        });
        await page.waitForTimeout(3000);
      } catch(e) {}

      const items = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/annonce/"]:not([href="/annonce/opret"])'));
        return anchors.map(a => {
          const href = a.getAttribute('href') || '';
          const fullUrl = href.startsWith('http') ? href : `https://www.guloggratis.dk${href}`;
          
          const titleEl = a.querySelector('h4, h3, [class*="title"]');
          let title = titleEl ? titleEl.textContent?.trim() || '' : '';
          if (!title) {
            title = a.getAttribute('title') || a.getAttribute('aria-label') || '';
          }
          if (!title) return null;

          // Scan text content of the card to find price in kr
          const text = a.textContent || '';
          const priceMatch = text.replace(/fremhævet/i, '').match(/([\d\.]+)\s*kr/i);
          let price = 0;
          if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/\./g, ''), 10);
          }

          const imgEl = a.querySelector('img');
          const imageUrl = imgEl ? imgEl.getAttribute('src') || '' : '';

          // Extract location
          const locEl = a.querySelector('header p span.truncate, header p');
          const locationText = locEl ? locEl.textContent?.trim() || 'København' : 'København';
          const location = locationText.replace(/·/g, '').replace(/\d+/g, '').trim() || 'København';

          return {
            title,
            url: fullUrl,
            price,
            imageUrl,
            description: 'GulogGratis Listing',
            location,
            source: 'guloggratis.dk' as const
          };
        }).filter(Boolean);
      });
      allItems.push(...items);
    } catch(err) {
      console.error(`[Scraper] Error loading GulogGratis URL ${url}:`, err);
    }
  }

  console.log(`[Playwright Scraper] Sourced ${allItems.length} raw listings from GulogGratis.`);
  return allItems;
}

// Scrape Facebook Marketplace (Copenhagen racer bikes)
async function scrapeFacebookMarketplace(page: any): Promise<any[]> {
  const urls = [
    'https://www.facebook.com/marketplace/copenhagen/search?query=racer',
    'https://www.facebook.com/marketplace/copenhagen/search?query=mountainbike'
  ];
  const allItems: any[] = [];

  for (const url of urls) {
    console.log(`[Playwright Scraper] Loading Facebook Marketplace: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3000);

      try {
        await page.click('div[aria-label="Luk"]', { timeout: 3000 }).catch(() => {});
        await page.click('div[aria-label="Close"]', { timeout: 3000 }).catch(() => {});
      } catch(e) {}

      const items = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
        return anchors.map(a => {
          const href = a.getAttribute('href') || '';
          const cleanHref = href.split('?')[0];
          const fullUrl = cleanHref.startsWith('http') ? cleanHref : `https://www.facebook.com${cleanHref}`;

          const textContent = a.textContent || '';
          const priceMatch = textContent.match(/([\d\.]+)\s*(?:kr|DKK)/i);
          let price = 0;
          if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/\./g, ''), 10);
          }

          const lines = textContent.split('\n').map(l => l.trim()).filter(Boolean);
          let title = textContent.replace(/[\d\.]+\s*(?:kr|DKK)/gi, '').trim();
          title = title.split('\n')[0] || 'Facebook Bike';

          // Extract location: lines[2] usually holds location
          const location = lines[2] || 'København';

          const imgEl = a.querySelector('img');
          const imageUrl = imgEl ? imgEl.getAttribute('src') || '' : '';

          return {
            title,
            url: fullUrl,
            price,
            imageUrl,
            description: 'Facebook Marketplace Listing',
            location,
            source: 'facebook' as const
          };
        }).filter(item => item && item.price > 0);
      });
      allItems.push(...items);
    } catch(err) {
      console.error(`[Scraper] Error loading Facebook URL ${url}:`, err);
    }
  }

  console.log(`[Playwright Scraper] Sourced ${allItems.length} raw listings from Facebook Marketplace.`);
  return allItems;
}

// Scrape a specific Facebook Group
async function scrapeFacebookGroup(page: any, groupUrl: string): Promise<any[]> {
  console.log(`[Playwright Scraper] Loading Facebook Group: ${groupUrl}`);
  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);

  const items = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]'));
    return anchors.map(a => {
      const href = a.getAttribute('href') || '';
      const fullUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
      
      const postContainer = a.closest('[role="article"]') || a.closest('div[data-ad-preview]');
      const text = postContainer ? postContainer.textContent || '' : '';
      
      const priceMatch = text.match(/([\d\.]+)\s*(?:kr|DKK)/i);
      let price = priceMatch ? parseInt(priceMatch[1].replace(/\./g, ''), 10) : 0;
      
      let title = text.slice(0, 50).replace(/\n/g, ' ').trim() + '...';
      
      const imgEl = postContainer ? postContainer.querySelector('img') : null;
      const imageUrl = imgEl ? imgEl.getAttribute('src') || '' : '';

      return {
        title,
        url: fullUrl,
        price,
        imageUrl,
        description: text.slice(0, 400),
        location: 'København',
        source: 'facebook' as const
      };
    }).filter(item => item && item.price > 0);
  });

  console.log(`[Playwright Scraper] Sourced ${items.length} listings from Facebook Group: ${groupUrl}`);
  return items;
}

// Deep details scraper (visits individual page to get higher res image and full text)
async function scrapeDetailExtra(page: any, url: string, source: string): Promise<{ fullDesc: string; highResImage: string }> {
  try {
    console.log(`[Playwright Scraper] Opening details page: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    return await page.evaluate((src: string) => {
      let fullDesc = '';
      let highResImage = '';

      if (src === 'dba.dk') {
        const descEl = document.querySelector('.vip-additional-text, .vip-description-text, [class*="description"], main p, article p, [class*="text"]');
        fullDesc = descEl ? descEl.textContent?.trim() || '' : '';
        
        const mainImgEl = document.querySelector('.vip-gallery-main-image img, .vip-gallery img, .carousel img, img[class*="carousel"], img[class*="image"], img');
        highResImage = mainImgEl ? mainImgEl.getAttribute('src') || mainImgEl.getAttribute('data-src') || '' : '';
      } else if (src === 'guloggratis.dk') {
        const descEl = document.querySelector('[class*="description"], [class*="ListingDescription"], main p, [class*="text"]');
        fullDesc = descEl ? descEl.textContent?.trim() || '' : '';
        
        const mainImgEl = document.querySelector('[class*="gallery"] img, [class*="ImageGallery"] img, img');
        highResImage = mainImgEl ? mainImgEl.getAttribute('src') || '' : '';
      } else {
        const descEl = document.querySelector('div[data-testid="marketplace_feed_item_description"], main p, article p, [class*="description"]');
        fullDesc = descEl ? descEl.textContent?.trim() || '' : '';
      }

      return { fullDesc, highResImage };
    }, source);
  } catch (e) {
    console.error(`[Scraper] Error scraping details for ${url}:`, e);
    return { fullDesc: '', highResImage: '' };
  }
}

// Main scheduler interface function
export async function runPlaywrightScrape(): Promise<{ success: boolean; count: number; error?: string }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const dbListings = LocalDb.getListings();
  const existingUrls = new Set(dbListings.map(l => l.url));
  const fbGroups = LocalDb.getFacebookGroups();
  const scoringParams = LocalDb.getScoringParams();
  const telegramConfig = LocalDb.getTelegramConfig();

  let browser;
  try {
    console.log('[Playwright Scraper] Launching Playwright browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    let rawListings: any[] = [];

    // 1. Scrape DBA
    try {
      const dbaItems = await scrapeDba(page);
      rawListings.push(...dbaItems);
    } catch (err) {
      console.error('[Scraper] Error scraping DBA:', err);
    }

    // 2. Scrape GulogGratis
    try {
      const ggItems = await scrapeGulogGratis(page);
      rawListings.push(...ggItems);
    } catch (err) {
      console.error('[Scraper] Error scraping GulogGratis:', err);
    }

    // 3. Scrape Facebook Marketplace
    try {
      const fbItems = await scrapeFacebookMarketplace(page);
      rawListings.push(...fbItems);
    } catch (err) {
      console.error('[Scraper] Error scraping FB Marketplace:', err);
    }

    // 4. Scrape Facebook Groups
    for (const groupUrl of fbGroups) {
      try {
        const groupItems = await scrapeFacebookGroup(page, groupUrl);
        rawListings.push(...groupItems);
      } catch (err) {
        console.error(`[Scraper] Error scraping group ${groupUrl}:`, err);
      }
    }

    // Filter out duplicates in current scan AND already processed listings
    // Exclude unwanted categories (parts, accessories) or "wanted" ads
    const excludeKeywords = [
      'søger', 'købes', 'byttes', 'lejes', 'sadel', 'hjul', 'dæk', 'slange', 
      'hjelm', 'tøj', 'sko', 'briller', 'pedaler', 'ramme', 'gaffel', 
      'gear', 'dele', 'reservedele', 'styr', 'sadelpind', 'strik', 'hvalpe', 
      'hund', 'kat', 'høner', 'haner', 'lego'
    ];

    const uniqueRaw = rawListings.filter((item, index, self) => {
      if (!item) return false;
      if (item.price < 1000 || item.price > 120000) return false;
      if (existingUrls.has(item.url)) return false;
      if (self.findIndex(t => t.url === item.url) !== index) return false;
      
      const titleLower = item.title.toLowerCase();
      const descLower = (item.description || '').toLowerCase();
      const isExcluded = excludeKeywords.some(keyword => 
        titleLower.includes(keyword) || descLower.includes(keyword)
      );
      
      return !isExcluded;
    });

    console.log(`[Scraper] Found ${uniqueRaw.length} BRAND NEW listings to appraise.`);

    const newListings: BicycleListing[] = [];

    // Initialize Gemini AI client if key is configured
    let ai: GoogleGenAI | null = null;
    if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY' && geminiKey.trim().length > 0) {
      ai = new GoogleGenAI({ apiKey: geminiKey });
    }

    // Limit processing to top 5 new items per scan to save API tokens
    const itemsToProcess = uniqueRaw.slice(0, 5);

    for (const item of itemsToProcess) {
      try {
        // Fetch detailed page
        const details = await scrapeDetailExtra(page, item.url, item.source);
        const finalDescription = details.fullDesc || item.description || 'No description provided';
        const finalImage = details.highResImage || item.imageUrl || '';

        let appraisal = {
          brand: item.title.split(' ')[0] || 'Unknown',
          model: item.title.replace(item.title.split(' ')[0], '').trim() || 'Road Bike',
          size: '56 cm',
          condition: 'Good',
          estimatedRetailNew: getEstimatedNewPrice(item.title, ''),
          resellEstimate: Math.round(item.price * 1.3),
          pros: ['Sourced from live scrapers'],
          cons: ['Check details'],
          photoScore: 60,
          photoFeedback: 'Standard listing photos. Consider retaking in better daylight.',
          recommendation: 'A decent prospect. Contact seller for a viewing.'
        };

        let base64ImageObj = null;
        if (finalImage && ai) {
          base64ImageObj = await fetchImageAsBase64(finalImage);
        }

        if (ai) {
          console.log(`[Scraper] Running Multimodal Gemini appraisal for: ${item.title}`);
          const prompt = `You are a professional cycling appraiser of the Danish bicycle marketplace (using DKK - Danish Krone).
Analyze this bicycle classified listing:
Title: "${item.title}"
Price: ${item.price} DKK
Description: "${finalDescription}"
URL Source: ${item.source}

Evaluate:
1. Brand & Model (Verify and extract properly, e.g. Specialized Tarmac, Canyon Grizl).
2. Frame Size (Find size like 54 cm, 56 cm, M, L).
3. Bike Condition (MUST be one of: 'Like New', 'Good', 'Fair', 'Needs Service').
4. Original retail price of this bike model in DKK when brand-new.
5. Estimated realistic resale value in DKK on the Danish used market.
6. Evaluate the quality of the listing photograph(s) (Provide a photoScore from 0 to 100, and short actionable feedback/photoFeedback on whether the photo is dark/blurry/poorly angled and what needs to be changed for a better flip).
7. Pros, Cons and a concise 1-2 sentence recommendation for a flipping entrepreneur.

Respond strictly in valid JSON format matching this schema:
{
  "brand": "extracted brand name",
  "model": "extracted model name",
  "size": "extracted size",
  "condition": "Like New | Good | Fair | Needs Service",
  "estimatedRetailNew": number,
  "resellEstimate": number,
  "pros": ["string"],
  "cons": ["string"],
  "photoScore": number, // 0-100
  "photoFeedback": "specific feedback on image quality and how to improve it for resale",
  "recommendation": "recommendation text"
}`;

          let contents: any[] = [];
          if (base64ImageObj) {
            contents.push({
              inlineData: {
                data: base64ImageObj.data,
                mimeType: base64ImageObj.mimeType
              }
            });
          }
          contents.push(prompt);

          try {
            const response = await ai.models.generateContent({
              model: 'gemini-3.5-flash',
              contents,
              config: { responseMimeType: 'application/json' }
            });

            const resText = response.text || '';
            const parsedGemini = JSON.parse(resText.trim());
            appraisal = { ...appraisal, ...parsedGemini };
          } catch (aiErr: any) {
            console.warn(`[Scraper] Gemini API call failed for ${item.title}, using heuristic fallback:`, aiErr.message || aiErr);
          }
        } else {
          console.log(`[Scraper] Gemini API not active, running local heuristic appraisal for: ${item.title}`);
        }

        // Calculate score with adjustable params
        const retailNew = appraisal.estimatedRetailNew || getEstimatedNewPrice(appraisal.brand, appraisal.model);
        const priceRatio = item.price / retailNew;
        
        let priceRatioScore = 100;
        if (priceRatio < 0.3) priceRatioScore = 100;
        else if (priceRatio > 0.8) priceRatioScore = 20;
        else priceRatioScore = Math.round(100 - (priceRatio - 0.3) * 160);
        priceRatioScore = Math.max(0, Math.min(100, priceRatioScore));

        let brandScore = 50;
        const normBrand = appraisal.brand.toLowerCase();
        if (['specialized', 'trek', 'canyon', 'cervelo', 'cannondale'].includes(normBrand)) brandScore = 95;
        else if (['giant', 'scott', 'bianchi', 'pinarello'].includes(normBrand)) brandScore = 80;

        let sizeScore = 50;
        const normSize = appraisal.size.toLowerCase();
        if (['54', '56', 'm', 'l'].some(s => normSize.includes(s))) sizeScore = 100;
        else if (['52', '58', 's'].some(s => normSize.includes(s))) sizeScore = 85;

        let conditionScore = 50;
        if (appraisal.condition === 'Like New') conditionScore = 95;
        else if (appraisal.condition === 'Good') conditionScore = 80;
        else if (appraisal.condition === 'Fair') conditionScore = 60;
        else if (appraisal.condition === 'Needs Service') conditionScore = 30;

        const totalWeight = scoringParams.brandFactor + scoringParams.sizeFactor + scoringParams.conditionFactor + scoringParams.priceRatioFactor;
        const finalScore = Math.round(
          (brandScore * scoringParams.brandFactor +
           sizeScore * scoringParams.sizeFactor +
           conditionScore * scoringParams.conditionFactor +
           priceRatioScore * scoringParams.priceRatioFactor) / totalWeight
        );

        const potentialMargin = appraisal.resellEstimate - item.price;
        const potentialMarginPercent = item.price > 0 ? Math.round((potentialMargin / item.price) * 100) : 0;

        // Geolocation resolution based on scraped location string
        const geo = resolveLocationCoords(item.location || 'København');

        const category = classifyBike(`${appraisal.brand} ${appraisal.model}`, finalDescription);
        if (category === 'Other') {
          console.log(`[Scraper] Skipping ${item.title} as it is classified as 'Other' (not a road, gravel, mtb, or sports bike).`);
          continue;
        }

        const listing: BicycleListing = {
          id: `${item.source}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          title: `${appraisal.brand} ${appraisal.model} ${appraisal.size}`,
          description: finalDescription.substring(0, 500) + (finalDescription.length > 500 ? '...' : ''),
          url: item.url,
          source: item.source,
          price: item.price,
          brand: appraisal.brand,
          model: appraisal.model,
          size: appraisal.size,
          condition: appraisal.condition,
          publishedAt: 'Lige nu (Playwright Scanned)',
          estimatedRetailNew: retailNew,
          score: finalScore,
          resellEstimate: appraisal.resellEstimate,
          potentialMargin,
          potentialMarginPercent,
          pros: [
            ...appraisal.pros,
            `Photo score: ${appraisal.photoScore}/100`,
            `Photo feedback: ${appraisal.photoFeedback}`
          ],
          cons: appraisal.cons,
          recommendation: appraisal.recommendation,
          region: geo.region,
          latitude: geo.latitude,
          longitude: geo.longitude,
          category
        };


        newListings.push(listing);

        // 5. Check if it meets Telegram requirements and notify!
        if (telegramConfig.enabled && telegramConfig.botToken && telegramConfig.chatId) {
          const meetsMargin = potentialMarginPercent >= telegramConfig.minMarginPercent;
          const meetsScore = finalScore >= telegramConfig.minScore;

          if (meetsMargin && meetsScore) {
            const tgMsg = `🚲 <b>[NEW REAL DEAL DETECTED]</b>\n\n` +
                          `🚴 <b>${listing.title}</b> (${listing.size})\n` +
                          `🌐 Source: <code>${listing.source}</code>\n` +
                          `💵 Price: <b>${listing.price.toLocaleString('da-DK')} DKK</b>\n` +
                          `🎯 Est. Resell: <b>${listing.resellEstimate.toLocaleString('da-DK')} DKK</b>\n` +
                          `📈 Margin: <b>${listing.potentialMargin.toLocaleString('da-DK')} DKK (${listing.potentialMarginPercent}%)</b>\n` +
                          `⭐ Score: <b>${listing.score} / 100</b>\n` +
                          `📸 Photo score: <b>${appraisal.photoScore}/100</b>\n` +
                          `💡 Photo feedback: <i>${appraisal.photoFeedback}</i>\n\n` +
                          `🔗 <a href="${listing.url}">Open Listing (Real Link)</a>`;

            const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
            await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: telegramConfig.chatId,
                text: tgMsg,
                parse_mode: 'HTML'
              })
            }).catch(e => console.error('[Scraper] Telegram notify failed:', e));
          }
        }
      } catch (err) {
        console.error(`[Scraper] Error appraising item ${item.title}:`, err);
      }
    }

    // Merge into local DB
    if (newListings.length > 0) {
      const mergedListings = [...newListings, ...dbListings].slice(0, 50);
      LocalDb.saveListings(mergedListings);
    }

    await browser.close();
    return { success: true, count: newListings.length };

  } catch (err: any) {
    console.error('[Scraper] Critical Scraper failure:', err);
    if (browser) await (browser as any).close();
    return { success: false, count: 0, error: err.message };
  }
}
