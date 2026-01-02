
import React, { useMemo } from 'react';
import { MatchInfo } from '../types';

interface OddsHistoryItem {
  minute: number;
  handicap: string;
  [key: string]: any; // Allow for other properties like over, home, etc.
}

// Helper function to get the odd with the HIGHEST minute (latest time).
const getLatestOdd = (history: OddsHistoryItem[]) => {
  if (!history || history.length === 0) {
    return null;
  }
  // Explicitly find the item with the highest minute value.
  // Using reduce ensures we find the max minute regardless of array sort order.
  // If minutes are equal, we take the later one in the array (assuming later index = later update).
  return history.reduce((latest, current) => {
    return current.minute >= latest.minute ? current : latest;
  }, history[0]);
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
  // Use the robust logic to get the latest odds based on the maximum minute.
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
