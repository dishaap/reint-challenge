import { useEffect, useState } from "react";
import Filters from "../components/Filters";
import Card from "../components/Card";
import ForecastTable from "../components/ForecastTable";


function getPreviousDate(date) {
    if (!date) return ""
    
    const previousDate = new Date(`${date}T00:00:00Z`)
    previousDate.setUTCDate(previousDate.getUTCDate() - 1)
    return previousDate.toISOString().slice(0, 10)
}

function formatDate(date) {
    if (!date) return "—"

    const parsedDate = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsedDate.getTime())) return "—"

    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(parsedDate)
}

function formatDayMonth(date) {
    if (!date) return "—"

    const parsedDate = new Date(`${date}T00:00:00Z`)
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
    const sign = signed && rounded > 0 ? "+" : ""
    return `${sign}${rounded.toLocaleString()} MW`
}

function formatTime(dateTime) {
    if (!dateTime) return "—"

    const parsedDate = new Date(dateTime)
    if (Number.isNaN(parsedDate.getTime())) return "—"

    return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC",
    }).format(parsedDate)
}

function getDailyMetrics(rows) {
    const validRows = rows.filter(
        (row) => typeof row.forecast === "number" && Number.isFinite(row.forecast),
    )
    if (validRows.length === 0) return []

    const peak = validRows.reduce((highest, row) =>
        row.forecast > highest.forecast ? row : highest,
    )
    const lowest = validRows.reduce((smallest, row) =>
        row.forecast < smallest.forecast ? row : smallest,
    )
    const average = validRows.reduce((sum, row) => sum + row.forecast, 0) / validRows.length
    const horizons = validRows
        .map((row) => row.horizon_hours)
        .filter((value) => typeof value === "number" && Number.isFinite(value))

    function bandDetail(row) {
        if (typeof row.lower !== "number" || typeof row.upper !== "number") return ""
        return ` · range ${formatMegawatts(row.lower)}–${formatMegawatts(row.upper)}`
    }

    return [
        {
            label: "Peak",
            value: formatMegawatts(peak.forecast),
            detail: `At ${formatTime(peak.startTime)} UTC${bandDetail(peak)}`,
        },
        {
            label: "Lowest",
            value: formatMegawatts(lowest.forecast),
            detail: `At ${formatTime(lowest.startTime)} UTC${bandDetail(lowest)}`,
        },
        {
            label: "Average",
            value: formatMegawatts(average),
            detail: `Across ${validRows.length} half-hours`,
        },
        {
            label: "Forecast age",
            value: horizons.length > 0
                ? `${Math.min(...horizons).toFixed(1)}–${Math.max(...horizons).toFixed(1)} h`
                : "—",
            detail: "Horizon across available forecasts",
        },
    ]
}

