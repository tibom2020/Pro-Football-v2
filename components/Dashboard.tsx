
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MatchInfo, PreGoalAnalysis, ProcessedStats, AIPredictionResponse, OddsData, ViewedMatchHistory } from '../types';
import { parseStats, getMatchDetails, getMatchOdds, getGeminiGoalPrediction } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Info, Activity, BrainCircuit, Zap } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis, Tooltip, Cell, Line, Legend, CartesianGrid, Area, ReferenceLine } from 'recharts';
import { LiveStatsTable } from './LiveStatsTable';
import { TicketManager } from './TicketManager';

interface DashboardProps {
  token: string;
  match: MatchInfo;
  onBack: () => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const marketData = payload.find(p => p.dataKey === 'handicap')?.payload;
    const gapData = payload.find(p => p.dataKey === 'gap');
    return (
        <div className="bg-slate-800 text-white text-xs p-2 rounded shadow-lg border border-slate-700">
            <p className="font-bold border-b border-slate-600 mb-1 pb-1">Phút: {label}'</p>
            {gapData && <p className="font-black">Gap API: {gapData.value.toFixed(1)}</p>}
            {marketData && <p>HDP: {marketData.handicap.toFixed(2)} | Odds: {marketData.over?.toFixed(3) || marketData.home?.toFixed(3)}</p>}
        </div>
    );
  }
  return null;
};

const OddsPulse = ({ data, type }: { data: any[], type: 'ou' | 'hdp' }) => {
    if (!data || data.length === 0) return null;
    const lastTwo = data.slice(-2).reverse(); 
    return (
        <div className="flex items-center gap-3">
            {lastTwo.map((p, i) => (
                <div key={i} className={`flex items-baseline gap-1 ${i === 1 ? 'opacity-40 grayscale' : 'opacity-100'}`}>
                    <span className="text-[10px] text-gray-400 font-bold">'{p.minute}</span>
                    <span className={`text-xs font-black ${p.colorName === 'red' ? 'text-red-500' : 'text-emerald-500'}`}>
                        {type === 'ou' ? p.over.toFixed(3) : p.home.toFixed(3)}
                    </span>
                </div>
            ))}
        </div>
    );
};

