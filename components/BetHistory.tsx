import React, { useState, useEffect, useMemo } from 'react';
import { BetTicket } from '../types';
import { CheckCircle, XCircle, MinusCircle, Trash2 } from 'lucide-react';

type FilterPeriod = 'day' | 'week' | 'month';

export const BetHistory: React.FC = () => {
  const [allTickets, setAllTickets] = useState<BetTicket[]>([]);
  const [filter, setFilter] = useState<FilterPeriod>('day');

  useEffect(() => {
    try {
      const storedTickets = localStorage.getItem('betTickets');
      if (storedTickets) {
        // Sort by most recent first
        const parsedTickets: BetTicket[] = JSON.parse(storedTickets);
        setAllTickets(parsedTickets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      }
    } catch (error) {
      console.error("Failed to load or parse tickets from localStorage", error);
      setAllTickets([]);
    }
  }, []);
  
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
    
    // In JS, Sunday is 0. We adjust to make Monday the start of the week (1).
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return allTickets.filter(ticket => {
      // Fallback for old tickets without createdAt: use ID if it's a valid number
      const ticketDate = new Date(ticket.createdAt || parseInt(ticket.id));
      if (isNaN(ticketDate.getTime())) return false; // Skip if date is invalid

      switch (filter) {
        case 'day':
          return ticketDate >= startOfToday;
        case 'week':
          return ticketDate >= startOfWeek;
        case 'month':
          return ticketDate >= startOfMonth;
        default:
          return true;
      }
    });
  }, [allTickets, filter]);

  const summary = useMemo(() => {
    return filteredTickets.reduce((acc, ticket) => {
        if (ticket.status !== 'pending') {
            acc.totalStake += ticket.stake;
            if (ticket.status === 'won') {
                acc.totalPL += (ticket.stake * ticket.odds) - ticket.stake;
            } else if (ticket.status === 'lost') {
                acc.totalPL -= ticket.stake;
            } else if (ticket.status === 'won_half') {
                acc.totalPL += ((ticket.stake * ticket.odds) - ticket.stake) / 2;
            } else if (ticket.status === 'lost_half') {
                acc.totalPL -= ticket.stake / 2;
            }
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
      {/* Filter Buttons */}
      <div className="flex bg-gray-100 p-1 rounded-lg">
        {(['day', 'week', 'month'] as FilterPeriod[]).map(period => (
          <button
            key={period}
            onClick={() => setFilter(period)}
            className={`w-full py-2 text-sm font-semibold rounded-md transition-colors ${
              filter === period
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {period === 'day' ? 'Hôm nay' : period === 'week' ? 'Tuần này' : 'Tháng này'}
          </button>
        ))}
      </div>

      {/* Summary Section */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-sm font-bold text-gray-700 mb-2">
          Tổng quan ({filter === 'day' ? 'hôm nay' : filter === 'week' ? 'tuần này' : 'tháng này'})
        </h3>
        <div className="flex justify-around text-center">
            <div>
                <div className="text-xs text-gray-500">Tổng cược</div>
                <div className="text-lg font-bold text-gray-800">{summary.totalStake.toLocaleString()}</div>
            </div>
            <div>
                <div className="text-xs text-gray-500">Lãi/Lỗ</div>
                <div className={`text-lg font-bold ${summary.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary.totalPL >= 0 ? '+' : ''}{summary.totalPL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>
        </div>
      </div>

      {/* Tickets List */}
      {filteredTickets.length === 0 ? (
        <div className="text-center text-gray-500 py-10">
          Không có vé cược nào trong khoảng thời gian này.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map(ticket => {
             const pill = getStatusPillContent(ticket.status);
             const ticketDate = new Date(ticket.createdAt || parseInt(ticket.id));
             return (
                <div key={ticket.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="font-semibold text-xs text-gray-500 truncate max-w-[200px]">{ticket.matchName}</div>
                            <div className="font-bold text-gray-800">{ticket.betType} {ticket.handicap} @{ticket.odds.toFixed(2)}</div>
                        </div>
                        <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${pill.className}`}>
                            {pill.text}
                        </div>
                    </div>
                     <div className="flex justify-between items-end mt-2 pt-2 border-t border-gray-100">
                        <div className="text-xs text-gray-400">
                            {ticketDate.toLocaleDateString('vi-VN')} {ticketDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-right">
                            <div className="text-sm">Cược: <span className="font-semibold">{ticket.stake.toLocaleString()}</span></div>
                            {ticket.status === 'won' && (
                                <div className="text-xs font-bold text-green-600">Lãi: +{(ticket.stake * ticket.odds - ticket.stake).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                            )}
                            {ticket.status === 'lost' && (
                                <div className="text-xs font-bold text-red-600">Lỗ: -{ticket.stake.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                            )}
                            {ticket.status === 'push' && (
                                <div className="text-xs font-bold text-gray-600">Hoàn tiền</div>
                            )}
                            {ticket.status === 'won_half' && (
                                <div className="text-xs font-bold text-green-600">Lãi: +{((ticket.stake * ticket.odds - ticket.stake) / 2).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                            )}
                             {ticket.status === 'lost_half' && (
                                <div className="text-xs font-bold text-red-600">Lỗ: -{(ticket.stake / 2).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                            )}
                        </div>
                    </div>
                    {/* Action Buttons for Pending Tickets */}
                    {ticket.status === 'pending' && (
                        <div className="flex gap-2 items-center flex-wrap justify-end mt-2 pt-2 border-t border-dashed">
                            <button onClick={() => handleUpdateStatus(ticket.id, 'won_half')} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 font-semibold" title="Thắng nửa">Thắng ½</button>
                            <button onClick={() => handleUpdateStatus(ticket.id, 'lost_half')} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-semibold" title="Thua nửa">Thua ½</button>
                            <button onClick={() => handleUpdateStatus(ticket.id, 'won')} className="p-2 bg-green-100 text-green-600 rounded-full hover:bg-green-200" title="Thắng"><CheckCircle className="w-4 h-4" /></button>
                            <button onClick={() => handleUpdateStatus(ticket.id, 'lost')} className="p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200" title="Thua"><XCircle className="w-4 h-4" /></button>
                            <button onClick={() => handleUpdateStatus(ticket.id, 'push')} className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200" title="Hòa"><MinusCircle className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteTicket(ticket.id)} className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200" title="Xóa"><Trash2 className="w-4 h-4" /></button>
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