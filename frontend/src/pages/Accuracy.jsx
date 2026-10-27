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

function ForecastActualChart({ rows }) {
    const points = rows.filter(
        (row) =>
            typeof row.forecast === "number" &&
            Number.isFinite(row.forecast) &&
            typeof row.actual === "number" &&
            Number.isFinite(row.actual),
    )

    if (points.length === 0) {
        return <p className="accuracy-empty">No forecast/actual pairs for this period.</p>
    }

    const { min, max } = points.reduce(
        (range, row) => ({
            min: Math.min(range.min, row.forecast, row.actual),
            max: Math.max(range.max, row.forecast, row.actual),
        }),
        { min: Infinity, max: -Infinity },
    )
    const span = max - min || 1
    const getPolyline = (key) => points.map((row, index) => {
        const x = points.length === 1 ? 500 : (index / (points.length - 1)) * 1000
        const y = 280 - ((row[key] - min) / span) * 250
        return `${x},${y}`
    }).join(" ")

    return (
        <div className="accuracy-chart-wrap">
            <div className="accuracy-chart-legend">
                <span><i className="accuracy-legend-forecast" /> Forecast</span>
                <span><i className="accuracy-legend-actual" /> Actual</span>
            </div>
            <svg
                className="accuracy-line-chart"
                viewBox="0 0 1000 300"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Forecast and actual generation across ${points.length} half-hour periods`}
            >
                {[30, 155, 280].map((y) => (
                    <line key={y} x1="0" x2="1000" y1={y} y2={y} className="accuracy-chart-gridline" />
                ))}
                <polyline points={getPolyline("forecast")} className="accuracy-line-forecast" />
                <polyline points={getPolyline("actual")} className="accuracy-line-actual" />
            </svg>
            <div className="accuracy-chart-range">
                <span>{formatDayMonth(points[0].startTime?.slice(0, 10))}</span>
                <span>{formatDayMonth(points[points.length - 1].startTime?.slice(0, 10))}</span>
            </div>
        </div>
    )
}

function BreakdownTable({ rows, labelKey }) {
    if (rows.length === 0) {
        return <p className="accuracy-empty">No breakdown data for this period.</p>
    }

    return (
        <div className="accuracy-table-scroll">
            <table className="accuracy-table">
                <thead>
                    <tr>
                        <th>{labelKey === "date_of_forecast" ? "Date" : "Group"}</th>
                        <th>Half-hours</th>
                        <th>MAE</th>
                        <th>Bias</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={String(row[labelKey])}>
                            <td>{labelKey === "date_of_forecast"
                                ? formatDayMonth(String(row[labelKey]).slice(0, 10))
                                : String(row[labelKey])}
                            </td>
                            <td>{Number(row.n ?? 0).toLocaleString()}</td>
                            <td>{formatMegawatts(row.mae)}</td>
                            <td>{formatMegawatts(row.bias, true)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
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

    const percentileMetrics = [5, 25, 50, 75, 95]
        .filter((percentile) => typeof overall[`error_p${percentile}`] === "number")
        .map((percentile) => ({
            label: `P${percentile}`,
            value: formatMegawatts(overall[`error_p${percentile}`], true),
        }))

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
                    <p className="section-header-title">Forecast vs Actual</p>
                    <p className="section-header-subtitle">
                        Decision-time forecasts before the {cutoffTime} UTC cutoff · {dateRange}
                    </p>
                </div>
                <Card tone="light">
                    {loading
                        ? <p className="accuracy-empty">Loading forecast and actual data…</p>
                        : <ForecastActualChart rows={metrics.rows} />}
                </Card>
            </section>

            <section className="accuracy-breakdown">
                <div>
                    <div className="section-header">
                        <p className="section-header-title">How big are the misses?</p>
                        <p className="section-header-subtitle">Forecast error percentiles for the selected period</p>
                    </div>
                    <Card tone="light">
                        {loading
                            ? <p className="accuracy-empty">Loading error distribution…</p>
                            : percentileMetrics.length > 0
                                ? <div className="accuracy-percentiles">
                                    {percentileMetrics.map((item) => (
                                        <div className="accuracy-percentile" key={item.label}>
                                            <span>{item.label}</span>
                                            <strong>{item.value}</strong>
                                        </div>
                                    ))}
                                </div>
                                : <p className="accuracy-empty">No error distribution is available.</p>}
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
                            : backtest?.overall_coverage != null
                                ? <>
                                    <p className="coverage-value">
                                        {(backtest.overall_coverage * 100).toFixed(1)}%
                                    </p>
                                    <p className="accuracy-empty">
                                        Target coverage: {(backtest.nominal_coverage * 100).toFixed(0)}%
                                    </p>
                                    <div className="coverage-days">
                                        {backtest.per_day.map((day) => (
                                            <div className="coverage-day" key={day.date_of_forecast}>
                                                <span>{formatDayMonth(day.date_of_forecast)}</span>
                                                <span>{(day.coverage * 100).toFixed(0)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                                : <p className="accuracy-empty">No backtest range is available for the selected period.</p>}
                    </Card>
                </div>
            </section>

            <section>
                <div className="section-header">
                    <p className="section-header-title">Where does the error come from?</p>
                    <p className="section-header-subtitle">MAE and bias split by forecast horizon and actual wind level</p>
                </div>
                <section className="accuracy-breakdown">
                    <Card tone="light" title="By forecast horizon">
                        {loading
                            ? <p className="accuracy-empty">Loading horizon breakdown…</p>
                            : <BreakdownTable rows={metrics.by_horizon} labelKey="horizon_bucket" />}
                    </Card>
                    <Card tone="light" title="By wind level">
                        {loading
                            ? <p className="accuracy-empty">Loading wind-level breakdown…</p>
                            : <BreakdownTable rows={metrics.by_wind_level} labelKey="wind_level" />}
                    </Card>
                    <Card tone="light" title="By delivery time">
                        {loading
                            ? <p className="accuracy-empty">Loading delivery-time breakdown…</p>
                            : <BreakdownTable rows={metrics.by_time_of_day} labelKey="time_of_day" />}
                    </Card>
                </section>
            </section>

            <section>
                <div className="section-header">
                    <p className="section-header-title">Days with the largest typical error</p>
                    <p className="section-header-subtitle">Highest daily MAE in the selected date range</p>
                </div>
                <Card
                    tone="rose"
                    eyebrow="Watch list"
                    list={watchList}
                >
                    {loading && <p className="accuracy-empty">Loading daily errors…</p>}
                    {!loading && watchList.length === 0 && (
                        <p className="accuracy-empty">No daily errors are available for this period.</p>
                    )}
                </Card>
            </section>
        </>
    )
}
