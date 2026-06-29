const map = L.map('map').setView([-0.0632, 110.1585], 7); 

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

window.layerPetaLISA = null;
window.instanceLineChart = null;
window.instanceBarChart = null;

const LISA_CONFIG = {
    'High-High': { warna: '#E63946', teks: 'High-High' },
    'Low-Low':   { warna: '#0000FF', teks: 'Low-Low' },
    'High-Low':  { warna: '#FF9999', teks: 'High-Low' },
    'Low-High':  { warna: '#87CEFA', teks: 'Low-High' },
    'Not Significant': { warna: '#ADB5BD', teks: 'Tidak Signifikan' }
};

const TAHUN_TIDAK_SIGNIFIKAN = ['2021', '2024'];

const TB_DATA_TAHUNAN = {
    '2020': 3822,
    '2021': 2977,
    '2022': 3685,
    '2023': 3929,
    '2024': 3760,
    '2025': 2273
};

function muatDataPetaDanDashboard(tahun) {
    const namaFileGeojson = `lisa_${tahun}.geojson`;
    console.log("Memuat data spasial: " + namaFileGeojson);

    const lisaNote = document.getElementById('lisaNote');
    if (lisaNote) {
        lisaNote.style.display = TAHUN_TIDAK_SIGNIFIKAN.includes(String(tahun)) ? 'block' : 'none';
    }

    fetch(namaFileGeojson)
        .then(response => {
            if (!response.ok) throw new Error('GeoJSON tidak ditemukan: ' + namaFileGeojson);
            return response.json();
        })
        .then(geojsonRaw => {
            const features = geojsonRaw.features;
            
            const totalKasus = features.reduce((sum, f) => {
                const p = f.properties;
                const kasus = p.KASUS_FIX !== undefined ? p.KASUS_FIX : (p['2020 TB Paru R1 — 2020_TOTAL_KASUS'] || 0);
                return sum + Number(kasus);
            }, 0);
            
            const meanKasus = totalKasus / features.length;
            let dataUntukDashboard = [];

            features.forEach(f => {
                const props = f.properties;
                const kasus = props.KASUS_FIX !== undefined ? props.KASUS_FIX : (props['2020 TB Paru R1 — 2020_TOTAL_KASUS'] || 0);
                const p = props.p_value;
                const z = props.Z_score;
                
                let cluster = "Not Significant";
                if (p !== undefined && z !== undefined && p <= 0.05) { 
                    if (z > 0) {
                        cluster = (kasus > meanKasus) ? "High-High" : "Low-Low";
                    } else {
                        cluster = (kasus > meanKasus) ? "High-Low" : "Low-High";
                    }
                }

                props.cluster_terhitung = cluster;
                props.kasus_fix = kasus;

                dataUntukDashboard.push({
                    namaKecamatan: props.NAME_3 || "Tanpa Nama",
                    kabupaten: props.NAME_2 || "Kalbar",
                    kasus: Number(kasus),
                    cluster: cluster
                });
            });

            tampilkanKeMapLeaflet(geojsonRaw);
            renderSummaryCard(dataUntukDashboard, tahun);
            renderTabelRanking(dataUntukDashboard);
            renderSidebarRanking(dataUntukDashboard);
            updateCharts(dataUntukDashboard, tahun);
        })
        .catch(err => {
            console.error("Gagal memproses file GeoJSON:", err);
            updateCharts([], tahun);
            renderSummaryCardDariJSON(tahun);
        });
}

function tampilkanKeMapLeaflet(geojsonInput) {
    if (window.layerPetaLISA) {
        map.removeLayer(window.layerPetaLISA);
    }

    window.layerPetaLISA = L.geoJSON(geojsonInput, {
        style: function(feature) {
            const clst = feature.properties.cluster_terhitung;
            return {
                fillColor: LISA_CONFIG[clst].warna,
                weight: 1.2,
                opacity: 1,
                color: '#1D3557',
                fillOpacity: clst === 'Not Significant' ? 0.25 : 0.9
            };
        },
        onEachFeature: function(feature, layer) {
            const p = feature.properties;
            layer.bindPopup(`
                <div class="map-popup-title">Kec. ${p.NAME_3 || '-'}</div>
                <div class="map-popup-row"><span>Kab.</span><b>${p.NAME_2 || '-'}</b></div>
                <div class="map-popup-row"><span>Total Kasus</span><b style="color:#E63946;">${p.kasus_fix}</b></div>
                <div class="map-popup-row"><span>Cluster</span><b style="color:${LISA_CONFIG[p.cluster_terhitung].warna};">${LISA_CONFIG[p.cluster_terhitung].teks}</b></div>
            `);
        }
    }).addTo(map);
}

