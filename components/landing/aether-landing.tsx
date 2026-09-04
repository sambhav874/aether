"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bot, ChartNoAxesCombined, Check, LockKeyhole, Menu, Moon, Radio, ShieldCheck, SlidersHorizontal, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ibmPlexMono, ibmPlexSans } from "@/components/landing/fonts";
import { ConsolePreview, RouteDiagram } from "@/components/landing/landing-visuals";
import { SignalRouter } from "@/components/landing/signal-router";
import { useLandingMotion } from "@/components/landing/landing-motion";

const navLinks = [
  { href: "#product", label: "Product" },
  { href: "#markets", label: "Markets" },
  { href: "#research", label: "Research" },
  { href: "#security", label: "Security" },
];

const capabilities = [
  { number: "01", icon: SlidersHorizontal, title: "Strategy engine", body: "Build AUTO, MANUAL, or BY STRATEGY execution flows with cooldowns, daily caps, risk settings, partial exits, and trailing rules." },
  { number: "02", icon: Radio, title: "Signal dispatch", body: "Receive signals from TradingView or a direct webhook. Aether validates the payload, records the event, then routes it through the right adapter." },
  { number: "03", icon: ShieldCheck, title: "Live risk console", body: "See open positions, exposure, P&L, and account health together. Risk checks happen before an order leaves the workspace." },
  { number: "04", icon: Bot, title: "Research copilot", body: "Move from a ticker to fundamentals, news, heatmaps, and AI-assisted analysis without leaving the operating picture." },
  { number: "05", icon: ChartNoAxesCombined, title: "Unified performance", body: "Reconcile positions and results across connected broker accounts into one performance view for the whole workspace." },
  { number: "06", icon: LockKeyhole, title: "Controlled access", body: "Workspace roles and per-strategy permissions keep execution narrow, credentials encrypted, and every important action auditable." },
];

const tickerItems = [
  "AETHER / MONARCH",
  "STRATEGY \u2192 RISK \u2192 BROKER",
  "FOREX / INDIA EQUITY / INDIA OPTIONS",
  "RESEARCH / PERFORMANCE / CONTROL",
];

const markets = [
  { code: "FX", name: "Forex", detail: "Multiple providers & expanding" },
  { code: "FO", name: "Indian Options", detail: "Multiple providers & expanding" },
  { code: "EQ", name: "Indian Equity", detail: "Multiple providers & expanding" },
];

