import { useState } from "react";
import type { ChartView } from "@/lib/chart-types";
import type { PriceScaleMode } from "@/lib/chart-price-scale";
import { isChartTimeZone } from "@/lib/chart-timezones";

export type ChartDisplaySettings = {
  timeZone: string;
  priceScale: PriceScaleMode;
};

export function useChartDisplay(view?: ChartView | null, timeZoneOverride?: string) {
  const [settings, setSettings] = useState<ChartDisplaySettings>(() => ({
    timeZone: isChartTimeZone(view?.timeZone) ? view.timeZone : "UTC",
    priceScale: view?.priceScale === "log" ? "log" : "linear",
  }));
  const timeZone = isChartTimeZone(timeZoneOverride) ? timeZoneOverride : settings.timeZone;
  return { settings: { ...settings, timeZone }, changeSettings: setSettings };
}
