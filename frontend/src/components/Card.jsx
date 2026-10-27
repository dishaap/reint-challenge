import './Card.css'

const toneClasses = {
    green: 'card--green',
    rose: 'card--rose',
    light: 'card--light',
}

export default function Card({
    as: Element = 'div',
    className = '',
    tone = 'light',
    eyebrow,
    title,
    subtitle,
    metrics = [],
    list = [],
    footer,
    children,
    ...props
}) {
    const classes = ['card', toneClasses[tone] ?? toneClasses.light, className]
        .filter(Boolean)
        .join(' ')

    return (
        <Element className={classes} {...props}>
            {eyebrow && (
                <p className="card-eyebrow">
                    {eyebrow}
                </p>
            )}
            {title && (
                <h2 className="card-title">
                    {title}
                </h2>
            )}
            {subtitle && (
                <p className="card-subtitle">
                    {subtitle}
                </p>
            )}
            {metrics.length > 0 && (
                <dl className="card-metrics">
                    {metrics.map(({ label, value, detail }) => (
                        <div key={label} className="card-metric">
                            <dt className="card-metric-label">{label}</dt>
                            <dd className="card-metric-value">
                                {value}
                            </dd>
                            {detail && (
                                <p className="card-metric-detail">{detail}</p>
                            )}
                        </div>
                    ))}
                </dl>
            )}
            {list.length > 0 && (
                <dl className="card-list">
                    {list.map(({ label, value, detail }) => (
                        <div key={label} className="card-list-item">
                            <dt className="card-list-label">{label}</dt>
                            <dd className="card-list-value">{value}</dd>
                            {detail && (
                                <dd className="card-list-detail">{detail}</dd>
                            )}
                        </div>
                    ))}
                </dl>
            )}
            {children}
            {footer && (
                <footer className="card-footer">
                    {footer}
                </footer>
            )}
        </Element>
    )
}
