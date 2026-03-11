"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnalysisSummary } from "@/components/stocks/analysis-summary";
import { PriceChart } from "@/components/charts/price-chart";
import { ExplanationCard } from "@/components/stocks/explanation-card";
import { IndicatorGrid } from "@/components/stocks/indicator-grid";
import { Button, Card, Input } from "@/components/ui";
import type { AnalysisResult, StockQuote } from "@/types";

export function AnalysisSearch({ initialAnalysis }: { initialAnalysis: AnalysisResult | null }) {
  const [query, setQuery] = useState(initialAnalysis?.symbol ?? "NABIL");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(initialAnalysis);
  const [matches, setMatches] = useState<StockQuote[]>([]);
  const [openSuggestions, setOpenSuggestions] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestIdRef = useRef(0);
  const suppressNextSuggestionRef = useRef(false);
  const blurTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!analysis?.symbol) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void runAnalysis(analysis.symbol, true);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [analysis?.symbol]);

  useEffect(() => {
    if (!searchActive) {
      setOpenSuggestions(false);
      return;
    }

    if (!query.trim()) {
      setMatches([]);
      setOpenSuggestions(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const nextRequestId = requestIdRef.current + 1;
      requestIdRef.current = nextRequestId;

      const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        return;
      }

      const result = ((await response.json()) as StockQuote[]).slice(0, 8);
      if (requestIdRef.current !== nextRequestId) {
        return;
      }

      setMatches(result);
      if (suppressNextSuggestionRef.current) {
        suppressNextSuggestionRef.current = false;
        setOpenSuggestions(false);
      } else {
        setOpenSuggestions(result.length > 0);
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [query, searchActive]);

  async function runAnalysis(symbol: string, silent = false) {
    if (!silent) {
      setPending(true);
      setError(null);
    }

    try {
      const response = await fetch(`/api/analysis/${encodeURIComponent(symbol)}`);
      const raw = await response.text();
      const data = raw ? (JSON.parse(raw) as AnalysisResult | { error?: string }) : null;

      if (!response.ok) {
        setAnalysis(null);
        setError(
          data && typeof data === "object" && "error" in data && data.error
            ? data.error
            : "Unable to analyze this share right now."
        );
        return;
      }

      if (!data || !("symbol" in data)) {
        setAnalysis(null);
        setError("Analysis response was incomplete.");
        return;
      }

      setAnalysis(data);
      suppressNextSuggestionRef.current = true;
      setQuery(symbol);
      setOpenSuggestions(false);
      setSearchActive(false);
    } catch {
      setAnalysis(null);
      setError("Unable to analyze this share right now.");
    } finally {
      if (!silent) {
        setPending(false);
      }
    }
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const selected = matches[0];

    if (!selected) {
      setAnalysis(null);
      setError("No share matched that symbol or company name.");
      return;
    }

    await runAnalysis(selected.symbol);
  }

  function handleFocus() {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    setSearchActive(true);
    setOpenSuggestions(matches.length > 0);
  }

  function handleBlur() {
    blurTimeoutRef.current = window.setTimeout(() => {
      setOpenSuggestions(false);
      setSearchActive(false);
    }, 120);
  }

  return (
    <div className="space-y-4">
      <Card className={openSuggestions ? "relative z-50 overflow-visible" : "relative overflow-visible"}>
        <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSearch}>
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              value={query}
              onChange={(event) => {
                setSearchActive(true);
                setQuery(event.target.value);
              }}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Search by NEPSE symbol or company name"
            />
            {openSuggestions && matches.length ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[100] rounded-2xl border border-slate-200 bg-white p-2 shadow-card ring-1 ring-black/5">
                {matches.map((stock) => (
                  <button
                    key={stock.symbol}
                    className="flex w-full items-start justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50"
                    onClick={() => void runAnalysis(stock.symbol)}
                    type="button"
                  >
                    <div>
                      <p className="font-semibold text-ink">{stock.symbol}</p>
                      <p className="text-sm text-slate-500">{stock.companyName}</p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{stock.sector}</p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Button disabled={pending} type="submit">
            {pending ? "Analyzing..." : "Analyze"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-slate-500">
          Suggestions filter as you type. Pick one result to analyze that specific share.
        </p>
      </Card>

      {error ? <Card className="text-sm text-rose-600">{error}</Card> : null}

      {analysis ? (
        <div className="space-y-4">
          <AnalysisSummary analysis={analysis} canToggleWatchlist />
          <div className="grid gap-4 xl:grid-cols-3">
            <PriceChart
              data={analysis.liveChart}
              dataKey="price"
              title={`Intraday Live Chart (11:00-15:00, 5m)${analysis.liveSources.length ? ` · ${analysis.liveSources.join(", ")}` : ""}`}
              color="#0d1f1d"
            />
            <PriceChart data={analysis.historicalChart} dataKey="close" title="Historical Chart" />
            <PriceChart
              data={analysis.predictionChart}
              dataKey="predictedClose"
              title="Future Prediction Chart"
              color="#bf8b30"
            />
          </div>
          <IndicatorGrid indicators={analysis.indicators} />
          <Card className="text-sm text-slate-600">
            Live intraday points are captured every 5 minutes during the NEPSE trading window from
            11:00 AM to 3:00 PM and the chart refreshes automatically while this page stays open.
          </Card>
          <ExplanationCard
            simple={analysis.simpleExplanation}
            advanced={analysis.advancedExplanation}
          />
        </div>
      ) : null}
    </div>
  );
}
