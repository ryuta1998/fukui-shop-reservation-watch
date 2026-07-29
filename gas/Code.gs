const CONFIG = {
  dataUrl:
    "https://ryuta1998.github.io/fukui-shop-reservation-watch/data/availability.json",
  siteUrl: "https://ryuta1998.github.io/fukui-shop-reservation-watch/",
  settingsSheet: "設定",
  stateSheet: "監視状態",
  logSheet: "満席通知ログ",
  webhookProperty: "GOOGLE_CHAT_WEBHOOK_URL",
};

const STORE_NAMES = {
  RA02: "ソフトバンクMEGAドン・キホーテUNY敦賀",
  R306: "ソフトバンク福井工大前",
  R316: "ソフトバンク福井北",
  R311: "ソフトバンク鯖江",
  WA2L: "ワイモバイル",
  R307: "ソフトバンク大和田中央",
  R315: "ソフトバンク武生",
  R323: "ソフトバンク春江",
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("満席通知")
    .addItem("初期シートを作成", "setupSheets")
    .addItem("Webhook URLを設定", "setChatWebhookUrl")
    .addItem("30分ごとの監視を開始", "setupMonitoring")
    .addSeparator()
    .addItem("今すぐ確認", "checkAvailability")
    .addToUi();
}

function setupSheets() {
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
  SpreadsheetApp.getUi().alert("初期シートを作成しました。");
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
  setupSheets();
  const ui = SpreadsheetApp.getUi();
  if (!getWebhookUrl_()) {
    ui.alert("先に「Webhook URLを設定」を実行してください。");
    return;
  }

  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "checkAvailability")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("checkAvailability")
    .timeBased()
    .everyMinutes(30)
    .create();

  checkAvailability(true);
  updateSetting_("監視状態", "監視中（30分ごと）");
  ui.alert("初期データを保存し、30分ごとの監視を開始しました。");
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
          day.isOpen
        ) {
          notifications.push({
            storeId,
            storeName,
            detailUrl: storeResult.store.detailUrl,
            date: day.date,
            dayOfWeek: day.dayOfWeek || "",
            previousCount,
            currentCount,
          });
        }
      });
    });

    writeCurrentState_(stateSheet, currentRows);
    notifications.forEach(notifyFull_);
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
    "この日の予約枠が満席になりました。",
    `空き枠：${event.previousCount}枠 → 0枠`,
    `確認: ${CONFIG.siteUrl}`,
  ].join("\n");

  const result = sendChat_(message);
  getSheet_(CONFIG.logSheet).appendRow([
    new Date(),
    event.storeId,
    event.storeName,
    event.date,
    event.previousCount,
    event.currentCount,
    result,
    event.detailUrl || "",
  ]);
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
    setupSheets();
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
