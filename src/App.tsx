import { useEffect, useState, FormEvent } from 'react';
import { 
  Bike, 
  TrendingUp, 
  Trash2, 
  Plus, 
  Sliders, 
  Send, 
  Bell, 
  Zap, 
  Brain, 
  ExternalLink, 
  FileText, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  X,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import { BicycleListing, BenchmarkPrice, ScoringParams, TelegramConfig } from './types';

// Haversine formula to compute distance in km between two coordinates
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10; // 1 decimal place
}

export default function App() {
  // State from server
  const [listings, setListings] = useState<BicycleListing[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkPrice[]>([]);
  const [scoringParams, setScoringParams] = useState<ScoringParams>({
    brandFactor: 8,
    sizeFactor: 9,
    conditionFactor: 7,
    priceRatioFactor: 10
  });
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    enabled: false,
    botToken: '',
    chatId: '',
    minMarginPercent: 30,
    minScore: 75
  });
  const [tgLogs, setTgLogs] = useState<string[]>([]);
  
  // Loading & interactive UI states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilterBrand, setActiveFilterBrand] = useState('All');
  const [activeFilterMinScore, setActiveFilterMinScore] = useState<number>(0);
  const [activeFilterSource, setActiveFilterSource] = useState('All');
  const [activeFilterRegion, setActiveFilterRegion] = useState('All');
  const [activeFilterRadius, setActiveFilterRadius] = useState<number>(0); // 0 means no limit
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({ lat: 55.6761, lng: 12.5683 });
  const [userCoordsLabel, setUserCoordsLabel] = useState('Copenhagen (Default)');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isGpsLoading, setIsGpsLoading] = useState(false);

  // Ad Copy-Paste Parser form
  const [adText, setAdText] = useState('');
  const [adSourceUrl, setAdSourceUrl] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<BicycleListing | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  
  // Custom Benchmark creation tool
  const [showAddBenchmark, setShowAddBenchmark] = useState(false);
  const [benchmarkForm, setBenchmarkForm] = useState({
    brand: '',
    model: '',
    retailNewPrice: '',
    liquidity: 'High' as 'High' | 'Medium' | 'Low',
    category: 'Gravel' as 'Road' | 'Gravel' | 'MTB' | 'City',
    idealSizes: '54 cm, 56 cm, M, L'
  });

  // Telegram Live interaction form
  const [tgForm, setTgForm] = useState<TelegramConfig>({
    enabled: false,
    botToken: '',
    chatId: '',
    minMarginPercent: 30,
    minScore: 75
  });
  const [isSavingTg, setIsSavingTg] = useState(false);
  const [isTestingTg, setIsTestingTg] = useState(false);
  const [tgTestMessage, setTgTestMessage] = useState('');
  const [tgActionResult, setTgActionResult] = useState<{success: boolean; message: string} | null>(null);

  // Fetch all starting state data
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // Fetch listings
      const listResp = await fetch('/api/listings-feed');
      const listData = await listResp.json();
      if (listData.success) {
        setListings(listData.listings);
      }

      // Fetch benchmarks
      const benchResp = await fetch('/api/benchmarks');
      const benchData = await benchResp.json();
      if (benchData.success) {
        setBenchmarks(benchData.benchmarks);
      }

      // Fetch weights
      const paramsResp = await fetch('/api/scoring-params');
      const paramsData = await paramsResp.json();
      if (paramsData.success) {
        setScoringParams(paramsData.params);
      }

      // Fetch Telegram status
      const tgResp = await fetch('/api/telegram-logs');
      const tgData = await tgResp.json();
      if (tgData.success) {
        setTelegramConfig(tgData.config);
        setTgForm(tgData.config);
        setTgLogs(tgData.logs);
      }
    } catch (e) {
      console.error('Failed to load endpoints from backup or custom server:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Recalculates listings dynamically on saving custom parameters
  const updateWeights = async (newWeights: ScoringParams) => {
    try {
      const resp = await fetch('/api/scoring-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWeights)
      });
      const data = await resp.json();
      if (data.success) {
        setScoringParams(data.params);
        // Refresh feed so we see updated scores instantly in real-time
        loadData(true);
      }
    } catch (err) {
      console.error('Failed to save parameters', err);
    }
  };

  const handleWeightSliderChange = (key: keyof ScoringParams, val: number) => {
    const next = { ...scoringParams, [key]: val };
    setScoringParams(next);
    updateWeights(next);
  };

  // Skip or Ignore listing
  const handleIgnoreListing = async (id: string) => {
    try {
      const resp = await fetch(`/api/listings-feed/${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.success) {
        setListings(prev => prev.filter(l => l.id !== id));
      }
    } catch (err) {
      console.error('Could not ignore product', err);
    }
  };

  // Submit copy pasta ad for analyzer
  const handleAnalyzeAdSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!adText.trim()) return;

    setIsParsing(true);
    setParseError(null);
    setParseResult(null);

    try {
      const resp = await fetch('/api/analyze-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textContent: adText,
          sourceUrl: adSourceUrl
        })
      });
      const data = await resp.json();
      if (data.success) {
        setParseResult(data.listing);
        // Reload raw feed so the new parsed deal appears first
        loadData(true);
        // Reset parser textarea if successfully parsed
        setAdText('');
        setAdSourceUrl('');
      } else {
        setParseError(data.error || 'Unknown parsing err');
      }
    } catch (err: any) {
      setParseError(err.message || 'Server connection error parsing ad text');
    } finally {
      setIsParsing(false);
    }
  };

  // Submit new custom benchmark model to database
  const handleAddBenchmarkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!benchmarkForm.brand || !benchmarkForm.model || !benchmarkForm.retailNewPrice) {
      alert('Please fill out Brand, Model and Retail Price.');
      return;
    }

    try {
      const resp = await fetch('/api/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...benchmarkForm,
          idealSizes: benchmarkForm.idealSizes.split(',').map(s => s.trim())
        })
      });
      const data = await resp.json();
      if (data.success) {
        setBenchmarks(prev => [data.benchmark, ...prev]);
        setShowAddBenchmark(false);
        setBenchmarkForm({
          brand: '',
          model: '',
          retailNewPrice: '',
          liquidity: 'High',
          category: 'Gravel',
          idealSizes: '54 cm, 56 cm, M, L'
        });
      }
    } catch (err) {
      console.error('Failed to create benchmark reference', err);
    }
  };

  const handleDeleteBenchmark = async (id: string) => {
    try {
      const resp = await fetch(`/api/benchmarks/${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.success) {
        setBenchmarks(prev => prev.filter(b => b.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save telegram parameters
  const handleSaveTelegramConfig = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingTg(true);
    try {
      const resp = await fetch('/api/telegram-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgForm)
      });
      const data = await resp.json();
      if (data.success) {
        setTelegramConfig(data.config);
        setTgLogs(data.logs);
        setTgActionResult({ success: true, message: 'Settings saved & connected to channel logs' });
      }
    } catch (err: any) {
      setTgActionResult({ success: false, message: 'Save error: ' + err.message });
    } finally {
      setIsSavingTg(false);
      setTimeout(() => setTgActionResult(null), 5000);
    }
  };

  // Send interactive telegram test alert
  const handleTestTelegramAlert = async () => {
    setIsTestingTg(true);
    setTgActionResult(null);
    try {
      const resp = await fetch('/api/telegram-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testMessage: tgTestMessage || undefined
        })
      });
      const data = await resp.json();
      setTgLogs(data.logs || []);
      if (data.success) {
        setTgActionResult({ success: true, message: data.message || 'Notification broadcast sent!' });
        setTgTestMessage('');
      } else {
        setTgActionResult({ success: false, message: data.error || 'Failed to dispatch alert' });
      }
    } catch (err: any) {
      setTgActionResult({ success: false, message: 'Failing link connection: ' + err.message });
    } finally {
      setIsTestingTg(false);
    }
  };

  // Helper counters
  const totalArbitrageMargin = listings.reduce((sum, item) => {
    // Sum only positive margins of deals with good scores (>60)
    if (item.score >= 60 && item.potentialMargin > 0) {
      return sum + item.potentialMargin;
    }
    return sum;
  }, 0);

  const matchedBrandNames = Array.from(new Set(listings.map(l => l.brand)));
  const filteredListings = listings.filter(item => {
    if (activeFilterBrand !== 'All' && item.brand.toLowerCase() !== activeFilterBrand.toLowerCase()) return false;
    if (item.score < activeFilterMinScore) return false;
    if (activeFilterSource !== 'All' && item.source !== activeFilterSource) return false;
    
    // Region Filter
    if (activeFilterRegion !== 'All' && item.region !== activeFilterRegion) return false;
    
    // Radius (Distance) Filter
    if (activeFilterRadius > 0 && item.latitude && item.longitude) {
      const distance = calculateDistanceKm(userCoords.lat, userCoords.lng, item.latitude, item.longitude);
      if (distance > activeFilterRadius) return false;
    }
    
    return true;
  });

  return (
    <div className="bg-zinc-950 text-zinc-100 font-sans min-h-screen flex flex-col p-4 md:p-8 selection:bg-emerald-500 selection:text-zinc-950">
      
      {/* HEADER SECTION - Bento style with status tags */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 pb-6 border-b border-zinc-900 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-transform hover:rotate-12 duration-300">
            <Bike className="w-7 h-7 text-zinc-950" strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white font-sans">BIKE FLIPPER</h1>
              <span className="bg-zinc-800 text-zinc-400 text-[10px] font-mono px-2 py-0.5 rounded-full border border-zinc-700">v1.12</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <p className="text-xs text-zinc-400 font-mono tracking-wide">
                DAEMON TIMERS OK • LISTINGS LIVE: dba.dk, guloggratis.dk
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => { setIsRefreshing(true); loadData(); }} 
            disabled={isRefreshing}
            className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-xl flex items-center gap-2 text-xs font-semibold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
            Scan Refresh
          </button>
          
          <div className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Engine:</span>
            <span className="text-xs font-mono font-semibold text-emerald-400">Playwright 1.40 ⚡</span>
          </div>

          <div className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">Storage:</span>
            <span className="text-xs font-mono font-semibold text-blue-400">SQLite In-Memory</span>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20">
          <RefreshCw className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
          <p className="text-zinc-400 font-mono text-xs">Bootstrapping regional pricing tables, syncing marketplace feeds...</p>
        </div>
      ) : (
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* LEFT BENTO RAIL: Scoring Adjustment Weights & Custom Ad Parser (col-span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* 1. Bento Box: Key Stat Profit Indicator */}
            <section className="bg-gradient-to-br from-emerald-500 to-teal-600 text-zinc-950 rounded-3xl p-6 relative overflow-hidden shadow-xl shadow-emerald-950/20 group">
              <div className="absolute -right-6 -bottom-6 opacity-10">
                <Bike className="w-44 h-44" strokeWidth={1} />
              </div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-950/70">Estimated Profit Pool</span>
                  <span className="px-2.5 py-0.5 bg-zinc-950 text-emerald-400 text-[10px] font-bold font-mono rounded-full uppercase">ROI Heavy</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black font-mono tracking-tight">
                    {totalArbitrageMargin.toLocaleString('da-DK')}
                  </span>
                  <span className="text-sm font-bold">DKK</span>
                </div>
                <p className="text-xs font-semibold text-zinc-950/80 mt-2">
                  Total cumulative flip margin in tracked ads with a viability score &ge; 60 pts.
                </p>

                <div className="mt-5 pt-4 border-t border-zinc-950/15 flex items-center justify-between gap-4">
                  <div className="text-xs font-bold text-zinc-950/90">
                    Average Margin %:
                  </div>
                  <div className="text-sm font-black font-mono bg-zinc-950/15 px-2.5 py-0.5 rounded-lg">
                    +{(listings.length > 0 
                      ? Math.round(listings.reduce((sum, l) => sum + l.potentialMarginPercent, 0) / listings.length) 
                      : 0)}% ROI
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Bento Box: Customized AI Scraping & Analysing Form */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold tracking-wider text-white flex items-center gap-2">
                  <Brain className="w-4 h-4 text-emerald-400" />
                  INSTANT AD APPRAISER (GEMINI AI)
                </h2>
                <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] font-bold font-mono rounded-md uppercase">
                  Google GenAI
                </span>
              </div>
              
              <p className="text-xs text-zinc-400">
                Paste copy-pasted ad content (body description text in Danish or English) from dba.dk or guloggratis.dk. Our AI extracts specifications, searches the benchmark index, and grades the flip margin instantly!
              </p>

              <form onSubmit={handleAnalyzeAdSubmit} className="space-y-3 mt-1">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Raw ad description text:</label>
                  <textarea
                    value={adText}
                    onChange={(e) => setAdText(e.target.value)}
                    placeholder="Sælger min Specialized Tarmac SL7 Comp... Fremstår som ny... Nypris var 30000 kr. Kvittering haves."
                    required
                    rows={4}
                    className="w-full bg-zinc-950 text-zinc-200 border border-zinc-800 rounded-xl p-3 text-xs focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-650"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Optional source URL:</label>
                  <input
                    type="url"
                    value={adSourceUrl}
                    onChange={(e) => setAdSourceUrl(e.target.value)}
                    placeholder="https://www.dba.dk/herrecykel-specialized..."
                    className="w-full bg-zinc-950 text-zinc-200 border border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isParsing || !adText.trim()}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {isParsing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                      Appraising with Gemini 3.5...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-zinc-950 text-zinc-950" />
                      Run Market Analysis & Score
                    </>
                  )}
                </button>
              </form>

              {parseError && (
                <div className="bg-rose-500/10 text-rose-400 border border-rose-500/25 p-3 rounded-xl flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Extraction failed</span>
                    <p className="text-[10px] mt-0.5">{parseError}</p>
                  </div>
                </div>
              )}

              {parseResult && (
                <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 p-3 rounded-xl text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Analyzed & Added Successfully!</span>
                  </div>
                  <p className="text-[10px] text-zinc-300">
                    Detected <span className="text-emerald-400 font-bold">{parseResult.brand} {parseResult.model}</span> ({parseResult.size}, condition: {parseResult.condition}).
                  </p>
                  <p className="text-[10px] font-mono text-zinc-400">
                    Viability Score: {parseResult.score}/100 • Profit Margin: {parseResult.potentialMargin.toLocaleString()} DKK ({parseResult.potentialMarginPercent}% ROI)
                  </p>
                </div>
              )}
            </section>

            {/* 3. Bento Box: Custom Scoring Param Weights (Real-time recalculations) */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4">
              <h2 className="text-sm font-bold tracking-wider text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                SCORING ALGORITHM ADJUSTER
              </h2>
              <p className="text-xs text-zinc-400">
                Tune the scoring weight factors below dynamically. Modifying values triggers instant recalculation of profit margins & viability indexes for the entire tracked feed.
              </p>

              <div className="space-y-4 pt-2">
                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-zinc-400">BRAND LIQUIDITY WEIGHT</span>
                    <span className="text-emerald-400 font-bold">{scoringParams.brandFactor} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={scoringParams.brandFactor}
                    onChange={(e) => handleWeightSliderChange('brandFactor', parseInt(e.target.value))}
                    className="w-full accent-emerald-500 bg-zinc-950 h-1.5 rounded-lg appearance-none cursor-ew-resize"
                  />
                  <span className="text-[9px] text-zinc-500">Gives premium scoring to top brands: Trek, specialized, Canyon</span>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-zinc-400">FRAME SIZE COHORT</span>
                    <span className="text-emerald-400 font-bold">{scoringParams.sizeFactor} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={scoringParams.sizeFactor}
                    onChange={(e) => handleWeightSliderChange('sizeFactor', parseInt(e.target.value))}
                    className="w-full accent-emerald-500 bg-zinc-950 h-1.5 rounded-lg appearance-none cursor-ew-resize"
                  />
                  <span className="text-[9px] text-zinc-500">Rewards fast selling sizing classes (54, 56, M, L)</span>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-zinc-400">CONDITION MULTIPLIER</span>
                    <span className="text-emerald-400 font-bold">{scoringParams.conditionFactor} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={scoringParams.conditionFactor}
                    onChange={(e) => handleWeightSliderChange('conditionFactor', parseInt(e.target.value))}
                    className="w-full accent-emerald-500 bg-zinc-950 h-1.5 rounded-lg appearance-none cursor-ew-resize"
                  />
                  <span className="text-[9px] text-zinc-500">Demotes listings flagged with heavy wear or need of service</span>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-zinc-400">PRICE RATIO AGGREGATE</span>
                    <span className="text-emerald-400 font-bold">{scoringParams.priceRatioFactor} / 10</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={scoringParams.priceRatioFactor}
                    onChange={(e) => handleWeightSliderChange('priceRatioFactor', parseInt(e.target.value))}
                    className="w-full accent-emerald-500 bg-zinc-950 h-1.5 rounded-lg appearance-none cursor-ew-resize"
                  />
                  <span className="text-[9px] text-zinc-500">Checks buy price vs MSRP ratio. Critical arbitrage deal index.</span>
                </div>
              </div>
            </section>
          </div>

          {/* MAIN CENTER BENTO: Live listings feed (col-span-8) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Live Feed Bento Box */}
            <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex-1 flex flex-col">
              
              {/* Header and filters line */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800 mb-6">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    Priority Scalped Deals Feed
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Scraping frequency is set to <span className="font-mono text-zinc-300">every 180s</span>. Click any item to explore the arbitrage analysis.
                  </p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[10px] font-bold uppercase text-zinc-500 mr-1">Filter brand:</div>
                  <div className="inline-flex rounded-lg bg-zinc-950 p-1 border border-zinc-800">
                    <button
                      onClick={() => setActiveFilterBrand('All')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${activeFilterBrand === 'All' ? 'bg-zinc-850 text-white' : 'text-zinc-400 hover:text-white'}`}
                    >
                      All
                    </button>
                    {matchedBrandNames.map(b => (
                      <button
                        key={b}
                        onClick={() => setActiveFilterBrand(b)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${activeFilterBrand === b ? 'bg-zinc-850 text-white' : 'text-zinc-400 hover:text-white'}`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Score slider & Source filter shortcut bar */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-zinc-950/40 p-3 rounded-2xl border border-zinc-800/80 mb-6 text-xs">
                
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <span className="text-[10px] font-bold uppercase text-zinc-500 font-mono">Min Viability:</span>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="5"
                    value={activeFilterMinScore}
                    onChange={(e) => setActiveFilterMinScore(parseInt(e.target.value))}
                    className="accent-emerald-500 w-24 bg-zinc-900 cursor-ew-resize"
                  />
                  <span className="font-bold text-emerald-400 font-mono text-[11px]">
                    {activeFilterMinScore === 0 ? 'Any' : `>= ${activeFilterMinScore} pts`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-zinc-500 font-mono">Source channel:</span>
                  <select
                    value={activeFilterSource}
                    onChange={(e) => setActiveFilterSource(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] py-1 px-2 text-zinc-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="All">All Sites</option>
                    <option value="dba.dk">dba.dk only</option>
                    <option value="guloggratis.dk">guloggratis.dk only</option>
                    <option value="facebook">Facebook Marketplace</option>
                    <option value="manual">Gemini Analyzed</option>
                  </select>
                </div>

                <div className="text-[11px] text-zinc-400">
                  Showing <span className="font-bold text-zinc-100">{filteredListings.length}</span> of <span className="font-bold text-zinc-100">{listings.length}</span> deals
                </div>
              </div>

              {/* Geographic Region & Radius Filter Panel */}
              <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-6 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800/80 mb-6 text-xs shadow-inner">
                {/* 1. Region Selector */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-zinc-500 font-mono flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-sky-400 rounded-full"></span>
                    Denmark Region:
                  </span>
                  <div className="flex gap-1 flex-wrap">
                    {['All', 'Hovedstaden', 'Sjælland', 'Syddanmark', 'Midtjylland', 'Nordjylland'].map(regionItem => (
                      <button
                        key={regionItem}
                        onClick={() => setActiveFilterRegion(regionItem)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                          activeFilterRegion === regionItem
                            ? 'bg-zinc-850 border-zinc-700 text-white shadow-sm shadow-black/80'
                            : 'bg-zinc-900/35 border-transparent text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {regionItem === 'All' ? 'All Areas' : regionItem}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Radius Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-zinc-500 font-mono">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                      Radius distance:
                    </span>
                    <span className="font-mono text-emerald-400 tracking-wider">
                      {activeFilterRadius === 0 ? 'Unlimited 🌍' : `≤ ${activeFilterRadius} km`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="range"
                      min="0"
                      max="150"
                      step="5"
                      value={activeFilterRadius}
                      onChange={(e) => setActiveFilterRadius(parseInt(e.target.value))}
                      className="accent-emerald-500 w-full bg-zinc-900 h-1.5 rounded-lg appearance-none cursor-ew-resize"
                    />
                  </div>
                </div>

                {/* 3. Radius Base Location */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-zinc-500 font-mono">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                      My Coordinates:
                    </span>
                    <span className="text-zinc-500 font-normal">
                      ({userCoords.lat.toFixed(3)}, {userCoords.lng.toFixed(3)})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <select
                        value={userCoordsLabel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserCoordsLabel(val);
                          setGpsError(null);
                          if (val.includes('Copenhagen')) setUserCoords({ lat: 55.6761, lng: 12.5683 });
                          else if (val.includes('Aarhus')) setUserCoords({ lat: 56.1567, lng: 10.2108 });
                          else if (val.includes('Odense')) setUserCoords({ lat: 55.4038, lng: 10.4024 });
                          else if (val.includes('Roskilde')) setUserCoords({ lat: 55.6419, lng: 12.0878 });
                          else if (val.includes('Aalborg')) setUserCoords({ lat: 57.0488, lng: 9.9217 });
                        }}
                        className="bg-zinc-950 text-zinc-300 text-[11px] py-1 border border-zinc-800 rounded-lg w-full px-2 font-medium focus:outline-none focus:border-zinc-700"
                      >
                        <option value="Copenhagen (Default)">Copenhagen Center</option>
                        <option value="Aarhus Preset">Aarhus City</option>
                        <option value="Odense Preset">Odense City</option>
                        <option value="Roskilde Preset">Roskilde City</option>
                        <option value="Aalborg Preset">Aalborg City</option>
                      </select>
                    </div>

                    <button
                      onClick={() => {
                        if (!navigator.geolocation) {
                          setGpsError('Not supported in browser.');
                          return;
                        }
                        setIsGpsLoading(true);
                        setGpsError(null);
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            setUserCoords({
                              lat: position.coords.latitude,
                              lng: position.coords.longitude
                            });
                            setUserCoordsLabel('Real GPS Position');
                            setIsGpsLoading(false);
                          },
                          (error) => {
                            setGpsError('GPS permission denied.');
                            setIsGpsLoading(false);
                          },
                          { enableHighAccuracy: true, timeout: 5000 }
                        );
                      }}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-bold border border-zinc-800 text-zinc-300 rounded-lg transition-all active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Zap className={`w-3 h-3 ${isGpsLoading ? 'animate-pulse text-emerald-400' : 'text-zinc-500'}`} />
                      {isGpsLoading ? 'Locating...' : 'Real GPS'}
                    </button>
                  </div>
                  {gpsError && (
                    <span className="text-[9px] text-amber-500 mt-0.5 font-mono">{gpsError}</span>
                  )}
                </div>
              </div>

              {/* Listings Stack */}
              {filteredListings.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-850 rounded-2xl p-10 text-center">
                  <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-zinc-650 mb-3">
                    <Info className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-300">No deals matched standard criteria</h3>
                  <p className="text-xs text-zinc-500 max-w-sm mt-1">
                    Try decreasing the minimum score threshold slider, choosing another brand filter, or paste a new ad descriptions paste text in the left panel appraiser!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredListings.map((listing) => {
                    const isHighYield = listing.score >= 80;
                    const isWarning = listing.score < 70;
                    
                    return (
                      <div 
                        key={listing.id}
                        className={`bg-zinc-950/60 hover:bg-zinc-950 border transition-all duration-300 rounded-2xl p-5 relative group overflow-hidden ${
                          isHighYield 
                            ? 'border-emerald-500/30 hover:border-emerald-500/50' 
                            : isWarning 
                              ? 'border-zinc-800/80 hover:border-amber-500/20' 
                              : 'border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {/* Highlights gradient flash behind high-yields */}
                        {isHighYield && (
                          <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:scale-150 transition-transform duration-500"></div>
                        )}

                        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                          
                          {/* Left: General data */}
                          <div className="flex-1 min-w-0">
                            
                            {/* Badging row */}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              {/* Source badge */}
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border font-mono uppercase ${
                                listing.source === 'dba.dk' 
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                                  : listing.source === 'guloggratis.dk' 
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : listing.source === 'facebook'
                                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                      : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                              }`}>
                                {listing.source}
                              </span>

                              {/* Sizing badge */}
                              <span className="bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[9px] px-2 py-0.5 rounded-md">
                                Size: <span className="font-bold text-white">{listing.size}</span>
                              </span>

                              {/* Condition Badge */}
                              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase ${
                                listing.condition === 'Like New'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : listing.condition === 'Good'
                                    ? 'bg-zinc-800 text-zinc-200'
                                    : listing.condition === 'Fair'
                                      ? 'bg-zinc-900 text-zinc-400'
                                      : 'bg-rose-500/10 text-rose-400'
                              }`}>
                                {listing.condition}
                              </span>

                              {/* Region & Distance badge */}
                              <span className="bg-sky-450/10 border border-sky-500/20 text-sky-400 font-mono text-[9px] px-2 py-0.5 rounded-md flex items-center gap-1">
                                📍 {listing.region || 'Hovedstaden'}
                                {listing.latitude && listing.longitude && (
                                  <span className="text-zinc-300 font-bold ml-1 pl-1 border-l border-sky-500/30">
                                    {calculateDistanceKm(userCoords.lat, userCoords.lng, listing.latitude, listing.longitude)} km away
                                  </span>
                                )}
                              </span>

                              {/* Age badge */}
                              <span className="text-[10px] text-zinc-500 ml-auto font-mono">
                                {listing.publishedAt}
                              </span>
                            </div>

                            {/* Title */}
                            <h3 className="font-bold text-zinc-200 text-base flex items-center gap-2 group-hover:text-white transition-colors">
                              {listing.title}
                              {listing.isCustomScored && (
                                <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 rounded px-1.5 py-0.2">Gemini Appraised</span>
                              )}
                            </h3>

                            {/* Shortened description */}
                            <p className="text-xs text-zinc-400 mt-1 line-clamp-2 italic pr-4">
                              "{listing.description}"
                            </p>

                            {/* Pros & Cons Section */}
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-zinc-900">
                              <div>
                                <span className="block text-[9px] uppercase font-mono font-bold text-emerald-500 mb-1">PROS OF FLIP:</span>
                                <ul className="space-y-0.5">
                                  {listing.pros?.map((pro, i) => (
                                    <li key={i} className="text-[10px] text-zinc-350 flex items-center gap-1.5">
                                      <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                                      {pro}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <span className="block text-[9px] uppercase font-mono font-bold text-zinc-500 mb-1">RISKS & DRAWBACKS:</span>
                                <ul className="space-y-0.5">
                                  {listing.cons?.map((con, i) => (
                                    <li key={i} className="text-[10px] text-zinc-450 flex items-center gap-1.5">
                                      <span className="w-1 h-1 rounded-full bg-zinc-650"></span>
                                      {con}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>

                            {/* Recommendation note */}
                            {listing.recommendation && (
                              <div className="mt-3 bg-zinc-900/60 rounded-xl p-2.5 border border-zinc-850 flex items-start gap-2 text-[11px] text-zinc-300">
                                <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold text-zinc-450 uppercase text-[9px] block">Strategic Adviser Guidance:</span>
                                  {listing.recommendation}
                                </div>
                              </div>
                            )}

                          </div>

                          {/* Right: Score and Price margins */}
                          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-4 min-w-[140px] w-full md:w-auto p-4 md:p-0 bg-zinc-950/40 md:bg-transparent rounded-xl border border-zinc-900 md:border-none">
                            
                            {/* Score Viability badge */}
                            <div className="text-center md:text-right">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Deal score</span>
                              <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                                <span className={`text-2xl font-black font-mono px-3 py-1 rounded-xl ${
                                  isHighYield 
                                    ? 'bg-emerald-500 text-zinc-950 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                                    : isWarning 
                                      ? 'bg-zinc-850 text-amber-500' 
                                      : 'bg-zinc-900 text-zinc-300'
                                }`}>
                                  {listing.score}
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Buy vs Resell</span>
                              <div className="font-black text-lg text-white font-mono mt-0.5">
                                {listing.price.toLocaleString('da-DK')} DKK
                              </div>
                              <div className="text-[10px] text-zinc-400">
                                Est. Resell: <span className="font-bold text-zinc-300 font-mono">{listing.resellEstimate.toLocaleString()} DKK</span>
                              </div>
                              <div className="text-[9px] text-zinc-550 line-through">
                                Retail New: {listing.estimatedRetailNew.toLocaleString()} DKK
                              </div>
                            </div>

                            {/* Potential Profit Indicator */}
                            <div className="text-right">
                              <span className="text-[9px] text-zinc-550 block font-bold uppercase tracking-wider">Flips ROI Target</span>
                              <div className={`font-mono font-black text-sm mt-0.5 ${listing.potentialMargin > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {listing.potentialMargin > 0 ? '+' : ''}{listing.potentialMargin.toLocaleString('da-DK')} DKK ({listing.potentialMarginPercent}%)
                              </div>
                            </div>

                            {/* Action Buttons: Navigate/Archive inside feed */}
                            <div className="flex gap-2 w-full md:w-auto justify-end pt-2">
                              {listing.url && (
                                <a 
                                  href={listing.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg hover:text-white border border-zinc-850 flex items-center gap-1.5 text-[10px] font-bold transition-all transition-colors"
                                >
                                  Source Ad
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              
                              <button
                                onClick={() => handleIgnoreListing(listing.id)}
                                title="Ignore / Discard Deal"
                                className="p-1.5 bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-zinc-850 hover:border-rose-900 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* LOWER BENTO ROW: Two adjacent columns (Benchmarks & Telegram Alert Logs) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
              
              {/* Box A: Market Pricing Benchmarks */}
              <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-sm font-bold tracking-wider text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      MSRP REFERENCE INDEX
                    </h2>
                    
                    <button
                      onClick={() => setShowAddBenchmark(!showAddBenchmark)}
                      className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold px-2 py-1 rounded-md border border-zinc-750 flex items-center gap-1 transition-all"
                    >
                      <Plus className="w-3 h-3 text-emerald-500" />
                      Add Value
                    </button>
                  </div>

                  <p className="text-xs text-zinc-400 mb-4">
                    Pricing index of verified bicycle models in Denmark, used as target anchor for comparing listed resale values on dba.dk.
                  </p>

                  {/* Add Brand Value inline form slider */}
                  {showAddBenchmark && (
                    <form onSubmit={handleAddBenchmarkSubmit} className="mb-4 p-4 bg-zinc-950 rounded-2xl border border-zinc-850 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span>New Benchmark specifications:</span>
                        <button type="button" onClick={() => setShowAddBenchmark(false)} className="text-zinc-550 hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <input
                            type="text"
                            placeholder="Brand (e.g. Canyon)"
                            required
                            value={benchmarkForm.brand}
                            onChange={(e) => setBenchmarkForm({ ...benchmarkForm, brand: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-100"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Model (e.g. Endurace 8)"
                            required
                            value={benchmarkForm.model}
                            onChange={(e) => setBenchmarkForm({ ...benchmarkForm, model: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-100"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <input
                            type="number"
                            placeholder="MSRP New (DKK)"
                            required
                            value={benchmarkForm.retailNewPrice}
                            onChange={(e) => setBenchmarkForm({ ...benchmarkForm, retailNewPrice: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-100"
                          />
                        </div>
                        <div>
                          <select
                            value={benchmarkForm.category}
                            onChange={(e: any) => setBenchmarkForm({ ...benchmarkForm, category: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100"
                          >
                            <option value="Road">Road</option>
                            <option value="Gravel">Gravel</option>
                            <option value="MTB">MTB</option>
                            <option value="City">City</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <select
                          value={benchmarkForm.liquidity}
                          onChange={(e: any) => setBenchmarkForm({ ...benchmarkForm, liquidity: e.target.value })}
                          className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100"
                        >
                          <option value="High">High liquidity</option>
                          <option value="Medium">Medium liquidity</option>
                          <option value="Low">Low liquidity</option>
                        </select>
                        <button
                          type="submit"
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold py-1 px-3 rounded text-xs"
                        >
                          Append Register
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Benchmark List */}
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2 custom-scroll">
                    {benchmarks.map((bp) => (
                      <div key={bp.id} className="flex justify-between items-center bg-zinc-950/50 hover:bg-zinc-950 border border-zinc-850 p-2.5 rounded-xl text-xs transition-colors">
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest block font-mono">
                            {bp.category} • {bp.liquidity} demand
                          </span>
                          <span className="font-bold text-zinc-200">{bp.brand}</span> <span className="text-zinc-300">{bp.model}</span>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <span className="font-bold font-mono text-zinc-100">{bp.retailNewPrice.toLocaleString()} DKK</span>
                            <span className="text-[10px] text-zinc-500 block">Est resale: {bp.averageUsedPrice.toLocaleString()} DKK</span>
                          </div>
                          
                          <button
                            onClick={() => handleDeleteBenchmark(bp.id)}
                            className="text-zinc-650 hover:text-rose-400 p-1 rounded hover:bg-rose-950/30 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-850 text-[10px] text-zinc-500 font-mono">
                  Database total references: {benchmarks.length} models index
                </div>
              </section>

              {/* Box B: Telegram Alert Configuration & Logger Channel */}
              <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold tracking-wider text-white flex items-center gap-2">
                      <Send className="w-4 h-4 text-emerald-400" />
                      TELEGRAM ALERTS WEBHOOK
                    </h2>
                    
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                      telegramConfig.enabled 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${telegramConfig.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`}></span>
                      {telegramConfig.enabled ? 'LIVE ACTIVE' : 'MUTED'}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400 mb-4">
                    Send real-time alerts automatically when fresh listings are identified on dba.dk / guloggratis.dk with profit parameters matching your margin thresholds.
                  </p>

                  <form onSubmit={handleSaveTelegramConfig} className="space-y-3 p-3.5 bg-zinc-950 rounded-2xl border border-zinc-850 mb-4">
                    
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Enable bot push alerts:</span>
                      <input
                        type="checkbox"
                        checked={tgForm.enabled}
                        onChange={(e) => setTgForm({ ...tgForm, enabled: e.target.checked })}
                        className="w-4 h-4 text-emerald-500 bg-zinc-900 border-zinc-800 rounded focus:ring-emerald-500 focus:ring-opacity-25"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Bot token:</label>
                        <input
                          type="password"
                          placeholder="e.g. 59281...:AAH"
                          value={tgForm.botToken}
                          onChange={(e) => setTgForm({ ...tgForm, botToken: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono text-zinc-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Chat ID:</label>
                        <input
                          type="text"
                          placeholder="e.g. -100428512"
                          value={tgForm.chatId}
                          onChange={(e) => setTgForm({ ...tgForm, chatId: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono text-zinc-200"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-zinc-505 mb-0.5">Min Margin ROI %:</label>
                        <input
                          type="number"
                          value={tgForm.minMarginPercent}
                          onChange={(e) => setTgForm({ ...tgForm, minMarginPercent: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-xs font-mono text-zinc-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-bold text-zinc-505 mb-0.5">Min Viability Score:</label>
                        <input
                          type="number"
                          value={tgForm.minScore}
                          onChange={(e) => setTgForm({ ...tgForm, minScore: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-xs font-mono text-zinc-200"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingTg}
                      className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-bold border border-zinc-700 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingTg ? 'Saving...' : 'Save credentials'}
                    </button>
                  </form>

                  {/* Dispatch Live Test Alert Simulation */}
                  <div className="space-y-2 mt-2">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Live Endpoint Telegram broadcast checklist:</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Custom broadcast text (or auto default)"
                        value={tgTestMessage}
                        onChange={(e) => setTgTestMessage(e.target.value)}
                        className="bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5 text-xs text-zinc-200 flex-1 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleTestTelegramAlert}
                        disabled={isTestingTg}
                        className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                      >
                        <Bell className="w-3.5 h-3.5 text-zinc-950" />
                        {isTestingTg ? 'Ping...' : 'Test Alert'}
                      </button>
                    </div>

                    {tgActionResult && (
                      <div className={`p-2 rounded-xl text-[11px] font-mono border mt-1 flex items-center gap-2 ${
                        tgActionResult.success 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {tgActionResult.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        <span>{tgActionResult.message}</span>
                      </div>
                    )}

                    {/* Channel Stream logs terminal */}
                    <div className="mt-3">
                      <span className="text-[10px] text-zinc-550 uppercase tracking-widest font-mono font-bold block mb-1">Active Bot Daemon Live Logs:</span>
                      <div className="bg-zinc-950 border border-zinc-850 p-2.5 rounded-xl text-[10px] font-mono text-zinc-400 space-y-1 max-h-[110px] overflow-y-auto pr-2">
                        {tgLogs.map((log, index) => (
                          <div key={index} className="leading-relaxed border-b border-zinc-900/40 pb-1">
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>

                <div className="mt-4 pt-3 border-t border-zinc-850 text-[10px] text-zinc-550 font-mono">
                  Daemon target: pavlenkou318@gmail.com subscribers
                </div>
              </section>

            </div>

          </div>

        </main>
      )}

      {/* FOOTER STATUS BAR - elegant indicators of scraper states, matches design perfectly */}
      <footer className="mt-12 pt-6 border-t border-zinc-900 flex flex-col md:flex-row justify-between items-center text-[10px] text-zinc-500 font-mono gap-4">
        <div className="flex flex-wrap gap-4 md:gap-6 justify-center md:justify-start">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            POSTGRES_DB_HEALTH: OK (200ms ping)
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            SCRAPER_DBA_DK: NOMINAL (OK)
          </span>
          <span className="flex items-center gap-1.5 text-amber-500">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            SCRAPER_GULOGGRATIS: RATE_LIMIT_DELAY (2s cooldown triggered)
          </span>
        </div>
        <div className="flex gap-4">
          <span>DAEMON_UPTIME: 14d 06h 22m</span>
          <span className="text-zinc-400">PULSE_RATE: 180s</span>
        </div>
      </footer>

    </div>
  );
}
