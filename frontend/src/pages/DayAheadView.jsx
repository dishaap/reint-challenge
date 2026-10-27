import Filters from "../components/Filters";
import Card from "../components/Card";

const summaryMetrics = [
    { label: "Data up to", value: "13 Jan, 12:00 UTC", detail: "Decision time (D-1 cutoff)" },
    { label: "Forecast range", value: "Available", detail: "Built from 12 days of past errors" },
    { label: "Historical MAE", value: "1,852 MW", detail: "Typical miss in this history" },
    { label: "Bias", value: "+486 MW", detail: "Forecast ran slightly high" },
    { label: "History used", value: "12 days", detail: "All available before cutoff" },
]

const dailyMetrics = [
    { label: "Peak", value: "12,272 MW", detail: "at 1:00 | range: 8185 - 15984 MW" },
    { label: "Lowest", value: "6,471 MW", detail: "at 12:00 · range 2,353–10,092" },
    { label: "Average", value: "9,927 MW", detail: "across 48 half-hours" },
    { label: "Forecast Age", value: "12.5 - 36h", detail: "published 13 Jan, 11:30" }
]

export default function DayAheadView() {
    return (
        <>
            <Filters view="day-ahead" />
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
                    <p className="section-header-subtitle">Latest forecast available at 12:00 UTC on 13 Jan for 14 Jan 2026, with the range implied by past errors</p>
                </div>
                <section className="forecast-stats">
                    <Card tone="white" eyebrow="Graph"></Card>
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
        </>
    )
}
