import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRM Bacs Blancs - Les Matinées du Bac",
  description: "Gestion des leads profs particuliers pour les bacs blancs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full bg-gray-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
