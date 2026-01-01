
import { MatchInfo, OddsData, ProcessedStats, AIPredictionResponse } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

/**
 * PROXY STRATEGY:
 * B365 API often blocks common public proxies like allorigins or corsproxy.io.
 * For personal projects, a private proxy like a Cloudflare Worker is recommended.
 */
const PROXY_URL = "https://muddy-wave-d0bc.phanvietlinh-0b1.workers.dev/"; 

const B365_API_INPLAY = "https://api.b365api.com/v3/events/inplay";
const B365_API_ODDS = "https://api.b365api.com/v2/event/odds";

const MIN_API_CALL_INTERVAL = 45 * 1000; 
let lastApiCallTime = 0; 

const enforceRateLimit = async () => {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCallTime;

    if (timeSinceLastCall < MIN_API_CALL_INTERVAL) {
        const waitTime = MIN_API_CALL_INTERVAL - timeSinceLastCall;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastApiCallTime = Date.now(); 
};

const safeFetch = async (url: string, retries = 0): Promise<any> => {
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY_MS = 2000;
    await enforceRateLimit();
    const proxiedUrl = `${PROXY_URL}?target=${encodeURIComponent(url)}`;
    
    try {
        const response = await fetch(proxiedUrl);
        if (response.status === 403) throw new Error("Lỗi truy cập (403)");
        if (response.status === 429) {
          if (retries < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retries);
            await new Promise(res => setTimeout(res, delay));
            return safeFetch(url, retries + 1);
          } else throw new Error("Giới hạn tần suất");
        }
        if (!response.ok) throw new Error(`Lỗi kết nối: ${response.status}`);
        const text = await response.text();
        if (!text || text.trim().length === 0) return null;
        return JSON.parse(text);
    } catch (error) {
        throw error;
    }
};

export const getInPlayEvents = async (token: string): Promise<MatchInfo[]> => {
  if (token === 'DEMO_MODE') return [];
  if (!token) return [];
  try {
    const targetUrl = `${B365_API_INPLAY}?sport_id=1&token=${token}`;
    const data = await safeFetch(targetUrl);
    if (data?.success !== 1 && data?.success !== "1") return [];
    return (data.results || []).filter((event: MatchInfo) => 
        event.league && !event.league.name.toLowerCase().includes('esoccer')
    );
  } catch (error) { return []; }
};

export const getMatchDetails = async (token: string, eventId: string): Promise<MatchInfo | null> => {
  if (token === 'DEMO_MODE') return null;
  try {
    const targetUrl = `${B365_API_INPLAY}?sport_id=1&token=${token}`;
    const data = await safeFetch(targetUrl);
    const results: MatchInfo[] = data?.results || [];
    return results.find(e => e.id === eventId) || null;
  } catch (error) { return null; }
};

export const getMatchOdds = async (token: string, eventId: string): Promise<OddsData | null> => {
  if (token === 'DEMO_MODE') return null;
  try {
    const targetUrl = `${B365_API_ODDS}?token=${token}&event_id=${eventId}`;
    const data = await safeFetch(targetUrl);
    if (!data || data.success === 0 || data.success === "0") return null;
    return data;
  } catch (error) { return null; }
};

export const parseStats = (stats: Record<string, string[]> | undefined) => {
  const parse = (key: string): [number, number] => {
    const arr = stats?.[key];
    return arr && arr.length === 2 ? [parseInt(arr[0] || '0'), parseInt(arr[1] || '0')] : [0, 0];
  };
  return {
    attacks: parse('attacks'),
    dangerous_attacks: parse('dangerous_attacks'),
    on_target: parse('on_target'),
    off_target: parse('off_target'),
    corners: parse('corners'),
    yellowcards: parse('yellowcards'),
    redcards: parse('redcards'),
  };
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export async function getGeminiGoalPrediction(
  matchId: string,
  currentMinute: number,
  homeTeamName: string,
  awayTeamName: string,
  homeScore: number,
  awayScore: number,
  currentStats: ProcessedStats | undefined,
  homeApi: number,
  awayApi: number,
  latestOverOdds: any,
  latestHomeOdds: any,
  apiMomentum: number,
  shotCluster: number,
  pressure: number,
): Promise<any | null> {
  if (!process.env.API_KEY) return null;

  const statsText = currentStats ? `Tấn công: ${currentStats.attacks[0]}-${currentStats.attacks[1]}, Nguy hiểm: ${currentStats.dangerous_attacks[0]}-${currentStats.dangerous_attacks[1]}, Sút trúng: ${currentStats.on_target[0]}-${currentStats.on_target[1]}` : "N/A";

  const promptContent = `
    Phân tích trận đấu bóng đá: ${homeTeamName} vs ${awayTeamName} (${homeScore}-${awayScore}) phút ${currentMinute}.
    Thống kê: ${statsText}. API: ${homeApi.toFixed(1)} vs ${awayApi.toFixed(1)}.
    Yêu cầu:
    1. Dự đoán xác suất nổ bàn thắng (0-100%).
    2. Nhận định chiến thuật (tactical_insight): Nếu trận đấu đang tẻ nhạt, hãy giải thích lý do (bế tắc, đá thủ, v.v.) và dự đoán khi nào nhịp độ sẽ tăng.
    Trả về JSON. Tiếng Việt.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: promptContent }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            goal_probability: { type: Type.INTEGER },
            confidence_level: { type: Type.STRING, enum: ['thấp', 'trung bình', 'cao', 'rất cao'] },
            reasoning: { type: Type.STRING },
            tactical_insight: { type: Type.STRING, description: 'Phân tích chiều sâu chiến thuật cho người dùng.' }
          },
          required: ['goal_probability', 'confidence_level', 'tactical_insight']
        }
      },
    });
    return JSON.parse(response.text.trim());
  } catch (error) { return null; }
}
