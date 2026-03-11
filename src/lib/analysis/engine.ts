import { addTradingDays } from "@/lib/data/time";
import {
  bollinger,
  ema,
  linearRegressionSlope,
  macd,
  momentum,
  rsi,
  sma,
  supportResistance,
  volatility,
  volumeTrend
} from "@/lib/analysis/indicators";
import type { AnalysisResult, PredictionPoint, Recommendation, StockQuote } from "@/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function roundFinite(value: number, fallback: number, digits = 2) {
  const safeValue = finiteOr(value, fallback);
  return Number(safeValue.toFixed(digits));
}

function buildStableHistory(stock: StockQuote) {
  const safePreviousClose =
    Number.isFinite(stock.previousClose) && stock.previousClose > 0
      ? stock.previousClose
      : stock.currentPrice > 0
        ? stock.currentPrice
        : 1;
  const safeCurrentPrice =
    Number.isFinite(stock.currentPrice) && stock.currentPrice > 0 ? stock.currentPrice : safePreviousClose;

  const cleaned = stock.history
    .filter((point) => Number.isFinite(point.close) && point.close > 0)
    .map((point) => ({
      ...point,
      close: point.close,
      volume: Number.isFinite(point.volume) && point.volume >= 0 ? point.volume : 0
    }));

  if (cleaned.length >= 30) {
    return cleaned;
  }

  const seedPrice = cleaned.at(-1)?.close ?? safePreviousClose;
  const filler = Array.from({ length: Math.max(30 - cleaned.length, 0) }, (_, index) => ({
    date: `synthetic-${index + 1}`,
    close: seedPrice,
    volume: 0
  }));

  return [...filler, ...cleaned, { date: "synthetic-current", close: safeCurrentPrice, volume: stock.volume }];
}

function buildRecommendation(score: number): Recommendation {
  if (score >= 75) return "Strong Buy";
  if (score >= 60) return "Buy";
  if (score >= 45) return "Hold";
  if (score >= 30) return "Sell";
  return "Strong Sell";
}

export function estimateTimeframe(changePercent: number, slope: number, risk: number) {
  const absoluteChange = Math.abs(changePercent);
  const slopeFactor = Math.max(Math.abs(slope), 0.2);
  const riskDrag = 1 + risk / 30;
  const rawDays = Math.ceil((absoluteChange / slopeFactor) * riskDrag);

  if (rawDays <= 3) return { days: rawDays, label: "1-3 trading days" };
  if (rawDays <= 7) return { days: 7, label: "1 week" };
  if (rawDays <= 14) return { days: 14, label: "2 weeks" };
  if (rawDays <= 30) return { days: 30, label: "1 month" };
  return { days: 60, label: "3 months" };
}

function predictionCurve(lastPrice: number, targetPrice: number, days: number) {
  const points: PredictionPoint[] = [];
  const step = (targetPrice - lastPrice) / Math.max(days, 1);

  for (let day = 1; day <= days; day += 1) {
    const easing = 1 - Math.exp(-day / Math.max(days / 3, 1));
    const projectedClose = Number((lastPrice + step * day * easing * 1.18).toFixed(2));
    points.push({
      date: addTradingDays(day),
      predictedClose: day === days ? Number(targetPrice.toFixed(2)) : projectedClose
    });
  }

  return points;
}

