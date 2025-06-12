  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const coloriFamiglia = {
    "Fagaceae": "#2e8b57",
    "Betulaceae": "#66cdaa",
    "Cupressaceae": "#3cb371",
    "Pinaceae": "#228b22",
    "Fabaceae": "#9acd32",
    "Rosaceae": "#7ccd7c",
    "Ulmaceae": "#8fbc8f",
    "Malvaceae": "#90ee90",
    "Oleaceae": "#b0e57c",
    "Moraceae": "#6b8e23",
    "sconosciuto": "#a9dfbf"
  };

  const urlParams = new URLSearchParams(window.location.search);
  const lat = parseFloat(urlParams.get("lat")) || 44.49164;
  const lng = parseFloat(urlParams.get("lng")) || 11.35416;
  const zoom = parseFloat(urlParams.get("zoom")) || 15;

  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [lng, lat],
    zoom: zoom
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-right');

  class LegendControl {
    onAdd(map) {
      this._map = map;
      this._container = document.createElement('div');
      this._container.className = 'legend';
      this._container.innerHTML = '<b>Famiglie:</b><br>';
      Object.entries(coloriFamiglia).forEach(([famiglia, colore]) => {
        this._container.innerHTML += `<div class="legend-item"><div class="legend-color" style="background:${colore};"></div>${famiglia}</div>`;
      });
      return this._container;
    }
    onRemove() {
      this._container.parentNode.removeChild(this._container);
      this._map = undefined;
    }
  }

  map.addControl(new LegendControl(), 'bottom-left');

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
  const infoPanel = document.getElementById("info");

  function updateUrlFromMap(map) {
    const center = map.getCenter();
    const zoom = map.getZoom().toFixed(2);
    const lat = center.lat.toFixed(5);
    const lng = center.lng.toFixed(5);
    const newUrl = `${location.pathname}?lat=${lat}&lng=${lng}&zoom=${zoom}`;
    window.history.replaceState({}, '', newUrl);
  }

  map.on('moveend', () => updateUrlFromMap(map));

  function populateFamilyFilter(features) {
    const familySet = new Set();
    features.forEach(f => {
      if (f.properties.family) familySet.add(f.properties.family);
    });
    const familySelect = document.getElementById("filter-family");
    [...familySet].sort().forEach(f => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      familySelect.appendChild(opt);
    });
  }

  function populateNomiChecklist(features, selectedFamily = null) {
    const nomiCount = {};
    features.forEach(f => {
      const p = f.properties;
      if ((!selectedFamily || p.family === selectedFamily) && p.nome) {
        const key = `${p.nome} – ${p.family}`;
        nomiCount[key] = (nomiCount[key] || 0) + 1;
      }
    });

    const checklistContainer = document.getElementById("filter-nomi");
    checklistContainer.innerHTML = "";
    Object.entries(nomiCount)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([label, count]) => {
        const id = `nome-${label.replace(/[^\w]+/g, "_")}`;
        checklistContainer.innerHTML += `
          <label for="${id}">
            <input type="checkbox" value="${label}" id="${id}" checked>
            ${label} (${count})
          </label><br/>
        `;
      });
  }

