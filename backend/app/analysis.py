from datetime import time, date

import pandas as pd
import numpy as np

"""GLOBAL VARIABLES"""
DEFAULT_CUTOFF = time(12, 0) # set default time for cutoff on D-1 for considering forecasts for buying decisions
PERCENTILES = (5, 25, 50, 75, 95) # percentiles for error metrics

HORIZON_INTERVALS = [0, 12, 24, 36, 48, np.inf]
HORIZON_LABELS = ["0-12h", "12-24h", "24-36h", "36-48h", "48h+"]

PERIOD = pd.Timedelta(minutes=30) # minimum time period before publication of actual data

"""HELPERS"""
# represent json data as pandas data frames
def _to_frames(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    return df

# reformat cutoff time to pandas format
def _cutoff_offset(cutoff: time) -> pd.Timedelta:
    return pd.Timedelta(hours=cutoff.hour, minutes=cutoff.minute)

# make timestamp for cutoff for a target time (cutoff time is standardized at a certain time on the previous day - customizable or at 12:00 UTC)
# accepts either a Series of target timestamps (returns a Series) or a single date (returns a Timestamp)
def _cutoff_time_for(target, cutoff: time = DEFAULT_CUTOFF):
    if isinstance(target, pd.Series):
        day = target.dt.normalize()
    else:
        day = pd.Timestamp(target, tz="UTC")
    return day - pd.Timedelta(days=1) + _cutoff_offset(cutoff)

# group actual + latest forecast table by a key param and grab error statistics for the group
def _grouped(t: pd.DataFrame, key) -> pd.DataFrame:
    g = t.groupby(key, observed=True)
    return pd.DataFrame(
        {
            "n": g.size(),
            "mae": g["abs_error"].mean(),
            "rmse": g["error"].apply(lambda s: float(np.sqrt((s**2).mean()))),
            "bias": g["error"].mean(),
        }
    ).reset_index()

# retrieve history of actual/forecast data known at cutoff time for the given date. considers any custom window provided by user on how far back history should go, and any lag on published data
def _window_history(
        t: pd.DataFrame,
        forecast_date: date,
        cutoff: time = DEFAULT_CUTOFF,
        window_days: int | None = None,
        actual_lag_hours: float = 0.0,
) -> pd.DataFrame:
    c = _cutoff_time_for(forecast_date, cutoff)
    known_by = c - pd.Timedelta(hours=actual_lag_hours)
    h = t[t["startTime"] + PERIOD <= known_by]
    if window_days is not None:
        h = h[h["startTime"] >= c - pd.Timedelta(days=window_days)]
    return h


"""DATA REPRESENTATION FUNCTIONS"""
# create tuples of data frames for actual/forecast
def create_tuples(actuals_rows: list[dict], forecasts_rows: list[dict]) -> tuple[pd.DataFrame, pd.DataFrame]:
    actuals = _to_frames(actuals_rows)
    forecasts = _to_frames(forecasts_rows)

    # remove duplicates of actual generation data and keep only the latest published record
    actuals = (
        actuals.sort_values("publishTime")
        .drop_duplicates("startTime", keep="last")
        .rename(columns={"generation":"actual"})[["startTime", "actual"]]
        .sort_values("startTime")
        .reset_index(drop=True)
    )

    forecasts = forecasts.rename(columns={"generation": "forecast"})[["startTime", "publishTime", "forecast"]]

    return actuals, forecasts

# return latest forecasts published on or before the cutoff time for each target time
def filter_latest_forecasts(forecasts: pd.DataFrame, cutoff: time = DEFAULT_CUTOFF) -> pd.DataFrame:
    forecasts = forecasts.copy()
    forecasts["decisionTime"] = _cutoff_time_for(forecasts["startTime"], cutoff)
    valid = forecasts[forecasts["publishTime"] <= forecasts["decisionTime"]]
    return valid.sort_values("publishTime").drop_duplicates("startTime", keep="last")

# combine latest forecast before cutoff with actual data in one data frame, along with error margin
def build_decision_table(actuals: pd.DataFrame, forecasts: pd.DataFrame, cutoff: time = DEFAULT_CUTOFF) -> pd.DataFrame:
    latest = filter_latest_forecasts(forecasts, cutoff)
    t = latest.merge(actuals, on="startTime", how="inner")

    t["error"] = t["forecast"] - t["actual"]
    t["abs_error"] = t["error"].abs()
    t["horizon_hours"] = (t["startTime"] - t["publishTime"]).dt.total_seconds() / 3600
    t["date_of_forecast"] = t["startTime"].dt.date
    t["time_of_day"] = t["startTime"].dt.strftime("%H:%M")

    return t.sort_values("startTime").reset_index(drop=True)

# identify any target times lost during previous steps
def identify_data_gaps(actuals: pd.DataFrame, forecasts: pd.DataFrame, table: pd.DataFrame, cutoff: time = DEFAULT_CUTOFF) -> dict:
    forecast_targets = forecasts["startTime"].nunique()

    return {
        "number_of_actual_periods": int(len(actuals)),
        "number_of_forecast_target_times": int(forecast_targets),
        "with_cutoff_time_forecasts": int(
            filter_latest_forecasts(forecasts, cutoff)["startTime"].nunique()
            ),
        "merged_in_table": int(len(table))
    }

""" EVALUATE ERROR METRICS FUNCTIONS """
# evaluate error metrics to predict accuracy for a set of decision rows (all in MW unless noted)
# description of error metric being evaluated given via in-line comments
def error_metrics(t: pd.DataFrame) -> dict:
    if t.empty:
        return {
            "n": 0
        }

    e = t["error"]
    mae = float(t["abs_error"].mean())
    mean_actual = float(t["actual"].mean())

    out = {
        "n": int(len(t)),
        "mae": mae,
        "rmse": float(np.sqrt((e**2).mean())),
        "bias": float(e.mean()),
        "nmae_pct": 100 * mae / mean_actual if mean_actual > 0 else None, # MAE as % of actual
        "over_forecast_share": float((e > 0).mean()),
        "mean_over_forecast": float(e[e > 0].mean()) if (e > 0).any() else 0.0,
        "mean_under_forecast": float(e[e < 0].mean()) if (e < 0).any() else 0.0,
        "abs_error_p90": float(np.percentile(t["abs_error"], 90)),
    }

    for p in PERCENTILES:
        out[f"error_p{p}"] = float(np.percentile(e, p))

    return out

# evaluate error statistics for each time of day that data was published
def by_time_of_day(t: pd.DataFrame) -> pd.DataFrame:
    return _grouped(t, "time_of_day")

# evaluate error statistics by horizon intervals
def by_horizon(t: pd.DataFrame) -> pd.DataFrame:
    intervals = pd.cut(t["horizon_hours"], bins=HORIZON_INTERVALS, labels=HORIZON_LABELS, right=False)
    return _grouped(t.assign(horizon_bucket=intervals), "horizon_bucket")

# evaluate error by actual wind output interval (low, medium, high)
def by_wind_level(t: pd.DataFrame) -> pd.DataFrame:
    intervals = pd.qcut(t["actual"], 3, labels=["low", "medium", "high"])
    return _grouped(t.assign(wind_level=intervals), "wind_level")

# evaluate error of forecast for a day
def by_day(t: pd.DataFrame) -> pd.DataFrame:
    return _grouped(t, "date_of_forecast")

""" AS-OF MARGINS (ERROR AVAILABLE AT CUTOFF TIME) """

# get error metrics for defined window upto cutoff time
def asof_error_stats(
    t: pd.DataFrame,
    forecast_date: date,
    cutoff: time = DEFAULT_CUTOFF,
    window_days: int | None = None,
    min_days: int = 3,
    actual_lag_hours: float = 0.0,
) -> dict:
    h = _window_history(t, forecast_date, cutoff, window_days, actual_lag_hours)
    days_count = int(h["startTime"].dt.date.nunique())
    if days_count < min_days:
        return {
            "status": "insufficient_history", 
            "history_days": days_count,
            "n": int(len(h))
        }
    return {
        "status": "ok",
        "history_days": days_count,
        **error_metrics(h)
    }

# calculate and return a possible range for actual generation on a given date from past error percentiles. 
# error = forecast - actual, therefore band = [forecast - P_upper(error), forecast -P_lower(error)]
# same error distribution is applied to every 30-min interval.
# returns None if history is too short. percentile determined by user or defaults to 5 and 95
def forecast_band(
        t: pd.DataFrame,
        forecast_date: date,
        cutoff: time = DEFAULT_CUTOFF,
        window_days: int | None = None,
        min_days: int = 3,
        lower_pct: float = 5.0,
        upper_pct: float = 95.0,
        actual_lag_hours: float = 0.0,
) -> pd.DataFrame | None:
    h = _window_history(t, forecast_date, cutoff, window_days, actual_lag_hours)

    if h["startTime"].dt.date.nunique() < min_days:
        return None

    e_lo, e_hi = np.percentile(h["error"], [lower_pct, upper_pct])
    day = t[t["date_of_forecast"] == forecast_date]
    out = day[["startTime", "publishTime", "horizon_hours", "forecast", "actual"]].copy()
    out["lower"] = (out["forecast"] - e_hi).clip(lower=0)
    out["upper"] = out["forecast"] - e_lo
    return out.reset_index(drop=True)

# analysis on whether forecast bands included actual generation. 
def backtest_coverage(
    t: pd.DataFrame,
    cutoff: time = DEFAULT_CUTOFF,
    window_days: int | None = None,
    min_days: int = 3,
    lower_pct: float = 5,
    upper_pct: float = 95,
    start: date | None = None,
    end: date | None = None,
) -> tuple[pd.DataFrame, float | None]:
    rows = []
    for d in sorted(t["date_of_forecast"].unique()):
        if start is not None and d < start:
            continue
        if end is not None and d > end:
            continue
        band = forecast_band(t, d, cutoff, window_days, min_days, lower_pct, upper_pct)
        if band is None or band.empty:
            continue
        inside = (band["actual"] >= band["lower"]) & (band["actual"] <= band["upper"])
        rows.append({"date_of_forecast": d, "n": len(band), "n_inside": int(inside.sum())})

    per_day = pd.DataFrame(rows)
    if per_day.empty:
        return per_day, None
    per_day["coverage"] = per_day["n_inside"] / per_day["n"]
    overall = float(per_day["n_inside"].sum() / per_day["n"].sum())
    return per_day, overall


if __name__ == "__main__":
    from .forecast_data import get_actual, get_forecast

    actual, forecast = create_tuples(get_actual(), get_forecast())
    t = build_decision_table(actual, forecast)

    print("data gaps: ", identify_data_gaps(actual, forecast, t))
    print("error overview: ", error_metrics(t))
    print("error grouped by horizon intervals: ", by_horizon(t))

    last_day = t["date_of_forecast"].max()
    print("as-of stats for ", last_day, ": ", asof_error_stats(t, last_day))

    per_day, overall_coverage = backtest_coverage(t)
    print("backtest coverage (nominal 90%): ", overall_coverage)