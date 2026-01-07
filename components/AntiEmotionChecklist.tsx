
import React, { useState, useEffect } from 'react';
import { BrainCircuit, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface AntiEmotionChecklistProps {
  onConfirm: () => void;
  onCancel: () => void;
  betType: string;
  handicap?: string;
}

export const AntiEmotionChecklist: React.FC<AntiEmotionChecklistProps> = ({ onConfirm, onCancel, betType, handicap }) => {
  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const [canConfirm, setCanConfirm] = useState(false);

  const questions = [
    "Tôi đã xem kỹ biểu đồ API/Odds và thấy tín hiệu rõ ràng, không phải đoán mò.",
    "Tôi không đang cay cú (chasing) vì vé thua trước đó hay hưng phấn quá đà.",
    "Vé cược này nằm trong kế hoạch quản lý vốn (không All-in)."
  ];

  const handleCheck = (index: number) => {
    const newChecks = [...checks];
    newChecks[index] = !newChecks[index];
    setChecks(newChecks);
  };

  useEffect(() => {
    setCanConfirm(checks.every(c => c));
  }, [checks]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="bg-slate-50 p-4 border-b border-gray-100 flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-full">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">Kiểm tra kỷ luật</h3>
            <p className="text-xs text-gray-500">Dừng lại 3 giây trước khi quyết định</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 font-medium text-center">
            Bạn đang định vào: <span className="font-bold">{betType} {handicap}</span>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => (
              <label 
                key={idx} 
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                  checks[idx] 
                    ? 'bg-green-50 border-green-200 shadow-sm' 
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    checks[idx] ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
                }`}>
                    {checks[idx] && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={checks[idx]} 
                  onChange={() => handleCheck(idx)}
                />
                <span className={`text-sm leading-snug ${checks[idx] ? 'text-green-900 font-medium' : 'text-gray-600'}`}>
                  {q}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 px-4 bg-white border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors"
          >
            Hủy bỏ
          </button>
          <button 
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`flex-1 py-3 px-4 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg ${
              canConfirm 
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
            }`}
          >
            {canConfirm ? (
              <>
                <ShieldCheckIcon /> Xác nhận vào
              </>
            ) : (
              'Hoàn thành checklist'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const ShieldCheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        <path d="m9 12 2 2 4-4" />
    </svg>
);
