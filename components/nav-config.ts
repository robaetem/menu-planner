import { CalendarDays, BookOpen, Snowflake, type LucideIcon } from "lucide-react";

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
    title: "Recepten",
    href: "/recepten",
    icon: BookOpen,
    description: "Receptendatabank",
  },
  {
    title: "Potjes",
    href: "/potjes",
    icon: Snowflake,
    description: "Diepvriesvoorraad",
  },
];
