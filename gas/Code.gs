const CONFIG = {
  dataUrl:
    "https://ryuta1998.github.io/fukui-shop-reservation-watch/data/availability.json",
  siteUrl: "https://ryuta1998.github.io/fukui-shop-reservation-watch/",
  settingsSheet: "設定",
  stateSheet: "監視状態",
  logSheet: "満席通知ログ",
  webhookProperty: "GOOGLE_CHAT_WEBHOOK_URL",
  morningCheckPropertyPrefix: "LAST_MORNING_CHECK_",
};

const STORE_NAMES = {
  RA02: "ソフトバンクＭＥＧＡドン・キホーテＵＮＹ敦賀",
  R306: "ソフトバンク鯖江",
  R316: "ソフトバンク鯖江中央",
  R311: "ソフトバンクアピタ福井大和田",
  WA2L: "ワイモバイルアピタ福井大和田",
  R307: "ソフトバンク福井運動公園",
  R315: "ソフトバンクＭＥＧＡドン・キホーテＵＮＹ福井",
  R323: "ソフトバンク二の宮",
};

const STORE_CLOSING_HOURS = {
  RA02: { weekday: 19, weekend: 20 },
  R306: { weekday: 18, weekend: 19 },
  R316: { weekday: 19, weekend: 20 },
  R311: { weekday: 21, weekend: 21 },
  WA2L: { weekday: 21, weekend: 21 },
  R307: { weekday: 18, weekend: 19 },
  R315: { weekday: 19, weekend: 20 },
  R323: { weekday: 19, weekend: 20 },
};

const STORE_OPENING_HOURS = {
  RA02: 10,
  R306: 9,
  R316: 10,
  R311: 10,
  WA2L: 10,
  R307: 9,
  R315: 10,
  R323: 10,
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("満席通知")
    .addItem("初期シートを作成", "setupSheets")
    .addItem("Webhook URLを設定", "setChatWebhookUrl")
    .addItem("30分ごとの監視を開始", "setupMonitoring")
    .addSeparator()
    .addItem("今すぐ確認", "checkAvailability")
    .addItem("午前枠を今すぐ確認", "checkMorningAvailability")
    .addToUi();
}

function setupSheets(showAlert) {
  const spreadsheet = SpreadsheetApp.getActive();
  createSheetIfMissing_(spreadsheet, CONFIG.settingsSheet, [
    ["項目", "値"],
    ["監視状態", "未開始"],
    ["最終確認日時", ""],
  ]);
  createSheetIfMissing_(spreadsheet, CONFIG.logSheet, [
    [
      "通知日時",
      "店舗ID",
      "店舗名",
      "予約日",
      "直前の空き枠",
      "現在の空き枠",
      "送信結果",
      "店舗ページ",
    ],
  ]);
  createSheetIfMissing_(spreadsheet, CONFIG.stateSheet, [
    ["店舗ID", "店舗名", "予約日", "空き枠数", "営業状態", "取得日時"],
  ]);
  if (showAlert !== false) {
    SpreadsheetApp.getUi().alert("初期シートを作成しました。");
  }
}

function setChatWebhookUrl() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Google Chat Webhook URL",
    "通知先スペースで作成したWebhook URLを貼り付けてください。",
    ui.ButtonSet.OK_CANCEL,
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const url = response.getResponseText().trim();
  if (!/^https:\/\/chat\.googleapis\.com\/v1\/spaces\//.test(url)) {
    ui.alert("Google ChatのWebhook URLを確認してください。");
    return;
  }

  PropertiesService.getScriptProperties().setProperty(
    CONFIG.webhookProperty,
    url,
  );
  sendChat_("来店予約の満席通知を接続しました。");
  ui.alert("Webhook URLを保存し、テスト通知を送信しました。");
}

function setupMonitoring() {
  setupSheets(false);
  if (!getWebhookUrl_()) {
    throw new Error("先に「Webhook URLを設定」を実行してください。");
  }

  ScriptApp.getProjectTriggers()
    .filter((trigger) =>
      [
        "checkAvailability",
        "checkMorningAvailability",
        "retryMorningAvailability",
      ].includes(
        trigger.getHandlerFunction(),
      ),
    )
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("checkAvailability")
    .timeBased()
    .everyMinutes(30)
    .create();

  ScriptApp.newTrigger("checkMorningAvailability")
    .timeBased()
    .atHour(9)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone("Asia/Tokyo")
    .create();

  ScriptApp.newTrigger("retryMorningAvailability")
    .timeBased()
    .everyMinutes(30)
    .create();

  checkAvailability(true);
  updateSetting_("監視状態", "監視中（30分ごと＋毎朝9時）");
  console.log("30分ごとの監視と、毎朝9時の午前枠確認を開始しました。");
}

