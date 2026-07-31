import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PURPOSE,
  scrapeAvailability,
  type AvailabilityResult,
} from "../lib/softbank-reservation";
import { STORES } from "../lib/stores";

type StoreResult =
  | AvailabilityResult
  | {
      store: (typeof STORES)[number];
      error: string;
      dates: [];
    };

const results: StoreResult[] = [];
const batchSize = 2;

for (let index = 0; index < STORES.length; index += batchSize) {
  const batch = STORES.slice(index, index + batchSize);
  const settled = await Promise.allSettled(
    batch.map((store) => scrapeAvailability(store.id)),
  );

  settled.forEach((result, resultIndex) => {
    const store = batch[resultIndex];
    if (result.status === "fulfilled") {
      results.push(result.value);
      console.log(`取得完了: ${store.name}`);
      return;
    }

    const message =
      result.reason instanceof Error ? result.reason.message : "取得に失敗しました";
    console.error(`取得失敗: ${store.name}: ${message}`);
    results.push({ store, error: message, dates: [] });
  });
}

if (!results.some((result) => result.dates.length > 0)) {
  throw new Error("すべての店舗で空き状況を取得できませんでした。");
}

const output = {
  generatedAt: new Date().toISOString(),
  refreshMinutes: 30,
  purpose: PURPOSE,
  stores: results,
};

const outputDirectory = path.join(process.cwd(), "public-site", "data");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "availability.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);

console.log(`公開用データを更新しました（${results.length}店舗）`);
