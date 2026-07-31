import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { getStore } from "./stores";

export const PURPOSE = {
  code: "20+N0",
  label: "機種変更＋データ移行",
  durationMinutes: 35,
};

type RawBlock = {
  startTime: string;
  endTime: string;
  acceptanceType: string;
  blockNum: number | null;
};

type RawDay = {
  nowDate: string;
  dayOfWeekCd: string;
  openStatus: string;
  blockNumDtoList: RawBlock[];
};

type StoredAvailability = {
  responseGetShopRemainBlockDto?: {
    shopBlockInfoDtoList?: Array<{
      shopId: string;
      workTime: number;
      dailyBlockInfoDtoList: RawDay[];
    }>;
  };
};

export type SlotStatus = "available" | "full" | "unavailable";

export type AvailabilityResult = {
  store: {
    id: string;
    carrier: "softbank" | "ymobile";
    name: string;
    address: string;
    detailUrl: string;
    reservationUrl: string;
  };
  purpose: typeof PURPOSE;
  updatedAt: string;
  refreshIntervalSeconds: number;
  dates: Array<{
    date: string;
    dayOfWeek: string;
    isOpen: boolean;
    availableCount: number;
    slots: Array<{
      time: string;
      status: SlotStatus;
    }>;
  }>;
};

const dayNames: Record<string, string> = {
  "1": "月",
  "2": "火",
  "3": "水",
  "4": "木",
  "5": "金",
  "6": "土",
  "7": "日",
};

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    chromium.executablePath(),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((value): value is string => Boolean(value));

  const executablePath = candidates.find((candidate) => existsSync(candidate));
  if (!executablePath) {
    throw new Error(
      "Chromeが見つかりません。CHROME_PATHにブラウザの実行ファイルを指定してください。",
    );
  }
  return executablePath;
}

function formatTime(value: string) {
  return `${value.slice(0, 2)}:${value.slice(2)}`;
}

function formatDate(value: string) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function normalizeAvailability(
  raw: StoredAvailability,
  storeId: string,
): AvailabilityResult {
  const store = getStore(storeId);
  if (!store) {
    throw new Error("指定された店舗は登録されていません。");
  }
  const shop =
    raw.responseGetShopRemainBlockDto?.shopBlockInfoDtoList?.find(
      (item) => item.shopId === storeId,
    ) ?? raw.responseGetShopRemainBlockDto?.shopBlockInfoDtoList?.[0];

  if (!shop?.dailyBlockInfoDtoList?.length) {
    throw new Error("予約枠データを取得できませんでした。");
  }

  const dates = shop.dailyBlockInfoDtoList.map((day) => {
    const slots = day.blockNumDtoList
      .filter((block) => block.acceptanceType !== "00")
      .map((block) => {
        let status: SlotStatus = "unavailable";
        if (block.acceptanceType === "02") {
          status = Number(block.blockNum) > 0 ? "available" : "full";
        }
        return {
          time: formatTime(block.startTime),
          status,
        };
      });

    return {
      date: formatDate(day.nowDate),
      dayOfWeek: dayNames[day.dayOfWeekCd] ?? "",
      isOpen: day.openStatus === "1",
      availableCount: slots.filter((slot) => slot.status === "available").length,
      slots,
    };
  });

  return {
    store: {
      id: store.id,
      carrier: store.carrier,
      name: store.name,
      address: store.address,
      detailUrl: store.detailUrl,
      reservationUrl: store.reservationUrl,
    },
    purpose: {
      ...PURPOSE,
      durationMinutes: shop.workTime || PURPOSE.durationMinutes,
    },
    updatedAt: new Date().toISOString(),
    refreshIntervalSeconds: 300,
    dates,
  };
}

export async function scrapeAvailability(
  storeId: string,
): Promise<AvailabilityResult> {
  const store = getStore(storeId);
  if (!store) {
    throw new Error("指定された店舗は登録されていません。");
  }
  const browser = await chromium.launch({
    executablePath: findBrowserExecutable(),
    headless: true,
  });

  try {
    const context = await browser.newContext({
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
    });
    const page = await context.newPage();

    await page.goto(store.reservationUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.locator("#inner_contents_01").waitFor({
      state: "visible",
      timeout: 30_000,
    });

    // 「機種変更」を1台選ぶとサポート内容の確認画面が開く。
    await page.locator('label[for="workGrp_20"]').click();
    await page.locator('label[for="SP_support_01"]').click();

    await page.locator("#page0_next_button").click();
    await page.locator("#contents_02.slick-current").waitFor({
      state: "visible",
      timeout: 30_000,
    });

    const raw = await page.evaluate(() => {
      const stored = sessionStorage.getItem("API_getShopRemainBlock");
      return stored ? (JSON.parse(stored) as StoredAvailability) : null;
    });

    if (!raw) {
      throw new Error("公式予約画面から空き状況を読み取れませんでした。");
    }
    return normalizeAvailability(raw, store.id);
  } finally {
    await browser.close();
  }
}
