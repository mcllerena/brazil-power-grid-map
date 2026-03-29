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

Run with node:

```bash
npx serve .
```

Then open:

- `http://localhost:3000/webmap`

## Notes

- The app loads substations, transmission lines, and power plants from shapefiles in `geoinfo/`.
- Existing core infrastructure layers are enabled by default.
- Planned and extra layers can be toggled in the left panel.
- Data source can be found in <a href="https://www.epe.gov.br/en/publications/publications/webmap-epe" target="_blank" rel="noopener">EPE - Empresa de Pesquisa Energética</a>
