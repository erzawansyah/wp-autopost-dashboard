"use client";

import React, { useState, useEffect } from "react";
import {
  Globe,
  Clock,
  Sparkles,
  Calendar,
  Search,
  Filter,
  Moon,
  Sun,
  Plus,
  RefreshCw,
  LayoutGrid,
  ListFilter,
  ExternalLink,
  Check,
  Play,
  Layers,
  ChevronDown,
} from "lucide-react";

interface BatchItem {
  id: string;
  title: string;
  siteName: string;
  siteDomain: string;
  category: string;
  status:
    | "queued_input"
    | "generating_content"
    | "ready_to_sync"
    | "syncing_to_wp"
    | "published_on_wp"
    | "scheduled_on_wp"
    | "failed_generation"
    | "failed_sync";
  wordCount?: number;
  scheduledTime?: string;
  liveUrl?: string;
  aiModel?: string;
  errorMsg?: string;
}

const mockItems: BatchItem[] = [
  {
    id: "post-101",
    title: "10 Tren Arsitektur Rumah Minimalis Tropis Modern 2026",
    siteName: "Nusantara Living",
    siteDomain: "nusantaraliving.co.id",
    category: "Desain Interior",
    status: "generating_content",
    aiModel: "Claude 3.5 Sonnet",
  },
  {
    id: "post-102",
    title: "Panduan Lengkap Investasi Reksadana Syariah untuk Pemula",
    siteName: "Finansial Kita",
    siteDomain: "finansialkita.com",
    category: "Investasi",
    status: "queued_input",
    aiModel: "GPT-4o Mini",
  },
  {
    id: "post-103",
    title: "Review Toyota Hilux GR Sport 2026: Mesin Tangguh & Efisien",
    siteName: "OtomotifZone ID",
    siteDomain: "otomotifzone.id",
    category: "Otomotif",
    status: "ready_to_sync",
    wordCount: 1680,
  },
  {
    id: "post-104",
    title: "Eksplorasi Keindahan Tersembunyi Pantai Pink di Labuan Bajo",
    siteName: "Jalan Santai",
    siteDomain: "jalansantai.net",
    category: "Wisata",
    status: "scheduled_on_wp",
    wordCount: 1420,
    scheduledTime: "Besok, 09:30 WIB",
  },
  {
    id: "post-105",
    title: "Cara Konfigurasi Reverse Proxy Nginx untuk Next.js 16",
    siteName: "DevNotes ID",
    siteDomain: "devnotes.id",
    category: "DevOps",
    status: "published_on_wp",
    wordCount: 2150,
    liveUrl: "https://devnotes.id/cara-konfigurasi-nginx-nextjs",
  },
  {
    id: "post-106",
    title: "Resep Rendang Daging Sapi Empuk Bumbu Warisan Minang",
    siteName: "Dapur Rasa",
    siteDomain: "dapurrasa.co",
    category: "Kuliner",
    status: "published_on_wp",
    wordCount: 1240,
    liveUrl: "https://dapurrasa.co/resep-rendang-daging-sapi",
  },
  {
    id: "post-107",
    title: "Strategi SEO Content Velocity untuk Menembus Peringkat 1 Google",
    siteName: "MarketingHub ID",
    siteDomain: "marketinghub.id",
    category: "Digital Marketing",
    status: "failed_sync",
    wordCount: 1890,
    errorMsg: "WP REST API HTTP 403: Application Password Kadaluarsa",
  },
];

