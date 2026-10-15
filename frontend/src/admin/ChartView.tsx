import { useEffect, useRef } from "react";
import { Chart, type ChartConfiguration, type Plugin } from "chart.js/auto";

export const chartColors = {
  emerald: "#059669",
  amber: "#D97706",
  slate: "#64748B",
  ink: "#1C2A24",
  muted: "#5D6B63",
  grid: "#E9E4D6"
};

Chart.defaults.font.family = "Manrope, system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = chartColors.muted;

/** Draws 95% CI whiskers for datasets that carry a `ci: [low, high][]` array. */
const ciWhiskers: Plugin = {
  id: "ciWhiskers",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const y = chart.scales.y;
    chart.data.datasets.forEach((dataset, index) => {
      const ci = (dataset as unknown as { ci?: ([number, number] | null)[] }).ci;
      const meta = chart.getDatasetMeta(index);
      if (!ci || meta.hidden) return;
      meta.data.forEach((element, i) => {
        const interval = ci[i];
        if (!interval) return;
        const x = element.x;
        const top = y.getPixelForValue(Math.min(100, interval[1]));
        const bottom = y.getPixelForValue(Math.max(0, interval[0]));
        ctx.save();
        ctx.strokeStyle = chartColors.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, top); ctx.lineTo(x, bottom);
        ctx.moveTo(x - 6, top); ctx.lineTo(x + 6, top);
        ctx.moveTo(x - 6, bottom); ctx.lineTo(x + 6, bottom);
        ctx.stroke();
        ctx.restore();
      });
    });
  }
};

export function ChartView({ config, label, height = 260 }: { config: ChartConfiguration; label: string; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, { ...config, plugins: [...(config.plugins ?? []), ciWhiskers] });
    return () => chart.destroy();
  }, [config]);
  return (
    <div className="chart-box" style={{ height }}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
