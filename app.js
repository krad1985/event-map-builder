/**
 * 活動地圖產生器 - Event Map Builder
 * 主要應用程式邏輯
 */

// ========================================
// 資料結構
// ========================================

/**
 * 專案資料結構
 * @typedef {Object} Project
 * @property {string} id - 唯一識別碼
 * @property {string} name - 專案名稱
 * @property {string} date - 活動日期
 * @property {string} note - 備註
 * @property {Object} eventInfo - 活動資訊
 * @property {Object} mapState - 地圖狀態（中心點、縮放）
 * @property {Array<MarkerData>} markers - 標記列表
 * @property {Array<DrawingData>} drawings - 畫筆標記列表
 * @property {Array<RouteData>} routes - 路線列表
 * @property {Array<TextData>} textMarkers - 文字方塊列表
 * @property {string} createdAt - 建立時間
 * @property {string} updatedAt - 更新時間
 */

/**
 * 標記資料結構
 * @typedef {Object} MarkerData
 * @property {string} id - 唯一識別碼
 * @property {string} type - 類型（destination/parking/roadside）
 * @property {number} lat - 緯度
 * @property {number} lng - 經度
 * @property {string} name - 名稱
 * @property {string} note - 備註
 * @property {string} color - 顏色
 */

/**
 * 畫筆標記資料結構
 * @typedef {Object} DrawingData
 * @property {string} id - 唯一識別碼
 * @property {Array<Array<number>>} points - 座標點列表 [[lat, lng], ...]
 * @property {string} color - 顏色
 * @property {number} opacity - 透明度
 * @property {number} width - 線寬
 * @property {string} label - 標籤
 */

// ========================================
// 全域變數
// ========================================

let map; // Leaflet 地圖實例
let currentProject = null; // 目前的專案
let projects = []; // 所有專案列表
let markers = {}; // 地圖上的標記實例 { id: L.marker }
let drawings = {}; // 地圖上的畫筆標記 { id: L.polygon }
let routes = {}; // 地圖上的路線 { id: L.polyline }
let textMarkers = {}; // 地圖上的文字方塊 { id: L.marker }
let currentTool = 'select'; // 目前的工具
let selectedMarker = null; // 目前選取的標記
let isDrawing = false; // 畫筆模式中
let currentPath = []; // 目前畫筆的路徑
let pendingTextLatLng = null; // 待新增文字的座標

// 圖層群組
let destinationLayer, parkingLayer, roadsideLayer, busLayer, taxiLayer, accessibleLayer, drawingLayer, routeLayer, textLayer;

// 底圖圖層
let basemapLayers = {};
let currentBasemap = 'osm';

// ========================================
// 初始化
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadProjects();
    bindEvents();
    
    // 如果沒有專案，建立一個預設的
    if (projects.length === 0) {
        createProject('我的第一個活動', '', '');
    } else {
        selectProject(projects[0].id);
    }
});

/**
 * 初始化地圖
 */
function initMap() {
    // 預設位置：台北市中心
    map = L.map('map', {
        center: [25.033, 121.565],
        zoom: 15,
        zoomControl: true
    });

    // 建立底圖圖層
    basemapLayers = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }),
        light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors & © <a href="https://carto.com/">CARTO</a>',
            maxZoom: 19
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© <a href="https://www.esri.com/">Esri</a>',
            maxZoom: 18
        }),
        quiet: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors & © <a href="https://carto.com/">CARTO</a>',
            maxZoom: 19
        })
    };
    
    // 預設使用標準底圖
    basemapLayers.osm.addTo(map);

    // 建立圖層群組
    destinationLayer = L.layerGroup().addTo(map);
    parkingLayer = L.layerGroup().addTo(map);
    roadsideLayer = L.layerGroup().addTo(map);
    busLayer = L.layerGroup().addTo(map);
    taxiLayer = L.layerGroup().addTo(map);
    accessibleLayer = L.layerGroup().addTo(map);
    drawingLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    textLayer = L.layerGroup().addTo(map);

    // 地圖點擊事件
    map.on('click', onMapClick);
    map.on('mousemove', onMapMouseMove);
}

// ========================================
// 事件綁定
// ========================================

function bindEvents() {
    // 工具按鈕
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setTool(btn.dataset.tool);
        });
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

    // 截圖
    document.getElementById('btn-screenshot').addEventListener('click', exportScreenshot);

    // PDF
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

    // 底圖切換
    document.querySelectorAll('input[name="basemap"]').forEach(radio => {
        radio.addEventListener('change', switchBasemap);
    });

    // 圖層控制
    document.getElementById('layer-destinations').addEventListener('change', toggleLayer);
    document.getElementById('layer-parking').addEventListener('change', toggleLayer);
    document.getElementById('layer-roadside').addEventListener('change', toggleLayer);
    document.getElementById('layer-bus').addEventListener('change', toggleLayer);
    document.getElementById('layer-taxi').addEventListener('change', toggleLayer);
    document.getElementById('layer-accessible').addEventListener('change', toggleLayer);
    document.getElementById('layer-routes').addEventListener('change', toggleLayer);
    document.getElementById('layer-texts').addEventListener('change', toggleLayer);
    document.getElementById('layer-drawings').addEventListener('change', toggleLayer);

    // 文字方塊對話框
    document.getElementById('btn-close-text').addEventListener('click', closeTextDialog);
    document.getElementById('btn-cancel-text').addEventListener('click', closeTextDialog);
    document.getElementById('btn-confirm-text').addEventListener('click', confirmTextDialog);

    // 畫筆刪除按鈕
    document.getElementById('btn-delete-drawing').addEventListener('click', deleteSelectedDrawing);

    // 文字刪除按鈕
    document.getElementById('btn-delete-text').addEventListener('click', deleteSelectedText);

    // 路線刪除按鈕
    document.getElementById('btn-delete-route').addEventListener('click', deleteSelectedRoute);

    // 鍵盤快捷鍵
    document.addEventListener('keydown', handleKeyboard);

    // 拖曳匯入
    const importZone = document.querySelector('.import-zone');
    if (importZone) {
        importZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            importZone.classList.add('dragover');
        });
        importZone.addEventListener('dragleave', () => {
            importZone.classList.remove('dragover');
        });
        importZone.addEventListener('drop', (e) => {
            e.preventDefault();
            importZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.json')) {
                handleImportFile(file);
            }
        });
    }
}

// ========================================
// 專案管理
// ========================================

/**
 * 載入所有專案
 */
function loadProjects() {
    const saved = localStorage.getItem('eventMapProjects');
    if (saved) {
        try {
            projects = JSON.parse(saved);
        } catch (e) {
            console.error('載入專案失敗:', e);
            projects = [];
        }
    }
}

/**
 * 儲存所有專案
 */
function saveProjects() {
    localStorage.setItem('eventMapProjects', JSON.stringify(projects));
}

/**
 * 建立新專案
 */
