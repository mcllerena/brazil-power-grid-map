# Power System Web Maps (Brazil & US)

Lightweight browser maps using Leaflet + shapefile parsing in the client.

## Folder structure

- `webmap/index.html` - Brazil app shell
- `webmap/us.html` - US app shell
- `webmap/css/styles.css` - responsive styling
- `webmap/js/config.js` - layer groups and source files
- `webmap/js/main.js` - Brazil map setup and shapefile loading
- `webmap/js/main-us.js` - US map setup and shapefile loading
- `geoinfo/brazil-data/` - Brazil shapefile datasets
- `geoinfo/us-data/` - US shapefile datasets

## Run locally

Start a static server from the workspace root (`New project`) so both `webmap/` and `geoinfo/` are served.

Run with node:

```bash
npx serve .
```

Then open:

- `http://localhost:3000/webmap` (Brazil)
- `http://localhost:3000/webmap/us.html` (US)

## Notes

- The Brazil map loads substations, transmission lines, regions, and power plants from shapefiles in `geoinfo/brazil-data/`.
- The US map currently loads transmission lines from `geoinfo/us-data/Electric_Power_Transmission_Lines_A.*`.
- Existing core infrastructure layers are enabled by default.
- Planned and extra layers can be toggled in the left panel.
- Data sources:
	- Brazil: <a href="https://www.epe.gov.br/en/publications/publications/webmap-epe" target="_blank" rel="noopener">EPE - Empresa de Pesquisa Energética</a>
	- US: <a href="https://mapyourgrid.org/global-grid-data/" target="_blank" rel="noopener">MapYourGrid - Global Grid Data</a>