export default function Home() {
  const [isDark, setIsDark] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedSite, setSelectedSite] = useState("Semua Situs (6 Connected)");
  const [selectedItems, setSelectedItems] = useState<string[]>(["post-103", "post-104"]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const toggleSelect = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const getStatusDot = (status: BatchItem["status"]) => {
    switch (status) {
      case "queued_input":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border border-border bg-secondary text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            QUEUED
          </span>
        );
      case "generating_content":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border border-border bg-secondary text-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
            AI WRITING
          </span>
        );
      case "ready_to_sync":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border border-border bg-secondary text-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
            READY
          </span>
        );
      case "syncing_to_wp":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border border-border bg-secondary text-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-600" />
            SYNCING
          </span>
        );
      case "scheduled_on_wp":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border border-border bg-secondary text-amber-700 dark:text-amber-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            SCHEDULED
          </span>
        );
      case "published_on_wp":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border border-border bg-secondary text-emerald-700 dark:text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            PUBLISHED
          </span>
        );
      case "failed_sync":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
            WP ERROR
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-150">
      {/* =========================================================================
          TOP NAV (Clean 56px Bar)
          ========================================================================= */}
      <header className="sticky top-0 z-30 w-full border-b border-border bg-card px-4 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs tracking-wider">
              WP
            </div>
            <span className="font-semibold text-sm tracking-tight font-sans">
              Autopost Dashboard
            </span>
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Site Selector */}
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <button
              type="button"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{selectedSite}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              REST API 200 OK
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Switcher */}
          <button
            onClick={() => setIsDark(!isDark)}
            type="button"
            className="p-1.5 rounded border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* New Batch Primary Button */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Batch Baru</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          OPERATIONAL METRICS STRIP (Understated & Data-First)
          ========================================================================= */}
      <section className="border-b border-border bg-card px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Total Artikel Terbit</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tracking-tight text-foreground">
                1,428
              </span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                +18 mgg ini
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Antrean Sedang Berjalan</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tracking-tight text-foreground">
                42
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                12 AI / 30 WP
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Tingkat Keberhasilan WP</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tracking-tight text-foreground">
                99.2%
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                Throttled 2 max
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-0.5">AI Gateway (BYOK)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold font-mono text-foreground">
                OpenRouter
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                Claude 3.5 Sonnet
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          TOOLBAR (View Toggle, Filters, Search)
          ========================================================================= */}
      <section className="px-4 lg:px-8 pt-5 pb-2">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 border border-border rounded bg-secondary/50 p-0.5 text-xs">
            <button
              onClick={() => setViewMode("kanban")}
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>

            <button
              onClick={() => setViewMode("table")}
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Tabel</span>
            </button>
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul artikel..."
                className="w-full pl-8 pr-3 py-1 rounded border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-card text-xs text-muted-foreground hover:text-foreground"
            >
              <Filter className="w-3 h-3" />
              <span>Filter</span>
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          MAIN WORKSPACE CANVAS
          ========================================================================= */}
      <main className="flex-1 px-4 lg:px-8 py-3 max-w-7xl mx-auto w-full pb-24">
        {viewMode === "kanban" ? (
          /* Kanban Board */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 items-start">
            {/* Column 1: Antrean AI */}
            <div className="rounded border border-border bg-secondary/30 p-2.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-border text-xs">
                <span className="font-semibold text-foreground">Antrean AI</span>
                <span className="text-[11px] font-mono text-muted-foreground">2</span>
              </div>

              {mockItems
                .filter((item) => ["queued_input", "generating_content"].includes(item.status))
                .map((item) => (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={`p-3 rounded border bg-card text-xs transition-colors cursor-pointer ${
                      selectedItems.includes(item.id)
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                        {item.siteName}
                      </span>
                      {getStatusDot(item.status)}
                    </div>

                    <p className="font-medium text-foreground text-xs leading-snug line-clamp-2 mb-2">
                      {item.title}
                    </p>

                    {item.status === "generating_content" && (
                      <div className="mb-2">
                        <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-purple-600 w-[60%] animate-pulse" />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1.5 border-t border-border/60">
                      <span>{item.category}</span>
                      <span>{item.aiModel ? item.aiModel.split(" ")[0] : "Pending"}</span>
                    </div>
                  </div>
                ))}
            </div>

            {/* Column 2: Siap Kirim */}
            <div className="rounded border border-border bg-secondary/30 p-2.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-border text-xs">
                <span className="font-semibold text-foreground">Siap Kirim WP</span>
                <span className="text-[11px] font-mono text-muted-foreground">1</span>
              </div>

              {mockItems
                .filter((item) => item.status === "ready_to_sync")
                .map((item) => (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={`p-3 rounded border bg-card text-xs transition-colors cursor-pointer ${
                      selectedItems.includes(item.id)
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                        {item.siteName}
                      </span>
                      {getStatusDot(item.status)}
                    </div>

                    <p className="font-medium text-foreground text-xs leading-snug line-clamp-2 mb-2">
                      {item.title}
                    </p>

                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1.5 border-t border-border/60">
                      <span>{item.category}</span>
                      <span className="font-medium text-foreground">{item.wordCount} kata</span>
                    </div>
                  </div>
                ))}
            </div>

            {/* Column 3: Terjadwal */}
            <div className="rounded border border-border bg-secondary/30 p-2.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-border text-xs">
                <span className="font-semibold text-foreground">Terjadwal</span>
                <span className="text-[11px] font-mono text-muted-foreground">1</span>
              </div>

              {mockItems
                .filter((item) => item.status === "scheduled_on_wp")
                .map((item) => (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={`p-3 rounded border bg-card text-xs transition-colors cursor-pointer ${
                      selectedItems.includes(item.id)
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                        {item.siteName}
                      </span>
                      {getStatusDot(item.status)}
                    </div>

                    <p className="font-medium text-foreground text-xs leading-snug line-clamp-2 mb-2">
                      {item.title}
                    </p>

                    <div className="flex items-center justify-between text-[11px] font-mono text-amber-700 dark:text-amber-400 pt-1.5 border-t border-border/60 font-medium">
                      <span>{item.scheduledTime}</span>
                      <span>{item.wordCount} kata</span>
                    </div>
                  </div>
                ))}
            </div>

            {/* Column 4: Selesai & Kendala */}
            <div className="rounded border border-border bg-secondary/30 p-2.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-border text-xs">
                <span className="font-semibold text-foreground">Selesai / Kendala</span>
                <span className="text-[11px] font-mono text-muted-foreground">3</span>
              </div>

              {mockItems
                .filter((item) => ["published_on_wp", "failed_sync"].includes(item.status))
                .map((item) => (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)}
                    className={`p-3 rounded border bg-card text-xs transition-colors cursor-pointer ${
                      selectedItems.includes(item.id)
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-2">
                      <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                        {item.siteName}
                      </span>
                      {getStatusDot(item.status)}
                    </div>

                    <p className="font-medium text-foreground text-xs leading-snug line-clamp-2 mb-2">
                      {item.title}
                    </p>

                    {item.liveUrl && (
                      <a
                        href={item.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium mb-1.5"
                      >
                        <span>Live Post</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {item.errorMsg && (
                      <div className="p-1.5 rounded bg-red-50 dark:bg-red-950/40 text-[10px] text-red-700 dark:text-red-400 mb-1.5 font-mono">
                        {item.errorMsg}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1.5 border-t border-border/60">
                      <span>{item.category}</span>
                      <span>{item.wordCount ? `${item.wordCount} kata` : "Error"}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          /* Data Table */
          <div className="rounded border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-[11px] font-mono uppercase text-muted-foreground">
                    <th className="p-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={selectedItems.length === mockItems.length}
                        onChange={() => {
                          if (selectedItems.length === mockItems.length) {
                            setSelectedItems([]);
                          } else {
                            setSelectedItems(mockItems.map((m) => m.id));
                          }
                        }}
                        className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Judul Artikel</th>
                    <th className="p-3">Domain Target</th>
                    <th className="p-3">Kategori</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Kata</th>
                    <th className="p-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mockItems.map((item) => {
                    const isSelected = selectedItems.includes(item.id);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleSelect(item.id)}
                        className={`hover:bg-secondary/40 transition-colors cursor-pointer ${
                          isSelected ? "bg-primary-subtle/50 dark:bg-primary-subtle/20" : ""
                        }`}
                      >
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(item.id)}
                            className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-medium text-foreground max-w-sm">
                          <div className="line-clamp-1">{item.title}</div>
                          {item.errorMsg && (
                            <span className="text-[10px] text-red-600 dark:text-red-400 font-mono">
                              {item.errorMsg}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-muted-foreground">
                          {item.siteDomain}
                        </td>
                        <td className="p-3 text-muted-foreground">{item.category}</td>
                        <td className="p-3">{getStatusDot(item.status)}</td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {item.wordCount || "—"}
                        </td>
                        <td className="p-3 text-right">
                          {item.liveUrl ? (
                            <a
                              href={item.liveUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline font-medium text-xs inline-flex items-center gap-1"
                            >
                              <span>Buka</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : item.status === "failed_sync" ? (
                            <button
                              type="button"
                              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 hover:bg-red-200"
                            >
                              Retry
                            </button>
                          ) : (
                            <button type="button" className="text-muted-foreground hover:text-foreground">
                              Detail
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          STICKY BOTTOM BAR (Clean execution bar)
          ========================================================================= */}
      {selectedItems.length > 0 && (
        <aside className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 animate-in fade-in duration-150">
          <div className="rounded-lg border border-border bg-card p-2.5 shadow-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-5 h-5 rounded bg-primary text-primary-foreground font-mono font-bold text-[11px] flex items-center justify-center">
                {selectedItems.length}
              </span>
              <span className="font-medium text-foreground">
                artikel dipilih untuk diposting
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium transition-colors"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Posting Sekarang</span>
              </button>

              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-card hover:bg-secondary text-foreground text-xs font-medium transition-colors"
              >
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span>Jadwalkan</span>
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
