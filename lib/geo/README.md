# `land.json`

Coastline outlines for the globe: 126 rings, 5,121 points, 64 KB.

Pre-decoded at build time from [Natural Earth](https://www.naturalearthdata.com/)
110m land data (via the `world-atlas` TopoJSON build) into a flat array of
`[lng, lat, lng, lat, …]` rings, quantized to 2 decimal places — roughly 1.1 km at
the equator, far finer than a globe at this scale can resolve.

Baking it out means neither `world-atlas` (7.9 MB installed) nor `topojson-client`
ships as a runtime dependency; only this file does.

**Licence:** Natural Earth is public domain. The `world-atlas` TopoJSON build is
ISC-licensed, © 2013–2019 Michael Bostock.
