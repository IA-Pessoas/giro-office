import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Check, Plus, X } from "lucide-react";

import {
  DEPARTMENT_COLOR_PRESETS,
} from "../utils/colors";

interface DepartmentColorFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  labelClassName?: string;
  containerClassName?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hueToHex(hue: number): string {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const saturation = 0.95;
  const lightness = 0.54;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const match = lightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (normalizedHue < 60) {
    red = chroma;
    green = x;
  } else if (normalizedHue < 120) {
    red = x;
    green = chroma;
  } else if (normalizedHue < 180) {
    green = chroma;
    blue = x;
  } else if (normalizedHue < 240) {
    green = x;
    blue = chroma;
  } else if (normalizedHue < 300) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const toHex = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function hexToHue(hex: string): number {
  const normalized = hex.replace("#", "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return 0;
  }

  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  if (delta === 0) {
    return 0;
  }

  let hue = 0;

  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return Math.round(hue * 60 < 0 ? hue * 60 + 360 : hue * 60);
}

export function DepartmentColorField({
  value,
  onChange,
  labelClassName = "text-sm font-medium text-slate-700 dark:text-slate-200",
  containerClassName = "flex h-13 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm dark:border-slate-700 dark:bg-slate-900",
}: DepartmentColorFieldProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [customHue, setCustomHue] = useState(() => hexToHue(value));
  const sliderTrackRef = useRef<HTMLDivElement | null>(null);
  const isPresetColor = DEPARTMENT_COLOR_PRESETS.some(
    (preset) => preset.value.toLowerCase() === value.toLowerCase(),
  );

  useEffect(() => {
    setCustomHue(hexToHue(value));
  }, [value]);

  const handleCustomHueChange = (nextHue: number) => {
    const safeHue = clamp(nextHue, 0, 360);
    setCustomHue(safeHue);
    onChange(hueToHex(safeHue));
  };

  const updateHueFromPointer = (clientX: number) => {
    const track = sliderTrackRef.current;

    if (!track) {
      return;
    }

    const bounds = track.getBoundingClientRect();
    const ratio = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    handleCustomHueChange(Math.round(ratio * 360));
  };

  const handleSliderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateHueFromPointer(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateHueFromPointer(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      setIsExpanded(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div className="space-y-2">
      <span className={labelClassName}>Cor</span>

      <div className="relative">
        <div className={containerClassName}>
          <div className="flex items-center gap-2">
            {DEPARTMENT_COLOR_PRESETS.map((preset) => {
              const isSelected = value.toLowerCase() === preset.value.toLowerCase();

              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    onChange(preset.value);
                    setIsExpanded(false);
                  }}
                  className={`relative h-6 w-6 rounded-full transition-all ${
                    isSelected
                      ? "scale-105 ring-4 ring-[var(--colors-brand-gradient-start)]/16"
                      : "hover:scale-105"
                  }`}
                  style={{
                    backgroundColor: preset.value,
                    boxShadow: isSelected
                      ? "0 0 0 2px rgba(15, 23, 42, 0.9)"
                      : "0 0 0 1px rgba(148, 163, 184, 0.28)",
                  }}
                  aria-label={`Selecionar cor ${preset.label}`}
                  title={preset.label}
                >
                  {isSelected ? (
                    <Check className="absolute inset-0 m-auto h-3 w-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]" />
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              className={`ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                isExpanded
                  ? "border-[var(--colors-brand-gradient-end)] bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                  : !isPresetColor
                    ? "border-transparent text-white ring-4 ring-[var(--colors-brand-gradient-start)]/16"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
              }`}
              style={
                !isPresetColor
                  ? {
                      backgroundColor: value,
                      boxShadow: "0 0 0 2px rgba(15, 23, 42, 0.9)",
                    }
                  : undefined
              }
              aria-label="Mostrar mais cores"
              title="Mais cores"
            >
              {!isPresetColor && !isExpanded ? (
                <Check className="h-3 w-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>

        {isExpanded ? (
          <div className="absolute right-0 top-[calc(100%+0.375rem)] z-30 w-[216px] rounded-2xl border border-slate-700 bg-slate-900 p-3 text-white shadow-2xl shadow-slate-950/30">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Seletor de cores</div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                aria-label="Fechar seletor de cores"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span
                className="h-8 w-8 shrink-0 rounded-full border-4 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
                style={{ backgroundColor: hueToHex(customHue) }}
              />

              <div
                ref={sliderTrackRef}
                onPointerDown={handleSliderPointerDown}
                className="relative h-3 flex-1 cursor-pointer rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, #ff3b1f 0%, #ffe600 18%, #39ff14 34%, #1fd8ff 52%, #375dff 68%, #8a2bff 84%, #ff1ec9 100%)",
                }}
              >
                <span
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]"
                  style={{
                    left: `${(customHue / 360) * 100}%`,
                    backgroundColor: hueToHex(customHue),
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
