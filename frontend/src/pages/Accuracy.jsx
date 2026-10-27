import Filters from "../components/Filters";
import Card from "../components/Card";

export default function Accuracy() {
    const summaryMetrics = [
        { label: "MAE", value: "2,013 MW", detail: "Typical miss" },
        { label: "RMSE", value: "2,518 MW", detail: "Weighs big misses more" },
        { label: "Bias", value: "+296 MW", detail: "Forecast ran slightly high" },
        { label: "MAE as % of output", value: "19%", detail: "Miss vs average output" },
        { label: "Over-forecast share", value: "54%", detail: "Forecast above actual generation" },
        { label: "P90 Absolute Error", value: "4,154 MW", detail: "9 in 10 are smaller" },
    ]

    const watchList = [
        { label: "21 Jan", value: "4,700 MW", detail: "bias +4,700 MW" },
        { label: "9 Jan", value: "6,471 MW", detail: "bias +6,471 MW" },
        { label: "31 Jan", value: "-927 MW", detail: "bias -927 MW" },
        { label: "28 Jan", value: "-3,342 MW", detail: "bias -3,342 MW" }
    ]

    return (
        <>
            <Filters view="accuracy" />
            <section className="period-summary">
                <Card
                    tone="green"
                    metrics={summaryMetrics}
                    footer="Based on 1,488 half-hours · 1–31 Jan 2026 · 12:00 UTC cutoff on D-1 · times in UTC"
                />
                <Card
                    tone="rose"
                    eyebrow="Quick take"
                    style={{
                        paddingTop: "1.75rem"
                    }}
                >
                    <p className="quick-take-copy">
                        Typically off by about 2,013 MW. In 9 of 10 half-hours, forecast minus actual fell between −3,966 and +4,303 MW.
                    </p>
                    <p className="card-footer">
                        Error = forecast − actual. Positive means the forecast was too high, so a buyer relying on it would under-buy.
                    </p>
                </Card>
            </section>
            <div>
                <div className="section-header">
                    <p className="section-header-title">Forecast vs Actual</p>
                    <p className="section-header-subtitle">Decision-time forecasts (latest published before the 12:00 UTC cutoff) against actual generation, 1–31 Jan 2026</p>
                </div>
                <section className="forecast-actual-stats">
                    <Card tone="white" eyebrow="Graph"></Card>
                </section>
            </div>

            <div className="accuracy-breakdown">
                <div>
                    <div className="section-header">
                        <p className="section-header-title">How big are the misses?</p>
                        <p className="section-header-subtitle">Distribution of forecast error across all half-hours</p>
                    </div>
                    <section className="forecast-actual-stats">
                        <Card tone="white" eyebrow="Graph"></Card>
                    </section>
                </div>

                <div>
                    <div className="section-header">
                        <p className="section-header-title">Does the range hold up?</p>
                        <p className="section-header-subtitle">Actuals inside the P5–P95 range, built from earlier errors only</p>
                    </div>
                    <section className="forecast-actual-stats">
                        <Card tone="white" eyebrow="Graph"></Card>
                    </section>
                </div>
            </div>

            <div>
                <div className="section-header">
                    <p className="section-header-title">Where does the error come from?</p>
                    <p className="section-header-subtitle">Typical error (MAE) split by when the forecast was made for and how the wind was blowing</p>
                </div>
                <section className="forecast-stats">
                    <Card tone="white" eyebrow="Graph"></Card>
                    <Card
                        tone="rose"
                        title="14 Jan 2026"
                        eyebrow="Day at a Glance"
                        list={watchList}
                        style={{
                            paddingTop: "1rem",
                        }}
                        footer="Select a day to open it in the Day-Ahead view →"
                    >
                    </Card>
                </section>
            </div>
        </>
    )
}
