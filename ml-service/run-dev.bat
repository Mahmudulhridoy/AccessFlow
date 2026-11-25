@echo off
REM Starts the ML service with the trained dev model (artifacts\dev) and the same API key the server uses.
for /f "tokens=1,* delims==" %%a in ('findstr /b "ML_SERVICE_API_KEY=" ..\server\.env') do set ML_SERVICE_API_KEY=%%b
set ALLOW_DEV_MODEL=true
uvicorn app.main:app --port 8000
