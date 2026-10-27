import { useEffect, useMemo, useState } from "react";
import Filters from "../components/Filters";
import Card from "../components/Card";
import "./Accuracy.css";

const EMPTY_METRICS = {
    overall: {},
    by_day: [],
    by_horizon: [],
    by_wind_level: [],
    by_time_of_day: [],
    rows: [],
}

const BREAKDOWN_TABS = [
    { id: "time", label: "Time of day", rowsKey: "by_time_of_day", labelKey: "time_of_day" },
    { id: "horizon", label: "Horizon", rowsKey: "by_horizon", labelKey: "horizon_bucket" },
    { id: "wind", label: "Wind level", rowsKey: "by_wind_level", labelKey: "wind_level" },
    { id: "day", label: "Day", rowsKey: "by_day", labelKey: "date_of_forecast" },
]

const BREAKDOWN_METRICS = [
    { id: "mae", label: "MAE" },
    { id: "rmse", label: "RMSE" },
    { id: "bias", label: "Bias" },
]

const CHART_COLORS = {
    green: "#37866f",
    darkGreen: "#253f36",
    rose: "#a56868",
    grid: "#e5e9e6",
    text: "#59645e",
}

function formatDayMonth(date) {
    if (!date) return "—"

    const parsedDate = new Date(`${date.slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(parsedDate.getTime())) return "—"

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
    }).format(parsedDate)
}

function formatTime(dateTime) {
    const parsedDate = new Date(dateTime)
    if (Number.isNaN(parsedDate.getTime())) return "—"

    return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC",
    }).format(parsedDate)
}

function formatMegawatts(value, signed = false) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—"

    const rounded = Math.round(value)
    return `${signed && rounded > 0 ? "+" : ""}${rounded.toLocaleString()} MW`
}

function makeApiUrl(path, params) {
    const apiBase = (import.meta.env.VITE_API_URL || "http://localhost:8000")
        .replace(/\/+$/, "")
    return `${apiBase}${path}?${params}`
}

async function fetchJson(url, signal) {
    const response = await fetch(url, { signal })
    const result = await response.json()

    if (!response.ok) {
        throw new Error(result.detail || `Request failed (${response.status})`)
    }

    return result
}

function finiteRows(rows) {
    return rows.filter(
        (row) =>
            typeof row.forecast === "number" &&
            Number.isFinite(row.forecast) &&
            typeof row.actual === "number" &&
            Number.isFinite(row.actual),
    )
}

function chartY(value, min, max, top, height) {
    return top + height - ((value - min) / (max - min || 1)) * height
}

function chartTicks(min, max, count = 5) {
    return Array.from({ length: count }, (_, index) =>
        min + ((max - min) * index) / (count - 1),
    )
}

function ForecastActualChart({ rows }) {
    const allPoints = useMemo(() => finiteRows(rows), [rows])

    if (allPoints.length === 0) {
        return <p className="accuracy-empty">No forecast/actual pairs for this period.</p>
    }

    const stride = Math.max(1, Math.ceil(allPoints.length / 900))
    const points = allPoints.filter((_, index) => index % stride === 0)
    if (points[points.length - 1] !== allPoints[allPoints.length - 1]) {
        points.push(allPoints[allPoints.length - 1])
    }

    const values = points.flatMap((row) => [row.forecast, row.actual])
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const padding = (maxValue - minValue || 1) * 0.06
    const min = Math.max(0, minValue - padding)
    const max = maxValue + padding || min + 1
    const left = 76
    const right = 18
    const top = 18
    const bottom = 42
    const width = 1000 - left - right
    const height = 330 - top - bottom
    const pointX = (index) => left + (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width)
    const forecastPath = points.map((row, index) =>
        `${index === 0 ? "M" : "L"} ${pointX(index)} ${chartY(row.forecast, min, max, top, height)}`,
    ).join(" ")
    const actualPath = points.map((row, index) =>
        `${index === 0 ? "M" : "L"} ${pointX(index)} ${chartY(row.actual, min, max, top, height)}`,
    ).join(" ")
    const yTicks = chartTicks(min, max)
    const xTickIndexes = Array.from({ length: 5 }, (_, index) =>
        Math.round((index / 4) * (points.length - 1)),
    )

    return (
        <div className="accuracy-chart-wrap">
            <div className="accuracy-chart-legend">
                <span><i className="accuracy-legend-forecast" /> Forecast</span>
                <span><i className="accuracy-legend-actual" /> Actual</span>
                <span><i className="accuracy-legend-over" /> Over-forecast</span>
                <span><i className="accuracy-legend-under" /> Under-forecast</span>
            </div>
            <div className="accuracy-svg-scroll">
                <svg
                    className="accuracy-svg accuracy-line-svg"
                    viewBox="0 0 1000 330"
                    role="img"
                    aria-label={`Forecast and actual generation across ${allPoints.length} half-hour periods`}
                >
                    {yTicks.map((tick) => {
                        const y = chartY(tick, min, max, top, height)
                        return (
                            <g key={tick}>
                                <line x1={left} x2={1000 - right} y1={y} y2={y} className="accuracy-chart-gridline" />
                                <text x={left - 10} y={y + 4} textAnchor="end" className="accuracy-axis-label">
                                    {Math.round(tick).toLocaleString()}
                                </text>
                            </g>
                        )
                    })}
                    <text
                        x="15"
                        y={top + height / 2}
                        transform={`rotate(-90 15 ${top + height / 2})`}
                        textAnchor="middle"
                        className="accuracy-axis-label"
                    >
                        Generation (MW)
                    </text>
                    {points.map((row, index) => (
                        <line
                            key={`error-${row.startTime}`}
                            x1={pointX(index)}
                            x2={pointX(index)}
                            y1={chartY(row.forecast, min, max, top, height)}
                            y2={chartY(row.actual, min, max, top, height)}
                            stroke={row.forecast >= row.actual ? CHART_COLORS.rose : CHART_COLORS.green}
                            strokeWidth="1.5"
                            opacity="0.72"
                        >
                            <title>
                                {`${formatDayMonth(row.startTime)} ${formatTime(row.startTime)} · ${row.forecast >= row.actual ? "Over-forecast" : "Under-forecast"} · forecast ${formatMegawatts(row.forecast)}, actual ${formatMegawatts(row.actual)}`}
                            </title>
                        </line>
                    ))}
                    <path d={forecastPath} className="accuracy-line-forecast" />
                    <path d={actualPath} className="accuracy-line-actual" />
                    {points.map((row, index) => (
                        <circle
                            key={`forecast-${row.startTime}`}
                            cx={pointX(index)}
                            cy={chartY(row.forecast, min, max, top, height)}
                            r={points.length > 300 ? 1.8 : 2.5}
                            fill={row.forecast >= row.actual ? CHART_COLORS.rose : CHART_COLORS.green}
                        >
                            <title>
                                {`${formatDayMonth(row.startTime)} ${formatTime(row.startTime)} · forecast ${formatMegawatts(row.forecast)}, actual ${formatMegawatts(row.actual)}`}
                            </title>
                        </circle>
                    ))}
                    {xTickIndexes.map((index) => (
                        <text
                            key={`date-${index}`}
                            x={pointX(index)}
                            y={330 - 12}
                            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                            className="accuracy-axis-label"
                        >
                            {formatDayMonth(points[index].startTime)}
                        </text>
                    ))}
                </svg>
            </div>
            <p className="accuracy-chart-note">
                Colored stems and forecast markers show whether each forecast was above or below actual generation.
            </p>
        </div>
    )
}

function createErrorHistogram(rows) {
    const errors = finiteRows(rows).map((row) => row.forecast - row.actual)
    if (errors.length === 0) return []

    const { min: rawMin, max: rawMax } = errors.reduce(
        (range, error) => ({
            min: Math.min(range.min, error),
            max: Math.max(range.max, error),
        }),
        { min: Infinity, max: -Infinity },
    )
    const min = rawMin === rawMax ? rawMin - 0.5 : rawMin
    const max = rawMin === rawMax ? rawMax + 0.5 : rawMax
    const binCount = Math.min(20, Math.max(8, Math.ceil(Math.sqrt(errors.length))))
    const width = (max - min) / binCount
    const bins = Array.from({ length: binCount }, (_, index) => {
        const start = min + index * width
        const end = index === binCount - 1 ? max : start + width
        return { label: `${Math.round(start)} to ${Math.round(end)}`, start, end, count: 0 }
    })

    errors.forEach((error) => {
        const index = Math.min(binCount - 1, Math.floor((error - min) / width))
        bins[index].count += 1
    })

    return bins
}

function ForecastErrorHistogram({ rows }) {
    const bins = useMemo(() => createErrorHistogram(rows), [rows])

    if (bins.length === 0) {
        return <p className="accuracy-empty">No forecast errors are available for this period.</p>
    }

    const left = 55
    const right = 15
    const top = 16
    const bottom = 48
    const width = 1000 - left - right
    const height = 245 - top - bottom
    const maxCount = Math.max(...bins.map((bin) => bin.count), 1)
    const barWidth = width / bins.length
    const zeroIndex = bins.findIndex((bin) => bin.start <= 0 && bin.end >= 0)
    const yTicks = chartTicks(0, maxCount, 4)

    return (
        <div className="accuracy-chart-wrap">
            <div className="accuracy-svg-scroll">
                <svg className="accuracy-svg" viewBox="0 0 1000 245" role="img" aria-label="Histogram of forecast error">
                    {yTicks.map((tick) => {
                        const y = top + height - (tick / maxCount) * height
                        return (
                            <g key={tick}>
                                <line x1={left} x2={1000 - right} y1={y} y2={y} className="accuracy-chart-gridline" />
                                <text x={left - 9} y={y + 4} textAnchor="end" className="accuracy-axis-label">
                                    {Math.round(tick)}
                                </text>
                            </g>
                        )
                    })}
                    {zeroIndex >= 0 && (
                        <line
                            x1={left + zeroIndex * barWidth}
                            x2={left + zeroIndex * barWidth}
                            y1={top}
                            y2={top + height}
                            stroke="#37443d"
                            strokeDasharray="4 4"
                        />
                    )}
                    {bins.map((bin, index) => {
                        const barHeight = (bin.count / maxCount) * height
                        const x = left + index * barWidth + 2
                        const y = top + height - barHeight
                        const fill = bin.end <= 0
                            ? CHART_COLORS.green
                            : bin.start >= 0
                                ? CHART_COLORS.rose
                                : "#718a7e"
                        return (
                            <g key={bin.label}>
                                <rect x={x} y={y} width={Math.max(1, barWidth - 4)} height={barHeight} fill={fill} rx="2">
                                    <title>{`${bin.label} MW error: ${bin.count} half-hours`}</title>
                                </rect>
                                {index % 4 === 0 && (
                                    <text
                                        x={x + (barWidth - 4) / 2}
                                        y={top + height + 18}
                                        textAnchor="middle"
                                        className="accuracy-axis-label"
                                    >
                                        {Math.round(bin.start)}
                                    </text>
                                )}
                            </g>
                        )
                    })}
                    <text x={left + width / 2} y="241" textAnchor="middle" className="accuracy-axis-label">
                        Forecast error (forecast − actual), MW
                    </text>
                    <text x="14" y={top + height / 2} transform={`rotate(-90 14 ${top + height / 2})`} textAnchor="middle" className="accuracy-axis-label">
                        Half-hours
                    </text>
                </svg>
            </div>
            <p className="accuracy-chart-note">Under-forecast errors are negative (green); over-forecast errors are positive (rose).</p>
        </div>
    )
}

function CoverageChart({ backtest }) {
    const days = backtest?.per_day ?? []

    if (days.length === 0) {
        return <p className="accuracy-empty">No daily range coverage is available for this period.</p>
    }

    const chartWidth = Math.max(1000, days.length * 22)
    const left = 42
    const right = 12
    const top = 20
    const bottom = 38
    const width = chartWidth - left - right
    const height = 205 - top - bottom
    const step = width / days.length
    const barWidth = Math.max(2, Math.min(16, step * 0.68))
    const labelEvery = Math.max(1, Math.ceil(days.length / 9))
    const target = backtest.nominal_coverage * 100

    return (
        <div className="accuracy-chart-wrap">
            <p className="coverage-summary">
                <strong>{backtest.overall_coverage == null ? "—" : `${(backtest.overall_coverage * 100).toFixed(1)}%`}</strong>
                <span>of half-hours landed inside the range</span>
            </p>
            <div className="accuracy-svg-scroll">
                <svg
                    className="accuracy-svg"
                    style={{ width: `${chartWidth}px` }}
                    viewBox={`0 0 ${chartWidth} 205`}
                    role="img"
                    aria-label="Daily share of actuals inside the selected forecast range"
                >
                    {[0, 25, 50, 75, 100].map((tick) => {
                        const y = top + height - (tick / 100) * height
                        return (
                            <g key={tick}>
                                <line x1={left} x2={chartWidth - right} y1={y} y2={y} className="accuracy-chart-gridline" />
                                <text x={left - 7} y={y + 4} textAnchor="end" className="accuracy-axis-label">{tick}%</text>
                            </g>
                        )
                    })}
                    <line
                        x1={left}
                        x2={chartWidth - right}
                        y1={top + height - (target / 100) * height}
                        y2={top + height - (target / 100) * height}
                        stroke={CHART_COLORS.rose}
                        strokeDasharray="5 4"
                    />
                    {days.map((day, index) => {
                        const value = day.coverage * 100
                        const barHeight = (value / 100) * height
                        const x = left + index * step + (step - barWidth) / 2
                        const y = top + height - barHeight
                        return (
                            <g key={day.date_of_forecast}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={barHeight}
                                    rx="2"
                                    fill={day.coverage >= backtest.nominal_coverage ? CHART_COLORS.green : CHART_COLORS.rose}
                                >
                                    <title>
                                        {`${formatDayMonth(day.date_of_forecast)}: ${value.toFixed(1)}% (${day.n_inside}/${day.n}) inside range`}
                                    </title>
                                </rect>
                                {index % labelEvery === 0 && (
                                    <text
                                        x={x + barWidth / 2}
                                        y={top + height + 18}
                                        textAnchor="middle"
                                        className="accuracy-axis-label"
                                    >
                                        {formatDayMonth(day.date_of_forecast)}
                                    </text>
                                )}
                            </g>
                        )
                    })}
                </svg>
            </div>
            <p className="accuracy-chart-note">
                Dashed line: {target.toFixed(0)}% target · each bar is one delivery day.
            </p>
        </div>
    )
}

function BreakdownChart({ rows, labelKey, metric }) {
    const data = rows
        .filter((row) => typeof row[metric] === "number" && Number.isFinite(row[metric]))
        .map((row) => ({
            ...row,
            chartLabel: labelKey === "date_of_forecast"
                ? formatDayMonth(String(row[labelKey]))
                : String(row[labelKey]),
        }))

    if (data.length === 0) {
        return <p className="accuracy-empty">No breakdown data is available for this selection.</p>
    }

    const chartWidth = Math.max(1000, data.length * 23)
    const left = 68
    const right = 14
    const top = 18
    const bottom = 46
    const width = chartWidth - left - right
    const height = 250 - top - bottom
    const values = data.map((row) => row[metric])
    const rawMin = metric === "bias" ? Math.min(...values, 0) : 0
    const rawMax = Math.max(...values, 0)
    const padding = (rawMax - rawMin || 1) * 0.08
    const min = rawMin < 0 ? rawMin - padding : 0
    const max = rawMax + padding || 1
    const step = width / data.length
    const barWidth = Math.max(2, Math.min(24, step * 0.68))
    const labelEvery = Math.max(1, Math.ceil(data.length / 10))
    const yTicks = chartTicks(min, max)
    const zeroY = chartY(0, min, max, top, height)

    return (
        <div className="accuracy-svg-scroll">
            <svg
                className="accuracy-svg"
                style={{ width: `${chartWidth}px` }}
                viewBox={`0 0 ${chartWidth} 250`}
                role="img"
                aria-label={`${metric.toUpperCase()} by selected group`}
            >
                {yTicks.map((tick) => {
                    const y = chartY(tick, min, max, top, height)
                    return (
                        <g key={tick}>
                            <line x1={left} x2={chartWidth - right} y1={y} y2={y} className="accuracy-chart-gridline" />
                            <text x={left - 8} y={y + 4} textAnchor="end" className="accuracy-axis-label">
                                {Math.round(tick).toLocaleString()}
                            </text>
                        </g>
                    )
                })}
                <line x1={left} x2={chartWidth - right} y1={zeroY} y2={zeroY} stroke="#56615b" />
                {data.map((row, index) => {
                    const value = row[metric]
                    const valueY = chartY(value, min, max, top, height)
                    const x = left + index * step + (step - barWidth) / 2
                    const y = Math.min(valueY, zeroY)
                    const barHeight = Math.max(1, Math.abs(zeroY - valueY))
                    return (
                        <g key={`${row.chartLabel}-${index}`}>
                            <rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={barHeight}
                                rx="2"
                                fill={metric === "bias" && value < 0 ? CHART_COLORS.green : "#496f60"}
                            >
                                <title>
                                    {`${row.chartLabel}: ${BREAKDOWN_METRICS.find((item) => item.id === metric)?.label} ${formatMegawatts(value, metric === "bias")} · ${row.n} half-hours`}
                                </title>
                            </rect>
                            {index % labelEvery === 0 && (
                                <text
                                    x={x + barWidth / 2}
                                    y={top + height + 18}
                                    textAnchor="middle"
                                    className="accuracy-axis-label"
                                >
                                    {row.chartLabel}
                                </text>
                            )}
                        </g>
                    )
                })}
            </svg>
        </div>
    )
}

function BreakdownTabs({ metrics }) {
    const [activeTab, setActiveTab] = useState("time")
    const [activeMetric, setActiveMetric] = useState("mae")
    const selectedTab = BREAKDOWN_TABS.find((tab) => tab.id === activeTab) ?? BREAKDOWN_TABS[0]
    const rows = metrics[selectedTab.rowsKey] ?? []

    return (
        <div className="breakdown-panel">
            <div className="accuracy-tabs" role="tablist" aria-label="Break down error by">
                {BREAKDOWN_TABS.map((tab) => (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        className={`accuracy-tab${activeTab === tab.id ? " active" : ""}`}
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="accuracy-metric-tabs" role="tablist" aria-label="Error metric">
                {BREAKDOWN_METRICS.map((metric) => (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeMetric === metric.id}
                        className={`accuracy-metric-tab${activeMetric === metric.id ? " active" : ""}`}
                        key={metric.id}
                        onClick={() => setActiveMetric(metric.id)}
                    >
                        {metric.label}
                    </button>
                ))}
            </div>
            <BreakdownChart rows={rows} labelKey={selectedTab.labelKey} metric={activeMetric} />
            <p className="accuracy-chart-note">
                {BREAKDOWN_METRICS.find((metric) => metric.id === activeMetric)?.label} in MW by {selectedTab.label.toLowerCase()}.
                Bias below zero indicates under-forecasting.
            </p>
        </div>
    )
}

export default function Accuracy({ filters, onFiltersChange }) {
    const fromDate = filters.dates.From ?? ""
    const toDate = filters.dates.To ?? ""
    const cutoffTime = filters.cutoffTime || "12:00"
    const [metrics, setMetrics] = useState(EMPTY_METRICS)
    const [backtest, setBacktest] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        const controller = new AbortController()
        const metricsParams = new URLSearchParams({ cutoff: cutoffTime })
        const backtestParams = new URLSearchParams({
            cutoff: cutoffTime,
            lower_pct: String(filters.percentiles.lower),
            upper_pct: String(filters.percentiles.upper),
        })

        if (fromDate) {
            metricsParams.set("start", fromDate)
            backtestParams.set("start", fromDate)
        }
        if (toDate) {
            metricsParams.set("end", toDate)
            backtestParams.set("end", toDate)
        }
        if (filters.history !== "All available") {
            const windowDays = filters.history === "Past 7 days" ? "7" : "14"
            backtestParams.set("window_days", windowDays)
        }

        async function loadAccuracy() {
            setLoading(true)
            setError("")

            try {
                const [metricResult, backtestResult] = await Promise.all([
                    fetchJson(makeApiUrl("/api/metrics", metricsParams), controller.signal),
                    fetchJson(makeApiUrl("/api/backtest", backtestParams), controller.signal),
                ])

                if (!metricResult.overall || !Array.isArray(metricResult.rows)) {
                    throw new Error("The metrics API returned an invalid response.")
                }
                if (!Array.isArray(metricResult.by_day) ||
                    !Array.isArray(metricResult.by_horizon) ||
                    !Array.isArray(metricResult.by_wind_level) ||
                    !Array.isArray(metricResult.by_time_of_day)) {
                    throw new Error("The metrics API returned invalid breakdown data.")
                }

                setMetrics(metricResult)
                setBacktest(backtestResult)
            } catch (requestError) {
                if (!controller.signal.aborted) {
                    setMetrics(EMPTY_METRICS)
                    setBacktest(null)
                    setError(requestError instanceof Error ? requestError.message : String(requestError))
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }

        loadAccuracy()
        return () => controller.abort()
    }, [
        cutoffTime,
        fromDate,
        toDate,
        filters.history,
        filters.percentiles.lower,
        filters.percentiles.upper,
    ])

    const overall = metrics.overall
    const effectiveDates = useMemo(() => {
        const availableDates = metrics.by_day
            .map((row) => String(row.date_of_forecast).slice(0, 10))
            .filter(Boolean)
            .sort()
        return {
            from: fromDate || availableDates[0] || "",
            to: toDate || availableDates[availableDates.length - 1] || "",
        }
    }, [metrics.by_day, fromDate, toDate])
    const dateRange = `${formatDayMonth(effectiveDates.from)}–${formatDayMonth(effectiveDates.to)}`
    const watchList = [...metrics.by_day]
        .sort((a, b) => (b.mae ?? 0) - (a.mae ?? 0))
        .slice(0, 4)
        .map((row) => ({
            label: formatDayMonth(String(row.date_of_forecast).slice(0, 10)),
            value: formatMegawatts(row.mae),
            detail: `Bias ${formatMegawatts(row.bias, true)} · ${row.n} half-hours`,
        }))

    const summaryMetrics = [
        { label: "MAE", value: formatMegawatts(overall.mae), detail: "Mean absolute error" },
        { label: "RMSE", value: formatMegawatts(overall.rmse), detail: "Penalizes larger misses" },
        { label: "Bias", value: formatMegawatts(overall.bias, true), detail: "Forecast minus actual" },
        {
            label: "MAE as % of output",
            value: typeof overall.nmae_pct === "number" ? `${overall.nmae_pct.toFixed(1)}%` : "—",
            detail: "MAE relative to average output",
        },
        {
            label: "Over-forecast share",
            value: typeof overall.over_forecast_share === "number"
                ? `${(overall.over_forecast_share * 100).toFixed(1)}%`
                : "—",
            detail: "Forecast above actual",
        },
        { label: "P90 absolute error", value: formatMegawatts(overall.abs_error_p90), detail: "90% of misses are no larger" },
    ]

    return (
        <>
            <Filters view="accuracy" values={filters} onChange={onFiltersChange} />
            {error && <p className="accuracy-error" role="alert">Could not load accuracy data: {error}</p>}
            <section className="period-summary">
                <Card
                    tone="green"
                    metrics={summaryMetrics}
                    footer={`Based on ${Number(overall.n ?? 0).toLocaleString()} matched half-hours · ${dateRange} · ${cutoffTime} UTC cutoff`}
                />
                <Card tone="rose" eyebrow="Quick take">
                    <p className="quick-take-copy">
                        {loading
                            ? "Loading accuracy metrics…"
                            : overall.n
                                ? `Typical error is ${formatMegawatts(overall.mae)}. Forecast minus actual ranges from ${formatMegawatts(overall.error_p5, true)} to ${formatMegawatts(overall.error_p95, true)} for the selected percentiles.`
                                : "No matched forecast and actual data is available for this period."}
                    </p>
                    <p className="card-footer">
                        Error = forecast − actual. Positive bias means the forecast was higher than actual generation.
                    </p>
                </Card>
            </section>

            <section>
                <div className="section-header">
                    <p className="section-header-title">Forecast vs actual</p>
                    <p className="section-header-subtitle">
                        Decision-time forecasts before the {cutoffTime} UTC cutoff against actual generation · {dateRange}
                    </p>
                </div>
                <Card tone="light">
                    {loading
                        ? <p className="accuracy-empty">Loading forecast and actual data…</p>
                        : <ForecastActualChart rows={metrics.rows} />}
                </Card>
            </section>

            <section className="accuracy-breakdown accuracy-distribution">
                <div>
                    <div className="section-header">
                        <p className="section-header-title">How big are the misses?</p>
                        <p className="section-header-subtitle">Distribution of forecast errors across all half-hours</p>
                    </div>
                    <Card tone="light">
                        {loading
                            ? <p className="accuracy-empty">Loading error distribution…</p>
                            : <ForecastErrorHistogram rows={metrics.rows} />}
                    </Card>
                </div>

                <div>
                    <div className="section-header">
                        <p className="section-header-title">Does the range hold up?</p>
                        <p className="section-header-subtitle">
                            Actuals inside the P{filters.percentiles.lower}–P{filters.percentiles.upper} as-of range
                        </p>
                    </div>
                    <Card tone="light">
                        {loading
                            ? <p className="accuracy-empty">Calculating historical range coverage…</p>
                            : <CoverageChart backtest={backtest} />}
                    </Card>
                </div>
            </section>

            <section>
                <div className="section-header">
                    <p className="section-header-title">Where does the error come from?</p>
                    <p className="section-header-subtitle">
                        Explore typical error by delivery time, forecast horizon, wind level, or day
                    </p>
                </div>
                <section className="accuracy-breakdown-2">
                    <Card tone="light" className="accuracy-breakdown-card">
                        {loading
                            ? <p className="accuracy-empty">Loading error breakdown…</p>
                            : <BreakdownTabs metrics={metrics} />}
                    </Card>
                    <Card
                        tone="rose"
                        eyebrow="Watch list"
                        title="Days with the largest typical error"
                        list={watchList}
                    >
                        {loading && <p className="accuracy-empty">Loading daily errors…</p>}
                        {!loading && watchList.length === 0 && (
                            <p className="accuracy-empty">No daily errors are available for this period.</p>
                        )}
                    </Card>
                </section>
            </section>
        </>
    )
}