function createProject(name, date, note) {
    const project = {
        id: generateId(),
        name: name,
        date: date,
        note: note,
        eventInfo: {
            name: name,
            date: date,
            time: '',
            address: '',
            organizer: '',
            phone: '',
            email: '',
            url: '',
            description: '',
            transport: ''
        },
        mapState: {
            center: [25.033, 121.565],
            zoom: 15
        },
        markers: [],
        drawings: [],
        routes: [],
        textMarkers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    projects.push(project);
    saveProjects();
    selectProject(project.id);
    updateProjectList();
    
    return project;
}

/**
 * 選取專案
 */
function selectProject(projectId) {
    // 先儲存目前專案
    if (currentProject) {
        saveCurrentProject();
    }

    // 切換到新專案
    currentProject = projects.find(p => p.id === projectId);
    
    if (currentProject) {
        // 清除地圖上的所有標記和畫筆
        clearMap();
        
        // 載入專案的地圖狀態
        if (currentProject.mapState) {
            map.setView(currentProject.mapState.center, currentProject.mapState.zoom);
        }
        
        // 載入標記
        if (currentProject.markers) {
            currentProject.markers.forEach(markerData => {
                addMarkerToMap(markerData);
            });
        }
        
        // 載入畫筆標記
        if (currentProject.drawings) {
            currentProject.drawings.forEach(drawingData => {
                addDrawingToMap(drawingData);
            });
        }
        
        // 載入路線
        if (currentProject.routes) {
            currentProject.routes.forEach(routeData => {
                addRouteToMap(routeData);
            });
        }
        
        // 載入文字方塊
        if (currentProject.textMarkers) {
            currentProject.textMarkers.forEach(textData => {
                addTextToMap(textData);
            });
        }
        
        // 更新專案列表的選取狀態
        updateProjectList();
    }
}

/**
 * 儲存目前專案
 */
function saveCurrentProject() {
    if (!currentProject) return;
    
    // 收集地圖上的所有標記
    currentProject.markers = Object.values(markers).map(marker => {
        const latlng = marker.getLatLng();
        const data = marker.options.data;
        return {
            id: data.id,
            type: data.type,
            lat: latlng.lat,
            lng: latlng.lng,
            name: data.name,
            note: data.note,
            color: data.color
        };
    });
    
    // 收集畫筆標記
    currentProject.drawings = Object.values(drawings).map(drawing => {
        const data = drawing.options.data;
        return {
            id: data.id,
            points: data.points,
            color: data.color,
            opacity: data.opacity,
            width: data.width,
            label: data.label
        };
    });
    
    // 收集路線
    currentProject.routes = Object.values(routes).map(route => {
        const latlngs = route.getLatLngs();
        const data = route.options.data;
        return {
            id: data.id,
            points: latlngs.map(ll => [ll.lat, ll.lng]),
            name: data.name,
            note: data.note,
            color: data.color,
            width: data.width,
            style: data.style
        };
    });
    
    // 收集文字方塊
    currentProject.textMarkers = Object.values(textMarkers).map(text => {
        const latlng = text.getLatLng();
        const data = text.options.data;
        return {
            id: data.id,
            lat: latlng.lat,
            lng: latlng.lng,
            content: data.content,
            fontSize: data.fontSize,
            bgColor: data.bgColor,
            textColor: data.textColor
        };
    });
    
    // 儲存地圖狀態
    const center = map.getCenter();
    currentProject.mapState = {
        center: [center.lat, center.lng],
        zoom: map.getZoom()
    };
    
    currentProject.updatedAt = new Date().toISOString();
    saveProjects();
}

/**
 * 刪除專案
 */
function deleteProject(projectId) {
    if (!confirm('確定要刪除這個專案嗎？')) return;
    
    projects = projects.filter(p => p.id !== projectId);
    saveProjects();
    
    if (currentProject && currentProject.id === projectId) {
        if (projects.length > 0) {
            selectProject(projects[0].id);
        } else {
            createProject('我的第一個活動', '', '');
        }
    }
    
    updateProjectList();
}

/**
 * 更新專案列表 UI
 */
function updateProjectList() {
    const list = document.getElementById('project-list');
    
    if (projects.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📁</div>
                <div class="empty-state-text">還沒有專案<br>點擊上方按鈕建立第一個</div>
            </div>
        `;
        return;
    }
    
    list.innerHTML = projects.map(project => `
        <div class="project-item ${currentProject && currentProject.id === project.id ? 'active' : ''}"
             data-id="${project.id}">
            <div class="project-info">
                <div class="project-name">${escapeHtml(project.name)}</div>
                <div class="project-meta">
                    ${project.date ? formatDate(project.date) : '未設定日期'} · 
                    ${project.markers ? project.markers.length : 0} 個標記
                </div>
            </div>
            <div class="project-actions-btns">
                <button class="btn-select" data-id="${project.id}" title="選取">📂</button>
                <button class="btn-delete" data-id="${project.id}" title="刪除">🗑️</button>
            </div>
        </div>
    `).join('');
    
    // 綁定事件
    list.querySelectorAll('.btn-select').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectProject(btn.dataset.id);
            closeProjectDialog();
        });
    });
    
    list.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProject(btn.dataset.id);
        });
    });
}

// ========================================
// 對話框控制
// ========================================

function openProjectDialog() {
    updateProjectList();
    document.getElementById('dialog-projects').showModal();
}

function closeProjectDialog() {
    document.getElementById('dialog-projects').close();
}

function openNewProjectDialog() {
    document.getElementById('new-project-name').value = '';
    document.getElementById('new-project-date').value = '';
    document.getElementById('new-project-note').value = '';
    document.getElementById('dialog-new-project').showModal();
    document.getElementById('new-project-name').focus();
}

function closeNewProjectDialog() {
    document.getElementById('dialog-new-project').close();
}

function confirmNewProject() {
    const name = document.getElementById('new-project-name').value.trim();
    if (!name) {
        alert('請輸入專案名稱');
        return;
    }
    
    const date = document.getElementById('new-project-date').value;
    const note = document.getElementById('new-project-note').value.trim();
    
    createProject(name, date, note);
    closeNewProjectDialog();
}

function openImportDialog() {
    document.getElementById('dialog-import').showModal();
}

function closeImportDialog() {
    document.getElementById('dialog-import').close();
}

// ========================================
// 工具切換
// ========================================

function setTool(tool) {
    currentTool = tool;
    
    // 更新按鈕狀態
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    
    // 更新 body class
    document.body.classList.toggle('drawing-mode', tool === 'draw' || tool === 'route');
    document.body.classList.toggle('delete-mode', tool === 'delete');
    
    // 結束畫筆模式
    if (tool !== 'draw' && isDrawing) {
        finishDrawing();
    }
    
    // 結束路線模式
    if (tool !== 'route' && isDrawingRoute) {
        finishRoute();
    }
    
    // 清除選取
    if (tool !== 'select') {
        deselectMarker();
    }
}

// ========================================
// 地圖互動
// ========================================

function onMapClick(e) {
    const { lat, lng } = e.latlng;
    
    switch (currentTool) {
        case 'destination':
            addMarker('destination', lat, lng);
            break;
        case 'parking':
            addMarker('parking', lat, lng);
            break;
        case 'roadside':
            addMarker('roadside', lat, lng);
            break;
        case 'bus':
            addMarker('bus', lat, lng);
            break;
        case 'taxi':
            addMarker('taxi', lat, lng);
            break;
        case 'accessible':
            addMarker('accessible', lat, lng);
            break;
        case 'text':
            // 文字模式下開啟對話框
            pendingTextLatLng = [lat, lng];
            openTextDialog();
            break;
        case 'route':
            // 路線模式下新增點
            currentPath.push([lat, lng]);
            isDrawingRoute = true;
            updateRoutePreview();
            break;
        case 'draw':
            // 畫筆模式下點擊新增點
            currentPath.push([lat, lng]);
            updateDrawingPreview();
            break;
        case 'delete':
            // 刪除模式下點擊地圖清除選取
            deselectMarker();
            break;
    }
}

function onMapMouseMove(e) {
    if (isDrawing && currentPath.length > 0) {
        updateDrawingPreview(e.latlng);
    }
    if (isDrawingRoute && currentPath.length > 0) {
        updateRoutePreview(e.latlng);
    }
}

// ========================================
// 標記管理
// ========================================

/**
 * 新增標記
 */
function addMarker(type, lat, lng, data = null) {
    const id = data ? data.id : generateId();
    
    const markerData = data || {
        id: id,
        type: type,
        lat: lat,
        lng: lng,
        name: getDefaultName(type),
        note: '',
        color: getDefaultColor(type)
    };
    
    addMarkerToMap(markerData);
    
    // 自動儲存
    saveCurrentProject();
    
    return markerData;
}

/**
 * 將標記加入地圖
 */
function addMarkerToMap(data) {
    const { id, type, lat, lng, name, note, color } = data;
    
    // 建立自訂圖標
    const icon = L.divIcon({
        className: 'custom-marker-container',
        html: `<div class="custom-marker ${type}" style="background: ${color}"><span>${getMarkerEmoji(type)}</span></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
    });
    
    // 建立標記
    const marker = L.marker([lat, lng], {
        icon: icon,
        draggable: true,
        data: { id, type, name, note, color }
    });
    
    // 綁定 Popup
    marker.bindPopup(createPopupContent(data), {
        maxWidth: 250,
        className: 'marker-popup'
    });
    
    // 綁定事件
    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (currentTool === 'select') {
            selectMarker(id);
        } else if (currentTool === 'delete') {
            deleteMarker(id);
        }
    });
    
    marker.on('dragend', () => {
        saveCurrentProject();
    });
    
    marker.on('popupopen', () => {
        // Popup 內的編輯按鈕
        const editBtn = document.querySelector(`#edit-marker-${id}`);
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                selectMarker(id);
                marker.closePopup();
            });
        }
        
        const deleteBtn = document.querySelector(`#delete-marker-${id}`);
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                deleteMarker(id);
            });
        }
    });
    
    // 加入對應圖層
    const layer = getLayerByType(type);
    marker.addTo(layer);
    
    // 記錄標記
    markers[id] = marker;
    
    return marker;
}