function MobileMenu() {
  const [open, setOpen] = React.useState(false);
  return <div className="md:hidden">
    <button type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex size-11 items-center justify-center border border-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8102e]">{open ? <X className="size-4" /> : <Menu className="size-4" />}</button>
    {open ? <div className="absolute inset-x-4 top-[calc(100%+8px)] border border-black/15 bg-[#f3f1ed] p-3 shadow-[8px_8px_0_#c8102e]">{navLinks.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center border-b border-black/10 px-3 text-sm last:border-0">{link.label}</a>)}<Link href="/login" className="mt-3 flex min-h-11 items-center justify-between bg-[#111111] px-3 text-sm text-[#f3f1ed]">Enter Aether <ArrowUpRight className="size-4" /></Link></div> : null}
  </div>;
}

/**
 * True only once the client has hydrated. useSyncExternalStore gives React an
 * explicit server snapshot, so this is hydration-safe in a way a
 * setState-in-useEffect mount flag is not (and doesn't trip
 * react-hooks/set-state-in-effect).
 */
function useMounted() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label="Toggle color theme"
      // next-themes can't know the theme during SSR, so it resolves to
      // undefined there and to the real value after mount. Emitting the
      // attribute before then hydrates "false" over a "true" button. Leaving it
      // off until mounted keeps server and first client render identical; the
      // icons don't need it, they swap via CSS `dark:` variants.
      aria-pressed={mounted ? isDark : undefined}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex size-11 items-center justify-center border border-black/15 text-black/60 transition-colors hover:border-[#c8102e] hover:text-[#c8102e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8102e] dark:border-white/15 dark:text-white/60"
    >
      <Moon className="size-4 dark:hidden" aria-hidden />
      <Sun className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}

export function AetherLanding() {
  const root = React.useRef<HTMLDivElement>(null);
  useLandingMotion(root);
  return <div ref={root} className={cn(ibmPlexSans.variable, ibmPlexMono.variable, "aether-landing relative isolate overflow-hidden bg-[#f3f1ed] text-[#111111] [font-family:var(--font-landing-sans)]")}>
    <div className="pointer-events-none fixed inset-y-0 left-0 z-30 hidden w-12 border-r border-black/10 bg-[#f3f1ed] lg:block" aria-hidden><div className="flex h-full flex-col items-center justify-between py-7 font-mono text-[9px] tracking-[0.2em] text-black/45 [writing-mode:vertical-rl]"><span>AETHER / 2026</span><span className="text-[#c8102e]">MONARCH SYSTEM</span></div></div>
    <header className="absolute inset-x-0 top-0 z-40"><div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-16"><Link href="/" data-hero-mark className="flex min-h-11 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8102e]"><span className="flex size-8 items-center justify-center bg-[#c8102e] text-[11px] font-semibold text-[#f3f1ed]">A</span><span className="text-[17px] font-medium tracking-[-0.06em]">Aether</span></Link><nav className="hidden items-center gap-8 md:flex" aria-label="Primary navigation">{navLinks.map((link) => <a key={link.href} href={link.href} className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 transition-colors hover:text-[#c8102e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8102e]">{link.label}</a>)}</nav><div className="hidden items-center gap-5 md:flex"><Link href="/login" className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/55 hover:text-[#c8102e]">Log in</Link><Link href="/login?mode=sign-up" className="flex min-h-11 items-center gap-3 bg-[#111111] px-4 text-xs text-[#f3f1ed] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8102e]">Open workspace <ArrowUpRight className="size-3.5" /></Link></div><ThemeToggle /><MobileMenu /></div></header>
    <main>
      <section className="relative min-h-[780px] overflow-hidden border-b border-black/10 px-5 pb-14 pt-32 sm:px-8 lg:min-h-[1120px] lg:px-16 lg:pb-20 lg:pt-44"><div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(17,17,17,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,17,17,0.055)_1px,transparent_1px)] bg-[size:8.333%_100%,100%_8rem]" aria-hidden /><div data-hero-visual className="hero-desk-background" aria-hidden="true"><SignalRouter /></div><div className="hero-desk-wash" aria-hidden="true" /><div className="relative z-10 mx-auto grid max-w-[1440px] gap-14 lg:grid-cols-12 lg:gap-0"><div className="lg:col-span-7 lg:pr-8"><div data-hero-eyebrow className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#c8102e]"><span className="size-2 bg-[#c8102e]" />Trading operations, clarified</div><h1 className="mt-8 max-w-[8.5ch] text-[clamp(4rem,10.5vw,9.5rem)] font-light leading-[0.86] tracking-[-0.09em] text-balance sm:mt-10">{["Every", "signal.", "One desk."].map((word) => <span key={word} data-hero-word className="block overflow-hidden pb-2"><span className="block">{word}</span></span>)}</h1><p data-hero-copy className="mt-10 max-w-[48ch] text-pretty text-base leading-relaxed text-black/65 sm:text-lg">Aether brings strategy execution, connected brokers, live risk, research, and performance into one operating system for modern trading teams.</p><div data-hero-actions className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"><Link href="/login?mode=sign-up" className="group flex min-h-12 items-center justify-between gap-12 bg-[#c8102e] px-5 text-sm text-[#f3f1ed] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]">Build your operating picture <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></Link><a href="#product" className="flex min-h-12 items-center gap-3 border border-black/20 px-5 text-sm hover:border-[#c8102e] hover:text-[#c8102e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8102e]">See how it routes <ArrowDownRight className="size-4" /></a></div></div></div></section>
      <div className="overflow-hidden border-b border-black/10 bg-[#111111] py-3 text-[#f3f1ed]"><div data-ticker className="flex w-max items-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">{[0, 1].map((copy) => <div key={copy} className="flex items-center gap-8 pr-8" aria-hidden={copy === 1}>{tickerItems.map((item) => <React.Fragment key={item}><span>{item}</span><span className="text-[#c8102e]">●</span></React.Fragment>)}</div>)}</div></div>
      <section id="product" className="border-b border-black/10 px-5 py-24 sm:px-8 lg:px-16 lg:py-36"><div className="mx-auto max-w-[1440px]"><div className="grid gap-12 lg:grid-cols-12 lg:gap-0"><div data-reveal className="lg:col-span-4 lg:pr-10"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c8102e]">01 / The operating picture</p><h2 className="mt-8 max-w-[10ch] text-[clamp(2.6rem,5.8vw,6rem)] font-light leading-[0.91] tracking-[-0.08em] text-balance">Less stitching. More signal.</h2></div><div data-reveal className="lg:col-span-8 lg:pl-12"><p className="max-w-[58ch] text-lg leading-relaxed text-black/65">Monarch is the execution core inside Aether. It turns a trading idea into a controlled workflow: accept the signal, test it against the strategy’s rules, send it to the right account, and keep the result attached to the original event.</p><div data-reveal-line className="mt-10 h-px bg-black/20" /><div className="mt-6 flex items-center justify-between gap-6 font-mono text-[10px] uppercase tracking-[0.2em] text-black/40"><span>The console</span><span>Built for live decisions</span></div></div></div><div data-reveal className="mt-16 lg:mt-24"><ConsolePreview /></div></div></section>
      <section className="border-b border-black/10 bg-[#e9e6df] px-5 py-24 sm:px-8 lg:px-16 lg:py-36"><div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-12 lg:gap-0"><div data-reveal className="lg:col-span-3"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c8102e]">02 / The route</p><p className="mt-8 max-w-[22ch] text-base leading-relaxed text-black/60">Aether keeps the path from alert to order legible, inspectable, and ready for intervention.</p></div><div data-reveal className="lg:col-span-9 lg:pl-12"><h2 className="max-w-[14ch] text-[clamp(2.7rem,5.4vw,5.8rem)] font-light leading-[0.91] tracking-[-0.08em] text-balance">A clear path through complex markets.</h2><div data-stagger className="mt-12"><RouteDiagram /></div></div></div></section>
      <section id="markets" className="border-b border-black/10 px-5 py-24 sm:px-8 lg:px-16 lg:py-36"><div className="mx-auto max-w-[1440px]"><div className="grid gap-12 lg:grid-cols-12 lg:gap-0"><div data-reveal className="lg:col-span-5"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c8102e]">03 / Markets</p><h2 className="mt-8 max-w-[9ch] text-[clamp(2.7rem,5.4vw,5.8rem)] font-light leading-[0.91] tracking-[-0.08em] text-balance">Different venues. Same discipline.</h2></div><div data-reveal className="lg:col-span-7 lg:pl-12"><p className="max-w-[56ch] text-lg leading-relaxed text-black/65">Connect the markets your strategies actually run in today, while keeping research broad enough to inform the next trade.</p></div></div><div data-stagger className="mt-16 border-t border-black/15">{markets.map((market) => <div key={market.code} data-stagger-item className="group grid min-h-[112px] grid-cols-[56px_1fr_auto] items-center gap-5 border-b border-black/15 sm:grid-cols-[72px_1fr_1fr_auto]"><span className="font-mono text-[11px] text-black/35">{market.code}</span><span className="text-xl font-light tracking-[-0.04em] sm:text-2xl">{market.name}</span><span className="hidden text-sm text-black/50 sm:block">{market.detail}</span><span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.15em] text-black/45"><span className="size-2 rounded-full bg-[#c8102e] transition-transform group-hover:scale-150" />live</span></div>)}</div><div data-reveal className="mt-8 grid gap-4 sm:grid-cols-3"><div className="border border-black/15 p-5"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Broker layer</p><p className="mt-8 text-2xl font-light tracking-[-0.05em]">Multiple providers &amp; expanding</p></div><div className="border border-black/15 p-5"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">Market intelligence</p><p className="mt-8 text-2xl font-light tracking-[-0.05em]">US equity, crypto, commodities, indices</p></div><div className="border border-black/15 bg-[#111111] p-5 text-[#f3f1ed]"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">Operating rule</p><p className="mt-8 text-2xl font-light tracking-[-0.05em]">Use data to decide. Use rules to act.</p></div></div></div></section>
      <section id="research" className="border-b border-black/10 bg-[#111111] px-5 py-24 text-[#f3f1ed] sm:px-8 lg:px-16 lg:py-36"><div className="mx-auto max-w-[1440px]"><div className="grid gap-12 lg:grid-cols-12 lg:gap-0"><div data-reveal className="lg:col-span-5"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#ff8a9c]">04 / Research loop</p><h2 className="mt-8 max-w-[10ch] text-[clamp(2.7rem,5.4vw,5.8rem)] font-light leading-[0.91] tracking-[-0.08em] text-balance">See the trade. Understand the context.</h2></div><div data-reveal className="lg:col-span-7 lg:pl-12"><p className="max-w-[56ch] text-lg leading-relaxed text-white/60">Aether keeps the analytical layer close: filtered news, ticker research, market heatmaps, and an AI copilot that helps you move from question to next action.</p></div></div><div className="mt-16 grid gap-4 lg:grid-cols-12"><div data-reveal data-tilt className="border border-white/15 bg-white/[0.04] p-6 lg:col-span-7"><div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">AI research copilot</p><p className="mt-2 text-2xl font-light tracking-[-0.05em]">“What changed in India F&O?”</p></div><Bot className="size-5 text-[#c8102e]" /></div><div className="mt-6 space-y-4 text-sm leading-relaxed text-white/60"><p className="border-l-2 border-[#c8102e] pl-4">Volatility expanded across the near-term index chain while market breadth softened. Cross-check the opening range strategy before increasing size.</p><div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35"><Check className="size-3.5 text-[#ff8a9c]" />News + heatmap + strategy context</div></div></div><div data-reveal data-tilt className="border border-white/15 p-6 lg:col-span-5"><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Breadth / live view</p><span className="font-mono text-[10px] text-[#ff8a9c]">+12.4%</span></div><div className="mt-10 flex h-[150px] items-end gap-2 border-b border-white/15">{[30,46,36,72,54,84,68,96,76,108,92,122].map((height, index) => <span key={index} data-parallax={index % 2 ? 5 : -3} className="flex-1 bg-[#c8102e] opacity-[0.35] transition-opacity hover:opacity-100" style={{ height }} />)}</div><div className="mt-4 flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-white/35"><span>Open</span><span>Now</span></div></div></div></div></section>
      <section id="security" className="border-b border-black/10 px-5 py-24 sm:px-8 lg:px-16 lg:py-36"><div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-12 lg:gap-0"><div data-reveal className="lg:col-span-4"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#c8102e]">05 / Control</p><h2 className="mt-8 max-w-[9ch] text-[clamp(2.7rem,5.4vw,5.8rem)] font-light leading-[0.91] tracking-[-0.08em] text-balance">Precision is a feature.</h2></div><div data-reveal className="lg:col-span-8 lg:pl-12"><div data-stagger className="grid gap-0 border-t border-black/15 sm:grid-cols-2">{capabilities.map(({ number, icon: Icon, title, body }) => <article key={number} data-stagger-item className="border-b border-black/15 py-7 sm:odd:border-r sm:odd:pr-8 sm:even:pl-8"><div className="flex items-center justify-between"><span className="font-mono text-[10px] tracking-[0.18em] text-[#c8102e]">{number}</span><Icon className="size-4 text-black/40" /></div><h3 className="mt-10 text-xl font-normal tracking-[-0.04em]">{title}</h3><p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-black/58">{body}</p></article>)}</div></div></div></section>
      <section className="relative overflow-hidden bg-[#c8102e] px-5 py-24 text-[#f3f1ed] sm:px-8 lg:px-16 lg:py-32"><div className="pointer-events-none absolute -right-20 -top-28 size-[430px] rounded-full border border-white/25 opacity-60" data-drift aria-hidden><div className="absolute inset-10 rounded-full border border-white/25" /><div className="absolute inset-24 rounded-full border border-white/25" /></div><div className="relative mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-12 lg:gap-0"><div data-reveal className="lg:col-span-8"><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/65">06 / Start with the picture</p><h2 className="mt-8 max-w-[10ch] text-[clamp(3.3rem,7vw,8rem)] font-light leading-[0.86] tracking-[-0.09em] text-balance">Make the next decision visible.</h2></div><div data-reveal className="flex flex-col justify-end lg:col-span-4 lg:pl-10"><p className="max-w-[36ch] text-base leading-relaxed text-white/75">Aether is the command center for the trading work that happens between idea and outcome.</p><Link href="/login?mode=sign-up" className="group mt-8 flex min-h-12 items-center justify-between gap-8 bg-[#111111] px-5 text-sm hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Open your workspace <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-1" /></Link></div></div></section>
    </main>
    <footer className="bg-[#f3f1ed] px-5 py-10 sm:px-8 lg:px-16"><div className="mx-auto grid max-w-[1440px] gap-10 border-t border-black/15 pt-7 sm:grid-cols-2 lg:grid-cols-12"><div className="lg:col-span-5"><Link href="/" className="flex items-center gap-3"><span className="flex size-8 items-center justify-center bg-[#c8102e] text-[11px] font-semibold text-[#f3f1ed]">A</span><span className="text-[17px] font-medium tracking-[-0.06em]">Aether</span></Link><p className="mt-6 max-w-[32ch] text-sm leading-relaxed text-black/55">Trading operations for teams that want a clearer view from signal to position.</p></div><div className="grid grid-cols-2 gap-8 sm:col-span-1 lg:col-span-4 lg:col-start-7"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/35">Navigate</p><div className="mt-4 space-y-3 text-sm">{navLinks.slice(0, 3).map((link) => <a key={link.href} href={link.href} className="block text-black/60 hover:text-[#c8102e]">{link.label}</a>)}</div></div><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/35">Access</p><div className="mt-4 space-y-3 text-sm"><Link href="/login" className="block text-black/60 hover:text-[#c8102e]">Log in</Link><Link href="/login?mode=sign-up" className="block text-black/60 hover:text-[#c8102e]">Create workspace</Link></div></div></div><div className="font-mono text-[10px] uppercase tracking-[0.16em] text-black/35 sm:col-span-2 lg:col-span-3 lg:text-right">© {new Date().getFullYear()} Aether / Monarch</div></div></footer>
  </div>;
}
