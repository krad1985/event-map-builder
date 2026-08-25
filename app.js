/**
 * 活動地圖產生器 - Event Map Builder v2.0
 * 主要應用程式邏輯
 */

// ========================================
// 全域變數
// ========================================

let map;
let currentProject = null;
let projects = [];
let markers = {};
let drawings = {};
let routes = {};
let textMarkers = {};
let shapes = {};
let currentTool = 'select';
let selectedMarker = null;
let isDrawing = false;
let isDrawingRoute = false;
let isDrawingPolygon = false;
let currentPath = [];
let pendingTextLatLng = null;
let routePreview = null;
let polygonPreview = null;
let rectanglePreview = null;
let lastClickTime = 0;

// 圖層群組
let destinationLayer, parkingLayer, roadsideLayer, busLayer, taxiLayer, accessibleLayer, drawingLayer, routeLayer, textLayer, shapeLayer;

// 底圖圖層
let basemapLayers = {};
let currentBasemap = 'osm';

// Undo 歷史
let undoHistory = [];
let undoIndex = -1;
const MAX_UNDO = 50;

// 地圖鎖定
let mapLocked = false;

// ========================================
// 初始化
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadProjects();
    bindEvents();
    
    if (projects.length === 0) {
        createProject('我的第一個活動', '', '');
    } else {
        selectProject(projects[0].id);
    }
});

function initMap() {
    map = L.map('map', {
        center: [25.033, 121.565],
        zoom: 15,
        zoomControl: true
    });

    basemapLayers = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }),
        light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap & CARTO',
            maxZoom: 19
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 18
        }),
        quiet: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap & CARTO',
            maxZoom: 19
        })
    };
    
    basemapLayers.osm.addTo(map);

    destinationLayer = L.layerGroup().addTo(map);
    parkingLayer = L.layerGroup().addTo(map);
    roadsideLayer = L.layerGroup().addTo(map);
    busLayer = L.layerGroup().addTo(map);
    taxiLayer = L.layerGroup().addTo(map);
    accessibleLayer = L.layerGroup().addTo(map);
    drawingLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    textLayer = L.layerGroup().addTo(map);
    shapeLayer = L.layerGroup().addTo(map);

    map.on('click', onMapClick);
    map.on('mousemove', onMapMouseMove);
    map.on('dblclick', onMapDoubleClick);
    map.on('mousedown', onMapMouseDown);
    map.on('mouseup', onMapMouseUp);
}

// ========================================
// 事件綁定
// ========================================

function bindEvents() {
    // 工具按鈕
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    // 專案管理
    document.getElementById('btn-projects').addEventListener('click', openProjectDialog);
    document.getElementById('btn-close-projects').addEventListener('click', closeProjectDialog);
    document.getElementById('btn-new-project').addEventListener('click', openNewProjectDialog);
    document.getElementById('btn-close-new-project').addEventListener('click', closeNewProjectDialog);
    document.getElementById('btn-cancel-new-project').addEventListener('click', closeNewProjectDialog);
    document.getElementById('btn-confirm-new-project').addEventListener('click', confirmNewProject);

    // 活動資訊
    document.getElementById('btn-event-info').addEventListener('click', openEventInfoDialog);
    document.getElementById('btn-close-event-info').addEventListener('click', closeEventInfoDialog);
    document.getElementById('btn-cancel-event-info').addEventListener('click', closeEventInfoDialog);
    document.getElementById('btn-confirm-event-info').addEventListener('click', saveEventInfo);

    // 匯出/匯入
    document.getElementById('btn-export').addEventListener('click', exportProject);
    document.getElementById('btn-import').addEventListener('click', openImportDialog);
    document.getElementById('btn-close-import').addEventListener('click', closeImportDialog);
    document.getElementById('file-import').addEventListener('change', importProject);

    // 匯入 KML/GPX
    document.getElementById('btn-import-kml').addEventListener('click', openImportKMLDialog);
    document.getElementById('btn-close-import-kml').addEventListener('click', closeImportKMLDialog);
    document.getElementById('file-import-kml').addEventListener('change', importKML);

    // 截圖/PDF
    document.getElementById('btn-screenshot').addEventListener('click', exportScreenshot);
    document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);

    // 分享
    document.getElementById('btn-share').addEventListener('click', openShareDialog);
    document.getElementById('btn-close-share').addEventListener('click', closeShareDialog);
    document.getElementById('btn-cancel-share').addEventListener('click', closeShareDialog);
    document.getElementById('btn-copy-share-link').addEventListener('click', copyShareLink);
    document.getElementById('btn-download-share').addEventListener('click', downloadSharePage);

    // 列印
    document.getElementById('btn-print').addEventListener('click', printMap);

    // 天氣
    document.getElementById('btn-weather').addEventListener('click', openWeatherDialog);
    document.getElementById('btn-close-weather').addEventListener('click', closeWeatherDialog);
    document.getElementById('btn-cancel-weather').addEventListener('click', closeWeatherDialog);
    document.getElementById('btn-refresh-weather').addEventListener('click', refreshWeather);

    // 教學
    document.getElementById('btn-tutorial').addEventListener('click', startTutorial);

    // 匯出靜態 HTML
    document.getElementById('btn-export-html').addEventListener('click', exportStaticHTML);

    // 屬性面板
    document.getElementById('btn-close-panel').addEventListener('click', closePropertiesPanel);
    document.getElementById('btn-apply-props').addEventListener('click', applyProperties);

    // 路線設定
    document.getElementById('route-color').addEventListener('input', updateRouteSettings);
    document.getElementById('route-width').addEventListener('input', updateRouteSettings);
    document.getElementById('route-style').addEventListener('change', updateRouteSettings);

    // 畫筆設定
    document.getElementById('draw-color').addEventListener('input', updateDrawSettings);
    document.getElementById('draw-opacity').addEventListener('input', updateDrawSettings);
    document.getElementById('draw-width').addEventListener('input', updateDrawSettings);

    // 幾何圖案設定
    document.getElementById('shape-color').addEventListener('input', updateShapeSettings);
    document.getElementById('shape-opacity').addEventListener('input', updateShapeSettings);

    // 底圖切換
    document.querySelectorAll('input[name="basemap"]').forEach(radio => {
        radio.addEventListener('change', switchBasemap);
    });

    // 圖層控制
    document.getElementById('layer-destinations').addEventListener('change', toggleLayer);

    // 鎖定地圖
    document.getElementById('btn-lock-map').addEventListener('click', toggleMapLock);
    document.getElementById('layer-parking').addEventListener('change', toggleLayer);
    document.getElementById('layer-roadside').addEventListener('change', toggleLayer);
    document.getElementById('layer-bus').addEventListener('change', toggleLayer);
    document.getElementById('layer-taxi').addEventListener('change', toggleLayer);
    document.getElementById('layer-accessible').addEventListener('change', toggleLayer);
    document.getElementById('layer-routes').addEventListener('change', toggleLayer);
    document.getElementById('layer-texts').addEventListener('change', toggleLayer);
    document.getElementById('layer-shapes').addEventListener('change', toggleLayer);
    document.getElementById('layer-drawings').addEventListener('change', toggleLayer);

    // 文字方塊對話框
    document.getElementById('btn-close-text').addEventListener('click', closeTextDialog);
    document.getElementById('btn-cancel-text').addEventListener('click', closeTextDialog);
    document.getElementById('btn-confirm-text').addEventListener('click', confirmTextDialog);

    // 刪除按鈕
    document.getElementById('btn-delete-drawing').addEventListener('click', deleteSelectedDrawing);
    document.getElementById('btn-delete-text').addEventListener('click', deleteSelectedText);
    document.getElementById('btn-delete-route').addEventListener('click', deleteSelectedRoute);
    document.getElementById('btn-delete-shape').addEventListener('click', deleteSelectedShape);

    // Undo 按鈕
    document.getElementById('btn-undo').addEventListener('click', undo);

    // 鍵盤快捷鍵
    document.addEventListener('keydown', handleKeyboard);

    // 拖曳匯入
    const importZone = document.querySelector('.import-zone');
    if (importZone) {
        importZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            importZone.classList.add('dragover');
        });
        importZone.addEventListener('dragleave', () => importZone.classList.remove('dragover'));
        importZone.addEventListener('drop', (e) => {
            e.preventDefault();
            importZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.json')) handleImportFile(file);
        });
    }
}

// ========================================
// 工具切換
// ========================================

