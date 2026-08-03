import type { Metadata } from "next";
import { Cairo, Tajawal } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "منصة تفريغ وتنسيق الفيديو",
  description: "تفريغ فيديوهات يوتيوب وتنسيقها باستخدام الذكاء الاصطناعي",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} ${tajawal.variable} font-cairo antialiased bg-background text-foreground min-h-screen`}
      >
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster />
          <SonnerToaster position="top-center" dir="rtl" />
        </Providers>
      </body>
    </html>
  );
}