export default function DayAheadView({ filters, onFiltersChange }) {
    const forecastDate = filters.dates["Date of Forecast"] ?? ""
    const decisionDate = getPreviousDate(forecastDate)
    const [forecastRows, setForecastRows] = useState([])
    const [historicalStats, setHistoricalStats] = useState(null)
    const [forecastBand, setForecastBand] = useState(null)
    const [isLoadingForecasts, setIsLoadingForecasts] = useState(false)
    const [forecastError, setForecastError] = useState("")
    
    const visibleStats = forecastDate ? historicalStats : null
    const visibleBand = forecastDate ? forecastBand : null
    const dailyMetrics = getDailyMetrics(forecastDate ? forecastRows : [])
    const validForecasts = forecastDate
        ? forecastRows.filter(
            (row) => typeof row.forecast === "number" && Number.isFinite(row.forecast),
        )
        : []
    const peakForecast = dailyMetrics.find((metric) => metric.label === "Peak")
    const lowestForecast = dailyMetrics.find((metric) => metric.label === "Lowest")
    const averageForecast = dailyMetrics.find((metric) => metric.label === "Average")
    const peakRow = validForecasts.reduce(
        (current, row) => !current || row.forecast > current.forecast ? row : current,
        null,
    )
    const lowestRow = validForecasts.reduce(
        (current, row) => !current || row.forecast < current.forecast ? row : current,
        null,
    )
    const hasStats = visibleStats?.status === "ok"
    const hasInsufficientHistory = visibleStats?.status === "insufficient_history"
    const summaryMetrics = [
        {
            label: "Data up to",
            value: `${formatDayMonth(decisionDate)}, ${filters.cutoffTime || "12:00"}`,
            detail: "UTC · D-1 cutoff",
        },
        {
            label: "Forecast range",
            value: visibleBand === null ? "—" : visibleBand.available ? "Available" : "Unavailable",
            detail: visibleBand?.available
                ? `P${visibleBand.lower_pct}–P${visibleBand.upper_pct} range`
                : visibleBand
                    ? "Not enough eligible history"
                    : "Select a forecast date",
        },
        {
            label: "History used",
            value: filters.history === "All available"
                ? visibleStats
                    ? `${visibleStats.history_days} days`
                    : "—"
                : `${filters.history === "Past 7 days" ? 7 : 14}-day window`,
            detail: visibleStats
                ? `${visibleStats.n.toLocaleString()} half-hours in selected history`
                : "Select a forecast date",
        },
        {
            label: "Bias",
            value: hasStats ? formatMegawatts(historicalStats.bias, true) : "—",
            detail: hasInsufficientHistory
                ? "Not enough history"
                : hasStats
                    ? "Average forecast minus actual"
                    : "Requires historical forecasts and actuals",
        },
        {
            label: "Historical MAE",
            value: hasStats ? formatMegawatts(historicalStats.mae) : "—",
            detail: hasInsufficientHistory
                ? "Not enough history"
                : hasStats
                    ? "Average absolute forecast error"
                    : "Requires historical forecasts and actuals",
        },
    ]

    useEffect(() => {
        if (!forecastDate) {
            return undefined
        }

        const controller = new AbortController()
        const params = new URLSearchParams({
            cutoff: filters.cutoffTime || "12:00",
            lower_pct: String(filters.percentiles.lower),
            upper_pct: String(filters.percentiles.upper),
        })

        if (filters.history !== "All available") {
            params.set("window_days", filters.history === "Past 7 days" ? "7" : "14")
        }

        async function loadForecasts() {
            setIsLoadingForecasts(true)
            setForecastError("")
            setForecastRows([])
            setHistoricalStats(null)
            setForecastBand(null)

            try {
                const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
                const isLocalhostUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiUrl || "")
                const apiBase = (import.meta.env.PROD && isLocalhostUrl
                    ? ""
                    : configuredApiUrl || (import.meta.env.DEV ? "http://localhost:8000" : ""))
                    .replace(/\/+$/, "")
                const response = await fetch(
                    `${apiBase}/api/forecast/${forecastDate}?${params}`,
                    { signal: controller.signal },
                )
                const result = await response.json()

                if (!response.ok) {
                    throw new Error(result.detail || `Request failed (${response.status})`)
                }

                if (!Array.isArray(result.rows)) {
                    throw new Error("The forecast API returned an invalid rows value.")
                }
                if (!result.asof_stats || typeof result.asof_stats !== "object") {
                    throw new Error("The forecast API returned invalid historical statistics.")
                }
                if (!result.band || typeof result.band.available !== "boolean") {
                    throw new Error("The forecast API returned invalid forecast range availability.")
                }

                setForecastRows(result.rows)
                setHistoricalStats(result.asof_stats)
                setForecastBand(result.band)
            } catch (error) {
                if (!controller.signal.aborted) {
                    setForecastRows([])
                    setHistoricalStats(null)
                    setForecastBand(null)
                    setForecastError(error instanceof Error ? error.message : String(error))
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoadingForecasts(false)
                }
            }
        }

        loadForecasts()
        return () => controller.abort()
    }, [forecastDate, filters.cutoffTime, filters.history, filters.percentiles])

    return (
        <>
            <Filters
                view="day-ahead"
                values={filters}
                onChange={onFiltersChange}
            />
            <section className="day-ahead-summary">
                <Card
                    tone="green"
                    metrics={summaryMetrics}
                    footer={decisionDate
                            ? `Forecasts published after ${filters.cutoffTime || "12:00"} UTC on ${formatDate(decisionDate)} are not used. Actuals for ${formatDate(forecastDate)} are not used to estimate historical MAE and bias.`
                            : "No forecast date selected."}
                />
                <Card
                    tone="rose"
                    eyebrow="Quick take"
                    style={{
                        paddingTop: "1.75rem"
                    }}
                >
                    {isLoadingForecasts ? (
                        <p className="quick-take-copy">Loading forecast summary…</p>
                    ) : forecastError ? (
                        <p className="quick-take-copy">Forecast summary is unavailable.</p>
                    ) : peakRow && lowestRow && averageForecast ? (
                        <p className="quick-take-copy">
                            Forecast generation averages {averageForecast.value} on {formatDate(forecastDate)},
                            ranging from {lowestForecast.value} at {formatTime(lowestRow.startTime)} UTC
                            to {peakForecast.value} at {formatTime(peakRow.startTime)} UTC.
                        </p>
                    ) : (
                        <p className="quick-take-copy">
                            {forecastDate
                                ? "No forecast data is available for this date and cutoff."
                                : "Select a forecast date to view the forecast summary."}
                        </p>
                    )}
                    <p className="card-footer">
                        {isLoadingForecasts
                            ? "Calculating the selected historical forecast range…"
                            : visibleBand?.available
                                ? `P${visibleBand.lower_pct}–P${visibleBand.upper_pct} range calculated using ${filters.history.toLowerCase()} history.`
                                : visibleBand
                                    ? "The forecast range is unavailable because there is not enough eligible history."
                                    : "Select a forecast date to see its historical range."}
                    </p>
                </Card>
            </section>
            <div>
                <div className="section-header">
                    <p className="section-header-title">Forecast generation by half-hour</p>
                    <p className="section-header-subtitle">
                        {forecastDate
                            ? `Latest forecast available at ${filters.cutoffTime || "12:00"} UTC on ${formatDate(decisionDate)} for ${formatDate(forecastDate)}, with the range implied by past errors.`
                            : "Select a forecast date to see the forecast period."}
                    </p>
                </div>
                <section className="forecast-stats">
                    <Card tone="light" eyebrow="Graph"></Card>
                    <Card
                        tone="rose"
                        title={formatDate(forecastDate)}
                        eyebrow="Day at a Glance"
                        list={dailyMetrics}
                        style={{
                            paddingTop: "1rem",
                            paddingBottom: "1rem"
                        }}
                    >
                    </Card>
                </section>
            </div>
            <div>
                <div className="section-header">
                    <p className="section-header-title">Half-Hour Forecast Table</p>
                    <p className="section-header-subtitle">
                        {forecastDate
                            ? `Latest forecast available at ${filters.cutoffTime || "12:00"} UTC on ${formatDate(decisionDate)} for ${formatDate(forecastDate)}, in table format.`
                            : "Select a forecast date to see the forecast table."}
                    </p>
                </div>
                <ForecastTable
                    rows={forecastRows}
                    loading={isLoadingForecasts}
                    error={forecastError}
                    forecastDate={forecastDate}
                />
            </div>
        </>
    )
}
