
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MatchList } from './components/MatchList';
import { Dashboard } from './components/Dashboard';
import { BetHistory } from './components/BetHistory';
import { MatchHistory } from './components/MatchHistory'; 
import { MatchInfo, ProcessedStats } from './types';
import { getInPlayEvents, getMatchDetails, parseStats } from './services/api';
import { KeyRound, ShieldCheck, RefreshCw, List, History, ClipboardList, Bell, Moon, Sun } from 'lucide-react';

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
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Favorites State
  const [favorites, setFavorites] = useState<string[]>([]);
  const prevFavoritesStats = useRef<Record<string, ProcessedStats>>({});

  // Initialize Theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
        setTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
    }
  }, []);

  // Apply Theme Class
  useEffect(() => {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Load token and favorites
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
    
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
  }, []);

  const handleToggleFavorite = (matchId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

    for (const matchId of favorites) {
        try {
            const isLive = events.find(e => e.id === matchId);
            if (!isLive) continue;

            const details = await getMatchDetails(token, matchId);
            if (!details || !details.stats) continue;

            const currentStats = parseStats(details.stats);
            const prevStats = prevFavoritesStats.current[matchId];

            if (prevStats) {
                const currentDA = currentStats.dangerous_attacks[0] + currentStats.dangerous_attacks[1];
                const prevDA = prevStats.dangerous_attacks[0] + prevStats.dangerous_attacks[1];
                const daDelta = currentDA - prevDA;

                const currentShots = (currentStats.on_target[0] + currentStats.on_target[1]) + (currentStats.off_target[0] + currentStats.off_target[1]);
                const prevShots = (prevStats.on_target[0] + prevStats.on_target[1]) + (prevStats.off_target[0] + prevStats.off_target[1]);
                const shotsDelta = currentShots - prevShots;

                if (daDelta >= 4 || shotsDelta >= 2) {
                    const title = `⚠️ ${details.home.name} vs ${details.away.name}`;
                    const body = `CẢNH BÁO ÁP LỰC: DA +${daDelta}, Sút +${shotsDelta} trong phiên vừa qua!`;
                    sendNotification(title, body);
                }
            }
            prevFavoritesStats.current[matchId] = currentStats;

        } catch (e) {
            console.error(`Background check failed for ${matchId}`, e);
        }
        await new Promise(r => setTimeout(r, 2000));
    }
  }, [favorites, token, hasToken, events]);

  const sendNotification = (title: string, body: string) => {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        try {
            navigator.serviceWorker.getRegistration().then(registration => {
                if (registration) {
                     registration.showNotification(title, {
                        body,
                        icon: '/vite.svg',
                        tag: 'match-alert',
                        vibrate: [200, 100, 200]
                    } as any);
                } else {
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


  const fetchEventsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInPlayEvents(token);
      setEvents(data);
      if (token === 'DEMO_MODE' && data.length === 0) {
        setError('Chế độ Demo: Không tìm thấy trận đấu giả lập.');
      } else if (data.length === 0 && token !== 'DEMO_MODE') {
        setError('Không tìm thấy trận đấu trực tiếp.');
      }
    } catch (err: any) {
      if (err.message.includes('429')) {
         setError("Giới hạn tần suất của Proxy đã đạt.");
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
      case 'matches': return 'Trực tiếp';
      case 'betHistory': return 'Vé cược';
      case 'matchHistory': return 'Đã xem';
      default: return 'Live Matches';
    }
  };

  if (!hasToken) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-white relative overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-blue-600/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-purple-600/20 rounded-full blur-3xl"></div>

        <div className="bg-slate-800/50 p-6 rounded-full mb-6 backdrop-blur-md border border-white/10 shadow-2xl">
            <ShieldCheck className="w-16 h-16 text-blue-400" />
        </div>
        <h1 className="text-3xl font-black mb-2 tracking-tight">Pro Analytics</h1>
        <p className="text-slate-400 text-center mb-8 text-sm max-w-xs">Hệ thống phân tích bóng đá chuyên sâu với dữ liệu thời gian thực và AI.</p>
        
        <form onSubmit={handleTokenSubmit} className="w-full max-w-sm space-y-4 relative z-10">
          <div className="relative group">
            <KeyRound className="absolute left-3 top-3.5 text-slate-500 group-focus-within:text-blue-400 transition-colors w-5 h-5" />
            <input 
              type="text" 
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Nhập API Token..." 
              className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-slate-950/50 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-white placeholder-slate-600 transition-all shadow-inner"
            />
          </div>
          <button 
            type="submit" 
            disabled={token.length < 5}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-900/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            Đăng nhập
          </button>
          <div className="text-center mt-6">
             <a href="#" onClick={(e) => { e.preventDefault(); setToken("DEMO_MODE"); setHasToken(true); }} className="text-xs text-slate-500 hover:text-blue-400 transition-colors">Dùng thử chế độ Demo</a>
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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 max-w-md mx-auto shadow-2xl overflow-hidden transition-colors duration-300">
      <div className="bg-white dark:bg-slate-900 px-5 py-4 sticky top-0 z-10 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center transition-colors duration-300">
        <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
          {getHeaderText()}
        </h1>
        <div className="flex items-center space-x-2">
            <button 
                onClick={toggleTheme} 
                className="p-2 text-slate-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            {mainView === 'matches' && (
              <button onClick={fetchEventsData} disabled={loading} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full disabled:opacity-50">
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
            
            <button onClick={handleLogout} className="text-xs text-red-500 font-medium ml-1">Thoát</button>
        </div>
      </div>
      
      <div className="p-4 pb-24">
        {/* Permission Prompt Banner */}
        {hasToken && favorites.length > 0 && Notification.permission !== 'granted' && (
             <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-3 rounded-lg mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs text-blue-800 dark:text-blue-200">Bật thông báo để nhận cảnh báo chạy nền.</span>
                </div>
                <button 
                    onClick={() => Notification.requestPermission()} 
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md font-bold transition-colors"
                >
                    Bật
                </button>
             </div>
        )}

        {error && mainView === 'matches' && (
            <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 mb-4 rounded-md" role="alert">
                <p className="font-bold">Lỗi</p>
                <p>{error}</p>
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  Vui lòng kiểm tra Token API hoặc thử lại sau.
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

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 p-3 max-w-md mx-auto z-20">
          <div className="flex justify-around items-center">
              <button 
                onClick={() => setMainView('matches')} 
                className={`flex flex-col items-center gap-1 ${mainView === 'matches' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}
              >
                <List className="w-6 h-6" />
                <span className="text-[10px] font-medium">Trực tiếp</span>
              </button>
              <button 
                onClick={() => setMainView('betHistory')} 
                className={`flex flex-col items-center gap-1 ${mainView === 'betHistory' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}
              >
                <History className="w-6 h-6" />
                <span className="text-[10px] font-medium">Lịch sử cược</span>
              </button>
              <button 
                onClick={() => setMainView('matchHistory')} 
                className={`flex flex-col items-center gap-1 ${mainView === 'matchHistory' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}
              >
                <ClipboardList className="w-6 h-6" />
                <span className="text-[10px] font-medium">Đã xem</span>
              </button>
          </div>
      </div>
    </div>
  );
};

export default App;
