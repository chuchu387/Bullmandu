import { Card, Badge } from "@/components/ui";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { AnalysisResult } from "@/types";
import { WatchlistToggle } from "@/components/stocks/watchlist-toggle";

export function AnalysisSummary({
  analysis,
  canToggleWatchlist = false
}: {
  analysis: AnalysisResult;
  canToggleWatchlist?: boolean;
}) {
  const positive = analysis.rupeeMove >= 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{analysis.symbol}</p>
            <h1 className="text-3xl font-semibold text-ink">{analysis.companyName}</h1>
            <p className="mt-1 text-sm text-slate-500">{analysis.sector}</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Badge positive={positive} negative={!positive}>
              {analysis.recommendation}
            </Badge>
            {canToggleWatchlist ? <WatchlistToggle symbol={analysis.symbol} /> : null}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="Current Price" value={formatCurrency(analysis.currentPrice)} />
          <Metric label="Predicted Price" value={formatCurrency(analysis.predictedPrice)} />
          <Metric label="Rupee Move" value={`${positive ? "+" : ""}${formatCurrency(analysis.rupeeMove)}`} />
          <Metric label="Expected Change" value={formatPercent(analysis.percentageMove)} />
        </div>
        <div className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
          <CompactMetric
            label="Target Date"
            value={analysis.estimatedTargetDate ?? "Scenario-based"}
            helper="Projected window"
          />
          <CompactMetric
            label="Confidence"
            value={`${analysis.confidence.toFixed(0)}%`}
            helper={`${analysis.backtest.horizonDays}-day model`}
          />
          <CompactMetric
            label="Backtest Accuracy"
            value={`${analysis.backtest.directionalAccuracy.toFixed(0)}%`}
            helper={`${analysis.backtest.meanAbsoluteErrorPercent.toFixed(2)}% avg error`}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <Metric label="Target Timeframe" value={analysis.timeframe} />
        <Metric label="Estimated Target Date" value={analysis.estimatedTargetDate ?? "Scenario-based"} />
        <Metric label="Confidence" value={`${analysis.confidence.toFixed(0)}%`} />
        <Metric
          label={`${analysis.backtest.horizonDays}-Day Backtest Accuracy`}
          value={`${analysis.backtest.directionalAccuracy.toFixed(0)}%`}
        />
        <Metric
          label="Backtest Avg Error"
          value={`${analysis.backtest.meanAbsoluteErrorPercent.toFixed(2)}%`}
        />
        <Metric label="Risk Note" value={analysis.riskNote} compact />
      </Card>
    </div>
  );
}

function CompactMetric({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  compact
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={compact ? "text-sm font-medium text-ink" : "text-xl font-semibold text-ink"}>{value}</p>
    </div>
  );
}
