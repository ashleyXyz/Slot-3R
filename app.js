"use strict";

// Source: sec/6-appendix.tex, Table app-extended-pointcloud, k = 1.
// null means out-of-memory failure, never a zero-valued measurement.
const benchmarks = {
  "7Scenes": {
    fps: 19.18,
    Slot3R: [0.0336, 0.0351, 0.0348, 0.0369, 0.0362],
    Point3R: [0.1039, 0.0891, null, null, null],
    TTT3R: [0.0901, 0.1106, 0.1338, 0.1588, 0.1638],
    CUT3R: [0.2117, 0.2200, 0.2381, 0.2658, 0.2674]
  },
  NeuralRGBD: {
    fps: 18.91,
    Slot3R: [0.0406, 0.0505, 0.0588, 0.0604, 0.0618],
    Point3R: [0.1650, 0.1885, null, null, null],
    TTT3R: [0.1626, 0.1959, 0.2463, 0.2793, 0.2703],
    CUT3R: [0.3547, 0.3961, 0.4217, 0.4454, 0.4627]
  }
};
const colors = { Slot3R: "#4285d4", Point3R: "#369c68", TTT3R: "#ad64ba", CUT3R: "#dda91b" };
const lengths = [600, 700, 800, 900, 1000];

// Match the teaser's filled circle, triangle, diamond and star markers.
function chartMarker(method, cx, cy, size = 3.2) {
  const fill = colors[method];
  if (method === "Point3R") return `<circle cx="${cx}" cy="${cy}" r="${size}" fill="${fill}"/>`;
  const vertices = method === "CUT3R"
    ? [[0, -size - 0.6], [size + 0.6, size], [-size - 0.6, size]]
    : method === "TTT3R"
      ? [[0, -size - 0.6], [size, 0], [0, size + 0.6], [-size, 0]]
      : Array.from({ length: 10 }, (_, i) => {
          const angle = -Math.PI / 2 + i * Math.PI / 5;
          const radius = i % 2 ? size * 0.46 : size * 1.35;
          return [Math.cos(angle) * radius, Math.sin(angle) * radius];
        });
  return `<polygon points="${vertices.map(([dx, dy]) => `${cx + dx},${cy + dy}`).join(" ")}" fill="${fill}"/>`;
}

