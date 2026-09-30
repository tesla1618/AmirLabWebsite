"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formControlClass } from "./form-controls";

interface DateRangePickerProps {
  from: string;
  onChange: (range: { from: string; to: string }) => void;
  to: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function DateRangePicker({ from, onChange, to }: DateRangePickerProps) {
  const selectedStart = parseIsoDate(from);
  const selectedEnd = parseIsoDate(to);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(selectedStart ?? addMonths(new Date(), -1)),
  );
  const [draftStart, setDraftStart] = useState<Date | undefined>(selectedStart);
  const [draftEnd, setDraftEnd] = useState<Date | undefined>(selectedEnd);
  const draftStartRef = useRef<Date | undefined>(selectedStart);
  const draftEndRef = useRef<Date | undefined>(selectedEnd);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const selectingRef = useRef(false);

  const label = useMemo(() => {
    if (from && to) return `${formatShortDate(from)} - ${formatShortDate(to)}`;
    if (from) return `${formatShortDate(from)} - ...`;
    return "Select date range";
  }, [from, to]);

  function commitRange(start: Date, end: Date) {
    const [nextFrom, nextTo] = orderDates(start, end);
    const range = { from: toIsoDate(nextFrom), to: toIsoDate(nextTo) };
    if (range.from !== from || range.to !== to) onChange(range);
  }

  function updateDraft(start: Date | undefined, end: Date | undefined) {
    draftStartRef.current = start;
    draftEndRef.current = end;
    setDraftStart(start);
    setDraftEnd(end);
  }

  function finishDragSelection() {
    draggingRef.current = false;
    if (!dragMovedRef.current) {
      selectingRef.current = Boolean(draftStartRef.current);
      return;
    }
    selectingRef.current = false;
  }

  function startSelection(day: Date) {
    if (selectingRef.current && draftStartRef.current) {
      selectingRef.current = false;
      updateDraft(draftStartRef.current, day);
      return;
    }

    updateDraft(day, undefined);
    draggingRef.current = true;
    dragMovedRef.current = false;
    selectingRef.current = true;
    window.addEventListener("pointerup", finishDragSelection, { once: true });
  }

  function continueSelection(day: Date) {
    const start = draftStartRef.current;
    if ((!draggingRef.current && !selectingRef.current) || !start) return;
    if (draggingRef.current && !sameDay(day, start))
      dragMovedRef.current = true;
    draftEndRef.current = day;
    setDraftEnd(day);
  }

  function chooseDay(day: Date) {
    if (
      !draftStart ||
      (draftStart && draftEnd && sameDay(draftStart, draftEnd))
    ) {
      updateDraft(day, undefined);
      return;
    }
    updateDraft(draftStart, day);
  }

  function clearRange() {
    draggingRef.current = false;
    selectingRef.current = false;
    updateDraft(undefined, undefined);
    if (from || to) onChange({ from: "", to: "" });
    setOpen(false);
  }

