
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MatchInfo, PreGoalAnalysis, OddsItem, ProcessedStats, AIPredictionResponse, OddsData, ViewedMatchHistory } from '../types';
import { parseStats, getMatchDetails, getMatchOdds, getGeminiGoalPrediction } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Info, Activity, BrainCircuit, Zap, Target } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis, Tooltip, Cell, Line, Legend, CartesianGrid, Area, ReferenceLine } from 'recharts';
import { LiveStatsTable } from './LiveStatsTable';
import { TicketManager } from './TicketManager';

interface Highlight { minute: number; level: 'weak' | 'medium' | 'strong'; label: string; }
interface AllHighlights { overUnder: Highlight[]; homeOdds: Highlight[]; }
interface ShotEvent { minute: number; type: 'on' | 'off'; }
interface GameEvent { minute: number; type: 'goal' | 'corner'; }

interface DashboardProps {
  token: string;
  match: MatchInfo;
  onBack: () => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const minute = label;
    const marketData = payload.find(p => p.dataKey === 'handicap')?.payload;
    const homeApiData = payload.find(p => p.dataKey === 'homeApi');
    const awayApiData = payload.find(p => p.dataKey === 'awayApi');
    const gapData = payload.find(p => p.dataKey === 'gap');
    return (
        <div className="bg-slate-800 text-white text-xs p-2 rounded shadow-lg border border-slate-700">
            <p className="font-bold border-b border-slate-600 mb-1 pb-1">Phút: {minute}'</p>
            {gapData && <p className="font-black mb-1">Gap API: <span className={gapData.value >= 0 ? 'text-blue-400' : 'text-orange-400'}>{gapData.value >= 0 ? '+' : ''}{gapData.value.toFixed(1)}</span></p>}
            {marketData && (
                <>
                    <p>HDP: {typeof marketData.handicap === 'number' ? marketData.handicap.toFixed(2) : '-'}</p>
                    <p className="text-gray-400">Tỷ lệ: {marketData.over?.toFixed(3) || marketData.home?.toFixed(3)}</p>
                </>
            )}
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
                    <span className="text-[10px] text-gray-500 font-black">[{p.handicap}]</span>
                    <span className={`text-xs font-black ${i === 0 ? (p.colorName === 'red' ? 'text-red-500' : p.colorName === 'green' ? 'text-emerald-500' : 'text-slate-600') : 'text-slate-500'}`}>
                        {type === 'ou' ? p.over.toFixed(3) : p.home.toFixed(3)}
                    </span>
                </div>
            ))}
        </div>
    );
};

const CustomApiDot = (props: any) => {
    const { cx, cy, stroke, index, data } = props;
    if (index !== data.length - 1) return null;
    return (
        <g>
            <circle cx={cx} cy={cy} r={6} fill="white" stroke={stroke} strokeWidth={3} />
            <circle cx={cx} cy={cy} r={2} fill={stroke} />
        </g>
    );
};

const calculateAPIScore = (stats: ProcessedStats | undefined, sideIndex: 0 | 1): number => {
    if (!stats) return 0;
    return (stats.on_target[sideIndex] * 3.0) + (stats.off_target[sideIndex] * 1.0) + (stats.corners[sideIndex] * 0.7) + (stats.dangerous_attacks[sideIndex] * 0.1);
};

const OverlayContainer = ({ children }: { children?: React.ReactNode }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const observer = new ResizeObserver(entries => { if (entries[0]) setWidth(entries[0].contentRect.width); });
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);
    return (
        <div ref={containerRef} className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {width > 0 && React.Children.map(children, child => React.isValidElement(child) ? React.cloneElement(child, { containerWidth: width } as any) : child)}
        </div>
    );
};

const HighlightBands = ({ highlights, containerWidth }: { highlights: Highlight[], containerWidth?: number }) => {
    if (!containerWidth || highlights.length === 0) return null;
    const calculateLeft = (minute: number) => { return 45 + (minute / 90) * (containerWidth - 80); };
    return <>
        {highlights.map((h, i) => (
            <div key={i} className={`goal-highlight`} style={{ left: `${calculateLeft(h.minute)}px`, backgroundColor: h.level === 'strong' ? '#dc2626' : h.level === 'medium' ? '#f97316' : '#facc15' }}>
                <div className={`highlight-label label-color-${h.level}`}>{h.label}</div>
            </div>
        ))}
    </>;
};

const ShotBalls = ({ shots, containerWidth }: { shots: ShotEvent[], containerWidth?: number }) => {
    if (!containerWidth || shots.length === 0) return null;
    const calculateLeft = (minute: number) => { return 45 + (minute / 90) * (containerWidth - 80) - 10; };
    return <>
        {shots.map((shot, i) => (
            <div key={i} className={`ball-icon ${shot.type === 'on' ? 'ball-on' : 'ball-off'}`} style={{ left: `${calculateLeft(shot.minute)}px`, top: `${-10 + (i % 3) * 24}px` }}>⚽</div>
        ))}
    </>;
};

