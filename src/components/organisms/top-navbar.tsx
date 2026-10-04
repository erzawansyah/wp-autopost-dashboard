"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Globe, LogOut, Plus, Command } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { ModeToggle } from "@/components/molecules/mode-toggle"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu"

interface TopNavbarProps {
  selectedSite?: string
  onSelectSite?: (siteId: string) => void
}

export function TopNavbar({
  selectedSite = "all",
  onSelectSite,
}: TopNavbarProps) {
  const router = useRouter()
  const [currentUser, setCurrentUser] = React.useState<{ id: string; email: string } | null>(null)
  const [sites, setSites] = React.useState<Array<{ id: string; site_name: string }>>([])

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setCurrentUser(data.user)
        }
      })
      .catch(() => {})

    fetch("/api/sites")
      .then((res) => res.json())
      .then((data) => {
        if (data.sites) {
          setSites(data.sites)
        }
      })
      .catch(() => {})
  }, [])

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" })
      router.push("/login")
      router.refresh()
    } catch {
      router.push("/login")
    }
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[68px] items-center justify-between gap-4 border-b border-border/80 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      {/* Left: Global Site Selector & Context */}
      <div className="flex items-center gap-3">
        <Select
          value={selectedSite}
          onValueChange={(val) => onSelectSite && onSelectSite(val)}
        >
          <SelectTrigger className="h-9 w-44 border-border/80 bg-card text-xs font-semibold shadow-2xs sm:w-52">
            <SelectValue placeholder="Semua Website" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Website</SelectItem>
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.site_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Right: Actions & User Controls */}
      <div className="flex items-center gap-2.5">
        <Button asChild size="sm" className="hidden cursor-pointer gap-1.5 bg-primary text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 sm:flex">
          <Link href="/posts/new"><Plus className="size-3.5 text-accent" />Artikel baru</Link>
        </Button>
        <div className="hidden items-center gap-1 rounded-md border border-border/80 bg-card px-2 py-1.5 text-muted-foreground md:flex">
          <Command className="size-3" /><span className="font-mono text-[10px]">K</span>
        </div>
        <ModeToggle />

        {/* User Auth Dropdown */}
        {currentUser ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full bg-primary/10 text-primary font-bold text-xs hover:bg-primary/20 cursor-pointer"
                title={currentUser.email}
              >
                {currentUser.email.slice(0, 2).toUpperCase()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 text-xs">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-xs font-medium leading-none text-foreground">Akun</p>
                  <p className="text-[11px] leading-none text-muted-foreground truncate font-mono">
                    {currentUser.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/sites" className="flex items-center gap-2">
                  <Globe className="size-3.5" />
                  <span>Kelola Website ({sites.length})</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10 flex items-center gap-2"
              >
                <LogOut className="size-3.5" />
                <span>Keluar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="xs"
              asChild
              className="text-xs cursor-pointer"
            >
              <Link href="/login">Masuk</Link>
            </Button>
            <Button
              size="xs"
              asChild
              className="text-xs cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Link href="/login?tab=register">Daftar</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
