
import React from 'react';
import { MatchInfo } from '../types';
import { Clock, ChevronRight, Search, Star } from 'lucide-react';

interface MatchListProps {
  events: MatchInfo[];
  onSelectMatch: (match: MatchInfo) => void;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  favorites: string[];
  onToggleFavorite: (matchId: string, e: React.MouseEvent) => void;
}

export const MatchList: React.FC<MatchListProps> = ({ 
  events, 
  onSelectMatch, 
  isLoading, 
  searchQuery, 
  onSearchChange,
  favorites,
  onToggleFavorite
}) => {
  // Sort events: Favorites first
  const sortedEvents = [...events].sort((a, b) => {
    const aFav = favorites.includes(a.id);
    const bFav = favorites.includes(b.id);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return 0;
  });

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500 animate-pulse">Đang tải các trận đấu trực tiếp...</div>;
  }

  return (
    <div className="space-y-3 pb-20">
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Tìm theo đội hoặc giải đấu..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-white border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-500"
        />
      </div>

      {sortedEvents.length === 0 && searchQuery ? (
        <div className="p-8 text-center text-gray-500">
          Không tìm thấy trận đấu nào khớp với "{searchQuery}".
        </div>
      ) : (
        sortedEvents.map((event) => {
          const isFavorite = favorites.includes(event.id);
          return (
            <div 
              key={event.id}
              onClick={() => onSelectMatch(event)}
              className={`rounded-xl p-4 shadow-sm border transition-colors cursor-pointer relative ${
                isFavorite ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100 active:bg-gray-50'
              }`}
            >
              {/* Star Button */}
              <button 
                onClick={(e) => onToggleFavorite(event.id, e)}
                className="absolute top-4 right-4 p-2 -mr-2 -mt-2 z-10"
              >
                <Star 
                  className={`w-5 h-5 transition-colors ${
                    isFavorite ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'
                  }`} 
                />
              </button>

              <div className="flex justify-between items-start mb-3 pr-8">
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md truncate max-w-[70%]">
                  {event.league.name}
                </span>
                <div className="flex items-center text-red-500 text-xs font-bold">
                  <Clock className="w-3 h-3 mr-1" />
                  {event.timer?.tm || event.time || "0"}'
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1 text-right pr-3">
                  <div className="font-bold text-gray-900 leading-tight">{event.home.name}</div>
                </div>
                
                <div className="bg-gray-100 px-3 py-1 rounded-lg font-mono font-bold text-lg text-gray-800 tracking-widest">
                  {event.ss || "0-0"}
                </div>

                <div className="flex-1 text-left pl-3">
                  <div className="font-bold text-gray-900 leading-tight">{event.away.name}</div>
                </div>
              </div>
              
              <div className="mt-3 flex justify-center">
                <span className="text-xs text-gray-400 flex items-center">
                  Tap for Analysis <ChevronRight className="w-3 h-3 ml-1" />
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
