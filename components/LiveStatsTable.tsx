
import React, { useMemo } from 'react';
import { MatchInfo } from '../types';

interface OddsHistoryItem {
  minute: number;
  handicap: string;
  [key: string]: any; // Allow for other properties like over, home, etc.
}

// Helper function to find the most likely "main" market odd from a history array.
// This heuristic assumes the main line is the one with the most price updates recently.
const getLatestMainMarketOdd = (history: OddsHistoryItem[]) => {
  if (!history || history.length === 0) {
    return null;
  }

  const lastEntry = history[history.length - 1];
  if (!lastEntry) return null;

  // Define the time window for analysis (e.g., last 7 minutes of action).
  const latestMinute = lastEntry.minute;
  const relevantTimeThreshold = Math.max(0, latestMinute - 7);

  // Filter for odds within the time window.
  const recentOdds = history.filter(o => o.minute >= relevantTimeThreshold);

  // If no odds in the recent window, fallback to the absolute latest entry.
  if (recentOdds.length === 0) {
    return lastEntry;
  }

  // Count the frequency of each handicap line in the recent window.
  const handicapCounts = recentOdds.reduce((acc, odd) => {
    const handicap = odd.handicap;
    acc[handicap] = (acc[handicap] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Find the handicap that appeared most frequently.
  let mainHandicap: string | null = null;
  let maxCount = 0;
  for (const handicap in handicapCounts) {
    if (handicapCounts[handicap] > maxCount) {
      maxCount = handicapCounts[handicap];
      mainHandicap = handicap;
    }
  }

  // If a main handicap was identified, find the absolute latest entry with that handicap from the full history.
  if (mainHandicap) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].handicap === mainHandicap) {
        return history[i];
      }
    }
  }

  // Fallback to the absolute latest entry if the heuristic fails.
  return lastEntry;
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