  return (
    <Popover.Root
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        draggingRef.current = false;
        selectingRef.current = false;
        if (!nextOpen) return;
        updateDraft(selectedStart, selectedEnd);
        if (selectedStart) setVisibleMonth(startOfMonth(selectedStart));
      }}
      open={open}
    >
      <Popover.Trigger
        className={cn(
          formControlClass,
          "inline-flex min-w-[220px] cursor-pointer items-center justify-center gap-[.55rem] whitespace-nowrap",
        )}
        type="button"
      >
        <CalendarDays
          aria-hidden="true"
          className="shrink-0 text-ink-muted"
          size={16}
        />
        <span className="min-w-0 overflow-hidden text-ellipsis">{label}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="z-[100] grid w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-control border border-line-strong bg-canvas shadow-[var(--shadow-float)] max-[720px]:w-[min(360px,calc(100vw-2rem))]"
          sideOffset={8}
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-b border-line px-4 py-3 max-[720px]:grid-cols-2">
            <DateSummary label="Start date" value={draftStart} />
            <span className="pb-[.45rem] font-mono text-[.65rem] text-ink-faint max-[720px]:hidden">
              TO
            </span>
            <DateSummary label="End date" value={draftEnd} />
          </div>
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <button
              aria-label="Previous month"
              onClick={() =>
                setVisibleMonth((current) => addMonths(current, -1))
              }
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border border-line bg-surface text-ink-muted hover:border-line-strong hover:bg-surface-subtle hover:text-brand focus-visible:shadow-[var(--focus-ring)]"
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={15} />
            </button>
            <span className="font-mono text-[.58rem] tracking-[.08em] text-ink-faint uppercase">
              Choose a start and end date
            </span>
            <button
              aria-label="Next month"
              onClick={() =>
                setVisibleMonth((current) => addMonths(current, 1))
              }
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border border-line bg-surface text-ink-muted hover:border-line-strong hover:bg-surface-subtle hover:text-brand focus-visible:shadow-[var(--focus-ring)]"
              type="button"
            >
              <ChevronRight aria-hidden="true" size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-5 p-4 max-[720px]:grid-cols-1 max-[720px]:gap-y-5">
            {[visibleMonth, addMonths(visibleMonth, 1)].map((month) => (
              <MonthView
                draftEnd={draftEnd}
                draftStart={draftStart}
                key={month.toISOString()}
                month={month}
                onChooseDay={chooseDay}
                onContinueSelection={continueSelection}
                onStartSelection={startSelection}
              />
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-3">
            <button
              className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-3 text-[.72rem] text-ink-muted hover:border-line-strong hover:bg-surface-subtle hover:text-ink"
              onClick={clearRange}
              type="button"
            >
              Clear
            </button>
            <div className="flex gap-2">
              <button
                className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-3 text-[.72rem] text-ink-muted hover:border-line-strong hover:bg-surface-subtle hover:text-ink"
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-control border border-brand bg-brand px-3 text-[.72rem] font-semibold text-on-accent hover:bg-brand-hover disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-subtle disabled:text-ink-faint"
                disabled={!draftStart || !draftEnd}
                onClick={() => {
                  if (!draftStart || !draftEnd) return;
                  commitRange(draftStart, draftEnd);
                  setOpen(false);
                }}
                type="button"
              >
                Apply range
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DateSummary({ label, value }: { label: string; value?: Date }) {
  return (
    <div className="grid gap-1">
      <span className="font-mono text-[.52rem] tracking-[.08em] text-ink-faint uppercase">
        {label}
      </span>
      <strong className="min-h-5 text-[.76rem] font-medium text-ink">
        {value
          ? value.toLocaleDateString("en-US", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "Not selected"}
      </strong>
    </div>
  );
}

function MonthView({
  draftEnd,
  draftStart,
  month,
  onChooseDay,
  onContinueSelection,
  onStartSelection,
}: {
  draftEnd?: Date;
  draftStart?: Date;
  month: Date;
  onChooseDay: (day: Date) => void;
  onContinueSelection: (day: Date) => void;
  onStartSelection: (day: Date) => void;
}) {
  const days = monthGrid(month);
  const [rangeStart, rangeEnd] =
    draftStart && draftEnd
      ? orderDates(draftStart, draftEnd)
      : [draftStart, draftEnd];

  return (
    <section className="grid gap-2">
      <h3 className="m-0 text-center text-[.78rem] font-semibold">
        {month.toLocaleDateString("en", { month: "long", year: "numeric" })}
      </h3>
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((weekday, index) => (
          <span
            className="py-[.35rem] text-center font-mono text-[.62rem] text-ink-muted"
            key={`${weekday}-${index}`}
          >
            {weekday}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day, index) => {
          const outside = day.getMonth() !== month.getMonth();
          if (outside) {
            return (
              <span
                aria-hidden="true"
                className="relative flex h-8 select-none items-center justify-center text-[.72rem]"
                key={toIsoDate(day)}
              />
            );
          }
          const selectedStart = Boolean(rangeStart && sameDay(day, rangeStart));
          const selectedEnd = Boolean(rangeEnd && sameDay(day, rangeEnd));
          const today = sameDay(day, new Date());
          const inRange = Boolean(
            rangeStart && rangeEnd && day > rangeStart && day < rangeEnd,
          );
          const hasRange = Boolean(
            rangeStart && rangeEnd && !sameDay(rangeStart, rangeEnd),
          );
          const rowStart = index % 7 === 0;
          const rowEnd = index % 7 === 6;
          const className = cn(
            "relative flex h-8 cursor-pointer select-none items-center justify-center border-0 bg-transparent text-[.72rem] text-ink hover:bg-surface-subtle hover:text-brand focus-visible:z-30 focus-visible:shadow-[var(--focus-ring)]",
            inRange && "!bg-brand-faint text-brand-strong",
            inRange && rowStart && "rounded-l-control",
            inRange && rowEnd && "rounded-r-control",
            (selectedStart || selectedEnd) &&
              "font-semibold text-on-accent hover:text-on-accent",
            today &&
              !selectedStart &&
              !selectedEnd &&
              "ring-1 ring-inset ring-brand",
          );
          return (
            <button
              aria-label={`${day.toLocaleDateString("en-US", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}${selectedStart ? ", range start" : selectedEnd ? ", range end" : inRange ? ", included in range" : today ? ", today" : ""}`}
              aria-pressed={selectedStart || selectedEnd || inRange}
              className={className}
              key={toIsoDate(day)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onChooseDay(day);
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                onStartSelection(day);
              }}
              onPointerEnter={() => onContinueSelection(day)}
              type="button"
            >
              {hasRange && selectedStart && !rowEnd ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 right-0 left-1/2 z-0 bg-brand-faint"
                />
              ) : null}
              {hasRange && selectedEnd && !rowStart ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 right-1/2 left-0 z-0 bg-brand-faint"
                />
              ) : null}
              {selectedStart || selectedEnd ? (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 left-1/2 z-10 h-8 w-full -translate-x-1/2 -translate-y-1/2 rounded-control bg-brand"
                />
              ) : null}
              <span className="relative z-20">{day.getDate()}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function monthGrid(month: Date): Date[] {
  const start = startOfMonth(month);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function parseIsoDate(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return toIsoDate(date) === value ? date : undefined;
}

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, months: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function addDays(value: Date, days: number): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate() + days,
  );
}

function orderDates(left: Date, right: Date): [Date, Date] {
  return left <= right ? [left, right] : [right, left];
}

function sameDay(left: Date, right: Date): boolean {
  return toIsoDate(left) === toIsoDate(right);
}
