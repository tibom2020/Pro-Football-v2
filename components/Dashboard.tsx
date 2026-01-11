
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MatchInfo, PreGoalAnalysis, ProcessedStats } from '../types';
import { parseStats, getMatchDetails, getMatchOdds, getGeminiGoalPrediction } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Info, Zap, X, MessageSquare } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis, Tooltip, Cell, Line, Legend, CartesianGrid } from 'recharts';
import { LiveStatsTable } from './LiveStatsTable';
import { TicketManager } from './TicketManager';
import { AlertHistoryPanel, StoredAlert } from './AlertHistoryPanel';

// --- Types for Highlights and Shots ---
interface Highlight {
    minute: number;
    level: 'weak' | 'medium' | 'strong';
    label: string;
}
interface ShotEvent {
    minute: number;
    type: 'on' | 'off';
}
interface GameEvent {
  minute: number;
  type: 'goal' | 'corner';
}

interface MomentumAlertState {
    active: boolean;
    message: string;
    subMessage: string;
    type: 'pressure' | 'goal';
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

    return (
        <div className="bg-slate-800 text-white text-xs p-2 rounded shadow-lg border border-slate-700 z-50">
            <p className="font-bold border-b border-slate-600 mb-1 pb-1">Phút: {minute}'</p>
            {marketData && (
                <>
                    <p className="font-semibold text-yellow-400">HDP: {typeof marketData.handicap === 'number' ? marketData.handicap.toFixed(2) : '-'}</p>
                    {marketData.over !== undefined && (
                        <p className="text-gray-300">Odds Tài: <span className={marketData.colorName === 'red' ? 'text-red-400' : marketData.colorName === 'green' ? 'text-green-400' : 'text-white'}>{typeof marketData.over === 'number' ? marketData.over.toFixed(3) : '-'}</span></p>
                    )}
                    {marketData.home !== undefined && (
                         <p className="text-gray-300">Odds Nhà: <span className={marketData.colorName === 'red' ? 'text-red-400' : marketData.colorName === 'green' ? 'text-green-400' : 'text-white'}>{typeof marketData.home === 'number' ? marketData.home.toFixed(3) : '-'}</span></p>
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
    <div className="flex flex-col gap-2 mt-3 px-4 py-2 bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Thị trường:</span>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                    <div className="w-1.5 h-3 bg-emerald-500 rounded-sm"></div>
                    <span>Tăng</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-1.5 h-3 bg-slate-400 rounded-sm"></div>
                    <span>Ổn định</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-1.5 h-3 bg-red-500 rounded-sm"></div>
                    <span>Giảm (Hot)</span>
                </div>
            </div>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-slate-800 pt-2">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Nhịp độ (Thanh dưới):</span>
            <div className="flex items-center gap-3">
                 <div className="flex items-center gap-1">
                    <div className="w-2 h-4 rounded-sm bg-yellow-400"></div>
                    <span>Chậm</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-4 rounded-sm bg-orange-500"></div>
                    <span>Tăng tốc</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-4 rounded-sm bg-red-600"></div>
                    <span>Dồn ép</span>
                </div>
            </div>
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

// --- Custom Candle Component ---
const CustomCandle = (props: any) => {
    const { cx, cy, fill, payload } = props;
    const oddsValue = payload.over ?? payload.home ?? 1.9;
    
    let height = 12;
    if (oddsValue > 1.4) {
        const base = 1.6;
        const diff = Math.max(0, oddsValue - base);
        height = 10 + (diff * 100); 
    } else {
        const base = 0.6;
        const diff = Math.max(0, oddsValue - base);
        height = 10 + (diff * 100);
    }
    height = Math.max(10, Math.min(height, 55));
    const width = payload.highlight ? 7 : 4; 

    return (
        <g>
            <line x1={cx} y1={cy - height/2 - 4} x2={cx} y2={cy + height/2 + 4} stroke={fill} strokeWidth={1.5} opacity={0.6}/>
            <rect x={cx - width/2} y={cy - height/2} width={width} height={height} fill={fill} stroke={payload.highlight ? "#fff" : "none"} strokeWidth={payload.highlight ? 1.5 : 0} rx={1} style={{ filter: payload.highlight ? 'drop-shadow(0px 0px 2px rgba(0,0,0,0.3))' : 'none' }}/>
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
    return <>{highlights.map((h, i) => (<div key={i} className={`goal-highlight`} style={{ left: `${calculateLeft(h.minute)}px`, backgroundColor: getHighlightColor(h.level) }}></div>))}</>;
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
    return <>{Object.entries(shotsByMinute).map(([minute, types]) => types.map((type, index) => (<div key={`${minute}-${index}`} className={`ball-icon ${type === 'on' ? 'ball-on' : 'ball-off'}`} style={{ left: `${calculateLeft(Number(minute))}px`, top: `${-10 + index * 24}px` }} title={`Shot ${type}-target at ${minute}'`}>⚽</div>)))}</>;
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
    return <>{events.map((event, i) => {
            let className = '';
            let icon = '';
            if (event.type === 'goal') { className = 'game-event-goal'; icon = '⚽'; } 
            else if (event.type === 'corner') { className = 'game-event-corner'; icon = '🚩'; }
            return (<div key={`${event.type}-${event.minute}-${i}`} className={`game-event-icon ${className}`} style={{ left: `${calculateLeft(event.minute)}px` }} title={`${event.type.charAt(0).toUpperCase() + event.type.slice(1)} at ${event.minute}'`}>{icon}</div>);
        })}</>;
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
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([]);
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<PreGoalAnalysis[]>([]);
  const prevMatchState = useRef<MatchInfo | null>(null);
  const [alertState, setAlertState] = useState<MomentumAlertState>({ active: false, message: '', subMessage: '', type: 'pressure' });
  const lastAlertMinute = useRef<number>(0);
  const [alertHistory, setAlertHistory] = useState<StoredAlert[]>([]);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [hasNewAlert, setHasNewAlert] = useState(false);
  
  const stats = useMemo(() => parseStats(liveMatch.stats), [liveMatch.stats]);
  const latestAnalysis = useMemo(() => analysisHistory[0] || null, [analysisHistory]);

  useEffect(() => {
    const savedStats = localStorage.getItem(`statsHistory_${match.id}`);
    if (savedStats) setStatsHistory(JSON.parse(savedStats)); else setStatsHistory({});
    const savedAnalysis = localStorage.getItem(`analysisHistory_${match.id}`);
    if (savedAnalysis) setAnalysisHistory(JSON.parse(savedAnalysis)); else setAnalysisHistory([]);
    const savedGameEvents = localStorage.getItem(`gameEvents_${match.id}`);
    if (savedGameEvents) setGameEvents(JSON.parse(savedGameEvents)); else setGameEvents([]);
    const savedAlerts = localStorage.getItem(`alertHistory_${match.id}`);
    if (savedAlerts) setAlertHistory(JSON.parse(savedAlerts)); else setAlertHistory([]);
  }, [match.id]);
  
  useEffect(() => {
    if (alertHistory.length > 0) localStorage.setItem(`alertHistory_${match.id}`, JSON.stringify(alertHistory));
  }, [alertHistory, match.id]);

  useEffect(() => {
    try {
        const historyStr = localStorage.getItem('viewedMatchesHistory');
        const history = historyStr ? JSON.parse(historyStr) : {};
        history[match.id] = { match: liveMatch, viewedAt: Date.now() };
        localStorage.setItem('viewedMatchesHistory', JSON.stringify(history));
    } catch (e) { console.error("Failed to update viewed matches history:", e); }
  }, [match.id, liveMatch]);

  useEffect(() => {
     if (Object.keys(statsHistory).length > 0) localStorage.setItem(`statsHistory_${match.id}`, JSON.stringify(statsHistory));
  }, [statsHistory, match.id]);

  useEffect(() => {
    if (analysisHistory.length > 0) localStorage.setItem(`analysisHistory_${match.id}`, JSON.stringify(analysisHistory));
  }, [analysisHistory, match.id]);

  useEffect(() => {
    if (gameEvents.length > 0) localStorage.setItem(`gameEvents_${match.id}`, JSON.stringify(gameEvents));
  }, [gameEvents, match.id]);


  const marketChartData = useMemo(() => {
    const dataByHandicap: Record<string, { minute: number; over: number; under: number; handicap: string; }[]> = {};
    oddsHistory.forEach(p => { if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = []; dataByHandicap[p.handicap].push(p); });
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#94a3b8'; let colorName = 'gray';
            if (index > 0) {
                const diff = point.over - points[index - 1].over;
                if (diff < -0.001) { color = '#ef4444'; colorName = 'red'; }
                else if (diff > 0.001) { color = '#10b981'; colorName = 'green'; }
            }
            return { ...point, handicap: parseFloat(point.handicap), color, colorName, highlight: false };
        });
        for (let i = 0; i <= coloredPoints.length - 3; i++) {
            const [b1, b2, b3] = [coloredPoints[i], coloredPoints[i+1], coloredPoints[i+2]];
            if ((b3.minute - b1.minute < 8) && b1.colorName === 'red' && b2.colorName === 'red' && b3.colorName === 'red') { b1.highlight = b2.highlight = b3.highlight = true; }
        }
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [oddsHistory]);

  const homeMarketChartData = useMemo(() => {
    const dataByHandicap: Record<string, { minute: number; home: number; away: number; handicap: string; }[]> = {};
    homeOddsHistory.forEach(p => { if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = []; dataByHandicap[p.handicap].push(p); });
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#94a3b8'; let colorName = 'gray';
            const handicapValue = parseFloat(point.handicap);
            if (index > 0) {
                const diff = point.home - points[index - 1].home;
                if (diff < -0.001) { color = '#ef4444'; colorName = 'red'; } 
                else if (diff > 0.001) { color = '#10b981'; colorName = 'green'; }
            }
            return { ...point, handicap: handicapValue, color, colorName, highlight: false };
        });
        for (let i = 0; i <= coloredPoints.length - 3; i++) {
            const [b1, b2, b3] = [coloredPoints[i], coloredPoints[i+1], coloredPoints[i+2]];
            if ((b3.minute - b1.minute < 8) && b1.colorName === 'red' && b2.colorName === 'red' && b3.colorName === 'red') { b1.highlight = b2.highlight = b3.highlight = true; }
        }
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [homeOddsHistory]);
  
  const paceHighlights = useMemo(() => {
    const sortedMinutes = Object.keys(statsHistory).map(Number).sort((a, b) => a - b);
    const results: Highlight[] = [];
    for (let i = 1; i < sortedMinutes.length; i++) {
        const currMin = sortedMinutes[i];
        const prevMin = sortedMinutes[i-1];
        const curr = statsHistory[currMin];
        const prev = statsHistory[prevMin];
        if (!curr || !prev) continue;
        const daDelta = (curr.dangerous_attacks[0] + curr.dangerous_attacks[1]) - (prev.dangerous_attacks[0] + prev.dangerous_attacks[1]);
        const attacksDelta = (curr.attacks[0] + curr.attacks[1]) - (prev.attacks[0] + prev.attacks[1]);
        const shotDelta = (curr.on_target[0] + curr.on_target[1] + curr.off_target[0] + curr.off_target[1]) - (prev.on_target[0] + prev.on_target[1] + prev.off_target[0] + prev.off_target[1]);
        let level: 'weak' | 'medium' | 'strong' | null = null;
        let label = '';
        if (shotDelta > 0 || daDelta >= 2) { level = 'strong'; label = 'Dồn ép'; } 
        else if (daDelta >= 1) { level = 'medium'; label = 'Tăng tốc'; } 
        else if (attacksDelta >= 2) { level = 'weak'; label = 'Cầm bóng'; }
        if (level) results.push({ minute: currMin, level, label });
    }
    return results;
  }, [statsHistory]);

  const calculateYAxisConfig = useCallback((chartData: { handicap?: number }[], minDomainValue: number | null) => {
    const allHandicaps = chartData.map(d => d.handicap).filter((h): h is number => typeof h === 'number' && isFinite(h));
    if (allHandicaps.length === 0) {
      const defaultMin = minDomainValue ?? 0; 
      const defaultTicks = [];
      for (let i = defaultMin; i <= defaultMin + 2; i = parseFloat((i + 0.25).toFixed(2))) { if (defaultTicks.length > 100) break; defaultTicks.push(i); }
      return { domain: [defaultMin, defaultMin + 2], ticks: defaultTicks };
    }
    let minDomain: number;
    if (minDomainValue !== null) { minDomain = minDomainValue; } 
    else { const minVal = Math.min(...allHandicaps); minDomain = Math.floor(minVal / 0.25) * 0.25; }
    const maxVal = Math.max(...allHandicaps);
    const maxDomain = Math.ceil(maxVal / 0.25) * 0.25;
    const ticks = [];
    for (let i = minDomain; i <= maxDomain; i = parseFloat((i + 0.25).toFixed(2))) { if (ticks.length > 100) break; ticks.push(i); }
    if (ticks.length <= 1) {
        const defaultMin = minDomainValue ?? 0; const defaultTicks = [];
        for(let i = defaultMin; i <= defaultMin + 2; i = parseFloat((i + 0.25).toFixed(2))) { if (defaultTicks.length > 100) break; defaultTicks.push(i); }
        return { domain: [defaultMin, defaultMin + 2], ticks: defaultTicks };
    }
    return { domain: [minDomain, maxDomain], ticks };
  }, []);

  const overUnderYAxisConfig = useMemo(() => calculateYAxisConfig(marketChartData, 0.5), [marketChartData, calculateYAxisConfig]);
  const homeAwayYAxisConfig = useMemo(() => calculateYAxisConfig(homeMarketChartData, null), [homeMarketChartData, calculateYAxisConfig]);

  const fetchGeminiPrediction = useCallback(async (isAuto: boolean = false) => {
    setIsAIPredicting(true);
    try {
        const latestDetails = await getMatchDetails(token, liveMatch.id);
        if (!latestDetails) return;
        setLiveMatch(latestDetails); 
        const currentParsedStats = parseStats(latestDetails.stats);
        const currentTime = latestDetails.timer?.tm;
        if (currentTime && latestDetails.stats) { setStatsHistory(prev => ({ ...prev, [currentTime]: currentParsedStats })); }

        const latestOddsData = await getMatchOdds(token, liveMatch.id); 
        const tempOddsHistory = latestOddsData?.results?.odds?.['1_3']?.filter(m => m.time_str && m.over_od && m.under_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), over: parseFloat(m.over_od!), under: parseFloat(m.under_od!), handicap: m.handicap! })).sort((a, b) => a.minute - b.minute) || oddsHistory;
        const tempHomeOddsHistory = latestOddsData?.results?.odds?.['1_2']?.filter(m => m.time_str && m.home_od && m.away_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), home: parseFloat(m.home_od!), away: parseFloat(m.away_od!), handicap: m.handicap! })).sort((a,b) => a.minute - b.minute) || homeOddsHistory;
        setOddsHistory(tempOddsHistory); setHomeOddsHistory(tempHomeOddsHistory);

        const tempH1OverUnderHistory = latestOddsData?.results?.odds?.['1_6']?.filter(m => m.time_str && m.over_od && m.under_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), over: parseFloat(m.over_od!), under: parseFloat(m.under_od!), handicap: m.handicap! })).sort((a, b) => a.minute - b.minute) || h1OverUnderOddsHistory;
        const tempH1HomeHistory = latestOddsData?.results?.odds?.['1_5']?.filter(m => m.time_str && m.home_od && m.away_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), home: parseFloat(m.home_od!), away: parseFloat(m.away_od!), handicap: m.handicap! })).sort((a,b) => a.minute - b.minute) || h1HomeOddsHistory;
        setH1OverUnderOddsHistory(tempH1OverUnderHistory); setH1HomeOddsHistory(tempH1HomeHistory);

        const currentMinute = parseInt(latestDetails?.timer?.tm?.toString() || latestDetails?.time || "0");
        const homeScore = parseInt((latestDetails?.ss || "0-0").split("-")[0]);
        const awayScore = parseInt((latestDetails?.ss || "0-0").split("-")[1]);
        const homeTeamName = latestDetails?.home.name || "Home";
        const awayTeamName = latestDetails?.away.name || "Away";

        const currentLatestOverOdds = tempOddsHistory.length > 0 ? tempOddsHistory[tempOddsHistory.length - 1] : null;
        const currentLatestHomeOdds = tempHomeOddsHistory.length > 0 ? tempHomeOddsHistory[tempHomeOddsHistory.length - 1] : null;

        const allTimes = Object.keys(statsHistory).map(Number).sort((a,b)=>a-b);
        const getAPIMomentumAt = (minute: number, window: number) => {
            if (!currentParsedStats) return 0;
            const currentTotal = calculateAPIScore(currentParsedStats, 0) + calculateAPIScore(currentParsedStats, 1);
            const pastMinute = Math.max(0, minute - window);
            const pastTimes = allTimes.filter(t => t <= pastMinute);
            const pastTime = pastTimes.length > 0 ? Math.max(...pastTimes) : (allTimes[0] || 0);
            const pastStats = statsHistory[pastTime] || { attacks:[0,0], dangerous_attacks:[0,0], on_target:[0,0], off_target:[0,0], corners:[0,0], yellowcards:[0,0], redcards:[0,0] };
            const pastTotal = calculateAPIScore(pastStats, 0) + calculateAPIScore(pastStats, 1);
            return currentTotal - pastTotal;
        };

        const getShotClusterScore = (minute: number, window: number) => {
             const currentStats = statsHistory[minute];
             if (!currentStats) return 0;
             const targetTime = minute - window;
             const pastTimes = allTimes.filter(t => t <= targetTime);
             const pastTime = pastTimes.length > 0 ? Math.max(...pastTimes) : 0;
             const pastStats = statsHistory[pastTime] || { on_target: [0,0], off_target: [0,0] };
             const deltaOnTarget = Math.max(0, (currentStats.on_target[0] + currentStats.on_target[1]) - ((pastStats.on_target?.[0] || 0) + (pastStats.on_target?.[1] || 0)));
             const deltaOffTarget = Math.max(0, (currentStats.off_target[0] + currentStats.off_target[1]) - ((pastStats.off_target?.[0] || 0) + (pastStats.off_target?.[1] || 0)));
             return (deltaOnTarget * 3.0) + (deltaOffTarget * 1.0);
        };

        const getBubbleIntensity = (chartData: any[], minute: number, range: number) => {
            const minT = Math.max(0, minute - range);
            return chartData.filter(b => b.minute >= minT && b.minute <= minute && (b.colorName==='red' || b.highlight)).reduce((acc, b) => acc + (b.highlight ? 1.6 : 1.0), 0);
        };
        const apiMomentum = getAPIMomentumAt(currentMinute, 5);
        const shotCluster = getShotClusterScore(currentMinute, 5);
        const pressure = getBubbleIntensity(marketChartData, currentMinute, 3) + getBubbleIntensity(homeMarketChartData, currentMinute, 3);
        
        const homeApiScore = currentParsedStats ? calculateAPIScore(currentParsedStats, 0) : 0;
        const awayApiScore = currentParsedStats ? calculateAPIScore(currentParsedStats, 1) : 0;

        const aiPrediction = await getGeminiGoalPrediction(liveMatch.id, currentMinute, homeTeamName, awayTeamName, homeScore, awayScore, currentParsedStats, homeApiScore, awayApiScore, currentLatestOverOdds, currentLatestHomeOdds, apiMomentum, shotCluster, pressure);

        if (aiPrediction) {
            const newAnalysis: PreGoalAnalysis = {
                minute: currentMinute,
                score: aiPrediction.goal_probability,
                level: aiPrediction.confidence_level,
                factors: { apiMomentum, shotCluster, pressure },
                reasoning: aiPrediction.reasoning,
            };
            setAnalysisHistory(prev => [newAnalysis, ...prev.filter(a => a.minute !== currentMinute)]);
            if (isAuto) {
                 const aiAlert: StoredAlert = { id: Date.now().toString() + '_ai', minute: currentMinute, type: 'goal', title: `AI PHÂN TÍCH: ${aiPrediction.confidence_level.toUpperCase()}`, message: `Dự báo bàn thắng: ${aiPrediction.goal_probability}%. ${aiPrediction.reasoning}`, timestamp: Date.now() };
                  setAlertHistory(prev => [...prev, aiAlert]);
                  if (!showAlertPanel) setHasNewAlert(true);
            }
        }
    } catch (error) { console.error("Error fetching Gemini prediction:", error); } 
    finally { setIsAIPredicting(false); }
  }, [token, liveMatch.id, oddsHistory, homeOddsHistory, h1HomeOddsHistory, h1OverUnderOddsHistory, statsHistory, marketChartData, homeMarketChartData, showAlertPanel]);


  const checkAutomaticAlerts = useCallback(() => {
      const currentMinute = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
      if (currentMinute <= 5) return;
      if (currentMinute - lastAlertMinute.current < 5) return;
      const sortedMinutes = Object.keys(statsHistory).map(Number).sort((a, b) => b - a);
      if (sortedMinutes.length < 2) return;
      const currentStats = statsHistory[sortedMinutes[0]];
      const pastMinuteIndex = sortedMinutes.findIndex(m => m <= currentMinute - 3);
      const pastStats = pastMinuteIndex !== -1 ? statsHistory[sortedMinutes[pastMinuteIndex]] : statsHistory[sortedMinutes[sortedMinutes.length - 1]];
      if (!currentStats || !pastStats) return;
      const deltaDA = (currentStats.dangerous_attacks[0] + currentStats.dangerous_attacks[1]) - (pastStats.dangerous_attacks[0] + pastStats.dangerous_attacks[1]);
      const deltaShots = ((currentStats.on_target[0] + currentStats.on_target[1]) + (currentStats.off_target[0] + currentStats.off_target[1])) - ((pastStats.on_target[0] + pastStats.on_target[1]) + (pastStats.off_target[0] + pastStats.off_target[1]));
      const recentOdds = marketChartData.filter(p => p.minute >= currentMinute - 5);
      const droppingCount = recentOdds.filter(p => p.colorName === 'red').length;
      const isOddsDropping = droppingCount >= 2;
      const isHighPressure = (deltaDA >= 5 || deltaShots >= 2) && isOddsDropping;

      if (isHighPressure) {
          const alertMessage = 'CẢNH BÁO ÁP LỰC CAO!';
          const alertSubMessage = `DA tăng ${deltaDA}, Sút tăng ${deltaShots} trong 3p + Odds Tài đang giảm!`;
          setAlertState({ active: true, type: 'pressure', message: alertMessage, subMessage: alertSubMessage });
          const newAlert: StoredAlert = { id: Date.now().toString(), minute: currentMinute, type: 'pressure', title: alertMessage, message: alertSubMessage, timestamp: Date.now() };
          setAlertHistory(prev => [...prev, newAlert]);
          if (!showAlertPanel) setHasNewAlert(true);
          lastAlertMinute.current = currentMinute;
          if (navigator.vibrate) { navigator.vibrate([200, 100, 200, 100, 500]); }
          fetchGeminiPrediction(true);
          setTimeout(() => { setAlertState(prev => ({ ...prev, active: false })); }, 8000);
      }
  }, [liveMatch, statsHistory, marketChartData, showAlertPanel, fetchGeminiPrediction]);


  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
        const updatedDetails = await getMatchDetails(token, liveMatch.id);
        if (updatedDetails) { setLiveMatch(updatedDetails); const currentTime = updatedDetails.timer?.tm; if (currentTime && updatedDetails.stats) { const currentParsedStats = parseStats(updatedDetails.stats); setStatsHistory(prev => ({ ...prev, [currentTime]: currentParsedStats })); } }
        const updatedOdds = await getMatchOdds(token, liveMatch.id);
        if (updatedOdds) {
            if (updatedOdds.results?.odds?.['1_3']) { const newHistory = updatedOdds.results.odds['1_3'].filter(m => m.time_str && m.over_od && m.under_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), over: parseFloat(m.over_od!), under: parseFloat(m.under_od!), handicap: m.handicap! })).sort((a, b) => a.minute - b.minute); setOddsHistory(newHistory); }
            if (updatedOdds.results?.odds?.['1_2']) { const newHomeHistory = updatedOdds.results.odds['1_2'].filter(m => m.time_str && m.home_od && m.away_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), home: parseFloat(m.home_od!), away: parseFloat(m.away_od!), handicap: m.handicap! })).sort((a,b) => a.minute - b.minute); setHomeOddsHistory(newHomeHistory); }
            if (updatedOdds.results?.odds?.['1_6']) { const newH1History = updatedOdds.results.odds['1_6'].filter(m => m.time_str && m.over_od && m.under_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), over: parseFloat(m.over_od!), under: parseFloat(m.under_od!), handicap: m.handicap! })).sort((a, b) => a.minute - b.minute); setH1OverUnderOddsHistory(newH1History); }
            if (updatedOdds.results?.odds?.['1_5']) { const newH1HomeHistory = updatedOdds.results.odds['1_5'].filter(m => m.time_str && m.home_od && m.away_od && m.handicap).map(m => ({ minute: parseInt(m.time_str), home: parseFloat(m.home_od!), away: parseFloat(m.away_od!), handicap: m.handicap! })).sort((a,b) => a.minute - b.minute); setH1HomeOddsHistory(newH1HomeHistory); }
        }
        checkAutomaticAlerts();
    } catch (error) { console.error("Error during data refresh:", error); } 
    finally { setIsRefreshing(false); }
  }, [token, liveMatch.id, checkAutomaticAlerts]); 
  
  useEffect(() => {
    let isMounted = true;
    handleRefresh();
    const intervalId = window.setInterval(() => { if (isMounted) handleRefresh(); }, AUTO_REFRESH_INTERVAL_MS);
    return () => { isMounted = false; clearInterval(intervalId); };
  }, [handleRefresh, AUTO_REFRESH_INTERVAL_MS]);
  
  useEffect(() => {
      const allTimes = Object.keys(statsHistory).map(Number).sort((a,b)=>a-b);
      if (allTimes.length < 2) return;
      const newShots: ShotEvent[] = [];
      for(let i=1; i<allTimes.length; i++) {
          const t = allTimes[i]; const prevT = allTimes[i-1]; const stat = statsHistory[t]; const prevStat = statsHistory[prevT];
          if(!stat || !prevStat) continue;
          const onTargetDelta = (stat.on_target[0] + stat.on_target[1]) - (prevStat.on_target[0] + prevStat.on_target[1]);
          const offTargetDelta = (stat.off_target[0] + stat.off_target[1]) - (prevStat.off_target[0] + prevStat.off_target[1]);
          for(let j=0; j<onTargetDelta; j++) newShots.push({ minute: t, type: 'on' });
          for(let j=0; j<offTargetDelta; j++) newShots.push({ minute: t, type: 'off' });
      }
      setShotEvents(newShots);
  }, [statsHistory]);

  useEffect(() => {
    if (prevMatchState.current) {
        const currentMinute = liveMatch.timer?.tm || parseInt(liveMatch.time || '0');
        if (!currentMinute) return;
        const newEvents: GameEvent[] = [];
        const prevTotalScore = (prevMatchState.current.ss || '0-0').split('-').map(Number).reduce((a, b) => a + b, 0);
        const currentTotalScore = (liveMatch.ss || '0-0').split('-').map(Number).reduce((a, b) => a + b, 0);
        if (currentTotalScore > prevTotalScore) { for (let i = 0; i < currentTotalScore - prevTotalScore; i++) { newEvents.push({ minute: currentMinute, type: 'goal' }); } }
        const prevStats = parseStats(prevMatchState.current.stats); const currentStats = parseStats(liveMatch.stats);
        const prevTotalCorners = prevStats.corners[0] + prevStats.corners[1]; const currentTotalCorners = currentStats.corners[0] + currentStats.corners[1];
        if (currentTotalCorners > prevTotalCorners) { for (let i = 0; i < currentTotalCorners - prevTotalCorners; i++) { newEvents.push({ minute: currentMinute, type: 'corner' }); } }
        if (newEvents.length > 0) { setGameEvents(prev => [...prev, ...newEvents]); }
    }
    prevMatchState.current = liveMatch;
  }, [liveMatch]);

  const scoreParts = (liveMatch.ss || "0-0").split("-");
  const apiChartData = useMemo(() => {
      const sortedMinutes = Object.keys(statsHistory).map(Number).sort((a, b) => a - b);
      return sortedMinutes.map(minute => ({ minute, homeApi: calculateAPIScore(statsHistory[minute], 0), awayApi: calculateAPIScore(statsHistory[minute], 1) }));
  }, [statsHistory]);
  
  const currentMinute = useMemo(() => liveMatch.timer?.tm || parseInt(liveMatch.time || '0'), [liveMatch.timer, liveMatch.time]);
  const hasRecentAnalysis = useMemo(() => {
      if (!latestAnalysis) return false;
      return currentMinute < latestAnalysis.minute + 10;
  }, [currentMinute, latestAnalysis]);

  return (
    <div className="pb-10 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-300">
      {/* Alert Overlay */}
      {alertState.active && (
          <div className="fixed top-14 left-4 right-4 z-50 animate-in slide-in-from-top-4 duration-300">
              <div className="bg-gradient-to-r from-red-600 to-orange-600 rounded-lg shadow-xl p-4 text-white relative border-2 border-white/20">
                  <button onClick={() => setAlertState(prev => ({ ...prev, active: false }))} className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors"><X className="w-4 h-4" /></button>
                  <div className="flex items-start gap-3">
                      <div className="p-2 bg-white/20 rounded-full animate-pulse"><Zap className="w-6 h-6 text-yellow-300" /></div>
                      <div>
                          <h3 className="font-black text-lg uppercase tracking-tight flex items-center gap-2">{alertState.message}</h3>
                          <p className="text-sm text-red-100 font-medium leading-tight mt-1">{alertState.subMessage}</p>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <AlertHistoryPanel isOpen={showAlertPanel} onClose={() => { setShowAlertPanel(false); setHasNewAlert(false); }} alerts={alertHistory} onClear={() => { setAlertHistory([]); localStorage.removeItem(`alertHistory_${match.id}`); }} />

      <div className="bg-white dark:bg-slate-900 sticky top-0 z-10 shadow-sm border-b border-gray-200 dark:border-slate-800 transition-colors duration-300">
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"><ArrowLeft className="w-6 h-6" /></button>
          <div className="flex flex-col items-center">
             <span className="text-xs font-bold text-gray-400 dark:text-gray-500">PHÂN TÍCH TRỰC TIẾP</span>
             <span className="text-red-500 dark:text-red-400 font-bold flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                {liveMatch.timer?.tm || liveMatch.time}'
             </span>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => { setShowAlertPanel(true); setHasNewAlert(false); }} className="p-2 relative text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full" title="Nhật ký cảnh báo">
                <MessageSquare className="w-5 h-5" />
                {hasNewAlert && (<span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full"></span>)}
            </button>
            <button onClick={() => fetchGeminiPrediction(false)} disabled={isAIPredicting || hasRecentAnalysis} className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Phân tích AI">
              {isAIPredicting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
            </button>
            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 -mr-2 text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-slate-800 rounded-full">
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center px-6 pb-4 text-gray-800 dark:text-white">
            <div className="flex flex-col items-center w-1/3">
                <div className="font-bold text-lg text-center leading-tight mb-1">{liveMatch.home.name}</div>
                <div className="text-xs text-gray-400">Đội nhà</div>
            </div>
            <div className="flex items-center gap-3">
                <span className="text-4xl font-black text-slate-800 dark:text-white">{scoreParts[0]}</span>
                <span className="text-gray-300 dark:text-slate-600 text-2xl font-light">-</span>
                <span className="text-4xl font-black text-slate-800 dark:text-white">{scoreParts[1]}</span>
            </div>
            <div className="flex flex-col items-center w-1/3">
                <div className="font-bold text-lg text-center leading-tight mb-1">{liveMatch.away.name}</div>
                <div className="text-xs text-gray-400">Đội khách</div>
            </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 transition-colors duration-300">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Lịch sử Phân tích AI Gemini</h3>
            {isAIPredicting && analysisHistory.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400 animate-pulse text-center p-4">Đang chạy phân tích AI lần đầu...</p>}
            {analysisHistory.length === 0 && !isAIPredicting && <p className="text-xs text-gray-500 dark:text-gray-400 text-center p-4">Chưa có phân tích AI nào cho trận đấu này.</p>}
            {analysisHistory.length > 0 && (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                    {analysisHistory.map((item, index) => (
                        <div key={index} className={`p-3 rounded-lg ${index === 0 ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${item.level === 'rất cao' ? 'bg-red-500 text-white' : index === 0 ? 'bg-blue-500 text-white' : 'bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-300'}`}>
                                        <Siren className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">PHÚT {item.minute}'</div>
                                        <div className={`text-xl font-black ${item.level === 'rất cao' ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}>Xác suất: {item.score}%</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-gray-500 dark:text-gray-400">Độ tin cậy:</div>
                                    <div className={`font-bold ${item.level === 'rất cao' ? 'text-red-600 dark:text-red-400' : item.level === 'cao' ? 'text-orange-500' : item.level === 'trung bình' ? 'text-yellow-500' : 'text-gray-500 dark:text-gray-400'}`}>{item.level.toUpperCase()}</div>
                                </div>
                            </div>
                            {item.reasoning && (
                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-gray-100 dark:border-slate-700 text-xs text-gray-700 dark:text-gray-300 flex items-start gap-2 mt-3">
                                    <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                                    <p className="flex-grow">{item.reasoning}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>

        {latestAnalysis && (
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 transition-colors duration-300">
                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Các yếu tố truyền thống (Phút {latestAnalysis.minute}')</h3>
                <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                    <StatItem label="Động lực" value={typeof latestAnalysis.factors.apiMomentum === 'number' ? latestAnalysis.factors.apiMomentum.toFixed(1) : '-'} color="text-indigo-600 dark:text-indigo-400" />
                    <StatItem label="Cụm sút" value={typeof latestAnalysis.factors.shotCluster === 'number' ? latestAnalysis.factors.shotCluster.toFixed(1) : '-'} color="text-green-600 dark:text-green-400" />
                    <StatItem label="Áp lực" value={typeof latestAnalysis.factors.pressure === 'number' ? latestAnalysis.factors.pressure.toFixed(1) : '-'} color="text-purple-600 dark:text-purple-400" />
                </div>
            </div>
        )}

        <LiveStatsTable liveMatch={liveMatch} oddsHistory={oddsHistory} homeOddsHistory={homeOddsHistory} apiChartData={apiChartData} h1HomeOddsHistory={h1HomeOddsHistory} h1OverUnderOddsHistory={h1OverUnderOddsHistory} />

        {(marketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 transition-colors duration-300">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" />Thị trường Tài/Xỉu (1_3) & Dòng thời gian API</h3>
              <div className="relative h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <defs>
                              <filter id="glowHome" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
                              <filter id="glowAway" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
                          </defs>
                          <CartesianGrid stroke="#f1f5f9" strokeOpacity={0.1} strokeDasharray="3 3" vertical={false} />
                          <XAxis type="number" dataKey="minute" name="Phút" unit="'" domain={[0, 90]} ticks={[0, 15, 30, 45, 60, 75, 90]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#334155' }} />
                          <YAxis yAxisId="left" dataKey="handicap" name="HDP" width={45} domain={overUnderYAxisConfig.domain} ticks={overUnderYAxisConfig.ticks} tickFormatter={(tick) => tick.toFixed(2)} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#334155' }} allowDecimals={true} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#334155' }} width={35} domain={['dataMin - 5', 'dataMax + 10']} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                          <Scatter yAxisId="left" name="Thị trường" data={marketChartData} shape={<CustomCandle />}>{marketChartData.map((e, i) => (<Cell key={`c-${i}`} fill={e.color} />))}</Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" name="API Đội nhà" stroke="#2dd4bf" strokeWidth={4} dot={<CustomApiDot data={apiChartData} />} style={{ filter: 'url(#glowHome)' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" name="API Đội khách" stroke="#8b5cf6" strokeWidth={4} dot={<CustomApiDot data={apiChartData} />} style={{ filter: 'url(#glowAway)' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                      </ComposedChart>
                  </ResponsiveContainer>
                  <OverlayContainer><HighlightBands highlights={paceHighlights} containerWidth={0} /><ShotBalls shots={shotEvents} /><GameEventMarkers events={gameEvents} /></OverlayContainer>
                  <OddsColorLegent />
              </div>
          </div>
        )}

        {(homeMarketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 transition-colors duration-300">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-purple-500" />Tỷ lệ Đội nhà (1_2) & Dòng thời gian API</h3>
              <div className="relative h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <CartesianGrid stroke="#f1f5f9" strokeOpacity={0.1} strokeDasharray="3 3" vertical={false} />
                          <XAxis type="number" dataKey="minute" name="Phút" unit="'" domain={[0, 90]} ticks={[0, 15, 30, 45, 60, 75, 90]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#334155' }} />
                          <YAxis yAxisId="left" dataKey="handicap" name="HDP" width={45} domain={homeAwayYAxisConfig.domain} ticks={homeAwayYAxisConfig.ticks} tickFormatter={(tick) => tick.toFixed(2)} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#334155' }} allowDecimals={true} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#334155' }} width={35} domain={['dataMin - 5', 'dataMax + 10']} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                          <Scatter yAxisId="left" name="Thị trường" data={homeMarketChartData} shape={<CustomCandle />}>{homeMarketChartData.map((e, i) => (<Cell key={`c-${i}`} fill={e.color} />))}</Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" name="API Đội nhà" stroke="#2dd4bf" strokeWidth={4} dot={<CustomApiDot data={apiChartData} />} style={{ filter: 'url(#glowHome)' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" name="API Đội khách" stroke="#8b5cf6" strokeWidth={4} dot={<CustomApiDot data={apiChartData} />} style={{ filter: 'url(#glowAway)' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                      </ComposedChart>
                  </ResponsiveContainer>
                   <OverlayContainer><HighlightBands highlights={paceHighlights} containerWidth={0} /><ShotBalls shots={shotEvents} /><GameEventMarkers events={gameEvents} /></OverlayContainer>
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

        <TicketManager match={liveMatch} latestOverOdds={oddsHistory[oddsHistory.length - 1]} latestHomeOdds={homeOddsHistory[homeOddsHistory.length - 1]} latestH1OverOdds={h1OverUnderOddsHistory[h1OverUnderOddsHistory.length - 1]} latestH1HomeOdds={h1HomeOddsHistory[h1HomeOddsHistory.length - 1]} />
      </div>
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800 last:border-b-0 py-1">
    <span className="text-gray-500 dark:text-gray-400 font-medium">{label}:</span>
    <span className={`font-bold ${color || 'text-gray-800 dark:text-gray-100'}`}>{value}</span>
  </div>
);

const StatBox = ({ label, home, away, highlight }: { label: string, home: number, away: number, highlight?: boolean }) => {
    const total = home + away;
    const homePct = total === 0 ? 50 : (home / total) * 100;
    
    return (
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm transition-colors duration-300">
            <div className="text-xs text-gray-400 dark:text-slate-500 text-center mb-2 uppercase font-semibold">{label}</div>
            <div className="flex justify-between items-end mb-1">
                <span className={`text-lg font-bold ${highlight && home > away ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-white'}`}>{home}</span>
                <span className={`text-lg font-bold ${highlight && away > home ? 'text-orange-600 dark:text-orange-400' : 'text-gray-800 dark:text-white'}`}>{away}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${homePct}%` }}></div>
                <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${100 - homePct}%` }}></div>
            </div>
        </div>
    );
};