function renderChart(dataset) {
  const data = benchmarks[dataset];
  // Dataset-specific broken axes. No observations fall inside the omitted interval.
  // Each panel is linear; the lower panel receives more space to resolve low errors.
  const scales = {
    "7Scenes": { lowMax: 0.17, highMin: 0.20, highMax: 0.30,
      lowTicks: [0, 0.05, 0.10, 0.15], highTicks: [0.20, 0.25, 0.30] },
    NeuralRGBD: { lowMax: 0.30, highMin: 0.34, highMax: 0.50,
      lowTicks: [0, 0.05, 0.10, 0.15, 0.20, 0.25], highTicks: [0.35, 0.40, 0.45, 0.50] }
  };
  const scale = scales[dataset];
  const left = 60, right = 738;
  const highTop = 38, highBottom = 101, lowTop = 110, lowBottom = 299;
  const x = i => 76 + i * 132;
  const panel = v => v <= scale.lowMax ? "low" : v >= scale.highMin && v <= scale.highMax ? "high" : null;
  const y = value => panel(value) === "low"
    ? lowBottom - value / scale.lowMax * (lowBottom - lowTop)
    : highBottom - (value - scale.highMin) / (scale.highMax - scale.highMin) * (highBottom - highTop);
  const omitted = `${scale.lowMax.toFixed(2)}–${scale.highMin.toFixed(2)}`;
  const parts = [
    '<svg viewBox="0 0 760 350" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
    '<g font-size="11" fill="#555">',
    `<text x="399" y="20" text-anchor="middle" font-size="14" font-weight="700" fill="#222">Point Cloud Accuracy · ${dataset}</text>`
  ];
  for (const ticks of [scale.lowTicks, scale.highTicks]) {
    for (const value of ticks) {
      parts.push(`<line x1="${left}" y1="${y(value)}" x2="${right}" y2="${y(value)}" stroke="#ededed"/><text x="51" y="${y(value) + 3.5}" text-anchor="end">${value.toFixed(2)}</text>`);
    }
  }
  for (const [top, bottom] of [[highTop, highBottom], [lowTop, lowBottom]]) {
    lengths.forEach((_, i) => parts.push(`<line x1="${x(i)}" y1="${top}" x2="${x(i)}" y2="${bottom}" stroke="#ededed"/>`));
    parts.push(`<path d="M${left} ${top}V${bottom}" fill="none" stroke="#888" stroke-width="0.8"/>`);
  }
  parts.push(`<line x1="${left}" y1="${lowBottom}" x2="${right}" y2="${lowBottom}" stroke="#888" stroke-width="0.8"/>`);
  // A narrow break and small diagonal marks, as in the teaser's memory plot.
  for (const cut of [highBottom, lowTop]) {
    parts.push(`<path d="M${left-4} ${cut+2}l8 -4" fill="none" stroke="#777" stroke-width="1"/>`);
  }
  lengths.forEach((length, i) => parts.push(`<line x1="${x(i)}" y1="299" x2="${x(i)}" y2="303" stroke="#888" stroke-width="0.8"/><text x="${x(i)}" y="316" text-anchor="middle">${length}</text>`));
  parts.push('<text x="399" y="337" text-anchor="middle" font-size="12" fill="#333">Sequence length (frames)</text><text transform="translate(16 169) rotate(-90)" text-anchor="middle" font-size="12" fill="#333">Acc ↓</text>');
  for (const method of ["CUT3R", "TTT3R", "Point3R", "Slot3R"]) {
    let path = "", previousPanel = null;
    data[method].forEach((value, i) => {
      if (value === null) { previousPanel = null; return; }
      const currentPanel = panel(value);
      if (!currentPanel) throw new Error(`Observation in omitted range: ${dataset}, ${method}, ${value}`);
      path += `${previousPanel === currentPanel ? "L" : "M"}${x(i)},${y(value)} `;
      previousPanel = currentPanel;
    });
    parts.push(`<path data-method="${method}" d="${path}" fill="none" stroke="${colors[method]}" stroke-width="${method === "Slot3R" ? 2 : 1.8}" stroke-linecap="round" stroke-linejoin="round"/>`);
    data[method].forEach((value, i) => {
      if (value !== null) parts.push(`<g data-value="${value}" data-method="${method}" data-y="${y(value)}"><title>${method}, ${lengths[i]} frames: ${value.toFixed(4)}</title>${chartMarker(method, x(i), y(value))}</g>`);
    });
  }
  parts.push(`<text x="${x(1) + 13}" y="${y(data.Point3R[1]) + (dataset === "7Scenes" ? 4 : 17)}" font-size="10" font-weight="600" fill="${colors.Point3R}">OOM ≥ 800</text>`);
  parts.push('<rect x="626" y="43" width="104" height="73" fill="white" stroke="#d5d5d5" stroke-width="0.8"/>');
  ["Point3R", "CUT3R", "TTT3R", "Slot3R"].forEach((method, i) => {
    const cy = 55 + i * 16;
    parts.push(`<line x1="634" y1="${cy}" x2="655" y2="${cy}" stroke="${colors[method]}" stroke-width="1.8"/>${chartMarker(method, 644.5, cy, 2.7)}<text x="661" y="${cy + 3.5}" font-size="10.5" fill="#333">${method === "Slot3R" ? "Ours" : method}</text>`);
  });
  parts.push('</g></svg>');
  document.querySelector("#axis-note").textContent = `Y-axis break: ${omitted}. All measured points are shown; linear scales differ between segments and datasets.`;
  const chart = document.querySelector("#accuracy-chart");
  chart.innerHTML = parts.join("");
  chart.setAttribute("aria-label", `${dataset}: point-cloud accuracy error across 600 to 1000 frames. Slot3R reaches ${data.Slot3R[4].toFixed(4)} at 1000 frames. Point3R runs out of memory from 800 frames. The y-axis omits ${omitted} and expands the lower-error panel. Full values are available in View chart data.`);
  document.querySelector("#fps-value").innerHTML = `${data.fps.toFixed(2)} <small>FPS</small>`;
  document.querySelector("#fps-caption").textContent = `Average forwarding speed on ${dataset}.`;
  document.querySelector("#acc-value").innerHTML = `${data.Slot3R[4].toFixed(4)} <small>Acc</small>`;
  document.querySelector("#chart-data caption").textContent = `${dataset} · Point-cloud Acc (lower is better)`;
  document.querySelector("#chart-data tbody").innerHTML = Object.keys(colors).map(method => `<tr><th scope="row">${method}</th>${data[method].map(value => `<td${method === "Slot3R" ? ' class="best"' : ""}>${value === null ? "OOM" : value.toFixed(4)}</td>`).join("")}</tr>`).join("");
  document.querySelectorAll("[data-dataset]").forEach(button => {
    const active = button.dataset.dataset === dataset;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
document.querySelectorAll("[data-dataset]").forEach(button => button.addEventListener("click", () => renderChart(button.dataset.dataset)));
renderChart("7Scenes");

document.querySelectorAll("[data-scene]").forEach(button => button.addEventListener("click", () => {
  const scene = button.dataset.scene;
  document.querySelectorAll("[data-scene]").forEach(item => {
    const selected = item === button;
    item.classList.toggle("selected", selected);
    item.setAttribute("aria-pressed", String(selected));
  });
  for (const [method, label] of Object.entries({ point3r: "Point3R", slot3r: "Slot3R", gt: "Ground truth" })) {
    const img = document.querySelector(`#scene-${method}`);
    img.src = `assets/scene-${scene}-${method}.png`;
    img.alt = `Scene ${scene.padStart(2, "0")} · ${label}`;
    img.parentElement.dataset.zoom = img.getAttribute("src");
    img.parentElement.dataset.caption = img.alt;
  }
}));

const dialog = document.querySelector("#image-dialog");
document.querySelectorAll("[data-zoom]").forEach(button => button.addEventListener("click", () => {
  document.querySelector("#dialog-image").src = button.dataset.zoom;
  document.querySelector("#dialog-image").alt = button.dataset.caption;
  document.querySelector("#dialog-caption").textContent = button.dataset.caption;
  dialog.classList.toggle("native-image", Boolean(button.closest(".comparison-grid")));
  dialog.showModal();
}));
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

document.querySelector("#copy-citation").addEventListener("click", async () => {
  const button = document.querySelector("#copy-citation");
  const status = document.querySelector("#copy-status");
  const citation = document.querySelector("#bibtex");
  try {
    await navigator.clipboard.writeText(citation.textContent);
    button.textContent = "Copied!";
    status.textContent = "Citation copied to clipboard.";
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(citation);
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = "Press Ctrl+C";
    status.textContent = "Citation selected. Press Control C or Command C to copy.";
  }
  window.setTimeout(() => { button.textContent = "Copy citation"; }, 3000);
});

// Resize only messages from our own embedded scene viewer.
window.addEventListener('message',event=>{
  const frame=document.getElementById('scene-demo');
  if(!frame||event.origin!==location.origin||event.source!==frame.contentWindow)return;
  const {type,height}=event.data||{};
  if(type==='slot3r-demo-height'&&Number.isFinite(height)&&height>=300&&height<=5000)frame.style.height=`${Math.ceil(height)+4}px`;
});
