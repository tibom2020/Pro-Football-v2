
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MatchInfo, PreGoalAnalysis, OddsItem, ProcessedStats, AIPredictionResponse, OddsData, ViewedMatchHistory } from '../types';
import { parseStats, getMatchDetails, getMatchOdds, getGeminiGoalPrediction } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Info } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis, Tooltip, Cell, Line, Legend, CartesianGrid, Area, ReferenceLine } from 'recharts';
import { LiveStatsTable } from './LiveStatsTable';
import { TicketManager } from './TicketManager';

// --- Types for Highlights and Shots ---
interface Highlight {
    minute: number;
    level: 'weak' | 'medium' | 'strong';
    label: string;
}
interface AllHighlights {
    overUnder: Highlight[];
    homeOdds: Highlight[];
}
interface ShotEvent {
    minute: number;
    type: 'on' | 'off';
}
interface GameEvent {
  minute: number;
  type: 'goal' | 'corner';
}

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
            {gapData && (
                 <p className="font-black mb-1">
                    Gap API: <span className={gapData.value >= 0 ? 'text-blue-400' : 'text-orange-400'}>
                        {gapData.value >= 0 ? '+' : ''}{gapData.value.toFixed(1)}
                    </span>
                 </p>
            )}
            {marketData && (
                <>
                    <p>HDP: {typeof marketData.handicap === 'number' ? marketData.handicap.toFixed(2) : '-'}</p>
                    {marketData.over !== undefined && (
                        <p className="text-gray-400">Tỷ lệ Tài: {typeof marketData.over === 'number' ? marketData.over.toFixed(3) : '-'}</p>
                    )}
                    {marketData.home !== undefined && (
                         <p className="text-gray-400">Tỷ lệ Đội nhà: {typeof marketData.home === 'number' ? marketData.home.toFixed(3) : '-'}</p>
                    )}
                </>
            )}
            {homeApiData && homeApiData.value !== undefined && (
                 <p style={{ color: homeApiData.stroke }}>API Đội nhà: {homeApiData.value.toFixed(1)}</p>
            )}
             {awayApiData && awayApiData.value !== undefined && (
                 <p style={{ color: awayApiData.stroke }}>API Đội khách: {awayApiData.value.toFixed(1)}</p>
            )}
        </div>
    );
  }
  return null;
};

const OddsColorLegent = () => (
    <div className="flex items-center justify-center space-x-4 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span>Tăng (Money Out)</span>
        </div>
        <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-slate-400"></div>
            <span>Ổn định</span>
        </div>
        <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Giảm (Hot/Money In)</span>
        </div>
    </div>
);

// --- Custom Dot Component for API Lines ---
const CustomApiDot = (props: any) => {
    const { cx, cy, stroke, index, data } = props;
    if (index !== data.length - 1) return null;
    
    return (
        <g>
            <circle cx={cx} cy={cy} r={6} fill="white" stroke={stroke} strokeWidth={3} style={{ filter: 'drop-shadow(0px 0px 4px rgba(0,0,0,0.3))' }} />
            <circle cx={cx} cy={cy} r={2} fill={stroke} />
        </g>
    );
};

// --- API Calculation ---
const calculateAPIScore = (stats: ProcessedStats | undefined, sideIndex: 0 | 1): number => {
    if (!stats) return 0;
    const onTarget = stats.on_target[sideIndex];
    const offTarget = stats.off_target[sideIndex];
    const shots = onTarget + offTarget;
    const corners = stats.corners[sideIndex];
    const dangerous = stats.dangerous_attacks[sideIndex];
    return (shots * 1.0) + (onTarget * 3.0) + (corners * 0.7) + (dangerous * 0.1);
};

// --- Overlay Components ---
const OverlayContainer = ({ children }: { children?: React.ReactNode }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            if (entries[0]) setWidth(entries[0].contentRect.width);
        });
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={containerRef} className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {width > 0 && React.Children.map(children, child =>
                React.isValidElement(child) ? React.cloneElement(child, { containerWidth: width } as any) : child
            )}
        </div>
    );
};

