"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const links = [
  { href: "#product", label: "Product" },
  { href: "#markets", label: "Markets" },
  { href: "#pricing", label: "Pricing" },
  { href: "#company", label: "Company" },
];

export function MobileNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle menu"
        className="flex size-9 items-center justify-center rounded-full border border-[#1c1d22] text-[#e2e3e9]"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 border-b border-[#1c1d22] bg-[#040406] px-6 py-6">
          <nav className="flex flex-col gap-4">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm text-[#9194a1] transition-colors hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-3 border-t border-[#1c1d22] pt-4">
              <Link
                href="/login"
                className="text-sm font-medium text-[#e2e3e9]"
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=sign-up"
                className="rounded-full bg-white px-4 py-2 text-center text-sm font-medium text-[#08080a]"
              >
                Get started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
