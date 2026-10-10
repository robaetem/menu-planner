"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS } from "@/components/nav-config";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function Brand({ collapsedHidden = true }: { collapsedHidden?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo className="size-9 shrink-0 text-foreground" />
      <span className={cn("text-sm font-semibold tracking-tight", collapsedHidden && "group-data-[collapsible=icon]:hidden")}>
        Menu Planner
      </span>
    </div>
  );
}

function UserSlot({ devBypass }: { devBypass: boolean }) {
  if (devBypass) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          RA
        </div>
      </div>
    );
  }
  return <UserButton />;
}

export function AppShell({
  children,
  devBypass = false,
}: {
  children: React.ReactNode;
  devBypass?: boolean;
}) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r">
        <SidebarHeader className="h-14 shrink-0 justify-center border-b px-3 py-0">
          <Brand />
        </SidebarHeader>
        <SidebarContent className="px-2 py-3">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {NAV_ITEMS.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        tooltip={item.title}
                        className="h-11 gap-3 rounded-lg px-3 text-[0.95rem]"
                      >
                        <item.icon className="size-[1.15rem]" />
                        <span className="font-medium">{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border/60 p-3">
          <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
            <UserSlot devBypass={devBypass} />
            <ThemeToggle />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-background">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md md:px-5">
          <SidebarTrigger className="hidden md:flex" />
          <div className="md:hidden">
            <Brand collapsedHidden={false} />
          </div>
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <UserSlot devBypass={devBypass} />
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-8 md:px-7 md:pb-10 md:pt-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </SidebarInset>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div
          className="mx-auto grid max-w-md"
          style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, minmax(0, 1fr))` }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className={cn("size-5", active && "fill-primary/10")} />
                {item.title}
              </Link>
            );
          })}
        </div>
      </nav>
    </SidebarProvider>
  );
}
