import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

const context = await browser.newContext({
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
});
const page = await context.newPage();

page.on("response", async (response) => {
  if (!response.url().includes("/obs/services/api/")) return;
  let body = "";
  try {
    body = await response.text();
  } catch {}
  console.log(
    JSON.stringify({
      status: response.status(),
      url: response.url(),
      body: body.slice(0, 500),
    }),
  );
});

await page.goto(
  "https://visit-reservation.mb.softbank.jp/obs/services/doEuRegistSso?shopId=RA02",
  { waitUntil: "domcontentloaded" },
);
await page.locator("#inner_contents_01").waitFor({ state: "visible" });
await page.locator('label[for="workGrp_20"]').click();
await page.locator('label[for="SP_support_01"]').click();
console.log(
  await page.evaluate(() => ({
    groupChecked: document.querySelector("#workGrp_20")?.checked,
    supportChecked: document.querySelector("#SP_support_01")?.checked,
    nextDisabled: document.querySelector("#page0_next_button")?.disabled,
    nextClass: document.querySelector("#page0_next_button")?.className,
  })),
);
await page.locator("#page0_next_button").click();
await page.waitForTimeout(12_000);

console.log(
  await page.evaluate(() => ({
    currentSlide: document.querySelector(".slick-current")?.id,
    visibleErrors: Array.from(
      document.querySelectorAll(".error, [class*=error]"),
    )
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => element.textContent?.trim())
      .filter(Boolean),
  })),
);

console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const stored = sessionStorage.getItem("API_getShopRemainBlock");
      const data = stored ? JSON.parse(stored) : null;
      return data?.responseGetShopRemainBlockDto?.shopBlockInfoDtoList?.[0]
        ?.dailyBlockInfoDtoList;
    }),
    null,
    2,
  ),
);

await browser.close();