export function analyzeStock(stock: StockQuote): AnalysisResult {
  const stableHistory = buildStableHistory(stock);
  const closes = stableHistory.map((point) => point.close);
  const volumes = stableHistory.map((point) => point.volume);
  const currentPrice = finiteOr(stock.currentPrice, closes.at(-1) ?? 0);
  const previousClose = finiteOr(stock.previousClose, currentPrice);
  const dailyChange = currentPrice - previousClose;
  const dailyChangePercent = previousClose === 0 ? 0 : (dailyChange / previousClose) * 100;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const rsi14 = rsi(closes, 14);
  const macdSet = macd(closes);
  const bands = bollinger(closes, 20, 2);
  const levels = supportResistance(closes, 30);
  const momentumValue = momentum(closes, 10);
  const volatilityValue = volatility(closes, 20);
  const trendSlope = linearRegressionSlope(closes.slice(-20));
  const volumeTrendValue = volumeTrend(volumes);
  const safeSupport = finiteOr(levels.support, Math.min(currentPrice, previousClose));
  const safeResistance = finiteOr(levels.resistance, Math.max(currentPrice, previousClose));

  let score = 50;
  score += currentPrice > sma20 ? 8 : -8;
  score += currentPrice > sma50 ? 8 : -8;
  score += ema12 > ema26 ? 9 : -9;
  score += macdSet.histogram > 0 ? 6 : -6;
  score += rsi14 < 35 ? 10 : 0;
  score += rsi14 > 70 ? -10 : 0;
  score += momentumValue > 0 ? 7 : -7;
  score += trendSlope > 0 ? 8 : -8;
  score += volumeTrendValue > 0.08 ? 6 : volumeTrendValue < -0.08 ? -6 : 0;
  score += currentPrice < bands.lower ? 7 : currentPrice > bands.upper ? -7 : 0;

  const recommendation = buildRecommendation(clamp(score, 0, 100));
  const baseProjection = currentPrice + trendSlope * 8 + momentumValue * 0.35;
  const regressionProjection = currentPrice + trendSlope * 15;
  const resistanceAdjusted = Math.min(regressionProjection, safeResistance * 1.04);
  const supportAdjusted = Math.max(baseProjection, safeSupport * 0.97);
  const predictedPrice = roundFinite(
    (
      resistanceAdjusted * 0.4 +
      supportAdjusted * 0.3 +
      (currentPrice + (ema12 - ema26) * 4) * 0.3
    ),
    currentPrice
  );
  const rupeeMove = roundFinite(predictedPrice - currentPrice, 0);
  const percentageMove = roundFinite(currentPrice === 0 ? 0 : (rupeeMove / currentPrice) * 100, 0);
  const confidence = clamp(
    roundFinite(
      (
        62 +
        (trendSlope > 0 ? 6 : -4) +
        (Math.abs(macdSet.histogram) > 2 ? 5 : 0) -
        volatilityValue * 0.45 +
        volumeTrendValue * 100 * 0.1
      ),
      55
    ),
    35,
    91
  );
  const timeframeMeta = estimateTimeframe(percentageMove, trendSlope, volatilityValue);
  const estimatedTargetDate = addTradingDays(timeframeMeta.days);
  const predictionChart = predictionCurve(currentPrice, predictedPrice, Math.min(timeframeMeta.days, 20));
  const riskLabel =
    volatilityValue > 18
      ? "High volatility may delay the target and trigger sharp swings."
      : currentPrice >= safeResistance * 0.98
        ? `Resistance near Rs. ${safeResistance.toFixed(2)} may slow follow-through.`
        : `Support near Rs. ${safeSupport.toFixed(2)} offers some downside reference, but trends can reverse quickly.`;

  const simpleExplanation = `${stock.symbol} looks ${recommendation.toLowerCase()} because price is ${currentPrice > sma20 ? "above" : "below"} key moving averages, RSI is ${rsi14.toFixed(0)}, and momentum is ${momentumValue >= 0 ? "improving" : "weakening"}.`;
  const advancedExplanation = [
    `The weighted model scores trend, momentum, mean reversion, and participation.`,
    `Price vs SMA20/SMA50 is ${currentPrice > sma20 && currentPrice > sma50 ? "constructive" : "mixed"}, MACD histogram is ${macdSet.histogram >= 0 ? "positive" : "negative"}, and volume trend is ${(volumeTrendValue * 100).toFixed(1)}%.`,
    `The target blends short moving-average projection, recent regression slope, and nearby support/resistance zones to keep the estimate practical for NEPSE-style liquidity conditions.`
  ].join(" ");

  return {
    symbol: stock.symbol,
    companyName: stock.companyName,
    sector: stock.sector,
    currentPrice,
    dailyChange: roundFinite(dailyChange, 0),
    dailyChangePercent: roundFinite(dailyChangePercent, 0),
    volume: finiteOr(stock.volume, 0),
    indicators: {
      sma20: roundFinite(sma20, currentPrice),
      sma50: roundFinite(sma50, currentPrice),
      ema12: roundFinite(ema12, currentPrice),
      ema26: roundFinite(ema26, currentPrice),
      rsi14: roundFinite(rsi14, 50),
      macd: roundFinite(macdSet.macd, 0),
      signal: roundFinite(macdSet.signal, 0),
      histogram: roundFinite(macdSet.histogram, 0),
      bollingerUpper: roundFinite(bands.upper, currentPrice),
      bollingerMiddle: roundFinite(bands.middle, currentPrice),
      bollingerLower: roundFinite(bands.lower, currentPrice),
      support: roundFinite(safeSupport, currentPrice),
      resistance: roundFinite(safeResistance, currentPrice),
      momentum: roundFinite(momentumValue, 0),
      volatility: roundFinite(volatilityValue, 0),
      trendSlope: roundFinite(trendSlope, 0, 3),
      volumeTrend: roundFinite(volumeTrendValue * 100, 0)
    },
    recommendation,
    confidence,
    predictedPrice,
    rupeeMove,
    percentageMove,
    timeframe: timeframeMeta.label,
    estimatedTargetDate,
    simpleExplanation,
    advancedExplanation,
    riskNote: riskLabel,
    historicalChart: stableHistory,
    predictionChart,
    liveChart: [],
    liveSources: []
  };
}
