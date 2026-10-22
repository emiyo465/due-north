import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PlannerProvider } from "@/lib/planner-store";
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
  title: "Semester Planner",
  description: "Extract deadlines from syllabus PDFs and export them to your calendar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PlannerProvider>{children}</PlannerProvider>
      </body>
    </html>
  );
}