function checkAvailability(silentBaseline) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    ensureSheets_();
    const response = UrlFetchApp.fetch(
      `${CONFIG.dataUrl}?t=${Date.now()}`,
      { muteHttpExceptions: true },
    );
    if (response.getResponseCode() !== 200) {
      throw new Error(`データ取得エラー: ${response.getResponseCode()}`);
    }

    const payload = JSON.parse(response.getContentText());
    const stateSheet = getSheet_(CONFIG.stateSheet);
    const previous = readPreviousState_(stateSheet);
    const fetchedAt = new Date(payload.generatedAt || Date.now());
    const checkedAt = new Date();
    const currentRows = [];
    const notifications = [];

    (payload.stores || []).forEach((storeResult) => {
      if (!storeResult.store || !Array.isArray(storeResult.dates)) return;
      const storeId = storeResult.store.id;
      const storeName = STORE_NAMES[storeId] || storeResult.store.name || storeId;

      storeResult.dates.forEach((day) => {
        const key = `${storeId}|${day.date}`;
        const currentCount = Number(day.availableCount || 0);
        const previousCount = previous.has(key)
          ? previous.get(key).availableCount
          : null;

        currentRows.push([
          storeId,
          storeName,
          day.date,
          currentCount,
          day.isOpen ? "営業" : "休業",
          fetchedAt,
        ]);

        if (
          silentBaseline !== true &&
          previousCount !== null &&
          previousCount > 0 &&
          currentCount === 0 &&
          day.isOpen &&
          !shouldSuppressNearClosing_(
            storeId,
            day.date,
            day.dayOfWeek || "",
            checkedAt,
          )
        ) {
          notifications.push({
            key,
            storeId,
            storeName,
            detailUrl: storeResult.store.detailUrl,
            reservationUrl: storeResult.store.reservationUrl,
            date: day.date,
            dayOfWeek: day.dayOfWeek || "",
            previousCount,
            currentCount,
            purpose: storeResult.purpose || payload.purpose || null,
          });
        }
      });
    });

    const failedPreviousCounts = new Map();
    notifications.forEach((event) => {
      try {
        notifyFull_(event);
      } catch (error) {
        failedPreviousCounts.set(event.key, event.previousCount);
        logNotificationFailure_(event, error);
      }
    });

    const rowsToSave = currentRows.map((row) => {
      const key = `${row[0]}|${row[2]}`;
      if (!failedPreviousCounts.has(key)) return row;
      const retryRow = [...row];
      retryRow[3] = failedPreviousCounts.get(key);
      return retryRow;
    });
    writeCurrentState_(stateSheet, rowsToSave);
    updateSetting_("最終確認日時", new Date());
  } finally {
    lock.releaseLock();
  }
}

function notifyFull_(event) {
  const targetDate = formatJapaneseDate_(event.date, event.dayOfWeek);
  const message = [
    "【予約枠・満席通知】",
    `店舗名：${event.storeName}`,
    `対象日：${targetDate}`,
    `来店目的：${formatPurpose_(event.purpose)}`,
    "この日の予約枠が満席になりました。",
    `空き枠：${event.previousCount}枠 → 0枠`,
    `公式予約ページ：${event.reservationUrl || event.detailUrl}`,
    `確認: ${CONFIG.siteUrl}`,
  ].join("\n");

  const result = sendChat_(message);
  try {
    getSheet_(CONFIG.logSheet).appendRow([
      new Date(),
      event.storeId,
      event.storeName,
      event.date,
      event.previousCount,
      event.currentCount,
      result,
      event.reservationUrl || event.detailUrl || "",
    ]);
  } catch (error) {
    console.error(`通知ログ記録エラー: ${errorMessage_(error)}`);
  }
}

