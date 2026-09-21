@echo off
title WebGIS Peta SLS Kota Manado
cd /d "%~dp0"
echo ======================================================
echo   Menjalankan WebGIS Peta SLS & Titik Geotag Manado
echo ======================================================
echo.

if not exist "data\hierarchy.json" (
    echo [INFO] Menyiapkan data spasial untuk pertama kali...
    python build_data.py
)

echo [INFO] Membuka aplikasi di browser...
start http://localhost:8080
python server.py
pause
