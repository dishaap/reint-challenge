import { useEffect, useState } from "react";
import Filters from "../components/Filters";
import Card from "../components/Card";
import ForecastTable from "../components/ForecastTable";
import "./DayAheadView.css";

const CHART_WIDTH = 900
const CHART_HEIGHT = 320
const CHART_MARGIN = { top: 16, right: 18, bottom: 48, left: 72 }

/* ---------HELPERS-------- */

// get cutoff date (D-1)
function getPreviousDate(date) {
    if (!date) return ""
    
    const previousDate = new Date(`${date}T00:00:00Z`)
    previousDate.setUTCDate(previousDate.getUTCDate() - 1)
    return previousDate.toISOString().slice(0, 10)
}

// format date. ex: 05 Jan 2026
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

// alternate format for date. ex: 05 Jan
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

// round value to nearest integer (ceil) and return as str with +/- and MW
function formatMegawatts(value, signed = false) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—"

    const rounded = Math.round(value)
    const sign = signed && rounded > 0 ? "+" : ""
    return `${sign}${rounded.toLocaleString()} MW`
}

// format time as HH:MM (24h format)
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

// return Y-axis value for forecast chart
function chartY(value, max, plotTop, plotHeight) {
    return plotTop + plotHeight - (value / max) * plotHeight
}

// format axis labels by rounding to nearest int (ceil) and rendering to str
function formatAxisValue(value) {
    return Math.round(value).toLocaleString()
}

function formatCadence(milliseconds) {
    const minutes = Math.round(milliseconds / 60000)
    if (minutes === 30) return "Half-hourly data"
    if (minutes === 60) return "Hourly data"
    if (minutes % 60 === 0) return `${minutes / 60}-hourly data`
    return `${minutes}-minute data`
}

