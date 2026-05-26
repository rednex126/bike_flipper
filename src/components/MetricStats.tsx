import { TrendingUp, RefreshCw, Radio, BellRing, Coins } from 'lucide-react';
import { BicycleListing } from '../types';

interface MetricStatsProps {
  listings: BicycleListing[];
  isTelegramEnabled: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export default function MetricStats({ listings, isTelegramEnabled, onRefresh, isRefreshing }: MetricStatsProps) {
  const profitableDeals = listings.filter(l => l.score >= 80);
  
  // Calculate averages
  const totalMargin = listings.reduce((sum, l) => sum + (l.potentialMargin > 0 ? l.potentialMargin : 0), 0);
  const avgMargin = listings.length > 0 ? Math.round(totalMargin / listings.length) : 0;
  
  const avgROI = listings.length > 0 
    ? Math.round(listings.reduce((sum, l) => sum + l.potentialMarginPercent, 0) / listings.length)
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {/* Stat 1 */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-all duration-300">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Scanned Feed</span>
            <h3 className="text-3xl font-bold font-sans text-slate-800 mt-1">{listings.length} Deals</h3>
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1 mt-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {profitableDeals.length} high priority (&gt;80 score)
            </p>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600 transition-transform duration-300 group-hover:scale-110">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
      </div>

      {/* Stat 2 */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm relative overflow-hidden group hover:border-emerald-200 transition-all duration-300">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Profit / Flip</span>
            <h3 className="text-3xl font-bold font-sans text-slate-800 mt-1">
              {avgMargin.toLocaleString('da-DK')} DKK
            </h3>
            <p className="text-xs text-slate-500 mt-2">
              Potential arbitrage margin estimate
            </p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600 transition-transform duration-300 group-hover:scale-110">
            <Coins className="w-5 h-5" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
      </div>

      {/* Stat 3 */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm relative overflow-hidden group hover:border-amber-200 transition-all duration-300">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Average Return</span>
            <h3 className="text-3xl font-bold font-sans text-slate-800 mt-1">
              +{avgROI}%
            </h3>
            <p className="text-xs text-slate-600 font-medium flex items-center gap-1 mt-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              ROI relative to buy cost
            </p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 text-amber-600 transition-transform duration-300 group-hover:scale-110">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
      </div>

      {/* Stat 4 */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm relative overflow-hidden group hover:border-indigo-200 transition-all duration-300">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Telegram Alert Webhook</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${isTelegramEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
              <h3 className="text-2xl font-bold font-sans text-slate-800">
                {isTelegramEnabled ? 'Active' : 'Offline'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {isTelegramEnabled ? 'Broadcasting alerts >30% ROI' : 'Bot alerts disabled in settings'}
            </p>
          </div>
          <div className={`p-3 rounded-lg transition-transform duration-300 group-hover:scale-110 ${isTelegramEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
            <BellRing className="w-5 h-5" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></div>
      </div>
    </div>
  );
}
