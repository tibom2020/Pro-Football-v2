
import React, { useState, useEffect, useMemo } from 'react';
import { BetTicket } from '../types';
import { CheckCircle, XCircle, MinusCircle, Trash2, CloudUpload, Settings, Save } from 'lucide-react';

type FilterPeriod = 'day' | 'week' | 'month';

// Hardcoded Google Apps Script URL as requested by the user
const DEFAULT_GSHEET_URL = "https://script.google.com/macros/s/AKfycbzF5fWCOycnNJ4XXT5EGWs3xhh1-Rh7nXCCmmPGO9p26XTdQf_UTF9gp4eh_R77ZNLiIA/exec";

export const BetHistory: React.FC = () => {
  const [allTickets, setAllTickets] = useState<BetTicket[]>([]);
  const [filter, setFilter] = useState<FilterPeriod>('day');
  const [gsheetUrl, setGsheetUrl] = useState<string>(DEFAULT_GSHEET_URL);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    try {
      const storedTickets = localStorage.getItem('betTickets');
      if (storedTickets) {
        const parsedTickets: BetTicket[] = JSON.parse(storedTickets);
        setAllTickets(parsedTickets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      }
      
      const savedUrl = localStorage.getItem('gsheet_url');
      if (savedUrl) setGsheetUrl(savedUrl);
    } catch (error) {
      console.error("Failed to load data", error);
    }
  }, []);
  
  const saveUrl = () => {
    localStorage.setItem('gsheet_url', gsheetUrl);
    setShowSettings(false);
  };

  const calculateProfitLoss = (ticket: BetTicket): number => {
    if (ticket.status === 'pending') return 0;
    if (ticket.status === 'won') return (ticket.stake * ticket.odds) - ticket.stake;
    if (ticket.status === 'lost') return -ticket.stake;
    if (ticket.status === 'won_half') return ((ticket.stake * ticket.odds) - ticket.stake) / 2;
    if (ticket.status === 'lost_half') return -(ticket.stake / 2);
    if (ticket.status === 'push') return 0;
    return 0;
  };

  const syncToGSheet = async () => {
    if (!gsheetUrl) {
      alert("Vui lòng cấu hình Google Web App URL.");
      setShowSettings(true);
      return;
    }

    if (filteredTickets.length === 0) {
      alert("Không có dữ liệu trong khoảng thời gian này để đồng bộ.");
      return;
    }

    setIsSyncing(true);
    try {
      // Chuẩn bị dữ liệu: Tính toán profitLoss cho từng vé trước khi gửi
      const dataToSync = filteredTickets.map(t => ({
        ...t,
        profitLoss: calculateProfitLoss(t)
      }));

      // Chú ý: Google Apps Script Web App yêu cầu mode 'no-cors' nếu không cấu hình CORS phức tạp trên server
      await fetch(gsheetUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSync)
      });
      
      alert("Đã gửi yêu cầu đồng bộ lên Google Sheets thành công!");
    } catch (error) {
      console.error("Sync error:", error);
      alert("Lỗi đồng bộ: " + (error instanceof Error ? error.message : "Không xác định"));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateStatus = (id: string, status: 'won' | 'lost' | 'push' | 'won_half' | 'lost_half') => {
    const updatedTickets = allTickets.map(ticket =>
      ticket.id === id ? { ...ticket, status } : ticket
    );
    setAllTickets(updatedTickets);
    localStorage.setItem('betTickets', JSON.stringify(updatedTickets));
  };

  const handleDeleteTicket = (id: string) => {
    if (window.confirm("Bạn có chắc muốn xóa vé cược này không?")) {
        const updatedTickets = allTickets.filter(ticket => ticket.id !== id);
        setAllTickets(updatedTickets);
        localStorage.setItem('betTickets', JSON.stringify(updatedTickets));
    }
  };

  const filteredTickets = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return allTickets.filter(ticket => {
      const ticketDate = new Date(ticket.createdAt || parseInt(ticket.id));
      if (isNaN(ticketDate.getTime())) return false;

      switch (filter) {
        case 'day': return ticketDate >= startOfToday;
        case 'week': return ticketDate >= startOfWeek;
        case 'month': return ticketDate >= startOfMonth;
        default: return true;
      }
    });
  }, [allTickets, filter]);

  const summary = useMemo(() => {
    return filteredTickets.reduce((acc, ticket) => {
        if (ticket.status !== 'pending') {
            acc.totalStake += ticket.stake;
            acc.totalPL += calculateProfitLoss(ticket);
        }
        return acc;
    }, { totalStake: 0, totalPL: 0 });
  }, [filteredTickets]);
  
  const getStatusPillContent = (status: BetTicket['status']) => {
    switch(status) {
        case 'pending': return { text: 'Đang chờ', className: "bg-yellow-100 text-yellow-800" };
        case 'won': return { text: 'Thắng', className: "bg-green-100 text-green-800" };
        case 'lost': return { text: 'Thua', className: "bg-red-100 text-red-800" };
        case 'push': return { text: 'Hòa', className: "bg-gray-100 text-gray-800" };
        case 'won_half': return { text: 'Thắng 1/2', className: "bg-green-100 text-green-800" };
        case 'lost_half': return { text: 'Thua 1/2', className: "bg-red-100 text-red-800" };
        default: return { text: '', className: 'bg-gray-100 text-gray-800' };
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg active:bg-gray-200 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Cài đặt URL
          </button>
          <button 
            onClick={syncToGSheet}
            disabled={isSyncing}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 px-4 py-2 rounded-lg shadow-sm active:scale-95 transition-all disabled:opacity-50"
          >
            <CloudUpload className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
            {isSyncing ? 'Đang gửi...' : 'Đồng bộ Sheets'}
          </button>
      </div>

      {showSettings && (
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3 animate-in fade-in slide-in-from-top-2">
            <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider">Cấu hình Google Sheets URL</h4>
            <div className="flex gap-2">
                <input 
                    type="text" 
                    value={gsheetUrl}
                    onChange={(e) => setGsheetUrl(e.target.value)}
                    placeholder="URL Google Apps Script..."
                    className="flex-grow text-xs p-2.5 rounded-lg border border-blue-200 outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                />
                <button onClick={saveUrl} className="bg-blue-600 text-white p-2.5 rounded-lg active:scale-90 transition-transform">
                    <Save className="w-4 h-4" />
                </button>
            </div>
            <p className="text-[10px] text-blue-500 italic">Mặc định đã được cấu hình. Bạn chỉ cần thay đổi nếu muốn đổi trang tính khác.</p>
        </div>
      )}

      <div className="flex bg-gray-100 p-1 rounded-lg">
        {(['day', 'week', 'month'] as FilterPeriod[]).map(period => (
          <button
            key={period}
            onClick={() => setFilter(period)}
            className={`w-full py-2 text-sm font-semibold rounded-md transition-all ${
              filter === period ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {period === 'day' ? 'Hôm nay' : period === 'week' ? 'Tuần này' : 'Tháng này'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Tổng kết nhanh</h3>
        <div className="flex justify-around text-center">
            <div className="flex flex-col">
                <span className="text-xs text-gray-500 font-medium">Tiền cược</span>
                <span className="text-lg font-bold text-gray-800">{summary.totalStake.toLocaleString()}</span>
            </div>
            <div className="w-px h-10 bg-gray-100"></div>
            <div className="flex flex-col">
                <span className="text-xs text-gray-500 font-medium">Lợi nhuận</span>
                <span className={`text-lg font-bold ${summary.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary.totalPL >= 0 ? '+' : ''}{summary.totalPL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
        </div>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="text-center text-gray-400 py-16 flex flex-col items-center gap-2">
          <MinusCircle className="w-8 h-8 opacity-20" />
          <span className="text-sm">Chưa có dữ liệu cược.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map(ticket => {
             const pill = getStatusPillContent(ticket.status);
             const pl = calculateProfitLoss(ticket);
             const ticketDate = new Date(ticket.createdAt || parseInt(ticket.id));
             return (
                <div key={ticket.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex-grow">
                            <div className="font-bold text-xs text-blue-600 mb-0.5 truncate max-w-[220px]">{ticket.matchName}</div>
                            <div className="font-black text-gray-800 text-sm">
                                {ticket.betType} {ticket.handicap} <span className="text-gray-400 font-medium">@{ticket.odds.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className={`text-[10px] font-black uppercase tracking-tighter px-2 py-1 rounded-md ${pill.className}`}>
                            {pill.text}
                        </div>
                    </div>
                     <div className="flex justify-between items-end mt-3 pt-3 border-t border-gray-50">
                        <div className="text-[10px] text-gray-400 font-medium">
                            Phút {ticket.minute}' • {ticketDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-gray-500">Tiền: <b className="text-gray-800">{ticket.stake.toLocaleString()}</b></div>
                            {ticket.status !== 'pending' && (
                                <div className={`text-xs font-black mt-0.5 ${pl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {pl >= 0 ? '+' : ''}{pl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </div>
                            )}
                        </div>
                    </div>
                    {ticket.status === 'pending' && (
                        <div className="flex gap-2 items-center flex-wrap justify-end mt-3 pt-3 border-t border-dashed border-gray-200">
                             <button onClick={() => handleUpdateStatus(ticket.id, 'won_half')} className="px-2.5 py-1 text-[10px] bg-green-50 text-green-700 rounded-md border border-green-100 font-bold active:bg-green-100" title="Thắng nửa">W ½</button>
                            <button onClick={() => handleUpdateStatus(ticket.id, 'lost_half')} className="px-2.5 py-1 text-[10px] bg-red-50 text-red-700 rounded-md border border-red-100 font-bold active:bg-red-100" title="Thua nửa">L ½</button>
                            <button onClick={() => handleUpdateStatus(ticket.id, 'won')} className="p-2 bg-green-50 text-green-600 rounded-full border border-green-100 active:scale-90" title="Thắng"><CheckCircle className="w-4 h-4" /></button>
                            <button onClick={() => handleUpdateStatus(ticket.id, 'lost')} className="p-2 bg-red-50 text-red-600 rounded-full border border-red-100 active:scale-90" title="Thua"><XCircle className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteTicket(ticket.id)} className="p-2 bg-gray-50 text-gray-400 rounded-full border border-gray-100 active:scale-90" title="Xóa"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    )}
                </div>
             )
          })}
        </div>
      )}
    </div>
  );
};
