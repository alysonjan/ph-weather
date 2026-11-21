import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Panahon — Live Philippine Weather",
  description:
    "A single-page look at the hottest and coldest places in the Philippines right now, the five-day outlook, and how close the Pacific is to a super El Niño.",
};

export const viewport: Viewport = {
  themeColor: "#05070f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH" className={`${inter.variable} ${sora.variable}`}>
      <body className="antialiased">
        {/*
          The day theme ships as its own stylesheet — loaded, but not applied.
          The script switches it on before first paint, from the stored choice
          or the OS preference. It lives off <html> on purpose: React owns the
          root element's attributes and resets anything else during hydration.
        */}
        <link rel="preload" href="/theme-day.css" as="style" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('panahon:theme');var d=s?s==='day':window.matchMedia('(prefers-color-scheme: light)').matches;var l=document.createElement('link');l.rel='stylesheet';l.href='/theme-day.css';l.id='theme-day';l.media=d?'all':'not all';document.head.appendChild(l);}catch(e){}})();",
          }}
        />
        <div className="aurora" aria-hidden="true">
          <div className="orb orb-a" />
          <div className="orb orb-b" />
          <div className="orb orb-c" />
        </div>
        {children}
      </body>
    </html>
  );
}
