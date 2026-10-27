from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import json
from datetime import time, date
from functools import lru_cache

from .forecast_data import get_actual, get_forecast
from . import analysis

DEFAULT_CUTOFF_STR = analysis.DEFAULT_CUTOFF.strftime("%H:%M") 

app = FastAPI(title="Forecast analysis for Wind Energy Generation from Elexon")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"], # Vite dev server + Docker container frontend
    allow_methods=["GET"],
    allow_headers=["*"],
)

""" HELPERS """

# data frame to json records
def _json(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", date_format="iso"))

def _parse_cutoff(cutoff: str) -> time:
    try:
        return time.fromisoformat(cutoff)
    except ValueError:
        raise HTTPException(status_code=400, detail="cutoff must be a time in the format 12:00")

def _check_pcts(lower_pct: float, upper_pct: float) -> None:
    if lower_pct >= upper_pct:
        raise HTTPException(status_code=400, detail="lower_pct must be below upper_pct")

@lru_cache(maxsize=1) # load cached actuals/forecast data once per process
def _frames():
    return analysis.create_tuples(get_actual(), get_forecast())

@lru_cache(maxsize=16)
# build a forecasts/actual table for a given cutoff, for once per cutoff provided
def _table(cutoff_str: str) -> pd.DataFrame:
    actuals, forecasts = _frames()
    return analysis.build_decision_table(actuals, forecasts, time.fromisoformat(cutoff_str))

# return both time and str formats for cutoff time
def _norm(cutoff: str) -> tuple[time, str]:
    c = _parse_cutoff(cutoff)
    return c, c.strftime("%H:%M")

# a failsafe for checking whether intervals are too small for a function (percentiles, as-of divisions etc)
def _safe(fn, t: pd.DataFrame) -> list[dict]:
    try:
        return _json(fn(t))
    except ValueError:
        return []

""" API ENDPOINTS """

@app.get("/health")
def health():
    return {"status": "ok"}

# data needed to begin data retrieval
@app.get("/api/meta")
def meta(cutoff: str = DEFAULT_CUTOFF_STR):
    c, cs = _norm(cutoff)
    actuals, forecasts = _frames()
    t = _table(cs)

    return {
        "cutoff": cs,
        "forecast_dates": [d.isoformat() for d in sorted(t["date_of_forecast"].unique())],
        "data_gaps": analysis.identify_data_gaps(actuals, forecasts, t, c),
    }

# get forecasts for a particular date, including forecast bands & as-of cutoff time stats
@app.get("/api/forecast/{forecast_date}")
def forecast_for_day(
    forecast_date: date,
    cutoff: str = DEFAULT_CUTOFF_STR,
    window_days: int | None = Query(None, ge=1, description="Rolling window to retrieve error analytics, omit for all history"),
    min_days: int = Query(3, ge=1),
    lower_pct: float = Query(5, ge=0, le=100),
    upper_pct: float = Query(95, ge=0, le=100),
):
    c, cs = _norm(cutoff)
    _check_pcts(lower_pct, upper_pct)
    actuals, forecasts = _frames()
    t = _table(cs)

    latest = analysis.filter_latest_forecasts(forecasts, c)
    day = latest[latest["startTime"].dt.date == forecast_date]
    if day.empty:
        raise HTTPException(status_code=404, detail=f"No forecast available for {forecast_date} at or before cutoff {cs}")

    day = day.merge(actuals, on="startTime", how="left")
    day["horizon_hours"] = (day["startTime"] - day["publishTime"]).dt.total_seconds() / 3600
 
    band = analysis.forecast_band(t, forecast_date, c, window_days, min_days, lower_pct, upper_pct)
    cols = ["startTime", "publishTime", "horizon_hours", "forecast", "actual"]
    if band is not None:
        day = day.merge(band[["startTime", "lower", "upper"]], on="startTime", how="left")
        cols += ["lower", "upper"]
 
    return {
        "forecast_date": forecast_date.isoformat(),
        "cutoff": cs,
        "decision_time": analysis._cutoff_time_for(forecast_date, c).isoformat(),
        "band": {"available": band is not None, "lower_pct": lower_pct, "upper_pct": upper_pct},
        "asof_stats": analysis.asof_error_stats(t, forecast_date, c, window_days, min_days),
        "rows": _json(day.sort_values("startTime")[cols]),
    }

# error metrics including errors by grouping (time of day, horizon interval, wind level & day)
@app.get("/api/metrics")
def metrics(
    cutoff: str = DEFAULT_CUTOFF_STR,
    start: date | None = None,
    end: date | None = None,
):
    _, cs = _norm(cutoff)
    t = _table(cs)
    if start is not None:
        t = t[t["date_of_forecast"] >= start]
    if end is not None:
        t = t[t["date_of_forecast"] <= end]
    if t.empty:
        raise HTTPException(status_code=404, detail="No data in the selected range")
    return {
        "cutoff": cs,
        "overall": analysis.error_metrics(t),
        "by_time_of_day": _safe(analysis.by_time_of_day, t),
        "by_horizon": _safe(analysis.by_horizon, t),
        "by_wind_level": _safe(analysis.by_wind_level, t),
        "by_day": _safe(analysis.by_day, t),
        "rows": _json(
            t[["startTime", "publishTime", "forecast", "actual", "horizon_hours"]]
        ),
    }

# check whether as of ranges contain the actual generation data
@app.get("/api/backtest")
def backtest(
    cutoff: str = DEFAULT_CUTOFF_STR,
    window_days: int | None = Query(None, ge=1),
    min_days: int = Query(3, ge=1),
    lower_pct: float = Query(5, ge=0, le=100),
    upper_pct: float = Query(95, ge=0, le=100),
    start: date | None = None,
    end: date | None = None,
):
    c, cs = _norm(cutoff)
    _check_pcts(lower_pct, upper_pct)
    if start is not None and end is not None and start > end:
        raise HTTPException(status_code=400, detail="start must be on or before end")
    per_day, overall = analysis.backtest_coverage(
        _table(cs), c, window_days, min_days, lower_pct, upper_pct, start, end
    )
    return {
        "cutoff": cs,
        "nominal_coverage": (upper_pct - lower_pct) / 100,
        "overall_coverage": overall,
        "per_day": _json(per_day) if not per_day.empty else [],
    }