const HighlightBands = ({ highlights, containerWidth }: { highlights: Highlight[], containerWidth?: number }) => {
    if (!containerWidth || highlights.length === 0) return null;
    
    const calculateLeft = (minute: number) => {
        const yAxisLeftWidth = 45;
        const yAxisRightWidth = 35;
        const chartAreaWidth = containerWidth - yAxisLeftWidth - yAxisRightWidth;
        const leftOffset = yAxisLeftWidth;
        return leftOffset + (minute / 90) * chartAreaWidth;
    };

    const getHighlightColor = (level: Highlight['level']) => {
      switch (level) {
        case 'strong': return '#dc2626';
        case 'medium': return '#f97316';
        case 'weak': return '#facc15';
        default: return '#cbd5e1';
      }
    };

    return <>
        {highlights.map((h, i) => (
            <div key={i} className={`goal-highlight`} style={{ left: `${calculateLeft(h.minute)}px`, backgroundColor: getHighlightColor(h.level) }}>
                <div className={`highlight-label label-color-${h.level}`}>{h.label}</div>
            </div>
        ))}
    </>;
};

const ShotBalls = ({ shots, containerWidth }: { shots: ShotEvent[], containerWidth?: number }) => {
    if (!containerWidth || shots.length === 0) return null;
    
    const calculateLeft = (minute: number) => {
        const yAxisLeftWidth = 45;
        const yAxisRightWidth = 35;
        const chartAreaWidth = containerWidth - yAxisLeftWidth - yAxisRightWidth;
        const leftOffset = yAxisLeftWidth;
        return leftOffset + (minute / 90) * chartAreaWidth - 10; 
    };

    const shotsByMinute = shots.reduce((acc, shot) => {
        if (!acc[shot.minute]) acc[shot.minute] = [];
        acc[shot.minute].push(shot.type);
        return acc;
    }, {} as Record<number, ('on' | 'off')[]>);

    return <>
        {Object.entries(shotsByMinute).map(([minute, types]) => 
            types.map((type, index) => (
                 <div key={`${minute}-${index}`} className={`ball-icon ${type === 'on' ? 'ball-on' : 'ball-off'}`} style={{ left: `${calculateLeft(Number(minute))}px`, top: `${-10 + index * 24}px` }}>
                    ⚽
                </div>
            ))
        )}
    </>;
};

const GameEventMarkers = ({ events, containerWidth }: { events: GameEvent[], containerWidth?: number }) => {
    if (!containerWidth || events.length === 0) return null;
    
    const calculateLeft = (minute: number) => {
        const yAxisLeftWidth = 45;
        const yAxisRightWidth = 35;
        const chartAreaWidth = containerWidth - yAxisLeftWidth - yAxisRightWidth;
        const leftOffset = yAxisLeftWidth;
        return leftOffset + (minute / 90) * chartAreaWidth;
    };

    return <>
        {events.map((event, i) => {
            let className = '';
            let icon = '';
            if (event.type === 'goal') { className = 'game-event-goal'; icon = '⚽'; }
            else if (event.type === 'corner') { className = 'game-event-corner'; icon = '🚩'; }
            return (
                <div key={`${event.type}-${event.minute}-${i}`} className={`game-event-icon ${className}`} style={{ left: `${calculateLeft(event.minute)}px` }}>
                    {icon}
                </div>
            );
        })}
    </>;
};

