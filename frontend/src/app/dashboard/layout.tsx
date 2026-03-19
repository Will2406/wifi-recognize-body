"use client";

import { Navbar } from "@/components/dashboard/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-primary">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