function setTool(tool) {
    currentTool = tool;
    
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    
    // 更新 body class（用於游標樣式）
    document.body.className = '';
    if (tool !== 'select') {
        document.body.classList.add('tool-' + tool);
    }
    
    // 顯示/隱藏提示
    document.getElementById('route-hint').style.display = (tool === 'route') ? 'flex' : 'none';
    document.getElementById('draw-hint').style.display = (tool === 'draw') ? 'flex' : 'none';
    document.getElementById('polygon-hint').style.display = (tool === 'polygon') ? 'flex' : 'none';
    
    // 結束進行中的繪製
    if (tool !== 'draw' && tool !== 'rectangle' && isDrawing) finishDrawing();
    if (tool !== 'route' && isDrawingRoute) finishRoute();
    if (tool !== 'polygon' && isDrawingPolygon) finishPolygon();
    
    // 清除選取
    if (tool !== 'select') deselectMarker();
}

// ========================================
// 地圖互動
// ========================================

function onMapClick(e) {
    const { lat, lng } = e.latlng;
    const now = Date.now();
    
    // 偵測連點兩下（間隔 < 300ms）
    if (now - lastClickTime < 300) {
        // 雙擊結束繪製
        if (isDrawingRoute) { finishRoute(); return; }
        if (isDrawingPolygon) { finishPolygon(); return; }
    }
    lastClickTime = now;
    
    switch (currentTool) {
        case 'destination': addMarker('destination', lat, lng); break;
        case 'parking': addMarker('parking', lat, lng); break;
        case 'roadside': addMarker('roadside', lat, lng); break;
        case 'bus': addMarker('bus', lat, lng); break;
        case 'taxi': addMarker('taxi', lat, lng); break;
        case 'accessible': addMarker('accessible', lat, lng); break;
        case 'text':
            pendingTextLatLng = [lat, lng];
            openTextDialog();
            break;
        case 'route':
            currentPath.push([lat, lng]);
            isDrawingRoute = true;
            updateRoutePreview();
            break;
        case 'draw':
            currentPath.push([lat, lng]);
            isDrawing = true;
            updateDrawingPreview();
            break;
        case 'polygon':
            currentPath.push([lat, lng]);
            isDrawingPolygon = true;
            updatePolygonPreview();
            break;
        case 'delete':
            deselectMarker();
            break;
    }
}

function onMapMouseMove(e) {
    if (currentTool === 'rectangle' && isDrawing && currentPath.length > 0) {
        updateRectanglePreview(e.latlng);
    } else if (currentTool === 'draw' && isDrawing && currentPath.length > 0) {
        updateDrawingPreview(e.latlng);
    }
    if (isDrawingRoute && currentPath.length > 0) {
        updateRoutePreview(e.latlng);
    }
    if (isDrawingPolygon && currentPath.length > 0) {
        updatePolygonPreview(e.latlng);
    }
}

function onMapDoubleClick(e) {
    // 雙擊結束繪製
    if (isDrawingRoute) finishRoute();
    if (isDrawingPolygon) finishPolygon();
}

function onMapMouseDown(e) {
    if (currentTool === 'rectangle') {
        const { lat, lng } = e.latlng;
        currentPath = [[lat, lng]];
        isDrawing = true;
    }
}

function onMapMouseUp(e) {
    if (isDrawing && currentTool === 'rectangle' && currentPath.length === 1) {
        const { lat, lng } = e.latlng;
        finishRectangle(lat, lng);
    }
}

// ========================================
// 標記管理
// ========================================

function addMarker(type, lat, lng, data = null) {
    const id = data ? data.id : generateId();
    const markerData = data || {
        id, type, lat, lng,
        name: getDefaultName(type),
        note: '',
        color: getDefaultColor(type)
    };
    
    addMarkerToMap(markerData);
    saveToUndo('新增標記');
    saveCurrentProject();
    return markerData;
}

function addMarkerToMap(data) {
    const { id, type, lat, lng, name, note, color } = data;
    
    let icon;
    if (['bus', 'taxi', 'accessible', 'roadside'].includes(type)) {
        // 車輛圖標 - 只顯示 emoji
        icon = L.divIcon({
            className: 'vehicle-marker-container',
            html: `<div class="vehicle-marker">${getMarkerEmoji(type)}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14]
        });
    } else {
        // 水滴型標記
        icon = L.divIcon({
            className: 'custom-marker-container',
            html: `<div class="custom-marker" style="background: ${color}"><span>${getMarkerEmoji(type)}</span></div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });
    }
    
    const marker = L.marker([lat, lng], {
        icon, draggable: true,
        data: { id, type, name, note, color }
    });
    
    marker.bindPopup(createPopupContent(data), { maxWidth: 250, className: 'marker-popup' });
    
    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (currentTool === 'select') selectMarker(id);
        else if (currentTool === 'delete') deleteMarker(id);
    });
    
    marker.on('dragend', () => saveCurrentProject());
    
    marker.on('popupopen', () => {
        const editBtn = document.querySelector(`#edit-marker-${id}`);
        if (editBtn) editBtn.addEventListener('click', () => { selectMarker(id); marker.closePopup(); });
        const deleteBtn = document.querySelector(`#delete-marker-${id}`);
        if (deleteBtn) deleteBtn.addEventListener('click', () => deleteMarker(id));
    });
    
    marker.addTo(getLayerByType(type));
    markers[id] = marker;
    return marker;
}

function deleteMarker(id) {
    if (!confirm('確定要刪除這個標記嗎？')) return;
    const marker = markers[id];
    if (marker) {
        getLayerByType(marker.options.data.type).removeLayer(marker);
        delete markers[id];
        if (selectedMarker === id) deselectMarker();
        saveToUndo('刪除標記');
        saveCurrentProject();
    }
}

function selectMarker(id) {
    deselectMarker();
    const marker = markers[id];
    if (marker) {
        selectedMarker = id;
        openPropertiesPanel(marker.options.data);
        const icon = marker.getElement();
        if (icon) icon.style.transform = 'scale(1.2)';
    }
}

function deselectMarker() {
    if (selectedMarker) {
        const marker = markers[selectedMarker];
        if (marker) { const icon = marker.getElement(); if (icon) icon.style.transform = ''; }
        const route = routes[selectedMarker];
        if (route) route.setStyle({ opacity: 0.8 });
        const text = textMarkers[selectedMarker];
        if (text) { const icon = text.getElement(); if (icon) icon.classList.remove('selected'); }
        const shape = shapes[selectedMarker];
        if (shape) shape.setStyle({ opacity: 0.5 });
    }
    selectedMarker = null;
    closePropertiesPanel();
}

function createPopupContent(data) {
    return `
        <div class="marker-popup">
            <h4>${getMarkerEmoji(data.type)} ${escapeHtml(data.name)}</h4>
            ${data.note ? `<p>${escapeHtml(data.note)}</p>` : ''}
            <div style="margin-top: 10px; display: flex; gap: 8px;">
                <button id="edit-marker-${data.id}" class="btn btn-primary" style="flex: 1;">編輯</button>
                <button id="delete-marker-${data.id}" class="btn btn-danger" style="flex: 1;">刪除</button>
            </div>
        </div>
    `;
}

// ========================================
// 路線工具
// ========================================

function updateRouteSettings() {}

function updateRoutePreview(latLng) {
    if (routePreview) { routeLayer.removeLayer(routePreview); routePreview = null; }
    if (currentPath.length < 1) return;
    
    const color = document.getElementById('route-color').value;
    const width = parseInt(document.getElementById('route-width').value);
    const style = document.getElementById('route-style').value;
    
    const points = [...currentPath];
    if (latLng) points.push([latLng.lat, latLng.lng]);
    
    if (points.length >= 2) {
        const options = { color, weight: width, opacity: 0.7 };
        if (style === 'dashed') options.dashArray = '10, 10';
        else if (style === 'arrow') options.dashArray = '15, 10';
        
        routePreview = L.polyline(points, options);
        routePreview.addTo(routeLayer);
    }
}

function finishRoute() {
    if (routePreview) { routeLayer.removeLayer(routePreview); routePreview = null; }
    if (currentPath.length < 2) { currentPath = []; isDrawingRoute = false; return; }
    
    const routeData = {
        id: generateId(),
        points: [...currentPath],
        name: '',
        note: '',
        color: document.getElementById('route-color').value,
        width: parseInt(document.getElementById('route-width').value),
        style: document.getElementById('route-style').value
    };
    
    addRouteToMap(routeData);
    currentPath = [];
    isDrawingRoute = false;
    saveToUndo('新增路線');
    saveCurrentProject();
}

