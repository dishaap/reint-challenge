import './ForecastTable.css'

function formatUtcDateTime(value) {
    if (!value) return '—'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
        hourCycle: 'h23',
    }).format(date)
}

export default function ForecastTable({
    rows,
    loading = false,
    error = '',
    forecastDate = '',
}) {
    return (
        <section className="forecast-table-section">
            {!forecastDate ? (
                <p className="forecast-table-message">
                    Select a forecast date to view forecasts.
                </p>
            ) : loading ? (
                <p className="forecast-table-message" role="status">
                    Loading forecasts…
                </p>
            ) : error ? (
                <p className="forecast-table-message forecast-table-error" role="alert">
                    Could not load forecasts: {error}
                </p>
            ) : rows.length === 0 ? (
                <p className="forecast-table-message">
                    No forecasts are available for this date and cutoff.
                </p>
            ) : (
                <div className="forecast-table-scroll">
                    <table className="forecast-table">
                        <thead>
                            <tr>
                                <th scope="col">Publish time (UTC)</th>
                                <th scope="col">Time of forecast (UTC)</th>
                                <th scope="col">Forecasted generation (MW)</th>
                                <th scope="col">Horizon (hours)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.startTime ?? row.starttime}>
                                    <td>{formatUtcDateTime(row.publishTime ?? row.publishtime)}</td>
                                    <td>{formatUtcDateTime(row.startTime ?? row.starttime)}</td>
                                    <td>
                                        {Number.isFinite(Number(row.forecast))
                                            ? Number(row.forecast).toLocaleString()
                                            : '—'}
                                    </td>
                                    <td>
                                        {Number.isFinite(Number(row.horizon_hours))
                                            ? Number(row.horizon_hours).toFixed(1)
                                            : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}
