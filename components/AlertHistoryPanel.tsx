
import React, { useRef, useEffect } from 'react';
import { X, Trash2, Zap, Siren, Clock } from 'lucide-react';

export interface StoredAlert {
  id: string;
  minute: number;
  type: 'pressure' | 'goal';
  title: string;
  message: string;
  timestamp: number;
}

interface AlertHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: StoredAlert[];
  onClear: () => void;
}

export const AlertHistoryPanel: React.FC<AlertHistoryPanelProps> = ({ isOpen, onClose, alerts, onClear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new alert arrives
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [alerts, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose}></div>

      <div className="relative bg-white dark:bg-slate-800 w-full sm:max-w-md h-[70vh] sm:h-[600px] sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-full">
                <Siren className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 dark:text-white">Nhật ký Cảnh báo</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{alerts.length} thông báo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={onClear} 
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                title="Xóa lịch sử"
            >
                <Trash2 className="w-5 h-5" />
            </button>
            <button 
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"
            >
                <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content (Chat list) */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-100 dark:bg-slate-950">
          {alerts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-600 space-y-2 opacity-60">
                <Siren className="w-12 h-12" />
                <p className="text-sm font-medium">Chưa có cảnh báo nào</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div key={alert.id} className="flex flex-col animate-in slide-in-from-left-2 duration-300">
                {/* Time divider or label */}
                <div className="flex items-center gap-2 mb-1 pl-2">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(alert.timestamp).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                    </span>
                </div>
                
                {/* Message Bubble */}
                <div className={`p-3 rounded-2xl rounded-tl-none shadow-sm border ${
                    alert.type === 'pressure' 
                        ? 'bg-white dark:bg-slate-800 border-red-100 dark:border-red-900/30 border-l-4 border-l-red-500' 
                        : 'bg-white dark:bg-slate-800 border-blue-100 dark:border-blue-900/30 border-l-4 border-l-blue-500'
                }`}>
                    <div className="flex justify-between items-start mb-1">
                        <div className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-1.5">
                            {alert.type === 'pressure' ? <Zap className="w-3.5 h-3.5 text-red-500 fill-red-500" /> : null}
                            PHÚT {alert.minute}': {alert.title}
                        </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">
                        {alert.message}
                    </p>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};