export const Dashboard: React.FC<DashboardProps> = ({ token, match, onBack }) => {
  const [liveMatch, setLiveMatch] = useState<MatchInfo>(match);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAIPredicting, setIsAIPredicting] = useState(false); 
  const [oddsHistory, setOddsHistory] = useState<any[]>([]);
  const [homeOddsHistory, setHomeOddsHistory] = useState<any[]>([]);
  const [statsHistory, setStatsHistory] = useState<Record<number, ProcessedStats>>({});
  const [highlights, setHighlights] = useState<AllHighlights>({ overUnder: [], homeOdds: [] });
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([]);
  const [aiInsight, setAiInsight] = useState<any | null>(null);

  const stats = useMemo(() => parseStats(liveMatch.stats), [liveMatch.stats]);

  const apiChartData = useMemo(() => {
      const sortedMinutes = Object.keys(statsHistory).map(Number).sort((a, b) => a - b);
      return sortedMinutes.map(minute => {
          const home = calculateAPIScore(statsHistory[minute], 0);
          const away = calculateAPIScore(statsHistory[minute], 1);
          return { minute, homeApi: home, awayApi: away, gap: home - away };
      });
  }, [statsHistory]);

  const tensionLevel = useMemo(() => {
    if (apiChartData.length < 3) return 20;
    const lastPoints = apiChartData.slice(-3);
    const sum = lastPoints.reduce((acc, curr) => acc + (curr.homeApi + curr.awayApi), 0);
    return Math.min(100, Math.max(10, (sum / 3) * 2.5));
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
    const res = await getGeminiGoalPrediction(liveMatch.id, liveMatch.timer?.tm || 0, liveMatch.home.name, liveMatch.away.name, 0, 0, stats, calculateAPIScore(stats, 0), calculateAPIScore(stats, 1), null, null, 0, 0, 0);
    if (res) setAiInsight(res);
    setIsAIPredicting(false);
  };

  useEffect(() => { handleRefresh(); const id = setInterval(handleRefresh, 45000); return () => clearInterval(id); }, [handleRefresh]);

  const scoreParts = (liveMatch.ss || "0-0").split("-");

  const processMarketData = (history: any[], valueKey: 'over' | 'home') => {
    const dataByHandicap: Record<string, any[]> = {};
    history.forEach(p => {
        const key = parseFloat(p.handicap).toFixed(2);
        if (!dataByHandicap[key]) dataByHandicap[key] = [];
        dataByHandicap[key].push(p);
    });
    const finalData: any[] = [];
    for (const k in dataByHandicap) {
        const points = dataByHandicap[k].sort((a,b) => a.add_time - b.add_time);
        finalData.push(...points.map((p, i) => {
            const diff = i > 0 ? p[valueKey] - points[i-1][valueKey] : 0;
            const color = diff < -0.001 ? '#ef4444' : diff > 0.001 ? '#10b981' : '#94a3b8';
            const colorName = diff < -0.001 ? 'red' : diff > 0.001 ? 'green' : 'gray';
            return { ...p, handicap: parseFloat(p.handicap), color, colorName };
        }));
    }
    return finalData.sort((a,b) => a.minute - b.minute);
  };

  const marketChartData = useMemo(() => processMarketData(oddsHistory, 'over'), [oddsHistory]);
  const homeMarketChartData = useMemo(() => processMarketData(homeOddsHistory, 'home'), [homeOddsHistory]);

  return (
    <div className="pb-24 bg-gray-50 min-h-screen">
      <div className="bg-white sticky top-0 z-30 shadow-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-400 active:bg-gray-100 rounded-full"><ArrowLeft /></button>
        <div className="text-center">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">PRO FOOTBALL ANALYTICS</div>
            <div className="text-red-600 font-black flex items-center justify-center gap-1">
                <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-ping"></div>
                {liveMatch.timer?.tm || 0}'
            </div>
        </div>
        <button onClick={fetchAI} disabled={isAIPredicting} className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg active:scale-90 transition-all">
            {isAIPredicting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <BrainCircuit className="w-5 h-5" />}
        </button>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Score Board */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex justify-between items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600"></div>
            <div className="w-1/3 text-center font-bold text-sm truncate">{liveMatch.home.name}</div>
            <div className="flex items-center gap-4">
                <span className="text-4xl font-black text-slate-900">{scoreParts[0]}</span>
                <span className="text-gray-200 text-2xl font-light">:</span>
                <span className="text-4xl font-black text-slate-900">{scoreParts[1]}</span>
            </div>
            <div className="w-1/3 text-center font-bold text-sm truncate">{liveMatch.away.name}</div>
        </div>

        {/* 1. MOMENTUM ALERT BAR (Như ảnh mẫu) */}
        <div className="bg-[#0f172a] rounded-xl p-4 border border-slate-800 shadow-xl overflow-hidden relative">
            <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${tensionLevel > 70 ? 'border-red-500 bg-red-500/10' : 'border-blue-500 bg-blue-500/10'}`}>
                    <Zap className={`w-5 h-5 ${tensionLevel > 70 ? 'text-red-500 animate-pulse' : 'text-blue-400'}`} />
                </div>
                <div className="flex-grow">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">MOMENTUM ALERT</span>
                        <span className={`text-xs font-black ${tensionLevel > 70 ? 'text-red-500' : 'text-blue-400'}`}>{Math.round(tensionLevel)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${tensionLevel > 70 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${tensionLevel}%` }}></div>
                    </div>
                    <div className="text-[9px] text-gray-500 mt-1 font-medium italic">
                        {tensionLevel > 70 ? 'TRẬN ĐẤU ĐANG CỰC KỲ CĂNG THẲNG!' : 'Trận đấu đang ở nhịp độ thấp.'}
                    </div>
                </div>
            </div>
        </div>

        {/* 2 & 3. AI TACTICAL & GHOST PATTERN INSIGHT (Như ảnh mẫu) */}
        {aiInsight && (
            <div className="bg-white rounded-3xl border border-blue-50 p-5 shadow-sm space-y-4 animate-in fade-in duration-500">
                <div className="flex items-center gap-2 pb-3 border-b border-gray-50">
                    <Target className="w-5 h-5 text-blue-600" />
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">AI Tactical & Pattern Insight</h4>
                </div>
                <div className="space-y-4">
                    <div>
                        <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Dự báo chiến thuật</div>
                        <p className="text-sm text-slate-600 leading-relaxed font-medium italic">"{aiInsight.tactical_insight}"</p>
                    </div>
                    <div className="p-4 bg-blue-50/30 rounded-2xl border border-blue-100">
                        <div className="text-[10px] font-bold text-blue-600 uppercase mb-1 flex items-center gap-1">
                            <Info className="w-3 h-3" /> Đối soát kịch bản lịch sử
                        </div>
                        <p className="text-xs text-blue-800 leading-relaxed font-semibold">{aiInsight.ghost_pattern}</p>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                         <div className="flex items-center gap-2">
                             <div className="w-10 h-10 rounded-full border-4 border-blue-100 flex items-center justify-center text-xs font-black text-blue-600">
                                {aiInsight.goal_probability}%
                             </div>
                             <span className="text-[10px] font-bold text-gray-400 uppercase">Khả năng nổ bàn</span>
                         </div>
                         <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${aiInsight.confidence_level === 'cao' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            Độ tin cậy: {aiInsight.confidence_level}
                         </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- GIỮ NGUYÊN TOÀN BỘ BIỂU ĐỒ --- */}
        <LiveStatsTable liveMatch={liveMatch} oddsHistory={oddsHistory} homeOddsHistory={homeOddsHistory} apiChartData={apiChartData} h1HomeOddsHistory={[]} h1OverUnderOddsHistory={[]} />

        {/* GAP API Chart */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-4">Động lực tấn công (GAP API)</h3>
            <div className="h-64 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={apiChartData} margin={{ left: -25 }}>
                        <defs>
                            <linearGradient id="gapGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                                <stop offset="100%" stopColor="#f97316" stopOpacity={0.8} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="minute" type="number" domain={[0, 90]} hide />
                        <YAxis domain={[-35, 35]} hide />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
                        <Area type="monotone" dataKey="gap" stroke="#334155" fill="url(#gapGrad)" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Market Charts */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-gray-700">Tài/Xỉu Market</h3>
                <OddsPulse data={marketChartData} type="ou" />
            </div>
            <div className="h-72 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart margin={{ left: -15 }}>
                        <CartesianGrid stroke="#f1f5f9" vertical={false} />
                        <XAxis type="number" dataKey="minute" domain={[0, 90]} hide />
                        <YAxis yAxisId="left" domain={['auto', 'auto']} hide />
                        <YAxis yAxisId="right" orientation="right" hide />
                        <Tooltip content={<CustomTooltip />} />
                        <Scatter yAxisId="left" name="OU" data={marketChartData}>{marketChartData.map((e, i) => <Cell key={i} fill={e.color} />)}</Scatter>
                        <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" stroke="#3b82f6" strokeWidth={3} dot={<CustomApiDot data={apiChartData} />} />
                        <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" stroke="#f97316" strokeWidth={3} dot={<CustomApiDot data={apiChartData} />} />
                    </ComposedChart>
                </ResponsiveContainer>
                <OverlayContainer><ShotBalls shots={shotEvents} /></OverlayContainer>
            </div>
        </div>

        <TicketManager match={liveMatch} latestOverOdds={oddsHistory[oddsHistory.length-1]} latestHomeOdds={homeOddsHistory[homeOddsHistory.length-1]} />
      </div>
    </div>
  );
};