function addRouteToMap(data) {
    const { id, points, name, note, color, width, style } = data;
    const options = { color, weight: width, opacity: 0.8, data: { id, name, note, color, width, style } };
    if (style === 'dashed') options.dashArray = '10, 10';
    else if (style === 'arrow') options.dashArray = '15, 10';
    
    const polyline = L.polyline(points, options);
    polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (currentTool === 'select') selectRoute(id);
        else if (currentTool === 'delete') deleteRoute(id);
    });
    
    if (name) {
        const midpoint = points[Math.floor(points.length / 2)];
        const label = L.divIcon({ className: 'route-marker-label', html: name, iconSize: null, iconAnchor: [0, 0] });
        const labelMarker = L.marker(midpoint, { icon: label, interactive: false });
        labelMarker.addTo(routeLayer);
        polyline._labelMarker = labelMarker;
    }
    
    polyline.addTo(routeLayer);
    routes[id] = polyline;
    return polyline;
}

function selectRoute(id) {
    const route = routes[id];
    if (!route) return;
    selectedMarker = id;
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('hidden');
    document.querySelectorAll('.props-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('props-route').classList.remove('hidden');
    const data = route.options.data;
    document.getElementById('prop-route-name').value = data.name || '';
    document.getElementById('prop-route-note').value = data.note || '';
    route.setStyle({ opacity: 1 });
}

function deleteRoute(id) {
    if (!confirm('確定要刪除這條路線嗎？')) return;
    const route = routes[id];
    if (route) {
        if (route._labelMarker) routeLayer.removeLayer(route._labelMarker);
        routeLayer.removeLayer(route);
        delete routes[id];
        if (selectedMarker === id) deselectMarker();
        saveToUndo('刪除路線');
        saveCurrentProject();
    }
}

function deleteSelectedRoute() { if (selectedMarker && routes[selectedMarker]) deleteRoute(selectedMarker); }

// ========================================
// 畫筆工具
// ========================================

function updateDrawSettings() {}

function updateDrawingPreview(latLng) {
    if (drawings['_preview']) { drawingLayer.removeLayer(drawings['_preview']); }
    if (currentPath.length < 1) return;
    
    const color = document.getElementById('draw-color').value;
    const opacity = parseFloat(document.getElementById('draw-opacity').value);
    const width = parseInt(document.getElementById('draw-width').value);
    
    const points = [...currentPath];
    if (latLng) points.push([latLng.lat, latLng.lng]);
    
    if (points.length >= 2) {
        const preview = L.polygon(points, { color, weight: width, opacity, fillOpacity: opacity * 0.5, dashArray: '5, 10', interactive: false });
        preview.addTo(drawingLayer);
        drawings['_preview'] = preview;
    }
}

function finishDrawing() {
    if (drawings['_preview']) { drawingLayer.removeLayer(drawings['_preview']); delete drawings['_preview']; }
    if (currentPath.length < 2) { currentPath = []; isDrawing = false; return; }
    
    const drawingData = {
        id: generateId(),
        points: [...currentPath],
        color: document.getElementById('draw-color').value,
        opacity: parseFloat(document.getElementById('draw-opacity').value),
        width: parseInt(document.getElementById('draw-width').value),
        label: ''
    };
    
    addDrawingToMap(drawingData);
    currentPath = [];
    isDrawing = false;
    saveToUndo('新增畫筆');
    saveCurrentProject();
}

function addDrawingToMap(data) {
    const { id, points, color, opacity, width, label } = data;
    const polygon = L.polygon(points, { color, weight: width, opacity, fillOpacity: opacity * 0.5, data: { id, points, color, opacity, width, label } });
    polygon.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (currentTool === 'select') selectDrawing(id);
        else if (currentTool === 'delete') deleteDrawing(id);
    });
    polygon.addTo(drawingLayer);
    drawings[id] = polygon;
    return polygon;
}

function selectDrawing(id) {
    const drawing = drawings[id];
    if (!drawing) return;
    selectedMarker = id;
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('hidden');
    document.querySelectorAll('.props-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('props-draw').classList.remove('hidden');
    document.getElementById('prop-draw-label').value = drawing.options.data.label || '';
}

function deleteSelectedDrawing() {
    if (!selectedMarker) return;
    const drawing = drawings[selectedMarker];
    if (drawing && confirm('確定要刪除這個標記嗎？')) {
        drawingLayer.removeLayer(drawing);
        delete drawings[selectedMarker];
        deselectMarker();
        saveToUndo('刪除畫筆');
        saveCurrentProject();
    }
}

function deleteDrawing(id) {
    if (!confirm('確定要刪除這個標記嗎？')) return;
    const drawing = drawings[id];
    if (drawing) {
        drawingLayer.removeLayer(drawing);
        delete drawings[id];
        if (selectedMarker === id) deselectMarker();
        saveToUndo('刪除畫筆');
        saveCurrentProject();
    }
}

// ========================================
// 矩形工具
// ========================================

function updateRectanglePreview(latLng) {
    if (rectanglePreview) { shapeLayer.removeLayer(rectanglePreview); rectanglePreview = null; }
    if (currentPath.length < 1) return;
    
    const start = currentPath[0];
    const color = document.getElementById('shape-color').value;
    const opacity = parseFloat(document.getElementById('shape-opacity').value);
    
    const bounds = [[start[0], start[1]], [latLng.lat, latLng.lng]];
    rectanglePreview = L.rectangle(bounds, { color, weight: 2, opacity, fillOpacity: opacity, dashArray: '5, 5', interactive: false });
    rectanglePreview.addTo(shapeLayer);
}

function finishRectangle(endLat, endLng) {
    if (rectanglePreview) { shapeLayer.removeLayer(rectanglePreview); rectanglePreview = null; }
    if (currentPath.length < 1) { currentPath = []; isDrawing = false; return; }
    
    const start = currentPath[0];
    const bounds = [[start[0], start[1]], [endLat, endLng]];
    
    const shapeData = {
        id: generateId(),
        type: 'rectangle',
        bounds: bounds,
        color: document.getElementById('shape-color').value,
        opacity: parseFloat(document.getElementById('shape-opacity').value),
        label: ''
    };
    
    addShapeToMap(shapeData);
    currentPath = [];
    isDrawing = false;
    saveToUndo('新增矩形');
    saveCurrentProject();
}

// ========================================
// 多邊形工具
// ========================================

function updatePolygonPreview(latLng) {
    if (polygonPreview) { shapeLayer.removeLayer(polygonPreview); polygonPreview = null; }
    if (currentPath.length < 1) return;
    
    const color = document.getElementById('shape-color').value;
    const opacity = parseFloat(document.getElementById('shape-opacity').value);
    
    const points = [...currentPath];
    if (latLng) points.push([latLng.lat, latLng.lng]);
    
    if (points.length >= 2) {
        polygonPreview = L.polygon(points, { color, weight: 2, opacity, fillOpacity: opacity * 0.5, dashArray: '5, 5', interactive: false });
        polygonPreview.addTo(shapeLayer);
    }
}

function finishPolygon() {
    if (polygonPreview) { shapeLayer.removeLayer(polygonPreview); polygonPreview = null; }
    if (currentPath.length < 3) { currentPath = []; isDrawingPolygon = false; return; }
    
    const shapeData = {
        id: generateId(),
        type: 'polygon',
        points: [...currentPath],
        color: document.getElementById('shape-color').value,
        opacity: parseFloat(document.getElementById('shape-opacity').value),
        label: ''
    };
    
    addShapeToMap(shapeData);
    currentPath = [];
    isDrawingPolygon = false;
    saveToUndo('新增多邊形');
    saveCurrentProject();
}

function addShapeToMap(data) {
    const { id, type, points, bounds, color, opacity, label } = data;
    let shape;
    
    if (type === 'rectangle' && bounds) {
        shape = L.rectangle(bounds, { color, weight: 2, opacity, fillOpacity: opacity * 0.5, data: { id, type, bounds, color, opacity, label } });
    } else if (type === 'polygon' && points) {
        shape = L.polygon(points, { color, weight: 2, opacity, fillOpacity: opacity * 0.5, data: { id, type, points, color, opacity, label } });
    }
    
    if (shape) {
        shape.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (currentTool === 'select') selectShape(id);
            else if (currentTool === 'delete') deleteShape(id);
        });
        shape.addTo(shapeLayer);
        shapes[id] = shape;
    }
    return shape;
}

