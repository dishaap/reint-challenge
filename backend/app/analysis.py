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

# reformat cutoff time to pandas format
def _cutoff_offset(cutoff: time) -> pd.Timedelta:
    return pd.Timedelta(hours=cutoff.hour, minutes=cutoff.minute)

# make timestamp for cutoff for a target time (cutoff time is standardized at a certain time on the previous day - customizable or at 12:00 UTC)
def _cutoff_time_for(start_times: pd.Series, cutoff: time = DEFAULT_CUTOFF):
    return start_times.dt.normalize() - pd.Timedelta(days=1) + _cutoff_offset(cutoff)

def _cutoff_time_for(forecast_date: date, cutoff: time = DEFAULT_CUTOFF):
    return pd.Timestamp(delivery_date, tz="UTC") - pd.Timedelta(days=1) + _cutoff_offset(cutoff)

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
    )

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

