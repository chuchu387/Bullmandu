import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { marketDataProvider } from "@/lib/data/market-provider";
import { symbolSchema } from "@/lib/validations/stocks";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const parsed = symbolSchema.parse(await params);
    const analysis = await marketDataProvider.getAnalysis(parsed.symbol);

    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const session = await getSession();
    if (session?.sub) {
      await db.analysisHistory.create({
        data: {
          userId: session.sub,
          symbol: analysis.symbol,
          companyName: analysis.companyName,
          recommendation: analysis.recommendation,
          currentPrice: analysis.currentPrice,
          predictedPrice: analysis.predictedPrice,
          expectedChange: analysis.percentageMove,
          rupeeMove: analysis.rupeeMove,
          confidence: analysis.confidence,
          timeframeLabel: analysis.timeframe,
          estimatedTargetDate: analysis.estimatedTargetDate ? new Date(analysis.estimatedTargetDate) : null,
          riskNote: analysis.riskNote,
          simpleExplanation: analysis.simpleExplanation,
          advancedExplanation: analysis.advancedExplanation
        }
      });
    }

    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
