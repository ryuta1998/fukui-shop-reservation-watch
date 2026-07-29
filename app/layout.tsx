import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "福井エリア 来店予約空き状況",
  description:
    "福井県内のソフトバンク・ワイモバイル8店舗の来店予約空き状況を確認できます。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
