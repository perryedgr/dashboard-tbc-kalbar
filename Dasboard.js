/* DATA & COLORS */
let kalbarData = [];
let yearlyTrend = {};

const clusterColors = { HH:'#E63946', LL:'#2ECC71', HL:'#F4D35E', LH:'#48CAE4', noData:'#ADB5BD', 'High-High':'#E63946', 'Low-Low':'#2ECC71', 'High-Low':'#F4D35E', 'Low-High':'#48CAE4', '1':'#E63946', '2':'#2ECC71', '3':'#F4D35E', '4':'#48CAE4', '0':'#ADB5BD' };
const clusterLabels = { HH:'High-High (hotspot)', LL:'Low-Low', HL:'High-Low', LH:'Low-High', noData:'No data', 'High-High':'High-High (hotspot)', 'Low-Low':'Low-Low', 'High-Low':'High-Low', 'Low-High':'Low-High', '1':'High-High (hotspot)', '2':'Low-Low', '3':'High-Low', '4':'Low-High', '0':'No data / Not Signif.' };

async function loadTBData(){
  try {
    const response = await fetch("tb_data.json");
    const rawData = await response.json();
    kalbarData = [];
    
    // Bikin dropdown filter tahun otomatis sesuai isi tb_data.json lu (dari tahun terbesar ke terkecil)
    const availableYears = Object.keys(rawData).sort((a,b) => b - a);
    const filterYearElement = document.getElementById('filterYear');
    if(filterYearElement && availableYears.length > 0) {
      filterYearElement.innerHTML = availableYears.map(y => `<option value="${y}">${y}</option>`).join('');
    }
    
    for (const yearKey in rawData) {
      rawData[yearKey].forEach(item => {
        let jumlahKasus = parseInt(item.TOTAL_KASUS) || parseInt(item.cases) || 0;
        // Ambil data screening (kalo di JSON lu gada kolom ini, otomatis disamain sama jumlah kasus)
        let totalScreenings = parseInt(item.TOTAL_SCREENING) || parseInt(item.screenings) || jumlahKasus;
        // Ambil data growth asli
        let dataGrowth = parseFloat(item.GROWTH) || parseFloat(item.growth) || 0;
        
        kalbarData.push({
          year: parseInt(yearKey),
          name: item.KECAMATAN + ', ' + item.KABUPATEN,
          cases: jumlahKasus,
          screenings: totalScreenings,
          cluster: "noData", 
          growth: dataGrowth
        });
      });
    }

    yearlyTrend = {};
    kalbarData.forEach(d => {
      if(!yearlyTrend[d.year]) yearlyTrend[d.year] = 0;
      yearlyTrend[d.year] += d.cases;
    });

  } catch(e) {
    console.error("Gagal load tb_data.json:", e);
  }
}

/* SUMMARY CARDS  */
function renderSummary(data){
  // Kalkulasi ini 100% ngambil dari data yang lagi difilter (tahun terpilih)
  const cases = data.reduce((a,d)=>a+d.cases,0);
  const screenings = data.reduce((a,d)=>a+d.screenings,0);
  const hotspots = data.filter(d=>['HH','High-High','1'].includes(d.cluster)).length;
  
  document.getElementById('statTotalCases').textContent = cases.toLocaleString('id-ID');
  document.getElementById('statHotspots').textContent = hotspots;
  document.getElementById('statScreenings').textContent = screenings.toLocaleString('id-ID');
  
  const posRate = screenings > 0 ? ((cases/screenings)*100).toFixed(1)+'%' : '0%';
  document.getElementById('statPositiveRate').textContent = posRate;
}

/* MAP (GEOJSON LISA)  */
let map;
let mapLayer = null;

function initMap(){
  map = L.map('map', { zoomControl:true, attributionControl:false }).setView([-0.05, 110.2], 6.7);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:12, minZoom:5 }).addTo(map);
}

