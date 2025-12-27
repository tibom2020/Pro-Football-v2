import React, { useState, useEffect, useMemo } from 'react';
import { MatchInfo, ViewedMatchHistory, HistoryItem } from '../types';
import { Clock, ChevronRight, Trash2 } from 'lucide-react';

interface MatchHistoryProps {
  onSelectMatch: (match: MatchInfo) => void;
}

export const MatchHistory: React.FC<MatchHistoryProps> = ({ onSelectMatch }) => {
  const [history, setHistory] = useState<ViewedMatchHistory>({});

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem('viewedMatchesHistory');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (error) {
      console.error("Failed to load or parse viewed matches history", error);
    }
  }, []);

  const sortedHistory = useMemo(() => {
    // FIX: Explicitly type `a` and `b` to resolve TypeScript error where it infers them as `unknown`.
    return Object.values(history).sort((a: HistoryItem, b: HistoryItem) => b.viewedAt - a.viewedAt);
  }, [history]);
  
  const handleClearHistory = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử các trận đã xem không? Hành động này không thể hoàn tác.")) {
        localStorage.removeItem('viewedMatchesHistory');
        setHistory({});
    }
  };

  if (sortedHistory.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="font-semibold">Lịch sử trống</p>
        <p className="text-sm mt-1">Các trận đấu bạn xem phân tích sẽ được lưu tại đây.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-20">
       <div className="flex justify-end mb-4">
            <button
                onClick={handleClearHistory}
                className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md font-semibold transition-colors"
            >
                <Trash2 className="w-3.5 h-3.5" />
                Xóa lịch sử
            </button>
        </div>
      {sortedHistory.map(({ match, viewedAt }) => {
        const isLive = match.timer && parseInt(match.timer.tt) !== 1; // tt === '1' means ended
        return(
          <div 
            key={match.id}
            onClick={() => onSelectMatch(match)}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md truncate max-w-[70%]">
                {match.league.name}
              </span>
              <div className={`flex items-center text-xs font-bold ${isLive ? 'text-red-500' : 'text-gray-500'}`}>
                <Clock className="w-3 h-3 mr-1" />
                {isLive ? `${match.timer?.tm || match.time}'` : 'FT'}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1 text-right pr-3">
                <div className="font-bold text-gray-900 leading-tight">{match.home.name}</div>
              </div>
              
              <div className="bg-gray-100 px-3 py-1 rounded-lg font-mono font-bold text-lg text-gray-800 tracking-widest">
                {match.ss || "0-0"}
              </div>

              <div className="flex-1 text-left pl-3">
                <div className="font-bold text-gray-900 leading-tight">{match.away.name}</div>
              </div>
            </div>
            
            <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
                <span>
                    Viewed: {new Date(viewedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex items-center">
                    Mở lại <ChevronRight className="w-3 h-3 ml-1" />
                </span>
            </div>
          </div>
        )
      })}
    </div>
  );
};
