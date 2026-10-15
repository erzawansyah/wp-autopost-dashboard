import { ShieldCheck, User } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"

interface AccountIdentityCardProps {
  userId: string
  email?: string
}

/** Ringkasan identitas akun (tenant) dari sesi server. Presentasional, aman dirender dari Server Component. */
export function AccountIdentityCard({ userId, email }: AccountIdentityCardProps) {
  return (
    <Card className="gap-4 border-border/80 shadow-2xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <User aria-hidden="true" className="size-4 text-primary" />
          Identitas Akun
        </CardTitle>
        <CardDescription className="text-xs">
          Data tenant terisolasi aman dengan Supabase Row Level Security (RLS).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          {email && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">Email</dt>
              <dd className="truncate rounded border border-border/50 bg-muted/40 p-2 text-xs text-foreground">{email}</dd>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">User ID (Tenant)</dt>
            <dd className="truncate rounded border border-border/50 bg-muted/40 p-2 font-mono text-xs text-foreground">
              {userId}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">Status Keamanan Database</dt>
            <dd className="flex items-center gap-2 rounded border border-success/30 bg-success/10 p-2 text-xs text-success-strong">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              RLS Aktif &amp; Terproteksi
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
