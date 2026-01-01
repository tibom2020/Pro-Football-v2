
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MatchInfo, PreGoalAnalysis, ProcessedStats, AIPredictionResponse, OddsData, ViewedMatchHistory } from '../types';
import { parseStats, getMatchDetails, getMatchOdds, getGeminiGoalPrediction } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Info, Activity, BrainCircuit, Zap, Target } from 'lucide-react';
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

// --- Sub-component: Live Tension Radar ---
const TensionRadar = ({ level }: { level: number }) => {
    return (
        <div className="flex items-center gap-4 bg-slate-900 rounded-2xl p-4 border border-slate-800 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl"></div>
            <div className="relative">
                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-colors duration-500 ${level > 70 ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'}`}>
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center ${level > 70 ? 'animate-pulse bg-red-500/20' : 'bg-blue-500/20'}`}>
                        <Zap className={`w-5 h-5 ${level > 70 ? 'text-red-500' : 'text-blue-400'}`} />
                   </div>
                </div>
                {level > 70 && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>}
            </div>
            <div className="flex-grow">
                <div className="flex justify-between items-baseline mb-1">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Momentum Alert</span>
                    <span className={`text-xs font-black ${level > 70 ? 'text-red-500' : 'text-blue-400'}`}>{level}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-1000 ${level > 70 ? 'bg-red-500' : 'bg-blue-500'}`} 
                        style={{ width: `${level}%` }}
                    ></div>
                </div>
                <div className="text-[9px] text-gray-500 mt-1 font-medium">
                    {level > 70 ? 'Cảnh báo: Áp lực đang gia tăng cực nhanh!' : level < 30 ? 'Trận đấu đang ở nhịp độ thấp.' : 'Nhịp độ ổn định, sẵn sàng đột biến.'}
                </div>
            </div>
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
  const [aiInsight, setAiInsight] = useState<any | null>(null);

  const stats = useMemo(() => parseStats(liveMatch.stats), [liveMatch.stats]);

  // Logic giữ nguyên các biểu đồ cũ
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
    if (apiChartData.length < 3) return 20;
    const last3 = apiChartData.slice(-3);
    const activity = last3.reduce((acc, curr) => acc + Math.abs(curr.homeApi + curr.awayApi), 0);
    return Math.min(100, Math.max(15, activity * 3.5));
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
    const currentMin = liveMatch.timer?.tm || 0;
    const res = await getGeminiGoalPrediction(liveMatch.id, currentMin, liveMatch.home.name, liveMatch.away.name, 0, 0, stats, 0, 0, null, null, 0, 0, 0);
    if (res) setAiInsight(res);
    setIsAIPredicting(false);
  };

  useEffect(() => { handleRefresh(); const id = setInterval(handleRefresh, 45000); return () => clearInterval(id); }, [handleRefresh]);

  const scoreParts = (liveMatch.ss || "0-0").split("-");

  return (
    <div className="pb-24 bg-gray-50 min-h-screen">
      <div className="bg-white sticky top-0 z-30 shadow-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-400 active:bg-gray-100 rounded-full"><ArrowLeft /></button>
        <div className="text-center">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Live Analytics</div>
            <div className="text-red-600 font-black flex items-center justify-center gap-1">
                <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-ping"></div>
                {liveMatch.timer?.tm || 0}'
            </div>
        </div>
        <button onClick={fetchAI} disabled={isAIPredicting} className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 active:scale-90 transition-all">
            {isAIPredicting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <BrainCircuit className="w-5 h-5" />}
        </button>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Score Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex justify-between items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600"></div>
            <div className="w-1/3 text-center">
                <div className="font-bold text-sm text-gray-800 line-clamp-2">{liveMatch.home.name}</div>
                <div className="text-[9px] font-bold text-blue-500 uppercase mt-1">Home</div>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-4xl font-black text-slate-900">{scoreParts[0]}</span>
                <span className="text-gray-200 text-2xl font-light">:</span>
                <span className="text-4xl font-black text-slate-900">{scoreParts[1]}</span>
            </div>
            <div className="w-1/3 text-center">
                <div className="font-bold text-sm text-gray-800 line-clamp-2">{liveMatch.away.name}</div>
                <div className="text-[9px] font-bold text-orange-500 uppercase mt-1">Away</div>
            </div>
        </div>

        {/* FEATURE 2: Tension Radar */}
        <TensionRadar level={Math.round(tensionLevel)} />

        {/* FEATURE 3: AI Insights Card */}
        {aiInsight && (
            <div className="bg-white rounded-3xl border border-blue-50 p-5 shadow-sm space-y-4 animate-in zoom-in-95 duration-300">
                <div className="flex items-center gap-2 pb-3 border-b border-gray-50">
                    <Target className="w-5 h-5 text-blue-600" />
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">AI Tactical & Pattern Insight</h4>
                </div>
                <div className="space-y-4">
                    <div>
                        <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Dự báo chiến thuật</div>
                        <p className="text-sm text-slate-600 leading-relaxed font-medium">"{aiInsight.tactical_insight}"</p>
                    </div>
                    <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <div className="text-[10px] font-bold text-blue-600 uppercase mb-1 flex items-center gap-1">
                            <Info className="w-3 h-3" /> Đối soát kịch bản lịch sử
                        </div>
                        <p className="text-xs text-blue-800 leading-relaxed font-semibold italic">{aiInsight.ghost_pattern}</p>
                    </div>
                    <div className="flex justify-between items-center">
                         <div className="flex items-center gap-2">
                             <div className="w-10 h-10 rounded-full border-4 border-blue-100 flex items-center justify-center text-xs font-black text-blue-600">
                                {aiInsight.goal_probability}%
                             </div>
                             <span className="text-[10px] font-bold text-gray-400 uppercase">Khả năng nổ bàn</span>
                         </div>
                         <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${aiInsight.confidence_level === 'cao' || aiInsight.confidence_level === 'rất cao' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            Độ tin cậy: {aiInsight.confidence_level}
                         </div>
                    </div>
                </div>
            </div>
        )}

        {/* GIỮ NGUYÊN BIỂU ĐỒ 1: GAP API */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" />Áp lực GAP API</h3>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Live Momentum</div>
            </div>
            <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={apiChartData}>
                        <defs>
                            <linearGradient id="gapFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#f8fafc" vertical={false} />
                        <XAxis dataKey="minute" domain={[0, 90]} hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="gap" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gapFill)" animationDuration={1000} />
                        <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="3 3" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* GIỮ NGUYÊN BIỂU ĐỒ 2: Market Chart (Sử dụng biểu đồ cũ từ logic dashboard trước đó nếu cần, ở đây tôi gộp vào LiveStats) */}
        <LiveStatsTable liveMatch={liveMatch} oddsHistory={oddsHistory} homeOddsHistory={homeOddsHistory} apiChartData={apiChartData} h1HomeOddsHistory={[]} h1OverUnderOddsHistory={[]} />
        
        <div className="grid grid-cols-2 gap-3">
             <StatBox label="Nguy hiểm" home={stats.dangerous_attacks[0]} away={stats.dangerous_attacks[1]} highlight />
             <StatBox label="Sút trúng" home={stats.on_target[0]} away={stats.on_target[1]} highlight />
        </div>

        <TicketManager match={liveMatch} latestOverOdds={oddsHistory[oddsHistory.length-1]} latestHomeOdds={homeOddsHistory[homeOddsHistory.length-1]} />
      </div>
    </div>
  );
};

const StatBox = ({ label, home, away, highlight }: { label: string, home: number, away: number, highlight?: boolean }) => {
    const total = home + away;
    const homePct = total === 0 ? 50 : (home / total) * 100;
    return (
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
            <div className="text-[10px] text-gray-400 text-center mb-3 uppercase font-black tracking-widest">{label}</div>
            <div className="flex justify-between items-end mb-2">
                <span className={`text-xl font-black ${highlight && home > away ? 'text-blue-600' : 'text-slate-800'}`}>{home}</span>
                <span className={`text-xl font-black ${highlight && away > home ? 'text-orange-600' : 'text-slate-800'}`}>{away}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${homePct}%` }}></div>
                <div className="h-full bg-orange-500 transition-all duration-700" style={{ width: `${100 - homePct}%` }}></div>
            </div>
        </div>
    );
};
