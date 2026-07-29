export type Store = {
  id: string;
  carrier: "softbank" | "ymobile";
  name: string;
  shortName: string;
  address: string;
  detailUrl: string;
  reservationUrl: string;
};

export const STORES: Store[] = [
  {
    id: "RA02",
    carrier: "softbank",
    name: "ソフトバンクＭＥＧＡドン・キホーテＵＮＹ敦賀",
    shortName: "敦賀",
    address: "福井県敦賀市中央町1丁目5‐5",
    detailUrl: "https://www.softbank.jp/shop/search/detail/RA02/",
    reservationUrl:
      "https://visit-reservation.mb.softbank.jp/obs/services/doEuRegistSso?shopId=RA02",
  },
  {
    id: "R306",
    carrier: "softbank",
    name: "ソフトバンク鯖江",
    shortName: "鯖江",
    address: "福井県鯖江市神中町2丁目601‐2",
    detailUrl: "https://www.softbank.jp/shop/search/detail/R306/",
    reservationUrl:
      "https://visit-reservation.mb.softbank.jp/obs/services/doEuRegistSso?shopId=R306",
  },
  {
    id: "R316",
    carrier: "softbank",
    name: "ソフトバンク鯖江中央",
    shortName: "鯖江中央",
    address: "福井県鯖江市糺町32‐6‐5",
    detailUrl: "https://www.softbank.jp/shop/search/detail/R316/",
    reservationUrl:
      "https://visit-reservation.mb.softbank.jp/obs/services/doEuRegistSso?shopId=R316",
  },
  {
    id: "R311",
    carrier: "softbank",
    name: "ソフトバンクアピタ福井大和田",
    shortName: "アピタ福井大和田",
    address: "福井県福井市大和田2丁目1230番地 アピタ福井大和田内",
    detailUrl: "https://www.softbank.jp/shop/search/detail/R311/",
    reservationUrl:
      "https://visit-reservation.mb.softbank.jp/obs/services/doEuRegistSso?shopId=R311",
  },
  {
    id: "WA2L",
    carrier: "ymobile",
    name: "ワイモバイルアピタ福井大和田",
    shortName: "Y!mobile アピタ福井大和田",
    address: "福井県福井市大和田2丁目1230番地",
    detailUrl: "https://www.ymobile.jp/shop/detail/WA2L/",
    reservationUrl:
      "https://visit-reservation.mb.softbank.jp/obs/services/doEuRegistSso?adid=SBSOBS_HP_03&shopId=WA2L&routeKbn=HP_03",
  },
  {
    id: "R307",
    carrier: "softbank",
    name: "ソフトバンク福井運動公園",
    shortName: "福井運動公園",
    address: "福井県福井市福2丁目1911",
    detailUrl: "https://www.softbank.jp/shop/search/detail/R307/",
    reservationUrl:
      "https://visit-reservation.mb.softbank.jp/obs/services/doEuRegistSso?shopId=R307",
  },
  {
    id: "R315",
    carrier: "softbank",
    name: "ソフトバンクＭＥＧＡドン・キホーテＵＮＹ福井",
    shortName: "MEGAドン・キホーテUNY福井",
    address: "福井県福井市飯塚町11‐111 MEGAドン・キホーテUNY福井1F",
    detailUrl: "https://www.softbank.jp/shop/search/detail/R315/",
    reservationUrl:
      "https://visit-reservation.mb.softbank.jp/obs/services/doEuRegistSso?shopId=R315",
  },
  {
    id: "R323",
    carrier: "softbank",
    name: "ソフトバンク二の宮",
    shortName: "二の宮",
    address: "福井県福井市二の宮2丁目3‐8",
    detailUrl: "https://www.softbank.jp/shop/search/detail/R323/",
    reservationUrl:
      "https://visit-reservation.mb.softbank.jp/obs/services/doEuRegistSso?shopId=R323",
  },
];

export const DEFAULT_STORE_ID = "RA02";

export function getStore(storeId: string) {
  return STORES.find((store) => store.id === storeId);
}
