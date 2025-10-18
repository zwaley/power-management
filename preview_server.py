from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

# Minimal preview server to render the topology page independently
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/topology", response_class=HTMLResponse)
async def topology(request: Request):
    return templates.TemplateResponse("topology.html", {"request": request})