// render forecast chart
function ForecastChart({ rows, loading, error, forecastDate, band }) {
    if (!forecastDate) {
        return <p className="day-ahead-chart-message">Select a forecast date to view the chart.</p>
    }
    if (loading) {
        return <p className="day-ahead-chart-message" role="status">Loading forecast chart…</p>
    }
    if (error) {
        return <p className="day-ahead-chart-message" role="alert">Could not load forecast chart: {error}</p>
    }

    const points = rows
        .map((row) => ({
            ...row,
            timestamp: Date.parse(row.startTime),
        }))
        .filter((row) => Number.isFinite(row.timestamp))
        .sort((a, b) => a.timestamp - b.timestamp)
    const forecastPoints = points.filter((row) =>
        typeof row.forecast === "number" && Number.isFinite(row.forecast),
    )

    if (forecastPoints.length === 0) {
        return <p className="day-ahead-chart-message">No forecasts are available for this date and cutoff.</p>
    }

    const chartRows = points
    const plotLeft = CHART_MARGIN.left
    const plotTop = CHART_MARGIN.top
    const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
    const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom
    const startTime = chartRows[0].timestamp
    const endTime = chartRows[chartRows.length - 1].timestamp
    const timeSpan = endTime - startTime
    const x = (timestamp) => plotLeft + (
        timeSpan > 0 ? ((timestamp - startTime) / timeSpan) * plotWidth : plotWidth / 2
    )
    const intervals = chartRows.slice(1)
        .map((row, index) => row.timestamp - chartRows[index].timestamp)
        .filter((interval) => interval > 0)
        .sort((a, b) => a - b)
    const expectedInterval = intervals.length > 0
        ? intervals[Math.floor(intervals.length / 2)]
        : 30 * 60 * 1000
    const maxGap = expectedInterval * 1.5
    const maxValue = Math.max(
        ...forecastPoints.flatMap((row) => [
            row.forecast,
            row.lower,
            row.upper,
        ].filter((value) => typeof value === "number" && Number.isFinite(value))),
    )
    const yStep = Math.max(1000, Math.ceil(maxValue / 4 / 1000) * 1000)
    const yMax = yStep * 4
    const yTicks = Array.from({ length: 5 }, (_, index) => yStep * index)
    const forecastPaths = []
    let forecastSegment = []
    const rangePaths = []
    let rangeSegment = []

    function finishForecastSegment() {
        if (forecastSegment.length > 0) {
            forecastPaths.push(forecastSegment
                .map((row, index) =>
                    `${index === 0 ? "M" : "L"} ${x(row.timestamp)} ${chartY(row.forecast, yMax, plotTop, plotHeight)}`,
                )
                .join(" "))
        }
        forecastSegment = []
    }

    function finishRangeSegment() {
        if (rangeSegment.length >= 2) {
            const upperPath = rangeSegment
                .map((row, index) => `${index === 0 ? "M" : "L"} ${x(row.timestamp)} ${chartY(row.upper, yMax, plotTop, plotHeight)}`)
                .join(" ")
            const lowerPath = [...rangeSegment]
                .reverse()
                .map((row) => `L ${x(row.timestamp)} ${chartY(row.lower, yMax, plotTop, plotHeight)}`)
                .join(" ")
            rangePaths.push(`${upperPath} ${lowerPath} Z`)
        }
        rangeSegment = []
    }

    chartRows.forEach((row, index) => {
        const previousRow = chartRows[index - 1]
        const gapIsTooLarge = previousRow && row.timestamp - previousRow.timestamp > maxGap
        if (gapIsTooLarge) {
            finishForecastSegment()
            finishRangeSegment()
        }

        if (typeof row.forecast === "number" && Number.isFinite(row.forecast)) {
            forecastSegment.push(row)
        } else {
            finishForecastSegment()
        }

        if (
            typeof row.lower === "number" &&
            Number.isFinite(row.lower) &&
            typeof row.upper === "number" &&
            Number.isFinite(row.upper)
        ) {
            rangeSegment.push(row)
        } else {
            finishRangeSegment()
        }
    })
    finishForecastSegment()
    finishRangeSegment()

    const firstDate = new Date(startTime)
    const dayStart = Date.UTC(
        firstDate.getUTCFullYear(),
        firstDate.getUTCMonth(),
        firstDate.getUTCDate(),
    )
    const xTickTimes = [
        startTime,
        ...Array.from({ length: 6 }, (_, index) => dayStart + index * 4 * 60 * 60 * 1000)
            .filter((timestamp) => timestamp > startTime && timestamp < endTime),
        ...(endTime > startTime ? [endTime] : []),
    ]
    const rangeAvailable = band?.available && rangePaths.length > 0

    return (
        <div className="day-ahead-chart">
            <div className="day-ahead-chart-legend" aria-label="Chart legend">
                <span><i className="day-ahead-legend-forecast" /> Forecast</span>
                <span>
                    <i className="day-ahead-legend-range" />
                    {rangeAvailable
                        ? `P${band.lower_pct}–P${band.upper_pct} range`
                        : "Percentile range unavailable"}
                </span>
                {intervals.length > 0 && (
                    <span className="day-ahead-chart-cadence">
                        {formatCadence(expectedInterval)}
                    </span>
                )}
            </div>
            <div className="day-ahead-chart-scroll">
                <svg
                    className="day-ahead-chart-svg"
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    role="img"
                    aria-label={`Forecast generation for ${forecastDate}${intervals.length > 0 ? `, ${formatCadence(expectedInterval)}` : ""}${rangeAvailable ? ` with the P${band.lower_pct} to P${band.upper_pct} historical error range` : ""}`}
                >
                    {yTicks.map((tick) => {
                        const y = chartY(tick, yMax, plotTop, plotHeight)
                        return (
                            <g key={tick}>
                                <line
                                    x1={plotLeft}
                                    x2={CHART_WIDTH - CHART_MARGIN.right}
                                    y1={y}
                                    y2={y}
                                    className="day-ahead-chart-gridline"
                                />
                                <text
                                    x={plotLeft - 10}
                                    y={y + 4}
                                    textAnchor="end"
                                    className="day-ahead-chart-axis-label"
                                >
                                    {formatAxisValue(tick)}
                                </text>
                            </g>
                        )
                    })}
                    <text
                        x="15"
                        y={plotTop + plotHeight / 2}
                        transform={`rotate(-90 15 ${plotTop + plotHeight / 2})`}
                        textAnchor="middle"
                        className="day-ahead-chart-axis-title"
                    >
                        Generation (MW)
                    </text>
                    {rangePaths.map((path, index) => (
                        <path key={`range-${index}`} d={path} className="day-ahead-chart-range" />
                    ))}
                    {forecastPaths.map((path, index) => (
                        <path key={`forecast-${index}`} d={path} className="day-ahead-chart-forecast" />
                    ))}
                    {forecastPoints.map((row) => (
                        typeof row.forecast === "number" && Number.isFinite(row.forecast) ? (
                            <circle
                                key={row.startTime}
                                cx={x(row.timestamp)}
                                cy={chartY(row.forecast, yMax, plotTop, plotHeight)}
                                r="2.5"
                                className="day-ahead-chart-point"
                            >
                                <title>
                                    {`${formatTime(row.startTime)} UTC · Forecast ${formatMegawatts(row.forecast)}${typeof row.lower === "number" && typeof row.upper === "number" ? ` · P${band.lower_pct}–P${band.upper_pct} ${formatMegawatts(row.lower)}–${formatMegawatts(row.upper)}` : ""}`}
                                </title>
                            </circle>
                        ) : null
                    ))}
                    {xTickTimes.map((timestamp) => (
                        <text
                            key={timestamp}
                            x={x(timestamp)}
                            y={CHART_HEIGHT - 20}
                            textAnchor="middle"
                            className="day-ahead-chart-axis-label"
                        >
                            {formatTime(timestamp)}
                        </text>
                    ))}
                    <text
                        x={plotLeft + plotWidth / 2}
                        y={CHART_HEIGHT - 2}
                        textAnchor="middle"
                        className="day-ahead-chart-axis-title"
                    >
                        Forecast time (UTC)
                    </text>
                </svg>
            </div>
        </div>
    )
}

