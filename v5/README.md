# WAOS V5 — Clean Rebuild

WAOS V5 is a clean frontend rebuild of the Western Australia Operations System personal situational-awareness dashboard.

## Design goals

- One coherent frontend instead of stacked patches and runtime overrides.
- Map-first workflow with a single operations panel.
- Reliable core feeds remain independent: BOM, Emergency WA, Western Power and Main Roads.
- Work-zone navigation: SWIN, Metro, South Metro, North Metro, South Country, North Country and East Country.
- Mobile-first bottom-sheet panel and bottom navigation.
- Clear source health, freshness and last-known-data behaviour.
- On-demand facility loading so non-critical third-party sources cannot block the main dashboard.
- All safety-critical information links back to the relevant official source.

## Architecture

- `index.html` — semantic application shell.
- `styles.css` — complete responsive UI. No legacy WAOS styles are loaded.
- `js/config.js` — source URLs, colours, SWIN footprint, work-zone extents and facility metadata.
- `js/utils.js` — formatting, geometry, storage and scoping helpers.
- `js/data.js` — core feed, weather, radar and place-search clients.
- `js/facilities.js` — lazy facility data loaders and caching.
- `js/map.js` — Leaflet map, incident geometry, work zones, facility clustering and radar.
- `js/app.js` — application state, rendering, navigation and user interactions.
- `sw.js` — V5-scoped PWA cache.

## Source policy

WAOS is a personal situational-awareness tool and is not an official Western Power system. The SWIN and work-zone shapes are indicative operational views, not legal, cadastral or network-connection boundaries.

Core live data continues to come through the WAOS feed worker. Facility layers are reference-only: DFES and emergency hospitals use WA Government spatial services; police and ambulance are loaded from publicly mapped locations on demand; Western Power locations are limited to publicly documented work-location addresses.

## Keyboard shortcuts

- `R` — refresh core feeds
- `0` — Live view
- `1` — Power
- `2` — Warnings
- `3` — Roads
- `4` — Facilities
- `/` — focus place search
