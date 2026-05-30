import 'dotenv/config';
import { getEstimatedNewPrice } from './src/data/benchmarkData.js';

function calculateCustomScore(
  askingPrice: number,
  retailNewPrice: number,
  brand: string,
  size: string,
  condition: string
) {
  return {
    score: 80,
    resellEstimate: askingPrice + 2000,
    potentialMargin: 2000,
    potentialMarginPercent: 30
  };
}

async function fetchDbaHtmlLive() {
  const feeds = [
    { url: 'https://www.dba.dk/cykler/racercykler-og-gravelcykler/', filterBrands: false },
    { url: 'https://www.dba.dk/cykler/herrecykler/racercykler/', filterBrands: false }
  ];

  const sportsBrands = [
    'specialized', 'canyon', 'trek', 'giant', 'cervelo', 'bianchi', 
    'cannondale', 'bmc', 'pinarello', 'merida', 'scott', 'principia',
    'ridley', 'orbea', 'cube', 'rose', 'focus', 'wilier', 'felt', 'argon'
  ];

  const listingsMap = new Map();

  for (const feed of feeds) {
    try {
      console.log(`[HTML Search] Fetching from DBA category: ${feed.url}`);
      const response = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        console.warn(`[HTML Search] DBA failed with status: ${response.status}`);
        continue;
      }

      const htmlText = await response.text();
      console.log(`[HTML Search] Read HTML size: ${htmlText.length}`);
      
      const articleRegex = /<article[^>]*class="[^"]*sf-search-ad[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
      let match;
      let count = 0;
      let feedParsed = 0;

      while ((match = articleRegex.exec(htmlText)) !== null) {
        count++;
        const articleHtml = match[1];

        // 1. Extract link
        const linkMatch = articleHtml.match(/href="([^"]*?recommerce\/forsale\/item\/(\d+)[^"]*?)"/) || 
                          articleHtml.match(/href="([^"]*?\/id-(\d+)[^"]*?)"/) || 
                          articleHtml.match(/href="([^"]*?)"/);
        if (!linkMatch) continue;
        const url = linkMatch[1];
        const id = linkMatch[2] || `dba_${Date.now()}_${count}`;

        if (listingsMap.has(url)) continue;

        // 2. Extract title
        const titleMatch = articleHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
        if (!titleMatch) continue;
        const title = titleMatch[1].trim()
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#039;/g, "'");

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

        const titleLower = title.toLowerCase();
        if (feed.filterBrands) {
          const hasSportsBrand = sportsBrands.some(b => titleLower.includes(b));
          if (!hasSportsBrand) continue;
        }

        let brand = 'Other Brand';
        for (const b of sportsBrands) {
          if (titleLower.includes(b)) {
            brand = b.charAt(0).toUpperCase() + b.slice(1);
            break;
          }
        }

        listingsMap.set(url, {
          id: `dba_rss_${id}`,
          title,
          url,
          price,
          brand,
          imageUrl
        });
        feedParsed++;
      }
      console.log(`[HTML Search] Feed parsed. Sourced ${feedParsed} new listings.`);
    } catch (err) {
      console.error('[HTML Search Error] Error:', err);
    }
  }
  console.log(`[HTML Search] Sourced ${listingsMap.size} listings total.`);
}

fetchDbaHtmlLive();
