import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MatchList } from './components/MatchList';
import { Dashboard } from './components/Dashboard';
import { BetHistory } from './components/BetHistory';
import { MatchHistory } from './components/MatchHistory'; 
import { MatchInfo, ProcessedStats } from './types';
import { getInPlayEvents, getMatchDetails, parseStats } from './services/api';
import { KeyRound, ShieldCheck, RefreshCw, List, History, ClipboardList, Bell } from 'lucide-react';

const App = () => {
  const REFRESH_INTERVAL_MS = 60000; 
  const BACKGROUND_CHECK_INTERVAL_MS = 45000; // Check favorites every 45s

  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<MatchInfo | null>(null);
  const [events, setEvents] = useState<MatchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mainView, setMainView] = useState<'matches' | 'betHistory' | 'matchHistory'>('matches');
  
  // Favorites State
  const [favorites, setFavorites] = useState<string[]>([]);
  // Store previous stats for favorites to calculate momentum delta in background
  const prevFavoritesStats = useRef<Record<string, ProcessedStats>>({});

  // Load token and favorites from local storage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('b365_token');
    if (savedToken) {
      setToken(savedToken);
      setHasToken(true);
    }
    const savedFavs = localStorage.getItem('favoriteMatches');
    if (savedFavs) {
        setFavorites(JSON.parse(savedFavs));
    }
    
    // Request Notification Permission on load if possible
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
  }, []);

  const handleToggleFavorite = (matchId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the match
    
    // Request permission on first interaction if needed
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    setFavorites(prev => {
        const newFavs = prev.includes(matchId) 
            ? prev.filter(id => id !== matchId) 
            : [...prev, matchId];
        localStorage.setItem('favoriteMatches', JSON.stringify(newFavs));
        return newFavs;
    });
  };

  // --- Background Monitoring Logic ---
  const checkFavoritesForAlerts = useCallback(async () => {
    if (favorites.length === 0 || !hasToken) return;

    // Process sequentially to avoid rate limits
    for (const matchId of favorites) {
        try {
            // Check if match is still live in the main list
            const isLive = events.find(e => e.id === matchId);
            if (!isLive) continue; // Match might have ended

            const details = await getMatchDetails(token, matchId);
            if (!details || !details.stats) continue;

            const currentStats = parseStats(details.stats);
            const prevStats = prevFavoritesStats.current[matchId];

            if (prevStats) {
                // Calculate Deltas
                const currentDA = currentStats.dangerous_attacks[0] + currentStats.dangerous_attacks[1];
                const prevDA = prevStats.dangerous_attacks[0] + prevStats.dangerous_attacks[1];
                const daDelta = currentDA - prevDA;

                const currentShots = (currentStats.on_target[0] + currentStats.on_target[1]) + (currentStats.off_target[0] + currentStats.off_target[1]);
                const prevShots = (prevStats.on_target[0] + prevStats.on_target[1]) + (prevStats.off_target[0] + prevStats.off_target[1]);
                const shotsDelta = currentShots - prevShots;

                // Thresholds for Notification (slightly higher to avoid spam)
                if (daDelta >= 4 || shotsDelta >= 2) {
                    const title = `⚠️ ${details.home.name} vs ${details.away.name}`;
                    const body = `CẢNH BÁO ÁP LỰC: DA +${daDelta}, Sút +${shotsDelta} trong phiên vừa qua!`;
                    
                    sendNotification(title, body);
                }
            }
            // Update ref
            prevFavoritesStats.current[matchId] = currentStats;

        } catch (e) {
            console.error(`Background check failed for ${matchId}`, e);
        }
        
        // Small delay between checks
        await new Promise(r => setTimeout(r, 2000));
    }
  }, [favorites, token, hasToken, events]);

  const sendNotification = (title: string, body: string) => {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        // Create notification
        try {
            // Check for Service Worker Registration for iOS PWA support
            navigator.serviceWorker.getRegistration().then(registration => {
                if (registration) {
                    // Use Service Worker if available (better for PWA)
                     registration.showNotification(title, {
                        body,
                        icon: '/vite.svg', // Replace with your app icon
                        tag: 'match-alert',
                        vibrate: [200, 100, 200]
                    } as any);
                } else {
                    // Fallback to standard web notification
                    new Notification(title, { body, icon: '/vite.svg' });
                }
            });
        } catch (e) {
             console.error("Notification Error", e);
             new Notification(title, { body });
        }
    }
  };

  useEffect(() => {
    let intervalId: number | undefined;
    if (hasToken && favorites.length > 0) {
        intervalId = window.setInterval(checkFavoritesForAlerts, BACKGROUND_CHECK_INTERVAL_MS);
    }
    return () => {
        if (intervalId) clearInterval(intervalId);
    }
  }, [hasToken, favorites, checkFavoritesForAlerts]);


  // Callable function to fetch events
  const fetchEventsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInPlayEvents(token);
      setEvents(data);
      if (token === 'DEMO_MODE' && data.length === 0) {
        setError('Chế độ Demo: Không tìm thấy trận đấu giả lập. Có thể do lỗi tải dữ liệu demo.');
      } else if (data.length === 0 && token !== 'DEMO_MODE') {
        setError('Không tìm thấy trận đấu trực tiếp. Vui lòng kiểm tra Token API của bạn hoặc thử lại sau.');
      }
    } catch (err: any) {
      if (err.message.includes('429')) {
         setError("Giới hạn tần suất của Proxy đã đạt. Vui lòng kiểm tra cấu hình Rate Limiter của Cloudflare Worker và thử lại sau 20-40 giây.");
      } else if (err.message.includes('Lỗi mạng hoặc CORS')) {
        setError(err.message); 
      }
      else {
        setError(err.message || 'Đã xảy ra lỗi không xác định.');
      }
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch events only once when hasToken becomes true, and set up interval
  useEffect(() => {
    if (!hasToken) return;
    
    let isMounted = true;
    let intervalId: number | undefined;
    
    const startFetching = async () => {
      if (isMounted) {
        await fetchEventsData(); 
        intervalId = window.setInterval(() => {
          if (isMounted) {
            fetchEventsData(); 
          }
        }, REFRESH_INTERVAL_MS);
      }
    };

    startFetching();

    return () => {
      isMounted = false;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };
  }, [hasToken, fetchEventsData, REFRESH_INTERVAL_MS]); 


  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token.length > 5) {
      localStorage.setItem('b365_token', token);
      setHasToken(true);
    }
  };

  const handleSelectMatch = (match: MatchInfo) => {
    setCurrentMatch(match);
  };

  const handleLogout = () => {
    setHasToken(false);
    localStorage.removeItem('b365_token');
    setEvents([]);
    setError(null);
    setCurrentMatch(null);
    setToken('');
    setMainView('matches'); 
  }
  
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) {
      return events;
    }
    const lowercasedQuery = searchQuery.toLowerCase().trim();
    return events.filter(event =>
      event.home.name.toLowerCase().includes(lowercasedQuery) ||
      event.away.name.toLowerCase().includes(lowercasedQuery) ||
      event.league.name.toLowerCase().includes(lowercasedQuery)
    );
  }, [events, searchQuery]);

  const getHeaderText = () => {
    switch(mainView) {
      case 'matches': return 'Trận đấu trực tiếp';
      case 'betHistory': return 'Lịch sử cược';
      case 'matchHistory': return 'Lịch sử xem';
      default: return 'Live Matches';
    }
  };

  if (!hasToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="bg-white/10 p-4 rounded-full mb-6 backdrop-blur-md">
            <ShieldCheck className="w-12 h-12 text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Pro Analytics Access</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">Enter your B365 API Token to access real-time match data and analysis tools.</p>
        
        <form onSubmit={handleTokenSubmit} className="w-full max-w-sm space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-3 top-3.5 text-gray-500 w-5 h-5" />
            <input 
              type="text" 
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste API Token here..." 
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none text-white placeholder-gray-500 transition-all"
            />
          </div>
          <button 
            type="submit" 
            disabled={token.length < 5}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/50"
          >
            Authenticate
          </button>
          <div className="text-center mt-4">
             <a href="#" onClick={(e) => { e.preventDefault(); setToken("DEMO_MODE"); setHasToken(true); }} className="text-xs text-gray-500 underline">Try Demo Mode</a>
          </div>
        </form>
      </div>
    );
  }

  if (currentMatch) {
    return (
      <Dashboard 
        token={token} 
        match={currentMatch} 
        onBack={() => setCurrentMatch(null)} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto shadow-2xl overflow-hidden">
      <div className="bg-white px-5 py-4 sticky top-0 z-10 border-b border-gray-100 flex justify-between items-center">
        <h1 className="text-xl font-black text-slate-800 tracking-tight">
          {getHeaderText()}
        </h1>
        <div className="flex items-center space-x-3">
            {mainView === 'matches' && (
              <button onClick={fetchEventsData} disabled={loading} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed">
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <div className="flex items-center bg-gray-100 rounded-full p-1">
              <button 
                onClick={() => setMainView('matches')} 
                className={`p-1.5 rounded-full transition-colors ${mainView === 'matches' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
                aria-label="Danh sách trận đấu"
              >
                <List className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setMainView('betHistory')} 
                className={`p-1.5 rounded-full transition-colors ${mainView === 'betHistory' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
                aria-label="Lịch sử cược"
              >
                <History className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setMainView('matchHistory')} 
                className={`p-1.5 rounded-full transition-colors ${mainView === 'matchHistory' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
                aria-label="Lịch sử xem"
              >
                <ClipboardList className="w-5 h-5" />
              </button>
            </div>
            <button onClick={handleLogout} className="text-xs text-red-500 font-medium">Logout</button>
        </div>
      </div>
      
      <div className="p-4">
        {/* Permission Prompt Banner */}
        {hasToken && favorites.length > 0 && Notification.permission !== 'granted' && (
             <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-blue-800">Bật thông báo để nhận cảnh báo chạy nền.</span>
                </div>
                <button 
                    onClick={() => Notification.requestPermission()} 
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded-md font-bold"
                >
                    Bật
                </button>
             </div>
        )}

        {error && mainView === 'matches' && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-md" role="alert">
                <p className="font-bold">Lỗi</p>
                <p>{error}</p>
                <p className="mt-2 text-xs text-red-600">
                  Vui lòng kiểm tra Token API của bạn hoặc thử lại sau vài phút nếu đây là lỗi giới hạn tần suất.
                </p>
            </div>
        )}
        {mainView === 'matches' && (
          <MatchList 
            events={filteredEvents} 
            onSelectMatch={handleSelectMatch} 
            isLoading={loading && events.length === 0 && !error}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
        {mainView === 'betHistory' && <BetHistory />}
        {mainView === 'matchHistory' && <MatchHistory onSelectMatch={handleSelectMatch} />}
      </div>
    </div>
  );
};

export default App;