function selectShape(id) {
    const shape = shapes[id];
    if (!shape) return;
    selectedMarker = id;
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('hidden');
    document.querySelectorAll('.props-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('props-shape').classList.remove('hidden');
    document.getElementById('prop-shape-label').value = shape.options.data.label || '';
    shape.setStyle({ opacity: 0.8 });
}

function deleteShape(id) {
    if (!confirm('確定要刪除這個圖案嗎？')) return;
    const shape = shapes[id];
    if (shape) {
        shapeLayer.removeLayer(shape);
        delete shapes[id];
        if (selectedMarker === id) deselectMarker();
        saveToUndo('刪除圖案');
        saveCurrentProject();
    }
}

function deleteSelectedShape() { if (selectedMarker && shapes[selectedMarker]) deleteShape(selectedMarker); }

function updateShapeSettings() {}

// ========================================
// 文字方塊
// ========================================

function openTextDialog() {
    document.getElementById('input-text-content').value = '';
    document.getElementById('dialog-text').showModal();
    document.getElementById('input-text-content').focus();
}

function closeTextDialog() { document.getElementById('dialog-text').close(); pendingTextLatLng = null; }

function confirmTextDialog() {
    const content = document.getElementById('input-text-content').value.trim();
    if (!content) { alert('請輸入文字內容'); return; }
    if (pendingTextLatLng) {
        const textData = { id: generateId(), lat: pendingTextLatLng[0], lng: pendingTextLatLng[1], content, fontSize: 16, bgColor: '#ffffff', textColor: '#333333' };
        addTextToMap(textData);
        saveToUndo('新增文字');
        saveCurrentProject();
    }
    closeTextDialog();
}

function addTextToMap(data) {
    const { id, lat, lng, content, fontSize, bgColor, textColor } = data;
    const icon = L.divIcon({
        className: 'text-marker-container',
        html: `<div class="text-marker" style="font-size: ${fontSize}px; background: ${bgColor}; color: ${textColor}; border-color: ${textColor}">${escapeHtml(content)}</div>`,
        iconSize: null, iconAnchor: [0, 0]
    });
    const marker = L.marker([lat, lng], { icon, draggable: true, data: { id, content, fontSize, bgColor, textColor } });
    marker.on('click', (e) => { L.DomEvent.stopPropagation(e); if (currentTool === 'select') selectText(id); else if (currentTool === 'delete') deleteText(id); });
    marker.on('dragend', () => saveCurrentProject());
    marker.addTo(textLayer);
    textMarkers[id] = marker;
    return marker;
}

function selectText(id) {
    const text = textMarkers[id];
    if (!text) return;
    selectedMarker = id;
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('hidden');
    document.querySelectorAll('.props-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('props-text').classList.remove('hidden');
    const data = text.options.data;
    document.getElementById('prop-text-content').value = data.content || '';
    document.getElementById('prop-text-size').value = data.fontSize || 16;
    document.getElementById('prop-text-bg').value = data.bgColor || '#ffffff';
    document.getElementById('prop-text-color').value = data.textColor || '#333333';
    const icon = text.getElement();
    if (icon) icon.classList.add('selected');
}

function deleteText(id) {
    if (!confirm('確定要刪除這個文字嗎？')) return;
    const text = textMarkers[id];
    if (text) { textLayer.removeLayer(text); delete textMarkers[id]; if (selectedMarker === id) deselectMarker(); saveToUndo('刪除文字'); saveCurrentProject(); }
}

function deleteSelectedText() { if (selectedMarker && textMarkers[selectedMarker]) deleteText(selectedMarker); }

// ========================================
// Undo 功能
// ========================================

function saveToUndo(action) {
    // 移除之後的歷史
    undoHistory = undoHistory.slice(0, undoIndex + 1);
    // 儲存目前狀態的快照
    const snapshot = {
        action,
        markers: JSON.parse(JSON.stringify(Object.values(markers).map(m => ({ ...m.options.data, lat: m.getLatLng().lat, lng: m.getLatLng().lng })))),
        routes: JSON.parse(JSON.stringify(Object.values(routes).map(r => ({ ...r.options.data, points: r.getLatLngs().map(ll => [ll.lat, ll.lng]) })))),
        drawings: JSON.parse(JSON.stringify(Object.values(drawings).map(d => d.options.data))),
        textMarkers: JSON.parse(JSON.stringify(Object.values(textMarkers).map(t => ({ ...t.options.data, lat: t.getLatLng().lat, lng: t.getLatLng().lng })))),
        shapes: JSON.parse(JSON.stringify(Object.values(shapes).map(s => s.options.data)))
    };
    undoHistory.push(snapshot);
    if (undoHistory.length > MAX_UNDO) undoHistory.shift();
    undoIndex = undoHistory.length - 1;
    showUndoToast(action);
}

function undo() {
    if (undoIndex <= 0) { alert('沒有更多操作可以還原'); return; }
    undoIndex--;
    restoreFromUndo(undoHistory[undoIndex]);
}

function restoreFromUndo(snapshot) {
    clearMap();
    snapshot.markers.forEach(m => addMarkerToMap(m));
    snapshot.routes.forEach(r => addRouteToMap(r));
    snapshot.drawings.forEach(d => addDrawingToMap(d));
    snapshot.textMarkers.forEach(t => addTextToMap(t));
    snapshot.shapes.forEach(s => addShapeToMap(s));
    saveCurrentProject();
}

function showUndoToast(action) {
    const toast = document.getElementById('undo-toast');
    document.getElementById('undo-message').textContent = action;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ========================================
// 屬性面板
// ========================================

function openPropertiesPanel(data) {
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('hidden');
    document.querySelectorAll('.props-section').forEach(s => s.classList.add('hidden'));
    const section = document.getElementById(`props-${data.type}`);
    if (section) {
        section.classList.remove('hidden');
        switch (data.type) {
            case 'destination':
                document.getElementById('prop-dest-name').value = data.name || '';
                document.getElementById('prop-dest-note').value = data.note || '';
                document.getElementById('prop-dest-color').value = data.color || '#e74c3c';
                break;
            case 'parking':
                document.getElementById('prop-parking-name').value = data.name || '';
                document.getElementById('prop-parking-note').value = data.note || '';
                document.getElementById('prop-parking-color').value = data.color || '#3498db';
                break;
            case 'roadside':
                document.getElementById('prop-roadside-name').value = data.name || '';
                document.getElementById('prop-roadside-note').value = data.note || '';
                break;
            case 'bus':
                document.getElementById('prop-bus-name').value = data.name || '';
                document.getElementById('prop-bus-note').value = data.note || '';
                document.getElementById('prop-bus-color').value = data.color || '#27ae60';
                break;
            case 'taxi':
                document.getElementById('prop-taxi-name').value = data.name || '';
                document.getElementById('prop-taxi-note').value = data.note || '';
                document.getElementById('prop-taxi-color').value = data.color || '#f1c40f';
                break;
            case 'accessible':
                document.getElementById('prop-accessible-name').value = data.name || '';
                document.getElementById('prop-accessible-note').value = data.note || '';
                document.getElementById('prop-accessible-color').value = data.color || '#3498db';
                break;
            case 'draw':
                document.getElementById('prop-draw-label').value = data.label || '';
                break;
        }
    }
}

function closePropertiesPanel() { document.getElementById('properties-panel').classList.add('hidden'); }

function applyProperties() {
    if (!selectedMarker) return;
    
    // 路線
    if (routes[selectedMarker]) {
        const data = routes[selectedMarker].options.data;
        data.name = document.getElementById('prop-route-name').value.trim();
        data.note = document.getElementById('prop-route-note').value.trim();
        if (routes[selectedMarker]._labelMarker) routeLayer.removeLayer(routes[selectedMarker]._labelMarker);
        if (data.name) {
            const latlngs = routes[selectedMarker].getLatLngs();
            const midpoint = latlngs[Math.floor(latlngs.length / 2)];
            const label = L.divIcon({ className: 'route-marker-label', html: data.name, iconSize: null, iconAnchor: [0, 0] });
            routes[selectedMarker]._labelMarker = L.marker(midpoint, { icon: label, interactive: false }).addTo(routeLayer);
        }
        saveCurrentProject(); deselectMarker(); return;
    }
    
    // 文字
    if (textMarkers[selectedMarker]) {
        const data = textMarkers[selectedMarker].options.data;
        data.content = document.getElementById('prop-text-content').value.trim() || '文字';
        data.fontSize = parseInt(document.getElementById('prop-text-size').value);
        data.bgColor = document.getElementById('prop-text-bg').value;
        data.textColor = document.getElementById('prop-text-color').value;
        const icon = L.divIcon({
            className: 'text-marker-container',
            html: `<div class="text-marker" style="font-size: ${data.fontSize}px; background: ${data.bgColor}; color: ${data.textColor}; border-color: ${data.textColor}">${escapeHtml(data.content)}</div>`,
            iconSize: null, iconAnchor: [0, 0]
        });
        textMarkers[selectedMarker].setIcon(icon);
        saveCurrentProject(); deselectMarker(); return;
    }
    
    // 幾何圖案
    if (shapes[selectedMarker]) {
        shapes[selectedMarker].options.data.label = document.getElementById('prop-shape-label').value.trim();
        saveCurrentProject(); deselectMarker(); return;
    }
    
    // 一般標記
    const marker = markers[selectedMarker];
    if (!marker) return;
    const data = marker.options.data;
    
    switch (data.type) {
        case 'destination':
            data.name = document.getElementById('prop-dest-name').value.trim() || '目的地';
            data.note = document.getElementById('prop-dest-note').value.trim();
            data.color = document.getElementById('prop-dest-color').value;
            break;
        case 'parking':
            data.name = document.getElementById('prop-parking-name').value.trim() || '停車場';
            data.note = document.getElementById('prop-parking-note').value.trim();
            data.color = document.getElementById('prop-parking-color').value;
            break;
        case 'roadside':
            data.name = document.getElementById('prop-roadside-name').value.trim() || '小車';
            data.note = document.getElementById('prop-roadside-note').value.trim();
            break;
        case 'bus':
            data.name = document.getElementById('prop-bus-name').value.trim() || '遊覽車停靠點';
            data.note = document.getElementById('prop-bus-note').value.trim();
            data.color = document.getElementById('prop-bus-color').value;
            break;
        case 'taxi':
            data.name = document.getElementById('prop-taxi-name').value.trim() || '計程車搭乘處';
            data.note = document.getElementById('prop-taxi-note').value.trim();
            data.color = document.getElementById('prop-taxi-color').value;
            break;
        case 'accessible':
            data.name = document.getElementById('prop-accessible-name').value.trim() || '無障礙車位';
            data.note = document.getElementById('prop-accessible-note').value.trim();
            data.color = document.getElementById('prop-accessible-color').value;
            break;
    }
    
    // 重建圖標
    let icon;
    if (['bus', 'taxi', 'accessible', 'roadside'].includes(data.type)) {
        icon = L.divIcon({ className: 'vehicle-marker-container', html: `<div class="vehicle-marker">${getMarkerEmoji(data.type)}</div>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
    } else {
        icon = L.divIcon({ className: 'custom-marker-container', html: `<div class="custom-marker" style="background: ${data.color}"><span>${getMarkerEmoji(data.type)}</span></div>`, iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] });
    }
    marker.setIcon(icon);
    marker.setPopupContent(createPopupContent(data));
    saveCurrentProject(); deselectMarker();
}

// ========================================
// 專案管理
// ========================================

function loadProjects() {
    const saved = localStorage.getItem('eventMapProjects');
    if (saved) { try { projects = JSON.parse(saved); } catch (e) { projects = []; } }
}

function saveProjects() { localStorage.setItem('eventMapProjects', JSON.stringify(projects)); }

function createProject(name, date, note) {
    const project = {
        id: generateId(), name, date, note,
        eventInfo: { name, date, time: '', address: '', organizer: '', phone: '', email: '', url: '', description: '', transport: '' },
        mapState: { center: [25.033, 121.565], zoom: 15 },
        markers: [], drawings: [], routes: [], textMarkers: [], shapes: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    projects.push(project);
    saveProjects();
    selectProject(project.id);
    updateProjectList();
    return project;
}

function selectProject(projectId) {
    if (currentProject) saveCurrentProject();
    currentProject = projects.find(p => p.id === projectId);
    if (currentProject) {
        clearMap();
        if (currentProject.mapState) map.setView(currentProject.mapState.center, currentProject.mapState.zoom);
        if (currentProject.markers) currentProject.markers.forEach(m => addMarkerToMap(m));
        if (currentProject.drawings) currentProject.drawings.forEach(d => addDrawingToMap(d));
        if (currentProject.routes) currentProject.routes.forEach(r => addRouteToMap(r));
        if (currentProject.textMarkers) currentProject.textMarkers.forEach(t => addTextToMap(t));
        if (currentProject.shapes) currentProject.shapes.forEach(s => addShapeToMap(s));
        updateProjectList();
    }
}

function saveCurrentProject() {
    if (!currentProject) return;
    currentProject.markers = Object.values(markers).map(m => ({ ...m.options.data, lat: m.getLatLng().lat, lng: m.getLatLng().lng }));
    currentProject.drawings = Object.values(drawings).map(d => d.options.data);
    currentProject.routes = Object.values(routes).map(r => ({ ...r.options.data, points: r.getLatLngs().map(ll => [ll.lat, ll.lng]) }));
    currentProject.textMarkers = Object.values(textMarkers).map(t => ({ ...t.options.data, lat: t.getLatLng().lat, lng: t.getLatLng().lng }));
    currentProject.shapes = Object.values(shapes).map(s => s.options.data);
    const center = map.getCenter();
    currentProject.mapState = { center: [center.lat, center.lng], zoom: map.getZoom() };
    currentProject.updatedAt = new Date().toISOString();
    saveProjects();
}

function deleteProject(projectId) {
    if (!confirm('確定要刪除這個專案嗎？')) return;
    projects = projects.filter(p => p.id !== projectId);
    saveProjects();
    if (currentProject && currentProject.id === projectId) {
        if (projects.length > 0) selectProject(projects[0].id);
        else createProject('我的第一個活動', '', '');
    }
    updateProjectList();
}

function updateProjectList() {
    const list = document.getElementById('project-list');
    if (projects.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📁</div><div class="empty-state-text">還沒有專案<br>點擊上方按鈕建立第一個</div></div>';
        return;
    }
    list.innerHTML = projects.map(project => `
        <div class="project-item ${currentProject && currentProject.id === project.id ? 'active' : ''}" data-id="${project.id}">
            <div class="project-info">
                <div class="project-name">${escapeHtml(project.name)}</div>
                <div class="project-meta">${project.date ? formatDate(project.date) : '未設定日期'} · ${(project.markers || []).length + (project.routes || []).length + (project.shapes || []).length} 個標記</div>
            </div>
            <div class="project-actions-btns">
                <button class="btn-select" data-id="${project.id}" title="選取">📂</button>
                <button class="btn-delete" data-id="${project.id}" title="刪除">🗑️</button>
            </div>
        </div>
    `).join('');
    
    list.querySelectorAll('.btn-select').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); selectProject(btn.dataset.id); closeProjectDialog(); }));
    list.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); deleteProject(btn.dataset.id); }));
}

// ========================================
// 對話框控制
// ========================================

function openProjectDialog() { updateProjectList(); document.getElementById('dialog-projects').showModal(); }
function closeProjectDialog() { document.getElementById('dialog-projects').close(); }
function openNewProjectDialog() { document.getElementById('new-project-name').value = ''; document.getElementById('new-project-date').value = ''; document.getElementById('new-project-note').value = ''; document.getElementById('dialog-new-project').showModal(); document.getElementById('new-project-name').focus(); }
function closeNewProjectDialog() { document.getElementById('dialog-new-project').close(); }
function confirmNewProject() {
    const name = document.getElementById('new-project-name').value.trim();
    if (!name) { alert('請輸入專案名稱'); return; }
    createProject(name, document.getElementById('new-project-date').value, document.getElementById('new-project-note').value.trim());
    closeNewProjectDialog();
}
function openImportDialog() { document.getElementById('dialog-import').showModal(); }
function closeImportDialog() { document.getElementById('dialog-import').close(); }
function openImportKMLDialog() { document.getElementById('dialog-import-kml').showModal(); }
function closeImportKMLDialog() { document.getElementById('dialog-import-kml').close(); }

// ========================================
// 活動資訊
// ========================================

function openEventInfoDialog() {
    if (!currentProject) return;
    const info = currentProject.eventInfo || {};
    document.getElementById('event-name').value = info.name || currentProject.name || '';
    document.getElementById('event-date').value = info.date || currentProject.date || '';
    document.getElementById('event-time').value = info.time || '';
    document.getElementById('event-address').value = info.address || '';
    document.getElementById('event-organizer').value = info.organizer || '';
    document.getElementById('event-phone').value = info.phone || '';
    document.getElementById('event-email').value = info.email || '';
    document.getElementById('event-url').value = info.url || '';
    document.getElementById('event-description').value = info.description || '';
    document.getElementById('event-transport').value = info.transport || '';
    document.getElementById('dialog-event-info').showModal();
}

function closeEventInfoDialog() { document.getElementById('dialog-event-info').close(); }

function saveEventInfo() {
    if (!currentProject) return;
    currentProject.eventInfo = {
        name: document.getElementById('event-name').value.trim(),
        date: document.getElementById('event-date').value,
        time: document.getElementById('event-time').value.trim(),
        address: document.getElementById('event-address').value.trim(),
        organizer: document.getElementById('event-organizer').value.trim(),
        phone: document.getElementById('event-phone').value.trim(),
        email: document.getElementById('event-email').value.trim(),
        url: document.getElementById('event-url').value.trim(),
        description: document.getElementById('event-description').value.trim(),
        transport: document.getElementById('event-transport').value.trim()
    };
    saveCurrentProject();
    closeEventInfoDialog();
}

// ========================================
// 匯出功能
// ========================================

function exportProject() {
    if (!currentProject) return;
    saveCurrentProject();
    const json = JSON.stringify(currentProject, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importProject(e) {
    const file = e.target.files[0];
    if (!file) return;
    handleImportFile(file);
    closeImportDialog();
}

function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (!data.id || !data.name) throw new Error('無效的專案格式');
            const existingIndex = projects.findIndex(p => p.id === data.id);
            if (existingIndex >= 0) {
                if (confirm('已有同名專案，要覆蓋嗎？')) projects[existingIndex] = data;
                else { data.id = generateId(); data.name += ' (匯入)'; projects.push(data); }
            } else projects.push(data);
            saveProjects(); selectProject(data.id); alert('匯入成功！');
        } catch (err) { alert('匯入失敗：' + err.message); }
    };
    reader.readAsText(file);
}

async function exportScreenshot() {
    if (!currentProject) return;
    showLoading('產生截圖中...');
    try {
        await new Promise(resolve => setTimeout(resolve, 500));
        const canvas = await html2canvas(document.getElementById('map'), { useCORS: true, allowTaint: true, backgroundColor: '#ffffff', scale: 2 });
        const link = document.createElement('a');
        link.download = `${currentProject.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}_地圖.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        hideLoading();
    } catch (err) { hideLoading(); alert('截圖失敗：' + err.message); }
}

async function exportPDF() {
    if (!currentProject) return;
    showLoading('產生 PDF 中...');
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        await new Promise(resolve => setTimeout(resolve, 500));
        const canvas = await html2canvas(document.getElementById('map'), { useCORS: true, allowTaint: true, backgroundColor: '#ffffff', scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 277;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        doc.addImage(imgData, 'PNG', 10, 10, imgWidth, Math.min(imgHeight, 180));
        
        if (currentProject.eventInfo) {
            doc.addPage();
            const info = currentProject.eventInfo;
            let y = 20;
            doc.setFontSize(20); doc.text(info.name || currentProject.name, 20, y); y += 15;
            doc.setFontSize(12);
            if (info.date) { doc.text(`日期：${info.date}`, 20, y); y += 8; }
            if (info.time) { doc.text(`時間：${info.time}`, 20, y); y += 8; }
            if (info.address) { doc.text(`地址：${info.address}`, 20, y); y += 8; }
            if (info.organizer) { doc.text(`主辦單位：${info.organizer}`, 20, y); y += 8; }
            if (info.phone) { doc.text(`聯絡電話：${info.phone}`, 20, y); y += 8; }
            if (info.description) { y += 8; doc.text('活動說明：', 20, y); y += 8; doc.text(doc.splitTextToSize(info.description, 250), 20, y); }
        }
        doc.save(`${currentProject.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.pdf`);
        hideLoading();
    } catch (err) { hideLoading(); alert('PDF 匯出失敗：' + err.message); }
}

function printMap() {
    if (!currentProject) return;
    generatePrintLegend();
    window.print();
}

function generatePrintLegend() {
    const oldLegend = document.querySelector('.print-legend');
    if (oldLegend) oldLegend.remove();
    const allMarkers = Object.values(markers).map(m => m.options.data);
    const allDrawings = Object.values(drawings).filter(d => d.options.data).map(d => d.options.data);
    const allRoutes = Object.values(routes).filter(r => r.options.data).map(r => r.options.data);
    const allShapes = Object.values(shapes).filter(s => s.options.data).map(s => s.options.data);
    
    if (allMarkers.length === 0 && allDrawings.length === 0 && allRoutes.length === 0 && allShapes.length === 0) return;
    
    const legend = document.createElement('div');
    legend.className = 'print-legend';
    let html = `<h2>${escapeHtml(currentProject.name)} - 標記圖例</h2>`;
    
    const destinations = allMarkers.filter(m => m.type === 'destination');
    const parkingSpots = allMarkers.filter(m => m.type === 'parking');
    const roadsideSpots = allMarkers.filter(m => m.type === 'roadside');
    const busSpots = allMarkers.filter(m => m.type === 'bus');
    const taxiSpots = allMarkers.filter(m => m.type === 'taxi');
    const accessibleSpots = allMarkers.filter(m => m.type === 'accessible');
    
    if (destinations.length > 0) html += `<div class="legend-section"><h3>📍 目的地</h3>${destinations.map(m => `<div class="legend-item"><div class="legend-icon destination">📍</div><div class="legend-text"><div class="legend-name">${escapeHtml(m.name)}</div>${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}</div></div>`).join('')}</div>`;
    if (parkingSpots.length > 0) html += `<div class="legend-section"><h3>🅿️ 停車場</h3>${parkingSpots.map(m => `<div class="legend-item"><div class="legend-icon parking">🅿️</div><div class="legend-text"><div class="legend-name">${escapeHtml(m.name)}</div>${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}</div></div>`).join('')}</div>`;
    if (roadsideSpots.length > 0) html += `<div class="legend-section"><h3>🚗 小車</h3>${roadsideSpots.map(m => `<div class="legend-item"><div class="legend-icon roadside">🚗</div><div class="legend-text"><div class="legend-name">${escapeHtml(m.name)}</div>${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}</div></div>`).join('')}</div>`;
    if (busSpots.length > 0) html += `<div class="legend-section"><h3>🚌 遊覽車</h3>${busSpots.map(m => `<div class="legend-item"><div class="legend-icon bus">🚌</div><div class="legend-text"><div class="legend-name">${escapeHtml(m.name)}</div>${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}</div></div>`).join('')}</div>`;
    if (taxiSpots.length > 0) html += `<div class="legend-section"><h3>🚕 計程車</h3>${taxiSpots.map(m => `<div class="legend-item"><div class="legend-icon taxi">🚕</div><div class="legend-text"><div class="legend-name">${escapeHtml(m.name)}</div>${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}</div></div>`).join('')}</div>`;
    if (accessibleSpots.length > 0) html += `<div class="legend-section"><h3>♿ 無障礙</h3>${accessibleSpots.map(m => `<div class="legend-item"><div class="legend-icon accessible">♿</div><div class="legend-text"><div class="legend-name">${escapeHtml(m.name)}</div>${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}</div></div>`).join('')}</div>`;
    if (allRoutes.length > 0) html += `<div class="legend-section"><h3>➡️ 路線</h3>${allRoutes.map(r => `<div class="legend-item"><div class="legend-icon" style="background: ${r.color}">➡️</div><div class="legend-text"><div class="legend-name">${escapeHtml(r.name || '路線')}</div>${r.note ? `<div class="legend-note">${escapeHtml(r.note)}</div>` : ''}</div></div>`).join('')}</div>`;
    
    legend.innerHTML = html;
    document.body.appendChild(legend);
}

// ========================================
// 分享連結
// ========================================

function openShareDialog() {
    if (!currentProject) return;
    const html = generateViewerHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    document.getElementById('share-link').value = url;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    document.getElementById('share-qr').innerHTML = `<img src="${qrUrl}" alt="QR Code" />`;
    document.getElementById('dialog-share').showModal();
}

function closeShareDialog() { document.getElementById('dialog-share').close(); }

function copyShareLink() {
    const linkInput = document.getElementById('share-link');
    linkInput.select();
    document.execCommand('copy');
    alert('已複製連結！');
}

function downloadSharePage() {
    if (!currentProject) return;
    const html = generateViewerHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}_檢視.html`;
    a.click();
    URL.revokeObjectURL(url);
}

function generateViewerHTML() {
    const center = currentProject.mapState.center;
    const zoom = currentProject.mapState.zoom;
    const info = currentProject.eventInfo || {};
    
    let markersJS = '';
    (currentProject.markers || []).forEach(m => {
        markersJS += `L.marker([${m.lat}, ${m.lng}], {icon: L.divIcon({className:'custom-marker-container',html:'<div class="custom-marker" style="background:${m.color}"><span>${getMarkerEmoji(m.type)}</span></div>',iconSize:[32,32],iconAnchor:[16,32],popupAnchor:[0,-32]})}).addTo(map).bindPopup('<div class="marker-popup"><h4>${getMarkerEmoji(m.type)} ${escapeHtml(m.name)}</h4>${m.note ? `<p>${escapeHtml(m.note)}</p>` : ''}</div>');`;
    });
    
    let routesJS = '';
    (currentProject.routes || []).forEach(r => {
        routesJS += `L.polyline(${JSON.stringify(r.points)}, {color:'${r.color}',weight:${r.width},opacity:0.8}).addTo(map);`;
    });
    
    let drawingsJS = '';
    (currentProject.drawings || []).forEach(d => {
        drawingsJS += `L.polygon(${JSON.stringify(d.points)}, {color:'${d.color}',weight:${d.width},opacity:${d.opacity},fillOpacity:${d.opacity*0.5}}).addTo(map);`;
    });
    
    let textsJS = '';
    (currentProject.textMarkers || []).forEach(t => {
        textsJS += `L.marker([${t.lat}, ${t.lng}], {icon: L.divIcon({className:'text-marker-container',html:'<div class="text-marker" style="font-size:${t.fontSize}px;background:${t.bgColor};color:${t.textColor};border-color:${t.textColor}">${escapeHtml(t.content)}</div>',iconSize:null,iconAnchor:[0,0]}),interactive:false}).addTo(map);`;
    });
    
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(info.name || currentProject.name)} - 活動地圖</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
        .header{background:#2c3e50;color:white;padding:16px 20px;text-align:center}
        .header h1{font-size:1.5rem;margin-bottom:4px}
        .header p{font-size:0.9rem;opacity:0.8}
        #map{width:100%;height:60vh}
        .info-card{padding:20px;max-width:800px;margin:0 auto}
        .info-card h2{margin-bottom:16px;font-size:1.3rem}
        .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .info-item{padding:8px 0;border-bottom:1px solid #eee}
        .info-label{font-weight:600;margin-bottom:4px;font-size:0.85rem;color:#666}
        .info-value{font-size:0.95rem}
        .info-full{grid-column:span 2}
        .footer{text-align:center;padding:20px;color:#999;font-size:0.8rem}
        .custom-marker-container{background:transparent;border:none}
        .custom-marker{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.3)}
        .custom-marker span{transform:rotate(45deg);font-size:14px}
        .text-marker{background:white;border:2px solid #333;border-radius:4px;padding:6px 10px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.2);white-space:pre-wrap;max-width:200px;text-align:center}
        .marker-popup h4{margin-bottom:8px}
        .marker-popup p{margin:4px 0;color:#555;font-size:0.9rem}
        @media(max-width:600px){.info-grid{grid-template-columns:1fr}.info-full{grid-column:span 1}}
    </style>
</head>
<body>
    <div class="header">
        <h1>📍 ${escapeHtml(info.name || currentProject.name)}</h1>
        ${info.date ? `<p>活動日期：${formatDate(info.date)}${info.time ? ' ' + info.time : ''}</p>` : ''}
        ${info.organizer ? `<p>${escapeHtml(info.organizer)}</p>` : ''}
    </div>
    <div id="map"></div>
    <div class="info-card">
        <h2>📋 活動資訊</h2>
        <div class="info-grid">
            ${info.address ? `<div class="info-item info-full"><div class="info-label">📍 地址</div><div class="info-value">${escapeHtml(info.address)}</div></div>` : ''}
            ${info.phone ? `<div class="info-item"><div class="info-label">📞 聯絡電話</div><div class="info-value">${escapeHtml(info.phone)}</div></div>` : ''}
            ${info.email ? `<div class="info-item"><div class="info-label">✉️ 聯絡信箱</div><div class="info-value">${escapeHtml(info.email)}</div></div>` : ''}
            ${info.description ? `<div class="info-item info-full"><div class="info-label">📝 活動說明</div><div class="info-value">${escapeHtml(info.description).replace(/\n/g, '<br>')}</div></div>` : ''}
            ${info.transport ? `<div class="info-item info-full"><div class="info-label">🚌 交通資訊</div><div class="info-value">${escapeHtml(info.transport).replace(/\n/g, '<br>')}</div></div>` : ''}
        </div>
    </div>
    <div class="footer">由活動地圖產生器建立 · ${new Date().toLocaleDateString('zh-TW')}</div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        var map=L.map('map').setView([${center[0]},${center[1]}],${zoom});
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map);
        ${markersJS}${routesJS}${drawingsJS}${textsJS}
    </script>
</body>
</html>`;
}

// ========================================
// 匯入 KML/GPX
// ========================================

function importKML(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const content = event.target.result;
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/xml');
            if (doc.querySelector('Placemark') || doc.querySelector('kml')) parseKML(doc);
            else if (doc.querySelector('trk') || doc.querySelector('wpt') || doc.querySelector('rte')) parseGPX(doc);
            else throw new Error('無法識別的檔案格式');
            closeImportKMLDialog();
            alert('匯入成功！');
        } catch (err) { alert('匯入失敗：' + err.message); }
    };
    reader.readAsText(file);
}

function parseKML(doc) {
    doc.querySelectorAll('Placemark').forEach(pm => {
        const name = pm.querySelector('name')?.textContent || '';
        const description = pm.querySelector('description')?.textContent || '';
        const point = pm.querySelector('Point');
        if (point) {
            const coords = point.querySelector('coordinates')?.textContent.trim().split(',');
            if (coords && coords.length >= 2) {
                const lng = parseFloat(coords[0]); const lat = parseFloat(coords[1]);
                if (!isNaN(lat) && !isNaN(lng)) addMarker('destination', lat, lng, { id: generateId(), type: 'destination', lat, lng, name: name || 'KML 標記', note: description, color: '#e74c3c' });
            }
        }
        const lineString = pm.querySelector('LineString');
        if (lineString) {
            const coordsText = lineString.querySelector('coordinates')?.textContent.trim();
            if (coordsText) {
                const points = coordsText.split(/\s+/).map(coord => { const parts = coord.split(','); return [parseFloat(parts[1]), parseFloat(parts[0])]; }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
                if (points.length >= 2) addRouteToMap({ id: generateId(), points, name: name || 'KML 路線', note: description, color: '#e74c3c', width: 4, style: 'solid' });
            }
        }
    });
    saveCurrentProject();
}

function parseGPX(doc) {
    doc.querySelectorAll('wpt').forEach(wpt => {
        const name = wpt.querySelector('name')?.textContent || '';
        const lat = parseFloat(wpt.getAttribute('lat')); const lng = parseFloat(wpt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lng)) addMarker('destination', lat, lng, { id: generateId(), type: 'destination', lat, lng, name: name || 'GPX 航點', note: '', color: '#e74c3c' });
    });
    doc.querySelectorAll('trk').forEach(trk => {
        const name = trk.querySelector('name')?.textContent || '';
        const points = [];
        trk.querySelectorAll('trkpt').forEach(pt => { const lat = parseFloat(pt.getAttribute('lat')); const lng = parseFloat(pt.getAttribute('lon')); if (!isNaN(lat) && !isNaN(lng)) points.push([lat, lng]); });
        if (points.length >= 2) addRouteToMap({ id: generateId(), points, name: name || 'GPX 路徑', note: '', color: '#3498db', width: 4, style: 'solid' });
    });
    saveCurrentProject();
}

// ========================================
// 天氣
// ========================================

function openWeatherDialog() { document.getElementById('dialog-weather').showModal(); refreshWeather(); }
function closeWeatherDialog() { document.getElementById('dialog-weather').close(); }

async function refreshWeather() {
    const display = document.getElementById('weather-display');
    if (!currentProject || !currentProject.eventInfo || !currentProject.eventInfo.address) { display.innerHTML = '<p>請先在「活動資訊」中設定活動地址。</p>'; return; }
    display.innerHTML = '<p>載入天氣資料中...</p>';
    try {
        const address = currentProject.eventInfo.address;
        const geocodeRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1&language=zh`);
        const geocodeData = await geocodeRes.json();
        if (!geocodeData.results || geocodeData.results.length === 0) { display.innerHTML = '<p>找不到該地址的天氣資訊。</p>'; return; }
        const { latitude, longitude } = geocodeData.results[0];
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=Asia%2FTaipei`);
        const weatherData = await weatherRes.json();
        const current = weatherData.current;
        const weatherCodes = { 0: ['☀️', '晴天'], 1: ['🌤️', '大致晴朗'], 2: ['⛅', '多雲'], 3: ['☁️', '陰天'], 45: ['🌫️', '霧'], 51: ['🌦️', '小雨'], 53: ['🌦️', '中雨'], 55: ['🌧️', '大雨'], 61: ['🌧️', '小雨'], 63: ['🌧️', '中雨'], 65: ['🌧️', '大雨'], 80: ['🌦️', '陣雨'], 95: ['⛈️', '雷雨'] };
        const [icon, desc] = weatherCodes[current.weather_code] || ['❓', '未知'];
        display.innerHTML = `
            <div class="weather-icon">${icon}</div>
            <div class="weather-temp">${current.temperature_2m}°C</div>
            <div class="weather-desc">${desc}</div>
            <div class="weather-details">
                <div class="weather-detail"><span>體感溫度</span><span>${current.apparent_temperature}°C</span></div>
                <div class="weather-detail"><span>濕度</span><span>${current.relative_humidity_2m}%</span></div>
                <div class="weather-detail"><span>風速</span><span>${current.wind_speed_10m} km/h</span></div>
            </div>
        `;
    } catch (err) { display.innerHTML = `<p>取得天氣資訊失敗：${err.message}</p>`; }
}

// ========================================
// 教學
// ========================================

function startTutorial() {
    if (typeof introJs === 'undefined') { alert('教學提示套件載入中，請稍後再試。'); return; }
    introJs().setOptions({
        showBullets: true, showProgress: true, exitOnOverlayClick: true,
        steps: [
            { title: '歡迎使用活動地圖產生器', intro: '這是快速建立活動地圖的工具，可以標示目的地、停車場、路線等資訊。' },
            { element: '#tool-select', title: '選擇工具', intro: '使用選擇工具可以拖曳移動標記，或點擊標記進行編輯。' },
            { element: '#tool-destination', title: '標記目的地', intro: '點擊此工具後，在地圖上點擊即可新增目的地標記。' },
            { element: '#tool-route', title: '繪製路線', intro: '點擊此工具後，在地圖上點擊多個點繪製路線，連點兩下或按 ESC 結束。' },
            { element: '#tool-rectangle', title: '繪製矩形', intro: '在地圖上拖曳繪製矩形區域。' },
            { element: '#tool-polygon', title: '繪製多邊形', intro: '點擊多個點繪製不規則多邊形，連點兩下或按 ESC 結束。' },
            { element: '#btn-event-info', title: '活動資訊', intro: '點擊這裡可以編輯活動的詳細資訊。' },
            { element: '#btn-share', title: '分享地圖', intro: '產生唯讀的檢視頁面，參與者可以看到地圖但無法編輯。' },
            { element: '#btn-undo', title: '還原功能', intro: '按 Ctrl+Z 或點擊此按鈕可以還原上一步操作。' },
            { title: '開始使用', intro: '現在就開始建立你的活動地圖吧！' }
        ]
    }).start();
}

// ========================================
// 底圖切換 & 圖層控制
// ========================================

function switchBasemap(e) {
    const value = e.target.value;
    if (basemapLayers[currentBasemap]) map.removeLayer(basemapLayers[currentBasemap]);
    if (basemapLayers[value]) basemapLayers[value].addTo(map);
    currentBasemap = value;
}

function toggleLayer(e) {
    const checkbox = e.target;
    const layerName = checkbox.id.replace('layer-', '');
    const layerMap = { destinations: destinationLayer, parking: parkingLayer, roadside: roadsideLayer, bus: busLayer, taxi: taxiLayer, accessible: accessibleLayer, routes: routeLayer, texts: textLayer, shapes: shapeLayer, drawings: drawingLayer };
    const layer = layerMap[layerName];
    if (layer) { if (checkbox.checked) map.addLayer(layer); else map.removeLayer(layer); }
}

// ========================================
// 地圖鎖定
// ========================================

function toggleMapLock() {
    mapLocked = !mapLocked;
    const btn = document.getElementById('btn-lock-map');
    const icon = btn.querySelector('.tool-icon');
    const label = btn.querySelector('.tool-label');
    
    if (mapLocked) {
        map.dragging.disable();
        icon.textContent = '🔒';
        label.textContent = '解鎖';
        btn.classList.add('locked');
        showToast('地圖已鎖定');
    } else {
        map.dragging.enable();
        icon.textContent = '🔓';
        label.textContent = '鎖定';
        btn.classList.remove('locked');
        showToast('地圖已解鎖');
    }
}

// ========================================
// 鍵盤快捷鍵
// ========================================

function handleKeyboard(e) {
    if (e.key === 'Escape') {
        if (isDrawing) finishDrawing();
        else if (isDrawingRoute) finishRoute();
        else if (isDrawingPolygon) finishPolygon();
        else { deselectMarker(); setTool('select'); }
    }
    
    if (e.key === 'Delete' && selectedMarker) {
        if (markers[selectedMarker]) deleteMarker(selectedMarker);
        else if (drawings[selectedMarker]) deleteSelectedDrawing();
        else if (routes[selectedMarker]) deleteSelectedRoute();
        else if (textMarkers[selectedMarker]) deleteSelectedText();
        else if (shapes[selectedMarker]) deleteSelectedShape();
    }
    
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        else if (e.key === 's') { e.preventDefault(); saveCurrentProject(); }
        else if (e.key === 'e') { e.preventDefault(); exportProject(); }
        else if (e.key === 'p') { e.preventDefault(); printMap(); }
    }
    
    // 工具快捷鍵
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
        switch (e.key.toLowerCase()) {
            case 'v': setTool('select'); break;
            case 'd': setTool('destination'); break;
            case 'p': setTool('parking'); break;
            case 't': setTool('text'); break;
            case 'r': setTool('route'); break;
            case 'b': setTool('draw'); break;
            case 'u': setTool('rectangle'); break;
            case 'g': setTool('polygon'); break;
            case 'l': toggleMapLock(); break;
        }
    }
}

