function normalizeLon(lon) { return ((lon + 180 + 360) % 360) - 180; }
function clampLat(lat) { return Math.max(-90, Math.min(90, lat)); }
function antipode(lat, lon) { return { lat: -lat, lon: normalizeLon(lon + 180) }; }
function formatDeg(v, decimals = 4) {
    return (Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals);
}

const latInput = document.getElementById('lat');
const lonInput = document.getElementById('lon');
const btnCompute = document.getElementById('compute');
const btnReset = document.getElementById('reset');
const output = document.getElementById('output');
const placeInput = document.getElementById('place');
const btnSearch = document.getElementById('search');
const resultsList = document.getElementById('results');

const earth = new WE.map('globe', {
    center: [20, 0],
    zoom: 2
});

WE.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/' +
    'World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri'
}).addTo(earth);

WE.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_only_labels/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors © CartoDB'
}).addTo(earth);

let markerA = null;
let markerB = null;

const redIcon = 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
const blueIcon = 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';

earth.on('click', function (e) {
    const lat = clampLat(e.latlng.lat);
    const lon = normalizeLon(e.latlng.lng);
    latInput.value = formatDeg(lat);
    lonInput.value = formatDeg(lon);
});

const landPolygonsUrl = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';
let landFeatureCollection = null;

async function loadLand() {
    try {
        const res = await fetch(landPolygonsUrl, { cache: 'force-cache' });
        landFeatureCollection = await res.json();
    } catch (e) {
        console.warn('陸地ポリゴンの読み込みに失敗しました。', e);
    }
}
loadLand();

function isLand(lat, lon) {
    if (!landFeatureCollection) return null;
    const pt = turf.point([lon, lat]);
    for (const feat of landFeatureCollection.features) {
        if (!feat.geometry) continue;
        if (turf.booleanPointInPolygon(pt, feat)) return true;
    }
    return false;
}

function setOutput(lat, lon, aLat, aLon, landA, landB) {
    const aBadge = landA === null ? '<span class="badge">判定中...</span>' :
        landA ? '<span class="badge land">陸地</span>' : '<span class="badge ocean">海</span>';
    const bBadge = landB === null ? '<span class="badge">判定中...</span>' :
        landB ? '<span class="badge land">陸地</span>' : '<span class="badge ocean">海</span>';

    output.innerHTML = `
    <div class="out-row"><strong>入力地点:</strong> 緯度 ${formatDeg(lat)}°, 経度 ${formatDeg(lon)}° ${aBadge}</div>
    <div class="out-row"><strong>裏側(アンティポード):</strong> 緯度 ${formatDeg(aLat)}°, 経度 ${formatDeg(aLon)}° ${bBadge}</div>
    <div class="out-row"><strong>判定:</strong> 入力地点は${landA === null ? '不明' : (landA ? '陸地' : '海')}, 裏側は${landB === null ? '不明' : (landB ? '陸地' : '海')} です。</div>
    <div class="note">注: 境界付近・小島では誤判定が起こることがあります。</div>
  `;
}

function compute(lat, lon) {
    lat = clampLat(lat);
    lon = normalizeLon(lon);
    const a = antipode(lat, lon);
    if (markerA) earth.removeMarker(markerA);
    if (markerB) earth.removeMarker(markerB);
    markerA = WE.marker([lat, lon], redIcon).addTo(earth);
    markerB = WE.marker([a.lat, a.lon], blueIcon).addTo(earth);
    earth.setView([lat, lon], 3);
    setOutput(lat, lon, a.lat, a.lon, null, null);
    const tryUpdate = () => {
        const landA = isLand(lat, lon);
        const landB = isLand(a.lat, a.lon);
        setOutput(lat, lon, a.lat, a.lon, landA, landB);
    };
    if (landFeatureCollection) {
        tryUpdate();
    } else {
        let attempts = 0;
        const interval = setInterval(() => {
            if (landFeatureCollection || attempts > 40) {
                clearInterval(interval);
                tryUpdate();
            }
            attempts++;
        }, 100);
    }
}

btnCompute.addEventListener('click', () => {
    let lat = parseFloat(latInput.value);
    let lon = parseFloat(lonInput.value);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
        alert('緯度・経度を数値で入力してください。');
        return;
    }
    compute(lat, lon);
});

btnReset.addEventListener('click', () => {
    if (markerA) earth.removeMarker(markerA);
    if (markerB) earth.removeMarker(markerB);
    markerA = null;
    markerB = null;
    latInput.value = '';
    lonInput.value = '';
    output.innerHTML = `
    <div class="out-row"><strong>入力地点:</strong> 未指定</div>
    <div class="out-row"><strong>裏側(アンティポード):</strong> 未計算</div>
    <div class="out-row"><strong>判定:</strong> —</div>
  `;
});

btnSearch.addEventListener('click', async () => {
    const query = placeInput.value.trim();
    if (!query) return;
    resultsList.innerHTML = '<li>検索中...</li>';
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
        const data = await res.json();
        if (data.length === 0) {
            resultsList.innerHTML = '<li>候補が見つかりませんでした</li>';
            return;
        }
        resultsList.innerHTML = '';
        data.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.display_name;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                const lat = parseFloat(item.lat);
                const lon = parseFloat(item.lon);
                latInput.value = formatDeg(lat);
                lonInput.value = formatDeg(lon);
                compute(lat, lon);
                resultsList.innerHTML = '';
            });
            resultsList.appendChild(li);
        });
    } catch (err) {
        console.error(err);
        resultsList.innerHTML = '<li>検索エラー</li>';
    }
});
