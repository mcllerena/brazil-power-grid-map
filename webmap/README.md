# Brazilian Power System Web Map

Lightweight browser map using Leaflet + shapefile parsing in the client.

## Folder structure

- `webmap/index.html` - app shell
- `webmap/css/styles.css` - responsive styling
- `webmap/js/config.js` - layer groups and source files
- `webmap/js/main.js` - map setup and shapefile loading
- `geoinfo/` - shapefile datasets used by the app

## Run locally

Start a static server from the workspace root (`New project`) so both `webmap/` and `geoinfo/` are served.

Option 1 (Python):

```bash
python -m http.server 8000
```

Option 2 (Node):

```bash
npx serve .
```

Then open:

- `http://localhost:8000/webmap/` (Python)
- or the URL shown by `serve`, then `/webmap/`

## Notes

- The app loads substations, transmission lines, and power plants from shapefiles in `geoinfo/`.
- Existing core infrastructure layers are enabled by default.
- Planned and extra layers can be toggled in the left panel.