export const Dashboard: React.FC<DashboardProps> = ({ token, match, onBack }) => {
  const [liveMatch, setLiveMatch] = useState<MatchInfo>(match);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAIPredicting, setIsAIPredicting] = useState(false); 
  const [oddsHistory, setOddsHistory] = useState<any[]>([]);
  const [homeOddsHistory, setHomeOddsHistory] = useState<any[]>([]);
  const [statsHistory, setStatsHistory] = useState<Record<number, ProcessedStats>>({});
  const [aiInsight, setAiInsight] = useState<{ tactical: string; probability: number } | null>(null);

  const stats = useMemo(() => parseStats(liveMatch.stats), [liveMatch.stats]);

  const apiChartData = useMemo(() => {
      const sortedMinutes = Object.keys(statsHistory).map(Number).sort((a, b) => a - b);
      return sortedMinutes.map(minute => {
          const s = statsHistory[minute];
          const home = (s.on_target[0] * 3) + (s.corners[0] * 0.7) + (s.dangerous_attacks[0] * 0.1);
          const away = (s.on_target[1] * 3) + (s.corners[1] * 0.7) + (s.dangerous_attacks[1] * 0.1);
          return { minute, homeApi: home, awayApi: away, gap: home - away };
      });
  }, [statsHistory]);

  const tensionLevel = useMemo(() => {
    if (apiChartData.length < 5) return 20;
    const last5 = apiChartData.slice(-5);
    const activity = last5.reduce((acc, curr) => acc + Math.abs(curr.homeApi + curr.awayApi), 0);
    return Math.min(100, Math.max(10, activity * 2));
  }, [apiChartData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
        const details = await getMatchDetails(token, liveMatch.id);
        if (details) {
            setLiveMatch(details);
            if (details.timer?.tm) setStatsHistory(prev => ({ ...prev, [details.timer!.tm]: parseStats(details.stats) }));
        }
        const odds = await getMatchOdds(token, liveMatch.id);
        if (odds) {
            const mapper = (m: any) => ({ minute: parseInt(m.time_str), over: parseFloat(m.over_od || '0'), home: parseFloat(m.home_od || '0'), handicap: m.handicap!, add_time: parseInt(m.add_time || '0') });
            if (odds.results?.odds?.['1_3']) setOddsHistory(odds.results.odds['1_3'].map(mapper));
            if (odds.results?.odds?.['1_2']) setHomeOddsHistory(odds.results.odds['1_2'].map(mapper));
        }
    } catch (e) {} finally { setIsRefreshing(false); }
  }, [token, liveMatch.id]);

  const fetchAI = async () => {
    setIsAIPredicting(true);
    const res = await getGeminiGoalPrediction(liveMatch.id, liveMatch.timer?.tm || 0, liveMatch.home.name, liveMatch.away.name, 0, 0, stats, 0, 0, null, null, 0, 0, 0);
    if (res) setAiInsight({ tactical: res.tactical_insight, probability: res.goal_probability });
    setIsAIPredicting(false);
  };

  useEffect(() => { handleRefresh(); const id = setInterval(handleRefresh, 45000); return () => clearInterval(id); }, [handleRefresh]);

  const scoreParts = (liveMatch.ss || "0-0").split("-");

  return (
    <div className="pb-20 bg-gray-50 min-h-screen">
      <div className="bg-white sticky top-0 z-20 shadow-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-400 hover:bg-gray-100 rounded-full"><ArrowLeft /></button>
        <div className="text-center">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Live Match Analysis</div>
            <div className="text-red-500 font-black flex items-center justify-center gap-1">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></div>
                {liveMatch.timer?.tm || 0}'
            </div>
        </div>
        <button onClick={fetchAI} disabled={isAIPredicting} className="p-2 bg-blue-50 text-blue-600 rounded-full active:scale-95 transition-all">
            {isAIPredicting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <BrainCircuit className="w-5 h-5" />}
        </button>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Scoreboard */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex justify-between items-center">
            <div className="w-1/3 text-center font-bold text-sm truncate">{liveMatch.home.name}</div>
            <div className="flex items-center gap-4">
                <span className="text-4xl font-black text-slate-800">{scoreParts[0]}</span>
                <span className="text-gray-200 text-2xl">-</span>
                <span className="text-4xl font-black text-slate-800">{scoreParts[1]}</span>
            </div>
            <div className="w-1/3 text-center font-bold text-sm truncate">{liveMatch.away.name}</div>
        </div>

        {/* Tension Meter & AI Insight */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <Zap className={`w-4 h-4 ${tensionLevel > 60 ? 'text-yellow-400 fill-yellow-400 animate-pulse' : 'text-gray-500'}`} />
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Trạng thái trận đấu</span>
                </div>
                <div className="text-xs font-black text-blue-400">{tensionLevel > 70 ? 'CĂNG THẲNG' : tensionLevel < 30 ? 'TẺ NHẠT' : 'ỔN ĐỊNH'}</div>
            </div>
            
            {/* Tension bar */}
            <div className="h-1.5 w-full bg-white/10 rounded-full mb-5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-1000" style={{ width: `${tensionLevel}%` }}></div>
            </div>

            {aiInsight ? (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                    <p className="text-sm leading-relaxed text-gray-200 italic">"{aiInsight.tactical}"</p>
                    <div className="flex items-center gap-2">
                        <div className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20">Xác suất bàn thắng: {aiInsight.probability}%</div>
                    </div>
                </div>
            ) : (
                <div className="text-xs text-gray-500 italic">Bấm biểu tượng bộ não để AI phân tích chiều sâu trận đấu...</div>
            )}
        </div>

        {/* Charts */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" />Áp lực API</h3>
                <div className="text-[10px] font-bold text-gray-400">LIVE MOMENTUM</div>
            </div>
            <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={apiChartData}>
                        <defs>
                            <linearGradient id="apiFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#f8fafc" vertical={false} />
                        <XAxis dataKey="minute" domain={[0, 90]} hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="gap" stroke="#3b82f6" strokeWidth={2} fill="url(#apiFill)" />
                        <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="3 3" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>

        <LiveStatsTable liveMatch={liveMatch} oddsHistory={oddsHistory} homeOddsHistory={homeOddsHistory} apiChartData={apiChartData} h1HomeOddsHistory={[]} h1OverUnderOddsHistory={[]} />
        <TicketManager match={liveMatch} latestOverOdds={oddsHistory[oddsHistory.length-1]} latestHomeOdds={homeOddsHistory[homeOddsHistory.length-1]} />
      </div>
    </div>
  );
};
