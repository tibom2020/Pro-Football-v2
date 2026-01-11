
import React, { useMemo } from 'react';
import { MatchInfo } from '../types';

interface LiveStatsTableProps {
  liveMatch: MatchInfo;
  oddsHistory: { minute: number; over: number; under: number; handicap: string }[];
  homeOddsHistory: { minute: number; home: number; away: number; handicap: string }[];
  apiChartData: { minute: number; homeApi: number; awayApi: number }[];
  h1HomeOddsHistory: { minute: number; home: number; away: number; handicap: string }[];
  h1OverUnderOddsHistory: { minute: number; over: number; under: number; handicap: string }[];
}

// Helper to find the latest odd based on minute (max minute)
const getLatestOdd = <T extends { minute: number }>(history: T[]): T | null => {
  if (!history || history.length === 0) return null;
  return history.reduce((latest, current) => {
    return current.minute >= latest.minute ? current : latest;
  }, history[0]);
};

export const LiveStatsTable: React.FC<LiveStatsTableProps> = ({
  liveMatch,
  oddsHistory,
  homeOddsHistory,
  apiChartData,
  h1HomeOddsHistory,
  h1OverUnderOddsHistory,
}) => {
  
  const latestOdds = useMemo(() => getLatestOdd(oddsHistory), [oddsHistory]);
  const latestHomeOdds = useMemo(() => getLatestOdd(homeOddsHistory), [homeOddsHistory]);
  const latestH1HomeOdds = useMemo(() => getLatestOdd(h1HomeOddsHistory), [h1HomeOddsHistory]);
  const latestH1OverUnderOdds = useMemo(() => getLatestOdd(h1OverUnderOddsHistory), [h1OverUnderOddsHistory]);

  const latestApiScores = useMemo(() => {
    if (apiChartData.length === 0) return null;
    return apiChartData[apiChartData.length - 1]; // ApiChartData is usually sorted by time in dashboard
  }, [apiChartData]);

  const formatOdds = (handicap: string | undefined, odds: number | undefined) => {
    if (!handicap || odds === undefined) return '-';
    return `${parseFloat(handicap).toFixed(2)} (${odds.toFixed(2)})`;
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 mt-4 transition-colors duration-300">
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Thống kê trực tiếp</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <StatItem label="HDP Đội nhà" value={formatOdds(latestHomeOdds?.handicap, latestHomeOdds?.home)} />
        <StatItem label="HDP Tài/Xỉu" value={formatOdds(latestOdds?.handicap, latestOdds?.over)} />
        <StatItem label="HDP Đội nhà H1" value={formatOdds(latestH1HomeOdds?.handicap, latestH1HomeOdds?.home)} />
        <StatItem label="HDP T/X H1" value={formatOdds(latestH1OverUnderOdds?.handicap, latestH1OverUnderOdds?.over)} />
        <StatItem label="API Đội nhà" value={latestApiScores?.homeApi ? latestApiScores.homeApi.toFixed(1) : '-'} color="text-blue-600 dark:text-blue-400" />
        <StatItem label="API Đội khách" value={latestApiScores?.awayApi ? latestApiScores.awayApi.toFixed(1) : '-'} color="text-orange-600 dark:text-orange-400" />
      </div>
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800 last:border-b-0 py-1">
    <span className="text-gray-500 dark:text-gray-400 font-medium">{label}:</span>
    <span className={`font-bold ${color || 'text-gray-800 dark:text-gray-200'}`}>{value}</span>
  </div>
);
