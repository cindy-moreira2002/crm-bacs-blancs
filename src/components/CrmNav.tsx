"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Démarchage profs particuliers & structures" },
  { href: "/ecoles-partenaires", label: "Démarchage écoles & profs" },
];

export default function CrmNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              active
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
