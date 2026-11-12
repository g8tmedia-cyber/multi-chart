import { useCallback, useRef, useState } from "react";
import type { ChartDrawingLayer } from "@/lib/chart-drawing";
import type { ChartDrag, ChartPixelPoint } from "@/lib/chart-types";

export function useChartInteractionState() {
  const [localPointer, setPointer] = useState<ChartPixelPoint | null>(null);
  const [panning, setPanning] = useState(false);
  const manualDrag = useRef(false);
  const drag = useRef<ChartDrag | null>(null);
  const points = useRef(new Map<number, ChartPixelPoint>());
  const clear = useCallback((drawingLayer?: ChartDrawingLayer) => {
    drawingLayer?.cancel();
    manualDrag.current = false;
    points.current.clear();
    drag.current = null;
    setPointer(null);
    setPanning(false);
  }, []);
  return { localPointer, setPointer, panning, setPanning, manualDrag, drag, points, clear };
}
export type ChartInteractionState = ReturnType<typeof useChartInteractionState>;
