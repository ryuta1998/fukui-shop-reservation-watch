const elements = {
  select: document.querySelector("#store-select"),
  loading: document.querySelector("#loading"),
  dashboard: document.querySelector("#dashboard"),
  carrier: document.querySelector("#carrier"),
  name: document.querySelector("#store-name"),
  address: document.querySelector("#store-address"),
  officialLink: document.querySelector("#official-link"),
  purposeLabel: document.querySelector("#purpose-label"),
  updatedAt: document.querySelector("#updated-at"),
  dateTabs: document.querySelector("#date-tabs"),
  slots: document.querySelector("#slots"),
};

let payload;
let selectedStoreId = localStorage.getItem("selectedStoreId") || "RA02";
let selectedDateIndex = 0;

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
});
const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function statusLabel(status) {
  return {
    available: "空きあり",
    full: "満席",
    unavailable: "受付なし",
  }[status];
}

function renderSlots(store) {
  const day = store.dates[selectedDateIndex];
  elements.slots.replaceChildren();

  if (!day) {
    const message = document.createElement("p");
    message.className = "empty";
    message.textContent = store.error
      ? "この店舗の情報を一時的に取得できませんでした。次回更新をお待ちください。"
      : "表示できる予約枠がありません。";
    elements.slots.append(message);
    return;
  }

  if (!day.isOpen || day.slots.length === 0) {
    const message = document.createElement("p");
    message.className = "empty";
    message.textContent = "この日は受付できる時間帯がありません。";
    elements.slots.append(message);
    return;
  }

  day.slots.forEach((slot) => {
    const item = document.createElement("div");
    item.className = `slot ${slot.status}`;
    item.innerHTML = `<strong>${slot.time}</strong><span>${statusLabel(slot.status)}</span>`;
    elements.slots.append(item);
  });
}

function renderDates(store) {
  elements.dateTabs.replaceChildren();
  store.dates.forEach((day, index) => {
    const button = document.createElement("button");
    button.type = "button";
    const stateClass =
      day.isOpen && day.availableCount === 0 ? " is-full" : "";
    button.className =
      `${index === selectedDateIndex ? "date-tab active" : "date-tab"}${stateClass}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(index === selectedDateIndex));
    button.innerHTML = `
      <span>${dateFormatter.format(new Date(`${day.date}T00:00:00+09:00`))}</span>
      <strong>${day.availableCount > 0 ? `${day.availableCount}枠` : "空きなし"}</strong>
    `;
    button.addEventListener("click", () => {
      selectedDateIndex = index;
      renderStore();
    });
    elements.dateTabs.append(button);
  });
}

function renderStore() {
  const store =
    payload.stores.find((item) => item.store.id === selectedStoreId) ||
    payload.stores[0];
  selectedStoreId = store.store.id;
  elements.select.value = selectedStoreId;
  elements.carrier.textContent =
    store.store.carrier === "ymobile" ? "Y!mobile" : "SoftBank";
  elements.name.textContent = store.store.name;
  elements.address.textContent = store.store.address;
  elements.officialLink.href = store.store.detailUrl;
  const purpose = store.purpose || payload.purpose;
  elements.purposeLabel.textContent = purpose
    ? `${purpose.label}（${purpose.durationMinutes}分）`
    : "機種変更＋データ移行（35分）";
  elements.updatedAt.textContent = `更新 ${timeFormatter.format(
    new Date(payload.generatedAt),
  )}`;
  renderDates(store);
  renderSlots(store);
}

async function start() {
  try {
    const response = await fetch(`./data/availability.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("データを読み込めませんでした");
    payload = await response.json();

    payload.stores.forEach(({ store }) => {
      const option = document.createElement("option");
      option.value = store.id;
      option.textContent = store.name;
      elements.select.append(option);
    });
    if (!payload.stores.some(({ store }) => store.id === selectedStoreId)) {
      selectedStoreId = payload.stores[0].store.id;
    }

    elements.select.addEventListener("change", (event) => {
      selectedStoreId = event.target.value;
      selectedDateIndex = 0;
      localStorage.setItem("selectedStoreId", selectedStoreId);
      renderStore();
    });

    renderStore();
    elements.loading.hidden = true;
    elements.dashboard.hidden = false;
  } catch {
    elements.loading.textContent =
      "空き状況を読み込めませんでした。時間をおいて再度お試しください。";
    elements.loading.classList.add("error");
  }
}

start();
