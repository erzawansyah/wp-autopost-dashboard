"use client"

import * as React from "react"
import Link from "next/link"
import {
  BookOpen,
  Globe,
  PenLine,
  Layers,
  Sparkles,
  Bot,
  Key,
  Wrench,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  FileCode2,
  CalendarClock,
  ArrowRight,
} from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/atoms/card"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/atoms/tabs"

export default function DocsPage() {
  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Pusat Bantuan &amp; Dokumentasi"
          description="Panduan lengkap penggunaan platform WP Autopost Dashboard, konfigurasi WordPress, arsitektur agen AI, dan integrasi API."
          icon={BookOpen}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs cursor-pointer">
                <Link href="/settings/keys">
                  <Key className="size-3.5 text-primary" />
                  <span>Kelola Kunci API</span>
                </Link>
              </Button>
              <Button size="sm" asChild className="gap-1.5 text-xs cursor-pointer font-semibold shadow-xs">
                <Link href="/posts/new">
                  <PenLine className="size-3.5" />
                  <span>Mulai Tulis Artikel</span>
                </Link>
              </Button>
            </div>
          }
        />

        {/* Hero Quick Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-border/80 bg-card/90 shadow-2xs hover:border-primary/40 transition-colors">
            <CardHeader className="p-4 pb-2">
              <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Globe className="size-4" />
              </div>
              <CardTitle className="text-sm font-semibold text-foreground">1. Hubungkan WordPress</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Koneksi zero-plugin menggunakan WP REST API &amp; Application Passwords standar.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <Link
                href="/sites"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 mt-1"
              >
                <span>Buka Menu Website</span>
                <ChevronRight className="size-3" />
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90 shadow-2xs hover:border-primary/40 transition-colors">
            <CardHeader className="p-4 pb-2">
              <div className="size-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2">
                <Bot className="size-4" />
              </div>
              <CardTitle className="text-sm font-semibold text-foreground">2. Atur Persona Agen</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Rancang workflow dan persona kepenulisan mandiri tanpa engine kaku.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <Link
                href="/agents"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 mt-1"
              >
                <span>Kelola Profil Agen</span>
                <ChevronRight className="size-3" />
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90 shadow-2xs hover:border-primary/40 transition-colors">
            <CardHeader className="p-4 pb-2">
              <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                <Sparkles className="size-4" />
              </div>
              <CardTitle className="text-sm font-semibold text-foreground">3. Penulisan &amp; Gutenberg</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Naskah otomatis dibersihkan dari slop AI dan diformat ke blok Gutenberg resmi.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <Link
                href="/posts/new"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 mt-1"
              >
                <span>Coba Tulis Cepat</span>
                <ChevronRight className="size-3" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Documentation Tabs */}
        <Tabs defaultValue="onboarding" className="w-full">
          <TabsList className="h-9 p-1 bg-muted/60 border border-border/80 rounded-lg gap-1 mb-6 flex flex-wrap">
            <TabsTrigger value="onboarding" className="text-xs h-7 px-3 data-[state=active]:bg-background">
              Koneksi WordPress
            </TabsTrigger>
            <TabsTrigger value="writer" className="text-xs h-7 px-3 data-[state=active]:bg-background">
              Sistem Writer &amp; Agen
            </TabsTrigger>
            <TabsTrigger value="formatting" className="text-xs h-7 px-3 data-[state=active]:bg-background">
              Formatting &amp; Gutenberg
            </TabsTrigger>
            <TabsTrigger value="taxonomy" className="text-xs h-7 px-3 data-[state=active]:bg-background">
              Author &amp; Taksonomi
            </TabsTrigger>
            <TabsTrigger value="tools" className="text-xs h-7 px-3 data-[state=active]:bg-background">
              AI WP Tools
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Koneksi WordPress */}
          <TabsContent value="onboarding" className="space-y-4">
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="size-4 text-emerald-500" />
                  <span>Prinsip Zero-Friction Onboarding</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Aplikasi ini terhubung langsung ke WordPress melalui REST API standar tanpa memerlukan plugin custom pihak ketiga.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs text-foreground/90">
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">Langkah Membuat Application Password di WordPress:</h4>
                  <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
                    <li>Masuk ke Dashboard WordPress website Anda (<code className="font-mono bg-muted px-1 rounded text-foreground">wp-admin</code>).</li>
                    <li>Buka menu <strong className="text-foreground">Users &gt; Profile</strong> (atau Pengguna &gt; Profil).</li>
                    <li>Gulir ke bawah hingga menemukan bagian <strong className="text-foreground">Application Passwords</strong>.</li>
                    <li>Ketikkan nama aplikasi, misalnya: <code className="font-mono bg-muted px-1 rounded text-foreground">WP Autopost Dashboard</code>.</li>
                    <li>Klik tombol <strong className="text-foreground">Add New Application Password</strong>.</li>
                    <li>Salin string sandi yang dihasilkan (biasanya terdiri dari 4 kelompok 4 karakter, misal: <code className="font-mono bg-muted px-1 rounded text-foreground">xxxx yyyy zzzz wwww</code>).</li>
                    <li>Buka menu <Link href="/sites" className="text-primary hover:underline font-semibold">Daftar Website</Link> di dashboard ini, klik <strong className="text-foreground">Tambah Website</strong>, lalu masukkan URL, Username, dan Application Password tersebut.</li>
                  </ol>
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-muted-foreground">
                  <strong className="text-foreground block mb-1">Catatan Keamanan:</strong>
                  Seluruh kredensial Application Password dienkripsi dengan standar militer AES-256-GCM di database Supabase dan hanya didekripsi di sisi server sesaat sebelum panggilan REST API.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Sistem Writer & Agen */}
          <TabsContent value="writer" className="space-y-4">
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Bot className="size-4 text-primary" />
                  <span>Arsitektur Agent Profile Runtime</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Platform menggunakan ekosistem LangChain &amp; LangGraph untuk mengeksekusi pipeline riset dan penulisan mandiri.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs text-muted-foreground">
                <p>
                  Setiap profil agen memiliki kebebasan memilih tools yang diinginkan (pencarian web, inspeksi baca URL, pencarian gambar SearxNG/Pexafy, taksonomi WordPress) serta kustomisasi alur kerja melalui <strong className="text-foreground">Workflow Prompt</strong>.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg border border-border/70 bg-muted/20">
                    <h5 className="font-semibold text-foreground mb-1">Preset Tersedia:</h5>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Quick Writer:</strong> Penulisan kilat langsung dengan model Llama 3.3.</li>
                      <li><strong>Research Writer:</strong> Melakukan riset web sebelum menyusun artikel.</li>
                      <li><strong>Deep Investigative:</strong> Eksekusi multi-langkah mendalam dengan grounding data.</li>
                    </ul>
                  </div>

                  <div className="p-3 rounded-lg border border-border/70 bg-muted/20">
                    <h5 className="font-semibold text-foreground mb-1">Proteksi Keandalan:</h5>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Anti-Loop Guard:</strong> Mencegah looping panggilan tool berulang kali.</li>
                      <li><strong>Emergency Finalize:</strong> Menjamin naskah tuntas jika waktu/kuota hampir habis.</li>
                      <li><strong>Dual-Mode Parser:</strong> Ekstraksi aman format Markdown maupun JSON.</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: Formatting & Gutenberg */}
          <TabsContent value="formatting" className="space-y-4">
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="size-4 text-amber-500" />
                  <span>Hidden Global Formatting &amp; Gutenberg Blocks</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Sistem pembersihan dan standardisasi format berjalan 100% otomatis di latar belakang tanpa membebani instruksi prompt pengguna.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted-foreground">
                <p>
                  Anda cukup memfokuskan prompt agen pada persona, gaya bahasa, dan sudut pandang. Seluruh naskah yang dihasilkan AI akan melewati mesin pemformatan otomatis:
                </p>

                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Eliminasi Preamble &amp; Outro:</strong> Membuang basa-basi percakapan seperti <em>&quot;Tentu, berikut adalah draf artikel...&quot;</em> atau <em>&quot;Semoga artikel ini bermanfaat!&quot;</em>.</li>
                  <li><strong>Normalisasi Heading:</strong> Menghapus baris H1 di awal body (karena judul post di-render otomatis oleh tema WordPress) dan menurunkan seluruh H1 liar menjadi H2.</li>
                  <li><strong>Sanitasi Atribusi:</strong> Membersihkan kebocoran teks byline seperti <em>&quot;Penulis: ...&quot;</em> atau section <em>&quot;Tentang Penulis&quot;</em>.</li>
                  <li><strong>Pembersihan Gambar Palsu:</strong> Membuang tautan gambar fiktif/placeholder yang dihalusinasikan model AI.</li>
                  <li><strong>Native Gutenberg Serialization:</strong> Mengubah naskah ke blok resmi WordPress Gutenberg (<code className="font-mono text-[10px] bg-muted px-1 rounded">&lt;!-- wp:heading --&gt;</code>, <code className="font-mono text-[10px] bg-muted px-1 rounded">&lt;!-- wp:paragraph --&gt;</code>, <code className="font-mono text-[10px] bg-muted px-1 rounded">&lt;!-- wp:quote --&gt;</code>, dll.).</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Author & Taksonomi */}
          <TabsContent value="taxonomy" className="space-y-4">
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileCode2 className="size-4 text-primary" />
                  <span>Pre-Writing Resolution (Author &amp; Kategori)</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Mekanisme validasi taksonomi sebelum agen mulai menulis artikel.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted-foreground">
                <p>
                  Untuk memastikan artikel tidak gagal diterbitkan karena error <em>&quot;Invalid author ID&quot;</em>:
                </p>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Sistem menghubungi REST API WordPress target untuk mengambil daftar author terdaftar.</li>
                  <li>Memilih author yang valid, mengambil nama serta bio keahlian (E-E-A-T persona), dan menyuntikkannya ke prompt penulisan.</li>
                  <li>Mengunci ID author asli sehingga pengiriman artikel ke WordPress selalu berhasil 100%.</li>
                  <li>Mencocokkan kata kunci secara otomatis dengan kategori dan tag WordPress yang relevan.</li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: AI WP Tools */}
          <TabsContent value="tools" className="space-y-4">
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wrench className="size-4 text-primary" />
                  <span>WP Tools Suite (/tools)</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Alat bantu cerdas bertenaga AI yang terhubung langsung ke WordPress melalui REST API.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-border/70 bg-card">
                  <h5 className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
                    <span>Link Building AI</span>
                  </h5>
                  <p className="text-muted-foreground mb-2">
                    Mencari artikel lama yang sudah terbit di WordPress dan menyisipkan tautan ke artikel baru secara kontekstual.
                  </p>
                  <Link href="/tools/link-building" className="text-primary hover:underline font-semibold flex items-center gap-1">
                    <span>Buka Link Building</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>

                <div className="p-3 rounded-lg border border-border/70 bg-card">
                  <h5 className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
                    <span>Author Creator</span>
                  </h5>
                  <p className="text-muted-foreground mb-2">
                    Menganalisis author yang sudah ada dan merancang persona E-E-A-T baru dengan persetujuan satu klik ke WP.
                  </p>
                  <Link href="/tools/authors" className="text-primary hover:underline font-semibold flex items-center gap-1">
                    <span>Buka Author Creator</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>

                <div className="p-3 rounded-lg border border-border/70 bg-card">
                  <h5 className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
                    <span>Category Designer</span>
                  </h5>
                  <p className="text-muted-foreground mb-2">
                    Membaca struktur taksonomi aktif dan merancang kategori SEO baru yang non-overlapping untuk diterbitkan masal.
                  </p>
                  <Link href="/tools/categories" className="text-primary hover:underline font-semibold flex items-center gap-1">
                    <span>Buka Category Designer</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  )
}
