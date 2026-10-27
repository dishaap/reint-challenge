from datetime import date, datetime, timezone, timedelta
import httpx
from pathlib import Path
import json

ELEXON_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
WINDOW_DAYS = 7 # retrieve data in chunks to reduce response size

START_DATE = datetime(2026, 1, 1, tzinfo=timezone.utc)
END_DATE = datetime(2026, 2, 1, tzinfo=timezone.utc)
FORECAST_BOUNDARY = 4 # max number of days to look back for a day's forecast

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" # create path for cache

# return date & time in format required by api
def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")

def _windows(start: datetime, end: datetime, days: int = WINDOW_DAYS):
    curr = start
    while curr < end:
        next = min(curr + timedelta(days = days), end)
        yield curr, next
        curr = next

# fetch json stream from api for each dataset
def _get(client: httpx.Client, dataset: str, params: dict) -> list[dict]:
    res = client.get(f"{ELEXON_URL}/{dataset}/stream", params=params, timeout = 60)
    res.raise_for_status()
    body = res.json()
    return body["data"] if isinstance(body, dict) else body

# check if time of forecast/actual generation is within intended range
def _in_range(row: dict) -> bool:
    start = datetime.fromisoformat(row["startTime"].replace("Z","+00:00"))
    return START_DATE <= start < END_DATE

# actual wind generation from FUELHH (set to fuelType = WIND) for Jan '26
def fetch_actual() -> list[dict]:
    rows: list[dict] = []
    with httpx.Client() as client:
        for w_start, w_end in _windows(START_DATE, END_DATE):
            params = {
                "settlementDateFrom": w_start.date().isoformat(),
                "settlementDateTo": (w_end - timedelta(days=1)).date().isoformat(),
                "fuelType": "WIND",
            }
            rows += _get(client, "FUELHH", params)
    return [r for r in rows if r.get("fuelType") == "WIND" and _in_range(r)]

# all forecasts for wind generation from WINDFOR for Jan '26
def fetch_forecast() -> list[dict]:
    rows: list[dict] = []
    with httpx.Client() as client:
            p_start = START_DATE - timedelta(days=FORECAST_BOUNDARY)
            for w_start, w_end in _windows(p_start, END_DATE):
                params = {
                    "publishDateTimeFrom": _iso(w_start),
                    "publishDateTimeTo": _iso(w_end)
                }
                rows += _get(client, "WINDFOR", params)
    return [r for r in rows if _in_range(r)]

# read and write to cache
def _cache(name: str, fetch, refresh: bool = False) -> list[dict]:
    path = CACHE_DIR / f"{name}.json"
    if path.exists() and not refresh:
        return json.loads(path.read_text())

    # Fetch and persist only when the cache is missing or explicitly refreshed.
    CACHE_DIR.mkdir(exist_ok=True)
    rows = fetch()
    path.write_text(json.dumps(rows))
    return rows

# get cached data if exists or write to cache
def get_actual(refresh: bool = False) -> list[dict]:
    return _cache("actual_generation_2026-01", fetch_actual, refresh)

def get_forecast(refresh: bool = False) -> list[dict]:
    return _cache("forecast_generation_2026-01", fetch_forecast, refresh)

if __name__ == "__main__":
    actual = get_actual()
    forecast = get_forecast()
    print(f"actuals:   {len(actual)} rows, e.g. {actual[0] if actual else None}")
    print(f"forecasts: {len(forecast)} rows, e.g. {forecast[0] if forecast else None}")

    if forecast:
        horizons = [
            (datetime.fromisoformat(r["startTime"].replace("Z", "+00:00"))
             - datetime.fromisoformat(r["publishTime"].replace("Z", "+00:00"))).total_seconds() / 3600
            for r in forecast
        ]
        print(f"forecast horizon (hours): min {min(horizons):.1f}, max {max(horizons):.1f}")