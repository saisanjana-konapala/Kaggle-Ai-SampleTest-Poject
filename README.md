# Kaggle-Ai-SampleTest-Project - Google Cloud BigQuery Release Tracker & Social Hub

A modern, highly-polished web application built using Python Flask and vanilla HTML, CSS, and JavaScript. It fetches the live BigQuery Release Notes Atom Feed, organizes individual updates by type, and offers an interactive Tweet Composer to customize and share updates on X (Twitter).

## Features

- **Live XML Feed Fetching**: Downloads and parses the latest BigQuery release notes in real time from Google's official Atom feed.
- **Update Segmentation**: Splits each feed entry into individual, granular update cards (Features, Issues, Changes, Deprecations) instead of showing one giant block.
- **Smart Server Cache**: Implements an in-memory server cache (10-minute lifetime) to minimize latency and avoid rate-limiting Google's servers. Bypassed automatically when clicking "Refresh".
- **Interactive Tweet Composer**: Click on any update card to open a custom, sticky Tweet composer. It pre-populates a beautifully formatted, character-safe tweet with:
  - Date and category of the release.
  - Smart text snippet truncation to stay within Twitter's 280-character limit.
  - Deep-link directly to the specific date anchor on the Google Cloud documentation site.
- **Search & Categories**: Easily find what you need by searching for key terms (e.g. `Gemini`, `SQL`) or filtering by category tags.
- **Rich Aesthetics & Responsive Layout**:
  - Dark & Light mode support with system preferences detection and localStorage persistence.
  - Interactive grid view that morphs into a bottom slide-up drawer on mobile devices.
  - Shimmer animations for skeleton loaders during background syncs.
  - Direct clipboard copying and immediate click sharing to X.

## Project Structure

- `app.py`: The Flask server. Handles feed retrieval, XML-to-JSON parsing, update categorization, caching, and serving API requests.
- `templates/index.html`: Main HTML template with a clean layout structure, SVG assets, and a mobile-friendly view.
- `static/css/style.css`: Comprehensive design system with custom properties, glassmorphism card styling, responsive layouts, theme styling, and loaders.
- `static/js/app.js`: Clientside application controller. Handles AJAX requests, state management, filtering, composer calculations, and theme toggling.
- `requirements.txt`: Python requirements list.

## Quick Start

### 1. Prerequisites

Ensure you have **Python 3.8+** installed.

### 2. Setup Virtual Environment & Install Dependencies

From the project root directory, run:

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows)
venv\Scripts\activate

# Install requirements
pip install -r requirements.txt
```

### 3. Run the Flask Web Application

```bash
# Run server
python app.py
```

The app will be running locally at **[http://127.0.0.1:5000](http://127.0.0.1:5000)**. Open this link in your web browser.