// get metrics for high, low, average and horizons for the date of forecast selected
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
            detail: `Across ${validRows.length} forecast periods`,
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

// render DayAhead page
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
                ? `${visibleStats.n.toLocaleString()} matched forecast periods in selected history`
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
        // error handling
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
                // quick summary of relevant historical stats and metadata on availability
                <Card
                    tone="green"
                    metrics={summaryMetrics}
                    footer={decisionDate
                            ? `Forecasts published after ${filters.cutoffTime || "12:00"} UTC on ${formatDate(decisionDate)} are not used. Actuals for ${formatDate(forecastDate)} are not used to estimate historical MAE and bias.`
                            : "No forecast date selected."}
                />

                // quick view on average, high, low of forecast for the date
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
                    <p className="section-header-title">Forecast generation over delivery day</p>
                    <p className="section-header-subtitle">
                        {forecastDate
                            ? `Latest forecast available at ${filters.cutoffTime || "12:00"} UTC on ${formatDate(decisionDate)} for ${formatDate(forecastDate)}, with the range implied by past errors.`
                            : "Select a forecast date to see the forecast period."}
                    </p>
                </div>

                // hourly forecast data represented as graph with area graph for hi-lo percentiles to understand error
                <section className="forecast-stats">
                    <Card tone="light" eyebrow="Graph" className="day-ahead-chart-card">
                        <ForecastChart
                            rows={forecastRows}
                            loading={isLoadingForecasts}
                            error={forecastError}
                            forecastDate={forecastDate}
                            band={visibleBand}
                        />
                    </Card>

                    // expanded version of quick take
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
                // hourly data represented as table
                <div className="section-header">
                    <p className="section-header-title">Forecast Table</p>
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
