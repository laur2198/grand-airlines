@echo off
rem Rebuilds css/app.css (needs Node.js). Run from anywhere.
cd /d "%~dp0.."
npx -y tailwindcss@3.4.19 -c tools/tailwind.config.js -i tools/input.css -o css/app.css --minify
