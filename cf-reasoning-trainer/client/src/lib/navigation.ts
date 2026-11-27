export const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/today", label: "Today's Training", icon: "today" },
  { href: "/reasoning", label: "Reasoning Profile", icon: "reasoning" },
  { href: "/progress", label: "Progress and History", icon: "progress" },
  { href: "/settings", label: "Training Settings", icon: "settings" },
] as const;

export type TrainingRoute = (typeof navigation)[number]["href"];
