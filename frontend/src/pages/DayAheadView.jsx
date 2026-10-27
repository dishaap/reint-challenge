import { useEffect, useState } from "react";
import Filters from "../components/Filters";
import Card from "../components/Card";
import ForecastTable from "../components/ForecastTable";

const summaryMetrics = [
    { label: "Data up to", value: "13 Jan, 12:00 UTC", detail: "Decision time (D-1 cutoff)" },
    { label: "Forecast range", value: "Available", detail: "Built from 12 days of past errors" },
    { label: "Historical MAE", value: "1,852 MW", detail: "Typical miss in this history" },
    { label: "Bias", value: "+486 MW", detail: "Forecast ran slightly high" },
    { label: "History used", value: "12 days", detail: "All available before cutoff" },
]

const dailyMetrics = [
    { label: "Peak", value: "12,272 MW", detail: "At 01:00 UTC" },
    { label: "Lowest", value: "6,471 MW", detail: "At 12:00 UTC" },
    { label: "Average", value: "9,927 MW", detail: "Across 48 half-hours" },
    { label: "Forecast age", value: "12.5–36 h", detail: "Published 13 Jan, 11:30 UTC" },
]

function getPreviousDate(date) {
    if (!date) return ""

    const previousDate = new Date(`${date}T00:00:00Z`)
    previousDate.setUTCDate(previousDate.getUTCDate() - 1)
    return previousDate.toISOString().slice(0, 10)
}

function formatDate(date) {
    if (!date) return "—"

    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`))
}

export default function DayAheadView({ filters, onFiltersChange }) {
    const forecastDate = filters.dates["Date of Forecast"] ?? ""
    const decisionDate = getPreviousDate(forecastDate)
    const [forecastRows, setForecastRows] = useState([])
    const [isLoadingForecasts, setIsLoadingForecasts] = useState(false)
    const [forecastError, setForecastError] = useState("")

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

            try {
                const apiBase = (import.meta.env.VITE_API_URL || "http://localhost:8000")
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

                setForecastRows(result.rows)
            } catch (error) {
                if (!controller.signal.aborted) {
                    setForecastRows([])
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
                    footer="Forecasts published after 12:00 UTC on 13 Jan are not used · times in UTC"
                />
                <Card
                    tone="rose"
                    eyebrow="Quick take"
                    style={{
                        paddingTop: "1.75rem"
                    }}
                >
                    <p className="quick-take-copy">
                        Wind is forecast to average 9,927 MW on 14 Jan, from 6,471 MW
                        at 12:00 up to 12,272 MW at 00:00.
                    </p>
                    <p className="card-footer">
                        9 in 10 past half-hours, actual output landed between 4,118 MW
                        below and 3,621 MW above the forecast.
                    </p>
                </Card>
            </section>
            <div>
                <div className="section-header">
                    <p className="section-header-title">Forecast generation by half-hour</p>
                    <p className="section-header-subtitle">
                        Latest forecast available at {filters.cutoffTime || "12:00"} UTC
                        {" on "}{formatDate(decisionDate)}{" for "}{formatDate(forecastDate)},
                        {" with the range implied by past errors."}
                    </p>
                </div>
                <section className="forecast-stats">
                    <Card tone="light" eyebrow="Graph"></Card>
                    <Card
                        tone="rose"
                        title="14 Jan 2026"
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
                        Latest forecast available at {filters.cutoffTime || "12:00"} UTC
                        {" on "}{formatDate(decisionDate)}{" for "}{formatDate(forecastDate)},
                        {" in table format."}
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
