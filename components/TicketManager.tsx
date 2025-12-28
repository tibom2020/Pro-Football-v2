import React, { useState, useEffect, useMemo } from 'react';
import { BetTicket, MatchInfo } from '../types';
import { Plus, Trash2, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

interface TicketManagerProps {
  match: MatchInfo;
  latestOverOdds?: { handicap: string };
  latestHomeOdds?: { handicap: string };
  // Fix: Add props for first-half odds to resolve type error in Dashboard.tsx
  latestH1OverOdds?: { handicap: string };
  latestH1HomeOdds?: { handicap: string };
}

export const TicketManager: React.FC<TicketManagerProps> = ({ match, latestOverOdds, latestHomeOdds, latestH1HomeOdds, latestH1OverOdds }) => {
  const [tickets, setTickets] = useState<BetTicket[]>([]);
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  // Fix: Expand betType state to include first-half (H1) bet types.
  const [betType, setBetType] = useState<'Tài' | 'Xỉu' | 'Đội nhà' | 'Đội khách' | 'Tài H1' | 'Xỉu H1' | 'Đội nhà H1' | 'Đội khách H1'>('Tài');
  const [stake, setStake] = useState('');
  const [odds, setOdds] = useState('');
  const [notes, setNotes] = useState('');

  // Load tickets from local storage on component mount and when matchId changes
  useEffect(() => {
    try {
      const storedTickets = localStorage.getItem('betTickets');
      if (storedTickets) {
        const allTickets: BetTicket[] = JSON.parse(storedTickets);
        const matchTickets = allTickets.filter(ticket => ticket.matchId === match.id);
        setTickets(matchTickets);
      }
    } catch (error) {
      console.error("Failed to parse tickets from localStorage", error);
    }
  }, [match.id]);

  // Helper to save all tickets to local storage
  const saveAllTickets = (updatedTickets: BetTicket[]) => {
    try {
        const storedTickets = localStorage.getItem('betTickets');
        const allTickets: BetTicket[] = storedTickets ? JSON.parse(storedTickets) : [];
        // Remove old tickets for the current match and add the updated ones
        const otherMatchTickets = allTickets.filter(t => t.matchId !== match.id);
        const newAllTickets = [...otherMatchTickets, ...updatedTickets];
        localStorage.setItem('betTickets', JSON.stringify(newAllTickets));
    } catch (error) {
       console.error("Failed to save tickets to localStorage", error);
    }
  };

  // Fix: Update handicap calculation to use H1 odds when H1 bet types are selected.
  const currentHandicap = useMemo(() => {
    const isOverUnder = betType.includes('Tài') || betType.includes('Xỉu');
    const isH1 = betType.includes('H1');
    
    if (isOverUnder) {
      return isH1 ? latestH1OverOdds?.handicap : latestOverOdds?.handicap;
    }
    
    // Handle Home/Away handicap inversion
    const rawHandicap = isH1 ? latestH1HomeOdds?.handicap : latestHomeOdds?.handicap;
    if (rawHandicap === undefined || rawHandicap === null) {
      return undefined;
    }

    if (betType.includes('Đội nhà')) {
      return rawHandicap;
    }

    if (betType.includes('Đội khách')) {
      const handicapNum = parseFloat(rawHandicap);
      if (isNaN(handicapNum) || handicapNum === 0) {
        return rawHandicap; // Return "0" or other non-numeric strings as is
      }
      
      const invertedNum = -handicapNum;
      
      // Format back to string, ensuring '+' for positive values
      const formatted = invertedNum.toFixed(2);
      if (invertedNum > 0) {
          return `+${formatted}`;
      }
      return formatted;
    }

    return undefined; // Should not be reached
  }, [betType, latestOverOdds, latestHomeOdds, latestH1HomeOdds, latestH1OverOdds]);

  const handleAddTicket = (e: React.FormEvent) => {
    e.preventDefault();
    const stakeNum = parseFloat(stake);
    const oddsNum = parseFloat(odds);

    if (isNaN(stakeNum) || isNaN(oddsNum) || stakeNum <= 0 || oddsNum <= 0) {
      alert("Vui lòng nhập số tiền và tỷ lệ cược hợp lệ.");
      return;
    }
    
    const handicap = currentHandicap;

    if (!handicap) {
        alert("Không tìm thấy kèo hiện tại cho loại cược này.");
        return;
    }

    const newTicket: BetTicket = {
      id: Date.now().toString(),
      matchId: match.id,
      matchName: `${match.home.name} vs ${match.away.name}`, // Store match name
      betType,
      handicap,
      odds: oddsNum,
      stake: stakeNum,
      minute: match.timer?.tm || parseInt(match.time),
      scoreAtBet: match.ss,
      status: 'pending',
      createdAt: Date.now(), // Store creation timestamp
      notes,
    };

    const updatedTickets = [...tickets, newTicket];
    setTickets(updatedTickets);
    saveAllTickets(updatedTickets);
    
    // Reset form
    setShowForm(false);
    setStake('');
    setOdds('');
    setNotes('');
    setBetType('Tài');
  };

  const handleUpdateStatus = (id: string, status: 'won' | 'lost' | 'push' | 'won_half' | 'lost_half') => {
    const updatedTickets = tickets.map(ticket => 
      ticket.id === id ? { ...ticket, status } : ticket
    );
    setTickets(updatedTickets);
    saveAllTickets(updatedTickets);
  };

  const handleDeleteTicket = (id: string) => {
    if (window.confirm("Bạn có chắc muốn xóa vé cược này không?")) {
        const updatedTickets = tickets.filter(ticket => ticket.id !== id);
        setTickets(updatedTickets);
        saveAllTickets(updatedTickets);
    }
  };

  const summary = useMemo(() => {
    return tickets.reduce((acc, ticket) => {
        acc.totalStake += ticket.stake;
        if (ticket.status === 'pending') {
            acc.pendingStake += ticket.stake;
        } else if (ticket.status === 'won') {
            acc.totalPL += (ticket.stake * ticket.odds) - ticket.stake;
        } else if (ticket.status === 'lost') {
            acc.totalPL -= ticket.stake;
        } else if (ticket.status === 'won_half') {
            acc.totalPL += ((ticket.stake * ticket.odds) - ticket.stake) / 2;
        } else if (ticket.status === 'lost_half') {
            acc.totalPL -= ticket.stake / 2;
        }
        return acc;
    }, { totalStake: 0, pendingStake: 0, totalPL: 0 });
  }, [tickets]);

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
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-gray-700">Hệ thống quản lý vé cược</h3>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Đóng' : 'Thêm vé'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddTicket} className="bg-gray-50 p-4 rounded-lg mb-4 space-y-3 border border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Loại cược</label>
              {/* Fix: Add H1 options to dropdown menu */}
              <select 
                value={betType} 
                onChange={e => setBetType(e.target.value as any)}
                className="w-full mt-1 p-2 border border-gray-300 rounded-md text-sm"
              >
                <option>Tài</option>
                <option>Xỉu</option>
                <option>Đội nhà</option>
                <option>Đội khách</option>
                <option>Tài H1</option>
                <option>Xỉu H1</option>
                <option>Đội nhà H1</option>
                <option>Đội khách H1</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Kèo hiện tại</label>
              <input type="text" readOnly value={currentHandicap || 'N/A'} className="w-full mt-1 p-2 border bg-gray-200 border-gray-300 rounded-md text-sm cursor-not-allowed" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Tiền cược</label>
              <input 
                type="number" 
                placeholder="VD: 100" 
                value={stake}
                onChange={e => setStake(e.target.value)}
                className="w-full mt-1 p-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Tỷ lệ cược</label>
              <input 
                type="number" 
                step="0.01" 
                placeholder="VD: 1.95" 
                value={odds}
                onChange={e => setOdds(e.target.value)}
                className="w-full mt-1 p-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Ghi chú (tùy chọn)</label>
            <input 
                type="text" 
                placeholder="Lý do vào cược..." 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full mt-1 p-2 border border-gray-300 rounded-md text-sm"
              />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300">Hủy</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-md text-white bg-blue-600 hover:bg-blue-700">Lưu vé</button>
          </div>
        </form>
      )}

      {tickets.length === 0 ? (
        <p className="text-center text-xs text-gray-500 py-4">Chưa có vé cược nào cho trận này.</p>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const pill = getStatusPillContent(ticket.status);
            return (
              <div key={ticket.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-gray-800">{ticket.betType} {ticket.handicap}</div>
                    <div className="text-xs text-gray-500">@{ticket.minute}' {ticket.scoreAtBet ? `(${ticket.scoreAtBet})` : ''} - Tỷ lệ {ticket.odds.toFixed(2)}</div>
                  </div>
                  <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${pill.className}`}>
                    {pill.text}
                  </div>
                </div>
                <div className="flex justify-between items-end mt-2 pt-2 border-t border-gray-100">
                  <div className="text-sm">
                    <div>Cược: <span className="font-semibold text-gray-700">{ticket.stake.toLocaleString()}</span></div>
                    {ticket.status === 'pending' && (
                      <div className="text-xs text-gray-500">Thắng tiềm năng: {(ticket.stake * ticket.odds).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                    {ticket.status === 'won' && (
                      <div className="text-xs font-bold text-green-600">Lãi: +{(ticket.stake * ticket.odds - ticket.stake).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                    {ticket.status === 'lost' && (
                      <div className="text-xs font-bold text-red-600">Lỗ: -{ticket.stake.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                    {ticket.status === 'push' && (
                      <div className="text-xs font-bold text-gray-600">Hoàn tiền: {ticket.stake.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                    {ticket.status === 'won_half' && (
                      <div className="text-xs font-bold text-green-600">Lãi: +{((ticket.stake * ticket.odds - ticket.stake) / 2).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                    {ticket.status === 'lost_half' && (
                      <div className="text-xs font-bold text-red-600">Lỗ: -{(ticket.stake / 2).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    )}
                  </div>
                  {ticket.status === 'pending' ? (
                    <div className="flex gap-2 items-center flex-wrap justify-end">
                      <button onClick={() => handleUpdateStatus(ticket.id, 'won_half')} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 font-semibold" title="Thắng nửa">Thắng ½</button>
                      <button onClick={() => handleUpdateStatus(ticket.id, 'lost_half')} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-semibold" title="Thua nửa">Thua ½</button>
                      <button onClick={() => handleUpdateStatus(ticket.id, 'won')} className="p-2 bg-green-100 text-green-600 rounded-full hover:bg-green-200" title="Thắng"><CheckCircle className="w-4 h-4" /></button>
                      <button onClick={() => handleUpdateStatus(ticket.id, 'lost')} className="p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200" title="Thua"><XCircle className="w-4 h-4" /></button>
                      <button onClick={() => handleUpdateStatus(ticket.id, 'push')} className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200" title="Hòa"><MinusCircle className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteTicket(ticket.id)} className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200" title="Xóa"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => handleDeleteTicket(ticket.id)} className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tickets.length > 0 && (
        <div className="mt-4 pt-3 border-t border-dashed space-y-1 text-sm">
            <div className="flex justify-between">
                <span className="font-semibold text-gray-600">Tổng cược đã đặt:</span>
                <span className="font-bold text-gray-800">{summary.totalStake.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
                <span className="font-semibold text-gray-600">Tổng cược đang chờ:</span>
                <span className="font-bold text-yellow-600">{summary.pendingStake.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
                <span className="font-semibold text-gray-600">Lãi/Lỗ đã quyết:</span>
                <span className={`font-bold ${summary.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary.totalPL >= 0 ? '+' : ''}{summary.totalPL.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </span>
            </div>
        </div>
      )}
    </div>
  );
};