function renderSummaryCard(data, tahun) {
    const totalKasusJSON = TB_DATA_TAHUNAN[String(tahun)];
    const totalKasusGeo = data.reduce((sum, d) => sum + d.kasus, 0);
    const totalKasus = totalKasusJSON !== undefined ? totalKasusJSON : totalKasusGeo;

    const totalHotspot = data.filter(d => d.cluster === 'High-High').length;

    const elCases = document.getElementById('statTotalCases');
    const elHotspot = document.getElementById('statHotspots');

    if (elCases) elCases.textContent = totalKasus.toLocaleString('id-ID');
    if (elHotspot) elHotspot.textContent = totalHotspot;
}


function renderSummaryCardDariJSON(tahun) {
    const totalKasus = TB_DATA_TAHUNAN[String(tahun)] || 0;

    const elCases = document.getElementById('statTotalCases');
    const elHotspot = document.getElementById('statHotspots');

    if (elCases) elCases.textContent = totalKasus.toLocaleString('id-ID');
    if (elHotspot) elHotspot.textContent = '—';
}

function renderTabelRanking(data) {
    const tabelBody = document.getElementById('statsTableBody');
    if (!tabelBody) return;
    tabelBody.innerHTML = ''; 

    const sortedData = [...data].sort((a, b) => a.namaKecamatan.localeCompare(b.namaKecamatan));
    sortedData.forEach(d => {
        const row = `
            <tr>
                <td><b>${d.namaKecamatan}</b>, <span style="color:#adb5bd; font-size:11px;">${d.kabupaten}</span></td>
                <td><strong style="color:#E63946;">${d.kasus}</strong></td>
                <td><span style="background-color: ${LISA_CONFIG[d.cluster].warna}20; color: ${LISA_CONFIG[d.cluster].warna}; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight:bold; border: 1px solid ${LISA_CONFIG[d.cluster].warna};">${d.cluster}</span></td>
            </tr>
        `;
        tabelBody.innerHTML += row;
    });
}

function renderSidebarRanking(data) {
    const rankListContainer = document.getElementById('rankList');
    if (!rankListContainer) return;
    rankListContainer.innerHTML = '';
    
    const topData = [...data].sort((a, b) => b.kasus - a.kasus).slice(0, 7);
    topData.forEach((d, index) => {
        const itemHtml = `
            <div class="rank-item">
                <div class="rank-num">${index + 1}</div>
                <div class="rank-info">
                    <div class="rank-name">Kec. ${d.namaKecamatan}</div>
                    <div class="rank-meta">${d.kabupaten} &middot; <span style="color:${LISA_CONFIG[d.cluster].warna};">${d.cluster}</span></div>
                </div>
                <div class="rank-cases">${d.kasus}</div>
            </div>
        `;
        rankListContainer.innerHTML += itemHtml;
    });
}

function updateCharts(data, tahunAktif) {
    const ctxLine = document.getElementById('lineChart');
    if (ctxLine) {
        if (window.instanceLineChart) window.instanceLineChart.destroy();

        const labels = Object.keys(TB_DATA_TAHUNAN).sort();
        const nilaiTahunan = labels.map(yr => TB_DATA_TAHUNAN[yr]);

        window.instanceLineChart = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Kasus TB',
                    data: nilaiTahunan,
                    borderColor: '#00B4D8',
                    backgroundColor: 'rgba(0,180,216,0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: labels.map(yr =>
                        String(yr) === String(tahunAktif) ? '#F4D35E' : '#00B4D8'
                    ),
                    pointRadius: labels.map(yr =>
                        String(yr) === String(tahunAktif) ? 6 : 4
                    )
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ' ' + ctx.parsed.y.toLocaleString('id-ID') + ' kasus'
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(29,53,87,0.5)' },
                        ticks: { color: '#ADB5BD', font: { size: 11 } }
                    },
                    x: {
                        grid: { color: 'rgba(29,53,87,0.3)' },
                        ticks: { color: '#ADB5BD', font: { size: 11 } }
                    }
                }
            }
        });
    }

    const ctxBar = document.getElementById('barChart');
    if (ctxBar) {
        if (window.instanceBarChart) window.instanceBarChart.destroy();
        const top5 = [...data].sort((a, b) => b.kasus - a.kasus).slice(0, 5);
        
        window.instanceBarChart = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: top5.map(d => d.namaKecamatan),
                datasets: [{
                    label: 'Total Kasus',
                    data: top5.map(d => d.kasus),
                    backgroundColor: top5.map(d =>
                        d.cluster === 'High-High' ? 'rgba(230,57,70,0.85)' : 'rgba(0,180,216,0.75)'
                    ),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ' ' + ctx.parsed.y.toLocaleString('id-ID') + ' kasus'
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(29,53,87,0.5)' },
                        ticks: { color: '#ADB5BD', font: { size: 11 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#ADB5BD', font: { size: 11 }, maxRotation: 30 }
                    }
                }
            }
        });
    }
}