async function loadLISA(year) {
  try {
    const response = await fetch(`lisa_${year}.geojson`);
    const geojson = await response.json();

    if (mapLayer) map.removeLayer(mapLayer);

    const dataTahunIni = kalbarData.filter(d => d.year == parseInt(year));
    
    geojson.features.forEach(feature => {
       let rawCluster = feature.properties.q_value || feature.properties.cluster || feature.properties.CLUSTER || feature.properties.LISA_CLUST || 'noData';
       let clusterStat = String(rawCluster);
       
       let namaKecamatanMap = feature.properties.name || feature.properties.NAME || feature.properties.KECAMATAN || feature.properties.WADMKC || '';

       let matchedData = dataTahunIni.find(d => {
           if (!d.name) return false;
           return d.name.toLowerCase().includes(namaKecamatanMap.toLowerCase());
       });
       
       if (matchedData) {
           matchedData.cluster = clusterStat; 
       }
    });

    mapLayer = L.geoJSON(geojson, {
      style: function(feature) {
        let rawCluster = feature.properties.q_value || feature.properties.cluster || feature.properties.CLUSTER || feature.properties.LISA_CLUST || 'noData';
        let clusterStat = String(rawCluster);
        
        const finalColor = clusterColors[clusterStat] || '#ADB5BD';
        return { color: finalColor, fillColor: finalColor, weight: 1.5, fillOpacity: 0.6 };
      },
      onEachFeature: function(feature, layer) {
        let rawCluster = feature.properties.q_value || feature.properties.cluster || feature.properties.CLUSTER || feature.properties.LISA_CLUST || 'noData';
        let clusterStat = String(rawCluster);
        
        const casesVal = feature.properties.cases || feature.properties.CASES || feature.properties.TOTAL_KASUS || 0;
        const nameVal = feature.properties.name || feature.properties.NAME || feature.properties.KECAMATAN || feature.properties.WADMKC || 'Wilayah';
        
        layer.bindPopup(`
          <div class="map-popup-title">${nameVal}</div>
          <div class="map-popup-row"><span>Kasus TB</span><b>${casesVal}</b></div>
          <div class="map-popup-row"><span>Cluster LISA</span><b>${clusterLabels[clusterStat] || 'No data'}</b></div>
        `);
      }
    }).addTo(map);
  } catch(e) {
    console.log(`Peta lisa_${year}.geojson belum siap atau tidak ditemukan:`, e);
  }
}

/* RANKING & TABLE  */
function renderRanking(data){
  const sorted = [...data].sort((a,b)=>b.cases-a.cases).slice(0,8);
  const wrap = document.getElementById('rankList');
  wrap.innerHTML = sorted.map((d,i)=>`
    <div class="rank-item">
      <div class="rank-num">${i+1}</div>
      <div class="rank-info">
        <div class="rank-name">${d.name}</div>
        <div class="rank-meta">
          <span class="cluster-badge" style="background:${clusterColors[d.cluster]||'#ADB5BD'}22; color:${clusterColors[d.cluster]||'#ADB5BD'};">${clusterLabels[d.cluster]||'No data'}</span>
        </div>
      </div>
      <div class="rank-cases">${d.cases}</div>
    </div>
  `).join('');
}

function renderStatsTable(data){
  const sorted = [...data].sort((a,b)=>b.cases-a.cases);
  document.getElementById('statsTableBody').innerHTML = sorted.map(d=>`
    <tr>
      <td>${d.name}</td>
      <td style="font-family:var(--font-mono);">${d.cases}</td>
      <td><span class="cluster-badge" style="background:${clusterColors[d.cluster]||'#ADB5BD'}22; color:${clusterColors[d.cluster]||'#ADB5BD'};">${clusterLabels[d.cluster]||'No data'}</span></td>
    </tr>
  `).join('');
}

function renderStatsTable(data){
  const sorted = [...data].sort((a,b)=>b.cases-a.cases);
  document.getElementById('statsTableBody').innerHTML = sorted.map(d=>`
    <tr>
      <td>${d.name}</td>
      <td style="font-family:var(--font-mono);">${d.cases}</td>
      <td><span class="cluster-badge" style="background:${clusterColors[d.cluster]||'#ADB5BD'}22; color:${clusterColors[d.cluster]||'#ADB5BD'};">${clusterLabels[d.cluster]||'No data'}</span></td>
      <td style="color:${d.growth>=0?'#E63946':'#2ECC71'};">${d.growth>=0?'+':''}${d.growth}%</td>
    </tr>
  `).join('');
}

/* CHARTS  */
Chart.defaults.color = '#ADB5BD';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;

let lineChartInst, barChartInst;