export const Dashboard: React.FC<DashboardProps> = ({ token, match, onBack }) => {
  const AUTO_REFRESH_INTERVAL_MS = 40000;

  const [liveMatch, setLiveMatch] = useState<MatchInfo>(match);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAIPredicting, setIsAIPredicting] = useState(false); 
  const [oddsHistory, setOddsHistory] = useState<{ minute: number; over: number; under: number; handicap: string }[]>([]);
  const [homeOddsHistory, setHomeOddsHistory] = useState<{ minute: number; home: number; away: number; handicap: string }[]>([]);
  const [h1HomeOddsHistory, setH1HomeOddsHistory] = useState<{ minute: number; home: number; away: number; handicap: string }[]>([]);
  const [h1OverUnderOddsHistory, setH1OverUnderOddsHistory] = useState<{ minute: number; over: number; under: number; handicap: string }[]>([]);
  const [statsHistory, setStatsHistory] = useState<Record<number, ProcessedStats>>({});
  const [highlights, setHighlights] = useState<AllHighlights>({ overUnder: [], homeOdds: [] });
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([]);
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<PreGoalAnalysis[]>([]);
  const prevMatchState = useRef<MatchInfo | null>(null);
  
  const stats = useMemo(() => parseStats(liveMatch.stats), [liveMatch.stats]);
  const latestAnalysis = useMemo(() => analysisHistory[0] || null, [analysisHistory]);

  useEffect(() => {
    const savedStats = localStorage.getItem(`statsHistory_${match.id}`);
    if (savedStats) setStatsHistory(JSON.parse(savedStats)); else setStatsHistory({});
    const savedHighlights = localStorage.getItem(`highlights_${match.id}`);
    if (savedHighlights) setHighlights(JSON.parse(savedHighlights)); else setHighlights({ overUnder: [], homeOdds: [] });
    const savedAnalysis = localStorage.getItem(`analysisHistory_${match.id}`);
    if (savedAnalysis) setAnalysisHistory(JSON.parse(savedAnalysis)); else setAnalysisHistory([]);
    const savedGameEvents = localStorage.getItem(`gameEvents_${match.id}`);
    if (savedGameEvents) setGameEvents(JSON.parse(savedGameEvents)); else setGameEvents([]);
  }, [match.id]);
  
  useEffect(() => {
    try {
        const historyStr = localStorage.getItem('viewedMatchesHistory');
        const history: ViewedMatchHistory = historyStr ? JSON.parse(historyStr) : {};
        history[match.id] = { match: liveMatch, viewedAt: Date.now() };
        localStorage.setItem('viewedMatchesHistory', JSON.stringify(history));
    } catch (e) { console.error(e); }
  }, [match.id, liveMatch]);

  useEffect(() => {
     if (Object.keys(statsHistory).length > 0) localStorage.setItem(`statsHistory_${match.id}`, JSON.stringify(statsHistory));
  }, [statsHistory, match.id]);

  useEffect(() => {
    if (highlights.overUnder.length > 0 || highlights.homeOdds.length > 0) localStorage.setItem(`highlights_${match.id}`, JSON.stringify(highlights));
  }, [highlights, match.id]);

  useEffect(() => {
    if (analysisHistory.length > 0) localStorage.setItem(`analysisHistory_${match.id}`, JSON.stringify(analysisHistory));
  }, [analysisHistory, match.id]);

  useEffect(() => {
    if (gameEvents.length > 0) localStorage.setItem(`gameEvents_${match.id}`, JSON.stringify(gameEvents));
  }, [gameEvents, match.id]);

  const marketChartData = useMemo(() => {
    const dataByHandicap: Record<string, any[]> = {};
    oddsHistory.forEach(p => {
        if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = [];
        dataByHandicap[p.handicap].push(p);
    });
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#94a3b8'; let colorName = 'gray';
            if (index > 0) {
                const diff = point.over - points[index - 1].over;
                if (diff < -0.01) { color = '#ef4444'; colorName = 'red'; }
                else if (diff > 0.01) { color = '#10b981'; colorName = 'green'; }
            }
            return { ...point, handicap: parseFloat(point.handicap), color, colorName, highlight: false };
        });
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [oddsHistory]);

  const homeMarketChartData = useMemo(() => {
    const dataByHandicap: Record<string, any[]> = {};
    homeOddsHistory.forEach(p => {
        if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = [];
        dataByHandicap[p.handicap].push(p);
    });
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#94a3b8'; let colorName = 'gray';
            if (index > 0) {
                const diff = point.home - points[index - 1].home;
                if (diff < -0.01) { color = '#ef4444'; colorName = 'red'; }
                else if (diff > 0.01) { color = '#10b981'; colorName = 'green'; }
            }
            return { ...point, handicap: parseFloat(point.handicap), color, colorName, highlight: false };
        });
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [homeOddsHistory]);

  const apiChartData = useMemo(() => {
      const sortedMinutes = Object.keys(statsHistory).map(Number).sort((a, b) => a - b);
      return sortedMinutes.map(minute => {
          const home = calculateAPIScore(statsHistory[minute], 0);
          const away = calculateAPIScore(statsHistory[minute], 1);
          return { minute, homeApi: home, awayApi: away, gap: home - away };
      });
  }, [statsHistory]);

  const calculateYAxisConfig = useCallback((chartData: { handicap?: number }[], minDomainValue: number | null) => {
    const allH = chartData.map(d => d.handicap).filter((h): h is number => typeof h === 'number' && isFinite(h));
    if (allH.length === 0) return { domain: [0, 2], ticks: [0, 0.5, 1, 1.5, 2] };
    let minD = minDomainValue !== null ? minDomainValue : Math.floor(Math.min(...allH) / 0.25) * 0.25;
    const maxD = Math.ceil(Math.max(...allH) / 0.25) * 0.25;
    const ticks = [];
    for (let i = minD; i <= maxD; i = parseFloat((i + 0.25).toFixed(2))) ticks.push(i);
    return { domain: [minD, maxD], ticks };
  }, []);

  const overUnderYAxisConfig = useMemo(() => calculateYAxisConfig(marketChartData, 0.5), [marketChartData, calculateYAxisConfig]);
  const homeAwayYAxisConfig = useMemo(() => calculateYAxisConfig(homeMarketChartData, null), [homeMarketChartData, calculateYAxisConfig]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
        const updatedDetails = await getMatchDetails(token, liveMatch.id);
        if (updatedDetails) {
            setLiveMatch(updatedDetails);
            const currentTime = updatedDetails.timer?.tm;
            if (currentTime && updatedDetails.stats) setStatsHistory(prev => ({ ...prev, [currentTime]: parseStats(updatedDetails.stats) }));
        }
        const updatedOdds = await getMatchOdds(token, liveMatch.id);
        if (updatedOdds) {
            const overMarkets = updatedOdds.results?.odds?.['1_3'];
            if (overMarkets) setOddsHistory(overMarkets.filter(m => m.time_str && m.over_od && m.under_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), over: parseFloat(m.over_od!), under: parseFloat(m.under_od!), handicap: m.handicap! })).sort((a, b) => a.minute - b.minute));
            const homeMarkets = updatedOdds.results?.odds?.['1_2'];
            if (homeMarkets) setHomeOddsHistory(homeMarkets.filter(m => m.time_str && m.home_od && m.away_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), home: parseFloat(m.home_od!), away: parseFloat(m.away_od!), handicap: m.handicap! })).sort((a,b) => a.minute - b.minute));
        }
    } catch (error) { console.error(error); } finally { setIsRefreshing(false); }
  }, [token, liveMatch.id]); 
  
  const fetchGeminiPrediction = useCallback(async () => {
    setIsAIPredicting(true);
    try {
        const currentMinute = liveMatch.timer?.tm || parseInt(liveMatch.time || "0");
        const homeScore = parseInt((liveMatch.ss || "0-0").split("-")[0]);
        const awayScore = parseInt((liveMatch.ss || "0-0").split("-")[1]);
        const currentLatestOverOdds = marketChartData.length > 0 ? marketChartData[marketChartData.length - 1] : null;
        const currentLatestHomeOdds = homeMarketChartData.length > 0 ? homeMarketChartData[homeMarketChartData.length - 1] : null;
        
        const aiPrediction = await getGeminiGoalPrediction(
            liveMatch.id, currentMinute, liveMatch.home.name, liveMatch.away.name, homeScore, awayScore,
            stats, calculateAPIScore(stats, 0), calculateAPIScore(stats, 1), currentLatestOverOdds, 
            currentLatestHomeOdds, 0, 0, 0
        );

        if (aiPrediction) {
            const newAnalysis: PreGoalAnalysis = {
                minute: currentMinute,
                score: aiPrediction.goal_probability,
                level: aiPrediction.confidence_level,
                factors: { apiMomentum: 0, shotCluster: 0, pressure: 0 },
                reasoning: aiPrediction.reasoning,
            };
            setAnalysisHistory(prev => [newAnalysis, ...prev]);
        }
    } catch (e) { console.error(e); } finally { setIsAIPredicting(false); }
  }, [liveMatch, stats, marketChartData, homeMarketChartData]);

  useEffect(() => {
    handleRefresh();
    const intervalId = window.setInterval(handleRefresh, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [handleRefresh, AUTO_REFRESH_INTERVAL_MS]);
  
  useEffect(() => {
      const allTimes = Object.keys(statsHistory).map(Number).sort((a,b)=>a-b);
      if (allTimes.length < 2) return;
      const newShots: ShotEvent[] = [];
      for(let i=1; i<allTimes.length; i++) {
          const t = allTimes[i], pt = allTimes[i-1];
          const s = statsHistory[t], ps = statsHistory[pt];
          if(!s || !ps) continue;
          const onD = (s.on_target[0] + s.on_target[1]) - (ps.on_target[0] + ps.on_target[1]);
          const offD = (s.off_target[0] + s.off_target[1]) - (ps.off_target[0] + ps.off_target[1]);
          for(let j=0; j<onD; j++) newShots.push({ minute: t, type: 'on' });
          for(let j=0; j<offD; j++) newShots.push({ minute: t, type: 'off' });
      }
      setShotEvents(newShots);
  }, [statsHistory]);

  const scoreParts = (liveMatch.ss || "0-0").split("-");

  return (
    <div className="pb-10">
      <div className="bg-white sticky top-0 z-10 shadow-sm border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-6 h-6" /></button>
          <div className="flex flex-col items-center">
             <span className="text-xs font-bold text-gray-400">PHÂN TÍCH TRỰC TIẾP</span>
             <span className="text-red-500 font-bold flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                {liveMatch.timer?.tm || liveMatch.time}'
             </span>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={fetchGeminiPrediction} disabled={isAIPredicting} className="p-2 -mr-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-50">
              {isAIPredicting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
            </button>
            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 -mr-2 text-gray-600 active:bg-gray-100 rounded-full">
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center px-6 pb-4">
            <div className="flex flex-col items-center w-1/3 text-center">
                <div className="font-bold text-base leading-tight mb-1 truncate w-full">{liveMatch.home.name}</div>
                <div className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Home</div>
            </div>
            <div className="flex items-center gap-3">
                <span className="text-4xl font-black text-slate-800">{scoreParts[0]}</span>
                <span className="text-gray-300 text-2xl font-light">-</span>
                <span className="text-4xl font-black text-slate-800">{scoreParts[1]}</span>
            </div>
            <div className="flex flex-col items-center w-1/3 text-center">
                <div className="font-bold text-base leading-tight mb-1 truncate w-full">{liveMatch.away.name}</div>
                <div className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">Away</div>
            </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <LiveStatsTable
          liveMatch={liveMatch}
          oddsHistory={oddsHistory}
          homeOddsHistory={homeOddsHistory}
          apiChartData={apiChartData}
          h1HomeOddsHistory={h1HomeOddsHistory}
          h1OverUnderOddsHistory={h1OverUnderOddsHistory}
        />

        {/* --- Biểu đồ 1: Over/Under Market + API Lines --- */}
        {(marketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" />Thị trường Tài/Xỉu & Dòng thời gian API</h3>
              <div className="relative h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                          <XAxis type="number" dataKey="minute" domain={[0, 90]} ticks={[0, 45, 90]} tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="left" dataKey="handicap" width={45} domain={overUnderYAxisConfig.domain} ticks={overUnderYAxisConfig.ticks} tickFormatter={(t) => t.toFixed(2)} tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" width={35} domain={['dataMin - 5', 'dataMax + 10']} tick={{ fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Scatter yAxisId="left" name="Thị trường" data={marketChartData}>{marketChartData.map((e, i) => ( <Cell key={i} fill={e.color} /> ))}</Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" name="API Đội nhà" stroke="#3b82f6" strokeWidth={3} dot={<CustomApiDot data={apiChartData} />} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" name="API Đội khách" stroke="#f97316" strokeWidth={3} dot={<CustomApiDot data={apiChartData} />} />
                      </ComposedChart>
                  </ResponsiveContainer>
                   <OverlayContainer>
                      <HighlightBands highlights={highlights.overUnder} />
                      <ShotBalls shots={shotEvents} />
                  </OverlayContainer>
                  <OddsColorLegent />
              </div>
          </div>
        )}

        {/* --- BIỂU ĐỒ MỚI: ĐỘNG LỰC TẤN CÔNG (GAP API) --- */}
        {apiChartData.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-gray-700">Động lực tấn công (GAP API)</h3>
                <div className="text-[9px] font-black uppercase tracking-tighter text-gray-400">The Analyst Style</div>
              </div>
              <div className="relative h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={apiChartData} margin={{ top: 10, right: 10, bottom: 0, left: -25 }}>
                          <defs>
                              <linearGradient id="gapGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                                  <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.2} />
                                  <stop offset="50%" stopColor="#f97316" stopOpacity={0.2} />
                                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.8} />
                              </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="minute" type="number" domain={[0, 90]} ticks={[0, 45, 90]} tick={{ fontSize: 10 }} />
                          <YAxis domain={[-35, 35]} ticks={[-30, -15, 0, 15, 30]} tick={{ fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" />
                          <Area 
                            type="monotone" 
                            dataKey="gap" 
                            stroke="#334155" 
                            strokeWidth={1}
                            fill="url(#gapGradient)" 
                            animationDuration={1500}
                          />
                      </ComposedChart>
                  </ResponsiveContainer>
                  {/* Nhãn Đội nhà/Khách trên biểu đồ GAP */}
                  <div className="absolute top-2 left-10 text-[9px] font-bold text-blue-500 opacity-60">Home more threatening ↑</div>
                  <div className="absolute bottom-6 left-10 text-[9px] font-bold text-orange-500 opacity-60">Away more threatening ↓</div>
              </div>
              <div className="mt-2 text-[10px] text-center text-gray-400 italic font-medium">Biểu đồ thể hiện sự chênh lệch áp lực (Gap) giữa 2 đội</div>
          </div>
        )}

        {/* --- Biểu đồ 2: Handicap Market + API Lines --- */}
        {(homeMarketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-purple-500" />Tỷ lệ Handicap & Dòng thời gian API</h3>
              <div className="relative h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                          <XAxis type="number" dataKey="minute" domain={[0, 90]} ticks={[0, 45, 90]} tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="left" dataKey="handicap" width={45} domain={homeAwayYAxisConfig.domain} ticks={homeAwayYAxisConfig.ticks} tickFormatter={(t) => t.toFixed(2)} tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" width={35} domain={['dataMin - 5', 'dataMax + 10']} tick={{ fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Scatter yAxisId="left" name="Thị trường" data={homeMarketChartData}>{homeMarketChartData.map((e, i) => ( <Cell key={i} fill={e.color} /> ))}</Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" stroke="#3b82f6" strokeWidth={3} dot={<CustomApiDot data={apiChartData} />} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" stroke="#f97316" strokeWidth={3} dot={<CustomApiDot data={apiChartData} />} />
                      </ComposedChart>
                  </ResponsiveContainer>
                   <OverlayContainer>
                      <HighlightBands highlights={highlights.homeOdds} />
                      <ShotBalls shots={shotEvents} />
                  </OverlayContainer>
                  <OddsColorLegent />
              </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-3">
            <StatBox label="Tấn công" home={stats.attacks[0]} away={stats.attacks[1]} />
            <StatBox label="Nguy hiểm" home={stats.dangerous_attacks[0]} away={stats.dangerous_attacks[1]} highlight />
            <StatBox label="Trúng đích" home={stats.on_target[0]} away={stats.on_target[1]} highlight />
            <StatBox label="Phạt góc" home={stats.corners[0]} away={stats.corners[1]} />
        </div>

        <TicketManager 
            match={liveMatch} 
            latestOverOdds={oddsHistory[oddsHistory.length - 1]}
            latestHomeOdds={homeOddsHistory[homeOddsHistory.length - 1]}
            latestH1OverOdds={h1OverUnderOddsHistory[h1OverUnderOddsHistory.length - 1]}
            latestH1HomeOdds={h1HomeOddsHistory[h1HomeOddsHistory.length - 1]}
        />
      </div>
    </div>
  );
};

const StatBox = ({ label, home, away, highlight }: { label: string, home: number, away: number, highlight?: boolean }) => {
    const total = home + away;
    const homePct = total === 0 ? 50 : (home / total) * 100;
    return (
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
            <div className="text-xs text-gray-400 text-center mb-2 uppercase font-semibold">{label}</div>
            <div className="flex justify-between items-end mb-1">
                <span className={`text-lg font-bold ${highlight && home > away ? 'text-blue-600' : 'text-gray-800'}`}>{home}</span>
                <span className={`text-lg font-bold ${highlight && away > home ? 'text-orange-600' : 'text-gray-800'}`}>{away}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${homePct}%` }}></div>
                <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${100 - homePct}%` }}></div>
            </div>
        </div>
    );
};
