import type { FC } from "react";

export const MetricsCard: FC<{
  label: string;
  value: string | number;
  trend?: number;
}> = ({ label, value, trend = 0 }) => {
  const trendClass =
    trend > 0 ? "metric-trend metric-trend-up" : trend < 0 ? "metric-trend metric-trend-down" : "metric-trend";
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className={trendClass}>
        {trend > 0 ? "▲" : trend < 0 ? "▼" : "•"} {trend === 0 ? "stable" : `${Math.abs(trend)} delta`}
      </p>
    </article>
  );
};
