
import React, { useMemo } from 'react';
import { MatchInfo } from '../types';

interface OddsHistoryItem {
  minute: number;
  handicap: string;
  [key: string]: any; // Allow for other properties like over, home, etc.
}

// Helper function to find the most likely "main" market odd from a history array.
// This heuristic is based on a "point window" (last N updates) rather than a time window.
const getLatestMainMarketOdd = (history: OddsHistoryItem[]) => {
  if (!history || history.length === 0) {
    return null;
  }

  // Fallback to the last entry if history is too short for analysis.
  if (history.length < 5) {
      return history[history.length - 1];
  }

  // 1. Get the last N points from history. A window of 15 provides a good balance.
  const pointWindow = 15;
  const recentPoints = history.slice(-pointWindow);

  // 2. Count frequency of handicaps in these recent points.
  const handicapCounts = recentPoints.reduce((acc, odd) => {
    const handicap = odd.handicap;
    acc[handicap] = (acc[handicap] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 3. Find the maximum frequency count.
  let maxCount = 0;
  for (const handicap in handicapCounts) {
    if (handicapCounts[handicap] > maxCount) {
      maxCount = handicapCounts[handicap];
    }
  }

  // 4. Identify all handicaps that have the maximum frequency (potential candidates).
  const candidates = Object.keys(handicapCounts).filter(
    (h) => handicapCounts[h] === maxCount
  );

  let mainHandicap: string | null = null;

  // 5. Determine the main handicap from the candidates.
  if (candidates.length === 1) {
    // If there's only one most frequent handicap, it's our main line.
    mainHandicap = candidates[0];
  } else if (candidates.length > 1) {
    // If there's a tie in frequency, the one that appeared most recently in the window wins.
    for (let i = recentPoints.length - 1; i >= 0; i--) {
      if (candidates.includes(recentPoints[i].handicap)) {
        mainHandicap = recentPoints[i].handicap;
        break; // Found the most recent among the tied candidates
      }
    }
  }

  // 6. Find the absolute latest entry for the determined main handicap from the full history.
  if (mainHandicap) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].handicap === mainHandicap) {
        return history[i];
      }
    }
  }

  // Fallback to the absolute latest entry if the heuristic somehow fails to determine a main line.
  return history[history.length - 1];
};


interface LiveStatsTableProps {
  liveMatch: MatchInfo;
  oddsHistory: OddsHistoryItem[];
  homeOddsHistory: OddsHistoryItem[];
  apiChartData: { minute: number; homeApi: number; awayApi: number }[];
  h1HomeOddsHistory: OddsHistoryItem[];
  h1OverUnderOddsHistory: OddsHistoryItem[];
}

export const LiveStatsTable: React.FC<LiveStatsTableProps> = ({
  liveMatch,
  oddsHistory,
  homeOddsHistory,
  apiChartData,
  h1HomeOddsHistory,
  h1OverUnderOddsHistory,
}) => {
  const latestOdds = useMemo(() => getLatestMainMarketOdd(oddsHistory), [oddsHistory]);

  const latestHomeOdds = useMemo(() => getLatestMainMarketOdd(homeOddsHistory), [homeOddsHistory]);

  const latestApiScores = useMemo(() => {
    if (apiChartData.length === 0) return null;
    return apiChartData[apiChartData.length - 1]; // Get the last (latest) entry
  }, [apiChartData]);

  const latestH1HomeOdds = useMemo(() => getLatestMainMarketOdd(h1HomeOddsHistory), [h1HomeOddsHistory]);

  const latestH1OverUnderOdds = useMemo(() => getLatestMainMarketOdd(h1OverUnderOddsHistory), [h1OverUnderOddsHistory]);


  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-4">
      <h3 className="text-sm font-bold text-gray-700 mb-3">Thống kê trực tiếp</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <StatItem label="HDP Đội nhà" value={latestHomeOdds?.handicap ? parseFloat(latestHomeOdds.handicap).toFixed(2) : '-'} />
        <StatItem label="HDP Tài/Xỉu" value={latestOdds?.handicap ? parseFloat(latestOdds.handicap).toFixed(2) : '-'} />
        <StatItem label="HDP Đội nhà H1" value={latestH1HomeOdds?.handicap ? parseFloat(latestH1HomeOdds.handicap).toFixed(2) : '-'} />
        <StatItem label="HDP T/X H1" value={latestH1OverUnderOdds?.handicap ? parseFloat(latestH1OverUnderOdds.handicap).toFixed(2) : '-'} />
        <StatItem label="API Đội nhà" value={latestApiScores?.homeApi ? latestApiScores.homeApi.toFixed(1) : '-'} color="text-blue-600" />
        <StatItem label="API Đội khách" value={latestApiScores?.awayApi ? latestApiScores.awayApi.toFixed(1) : '-'} color="text-orange-600" />
      </div>
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex justify-between items-center border-b border-gray-100 last:border-b-0 py-1">
    <span className="text-gray-500 font-medium">{label}:</span>
    <span className={`font-bold ${color || 'text-gray-800'}`}>{value}</span>
  </div>
);
