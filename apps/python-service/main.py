from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"status": "python service running"}

@app.post("/generate-label")
def generate_label():
    return {"success": True, "message": "label generated"}