"use client";

import { placeKey } from "@taniolatam/core";
import type { ApiClient, PlaceSuggestion } from "@taniolatam/api-client";
import { useEffect, useId, useRef, useState } from "react";
import type { PlaceChip } from "../lib/form-state";
import { inputCls } from "./ui";

interface Props {
  label: string;
  chips: PlaceChip[];
  onChange: (chips: PlaceChip[]) => void;
  api: ApiClient;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Destination mode: "Gdziekolwiek" is offered as a suggestion (also for an empty, focused
   * field). It replaces every other chip, and picking a concrete place removes it.
   */
  anywhere?: boolean;
}

/** Multi-value place picker: chips + autocomplete backed by GET /api/v1/places. */
export function PlaceInput({
  label,
  chips,
  onChange,
  api,
  placeholder,
  disabled,
  anywhere = false,
}: Props) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [text, setText] = useState("");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = text.trim();
    if (q === "" && !anywhere) {
      setItems([]);
      setFailed(false);
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(
      () => {
        api
          .places(q, { signal: ac.signal, anywhere })
          .then((res) => {
            setItems(res.results);
            setActive(0);
            setFailed(false);
          })
          .catch((err: unknown) => {
            if (ac.signal.aborted) return;
            void err;
            setItems([]);
            setFailed(true);
          });
      },
      q === "" ? 0 : 180,
    );
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [text, api, anywhere]);

  // With an empty field, do not offer what is already a chip (e.g. "Gdziekolwiek" twice).
  const visible =
    text.trim() === ""
      ? items.filter((s) => !chips.some((c) => placeKey(c.place) === placeKey(s.place)))
      : items;

  const add = (s: PlaceSuggestion) => {
    const chip = { place: s.place, label: s.label };
    if (anywhere && s.place.kind === "anywhere") {
      onChange([chip]);
    } else if (!chips.some((c) => placeKey(c.place) === placeKey(s.place))) {
      onChange([...(anywhere ? chips.filter((c) => c.place.kind !== "anywhere") : chips), chip]);
    }
    setText("");
    setItems([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const s = visible[active];
      if (open && s) {
        e.preventDefault();
        add(s);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && text === "" && chips.length > 0) {
      onChange(chips.slice(0, -1));
    }
  };

  const showList =
    open &&
    (text.trim() !== "" || anywhere) &&
    (visible.length > 0 || (failed && text.trim() !== ""));

  return (
    <div className="relative">
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface p-1.5 focus-within:border-accent ${
          disabled ? "opacity-50" : ""
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((c) => (
          <span
            key={placeKey(c.place)}
            data-testid="place-chip"
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-sm text-fg"
          >
            {c.label}
            <button
              type="button"
              aria-label={`Usuń: ${c.label}`}
              disabled={disabled}
              className="rounded-full px-1 text-muted hover:text-fg"
              onClick={(e) => {
                e.stopPropagation();
                onChange(chips.filter((x) => placeKey(x.place) !== placeKey(c.place)));
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && visible[active] ? `${uid}-opt-${active}` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder={chips.length === 0 ? placeholder : "Dodaj kolejne…"}
          className={`${inputCls} min-w-24 flex-1 border-0 bg-transparent p-1`}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-auto rounded-md border border-line bg-surface shadow-lg"
        >
          {failed && (
            <li className="px-3 py-2 text-sm text-danger">Nie udało się pobrać podpowiedzi.</li>
          )}
          {visible.map((s, i) => (
            <li
              key={placeKey(s.place)}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-1.5 text-sm ${
                i === active ? "bg-accent-soft" : ""
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => add(s)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{s.label}</span>
                <span className="shrink-0 text-xs text-muted">{s.kindLabel}</span>
              </div>
              {s.detail && <div className="truncate text-xs text-muted">{s.detail}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
