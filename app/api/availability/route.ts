import { NextRequest, NextResponse } from "next/server";
import {
  AvailabilityResult,
  scrapeAvailability,
} from "../../../lib/softbank-reservation";
import { DEFAULT_STORE_ID, getStore } from "../../../lib/stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 5 * 60 * 1000;
const MIN_FORCE_REFRESH_MS = 60 * 1000;

const cache = new Map<
  string,
  {
    value: AvailabilityResult;
    fetchedAt: number;
  }
>();
const inFlight = new Map<string, Promise<AvailabilityResult>>();

async function getAvailability(storeId: string, force: boolean) {
  const now = Date.now();
  const cached = cache.get(storeId);
  const age = cached ? now - cached.fetchedAt : Number.POSITIVE_INFINITY;
  if (cached && (age < CACHE_MS || (force && age < MIN_FORCE_REFRESH_MS))) {
    return cached.value;
  }
  const existing = inFlight.get(storeId);
  if (existing) return existing;

  const request = scrapeAvailability(storeId)
    .then((value) => {
      cache.set(storeId, { value, fetchedAt: Date.now() });
      return value;
    })
    .finally(() => {
      inFlight.delete(storeId);
    });

  inFlight.set(storeId, request);
  return request;
}

export async function GET(request: NextRequest) {
  const storeId =
    request.nextUrl.searchParams.get("shop")?.toUpperCase() ?? DEFAULT_STORE_ID;
  if (!getStore(storeId)) {
    return NextResponse.json(
      { error: "指定された店舗は登録されていません。" },
      { status: 400 },
    );
  }

  try {
    const force = request.nextUrl.searchParams.get("fresh") === "1";
    const data = await getAvailability(storeId, force);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "空き状況の取得に失敗しました。";
    return NextResponse.json(
      {
        error: message,
        cached: cache.get(storeId)?.value ?? null,
      },
      { status: 503 },
    );
  }
}
