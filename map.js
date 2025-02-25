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

// Global variables
let circles;
let radiusScale;
let stations;
let trips;
const timeSlider = document.getElementById('slider');
const selectedTime = document.getElementById('time');
const anyTimeLabel = document.getElementById('any-time');

// Coordinate converter helper function
function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

// Time formatting helper function
function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}

// Helper function to calculate minutes since midnight
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

// Function to filter trips by time
function filterTripsbyTime(trips, timeFilter) {
    return timeFilter === -1 
      ? trips // If no filter is applied (-1), return all trips
      : trips.filter((trip) => {
          // Convert trip start and end times to minutes since midnight
          const startedMinutes = minutesSinceMidnight(trip.started_at);
          const endedMinutes = minutesSinceMidnight(trip.ended_at);
          
          // Include trips that started or ended within 60 minutes of the selected time
          return (
            Math.abs(startedMinutes - timeFilter) <= 60 ||
            Math.abs(endedMinutes - timeFilter) <= 60
          );
    });
}

// Function to compute station traffic
function computeStationTraffic(stations, trips) {
    // Compute departures
    const departures = d3.rollup(
        trips, 
        (v) => v.length, 
        (d) => d.start_station_id
    );
    
    // Compute arrivals
    const arrivals = d3.rollup(
        trips,
        v => v.length,
        d => d.end_station_id
    );
    
    // Update each station
    return stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
  });
}

// Function to update circle positions when the map moves/zooms
function updatePositions() {
    circles
      .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
      .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
}

// Function to update the scatterplot based on the selected time filter
function updateScatterPlot(timeFilter) {
    // Get only the trips that match the selected time filter
    const filteredTrips = filterTripsbyTime(trips, timeFilter);
    
    // Recompute station traffic based on the filtered trips
    const filteredStations = computeStationTraffic(stations, filteredTrips);
    
    // Update the scatterplot by adjusting the radius of circles
    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
    circles
      .data(filteredStations, (d) => d.short_name)  // Ensure D3 tracks elements correctly
      .join('circle') // Ensure the data is bound correctly
      .attr('r', (d) => radiusScale(d.totalTraffic)); // Update circle sizes
}

// Function to update the time display based on the slider value
function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value); // Get slider value
    console.log('Slider Value:', timeFilter); // Log the slider value

    if (timeFilter === -1) {
      selectedTime.textContent = ''; // Clear time display
      anyTimeLabel.style.display = 'block'; // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter); // Display formatted time
      anyTimeLabel.style.display = 'none'; // Hide "(any time)"
    }
    
    // Call updateScatterPlot to reflect the changes on the map
    updateScatterPlot(timeFilter);
}

map.on('load', async () => { 
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
            'line-color': 'green',  // A different color to distinguish from Boston bike lanes
            'line-width': 3,       // Thicker lines
            'line-opacity': 0.4    // Slightly less transparent
        }
    });

    // Load the nested JSON file (station markers)
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
    const jsonData = await d3.json(jsonurl);
    console.log('Loaded JSON Data:', jsonData);  // Log to verify structure

    // Load the traffic data (size of station markers)
    const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
    trips = await d3.csv(trafficUrl, (trip) => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        return trip;
    });
    console.log('Loaded Traffic Data:', trips);

    // Calculate departures and arrivals
    stations = computeStationTraffic(jsonData.data.stations, trips);
    console.log('Updated Stations Array:', stations);

    // Create and append the SVG element to the #map div if it doesn't exist
    let svg = d3.select('#map').select('svg');
    if (svg.empty()) {
        svg = d3.select('#map').append('svg');
    }

    // Create a square root scale for circle radii
    radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(stations, d => d.totalTraffic)])
        .range([0, 25]);

    // Create circles for each station
    circles = svg.selectAll('circle')
        .data(stations, (d) => d.short_name)  // Use station short_name as the key
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

    // Add event listener to the slider
    timeSlider.addEventListener('input', updateTimeDisplay);

    // Initial update of the time display
    updateTimeDisplay();
});