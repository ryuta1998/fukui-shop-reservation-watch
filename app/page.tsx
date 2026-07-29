import type { Metadata } from "next";
import { AvailabilityDashboard } from "./AvailabilityDashboard";

export const metadata: Metadata = {
  title: "福井エリア 来店予約空き状況",
  description:
    "福井県内のソフトバンク・ワイモバイル8店舗の来店予約空き状況を確認できます。",
};

export default function Home() {
  return <AvailabilityDashboard />;
}
