"use client";

import type { ReactNode } from "react";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/contexts/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

// Create once per module so we don't recreate it on every render.
const queryClient = new QueryClient();

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Drexel Special Ops - P.O. Splitter</title>
        <meta
          name="description"
          content="Automatically split Bill of Lading by PO numbers"
        />
      </head>
      <body className={`${sourceSans.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
