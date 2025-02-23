// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZWNpc25lcm9zYmFycm9uIiwiYSI6ImNtN2U1bDRtNTBhbTQydG9jc2dzY2h5eHQifQ.1WjRY0oWlID7yjq9cQ29uw';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

// Global variable to hold the circles
let circles;

// Coordinate converter helper function
function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

// Function to update circle positions when the map moves/zooms
function updatePositions() {
    circles
      .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
      .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
}

map.on('load', () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });

    map.addLayer({
        id: 'boston-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': 'green',  // A bright green using hex code
            'line-width': 3,        // Thicker lines
            'line-opacity': 0.4     // Slightly less transparent
        }
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': 'green',  // A green
            'line-width': 3,       // Thicker lines
            'line-opacity': 0.4    // Slightly less transparent
        }
    });

    // Load the nested JSON file (station markers)
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
    d3.json(jsonurl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData);  // Log to verify structure

        let stations = jsonData.data.stations;
        console.log('Stations Array:', stations);

        // Load the traffic data (size of station markers)
        const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
        d3.csv(trafficUrl).then(trips => {
            console.log('Loaded Traffic Data:', trips);

            // Calculate departures and arrivals
            const departures = d3.rollup(
                trips,
                v => v.length,
                d => d.start_station_id
            );

            const arrivals = d3.rollup(
                trips,
                v => v.length,
                d => d.end_station_id
            );

            // Add arrivals, departures, and totalTraffic properties to each station
            stations = stations.map(station => {
                const id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;
                station.departures = departures.get(id) ?? 0;
                station.totalTraffic = station.arrivals + station.departures;
                return station;
            });

            console.log('Updated Stations Array:', stations);

            // Create and append the SVG element to the #map div if it doesn't exist
            let svg = d3.select('#map').select('svg');
            if (svg.empty()) {
                svg = d3.select('#map').append('svg');
            }

            // Create a square root scale for circle radii
            const radiusScale = d3.scaleSqrt()
                .domain([0, d3.max(stations, d => d.totalTraffic)])
                .range([0, 25]);

            // Create circles for each station
            circles = svg.selectAll('circle')
                .data(stations)
                .enter()
                .append('circle')
                .attr('r', d => radiusScale(d.totalTraffic))  // Radius based on total traffic
                .attr('fill', 'steelblue')  // Circle fill color
                .attr('stroke', 'white')    // Circle border color
                .attr('stroke-width', 1)    // Circle border thickness
                .attr('opacity', 0.6)       // Circle opacity
                .each(function(d) {
                    // Add <title> for browser tooltips
                    d3.select(this)
                        .append('title')
                        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
                });

            // Initial position when map first loads
            updatePositions();

            // Reposition markers on map interactions
            map.on('move', updatePositions);     // Update during map movement
            map.on('zoom', updatePositions);     // Update during zooming
            map.on('resize', updatePositions);   // Update on window resize
            map.on('moveend', updatePositions);  // Final adjustment after movement ends
        }).catch(error => {
            console.error('Error loading traffic data:', error);  // Handle errors if traffic data loading fails
        });
    }).catch(error => {
        console.error('Error loading JSON:', error);  // Handle errors if JSON loading fails
    });
});