// ========================================
// 輔助函式
// ========================================

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

function getDefaultName(type) {
    const names = { destination: '目的地', parking: '停車場', roadside: '小車', bus: '遊覽車停靠點', taxi: '計程車搭乘處', accessible: '無障礙車位' };
    return names[type] || '標記';
}

function getDefaultColor(type) {
    const colors = { destination: '#e74c3c', parking: '#3498db', roadside: '#f39c12', bus: '#27ae60', taxi: '#f1c40f', accessible: '#3498db' };
    return colors[type] || '#95a5a6';
}

function getMarkerEmoji(type) {
    const emojis = { destination: '📍', parking: '🅿️', roadside: '🚗', bus: '🚌', taxi: '🚕', accessible: '♿' };
    return emojis[type] || '📌';
}

function getLayerByType(type) {
    const layers = { destination: destinationLayer, parking: parkingLayer, roadside: roadsideLayer, bus: busLayer, taxi: taxiLayer, accessible: accessibleLayer };
    return layers[type] || destinationLayer;
}

function clearMap() {
    Object.values(markers).forEach(m => getLayerByType(m.options.data.type).removeLayer(m));
    markers = {};
    Object.values(drawings).forEach(d => drawingLayer.removeLayer(d));
    drawings = {};
    Object.values(routes).forEach(r => { if (r._labelMarker) routeLayer.removeLayer(r._labelMarker); routeLayer.removeLayer(r); });
    routes = {};
    Object.values(textMarkers).forEach(t => textLayer.removeLayer(t));
    textMarkers = {};
    Object.values(shapes).forEach(s => shapeLayer.removeLayer(s));
    shapes = {};
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}

function showLoading(msg = '載入中...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `<div class="loading-spinner"><p>${msg}</p></div>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function exportStaticHTML() {
    if (!currentProject) return;
    saveCurrentProject();
    const html = generateViewerHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
}
