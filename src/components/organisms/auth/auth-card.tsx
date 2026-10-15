"use client"

import * as React from "react"
import { Card } from "@/components/atoms/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { LoginForm } from "./login-form"
import { RegisterForm } from "./register-form"

export type AuthTab = "login" | "register"

interface AuthCardProps {
  defaultTab: AuthTab
  /** Tujuan setelah masuk/daftar, sudah disanitasi (`resolvePostLoginPath`). */
  redirectTo: string
}

/** Kartu Masuk/Daftar (route group `(auth)`). Form memakai react-hook-form + skema `@/lib/validation/auth`. */
export function AuthCard({ defaultTab, redirectTo }: AuthCardProps) {
  const [activeTab, setActiveTab] = React.useState<AuthTab>(defaultTab)
  const [registeredEmail, setRegisteredEmail] = React.useState<string | null>(null)

  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value === "register" ? "register" : "login")} className="w-full">
        <div className="px-6 pt-4 pb-0">
          <TabsList className="grid h-9 w-full grid-cols-2">
            <TabsTrigger value="login" className="cursor-pointer text-xs font-semibold">
              Masuk
            </TabsTrigger>
            <TabsTrigger value="register" className="cursor-pointer text-xs font-semibold">
              Daftar Baru
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="login" className="mt-0">
          <LoginForm
            key={registeredEmail ?? "login"}
            redirectTo={redirectTo}
            defaultEmail={registeredEmail ?? ""}
            notice={registeredEmail ? "Akun berhasil dibuat. Silakan masuk menggunakan email dan kata sandi tadi." : null}
          />
        </TabsContent>

        <TabsContent value="register" className="mt-0">
          <RegisterForm
            redirectTo={redirectTo}
            onRegisteredWithoutSession={(email) => {
              setRegisteredEmail(email)
              setActiveTab("login")
            }}
          />
        </TabsContent>
      </Tabs>
    </Card>
  )
}