/**
 * 刪除標記
 */
function deleteMarker(id) {
    if (!confirm('確定要刪除這個標記嗎？')) return;
    
    const marker = markers[id];
    if (marker) {
        const type = marker.options.data.type;
        const layer = getLayerByType(type);
        layer.removeLayer(marker);
        delete markers[id];
        
        if (selectedMarker === id) {
            deselectMarker();
        }
        
        saveCurrentProject();
    }
}

/**
 * 選取標記
 */
function selectMarker(id) {
    deselectMarker();
    
    const marker = markers[id];
    if (marker) {
        selectedMarker = id;
        
        // 開啟屬性面板
        openPropertiesPanel(marker.options.data);
        
        // 高亮標記（暫時放大）
        const icon = marker.getElement();
        if (icon) {
            icon.style.transform = 'scale(1.2)';
        }
    }
}

/**
 * 取消選取標記
 */
function deselectMarker() {
    if (selectedMarker) {
        // 檢查是否為一般標記
        const marker = markers[selectedMarker];
        if (marker) {
            const icon = marker.getElement();
            if (icon) {
                icon.style.transform = '';
            }
        }
        
        // 檢查是否為路線
        const route = routes[selectedMarker];
        if (route) {
            route.setStyle({ opacity: 0.8 });
        }
        
        // 檢查是否為文字方塊
        const text = textMarkers[selectedMarker];
        if (text) {
            const icon = text.getElement();
            if (icon) {
                icon.classList.remove('selected');
            }
        }
    }
    
    selectedMarker = null;
    closePropertiesPanel();
}

/**
 * 建立 Popup 內容
 */
function createPopupContent(data) {
    return `
        <div class="marker-popup">
            <h4>${getMarkerEmoji(data.type)} ${escapeHtml(data.name)}</h4>
            ${data.note ? `<p>${escapeHtml(data.note)}</p>` : ''}
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                <button id="edit-marker-${data.id}" class="btn btn-primary" style="flex: 1;">編輯</button>
                <button id="delete-marker-${data.id}" class="btn btn-danger" style="flex: 1;">刪除</button>
            </div>
        </div>
    `;
}

// ========================================
// 屬性面板
// ========================================

