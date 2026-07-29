"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_STORE_ID, getStore, STORES } from "../lib/stores";

type SlotStatus = "available" | "full" | "unavailable";

type AvailabilityData = {
  store: {
    name: string;
    address: string;
    detailUrl: string;
    reservationUrl: string;
  };
  purpose: {
    label: string;
    durationMinutes: number;
  };
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

const statusLabel: Record<SlotStatus, string> = {
  available: "空き",
  full: "満席",
  unavailable: "受付外",
};

function displayDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function AvailabilityDashboard() {
  const [selectedStoreId, setSelectedStoreId] = useState(DEFAULT_STORE_ID);
  const [data, setData] = useState<AvailabilityData | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (fresh = false) => {
    if (fresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const response = await fetch(
        `/api/availability?shop=${encodeURIComponent(selectedStoreId)}${fresh ? "&fresh=1" : ""}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) {
        if (result.cached) setData(result.cached);
        throw new Error(result.error ?? "空き状況を取得できませんでした。");
      }
      setData(result);
      setSelectedDate((current) =>
        result.dates.some(
          (date: AvailabilityData["dates"][number]) => date.date === current,
        )
          ? current
          : result.dates[0]?.date || "",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "空き状況を取得できませんでした。",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void load();
    }, 0);
    const timer = window.setInterval(() => {
      void load();
    }, 5 * 60 * 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const selected = useMemo(
    () => data?.dates.find((date) => date.date === selectedDate),
    [data, selectedDate],
  );

  const availableDates =
    data?.dates.filter((date) => date.availableCount > 0).length ?? 0;
  const selectedStore = getStore(selectedStoreId) ?? STORES[0];

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="brandMark">予約</span>
          <span>来店予約ウォッチ</span>
        </div>
        <div className="liveBadge">
          <span className="pulse" />
          {STORES.length}店舗を確認
        </div>
      </header>

      <section className="storePicker" aria-label="店舗選択">
        <div className="pickerIntro">
          <span className="pickerStep" aria-hidden="true">01</span>
          <div>
            <span className="pickerTitle">店舗を選択</span>
            <p>確認したい店舗を下の一覧から選んでください</p>
          </div>
        </div>
        <label className="selectShell">
          <span className="selectLabel">現在表示している店舗</span>
          <select
            value={selectedStoreId}
            onChange={(event) => {
              setData(null);
              setSelectedDate("");
              setError("");
              setLoading(true);
              setSelectedStoreId(event.target.value);
            }}
          >
            {STORES.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}（{store.id}）
              </option>
            ))}
          </select>
        </label>
      </section>

      <section
        className={
          selectedStore.carrier === "ymobile"
            ? "hero ymobileHero"
            : "hero softbankHero"
        }
      >
        <div>
          <p className="eyebrow">
            {selectedStore.carrier === "ymobile" ? "Y!MOBILE" : "SOFTBANK"} ·
            SHOP {selectedStore.id}
          </p>
          <h1>{selectedStore.shortName}の予約空き状況</h1>
          <p className="storeName">{data?.store.name ?? selectedStore.name}</p>
          <p className="address">
            {data?.store.address ?? selectedStore.address}
          </p>
        </div>
        <div className="heroSummary">
          <span>直近14日</span>
          <strong>{loading && !data ? "—" : availableDates}</strong>
          <small>日で空きあり</small>
        </div>
      </section>

      <section className="toolbar" aria-label="表示条件">
        <div>
          <span className="toolbarLabel">来店目的</span>
          <strong>
            {data?.purpose.label ?? "契約内容確認・変更"}
            <small>（{data?.purpose.durationMinutes ?? 30}分）</small>
          </strong>
        </div>
        <div className="toolbarActions">
          {data && (
            <span className="updatedAt">
              最終更新{" "}
              {new Intl.DateTimeFormat("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZone: "Asia/Tokyo",
              }).format(new Date(data.updatedAt))}
            </span>
          )}
          <button
            className="refreshButton"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <span className={refreshing ? "refreshIcon spinning" : "refreshIcon"}>
              ↻
            </span>
            {refreshing ? "更新中" : "今すぐ更新"}
          </button>
        </div>
      </section>

      {error && (
        <div className="errorBanner" role="alert">
          <strong>更新できませんでした</strong>
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <section className="loadingPanel" aria-live="polite">
          <span className="loader" />
          <h2>公式サイトから空き状況を確認しています</h2>
          <p>初回の取得には10〜30秒ほどかかります。</p>
        </section>
      ) : data ? (
        <>
          <nav className="dateStrip" aria-label="日付を選択">
            {data.dates.map((day) => (
              <button
                key={day.date}
                className={
                  selectedDate === day.date ? "dateCard selected" : "dateCard"
                }
                onClick={() => setSelectedDate(day.date)}
                aria-pressed={selectedDate === day.date}
              >
                <span className={`weekday day-${day.dayOfWeek}`}>
                  {day.dayOfWeek}
                </span>
                <strong>{displayDate(day.date)}</strong>
                <span
                  className={
                    day.availableCount > 0 ? "dayState open" : "dayState closed"
                  }
                >
                  {day.availableCount > 0
                    ? `${day.availableCount}枠`
                    : day.isOpen
                      ? "空きなし"
                      : "休業"}
                </span>
              </button>
            ))}
          </nav>

          <section className="schedulePanel">
            <div className="scheduleHeader">
              <div>
                <p className="eyebrow">TIME SLOTS</p>
                <h2>
                  {selected ? displayDate(selected.date) : "—"}（
                  {selected?.dayOfWeek ?? "—"}）の時間帯
                </h2>
              </div>
              <div className="legend" aria-label="空き状況の凡例">
                <span><i className="dot available" />空き</span>
                <span><i className="dot full" />満席</span>
                <span><i className="dot unavailable" />受付外</span>
              </div>
            </div>

            {selected?.slots.length ? (
              <div className="slotGrid">
                {selected.slots.map((slot) => (
                  <div
                    key={slot.time}
                    className={`slot ${slot.status}`}
                    title={`${slot.time} ${statusLabel[slot.status]}`}
                  >
                    <strong>{slot.time}</strong>
                    <span>{statusLabel[slot.status]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="emptyState">
                この日は予約可能な時間帯がありません。
              </div>
            )}
          </section>

          <footer className="footer">
            <p>
              表示は取得時点の状況です。予約操作はソフトバンク公式サイトで行ってください。
            </p>
            <div>
              <a href={data.store.detailUrl} target="_blank" rel="noreferrer">
                店舗ページ
              </a>
              <a
                className="primaryLink"
                href={data.store.reservationUrl}
                target="_blank"
                rel="noreferrer"
              >
                公式予約画面を開く
              </a>
            </div>
          </footer>
        </>
      ) : null}
    </main>
  );
}
