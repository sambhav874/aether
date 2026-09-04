"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchMetaApiServers } from "./integrations-actions";

type Option = { broker: string; server: string };

/**
 * Search-as-you-type picker for the MT5 Server field.
 *
 * MetaAPI's registry holds thousands of servers and its search endpoint caps
 * answers at 10 brokers, so this can't be a plain <select> over a fixed list.
 * It stays an <input name="server"> underneath: picking a suggestion fills it,
 * but a server MetaAPI has never seen can still be typed by hand, which is the
 * documented escape hatch for brokers that need a .srv upload.
 */
export function MtServerCombobox({ id, name }: { id: string; name: string }) {
  const [value, setValue] = React.useState("");
  const [options, setOptions] = React.useState<Option[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [searched, setSearched] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped per keystroke so a slow lookup can't overwrite a newer one's results.
  const requestRef = React.useRef(0);

  // Debounce so a fast typist costs one MetaAPI lookup, not one per keystroke.
  function search(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    const query = next.trim();
    const requestId = ++requestRef.current;

    if (query.length < 2) {
      setOptions([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const groups = await searchMetaApiServers(query);
      if (requestId !== requestRef.current) return;
      setOptions(
        groups.flatMap((g) => g.servers.map((server) => ({ broker: g.broker, server }))),
      );
      setActive(-1);
      setSearched(true);
      setLoading(false);
    }, 250);
  }

  React.useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(option: Option) {
    setValue(option.server);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === "Enter" && active >= 0) {
      // Only swallow Enter when a suggestion is highlighted, so the form still
      // submits normally for a hand-typed server name.
      event.preventDefault();
      choose(options[active]);
    }
  }

  const exactMatch = options.some(
    (o) => o.server.toLowerCase() === value.trim().toLowerCase(),
  );
  const showUnknownHint =
    searched && !loading && !exactMatch && value.trim().length >= 2 && options.length === 0;

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={id}
        name={name}
        required
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        placeholder="Start typing your broker, e.g. AdamFx"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          search(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {loading && (
        <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-muted-foreground" />
      )}

      {open && options.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-input bg-popover py-1 shadow-md dark:border-white/15"
        >
          {options.map((option, index) => (
            <li key={`${option.broker}:${option.server}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-sm",
                  index === active && "bg-accent text-accent-foreground",
                )}
              >
                <span className="font-medium">{option.server}</span>
                <span className="text-xs text-muted-foreground">{option.broker}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showUnknownHint && (
        <p className="mt-1 text-xs text-muted-foreground">
          Not in MetaAPI&apos;s registry. Type the server name exactly as it appears in
          your MT5 terminal&apos;s login dialog.
        </p>
      )}
    </div>
  );
}
