# Touching Emotions, Smelling Shapes: a reading guide

A reading guide for a CC BY 4.0 paper (CHI '26, https://doi.org/10.1145/3772318.3790709). Static site: plain HTML/CSS/JS, no build step.

## Run it on your computer
- Double-click `start-site.bat`. It starts the site and opens http://localhost:8000/ in your browser. Close the window to stop it.
- Or run this in a terminal: `python -m http.server 8000` from this folder, then open http://localhost:8000/.
- Opening the HTML files directly will not work, because browsers will not load the paper that way. The site only runs while the server is running; the link works only on your own computer.

## Notes
- Deploy to GitHub Pages: push to `main`; the workflow in `.github/workflows/pages.yml` publishes it.
- The paper is rendered in the page with PDF.js (vendored in `vendor/pdfjs/`, Apache-2.0). Highlight and glossary-word positions come from `data/highlights.json` and `data/glossary.json`. Regenerate them from the source folder with `python scripts/make_highlights_json.py` and `python scripts/make_glossary_json.py` (needs `pip install pdfplumber pypdf reportlab`), then copy the JSON into `data/` here.
- Everything is set in Inter, self-hosted in `fonts/` (SIL Open Font License; the license text is in `fonts/`). There are no requests to third-party servers.
- The look follows the Paper mockups: a top bar (title, where you are, one black button), cream surfaces, and three-column layouts on the reader, glossary and short-version pages. Colors and sizes live at the top of `css/site.css`; each page sets its top-bar label and button with `data-ctx`, `data-ctx-swatch`, `data-cta-label` and `data-cta-href` on `<body>`.
- Reader notes (with a highlight color and an optional category, built-in or the reader's own) are saved only in each visitor's own browser (localStorage); they can export and import them.
- The glossary page is built from `data/glossary.json`, the same file that marks glossary words in the paper.
