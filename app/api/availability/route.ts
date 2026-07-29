import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_STORE_ID, getStore } from "../../../lib/stores";

export const dynamic = "force-dynamic";

const DATA_URL =
  "https://ryuta1998.github.io/fukui-shop-reservation-watch/data/availability.json";

type PublicAvailability = {
  generatedAt: string;
  stores: Array<{
    store: {
      id: string;
    };
    error?: string;
  }>;
};

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
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`公開データ取得エラー: ${response.status}`);
    }

    const payload = (await response.json()) as PublicAvailability;
    const result = payload.stores.find((item) => item.store.id === storeId);
    if (!result) {
      return NextResponse.json(
        { error: "指定店舗の予約枠データが見つかりません。" },
        { status: 404 },
      );
    }
    if (result.error) {
      return NextResponse.json(
        { error: result.error, cached: result },
        { status: 503 },
      );
    }

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Availability-Generated-At": payload.generatedAt,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "空き状況の取得に失敗しました。";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
