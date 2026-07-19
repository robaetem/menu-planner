import { CalendarDays, BookOpen, Snowflake, ShoppingCart, type LucideIcon } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Planning",
    href: "/planning",
    icon: CalendarDays,
    description: "Weekmenu's & boodschappen",
  },
  {
    title: "Boodschappen",
    href: "/boodschappenlijstje",
    icon: ShoppingCart,
    description: "Je boodschappenlijstje",
  },
  {
    title: "Recepten",
    href: "/recepten",
    icon: BookOpen,
    description: "Receptendatabank",
  },
  {
    title: "Diepvries",
    href: "/diepvries",
    icon: Snowflake,
    description: "Potjes, vleesjes & groenten",
  },
];
