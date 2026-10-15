"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Label } from "@/components/atoms/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { ArrowRight, Lock, Mail, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get("tab") === "register" ? "register" : "login"
  const [activeTab, setActiveTab] = React.useState<string>(defaultTab)

  // Login form state
  const [loginEmail, setLoginEmail] = React.useState("")
  const [loginPassword, setLoginPassword] = React.useState("")
  const [isLoggingIn, setIsLoggingIn] = React.useState(false)
  const [loginError, setLoginError] = React.useState<string | null>(null)

  // Register form state
  const [regEmail, setRegEmail] = React.useState("")
  const [regPassword, setRegPassword] = React.useState("")
  const [regConfirmPassword, setRegConfirmPassword] = React.useState("")
  const [isRegistering, setIsRegistering] = React.useState(false)
  const [regError, setRegError] = React.useState<string | null>(null)
  const [regSuccess, setRegSuccess] = React.useState<string | null>(null)

  const supabase = createClient()

  // Tangani Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setIsLoggingIn(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      })

      if (error) {
        setLoginError(
          error.message === "Invalid login credentials"
            ? "Email atau kata sandi keliru. Coba periksa kembali."
            : error.message
        )
        return
      }

      if (data.session) {
        router.push("/")
        router.refresh()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal masuk ke akun"
      setLoginError(message)
    } finally {
      setIsLoggingIn(false)
    }
  }

  // Tangani Register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError(null)
    setRegSuccess(null)

    if (regPassword.length < 6) {
      setRegError("Kata sandi minimal 6 karakter.")
      return
    }

    if (regPassword !== regConfirmPassword) {
      setRegError("Konfirmasi kata sandi tidak cocok.")
      return
    }

    setIsRegistering(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: regEmail.trim(),
        password: regPassword,
      })

      if (error) {
        setRegError(error.message)
        return
      }

      if (data.user && data.session) {
        router.push("/")
        router.refresh()
      } else {
        setRegSuccess("Akun berhasil dibuat. Silakan masuk menggunakan email dan sandi tadi.")
        setActiveTab("login")
        setLoginEmail(regEmail)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Pendaftaran gagal"
      setRegError(message)
    } finally {
      setIsRegistering(false)
    }
  }

  return (
    <Card className="border-border/80 shadow-sm bg-card">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-6 pt-4 pb-0">
          <TabsList className="grid grid-cols-2 w-full h-9">
            <TabsTrigger value="login" className="text-xs font-semibold cursor-pointer">
              Masuk
            </TabsTrigger>
            <TabsTrigger value="register" className="text-xs font-semibold cursor-pointer">
              Daftar Baru
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab: LOGIN */}
        <TabsContent value="login" className="mt-0">
          <form onSubmit={handleLogin}>
            <CardHeader className="pt-4 pb-2">
              <CardTitle className="text-base">Masuk ke Akun</CardTitle>
              <CardDescription className="text-xs">
                Lanjutkan kelola draf dan postingan di semua blog Anda.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-3.5 pt-2 pb-4">
              {loginError && (
                <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {regSuccess && (
                <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{regSuccess}</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-email" className="text-xs">Email</Label>
                <div className="relative">
                  <Mail className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="nama@domain.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    className="pl-8 h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password" className="text-xs">Kata Sandi</Label>
                </div>
                <div className="relative">
                  <Lock className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="pl-8 h-9 text-xs"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-0 pb-6 flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full h-9 text-xs font-semibold cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xs"
                disabled={isLoggingIn}
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Memeriksa akun...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk ke Dashboard</span>
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </TabsContent>

        {/* Tab: REGISTER */}
        <TabsContent value="register" className="mt-0">
          <form onSubmit={handleRegister}>
            <CardHeader className="pt-4 pb-2">
              <CardTitle className="text-base">Bikin Akun Baru</CardTitle>
              <CardDescription className="text-xs">
                Mulai atur posting artikel otomatis ke website WordPress Anda.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-3.5 pt-2 pb-4">
              {regError && (
                <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-email" className="text-xs">Email</Label>
                <div className="relative">
                  <Mail className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="nama@domain.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    className="pl-8 h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-password" className="text-xs">Kata Sandi</Label>
                <div className="relative">
                  <Lock className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder="Minimal 6 karakter"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    className="pl-8 h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reg-confirm" className="text-xs">Ulangi Kata Sandi</Label>
                <div className="relative">
                  <Lock className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    id="reg-confirm"
                    type="password"
                    placeholder="Ketik ulang kata sandi di atas"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    required
                    className="pl-8 h-9 text-xs"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-0 pb-6 flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full h-9 text-xs font-semibold cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xs"
                disabled={isRegistering}
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Mendaftarkan akun...</span>
                  </>
                ) : (
                  <>
                    <span>Daftar Sekarang</span>
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </TabsContent>
      </Tabs>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md flex flex-col gap-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="size-12 rounded-xl overflow-hidden flex items-center justify-center bg-card shadow-xs border border-border/80 p-1">
            <Image
              src="/assets/panitera-favicon.png"
              alt="Panitera Logo"
              width={40}
              height={40}
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Panitera</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Publishing Desk &bull; Platform Penerbitan WordPress Multi-Situs
            </p>
          </div>
        </div>

        <React.Suspense fallback={
          <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Memuat formulir...</span>
          </div>
        }>
          <AuthForm />
        </React.Suspense>

        {/* Footer info */}
        <p className="text-center text-[11px] text-muted-foreground">
          Data akun dan kredensial website Anda dienkripsi secara aman
        </p>
      </div>
    </div>
  )
}