function buildCharts(data){
  if(lineChartInst) lineChartInst.destroy();
  if(barChartInst) barChartInst.destroy();

  const years = Object.keys(yearlyTrend).sort();
  const values = years.map(y=>yearlyTrend[y]);

  lineChartInst = new Chart(document.getElementById('lineChart'), {
    type:'line',
    data:{ labels:years, datasets:[{
      label:'Total kasus TB', data:values, borderColor:'#00B4D8', backgroundColor:'rgba(0,180,216,0.15)',
      tension:0.35, fill:true, pointRadius:3, pointBackgroundColor:'#48CAE4', borderWidth:2
    }]},
    options:{
      plugins:{ legend:{ display:false } },
      scales:{ x:{ grid:{ color:'rgba(29,53,87,0.4)' } }, y:{ grid:{ color:'rgba(29,53,87,0.4)' }, beginAtZero:false } }
    }
  });

  const topSix = [...data].sort((a,b)=>b.cases-a.cases).slice(0,6);
  barChartInst = new Chart(document.getElementById('barChart'), {
    type:'bar',
    data:{ labels:topSix.map(d=>d.name.split(',')[0].replace('Kota ','').replace('Kabupaten ','')),
      datasets:[{ data:topSix.map(d=>d.cases), backgroundColor:topSix.map(d=>clusterColors[d.cluster]||'#ADB5BD'), borderRadius:6, maxBarThickness:26 }]},
    options:{
      indexAxis:'y', plugins:{ legend:{ display:false } },
      scales:{ x:{ grid:{ color:'rgba(29,53,87,0.4)' } }, y:{ grid:{ display:false } } }
    }
  });
}

/* CONTROL FILTERS & TABS  */
async function updateDashboardByYear(year) {
  await loadLISA(year);
  const filteredData = kalbarData.filter(d => d.year == parseInt(year));
  const dataToRender = filteredData.length > 0 ? filteredData : [];
  
  renderSummary(dataToRender);
  renderRanking(dataToRender);
  renderStatsTable(dataToRender);
  buildCharts(dataToRender);
}

document.getElementById('filterYear').addEventListener('change', async (e) => { 
  await updateDashboardByYear(e.target.value); 
});

document.querySelectorAll('.nav-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-'+tab.dataset.page).classList.add('active');
    if(tab.dataset.page==='surveillance' && map){ setTimeout(()=>map.invalidateSize(), 80); }
  });
});

document.querySelectorAll('.mode-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    if(mode==='map'){
      document.getElementById('map').classList.remove('hidden'); document.getElementById('statsTableWrap').classList.remove('active'); document.getElementById('mapLegend').style.display='flex';
      setTimeout(()=>map.invalidateSize(), 60);
    } else {
      document.getElementById('map').classList.add('hidden'); document.getElementById('statsTableWrap').classList.add('active'); document.getElementById('mapLegend').style.display='none';
    }
  });
});

/* AI MODEL CONFIGURATION  */
let cnnModel = null;
let isModelLoading = true;

async function loadCNNModel() {
  try {
    console.log("Sedang memuat model CNN...");
    const runBtn = document.getElementById('runAnalysisBtn');
    if(runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = "Memuat Model AI (Mohon Tunggu)...";
    }

    cnnModel = await tf.loadGraphModel('model.json');
    
    isModelLoading = false;
    if(runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = "Jalankan analisis CNN";
    }
    console.log("Model CNN Berhasil Dimuat & Siap Digunakan!");
  } catch (error) {
    console.error("Gagal memuat model CNN:", error);
    const formHint = document.getElementById('formHint');
    if(formHint) {
      formHint.textContent = "Gagal memuat model AI. Pastikan folder 'model_tfjs' sudah diekstrak.";
      formHint.style.color = "var(--red)";
    }
  }
}

/* SCREENING LOGIC  */
const uploadZone = document.getElementById('uploadZone');
const xrayInput = document.getElementById('xrayInput');
const xrayPreview = document.getElementById('xrayPreview');
let xrayUploaded = false;

uploadZone.addEventListener('click', ()=>xrayInput.click());
xrayInput.addEventListener('change', ()=>{
  const file = xrayInput.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    xrayPreview.src = e.target.result;
    xrayPreview.style.display = 'block';
    uploadZone.style.display = 'none';
    xrayUploaded = true;
  };
  reader.readAsDataURL(file);
});

