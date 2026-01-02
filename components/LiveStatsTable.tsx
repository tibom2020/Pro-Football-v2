
import React, { useMemo } from 'react';
import { MatchInfo } from '../types';

interface OddsHistoryItem {
  minute: number;
  handicap: string;
  [key: string]: any; // Allow for other properties like over, home, etc.
}

// Helper function to get the chronologically latest odd.
const getLatestOdd = (history: OddsHistoryItem[]) => {
  if (!history || history.length === 0) {
    return null;
  }
  // The history array is pre-sorted chronologically, so the last item is the latest update.
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
  // Use the simplified logic to get the latest odds update.
  const latestOdds = useMemo(() => getLatestOdd(oddsHistory), [oddsHistory]);
  const latestHomeOdds = useMemo(() => getLatestOdd(homeOddsHistory), [homeOddsHistory]);
  const latestH1HomeOdds = useMemo(() => getLatestOdd(h1HomeOddsHistory), [h1HomeOddsHistory]);
  const latestH1OverUnderOdds = useMemo(() => getLatestOdd(h1OverUnderOddsHistory), [h1OverUnderOddsHistory]);

  const latestApiScores = useMemo(() => {
    if (apiChartData.length === 0) return null;
    return apiChartData[apiChartData.length - 1]; // Get the last (latest) entry
  }, [apiChartData]);


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