function openPropertiesPanel(data) {
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('hidden');
    
    // 隱藏所有 section
    document.querySelectorAll('.props-section').forEach(s => s.classList.add('hidden'));
    
    // 根據類型顯示對應 section
    const section = document.getElementById(`props-${data.type}`);
    if (section) {
        section.classList.remove('hidden');
        
        // 填入現有值
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

function closePropertiesPanel() {
    document.getElementById('properties-panel').classList.add('hidden');
}

function applyProperties() {
    if (!selectedMarker) return;
    
    // 檢查是否為路線
    const route = routes[selectedMarker];
    if (route) {
        const data = route.options.data;
        data.name = document.getElementById('prop-route-name').value.trim();
        data.note = document.getElementById('prop-route-note').value.trim();
        
        // 更新路線標籤
        if (route._labelMarker) {
            routeLayer.removeLayer(route._labelMarker);
        }
        
        if (data.name) {
            const latlngs = route.getLatLngs();
            const midpoint = latlngs[Math.floor(latlngs.length / 2)];
            const label = L.divIcon({
                className: 'route-marker-label',
                html: data.name,
                iconSize: null,
                iconAnchor: [0, 0]
            });
            const labelMarker = L.marker(midpoint, { icon: label, interactive: false });
            labelMarker.addTo(routeLayer);
            route._labelMarker = labelMarker;
        }
        
        saveCurrentProject();
        deselectMarker();
        return;
    }
    
    // 檢查是否為文字方塊
    const text = textMarkers[selectedMarker];
    if (text) {
        const data = text.options.data;
        data.content = document.getElementById('prop-text-content').value.trim() || '文字';
        data.fontSize = parseInt(document.getElementById('prop-text-size').value);
        data.bgColor = document.getElementById('prop-text-bg').value;
        data.textColor = document.getElementById('prop-text-color').value;
        
        // 更新圖標
        const icon = L.divIcon({
            className: 'text-marker-container',
            html: `<div class="text-marker" style="font-size: ${data.fontSize}px; background: ${data.bgColor}; color: ${data.textColor}; border-color: ${data.textColor}">${escapeHtml(data.content)}</div>`,
            iconSize: null,
            iconAnchor: [0, 0]
        });
        text.setIcon(icon);
        
        saveCurrentProject();
        deselectMarker();
        return;
    }
    
    // 否則檢查是否為一般標記
    const marker = markers[selectedMarker];
    if (!marker) return;
    
    const data = marker.options.data;
    
    // 根據類型更新屬性
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
            data.name = document.getElementById('prop-roadside-name').value.trim() || '路邊停車';
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
    
    // 更新圖標
    const icon = L.divIcon({
        className: 'custom-marker-container',
        html: `<div class="custom-marker ${data.type}" style="background: ${data.color}"><span>${getMarkerEmoji(data.type)}</span></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36]
    });
    marker.setIcon(icon);
    
    // 更新 Popup
    marker.setPopupContent(createPopupContent(data));
    
    // 儲存
    saveCurrentProject();
    
    // 關閉面板
    deselectMarker();
}

// ========================================
// 畫筆工具
// ========================================

function updateDrawingPreview(latLng) {
    // 移除舊的預覽
    if (drawings['_preview']) {
        drawingLayer.removeLayer(drawings['_preview']);
    }
    
    if (currentPath.length < 1) return;
    
    const color = document.getElementById('draw-color').value;
    const opacity = parseFloat(document.getElementById('draw-opacity').value);
    const width = parseInt(document.getElementById('draw-width').value);
    
    // 建立預覽路徑
    const points = [...currentPath];
    if (latLng) {
        points.push([latLng.lat, latLng.lng]);
    }
    
    if (points.length >= 2) {
        const preview = L.polygon(points, {
            color: color,
            weight: width,
            opacity: opacity,
            fillOpacity: opacity * 0.5,
            dashArray: '5, 10',
            interactive: false
        });
        
        preview.addTo(drawingLayer);
        drawings['_preview'] = preview;
    }
}

function finishDrawing() {
    // 移除預覽
    if (drawings['_preview']) {
        drawingLayer.removeLayer(drawings['_preview']);
        delete drawings['_preview'];
    }
    
    // 如果路徑點數不足，取消
    if (currentPath.length < 2) {
        currentPath = [];
        isDrawing = false;
        return;
    }
    
    // 建立畫筆標記
    const drawingData = {
        id: generateId(),
        points: [...currentPath],
        color: document.getElementById('draw-color').value,
        opacity: parseFloat(document.getElementById('draw-opacity').value),
        width: parseInt(document.getElementById('draw-width').value),
        label: ''
    };
    
    addDrawingToMap(drawingData);
    
    // 清除路徑
    currentPath = [];
    isDrawing = false;
    
    // 儲存
    saveCurrentProject();
}

/**
 * 將畫筆標記加入地圖
 */
function addDrawingToMap(data) {
    const { id, points, color, opacity, width, label } = data;
    
    const polygon = L.polygon(points, {
        color: color,
        weight: width,
        opacity: opacity,
        fillOpacity: opacity * 0.5,
        data: { id, points, color, opacity, width, label }
    });
    
    polygon.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (currentTool === 'select') {
            selectDrawing(id);
        } else if (currentTool === 'delete') {
            deleteDrawing(id);
        }
    });
    
    polygon.addTo(drawingLayer);
    drawings[id] = polygon;
    
    return polygon;
}

/**
 * 選取畫筆標記
 */
function selectDrawing(id) {
    const drawing = drawings[id];
    if (!drawing) return;
    
    selectedMarker = id;
    
    // 開啟畫筆屬性面板
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('hidden');
    
    document.querySelectorAll('.props-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('props-draw').classList.remove('hidden');
    
    document.getElementById('prop-draw-label').value = drawing.options.data.label || '';
}

/**
 * 刪除選取的畫筆標記
 */
function deleteSelectedDrawing() {
    if (!selectedMarker) return;
    
    const drawing = drawings[selectedMarker];
    if (drawing) {
        if (confirm('確定要刪除這個標記嗎？')) {
            drawingLayer.removeLayer(drawing);
            delete drawings[selectedMarker];
            deselectMarker();
            saveCurrentProject();
        }
    }
}

/**
 * 刪除畫筆標記
 */
function deleteDrawing(id) {
    if (!confirm('確定要刪除這個標記嗎？')) return;
    
    const drawing = drawings[id];
    if (drawing) {
        drawingLayer.removeLayer(drawing);
        delete drawings[id];
        
        if (selectedMarker === id) {
            deselectMarker();
        }
        
        saveCurrentProject();
    }
}

function updateDrawSettings() {
    // 畫筆設定變更時的處理（目前不需要特別做什麼）
}

// ========================================
// 圖層控制
// ========================================

function toggleLayer(e) {
    const checkbox = e.target;
    const layerName = checkbox.id.replace('layer-', '');
    
    let layer;
    switch (layerName) {
        case 'destinations':
            layer = destinationLayer;
            break;
        case 'parking':
            layer = parkingLayer;
            break;
        case 'roadside':
            layer = roadsideLayer;
            break;
        case 'bus':
            layer = busLayer;
            break;
        case 'taxi':
            layer = taxiLayer;
            break;
        case 'accessible':
            layer = accessibleLayer;
            break;
        case 'routes':
            layer = routeLayer;
            break;
        case 'texts':
            layer = textLayer;
            break;
        case 'drawings':
            layer = drawingLayer;
            break;
    }
    
    if (layer) {
        if (checkbox.checked) {
            map.addLayer(layer);
        } else {
            map.removeLayer(layer);
        }
    }
}

// ========================================
// 匯出/匯入
// ========================================

function exportProject() {
    if (!currentProject) return;
    
    // 先儲存
    saveCurrentProject();
    
    // 產生 JSON
    const json = JSON.stringify(currentProject, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // 下載
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
            
            // 驗證資料格式
            if (!data.id || !data.name) {
                throw new Error('無效的專案格式');
            }
            
            // 檢查是否已存在
            const existingIndex = projects.findIndex(p => p.id === data.id);
            if (existingIndex >= 0) {
                if (confirm('已有同名專案，要覆蓋嗎？')) {
                    projects[existingIndex] = data;
                } else {
                    // 建立新的
                    data.id = generateId();
                    data.name += ' (匯入)';
                    projects.push(data);
                }
            } else {
                projects.push(data);
            }
            
            saveProjects();
            selectProject(data.id);
            
            alert('匯入成功！');
        } catch (err) {
            alert('匯入失敗：' + err.message);
        }
    };
    reader.readAsText(file);
}

// ========================================
// 列印
// ========================================

function printMap() {
    if (!currentProject) return;
    
    // 產生列印圖例
    generatePrintLegend();
    
    // 列印
    window.print();
}

function generatePrintLegend() {
    // 移除舊的圖例
    const oldLegend = document.querySelector('.print-legend');
    if (oldLegend) {
        oldLegend.remove();
    }
    
    // 收集所有標記
    const allMarkers = Object.values(markers).map(m => m.options.data);
    const allDrawings = Object.values(drawings)
        .filter(d => d.options.data)
        .map(d => d.options.data);
    
    if (allMarkers.length === 0 && allDrawings.length === 0) return;
    
    // 建立圖例
    const legend = document.createElement('div');
    legend.className = 'print-legend';
    
    let html = `<h2>${escapeHtml(currentProject.name)} - 標記圖例</h2>`;
    
    // 目的地
    const destinations = allMarkers.filter(m => m.type === 'destination');
    if (destinations.length > 0) {
        html += `<div class="legend-section">
            <h3>📍 目的地</h3>
            ${destinations.map(m => `
                <div class="legend-item">
                    <div class="legend-icon destination">${getMarkerEmoji('destination')}</div>
                    <div class="legend-text">
                        <div class="legend-name">${escapeHtml(m.name)}</div>
                        ${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>`;
    }
    
    // 停車場
    const parkingSpots = allMarkers.filter(m => m.type === 'parking');
    if (parkingSpots.length > 0) {
        html += `<div class="legend-section">
            <h3>🅿️ 停車場</h3>
            ${parkingSpots.map(m => `
                <div class="legend-item">
                    <div class="legend-icon parking">${getMarkerEmoji('parking')}</div>
                    <div class="legend-text">
                        <div class="legend-name">${escapeHtml(m.name)}</div>
                        ${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>`;
    }
    
    // 路邊停車
    const roadsideSpots = allMarkers.filter(m => m.type === 'roadside');
    if (roadsideSpots.length > 0) {
        html += `<div class="legend-section">
            <h3>🚗 路邊停車</h3>
            ${roadsideSpots.map(m => `
                <div class="legend-item">
                    <div class="legend-icon roadside">${getMarkerEmoji('roadside')}</div>
                    <div class="legend-text">
                        <div class="legend-name">${escapeHtml(m.name)}</div>
                        ${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>`;
    }
    
    // 畫筆標記
    const drawingMarks = allDrawings.filter(d => d.label);
    if (drawingMarks.length > 0) {
        html += `<div class="legend-section">
            <h3>✏️ 畫筆標記</h3>
            ${drawingMarks.map(d => `
                <div class="legend-item">
                    <div class="legend-icon" style="background: ${d.color}">✏️</div>
                    <div class="legend-text">
                        <div class="legend-name">${escapeHtml(d.label)}</div>
                    </div>
                </div>
            `).join('')}
        </div>`;
    }
    
    legend.innerHTML = html;
    document.body.appendChild(legend);
}

// ========================================
// 匯出靜態 HTML
// ========================================

function exportStaticHTML() {
    if (!currentProject) return;
    
    // 先儲存
    saveCurrentProject();
    
    // 產生 HTML
    const html = generateStaticHTML();
    
    // 下載
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
}

function generateStaticHTML() {
    const center = currentProject.mapState.center;
    const zoom = currentProject.mapState.zoom;
    
    // 收集所有標記
    const allMarkers = currentProject.markers || [];
    const allDrawings = currentProject.drawings || [];
    
    // 產生標記的 JS 代碼
    let markersJS = '';
    allMarkers.forEach(m => {
        markersJS += `
            L.marker([${m.lat}, ${m.lng}], {
                icon: L.divIcon({
                    className: 'custom-marker-container',
                    html: '<div class="custom-marker ${m.type}" style="background: ${m.color}"><span>${getMarkerEmoji(m.type)}</span></div>',
                    iconSize: [36, 36],
                    iconAnchor: [18, 36],
                    popupAnchor: [0, -36]
                })
            }).addTo(map).bindPopup('<div class="marker-popup"><h4>${getMarkerEmoji(m.type)} ${escapeHtml(m.name)}</h4>${m.note ? `<p>${escapeHtml(m.note)}</p>` : ''}</div>');
        `;
    });
    
    // 產生畫筆的 JS 代碼
    let drawingsJS = '';
    allDrawings.forEach(d => {
        drawingsJS += `
            L.polygon(${JSON.stringify(d.points)}, {
                color: '${d.color}',
                weight: ${d.width},
                opacity: ${d.opacity},
                fillOpacity: ${d.opacity * 0.5}
            }).addTo(map);
        `;
    });
    
    // 產生標記列表 HTML
    let legendHTML = '';
    
    const destinations = allMarkers.filter(m => m.type === 'destination');
    const parkingSpots = allMarkers.filter(m => m.type === 'parking');
    const roadsideSpots = allMarkers.filter(m => m.type === 'roadside');
    
    if (destinations.length > 0) {
        legendHTML += `
            <div class="legend-section">
                <h3>📍 目的地</h3>
                ${destinations.map(m => `
                    <div class="legend-item">
                        <div class="legend-icon destination">${getMarkerEmoji('destination')}</div>
                        <div class="legend-text">
                            <div class="legend-name">${escapeHtml(m.name)}</div>
                            ${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    if (parkingSpots.length > 0) {
        legendHTML += `
            <div class="legend-section">
                <h3>🅿️ 停車場</h3>
                ${parkingSpots.map(m => `
                    <div class="legend-item">
                        <div class="legend-icon parking">${getMarkerEmoji('parking')}</div>
                        <div class="legend-text">
                            <div class="legend-name">${escapeHtml(m.name)}</div>
                            ${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    if (roadsideSpots.length > 0) {
        legendHTML += `
            <div class="legend-section">
                <h3>🚗 路邊停車</h3>
                ${roadsideSpots.map(m => `
                    <div class="legend-item">
                        <div class="legend-icon roadside">${getMarkerEmoji('roadside')}</div>
                        <div class="legend-text">
                            <div class="legend-name">${escapeHtml(m.name)}</div>
                            ${m.note ? `<div class="legend-note">${escapeHtml(m.note)}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    const drawingMarks = allDrawings.filter(d => d.label);
    if (drawingMarks.length > 0) {
        legendHTML += `
            <div class="legend-section">
                <h3>✏️ 標記區域</h3>
                ${drawingMarks.map(d => `
                    <div class="legend-item">
                        <div class="legend-icon" style="background: ${d.color}">✏️</div>
                        <div class="legend-text">
                            <div class="legend-name">${escapeHtml(d.label)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(currentProject.name)} - 活動地圖</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        
        .header {
            background: #2c3e50;
            color: white;
            padding: 16px 20px;
            text-align: center;
        }
        .header h1 { font-size: 1.5rem; margin-bottom: 4px; }
        .header p { font-size: 0.9rem; opacity: 0.8; }
        
        #map { width: 100%; height: 60vh; }
        
        .legend {
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }
        .legend h2 { margin-bottom: 20px; font-size: 1.3rem; }
        .legend-section { margin-bottom: 24px; }
        .legend-section h3 { margin-bottom: 12px; font-size: 1.1rem; color: #2c3e50; }
        .legend-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px solid #eee;
        }
        .legend-icon {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: white;
            flex-shrink: 0;
        }
        .legend-icon.destination { background: #e74c3c; }
        .legend-icon.parking { background: #3498db; }
        .legend-icon.roadside { background: #f39c12; }
        .legend-text { flex: 1; }
        .legend-name { font-weight: 600; margin-bottom: 2px; }
        .legend-note { font-size: 0.85rem; color: #666; }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #999;
            font-size: 0.8rem;
        }
        
        /* 自訂標記 */
        .custom-marker-container { background: transparent; border: none; }
        .custom-marker {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .custom-marker span {
            transform: rotate(45deg);
            font-size: 16px;
        }
        .marker-popup h4 { margin-bottom: 8px; }
        .marker-popup p { margin: 4px 0; color: #555; font-size: 0.9rem; }
        
        @media print {
            #map { height: 70vh; page-break-after: always; }
            .legend { page-break-before: always; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📍 ${escapeHtml(currentProject.name)}</h1>
        ${currentProject.date ? `<p>活動日期：${formatDate(currentProject.date)}</p>` : ''}
        ${currentProject.note ? `<p>${escapeHtml(currentProject.note)}</p>` : ''}
    </div>
    
    <div id="map"></div>
    
    <div class="legend">
        <h2>📋 標記圖例</h2>
        ${legendHTML}
    </div>
    
    <div class="footer">
        由活動地圖產生器建立 · ${new Date().toLocaleDateString('zh-TW')}
    </div>
    
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        var map = L.map('map').setView([${center[0]}, ${center[1]}], ${zoom});
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);
        
        ${markersJS}
        ${drawingsJS}
    </script>
</body>
</html>`;
}

// ========================================
// 輔助函式
// ========================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function getDefaultName(type) {
    switch (type) {
        case 'destination': return '目的地';
        case 'parking': return '停車場';
        case 'roadside': return '路邊停車';
        case 'bus': return '遊覽車停靠點';
        case 'taxi': return '計程車搭乘處';
        case 'accessible': return '無障礙車位';
        default: return '標記';
    }
}

function getDefaultColor(type) {
    switch (type) {
        case 'destination': return '#e74c3c';
        case 'parking': return '#3498db';
        case 'roadside': return '#f39c12';
        case 'bus': return '#27ae60';
        case 'taxi': return '#f1c40f';
        case 'accessible': return '#3498db';
        default: return '#95a5a6';
    }
}

function getMarkerEmoji(type) {
    switch (type) {
        case 'destination': return '📍';
        case 'parking': return '🅿️';
        case 'roadside': return '🚗';
        case 'bus': return '🚌';
        case 'taxi': return '🚕';
        case 'accessible': return '♿';
        default: return '📌';
    }
}

function getLayerByType(type) {
    switch (type) {
        case 'destination': return destinationLayer;
        case 'parking': return parkingLayer;
        case 'roadside': return roadsideLayer;
        case 'bus': return busLayer;
        case 'taxi': return taxiLayer;
        case 'accessible': return accessibleLayer;
        default: return destinationLayer;
    }
}

// ========================================
// 底圖切換
// ========================================

function switchBasemap(e) {
    const value = e.target.value;
    
    // 移除目前的底圖
    if (basemapLayers[currentBasemap]) {
        map.removeLayer(basemapLayers[currentBasemap]);
    }
    
    // 加入新的底圖
    if (basemapLayers[value]) {
        basemapLayers[value].addTo(map);
    }
    
    currentBasemap = value;
}

// ========================================
// 路線工具
// ========================================

let isDrawingRoute = false;
let routePreview = null;

function updateRouteSettings() {
    // 路線設定變更時的處理
}

function updateRoutePreview(latLng) {
    // 移除舊的預覽
    if (routePreview) {
        routeLayer.removeLayer(routePreview);
        routePreview = null;
    }
    
    if (currentPath.length < 1) return;
    
    const color = document.getElementById('route-color').value;
    const width = parseInt(document.getElementById('route-width').value);
    const style = document.getElementById('route-style').value;
    
    // 建立預覽路徑
    const points = [...currentPath];
    if (latLng) {
        points.push([latLng.lat, latLng.lng]);
    }
    
    if (points.length >= 2) {
        const options = {
            color: color,
            weight: width,
            opacity: 0.7
        };
        
        // 根據樣式設定
        if (style === 'dashed') {
            options.dashArray = '10, 10';
        } else if (style === 'arrow') {
            options.dashArray = '15, 10';
            options.arrowHead = true;
        }
        
        routePreview = L.polyline(points, options);
        routePreview.addTo(routeLayer);
    }
}

function finishRoute() {
    // 移除預覽
    if (routePreview) {
        routeLayer.removeLayer(routePreview);
        routePreview = null;
    }
    
    // 如果路徑點數不足，取消
    if (currentPath.length < 2) {
        currentPath = [];
        isDrawingRoute = false;
        return;
    }
    
    // 建立路線資料
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
    
    // 清除路徑
    currentPath = [];
    isDrawingRoute = false;
    
    // 儲存
    saveCurrentProject();
}

/**
 * 將路線加入地圖
 */
function addRouteToMap(data) {
    const { id, points, name, note, color, width, style } = data;
    
    const options = {
        color: color,
        weight: width,
        opacity: 0.8,
        data: { id, name, note, color, width, style }
    };
    
    // 根據樣式設定
    if (style === 'dashed') {
        options.dashArray = '10, 10';
    } else if (style === 'arrow') {
        options.dashArray = '15, 10';
    }
    
    const polyline = L.polyline(points, options);
    
    polyline.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (currentTool === 'select') {
            selectRoute(id);
        } else if (currentTool === 'delete') {
            deleteRoute(id);
        }
    });
    
    // 如果有名稱，加入標籤
    if (name) {
        const midpoint = points[Math.floor(points.length / 2)];
        const label = L.divIcon({
            className: 'route-marker-label',
            html: name,
            iconSize: null,
            iconAnchor: [0, 0]
        });
        const labelMarker = L.marker(midpoint, { icon: label, interactive: false });
        labelMarker.addTo(routeLayer);
        polyline._labelMarker = labelMarker;
    }
    
    polyline.addTo(routeLayer);
    routes[id] = polyline;
    
    return polyline;
}

/**
 * 選取路線
 */
function selectRoute(id) {
    const route = routes[id];
    if (!route) return;
    
    selectedMarker = id;
    
    // 開啟路線屬性面板
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('hidden');
    
    document.querySelectorAll('.props-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('props-route').classList.remove('hidden');
    
    const data = route.options.data;
    document.getElementById('prop-route-name').value = data.name || '';
    document.getElementById('prop-route-note').value = data.note || '';
    
    // 高亮路線
    route.setStyle({ opacity: 1 });
}

/**
 * 刪除路線
 */
function deleteRoute(id) {
    if (!confirm('確定要刪除這條路線嗎？')) return;
    
    const route = routes[id];
    if (route) {
        // 移除標籤
        if (route._labelMarker) {
            routeLayer.removeLayer(route._labelMarker);
        }
        routeLayer.removeLayer(route);
        delete routes[id];
        
        if (selectedMarker === id) {
            deselectMarker();
        }
        
        saveCurrentProject();
    }
}

/**
 * 刪除選取的路線
 */
function deleteSelectedRoute() {
    if (!selectedMarker) return;
    
    const route = routes[selectedMarker];
    if (route) {
        deleteRoute(selectedMarker);
    }
}

// ========================================
// 文字方塊工具
// ========================================

function openTextDialog() {
    document.getElementById('input-text-content').value = '';
    document.getElementById('dialog-text').showModal();
    document.getElementById('input-text-content').focus();
}

function closeTextDialog() {
    document.getElementById('dialog-text').close();
    pendingTextLatLng = null;
}

function confirmTextDialog() {
    const content = document.getElementById('input-text-content').value.trim();
    if (!content) {
        alert('請輸入文字內容');
        return;
    }
    
    if (pendingTextLatLng) {
        const textData = {
            id: generateId(),
            lat: pendingTextLatLng[0],
            lng: pendingTextLatLng[1],
            content: content,
            fontSize: 16,
            bgColor: '#ffffff',
            textColor: '#333333'
        };
        
        addTextToMap(textData);
        saveCurrentProject();
    }
    
    closeTextDialog();
}

/**
 * 將文字方塊加入地圖
 */
function addTextToMap(data) {
    const { id, lat, lng, content, fontSize, bgColor, textColor } = data;
    
    const icon = L.divIcon({
        className: 'text-marker-container',
        html: `<div class="text-marker" style="font-size: ${fontSize}px; background: ${bgColor}; color: ${textColor}; border-color: ${textColor}">${escapeHtml(content)}</div>`,
        iconSize: null,
        iconAnchor: [0, 0]
    });
    
    const marker = L.marker([lat, lng], {
        icon: icon,
        draggable: true,
        data: { id, content, fontSize, bgColor, textColor }
    });
    
    marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (currentTool === 'select') {
            selectText(id);
        } else if (currentTool === 'delete') {
            deleteText(id);
        }
    });
    
    marker.on('dragend', () => {
        saveCurrentProject();
    });
    
    marker.addTo(textLayer);
    textMarkers[id] = marker;
    
    return marker;
}

/**
 * 選取文字方塊
 */
function selectText(id) {
    const text = textMarkers[id];
    if (!text) return;
    
    selectedMarker = id;
    
    // 開啟文字屬性面板
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('hidden');
    
    document.querySelectorAll('.props-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('props-text').classList.remove('hidden');
    
    const data = text.options.data;
    document.getElementById('prop-text-content').value = data.content || '';
    document.getElementById('prop-text-size').value = data.fontSize || 16;
    document.getElementById('prop-text-bg').value = data.bgColor || '#ffffff';
    document.getElementById('prop-text-color').value = data.textColor || '#333333';
    
    // 高亮文字方塊
    const icon = text.getElement();
    if (icon) {
        icon.classList.add('selected');
    }
}

/**
 * 刪除文字方塊
 */
function deleteText(id) {
    if (!confirm('確定要刪除這個文字嗎？')) return;
    
    const text = textMarkers[id];
    if (text) {
        textLayer.removeLayer(text);
        delete textMarkers[id];
        
        if (selectedMarker === id) {
            deselectMarker();
        }
        
        saveCurrentProject();
    }
}

/**
 * 刪除選取的文字方塊
 */
function deleteSelectedText() {
    if (!selectedMarker) return;
    
    const text = textMarkers[selectedMarker];
    if (text) {
        deleteText(selectedMarker);
    }
}

function clearMap() {
    // 清除所有標記
    Object.values(markers).forEach(marker => {
        const type = marker.options.data.type;
        const layer = getLayerByType(type);
        layer.removeLayer(marker);
    });
    markers = {};
    
    // 清除所有畫筆
    Object.values(drawings).forEach(drawing => {
        drawingLayer.removeLayer(drawing);
    });
    drawings = {};
    
    // 清除所有路線
    Object.values(routes).forEach(route => {
        if (route._labelMarker) {
            routeLayer.removeLayer(route._labelMarker);
        }
        routeLayer.removeLayer(route);
    });
    routes = {};
    
    // 清除所有文字方塊
    Object.values(textMarkers).forEach(text => {
        textLayer.removeLayer(text);
    });
    textMarkers = {};
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-TW', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

function handleKeyboard(e) {
    // ESC 取消選取
    if (e.key === 'Escape') {
        if (currentTool === 'draw' && isDrawing) {
            finishDrawing();
        } else if (currentTool === 'route' && isDrawingRoute) {
            finishRoute();
        } else {
            deselectMarker();
            setTool('select');
        }
    }
    
    // Delete 鍵刪除選取的標記
    if (e.key === 'Delete' && selectedMarker) {
        const marker = markers[selectedMarker];
        const drawing = drawings[selectedMarker];
        const route = routes[selectedMarker];
        const text = textMarkers[selectedMarker];
        
        if (marker) {
            deleteMarker(selectedMarker);
        } else if (drawing) {
            deleteSelectedDrawing();
        } else if (route) {
            deleteSelectedRoute();
        } else if (text) {
            deleteSelectedText();
        }
    }
    
    // 快捷鍵
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 's':
                e.preventDefault();
                saveCurrentProject();
                break;
            case 'e':
                e.preventDefault();
                exportProject();
                break;
            case 'p':
                e.preventDefault();
                printMap();
                break;
        }
    }
}

// ========================================
// 活動資訊管理
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

function closeEventInfoDialog() {
    document.getElementById('dialog-event-info').close();
}

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
    
    // 如果有地址，更新活動資訊卡片標記
    updateEventInfoCard();
}

function updateEventInfoCard() {
    if (!currentProject || !currentProject.eventInfo) return;
    
    // 可以在地圖上顯示活動資訊卡片（可選功能）
    // 這裡我們先不做，專注在其他功能
}

// ========================================
// 匯出截圖
// ========================================

async function exportScreenshot() {
    if (!currentProject) return;
    
    showLoading('產生截圖中...');
    
    try {
        // 等待地圖載入完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const mapContainer = document.getElementById('map');
        const canvas = await html2canvas(mapContainer, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            scale: 2
        });
        
        // 下載圖片
        const link = document.createElement('a');
        link.download = `${currentProject.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}_地圖.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        hideLoading();
    } catch (err) {
        hideLoading();
        alert('截圖失敗：' + err.message);
    }
}

// ========================================
// 匯出 PDF
// ========================================

async function exportPDF() {
    if (!currentProject) return;
    
    showLoading('產生 PDF 中...');
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // 橫向
        
        // 等待地圖載入完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const mapContainer = document.getElementById('map');
        const canvas = await html2canvas(mapContainer, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            scale: 2
        });
        
        // 加入地圖圖片
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 277; // A4 寬度減邊距
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        doc.addImage(imgData, 'PNG', 10, 10, imgWidth, Math.min(imgHeight, 180));
        
        // 加入活動資訊頁面
        if (currentProject.eventInfo) {
            doc.addPage();
            const info = currentProject.eventInfo;
            let y = 20;
            
            doc.setFontSize(20);
            doc.text(info.name || currentProject.name, 20, y);
            y += 15;
            
            doc.setFontSize(12);
            if (info.date) {
                doc.text(`日期：${info.date}`, 20, y);
                y += 8;
            }
            if (info.time) {
                doc.text(`時間：${info.time}`, 20, y);
                y += 8;
            }
            if (info.address) {
                doc.text(`地址：${info.address}`, 20, y);
                y += 8;
            }
            if (info.organizer) {
                doc.text(`主辦單位：${info.organizer}`, 20, y);
                y += 8;
            }
            if (info.phone) {
                doc.text(`聯絡電話：${info.phone}`, 20, y);
                y += 8;
            }
            if (info.email) {
                doc.text(`聯絡信箱：${info.email}`, 20, y);
                y += 8;
            }
            if (info.description) {
                y += 8;
                doc.text('活動說明：', 20, y);
                y += 8;
                const lines = doc.splitTextToSize(info.description, 250);
                doc.text(lines, 20, y);
                y += lines.length * 6;
            }
            if (info.transport) {
                y += 8;
                doc.text('交通資訊：', 20, y);
                y += 8;
                const lines = doc.splitTextToSize(info.transport, 250);
                doc.text(lines, 20, y);
            }
        }
        
        // 下載 PDF
        doc.save(`${currentProject.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.pdf`);
        
        hideLoading();
    } catch (err) {
        hideLoading();
        alert('PDF 匯出失敗：' + err.message);
    }
}

// ========================================
// 分享連結
// ========================================

function openShareDialog() {
    if (!currentProject) return;
    
    // 產生唯讀頁面的 HTML
    const html = generateViewerHTML();
    
    // 建立 Blob URL
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // 顯示連結
    document.getElementById('share-link').value = url;
    
    // 產生 QR Code（使用免費 API）
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    document.getElementById('share-qr').innerHTML = `<img src="${qrUrl}" alt="QR Code" />`;
    
    document.getElementById('dialog-share').showModal();
}

function closeShareDialog() {
    document.getElementById('dialog-share').close();
}

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
    
    // 產生標記的 JS 代碼
    let markersJS = '';
    const allMarkers = currentProject.markers || [];
    allMarkers.forEach(m => {
        markersJS += `
            L.marker([${m.lat}, ${m.lng}], {
                icon: L.divIcon({
                    className: 'custom-marker-container',
                    html: '<div class="custom-marker ${m.type}" style="background: ${m.color}"><span>${getMarkerEmoji(m.type)}</span></div>',
                    iconSize: [36, 36],
                    iconAnchor: [18, 36],
                    popupAnchor: [0, -36]
                })
            }).addTo(map).bindPopup('<div class="marker-popup"><h4>${getMarkerEmoji(m.type)} ${escapeHtml(m.name)}</h4>${m.note ? `<p>${escapeHtml(m.note)}</p>` : ''}</div>');
        `;
    });
    
    // 產生路線的 JS 代碼
    let routesJS = '';
    const allRoutes = currentProject.routes || [];
    allRoutes.forEach(r => {
        routesJS += `
            L.polyline(${JSON.stringify(r.points)}, {
                color: '${r.color}',
                weight: ${r.width},
                opacity: 0.8
            }).addTo(map);
        `;
    });
    
    // 產生畫筆的 JS 代碼
    let drawingsJS = '';
    const allDrawings = currentProject.drawings || [];
    allDrawings.forEach(d => {
        drawingsJS += `
            L.polygon(${JSON.stringify(d.points)}, {
                color: '${d.color}',
                weight: ${d.width},
                opacity: ${d.opacity},
                fillOpacity: ${d.opacity * 0.5}
            }).addTo(map);
        `;
    });
    
    // 產生文字方塊的 JS 代碼
    let textsJS = '';
    const allTexts = currentProject.textMarkers || [];
    allTexts.forEach(t => {
        textsJS += `
            L.marker([${t.lat}, ${t.lng}], {
                icon: L.divIcon({
                    className: 'text-marker-container',
                    html: '<div class="text-marker" style="font-size: ${t.fontSize}px; background: ${t.bgColor}; color: ${t.textColor}; border-color: ${t.textColor}">${escapeHtml(t.content)}</div>',
                    iconSize: null,
                    iconAnchor: [0, 0]
                }),
                interactive: false
            }).addTo(map);
        `;
    });
    
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(info.name || currentProject.name)} - 活動地圖</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        
        .header {
            background: #2c3e50;
            color: white;
            padding: 16px 20px;
            text-align: center;
        }
        .header h1 { font-size: 1.5rem; margin-bottom: 4px; }
        .header p { font-size: 0.9rem; opacity: 0.8; }
        
        #map { width: 100%; height: 60vh; }
        
        .info-card {
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }
        .info-card h2 { margin-bottom: 16px; font-size: 1.3rem; }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        .info-item { padding: 8px 0; border-bottom: 1px solid #eee; }
        .info-label { font-weight: 600; margin-bottom: 4px; font-size: 0.85rem; color: #666; }
        .info-value { font-size: 0.95rem; }
        .info-full { grid-column: span 2; }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #999;
            font-size: 0.8rem;
        }
        
        .custom-marker-container { background: transparent; border: none; }
        .custom-marker {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .custom-marker span {
            transform: rotate(45deg);
            font-size: 16px;
        }
        .text-marker {
            background: white;
            border: 2px solid #333;
            border-radius: 4px;
            padding: 6px 10px;
            font-weight: 500;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            white-space: pre-wrap;
            max-width: 200px;
            text-align: center;
        }
        .marker-popup h4 { margin-bottom: 8px; }
        .marker-popup p { margin: 4px 0; color: #555; font-size: 0.9rem; }
        
        @media (max-width: 600px) {
            .info-grid { grid-template-columns: 1fr; }
            .info-full { grid-column: span 1; }
        }
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
            ${info.url ? `<div class="info-item info-full"><div class="info-label">🌐 活動網址</div><div class="info-value"><a href="${escapeHtml(info.url)}" target="_blank">${escapeHtml(info.url)}</a></div></div>` : ''}
            ${info.description ? `<div class="info-item info-full"><div class="info-label">📝 活動說明</div><div class="info-value">${escapeHtml(info.description).replace(/\n/g, '<br>')}</div></div>` : ''}
            ${info.transport ? `<div class="info-item info-full"><div class="info-label">🚌 交通資訊</div><div class="info-value">${escapeHtml(info.transport).replace(/\n/g, '<br>')}</div></div>` : ''}
        </div>
    </div>
    
    <div class="footer">
        由活動地圖產生器建立 · ${new Date().toLocaleDateString('zh-TW')}
    </div>
    
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        var map = L.map('map').setView([${center[0]}, ${center[1]}], ${zoom});
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);
        
        ${markersJS}
        ${routesJS}
        ${drawingsJS}
        ${textsJS}
    </script>
</body>
</html>`;
}

// ========================================
// 匯入 KML/GPX
// ========================================

function openImportKMLDialog() {
    document.getElementById('dialog-import-kml').showModal();
}

function closeImportKMLDialog() {
    document.getElementById('dialog-import-kml').close();
}

function importKML(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const content = event.target.result;
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/xml');
            
            // 檢查是否為 KML 或 GPX
            if (doc.querySelector('Placemark') || doc.querySelector('kml')) {
                parseKML(doc);
            } else if (doc.querySelector('trk') || doc.querySelector('wpt') || doc.querySelector('rte')) {
                parseGPX(doc);
            } else {
                throw new Error('無法識別的檔案格式');
            }
            
            closeImportKMLDialog();
            alert('匯入成功！');
        } catch (err) {
            alert('匯入失敗：' + err.message);
        }
    };
    reader.readAsText(file);
}

function parseKML(doc) {
    // 解析 KML 標記
    const placemarks = doc.querySelectorAll('Placemark');
    placemarks.forEach(pm => {
        const name = pm.querySelector('name')?.textContent || '';
        const description = pm.querySelector('description')?.textContent || '';
        
        // 解析點
        const point = pm.querySelector('Point');
        if (point) {
            const coords = point.querySelector('coordinates')?.textContent.trim().split(',');
            if (coords && coords.length >= 2) {
                const lng = parseFloat(coords[0]);
                const lat = parseFloat(coords[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    addMarker('destination', lat, lng, {
                        id: generateId(),
                        type: 'destination',
                        lat: lat,
                        lng: lng,
                        name: name || 'KML 標記',
                        note: description,
                        color: '#e74c3c'
                    });
                }
            }
        }
        
        // 解析線
        const lineString = pm.querySelector('LineString');
        if (lineString) {
            const coordsText = lineString.querySelector('coordinates')?.textContent.trim();
            if (coordsText) {
                const points = coordsText.split(/\s+/).map(coord => {
                    const parts = coord.split(',');
                    return [parseFloat(parts[1]), parseFloat(parts[0])];
                }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
                
                if (points.length >= 2) {
                    addRouteToMap({
                        id: generateId(),
                        points: points,
                        name: name || 'KML 路線',
                        note: description,
                        color: '#e74c3c',
                        width: 4,
                        style: 'solid'
                    });
                }
            }
        }
    });
    
    saveCurrentProject();
}

function parseGPX(doc) {
    // 解析 GPX 航點
    const waypoints = doc.querySelectorAll('wpt');
    waypoints.forEach(wpt => {
        const name = wpt.querySelector('name')?.textContent || '';
        const lat = parseFloat(wpt.getAttribute('lat'));
        const lng = parseFloat(wpt.getAttribute('lon'));
        
        if (!isNaN(lat) && !isNaN(lng)) {
            addMarker('destination', lat, lng, {
                id: generateId(),
                type: 'destination',
                lat: lat,
                lng: lng,
                name: name || 'GPX 航點',
                note: '',
                color: '#e74c3c'
            });
        }
    });
    
    // 解析 GPX 路徑
    const tracks = doc.querySelectorAll('trk');
    tracks.forEach(trk => {
        const name = trk.querySelector('name')?.textContent || '';
        const points = [];
        
        trk.querySelectorAll('trkpt').forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lng = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lng)) {
                points.push([lat, lng]);
            }
        });
        
        if (points.length >= 2) {
            addRouteToMap({
                id: generateId(),
                points: points,
                name: name || 'GPX 路徑',
                note: '',
                color: '#3498db',
                width: 4,
                style: 'solid'
            });
        }
    });
    
    // 解析 GPX 路線
    const routes = doc.querySelectorAll('rte');
    routes.forEach(rte => {
        const name = rte.querySelector('name')?.textContent || '';
        const points = [];
        
        rte.querySelectorAll('rtept').forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lng = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lng)) {
                points.push([lat, lng]);
            }
        });
        
        if (points.length >= 2) {
            addRouteToMap({
                id: generateId(),
                points: points,
                name: name || 'GPX 路線',
                note: '',
                color: '#27ae60',
                width: 4,
                style: 'solid'
            });
        }
    });
    
    saveCurrentProject();
}

// ========================================
// 天氣圖層
// ========================================

function openWeatherDialog() {
    document.getElementById('dialog-weather').showModal();
    refreshWeather();
}

function closeWeatherDialog() {
    document.getElementById('dialog-weather').close();
}

async function refreshWeather() {
    const display = document.getElementById('weather-display');
    
    if (!currentProject || !currentProject.eventInfo || !currentProject.eventInfo.address) {
        display.innerHTML = '<p>請先在「活動資訊」中設定活動地址。</p>';
        return;
    }
    
    display.innerHTML = '<p>載入天氣資料中...</p>';
    
    // 使用免費天氣 API（Open-Meteo，無需 API key）
    // 先用地理編碼取得座標
    try {
        const address = currentProject.eventInfo.address;
        const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1&language=zh`;
        const geocodeRes = await fetch(geocodeUrl);
        const geocodeData = await geocodeRes.json();
        
        if (!geocodeData.results || geocodeData.results.length === 0) {
            display.innerHTML = '<p>找不到該地址的天氣資訊。</p>';
            return;
        }
        
        const { latitude, longitude } = geocodeData.results[0];
        
        // 取得天氣
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FTaipei`;
        const weatherRes = await fetch(weatherUrl);
        const weatherData = await weatherRes.json();
        
        const current = weatherData.current;
        const daily = weatherData.daily;
        
        // 天氣代碼對應
        const weatherCodes = {
            0: ['☀️', '晴天'],
            1: ['🌤️', '大致晴朗'],
            2: ['⛅', '多雲'],
            3: ['☁️', '陰天'],
            45: ['🌫️', '霧'],
            48: ['🌫️', '霧凇'],
            51: ['🌦️', '小雨'],
            53: ['🌦️', '中雨'],
            55: ['🌧️', '大雨'],
            61: ['🌧️', '小雨'],
            63: ['🌧️', '中雨'],
            65: ['🌧️', '大雨'],
            71: ['❄️', '小雪'],
            73: ['❄️', '中雪'],
            75: ['❄️', '大雪'],
            80: ['🌦️', '陣雨'],
            81: ['🌧️', '中陣雨'],
            82: ['⛈️', '大陣雨'],
            95: ['⛈️', '雷雨'],
            96: ['⛈️', '雷陣雨']
        };
        
        const [icon, desc] = weatherCodes[current.weather_code] || ['❓', '未知'];
        
        let html = `
            <div class="weather-icon">${icon}</div>
            <div class="weather-temp">${current.temperature_2m}°C</div>
            <div class="weather-desc">${desc}</div>
            <div class="weather-details">
                <div class="weather-detail">
                    <span>體感溫度</span>
                    <span>${current.apparent_temperature}°C</span>
                </div>
                <div class="weather-detail">
                    <span>濕度</span>
                    <span>${current.relative_humidity_2m}%</span>
                </div>
                <div class="weather-detail">
                    <span>風速</span>
                    <span>${current.wind_speed_10m} km/h</span>
                </div>
            </div>
        `;
        
        // 如果有每日預報
        if (daily && daily.time) {
            html += '<div style="margin-top: 16px; text-align: left;"><strong>未來幾天：</strong></div>';
            daily.time.slice(0, 5).forEach((date, i) => {
                const [dayIcon] = weatherCodes[daily.weather_code[i]] || ['❓'];
                html += `<div style="font-size: 0.85rem; padding: 4px 0; border-bottom: 1px solid #eee;">
                    ${date}: ${dayIcon} ${daily.temperature_2m_min[i]}°C ~ ${daily.temperature_2m_max[i]}°C
                </div>`;
            });
        }
        
        display.innerHTML = html;
    } catch (err) {
        display.innerHTML = `<p>取得天氣資訊失敗：${err.message}</p>`;
    }
}

// ========================================
// 教學提示
// ========================================

function startTutorial() {
    if (typeof introJs === 'undefined') {
        alert('教學提示套件載入中，請稍後再試。');
        return;
    }
    
    introJs().setOptions({
        showBullets: true,
        showProgress: true,
        exitOnOverlayClick: true,
        steps: [
            {
                title: '歡迎使用活動地圖產生器',
                intro: '這是一個快速建立活動地圖的工具，可以標示目的地、停車場、路線等資訊。'
            },
            {
                element: '#tool-select',
                title: '選擇工具',
                intro: '使用選擇工具可以拖曳移動標記，或點擊標記進行編輯。'
            },
            {
                element: '#tool-destination',
                title: '標記目的地',
                intro: '點擊此工具後，在地圖上點擊即可新增目的地標記。'
            },
            {
                element: '#tool-route',
                title: '繪製路線',
                intro: '點擊此工具後，在地圖上點擊多個點即可繪製行進路線。'
            },
            {
                element: '#tool-text',
                title: '新增文字方塊',
                intro: '點擊此工具後，在地圖上點擊即可新增文字註解。'
            },
            {
                element: '#btn-event-info',
                title: '活動資訊',
                intro: '點擊這裡可以編輯活動的詳細資訊，如時間、地址、聯絡方式等。'
            },
            {
                element: '#btn-share',
                title: '分享地圖',
                intro: '產生唯讀的檢視頁面，參與者可以看到地圖但無法編輯。'
            },
            {
                element: '#btn-screenshot',
                title: '匯出截圖',
                intro: '將目前的地圖截圖存成圖片檔案。'
            },
            {
                element: '#btn-export-pdf',
                title: '匯出 PDF',
                intro: '將地圖和活動資訊匯出成 PDF 檔案。'
            },
            {
                title: '開始使用',
                intro: '現在就開始建立你的活動地圖吧！有任何問題都可以點擊「❓ 教學」按鈕。'
            }
        ]
    }).start();
}

// ========================================
// 輔助函式
// ========================================

function showLoading(message = '載入中...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `<div class="loading-spinner"><p>${message}</p></div>`;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}