let isOnline = true;
const netToggleTrack = document.getElementById('netToggleTrack');
document.getElementById('netToggle').addEventListener('click', ()=>{
  isOnline = !isOnline;
  netToggleTrack.classList.toggle('on', isOnline);
  document.getElementById('netToggleLabel').textContent = 'Simulasi koneksi: ' + (isOnline ? 'online' : 'offline');
  const dot = document.getElementById('netDot');
  const label = document.getElementById('netLabel');
  dot.classList.toggle('off', !isOnline);
  label.textContent = isOnline ? 'Online · sinkron otomatis' : 'Offline · data tersimpan lokal';
});

const runBtn = document.getElementById('runAnalysisBtn');
const scanOverlay = document.getElementById('scanOverlay');
const resultCard = document.getElementById('resultCard');
const formHint = document.getElementById('formHint');

runBtn.addEventListener('click', ()=>{
  const name = document.getElementById('fName').value.trim();
  const age = document.getElementById('fAge').value;
  const date = document.getElementById('fDate').value;

  if(!xrayUploaded){ formHint.textContent = 'Mohon upload citra X-ray terlebih dahulu.'; formHint.style.color = 'var(--orange)'; return; }
  if(!name || !age || !date){ formHint.textContent = 'Lengkapi nama, umur, dan tanggal pemeriksaan terlebih dahulu.'; formHint.style.color = 'var(--orange)'; return; }
  
  if(isModelLoading || !cnnModel) { 
    formHint.textContent = 'Model AI belum selesai dimuat. Tunggu sebentar...'; 
    formHint.style.color = 'var(--orange)';
    return; 
  }

  formHint.style.color = 'var(--gray)';
  formHint.textContent = 'Menganalisis citra dengan CNN ResNet50 asli…';
  runBtn.disabled = true;
  scanOverlay.classList.add('show');

  setTimeout(async () => {
    scanOverlay.classList.remove('show');
    runBtn.disabled = false;

    try {
      let tensor = tf.browser.fromPixels(xrayPreview)
        .resizeNearestNeighbor([224, 224]) 
        .toFloat();
      
      tensor = tensor.div(tf.scalar(255.0));
      tensor = tensor.expandDims(0);

      const prediction = await cnnModel.predict(tensor).data();
      const hasilPrediksi = prediction[0]; 

      const isPositive = hasilPrediksi > 0.5; 
      const confidence = isPositive ? (hasilPrediksi * 100) : ((1 - hasilPrediksi) * 100);

      const badge = document.getElementById('resultBadge');
      badge.textContent = isPositive ? 'TB Positive' : 'TB Negative';
      badge.className = 'result-badge ' + (isPositive ? 'pos' : 'neg');

      document.getElementById('resultConfidenceText').textContent = confidence.toFixed(1) + '%';
      const fill = document.getElementById('confidenceBarFill');
      fill.style.width = confidence.toFixed(1) + '%';
      fill.style.background = isPositive ? 'var(--red)' : 'var(--green)';

      const pillLocal = document.getElementById('storagePillLocal');
      const pillSynced = document.getElementById('storagePillSynced');
      pillLocal.className = 'storage-pill';
      pillSynced.className = 'storage-pill';
      if(isOnline){
        pillSynced.classList.add('active-synced');
      } else {
        pillLocal.classList.add('active-local');
      }

      resultCard.classList.add('show');
      formHint.textContent = isOnline
        ? 'Hasil berhasil dianalisis menggunakan model CNN ResNet50 asli dan disinkronkan.'
        : 'Hasil dianalisis secara lokal menggunakan browser (offline mode).';
    } catch (err) {
      console.error("Gagal melakukan prediksi:", err);
      formHint.textContent = "Terjadi kesalahan saat memproses gambar.";
      formHint.style.color = "var(--red)";
    }
  }, 1600);
});

/* INIT RUN  */
async function runSetup() {
    await loadTBData();
    await loadCNNModel(); 
    initMap();
    
    // Ambil tahun otomatis dari dropdown yang udah keisi
    const filterYearDropdown = document.getElementById('filterYear');
    const startYear = filterYearDropdown.value; 
    
    // Validasi jaga-jaga kalau json kosong
    if(startYear) {
      await updateDashboardByYear(startYear);
    }
    
    const regencySelect = document.getElementById('fRegency');
    const uniqueNames = [...new Set(kalbarData.map(d => d.name.split(',')[1] || d.name))].filter(Boolean);
    if(uniqueNames.length > 0) {
        regencySelect.innerHTML = uniqueNames.map(name => `<option value="${name}">${name}</option>`).join('');
    }
}
runSetup();
