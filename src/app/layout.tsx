import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PlannerProvider } from "@/lib/planner-store";
import { THEME_KEY } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Due North",
  description: "Extract deadlines from syllabus PDFs and export them to your calendar.",
};

// Runs before the page paints, so a dark theme doesn't flash light first. A
// choice made with the toggle wins; otherwise the system setting decides.
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script adds the dark class before React hydrates.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <PlannerProvider>{children}</PlannerProvider>
      </body>
    </html>
  );
}