function logNotificationFailure_(event, error) {
  try {
    getSheet_(CONFIG.logSheet).appendRow([
      new Date(),
      event.storeId,
      event.storeName,
      event.date,
      event.previousCount,
      event.currentCount,
      `送信失敗・次回再試行: ${errorMessage_(error)}`,
      event.reservationUrl || event.detailUrl || "",
    ]);
  } catch (logError) {
    console.error(`送信失敗ログ記録エラー: ${errorMessage_(logError)}`);
  }
}

function retryMorningAvailability() {
  const currentTime = Utilities.formatDate(
    new Date(),
    "Asia/Tokyo",
    "HH:mm",
  );
  if (currentTime < "09:00" || currentTime >= "12:00") return;
  checkMorningAvailability();
}

function checkMorningAvailability() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    ensureSheets_();
    const today = Utilities.formatDate(
      new Date(),
      "Asia/Tokyo",
      "yyyy-MM-dd",
    );
    const properties = PropertiesService.getScriptProperties();

    const response = UrlFetchApp.fetch(
      `${CONFIG.dataUrl}?t=${Date.now()}`,
      { muteHttpExceptions: true },
    );
    if (response.getResponseCode() !== 200) {
      throw new Error(`データ取得エラー: ${response.getResponseCode()}`);
    }

    const payload = JSON.parse(response.getContentText());
    const fetchedAt = new Date(payload.generatedAt || 0);
    const matchedStores = [];
    const evaluatedStoreIds = [];

    (payload.stores || []).forEach((storeResult) => {
      if (!storeResult.store || !Array.isArray(storeResult.dates)) return;
      const storeId = storeResult.store.id;
      const checkProperty = `${CONFIG.morningCheckPropertyPrefix}${storeId}`;
      if (properties.getProperty(checkProperty) === today) return;
      if (!isFreshForMorningCheck_(storeId, fetchedAt, today)) return;

      const day = storeResult.dates.find((item) => item.date === today);
      if (!day || !Array.isArray(day.slots)) return;
      evaluatedStoreIds.push(storeId);
      if (!day.isOpen) return;

      const openingHour = STORE_OPENING_HOURS[storeId] || 10;
      const openingTime = `${String(openingHour).padStart(2, "0")}:00`;
      const morningSlots = day.slots.filter(
        (slot) => slot.time >= openingTime && slot.time <= "11:45",
      );
      if (
        morningSlots.length > 0 &&
        morningSlots.every((slot) => slot.status === "full")
      ) {
        matchedStores.push({
          id: storeId,
          name: STORE_NAMES[storeId] || storeResult.store.name || storeId,
          detailUrl: storeResult.store.detailUrl || "",
          reservationUrl: storeResult.store.reservationUrl || "",
          dayOfWeek: day.dayOfWeek || "",
          purpose: storeResult.purpose || payload.purpose || null,
        });
      }
    });

    if (matchedStores.length > 0) {
      const targetDate = formatJapaneseDate_(
        today,
        matchedStores[0].dayOfWeek,
      );
      const storeLines = matchedStores.reduce((lines, store) => {
        lines.push(`・${store.name}`);
        lines.push(`  測定条件：${formatPurpose_(store.purpose)}`);
        lines.push(
          `  公式予約ページ：${store.reservationUrl || store.detailUrl}`,
        );
        return lines;
      }, []);
      const message = [
        "【午前中予約枠・確認通知】",
        `対象日：${targetDate}`,
        "対象店舗：",
        ...storeLines,
        "",
        "午前中（11:45まで）の予約枠が0のため確認してください。",
      ].join("\n");

      const result = sendChat_(message);
      matchedStores.forEach((store) => {
        try {
          getSheet_(CONFIG.logSheet).appendRow([
            new Date(),
            store.id,
            store.name,
            today,
            "",
            0,
            `午前確認通知・${result}`,
            store.reservationUrl || store.detailUrl,
          ]);
        } catch (error) {
          console.error(`午前通知ログ記録エラー: ${errorMessage_(error)}`);
        }
      });
    }

    evaluatedStoreIds.forEach((storeId) => {
      properties.setProperty(
        `${CONFIG.morningCheckPropertyPrefix}${storeId}`,
        today,
      );
    });
  } finally {
    lock.releaseLock();
  }
}

