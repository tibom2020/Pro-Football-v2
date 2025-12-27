import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MatchInfo, PreGoalAnalysis, OddsItem, ProcessedStats, AIPredictionResponse, OddsData } from '../types';
import { parseStats, getMatchDetails, getMatchOdds, getGeminiGoalPrediction } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Info } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis, Tooltip, Cell, Line, Legend } from 'recharts';
import { LiveStatsTable } from './LiveStatsTable'; // Import the new component
import { TicketManager } from './TicketManager'; // Import the new TicketManager component

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

    return (
        <div className="bg-slate-800 text-white text-xs p-2 rounded shadow-lg border border-slate-700">
            <p className="font-bold">Phút: {minute}'</p>
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
    <div className="flex items-center justify-center space-x-2 mt-3 text-xs text-gray-500">
        <span>Tỷ lệ thấp</span>
        <div className="w-24 h-2 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500"></div>
        <span>Tỷ lệ cao</span>
    </div>
);

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
        case 'strong': return '#dc2626'; // Tailwind red-600
        case 'medium': return '#f97316'; // Tailwind orange-500
        case 'weak': return '#facc15';   // Tailwind yellow-400
        default: return '#cbd5e1';       // Tailwind slate-300 as fallback
      }
    };

    return <>
        {highlights.map((h, i) => (
            <div 
                key={i} 
                className={`goal-highlight`} 
                style={{ 
                    left: `${calculateLeft(h.minute)}px`,
                    backgroundColor: getHighlightColor(h.level) // Apply color directly
                }}
            >
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
        return leftOffset + (minute / 90) * chartAreaWidth - 10; // Center the ball (20px wide)
    };

    const shotsByMinute = shots.reduce((acc, shot) => {
        if (!acc[shot.minute]) acc[shot.minute] = [];
        acc[shot.minute].push(shot.type);
        return acc;
    }, {} as Record<number, ('on' | 'off')[]>);

    return <>
        {Object.entries(shotsByMinute).map(([minute, types]) => 
            types.map((type, index) => (
                 <div 
                    key={`${minute}-${index}`} 
                    className={`ball-icon ${type === 'on' ? 'ball-on' : 'ball-off'}`}
                    style={{ left: `${calculateLeft(Number(minute))}px`, top: `${-10 + index * 24}px` }}
                    title={`Shot ${type}-target at ${minute}'`}
                >
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
            if (event.type === 'goal') {
                className = 'game-event-goal';
                icon = '⚽';
            } else if (event.type === 'corner') {
                className = 'game-event-corner';
                icon = '🚩';
            }

            return (
                <div
                    key={`${event.type}-${event.minute}-${i}`}
                    className={`game-event-icon ${className}`}
                    style={{ left: `${calculateLeft(event.minute)}px` }}
                    title={`${event.type.charAt(0).toUpperCase() + event.type.slice(1)} at ${event.minute}'`}
                >
                    {icon}
                </div>
            );
        })}
    </>;
};

export const Dashboard: React.FC<DashboardProps> = ({ token, match, onBack }) => {
  // AUTO_REFRESH_INTERVAL_MS is for match details and odds (every 40s)
  const AUTO_REFRESH_INTERVAL_MS = 40000; // 40 seconds for individual match auto-refresh

  const [liveMatch, setLiveMatch] = useState<MatchInfo>(match);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAIPredicting, setIsAIPredicting] = useState(false); // New state for AI prediction loading
  const [oddsHistory, setOddsHistory] = useState<{ minute: number; over: number; under: number; handicap: string }[]>([]);
  const [homeOddsHistory, setHomeOddsHistory] = useState<{ minute: number; home: number; away: number; handicap: string }[]>([]);
  const [statsHistory, setStatsHistory] = useState<Record<number, ProcessedStats>>({});
  const [highlights, setHighlights] = useState<AllHighlights>({ overUnder: [], homeOdds: [] });
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([]);
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<PreGoalAnalysis[]>([]);
  const prevMatchState = useRef<MatchInfo | null>(null);
  
  const [aiPrediction, setAIPrediction] = useState<AIPredictionResponse | null>(null);

  const stats = useMemo(() => parseStats(liveMatch.stats), [liveMatch.stats]);
  const latestAnalysis = useMemo(() => analysisHistory[0] || null, [analysisHistory]);

  // --- Persistence Effects ---
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
     if (Object.keys(statsHistory).length > 0) {
        localStorage.setItem(`statsHistory_${match.id}`, JSON.stringify(statsHistory));
     }
  }, [statsHistory, match.id]);

  useEffect(() => {
    if (highlights.overUnder.length > 0 || highlights.homeOdds.length > 0) {
        localStorage.setItem(`highlights_${match.id}`, JSON.stringify(highlights));
    }
  }, [highlights, match.id]);

  useEffect(() => {
    if (analysisHistory.length > 0) {
        localStorage.setItem(`analysisHistory_${match.id}`, JSON.stringify(analysisHistory));
    }
  }, [analysisHistory, match.id]);

  useEffect(() => {
    if (gameEvents.length > 0) {
        localStorage.setItem(`gameEvents_${match.id}`, JSON.stringify(gameEvents));
    }
  }, [gameEvents, match.id]);


  const marketChartData = useMemo(() => {
    const dataByHandicap: Record<string, { minute: number; over: number; under: number; handicap: string; }[]> = {};
    oddsHistory.forEach(p => {
        if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = [];
        dataByHandicap[p.handicap].push(p);
    });
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#f87171', colorName = 'red';
            if (index > 0) {
                const diff = point.over - points[index - 1].over;
                if (diff < -0.02) { color = '#facc15'; colorName = 'yellow'; }
                else if (Math.abs(diff) <= 0.02) { color = '#4ade80'; colorName = 'green'; }
            }
            return { ...point, handicap: parseFloat(point.handicap), color, colorName, highlight: false };
        });
        for (let i = 0; i <= coloredPoints.length - 3; i++) {
            const [b1, b2, b3] = [coloredPoints[i], coloredPoints[i+1], coloredPoints[i+2]];
            if (b3.minute - b1.minute < 5 && (b1.colorName === 'yellow' || b1.colorName === 'green') && b1.colorName === b2.colorName && b2.colorName === b3.colorName && !b1.highlight) {
                b1.highlight = b2.highlight = b3.highlight = true;
            }
        }
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [oddsHistory]);

  const homeMarketChartData = useMemo(() => {
    const dataByHandicap: Record<string, { minute: number; home: number; away: number; handicap: string; }[]> = {};
    homeOddsHistory.forEach(p => {
        if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = [];
        dataByHandicap[p.handicap].push(p);
    });
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#f87171', colorName = 'red';
            const handicapValue = parseFloat(point.handicap);
            if (index > 0) {
                const diff = point.home - points[index - 1].home;
                if (handicapValue < 0) {
                    if (diff < -0.02) { color = '#facc15'; colorName = 'yellow'; }
                    else if (Math.abs(diff) <= 0.02) { color = '#4ade80'; colorName = 'green'; }
                } else {
                    if (diff > 0.02) { color = '#facc15'; colorName = 'yellow'; }
                    else if (Math.abs(diff) <= 0.02) { color = '#4ade80'; colorName = 'green'; }
                }
            }
            return { ...point, handicap: handicapValue, color, colorName, highlight: false };
        });
        for (let i = 0; i <= coloredPoints.length - 3; i++) {
            const [b1, b2, b3] = [coloredPoints[i], coloredPoints[i+1], coloredPoints[i+2]];
            if (b3.minute - b1.minute < 5 && (b1.colorName === 'yellow' || b1.colorName === 'green') && b1.colorName === b2.colorName && b2.colorName === b3.colorName && !b1.highlight) {
                b1.highlight = b2.highlight = b3.highlight = true;
            }
        }
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [homeOddsHistory]);

  const runPatternDetection = useCallback(async (aiScore: number, aiLevel: PreGoalAnalysis['level']) => {
    const currentMinute = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    if (!currentMinute || currentMinute < 10) return;

    let highlightLevel: Highlight['level'] | null = null;
    if (aiLevel === 'rất cao') highlightLevel = 'strong';
    else if (aiLevel === 'cao') highlightLevel = 'medium';
    else if (aiLevel === 'trung bình') highlightLevel = 'weak';
    
    if (highlightLevel) {
        const newHighlight: Highlight = { minute: currentMinute, level: highlightLevel, label: `${aiScore}%` };
        setHighlights(prev => {
            const alreadyExists = prev.overUnder.some(h => h.minute === newHighlight.minute && h.level === newHighlight.level);
            if (!alreadyExists) {
                return { ...prev, overUnder: [...prev.overUnder, newHighlight] };
            }
            return prev;
        });
    }
  }, [liveMatch.timer, liveMatch.time]);

  const apiChartData = useMemo(() => {
    return Object.entries(statsHistory).map(([minute, stats]) => ({
      minute: parseInt(minute),
      homeApi: calculateAPIScore(stats, 0),
      awayApi: calculateAPIScore(stats, 1),
    }));
  }, [statsHistory]);

  const latestOverOdds = useMemo(() => {
    if (oddsHistory.length === 0) return null;
    return oddsHistory[oddsHistory.length - 1];
  }, [oddsHistory]);

  const latestHomeOdds = useMemo(() => {
    if (homeOddsHistory.length === 0) return null;
    return homeOddsHistory[homeOddsHistory.length - 1];
  }, [homeOddsHistory]);

  const calculatePreGoalFactors = useCallback(() => {
    const currentMinute = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    if (!currentMinute) return null;
    
    const relevantApi = apiChartData.filter(d => d.minute >= currentMinute - 5 && d.minute <= currentMinute);
    const apiMomentum = relevantApi.length > 1 ? relevantApi[relevantApi.length - 1].homeApi - relevantApi[0].homeApi + relevantApi[relevantApi.length - 1].awayApi - relevantApi[0].awayApi : 0;
    
    const relevantShots = shotEvents.filter(s => s.minute >= currentMinute - 5 && s.minute <= currentMinute);
    const shotCluster = relevantShots.length;
    
    const relevantOdds = marketChartData.filter(d => d.minute >= currentMinute - 5 && d.minute <= currentMinute);
    const pressure = relevantOdds.filter(d => d.highlight).length;

    const totalScore = apiMomentum + shotCluster + pressure;
    let level: PreGoalAnalysis['level'] = 'thấp';
    if (totalScore > 15) level = 'rất cao';
    else if (totalScore > 10) level = 'cao';
    else if (totalScore > 5) level = 'trung bình';

    const analysis: PreGoalAnalysis = {
        minute: currentMinute,
        score: totalScore,
        level,
        factors: { apiMomentum, shotCluster, pressure }
    };
    return analysis;
  }, [liveMatch.timer, liveMatch.time, apiChartData, shotEvents, marketChartData]);

  const runAIPrediction = useCallback(async () => {
    setIsAIPredicting(true);
    setAIPrediction(null); // Clear previous prediction

    const currentMinute = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    const [homeScore, awayScore] = (liveMatch.ss || "0-0").split('-').map(Number);
    const apiScores = apiChartData.length > 0 ? apiChartData[apiChartData.length - 1] : { homeApi: 0, awayApi: 0 };
    const latestOver = latestOverOdds ? { handicap: latestOverOdds.handicap, over: latestOverOdds.over, under: latestOverOdds.under } : null;
    const latestHome = latestHomeOdds ? { handicap: latestHomeOdds.handicap, home: latestHomeOdds.home, away: latestHomeOdds.away } : null;

    const analysis = calculatePreGoalFactors();
    if (analysis) {
        const prediction = await getGeminiGoalPrediction(
            liveMatch.id,
            currentMinute,
            liveMatch.home.name,
            liveMatch.away.name,
            homeScore,
            awayScore,
            stats,
            apiScores.homeApi,
            apiScores.awayApi,
            latestOver,
            latestHome,
            analysis.factors.apiMomentum,
            analysis.factors.shotCluster,
            analysis.factors.pressure
        );
        
        setAIPrediction(prediction);
        if (prediction) {
            const analysisWithReasoning: PreGoalAnalysis = { ...analysis, reasoning: prediction.reasoning };
            setAnalysisHistory(prev => [analysisWithReasoning, ...prev.slice(0, 19)]);
            // Also run pattern detection based on the new prediction
            await runPatternDetection(prediction.goal_probability, prediction.confidence_level);
        }
    }
    
    setIsAIPredicting(false);
  }, [liveMatch, stats, apiChartData, latestOverOdds, latestHomeOdds, calculatePreGoalFactors, runPatternDetection]);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
        setIsRefreshing(true);
    }
    // Fetch latest match details
    const latestDetails = await getMatchDetails(token, liveMatch.id);
    if (!latestDetails) {
        if (isManualRefresh) setIsRefreshing(false);
        return; // Early exit if match details fail
    }
    
    // Fetch latest odds data
    const latestOddsData = await getMatchOdds(token, liveMatch.id);
    
    setLiveMatch(latestDetails);
    
    // Process new data
    const currentMinute = parseInt(latestDetails.timer?.tm?.toString() || latestDetails.time || "0");
    if (!isNaN(currentMinute)) {
        const newStats = parseStats(latestDetails.stats);
        if (JSON.stringify(newStats) !== JSON.stringify(statsHistory[currentMinute])) {
            setStatsHistory(prev => ({ ...prev, [currentMinute]: newStats }));
        }

        if (latestOddsData && latestOddsData.results.odds) {
            const overUnderOdds = latestOddsData.results.odds["1_3"] || [];
            const homeAwayOdds = latestOddsData.results.odds["1_2"] || [];

            if (overUnderOdds.length > 0) {
                const latest = overUnderOdds[overUnderOdds.length - 1];
                if (latest.over_od && latest.under_od && latest.handicap) {
                   const newPoint = { minute: currentMinute, over: parseFloat(latest.over_od), under: parseFloat(latest.under_od), handicap: latest.handicap };
                   setOddsHistory(prev => [...prev, newPoint]);
                }
            }
            if (homeAwayOdds.length > 0) {
                const latest = homeAwayOdds[homeAwayOdds.length - 1];
                if (latest.home_od && latest.away_od && latest.handicap) {
                   const newPoint = { minute: currentMinute, home: parseFloat(latest.home_od), away: parseFloat(latest.away_od), handicap: latest.handicap };
                   setHomeOddsHistory(prev => [...prev, newPoint]);
                }
            }
        }
    }

    // --- Check for game events (goals, corners) based on state changes ---
    if (prevMatchState.current) {
        // Goal detection
        if (prevMatchState.current.ss !== latestDetails.ss) {
             setGameEvents(prev => [...prev, { minute: currentMinute, type: 'goal' }]);
        }
        
        // Corner detection
        const prevStats = parseStats(prevMatchState.current.stats);
        const currentStats = parseStats(latestDetails.stats);
        const prevCorners = prevStats.corners[0] + prevStats.corners[1];
        const currentCorners = currentStats.corners[0] + currentStats.corners[1];
        if (currentCorners > prevCorners) {
            setGameEvents(prev => [...prev, { minute: currentMinute, type: 'corner' }]);
        }
    }
    
    // AI prediction is now manual-only. The automatic trigger has been removed.

    prevMatchState.current = latestDetails;
    if (isManualRefresh) setIsRefreshing(false);
  }, [token, liveMatch.id, statsHistory]); // Removed runAIPrediction from dependency array

  useEffect(() => {
    // Save the initial state of the match when component mounts
    prevMatchState.current = liveMatch;
    fetchData(true); // Initial fetch, also fetches odds for the first time
    const interval = setInterval(() => fetchData(false), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]); // Only depends on fetchData now

  const handleAIPrediction = async () => {
      await runAIPrediction();
  };

  const handleRefresh = async () => {
    await fetchData(true);
  };
  
  const getLevelColor = (level: PreGoalAnalysis['level']) => {
    switch (level) {
      case 'rất cao': return 'text-red-500';
      case 'cao': return 'text-orange-500';
      case 'trung bình': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto shadow-2xl">
      <div className="bg-white px-4 py-3 sticky top-0 z-20 border-b border-gray-100 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 text-center truncate px-2">
          <div className="text-xs text-gray-500 truncate">{liveMatch.league.name}</div>
          <h2 className="text-sm font-bold text-gray-800 truncate">{liveMatch.home.name} vs {liveMatch.away.name}</h2>
        </div>
        <div className="flex items-center space-x-2">
            <button 
                onClick={handleAIPrediction} 
                disabled={isAIPredicting} 
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-wait"
                aria-label="Run AI Prediction"
            >
                <TrendingUp className={`w-5 h-5 ${isAIPredicting ? 'animate-pulse text-blue-500' : ''}`} />
            </button>
            <button 
                onClick={handleRefresh} 
                disabled={isRefreshing} 
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Refresh Data"
            >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex-1 text-right pr-3">
                <div className="font-bold text-gray-900 leading-tight">{liveMatch.home.name}</div>
            </div>
            <div className="bg-slate-800 text-white px-4 py-2 rounded-lg font-mono font-bold text-2xl tracking-widest">
                {liveMatch.ss || '0-0'}
            </div>
            <div className="flex-1 text-left pl-3">
                <div className="font-bold text-gray-900 leading-tight">{liveMatch.away.name}</div>
            </div>
        </div>

        {isAIPredicting && (
             <div className="bg-blue-50 border-l-4 border-blue-400 text-blue-700 p-4 rounded-md animate-pulse" role="status">
                <p className="font-bold">Gemini AI đang phân tích...</p>
                <p className="text-xs">Quá trình này có thể mất vài giây. Vui lòng đợi.</p>
            </div>
        )}
        
        {aiPrediction && (
            <div className={`bg-white rounded-xl p-4 shadow-md border-l-4 ${getLevelColor(aiPrediction.confidence_level).replace('text-', 'border-')}`}>
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-sm font-bold text-gray-700">Nhận định AI (10 phút tới)</h3>
                        <p className="text-xs text-gray-500 italic mt-1 max-w-xs">{aiPrediction.reasoning || "Không có lý do cụ thể."}</p>
                    </div>
                    <div className="text-right">
                        <div className={`text-2xl font-bold ${getLevelColor(aiPrediction.confidence_level)}`}>
                            {aiPrediction.goal_probability}%
                        </div>
                        <div className="text-xs font-semibold text-gray-500 capitalize">{aiPrediction.confidence_level}</div>
                    </div>
                </div>
            </div>
        )}
        
        <LiveStatsTable 
          liveMatch={liveMatch} 
          oddsHistory={oddsHistory} 
          homeOddsHistory={homeOddsHistory} 
          apiChartData={apiChartData} 
        />
        
        {/* Main Chart Section */}
        <div className="bg-white rounded-xl p-2 pt-6 shadow-sm border border-gray-100">
            <div className="relative h-48">
                 <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart 
                        margin={{ top: 10, right: 35, left: -25, bottom: 5 }}
                        data={apiChartData}
                    >
                        <XAxis 
                            dataKey="minute" 
                            type="number" 
                            domain={[0, 90]} 
                            ticks={[0, 15, 30, 45, 60, 75, 90]}
                            tick={{ fontSize: 10, fill: '#6b7280' }} 
                            axisLine={false} 
                            tickLine={false}
                        />
                        <YAxis yAxisId="left" orientation="left" domain={['dataMin - 5', 'dataMax + 5']} hide />
                        <YAxis yAxisId="right" orientation="right" domain={['dataMin - 0.2', 'dataMax + 0.2']} hide />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Line yAxisId="left" type="monotone" dataKey="homeApi" stroke="#3b82f6" strokeWidth={2} dot={false} name="API Đội nhà" />
                        <Line yAxisId="left" type="monotone" dataKey="awayApi" stroke="#f97316" strokeWidth={2} dot={false} name="API Đội khách" />
                        
                        <Scatter yAxisId="right" dataKey="handicap" name="handicap" data={marketChartData}>
                          {marketChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Scatter>
                        <Scatter yAxisId="right" dataKey="handicap" name="handicap" data={homeMarketChartData}>
                           {homeMarketChartData.map((entry, index) => <Cell key={`cell-home-${index}`} fill={entry.color} />)}
                        </Scatter>
                    </ComposedChart>
                </ResponsiveContainer>
                <OverlayContainer>
                    <HighlightBands highlights={highlights.overUnder} />
                    <ShotBalls shots={shotEvents} />
                    <GameEventMarkers events={gameEvents} />
                </OverlayContainer>
            </div>
            <OddsColorLegent />
        </div>

        <TicketManager match={liveMatch} latestOverOdds={latestOverOdds ?? undefined} latestHomeOdds={latestHomeOdds ?? undefined} />
      </div>
    </div>
  );
};
