from backend.app.main import app

app.frontend("/", directory="frontend/dist", fallback="index.html")