function sendChat_(text) {
  const webhookUrl = getWebhookUrl_();
  if (!webhookUrl) {
    throw new Error("Google Chat Webhook URLが未設定です。");
  }

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: "post",
    contentType: "application/json; charset=UTF-8",
    payload: JSON.stringify({ text }),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(`Google Chat通知エラー: ${code}`);
  }
  return "送信済み";
}

function getWebhookUrl_() {
  return PropertiesService.getScriptProperties().getProperty(
    CONFIG.webhookProperty,
  );
}

function readPreviousState_(sheet) {
  const values = sheet.getDataRange().getValues();
  const result = new Map();
  values.slice(1).forEach((row) => {
    if (!row[0] || !row[2]) return;
    result.set(`${row[0]}|${formatDate_(row[2])}`, {
      availableCount: Number(row[3] || 0),
    });
  });
  return result;
}

function writeCurrentState_(sheet, rows) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 6).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 6).setValues(rows);
    sheet.getRange(2, 3, rows.length, 1).setNumberFormat("yyyy-mm-dd");
    sheet.getRange(2, 6, rows.length, 1).setNumberFormat(
      "yyyy-mm-dd hh:mm:ss",
    );
  }
}

function updateSetting_(label, value) {
  const sheet = getSheet_(CONFIG.settingsSheet);
  const labels = sheet.getRange("A1:A20").getValues().flat();
  const index = labels.indexOf(label);
  if (index >= 0) {
    const cell = sheet.getRange(index + 1, 2);
    cell.setValue(value);
    if (value instanceof Date) cell.setNumberFormat("yyyy-mm-dd hh:mm:ss");
  }
}

function ensureSheets_() {
  const spreadsheet = SpreadsheetApp.getActive();
  if (
    !spreadsheet.getSheetByName(CONFIG.settingsSheet) ||
    !spreadsheet.getSheetByName(CONFIG.logSheet) ||
    !spreadsheet.getSheetByName(CONFIG.stateSheet)
  ) {
    setupSheets(false);
  }
}

function createSheetIfMissing_(spreadsheet, name, rows) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.setFrozenRows(1);
  }
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error(`シート「${name}」が見つかりません。`);
  return sheet;
}

function formatDate_(value) {
  return Utilities.formatDate(new Date(value), "Asia/Tokyo", "yyyy-MM-dd");
}

function formatJapaneseDate_(date, dayOfWeek) {
  const formatted = Utilities.formatDate(
    new Date(`${date}T00:00:00+09:00`),
    "Asia/Tokyo",
    "yyyy年M月d日",
  );
  return dayOfWeek ? `${formatted}（${dayOfWeek}）` : formatted;
}

function errorMessage_(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatPurpose_(purpose) {
  if (!purpose) return "機種変更＋データ移行（35分）";
  const duration = Number(purpose.durationMinutes || 0);
  return duration > 0
    ? `${purpose.label}（${duration}分）`
    : String(purpose.label || "機種変更＋データ移行");
}

function isFreshForMorningCheck_(storeId, fetchedAt, today) {
  if (!(fetchedAt instanceof Date) || Number.isNaN(fetchedAt.getTime())) {
    return false;
  }

  // 9時開店店舗は、開店前の空き枠表示が開店後に変わることがあるため、
  // 当日9時以降に取得されたデータが届くまで30分ごとの再確認に回す。
  if ((STORE_OPENING_HOURS[storeId] || 10) !== 9) return true;

  const fetchedDate = Utilities.formatDate(
    fetchedAt,
    "Asia/Tokyo",
    "yyyy-MM-dd",
  );
  const fetchedTime = Utilities.formatDate(fetchedAt, "Asia/Tokyo", "HH:mm");
  return fetchedDate === today && fetchedTime >= "09:00";
}

function shouldSuppressNearClosing_(storeId, date, dayOfWeek, now) {
  const today = Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd");
  if (date !== today) return false;

  const hours = STORE_CLOSING_HOURS[storeId];
  if (!hours) return false;

  const isWeekend = dayOfWeek === "土" || dayOfWeek === "日";
  const closingHour = isWeekend ? hours.weekend : hours.weekday;
  const currentTime = Utilities.formatDate(now, "Asia/Tokyo", "HH:mm");
  const [hour, minute] = currentTime.split(":").map(Number);
  const currentMinutes = hour * 60 + minute;

  return currentMinutes >= closingHour * 60 - 60;
}