document.addEventListener("DOMContentLoaded", function() {

    const dropdownTahun = document.getElementById('filterYear');
    if (dropdownTahun) {
        dropdownTahun.addEventListener('change', function(e) {
            muatDataPetaDanDashboard(e.target.value);
        });
        muatDataPetaDanDashboard(dropdownTahun.value);
    } else {
        muatDataPetaDanDashboard('2025');
    }

    const navTabs = document.querySelectorAll('.nav-tab');
    const pageSurveillance = document.getElementById('page-surveillance');
    const pageScreening = document.getElementById('page-screening');

    navTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            navTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            if (this.getAttribute('data-page') === 'surveillance') {
                pageSurveillance.classList.add('active');
                pageScreening.classList.remove('active');
                map.invalidateSize();
            } else {
                pageSurveillance.classList.remove('active');
                pageScreening.classList.add('active');
            }
        });
    });

    const modeButtons = document.querySelectorAll('.mode-btn');
    const mapElement = document.getElementById('map');
    const statsTableWrap = document.getElementById('statsTableWrap');
    const mapLegend = document.getElementById('mapLegend');
    const lisaNote = document.getElementById('lisaNote');

    modeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            modeButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            if (this.getAttribute('data-mode') === 'map') {
                mapElement.style.display = 'block';
                if (mapLegend) mapLegend.style.display = 'flex';
                statsTableWrap.classList.remove('active');
                map.invalidateSize();
            } else {
                mapElement.style.display = 'none';
                if (mapLegend) mapLegend.style.display = 'none';
                statsTableWrap.classList.add('active');
            }
        });
    });

    const uploadZone = document.getElementById('uploadZone');
    const xrayInput = document.getElementById('xrayInput');
    const xrayPreview = document.getElementById('xrayPreview');

    if (uploadZone && xrayInput) {
        uploadZone.addEventListener('click', () => xrayInput.click());
        xrayInput.addEventListener('change', function() {
            const file = this.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                xrayPreview.src = e.target.result;
                xrayPreview.style.display = 'block';
                uploadZone.style.display = 'none';
            };
            reader.readAsDataURL(file);
        });
    }

    const toggleTrack = document.getElementById('toggleTrack');
    const netModeText = document.getElementById('netModeText');
    const netDot = document.getElementById('netDot');
    const netLabel = document.getElementById('netLabel');
    const pillLocal = document.getElementById('pillLocal');
    const pillSynced = document.getElementById('pillSynced');

    let isOnline = true;

    function updateConnectionUI() {
        if (isOnline) {
            toggleTrack.classList.add('on');
            netModeText.textContent = 'online';
            if (netDot) { netDot.classList.remove('off'); }
            if (netLabel) netLabel.textContent = 'Online · sinkron otomatis';
            if (pillLocal) pillLocal.classList.remove('active-local');
            if (pillSynced) { pillSynced.classList.add('active-synced'); pillSynced.classList.remove('active-local'); }
        } else {
            toggleTrack.classList.remove('on');
            netModeText.textContent = 'offline';
            if (netDot) { netDot.classList.add('off'); }
            if (netLabel) netLabel.textContent = 'Offline · data tersimpan lokal';
            if (pillLocal) pillLocal.classList.add('active-local');
            if (pillSynced) { pillSynced.classList.remove('active-synced'); }
        }
    }

    if (toggleTrack) {
        toggleTrack.addEventListener('click', function() {
            isOnline = !isOnline;
            updateConnectionUI();
        });
        updateConnectionUI();
    }

    const runBtn = document.getElementById('runAnalysisBtn');
    const scanOverlay = document.getElementById('scanOverlay');
    const resultCard = document.getElementById('resultCard');
    const resultBadge = document.getElementById('resultBadge');
    const resultConfidenceText = document.getElementById('resultConfidenceText');
    const confidenceBarFill = document.getElementById('confidenceBarFill');

    if (runBtn) {
        runBtn.addEventListener('click', function() {
            if (!xrayPreview || xrayPreview.style.display === 'none') {
                alert('Silakan upload gambar X-ray terlebih dahulu.');
                return;
            }
            runBtn.disabled = true;
            if (scanOverlay) scanOverlay.classList.add('show');
            if (resultCard) resultCard.classList.remove('show');

            setTimeout(() => {
                if (scanOverlay) scanOverlay.classList.remove('show');
                runBtn.disabled = false;

                const positif = Math.random() > 0.5;
                const confidence = (60 + Math.random() * 35).toFixed(1);

                if (resultBadge) {
                    resultBadge.textContent = positif ? 'TB Positif' : 'TB Negatif';
                    resultBadge.className = 'result-badge ' + (positif ? 'pos' : 'neg');
                }
                if (resultConfidenceText) resultConfidenceText.textContent = confidence + '%';
                if (confidenceBarFill) {
                    confidenceBarFill.style.width = confidence + '%';
                    confidenceBarFill.style.background = positif ? 'var(--red)' : 'var(--green)';
                }
                if (resultCard) resultCard.classList.add('show');
            }, 2800);
        });
    }
});
