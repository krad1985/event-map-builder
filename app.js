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
 * @property {Object} mapState - 地圖狀態（中心點、縮放）
 * @property {Array<MarkerData>} markers - 標記列表
 * @property {Array<DrawingData>} drawings - 畫筆標記列表
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
let destinationLayer, parkingLayer, roadsideLayer, drawingLayer, routeLayer, textLayer;

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

    // 匯出/匯入
    document.getElementById('btn-export').addEventListener('click', exportProject);
    document.getElementById('btn-import').addEventListener('click', openImportDialog);
    document.getElementById('btn-close-import').addEventListener('click', closeImportDialog);
    document.getElementById('file-import').addEventListener('change', importProject);

    // 列印
    document.getElementById('btn-print').addEventListener('click', printMap);

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
        default: return '標記';
    }
}

function getDefaultColor(type) {
    switch (type) {
        case 'destination': return '#e74c3c';
        case 'parking': return '#3498db';
        case 'roadside': return '#f39c12';
        default: return '#95a5a6';
    }
}

function getMarkerEmoji(type) {
    switch (type) {
        case 'destination': return '📍';
        case 'parking': return '🅿️';
        case 'roadside': return '🚗';
        default: return '📌';
    }
}

function getLayerByType(type) {
    switch (type) {
        case 'destination': return destinationLayer;
        case 'parking': return parkingLayer;
        case 'roadside': return roadsideLayer;
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