function applyFilters() {
  const selectedFamily = document.getElementById("filter-family").value;
  const allCheckboxes = document.querySelectorAll('#filter-nomi input');
  const checkedLabels = Array.from(allCheckboxes).filter(e => e.checked).map(e => e.value);
  const checkedNomi = checkedLabels.map(label => label.split(" – ")[0]);

  const filters = ["all"];
  let filtered = false;

  if (selectedFamily) {3
    filters.push(["==", ["get", "family"], selectedFamily]);
    filtered = true;
  }

  if (checkedNomi.length > 0 && checkedNomi.length !== allCheckboxes.length) {
    filters.push(["in", ["get", "nome"], ["literal", checkedNomi]]);
    filtered = true;
  }

  const finalFilter = filters.length > 1 ? filters : null;
  map.setFilter("alberi.mbtiles", finalFilter);
  map.setFilter("alberi-tronco", finalFilter);

  // conteggio alberi visibili
  const shown = map.queryRenderedFeatures({ layers: ['alberi.mbtiles'] }).length;
  document.getElementById("tree-count").textContent = `Mostrati: ${shown} alberi`;

  // bordo con effetto flash se filtrato
  if (filtered) {
    let visible = true;
    const flashInterval = setInterval(() => {
      map.setPaintProperty("alberi.mbtiles", "circle-stroke-color", visible ? "#ff0000" : "#00000000");
      visible = !visible;
    }, 100);

    setTimeout(() => {
      clearInterval(flashInterval);
      map.setPaintProperty("alberi.mbtiles", "circle-stroke-color",
        ["match", ["get", "family"], ...Object.entries(coloriFamiglia).flat(), "#a9dfbf"]
      );
    }, 2000);
  } else {
    map.setPaintProperty("alberi.mbtiles", "circle-stroke-color",
      ["match", ["get", "family"], ...Object.entries(coloriFamiglia).flat(), "#a9dfbf"]
    );
  }
}


  document.getElementById("filter-family").addEventListener("change", () => {
    const selectedFamily = document.getElementById("filter-family").value;
    const features = map.querySourceFeatures("alberi", { sourceLayer: "alberi" });
    populateNomiChecklist(features, selectedFamily || null);
    applyFilters();
  });

  document.getElementById("filter-nomi").addEventListener("change", applyFilters);
  document.getElementById("select-all").addEventListener("click", () => {
    document.querySelectorAll('#filter-nomi input').forEach(cb => cb.checked = true);
    applyFilters();
  });
  document.getElementById("deselect-all").addEventListener("click", () => {
    document.querySelectorAll('#filter-nomi input').forEach(cb => cb.checked = false);
    applyFilters();
  });
  document.getElementById("reset-button").addEventListener("click", () => {
    document.getElementById("filter-family").value = "";
    const features = map.querySourceFeatures("alberi", { sourceLayer: "alberi" });
    populateNomiChecklist(features);
    document.querySelectorAll('#filter-nomi input').forEach(cb => cb.checked = true);
    applyFilters();
  });

  map.on('style.load', () => {
    map.addSource("alberi", {
      type: "vector",
      url: "pmtiles://alberi.pmtiles"
    });

    map.addLayer({
      id: "alberi.mbtiles",
      type: "circle",
      source: "alberi",
      "source-layer": "alberi",
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          13, ["interpolate", ["linear"], ["get", "height"], 0, 3, 30, 6],
          18, ["interpolate", ["linear"], ["get", "height"], 0, 6, 30, 14]
        ],
        "circle-color": ["match", ["get", "family"], ...Object.entries(coloriFamiglia).flat(), "#a9dfbf"],
        "circle-stroke-color": ["match", ["get", "family"], ...Object.entries(coloriFamiglia).flat(), "#a9dfbf"],
        "circle-stroke-width": 1,
        "circle-opacity": 0.7
      }
    });

    map.addLayer({
      id: "alberi-tronco",
      type: "circle",
      source: "alberi",
      "source-layer": "alberi",
      paint: {
        "circle-radius": 1.5,
        "circle-color": "#8b4513",
        "circle-stroke-color": "#5c3317",
        "circle-stroke-width": 0.5,
        "circle-opacity": 1
      }
    }, "alberi.mbtiles");

    map.once('idle', () => {
      const features = map.querySourceFeatures("alberi", { sourceLayer: "alberi" });
      populateFamilyFilter(features);
      populateNomiChecklist(features);
      applyFilters();
    });

    map.on('mousemove', 'alberi.mbtiles', (e) => {
      const feature = e.features[0];
      const props = feature.properties;
      popup.setLngLat(e.lngLat)
        .setHTML(`<strong>${props.nome || props.classe}</strong><br/>Famiglia: ${props.family}`)
        .addTo(map);

      infoPanel.innerHTML = `
        <strong>${props.nome || props.classe}</strong><br/>
        <ul style="padding-left: 1em;">
          <li><b>specie:</b> ${props.classe}</li>
          <li><b>famiglia:</b> ${props.family}</li>
          <li><b>dimora:</b> ${props.dimora}</li>
          <!--
          <li><b>irrigazione:</b> ${props.irriga}</li>
          <li><b>Pregio:</b> ${props.pregio}</li>
          <li><b>Data inventario:</b> ${props.data_inv}</li>
          <li><b>Data aggiornamento:</b> ${props.data_agg}</li>
          -->
          <li><b>Distanza edificio:</b> ${props.d_edif}</li>
          <!--
          <li><b>Data impianto:</b> ${props.data_impnt}</li>
          <li><b>In patrimonio:</b> ${props.in_patrim}</li>
          <li><b>Anni impianto:</b> ${props.anni_impnt}</li>
          -->
          <li><b>altezza:</b> ${props.height} m</li>
          <li><b>circonferenza chioma:</b> ${props.girth} cm</li>
          <!--
          <li><b>Tipo chioma:</b> ${props.chioma_tipo}</li>
          -->
        </ul>`;
    });

    map.on('mouseleave', 'alberi.mbtiles', () => {
      popup.remove();
      infoPanel.innerHTML = "Passa il mouse su un albero per i dettagli.";
    });
  });