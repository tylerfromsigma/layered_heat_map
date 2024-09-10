import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import './App.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  client, 
  useConfig, 
  useElementData, 
  useElementColumns
} from "@sigmacomputing/plugin";

client.config.configureEditorPanel([
  { type: "group", name: "MapboxAccessToken" },
  { type: "text", name: "token", source: "MapboxAccessToken", secure: true},
  
  { type: "element", name: "HeatMapSource" },
  { type: "column", name: "Heat_Latitude",  source: "HeatMapSource", allowMultiple: false },
  { type: "column", name: "Heat_Longitude",  source: "HeatMapSource", allowMultiple: false },

  { type: "element", name: "PointSource" },
  { type: "column", name: "Point_Latitude",  source: "PointSource", allowMultiple: false },
  { type: "column", name: "Point_Longitude",  source: "PointSource", allowMultiple: false },
  { type: "column", name: "Tooltip",  source: "PointSource", allowMultiple: true },

  { type: "group", name: "Variables" },
  { type: "text", name: "MapStyle", source: "Variables", defaultValue: "streets-v11" },
  { type: "text", name: "Opacity", source: "Variables", defaultValue: ".7" },
]);

function App() {
  const config = useConfig();
  const sigmaHeatMapData = useElementData(config.HeatMapSource);
  const sigmaPointData = useElementData(config.PointSource);
  const sigmaPointColumns = useElementColumns(config.PointSource);
  console.log(sigmaPointData)

  // track previous config so that map doesn't update unless something changes
  const prevHeatmapCoordinates = useRef([]);
  const prevPinCoordinates = useRef([]);
  const prevConfig = useRef({});

  useEffect(() => {
    if (
      config.token &&
      config.Heat_Latitude && config.Heat_Longitude &&
      config.Point_Latitude && config.Point_Longitude
    ) {
      // Check if sigmaHeatMapData and sigmaPointData are properly structured
      if (
        sigmaHeatMapData[config.Heat_Latitude] &&
        sigmaHeatMapData[config.Heat_Longitude] &&
        sigmaPointData[config.Point_Latitude] &&
        sigmaPointData[config.Point_Longitude]
      ) {
        // Prepare heatmap coordinates
        const sigmaHeatMapLatitude = sigmaHeatMapData[config.Heat_Latitude];
        const sigmaHeatMapLongitude = sigmaHeatMapData[config.Heat_Longitude];
        const combinedHeatmapCoordinates = sigmaHeatMapLatitude.map((lat, index) => ({
          lng: sigmaHeatMapLongitude[index],
          lat: lat
        }));

        // Prepare pin coordinates
        const sigmaPointLatitude = sigmaPointData[config.Point_Latitude];
        const sigmaPointLongitude = sigmaPointData[config.Point_Longitude];
        const combinedPinCoordinates = sigmaPointLatitude.map((lat, index) => ({
          lng: sigmaPointLongitude[index],
          lat: lat
        }));

        // Only update bounds if data or config has changed
        if (
          JSON.stringify(prevHeatmapCoordinates.current) !== JSON.stringify(combinedHeatmapCoordinates) ||
          JSON.stringify(prevPinCoordinates.current) !== JSON.stringify(combinedPinCoordinates) ||
          JSON.stringify(prevConfig.current) !== JSON.stringify(config)
        ) {
          prevHeatmapCoordinates.current = combinedHeatmapCoordinates;
          prevPinCoordinates.current = combinedPinCoordinates;
          prevConfig.current = config;

          // Initialize Mapbox
          mapboxgl.accessToken = config.token;
          const allCoordinates = [...combinedHeatmapCoordinates, ...combinedPinCoordinates];
          const bounds = allCoordinates.reduce((bounds, coord) => {
            return bounds.extend([coord.lng, coord.lat]);
          }, new mapboxgl.LngLatBounds(allCoordinates[0], allCoordinates[0]));

          const map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/' + config.MapStyle // pk.eyJ1IjoidGFzcGVuY2VyIiwiYSI6ImNsdWlwMW90YzAxMXEycG1pcndmMzFoM3QifQ.uEwYbkTtZDQ7CoulhbDdpQ
          });

          map.fitBounds(bounds, { padding: 50, linear: true, duration: 0 });

          const heatmapGeojsonData = {
            "type": "FeatureCollection",
            "features": combinedHeatmapCoordinates.map(coord => ({
              "type": "Feature",
              "properties": {},
              "geometry": {
                "type": "Point",
                "coordinates": [coord.lng, coord.lat]
              }
            }))
          };

          const pinGeojsonData = {
            "type": "FeatureCollection",
            "features": combinedPinCoordinates.map((coord, index) => {
              const tooltipData = config.Tooltip.map(id => {
                const columnData = sigmaPointData[id] ? sigmaPointData[id][index] : 'N/A';
                const column = sigmaPointColumns[id];
                return column ? `<strong>${column.name}</strong>: ${columnData}` : `Unknown ID: ${id}`;
              }).join('<br>');
          
              return {
                "type": "Feature",
                "properties": {
                  "tooltip": tooltipData
                },
                "geometry": {
                  "type": "Point",
                  "coordinates": [coord.lng, coord.lat]
                }
              };
            })
          };
          
          map.on('load', () => {
            map.addSource('heatmap-data', {
              'type': 'geojson',
              'data': heatmapGeojsonData
            });

            map.addSource('pin-data', {
              'type': 'geojson',
              'data': pinGeojsonData
            });

            map.addLayer({
              'id': 'heatmap-layer',
              'type': 'heatmap',
              'source': 'heatmap-data',
              'paint': {
                'heatmap-weight': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0, 0.3,
                  0.1, 0.5,
                  0.3, 0.6,
                  0.7, 1
                ],
                'heatmap-intensity': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  0, 1,
                  9, 3
                ],
                'heatmap-color': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0, 'rgba(33,102,172,0)',
                  0.2, 'rgb(103,169,207)',
                  0.4, 'rgb(209,229,240)',
                  0.6, 'rgb(253,219,199)',
                  0.8, 'rgb(239,138,98)',
                  1, 'rgb(178,24,43)'
                ],
                'heatmap-radius': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  0, 3,
                  9, 30
                ],
                'heatmap-opacity': Number(config.Opacity)
              }
            });

            // add points to map
            pinGeojsonData.features.forEach(function(marker) {
              const el = document.createElement('div');
              el.className = 'marker';

              const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 25 })
                .setHTML(marker.properties.tooltip);

              const markerElement = new mapboxgl.Marker(el)
                .setLngLat(marker.geometry.coordinates)
                .setOffset([0, -24])
                .addTo(map);

              markerElement.getElement().addEventListener('mouseenter', () => {
                popup.setLngLat(marker.geometry.coordinates).addTo(map);
              });

              markerElement.getElement().addEventListener('mouseleave', () => {
                popup.remove();
              });
            });
          });
        }
      }
    }
  }, [sigmaHeatMapData, sigmaPointData, sigmaPointColumns, config]);

  return <div id="map" style={{ position: 'absolute', top: 0, bottom: 0, width: '100%' }} />;
}

export default App;
