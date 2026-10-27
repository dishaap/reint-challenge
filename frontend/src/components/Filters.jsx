import Dropdown from "./Dropdown";

const filtersByView = {
    "day-ahead": ["Date of Forecast", "Cutoff Time", "History", "Error Range"],
    "accuracy": ["From", "To", "Cutoff Time", "History", "Error Range"],
}

const dateFilterLabels = new Set(["Date of Forecast", "From", "To"]);

function shiftDate(date, days) {
    if (!date) return undefined;

    const shiftedDate = new Date(`${date}T00:00:00Z`);
    shiftedDate.setUTCDate(shiftedDate.getUTCDate() + days);
    return shiftedDate.toISOString().slice(0, 10);
}

export default function Filters({ view, values, onChange }) {
    const filters = filtersByView[view]
    const { dates, cutoffTime, history, percentiles } = values

    function updateDate(label, value) {
        if (
            view === "accuracy" &&
            ((label === "From" && dates.To && value >= dates.To) ||
                (label === "To" && dates.From && value <= dates.From))
        ) {
            return
        }

        onChange({ dates: { ...dates, [label]: value } })
    }

    return(
        <div className="filters-container">
            {filters.map((label) => {
                if (
                    label === "History" ||
                    label === "Cutoff Time" ||
                    dateFilterLabels.has(label)
                ) {
                    const inputId = `${view}-${label.toLowerCase().replaceAll(" ", "-")}`

                    return (
                        <div key={label} className="dropdown filter-control">
                            <label className="dropdown-label" htmlFor={inputId}>
                                {label}
                            </label>
                            {label === "History" ? (
                                <select
                                    id={inputId}
                                    className="dropdown-trigger filter-input history-select"
                                    value={history}
                                    onChange={(event) => onChange({ history: event.target.value })}
                                >
                                    <option>All available</option>
                                    <option>Past 7 days</option>
                                    <option>Past 14 days</option>
                                </select>
                            ) : label === "Cutoff Time" ? (
                                <input
                                    id={inputId}
                                    className="dropdown-trigger filter-input"
                                    type="time"
                                    step="60"
                                    value={cutoffTime}
                                    onChange={(event) => onChange({ cutoffTime: event.target.value })}
                                />
                            ) : (
                                <input
                                    id={inputId}
                                    className="dropdown-trigger filter-input"
                                    type="date"
                                    value={dates[label] ?? ""}
                                    max={view === "accuracy" && label === "From"
                                        ? shiftDate(dates.To, -1)
                                        : undefined}
                                    min={view === "accuracy" && label === "To"
                                        ? shiftDate(dates.From, 1)
                                        : undefined}
                                    onChange={(event) => updateDate(label, event.target.value)}
                                />
                            )}
                            {label === "History" && (
                                <span className="dropdown-chevron" aria-hidden="true" />
                            )}
                        </div>
                    )
                }

                return (
                    <Dropdown
                        key={label}
                        label={label}
                        selectedValue={`P${percentiles.lower} - P${percentiles.upper}`}
                    >
                    {label === "Error Range" && (
                        <div className="percentile-control">
                            <div className="percentile-values" aria-live="polite">
                                <span>Lower: P{percentiles.lower}</span>
                                <span>Upper: P{percentiles.upper}</span>
                            </div>
                            <div className="percentile-slider">
                                <div
                                    className="percentile-slider-track"
                                    style={{
                                        background: `linear-gradient(to right, var(--color-2) ${percentiles.lower}%, var(--color-1) ${percentiles.lower}%, var(--color-1) ${percentiles.upper}%, var(--color-2) ${percentiles.upper}%)`,
                                    }}
                                />
                                <input
                                    type="range"
                                    aria-label="Lower percentile"
                                    min="0"
                                    max={percentiles.upper}
                                    step="5"
                                    value={percentiles.lower}
                                    className="percentile-slider-input lower"
                                    onChange={(event) => {
                                        onChange({
                                            percentiles: {
                                                ...percentiles,
                                                lower: Number(event.target.value),
                                            },
                                        })
                                    }}
                                />
                                <input
                                    type="range"
                                    aria-label="Upper percentile"
                                    min={percentiles.lower}
                                    max="100"
                                    step="5"
                                    value={percentiles.upper}
                                    className="percentile-slider-input upper"
                                    onChange={(event) => {
                                        onChange({
                                            percentiles: {
                                                ...percentiles,
                                                upper: Number(event.target.value),
                                            },
                                        })
                                    }}
                                />
                            </div>
                        </div>
                    )}
                    </Dropdown>
                )
            })}
        </div>
    )
}