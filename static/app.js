// State
const state = {
    currentTab: 'complexes',
    currentComplex: null,
    currentComplexData: null,
    currentComplexStats: null,
    currentPropertyType: 'квартиры',
    currentApartment: null,
    currentApartmentData: null,
    currentDefect: null,
    categories: [],
    currentItemId: null,
    accessFilter: '',
    loading: false,
    currentDefects: [] // Store defects for category filtering
};

// DOM Elements cache
const elements = {};

// Init
document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    loadCategories();
    loadComplexes();
    setupForms();
    setupEventListeners();
    document.body.classList.add('page-home');
});

// Cache DOM elements
function cacheElements() {
    elements.toast = document.getElementById('toast');
    elements.backBtn = document.getElementById('backBtn');
    elements.addComplexBtn = document.getElementById('addComplexBtn');
    elements.editComplexBtn = document.getElementById('editComplexBtn');
    elements.deleteComplexBtn = document.getElementById('deleteComplexBtn');
    elements.adminBtn = document.getElementById('adminBtn');
    elements.pageTitle = document.getElementById('pageTitle');
    elements.pageSubtitle = document.getElementById('pageSubtitle');
    elements.complexesList = document.getElementById('complexesList');
    elements.totalComplexes = document.getElementById('totalComplexes');
    elements.apartmentsContainer = document.getElementById('apartmentsContainer');
    elements.defectsList = document.getElementById('defectsList');
    elements.statsPanel = document.getElementById('statsPanel');
    elements.statAvailable = document.getElementById('statAvailable');
    elements.statAccepted = document.getElementById('statAccepted');
    elements.statCall = document.getElementById('statCall');
    elements.statNoAccess = document.getElementById('statNoAccess');
    elements.statDefects = document.getElementById('statDefects');
    elements.defectFilterPanel = document.getElementById('defectFilterPanel');
    elements.tabPanels = document.querySelectorAll('.tab-panel');
}

// Setup Forms
function setupForms() {
    const createForm = document.getElementById('createComplexForm');
    if (createForm) createForm.addEventListener('submit', handleCreateComplex);
    
    const defectForm = document.getElementById('addDefectForm');
    if (defectForm) defectForm.addEventListener('submit', handleAddDefect);
    
    const fileInput = document.getElementById('defectPhotos');
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    
    const uploadZone = document.getElementById('fileUploadArea');
    if (uploadZone && fileInput) {
        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            fileInput.files = e.dataTransfer.files;
            handleFileSelect({ target: fileInput });
        });
    }
    
    const categorySelect = document.getElementById('defectCategory');
    if (categorySelect) categorySelect.addEventListener('change', handleCategoryChange);
    
    const commentInput = document.getElementById('commentInput');
    if (commentInput) commentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitComment();
    });
}

// Event Listeners
function setupEventListeners() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });
}

// Navigation with animations
function showTab(tab) {
    const activePanel = document.querySelector('.tab-panel.active');
    const newPanel = document.getElementById(`tab-${tab}`);
    
    if (!newPanel) return;
    
    if (activePanel) {
        activePanel.classList.remove('active');
    }
    newPanel.classList.add('active');
    
    state.currentTab = tab;
    
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        if (tab === 'complexes') {
            pageTitle.style.cursor = 'pointer';
            pageTitle.onclick = checkPassword;
        } else {
            pageTitle.style.cursor = 'default';
            pageTitle.onclick = null;
        }
    }
    
    const titleSecondary = document.getElementById('titleSecondary');
    
    if (tab === 'complexes') {
        document.body.classList.add('page-home');
        updateHeader(false, true);
        if (adminMode) {
            if (elements.editComplexBtn) elements.editComplexBtn.style.display = 'inline-flex';
            if (elements.deleteComplexBtn) elements.deleteComplexBtn.style.display = 'inline-flex';
        }
        setPageTitle('Перспектива', '');
        // Hide section filter on main page
        const sectionFilterWrapper = document.getElementById('sectionFilterWrapper');
        if (sectionFilterWrapper) sectionFilterWrapper.style.display = 'none';
        // Show инжиниринг only on main page
        if (titleSecondary) titleSecondary.style.display = 'block';
    } else {
        document.body.classList.remove('page-home');
        // Hide инжиниринг on other pages
        if (titleSecondary) titleSecondary.style.display = 'none';
    }
}

function setPageTitle(title, subtitle) {
    const jkName = document.getElementById('jkName');
    if (jkName) {
        jkName.textContent = title || 'Перспектива';
        // Если это квартира/апартамент - добавляем клик для возврата в ЖК
        if (state.currentApartment) {
            jkName.onclick = function() { backToComplex(); };
            jkName.style.cursor = 'pointer';
        } else if (state.currentComplex) {
            // Если открыт ЖК - клик возвращает на главную
            jkName.onclick = function() { window.location.href = '/'; };
            jkName.style.cursor = 'pointer';
        } else {
            // На главной странице - показываем пароль
            jkName.onclick = function() { checkPassword(); };
            jkName.style.cursor = 'pointer';
        }
    }
    if (elements.pageSubtitle) elements.pageSubtitle.textContent = subtitle || '';
}

function backToComplex() {
    state.currentApartment = null;
    state.currentApartmentData = null;
    
    // Show filters, hide status buttons
    const toolbarSearch = document.getElementById('toolbarSearch');
    const headerFilters = document.getElementById('headerFilters');
    const toolbarFilters = document.getElementById('toolbarFilters');
    const toolbarStatus = document.getElementById('toolbarStatus');
    if (toolbarSearch) toolbarSearch.style.display = 'flex';
    if (headerFilters) headerFilters.style.display = 'flex';
    if (toolbarFilters) toolbarFilters.style.display = 'flex';
    if (toolbarStatus) toolbarStatus.style.display = 'none';
    
    // Restore complex title in header
    if (state.currentComplexData) {
        const complex = state.currentComplexData;
        setPageTitle(complex.name, '');
    }
    
    showTab('complex-detail');
    loadApartments();
}

function backToApartment() {
    if (state.currentApartment) showApartmentDetail(state.currentApartment);
}

function goBack() {
    if (state.currentApartment) {
        backToComplex();
    } else if (state.currentComplex) {
        state.currentComplex = null;
        state.currentComplexData = null;
        state.currentComplexStats = null;
        showTab('complexes');
        loadComplexes();
        setPageTitle('Портфель объектов', '');
        const toolbarSearch = document.getElementById('toolbarSearch');
        const headerFilters = document.getElementById('headerFilters');
        const toolbarFilters = document.getElementById('toolbarFilters');
        if (toolbarSearch) toolbarSearch.style.display = 'none';
        if (headerFilters) headerFilters.style.display = 'none';
        if (toolbarFilters) toolbarFilters.style.display = 'none';
    }
}

function toggleSidebar(show) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (show === false) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    } else {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    }
}

function updateHeader(showBack, showAdd) {
    if (elements.backBtn) elements.backBtn.style.display = showBack ? 'inline-flex' : 'none';
    if (elements.addComplexBtn) {
        elements.addComplexBtn.style.display = showAdd ? 'inline-flex' : 'none';
    }
    if (elements.editComplexBtn) elements.editComplexBtn.style.display = 'none';
    if (elements.deleteComplexBtn) elements.deleteComplexBtn.style.display = 'none';
}

let adminMode = false;

function toggleAdminMode() {
    if (adminMode) {
        adminMode = false;
        if (elements.editComplexBtn) elements.editComplexBtn.style.display = 'none';
        if (elements.deleteComplexBtn) elements.deleteComplexBtn.style.display = 'none';
        if (elements.adminBtn) elements.adminBtn.classList.remove('btn-primary');
        showToast('Режим админа выключен', 'info');
    } else {
        const password = prompt('Введите пароль:');
        if (password === '123') {
            adminMode = true;
            if (state.currentTab === 'complexes') {
                if (elements.editComplexBtn) elements.editComplexBtn.style.display = 'inline-flex';
                if (elements.deleteComplexBtn) elements.deleteComplexBtn.style.display = 'inline-flex';
            }
            if (elements.adminBtn) elements.adminBtn.classList.add('btn-primary');
            showToast('Режим админа включен', 'success');
        } else if (password !== null) {
            showToast('Неверный пароль', 'error');
        }
    }
}

function showEditComplexForm() {
    const name = elements.pageTitle?.textContent;
    const newName = prompt('Введите новое название ЖК:', name);
    if (!newName || newName.trim() === name) return;
    
    const formData = new FormData();
    formData.append('name', newName.trim());
    
    fetch(`/api/complexes/${state.currentComplex}`, {
        method: 'PUT',
        body: formData
    }).then(res => {
        if (res.ok) {
            showToast('ЖК обновлен', 'success');
            loadComplexes();
            showComplexDetail(state.currentComplex);
        } else {
            showToast('Ошибка обновления', 'error');
        }
    }).catch(() => showToast('Ошибка обновления', 'error'));
}

function deleteCurrentComplex() {
    if (!confirm('Удалить ЖК и все связанные данные?')) return;
    
    fetch(`/api/complexes/${state.currentComplex}`, {
        method: 'DELETE'
    }).then(res => {
        if (res.ok) {
            showToast('ЖК удален', 'success');
            state.currentComplex = null;
            showTab('complexes');
            loadComplexes();
        } else {
            showToast('Ошибка удаления', 'error');
        }
    }).catch(() => showToast('Ошибка удаления', 'error'));
}

// Categories
async function loadCategories() {
    try {
        const res = await fetch('/api/categories');
        const data = await res.json();
        state.categories = data.categories;
        
        const select = document.getElementById('defectCategory');
        if (select) {
            select.innerHTML = '<option value="">Выберите</option>';
            state.categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                select.appendChild(opt);
            });
        }
        
        const catFilter = document.getElementById('defectCategoryFilter');
        if (catFilter) {
            catFilter.innerHTML = '<option value="">Все категории</option>';
            state.categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                catFilter.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Error loading categories:', err);
    }
}

function handleCategoryChange() {
    const cat = document.getElementById('defectCategory')?.value;
    const windowGroup = document.getElementById('windowGroup');
    if (windowGroup) windowGroup.style.display = cat === 'Окна' ? 'block' : 'none';
    if (cat) loadTemplates(cat);
    else {
        const templatesGroup = document.getElementById('templatesGroup');
        if (templatesGroup) templatesGroup.style.display = 'none';
    }
}

async function loadTemplates(category) {
    try {
        const res = await fetch(`/api/templates/${encodeURIComponent(category)}`);
        const data = await res.json();
        const group = document.getElementById('templatesGroup');
        const list = document.getElementById('templatesList');
        if (data.templates?.length && group && list) {
            group.style.display = 'block';
            list.innerHTML = data.templates.map(t => 
                `<span class="template-chip" onclick="toggleTemplate(this, '${escapeHtml(t)}')">${escapeHtml(t)}</span>`
            ).join('');
        } else if (group) {
            group.style.display = 'none';
        }
    } catch (err) {
        console.error('Error loading templates:', err);
    }
}

function toggleTemplate(el, text) {
    el.classList.toggle('selected');
    const ta = document.getElementById('defectDescription');
    if (!ta) return;
    
    if (el.classList.contains('selected')) {
        ta.value += (ta.value ? '\n' : '') + text + '\n';
    } else {
        ta.value = ta.value.split('\n').filter(l => l.trim() !== text).join('\n');
    }
}

// Loading states
function showLoading(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Загрузка...</p>
        </div>
    `;
}

function hideLoading(container) {
    if (!container) return;
    container.innerHTML = '';
}

// Complexes with new card design
async function loadComplexes() {
    const container = elements.complexesList;
    if (!container) return;
    
    showLoading(container);
    
    try {
        const res = await fetch('/api/complexes');
        const complexes = await res.json();
        console.log('Complexes loaded:', complexes.length);
        
        if (!complexes.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">[Building]</div>
                    <h3>Нет жилых комплексов</h3>
                    <p>Создайте первый комплекс, чтобы начать работу</p>
                </div>
            `;
            if (elements.totalComplexes) elements.totalComplexes.textContent = '0';
            return;
        }
        
        container.innerHTML = complexes.map(c => {
            const stats = {};
            (c.by_access_status || []).forEach(s => stats[s.access_status] = s.count);
            
            const totalApts = c.apartments_count || 0;
            const defectCount = stats.defects || c.defects_count || 0;
            const propType = c.property_type || 'квартиры';
            return `
                <div class="complex-card" onclick="showComplexDetail(${c.id})">
                    <div class="complex-card-name">${escapeHtml(c.name)}</div>
                    <div class="complex-card-info">г. Москва, ул. Дубровская, д. 1</div>
                </div>
            `;
        }).join('');
        
        if (elements.totalComplexes) elements.totalComplexes.textContent = complexes.length;
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">[!]</div>
                <h3>Ошибка загрузки</h3>
                <p>Попробуйте обновить страницу</p>
                <button class="btn btn-primary" onclick="loadComplexes()">Обновить</button>
            </div>
        `;
    }
}

function onTitleClick() {
    // Если открыт ЖК - возвращаемся на главную
    if (state.currentComplex) {
        window.location.href = '/';
    } else {
        // На главной - показываем пароль для создания ЖК
        checkPassword();
    }
}

function checkPassword() {
    const pwd = prompt('Введите пароль:');
    if (pwd === '124') {
        showCreateComplexForm();
    } else if (pwd !== null) {
        showToast('Неверный пароль');
    }
}

function showCreateComplexForm() {
    showTab('create-complex');
    const container = document.getElementById('buildingsContainer');
    if (container) {
        container.innerHTML = '';
        addBuildingRow();
    }
}

function addBuildingRow() {
    const container = document.getElementById('buildingsContainer');
    if (!container) return;
    
    const buildingId = Date.now();
    const row = document.createElement('div');
    row.className = 'building-row';
    row.dataset.buildingId = buildingId;
    row.innerHTML = `
        <div class="building-header">
            <input type="number" placeholder="№ корпуса" class="building-num" min="1">
            <button type="button" class="btn-remove-row" onclick="this.parentElement.parentElement.remove()">× Удалить корпус</button>
        </div>
        <div class="sections-container">
            <button type="button" class="btn-link" onclick="addSectionRow(${buildingId})">+ Добавить секцию</button>
        </div>
    `;
    container.appendChild(row);
    addSectionRow(buildingId);
}

function addSectionRow(buildingId) {
    const buildingRow = document.querySelector(`[data-building-id="${buildingId}"]`);
    if (!buildingRow) return;
    
    const sectionsContainer = buildingRow.querySelector('.sections-container');
    if (!sectionsContainer) return;
    
    const sectionId = Date.now();
    const sectionRow = document.createElement('div');
    sectionRow.className = 'section-row';
    sectionRow.dataset.sectionId = sectionId;
    sectionRow.innerHTML = `
        <div class="section-header">
            <span>Секция</span>
            <button type="button" class="btn-remove-row" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="section-row-grid">
            <input type="number" placeholder="№ секции" class="sec-num" min="1">
        </div>
        <div class="floors-container" id="floors-${sectionId}">
            <button type="button" class="btn-link" onclick="addFloorRow(${sectionId})">+ Добавить этаж</button>
        </div>
    `;
    sectionsContainer.appendChild(sectionRow);
    addFloorRow(sectionId);
}

function addFloorRow(sectionId) {
    const floorsContainer = document.getElementById(`floors-${sectionId}`);
    if (!floorsContainer) return;
    
    const floorRow = document.createElement('div');
    floorRow.className = 'floor-row-input';
    floorRow.innerHTML = `
        <input type="number" placeholder="Этаж" class="floor-num" min="1">
        <input type="number" placeholder="Квартира с" class="floor-from" min="1">
        <input type="number" placeholder="по" class="floor-to" min="1">
        <button type="button" class="btn-remove-row" onclick="this.parentElement.remove()">×</button>
    `;
    floorsContainer.appendChild(floorRow);
}

async function submitComplexForm() {
    const nameInput = document.getElementById('complexName');
    const name = nameInput?.value.trim();
    const typeInput = document.getElementById('complexType');
    const propertyType = typeInput?.value || 'квартиры';
    
    if (!name) {
        showToast('Введите название ЖК', 'warning');
        return;
    }
    
    const buildings = [];
    document.querySelectorAll('.building-row').forEach(buildingRow => {
        const buildingNum = buildingRow.querySelector('.building-num')?.value;
        
        if (!buildingNum) return;
        
        const sections = [];
        buildingRow.querySelectorAll('.section-row').forEach(row => {
            const secNum = row.querySelector('.sec-num')?.value;
            
            if (!secNum) return;
            
            const floors = [];
            row.querySelectorAll('.floor-row-input').forEach(floorRow => {
                const floorNum = floorRow.querySelector('.floor-num')?.value;
                const floorFrom = floorRow.querySelector('.floor-from')?.value;
                const floorTo = floorRow.querySelector('.floor-to')?.value;
                
                if (floorNum && floorFrom && floorTo) {
                    floors.push({
                        floor: parseInt(floorNum),
                        apartment_from: parseInt(floorFrom),
                        apartment_to: parseInt(floorTo)
                    });
                }
            });
            
            if (floors.length > 0) {
                sections.push({
                    section_number: parseInt(secNum),
                    floors: floors,
                    building_number: parseInt(buildingNum)
                });
            }
        });
        
        if (sections.length > 0) {
            buildings.push({
                building_number: parseInt(buildingNum),
                sections: sections
            });
        }
    });
    
    if (buildings.length === 0) {
        showToast('Добавьте хотя бы один корпус с секциями', 'warning');
        return;
    }
    
    const commissioningDate = document.getElementById('commissioningDate')?.value || '';
    const warranty3Date = document.getElementById('warranty3Date')?.value || '';
    const warranty5Date = document.getElementById('warranty5Date')?.value || '';
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('property_type', propertyType);
    formData.append('commissioning_date', commissioningDate);
    formData.append('warranty_3_date', warranty3Date);
    formData.append('warranty_5_date', warranty5Date);
    formData.append('buildings', JSON.stringify(buildings));
    
    console.log('Creating complex:', { name, propertyType, buildings });
    
    try {
        const res = await fetch('/api/complexes', {
            method: 'POST',
            body: formData
        });
        
        console.log('Response status:', res.status);
        
        if (res.ok) {
            const data = await res.json();
            console.log('Success:', data);
            const propName = propertyType === 'апартаменты' ? 'апартаментов' : 'квартир';
            showToast(`ЖК создан: ${data.apartments_created} ${propName}`, 'success');
            nameInput.value = '';
            const buildingsContainer = document.getElementById('buildingsContainer');
            if (buildingsContainer) buildingsContainer.innerHTML = '';
            showTab('complexes');
            loadComplexes();
        } else {
            const errorText = await res.text();
            console.error('Error response:', errorText);
            showToast('Ошибка: ' + errorText, 'error');
        }
    } catch (err) {
        console.error('Fetch error:', err);
        showToast('Ошибка: ' + err.message, 'error');
    }
}

// Complex Detail
async function showComplexDetail(id) {
    console.log('=== showComplexDetail START ===', id);
    state.currentComplex = id;
    state.currentPropertyType = 'квартиры';
    updateHeader(true, false);
    setPageTitle('Загрузка...', '');
    
    if (elements.editComplexBtn) elements.editComplexBtn.style.display = 'none';
    if (elements.deleteComplexBtn) elements.deleteComplexBtn.style.display = 'none';
    
    try {
        const complexRes = await fetch(`/api/complexes/${id}`);
        const statsRes = await fetch(`/api/complexes/${id}/statistics`);
        
        if (!complexRes.ok) throw new Error('Complex fetch failed: ' + complexRes.status);
        if (!statsRes.ok) throw new Error('Stats fetch failed: ' + statsRes.status);
        
        const complex = await complexRes.json();
        const stats = await statsRes.json();
        
        console.log('Data loaded:', complex.name, stats);
        
        // Save property type
        state.currentPropertyType = complex.property_type || 'квартиры';
        
        // Update placeholders based on property type
        updatePlaceholders();
        
        const propName = state.currentPropertyType === 'апартаменты' ? 'апартаментов' : 'квартир';
        const uniqueBuildings = new Set(complex.sections.map(s => s.building_number || 1));
        const buildingsCount = uniqueBuildings.size;
        
        let buildingSubtitle = '';
        if (buildingsCount > 1) {
            const buildingSections = {};
            complex.sections.forEach(s => {
                const b = s.building_number || 1;
                if (!buildingSections[b]) buildingSections[b] = [];
                buildingSections[b].push(s.section_number);
            });
            buildingSubtitle = Object.entries(buildingSections)
                .sort((a, b) => a[0] - b[0])
                .map(([b, secs]) => `${b} корпус (секция ${secs.join(', ')})`)
                .join(' • ');
        }
        
        setPageTitle(complex.name, '');
        
        // Hide инжиниринг on complex detail page
        const titleSecondary = document.getElementById('titleSecondary');
        if (titleSecondary) titleSecondary.style.display = 'none';
        
        // Show toolbar with search and filters
        const toolbarSearch = document.getElementById('toolbarSearch');
        const headerFilters = document.getElementById('headerFilters');
        const toolbarFilters = document.getElementById('toolbarFilters');
        const toolbarStatus = document.getElementById('toolbarStatus');
        if (toolbarSearch) toolbarSearch.style.display = 'flex';
        if (headerFilters) headerFilters.style.display = 'flex';
        if (toolbarFilters) toolbarFilters.style.display = 'flex';
        if (toolbarStatus) toolbarStatus.style.display = 'none';
        
        // Determine if we have multiple buildings or sections
        const hasMultipleBuildings = uniqueBuildings.size > 1;
        const hasMultipleSections = complex.sections.length > 1;
        
        // Show/hide filter dropdown
        const sectionFilterWrapper = document.getElementById('sectionFilterWrapper');
        const filterOptions = document.getElementById('filterOptions');
        
        if ((hasMultipleBuildings || hasMultipleSections) && sectionFilterWrapper) {
            sectionFilterWrapper.style.display = 'inline-block';
            
            if (filterOptions) {
                // Simple list of sections with building in parentheses
                const sectionsHtml = complex.sections
                    .sort((a, b) => {
                        if (a.building_number !== b.building_number) {
                            return a.building_number - b.building_number;
                        }
                        return a.section_number - b.section_number;
                    })
                    .map(s => {
                        return `
                            <div class="filter-item" data-section="${s.id}" onclick="toggleSectionFilter(${s.id})">
                                <span>Секция ${s.section_number}</span>
                            </div>
                        `;
                    }).join('');
                
                filterOptions.innerHTML = sectionsHtml;
                
                document.getElementById('filterBtnText').textContent = 'Все секции';
            }
        } else if (sectionFilterWrapper) {
            sectionFilterWrapper.style.display = 'none';
        }
        
        state.currentComplexData = complex;
        state.currentComplexStats = stats;
        
        console.log('Calling showTab complex-detail');
        showTab('complex-detail');
        console.log('showTab done');
        
        console.log('Calling loadApartments');
        loadApartments();
        console.log('loadApartments called');
    } catch (err) {
        console.error('Error in showComplexDetail:', err);
        showToast('Ошибка загрузки', 'error');
    }
}

function parseApartmentNumbers(input) {
    if (!input.trim()) return null;
    
    const numbers = new Set();
    const parts = input.split(',');
    
    parts.forEach(part => {
        part = part.trim();
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end)) {
                const min = Math.min(start, end);
                const max = Math.max(start, end);
                for (let i = min; i <= max; i++) {
                    numbers.add(i);
                }
            }
        } else {
            const num = parseInt(part);
            if (!isNaN(num)) {
                numbers.add(num);
            }
        }
    });
    
    return numbers.size > 0 ? Array.from(numbers) : null;
}

function toggleFilterDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('filterDropdown');
    const wrapper = document.getElementById('sectionFilterWrapper');
    if (dropdown) dropdown.classList.toggle('open');
    if (wrapper) wrapper.classList.toggle('active');
    
    // Close category dropdown if open
    const catDropdown = document.getElementById('categoryDropdown');
    const catWrapper = document.getElementById('categoryFilterWrapper');
    if (catDropdown) catDropdown.classList.remove('open');
    if (catWrapper) catWrapper.classList.remove('active');
}

function toggleCategoryDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('categoryDropdown');
    const wrapper = document.getElementById('categoryFilterWrapper');
    if (dropdown) dropdown.classList.toggle('open');
    if (wrapper) wrapper.classList.toggle('active');
    
    // Initialize category options if empty
    const categoryOptions = document.getElementById('categoryOptions');
    if (categoryOptions && categoryOptions.innerHTML.trim() === '' && state.categories.length > 0) {
        categoryOptions.innerHTML = `
            <div class="filter-item selected" data-category="" onclick="selectCategory('')">
                Все категории
            </div>
            ${state.categories.map(cat => `
                <div class="filter-item" data-category="${cat}" onclick="selectCategory('${cat}')">
                    ${cat}
                </div>
            `).join('')}
        `;
    }
    
    // Close section dropdown if open
    const filterDropdown = document.getElementById('filterDropdown');
    const filterWrapper = document.getElementById('sectionFilterWrapper');
    if (filterDropdown) filterDropdown.classList.remove('open');
    if (filterWrapper) filterWrapper.classList.remove('active');
}

function selectCategory(category) {
    const categoryFilterBtnText = document.getElementById('categoryFilterBtnText');
    const categoryDropdown = document.getElementById('categoryDropdown');
    const categoryFilterWrapper = document.getElementById('categoryFilterWrapper');
    
    // Update button text
    if (categoryFilterBtnText) {
        categoryFilterBtnText.textContent = category || 'Все категории';
    }
    
    // Close dropdown
    if (categoryDropdown) categoryDropdown.classList.remove('open');
    if (categoryFilterWrapper) categoryFilterWrapper.classList.remove('active');
    
    // Update defectCategoryFilter value and reload
    const catFilter = document.getElementById('defectCategoryFilter');
    if (catFilter) {
        catFilter.value = category;
    }
    
    loadApartments();
}

function toggleAllFilter(checked) {
    const filterOptions = document.getElementById('filterOptions');
    if (!filterOptions) return;
    
    const items = filterOptions.querySelectorAll('.filter-item');
    items.forEach(item => item.classList.toggle('selected', checked));
    handleFilterChange();
}

function handleFilterChange() {
    const filterOptions = document.getElementById('filterOptions');
    if (!filterOptions) return;
    
    const items = filterOptions.querySelectorAll('.filter-item');
    const selectedItems = filterOptions.querySelectorAll('.filter-item.selected');
    const filterBtnText = document.getElementById('filterBtnText');
    const selectedCount = selectedItems.length;
    const totalCount = items.length;
    
    if (selectedCount === 0 || selectedCount === totalCount) {
        items.forEach(item => item.classList.remove('selected'));
        filterBtnText.textContent = 'Все секции';
    } else if (selectedCount === 1) {
        const selectedSection = selectedItems[0].textContent;
        filterBtnText.textContent = selectedSection;
    } else {
        filterBtnText.textContent = `Выбрано: ${selectedCount}`;
    }
    
    loadApartments();
}

function toggleSectionFilter(sectionId) {
    const filterOptions = document.getElementById('filterOptions');
    if (!filterOptions) return;
    
    const items = filterOptions.querySelectorAll('.filter-item');
    const selectedItems = filterOptions.querySelectorAll('.filter-item.selected');
    const item = filterOptions.querySelector(`.filter-item[data-section="${sectionId}"]`);
    
    const wasAllSelected = selectedItems.length === items.length || selectedItems.length === 0;
    
    if (wasAllSelected) {
        items.forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
    } else {
        if (selectedItems.length === 1 && selectedItems[0] === item) {
            items.forEach(i => i.classList.add('selected'));
        } else {
            item.classList.toggle('selected');
        }
    }
    
    handleFilterChange();
}

function toggleAllSections(checked) {
    const checkboxes = document.querySelectorAll('#sectionOptions input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = checked);
    handleSectionChange();
}

function handleSectionChange() {
    const checkboxes = document.querySelectorAll('#sectionOptions input[type="checkbox"]:checked');
    const values = Array.from(checkboxes).map(cb => cb.value);
    const sectionBtnText = document.getElementById('sectionBtnText');
    const selectAllCheckbox = document.getElementById('selectAllSections');
    
    const allCheckboxes = document.querySelectorAll('#sectionOptions input[type="checkbox"]');
    const allCount = allCheckboxes.length;
    
    if (values.length === 0) {
        sectionBtnText.textContent = 'Все секции';
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
    } else if (values.length === allCount) {
        sectionBtnText.textContent = 'Все секции';
        if (selectAllCheckbox) selectAllCheckbox.checked = true;
    } else {
        sectionBtnText.textContent = `Выбрано: ${values.length}`;
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
    }
    
    loadApartments();
}

function handleViewModeChange() {
    loadApartments();
}

function updatePlaceholders() {
    const searchInput = document.getElementById('searchApt');
    const propType = state.currentPropertyType;
    if (propType === 'апартаменты') {
        if (searchInput) searchInput.placeholder = 'Номер апартамента (напр: 1,3-5,10)...';
    } else {
        if (searchInput) searchInput.placeholder = 'Номер квартиры (напр: 1,3-5,10)...';
    }
}

document.addEventListener('click', (e) => {
    // Close section filter dropdown
    const sectionFilterWrapper = document.getElementById('sectionFilterWrapper');
    if (sectionFilterWrapper && !sectionFilterWrapper.contains(e.target)) {
        const filterDropdown = document.getElementById('filterDropdown');
        if (filterDropdown) filterDropdown.classList.remove('open');
        if (sectionFilterWrapper) sectionFilterWrapper.classList.remove('active');
    }
    
    // Close category filter dropdown
    const categoryFilterWrapper = document.getElementById('categoryFilterWrapper');
    if (categoryFilterWrapper && !categoryFilterWrapper.contains(e.target)) {
        const categoryDropdown = document.getElementById('categoryDropdown');
        if (categoryDropdown) categoryDropdown.classList.remove('open');
        if (categoryFilterWrapper) categoryFilterWrapper.classList.remove('active');
    }
});

async function loadApartments() {
    console.log('=== loadApartments START ===', state.currentComplex);
    if (!state.currentComplex) {
        console.log('No current complex');
        return;
    }
    
    const container = elements.apartmentsContainer;
    console.log('Container:', container);
    if (!container) {
        console.log('No container found');
        return;
    }
    
    showLoading(container);
    
    try {
        // Get selected sections from filter (only from filterOptions, not category filter)
        const filterOptions = document.getElementById('filterOptions');
        const selectedItems = filterOptions ? filterOptions.querySelectorAll('.filter-item.selected') : [];
        const allItems = filterOptions ? filterOptions.querySelectorAll('.filter-item') : [];
        
        console.log('Filter items:', selectedItems.length, '/', allItems.length);
        
        const allCount = allItems.length;
        const selectedCount = selectedItems.length;
        
        let sectionIds = '';
        
        // If all selected or nothing selected - show all
        if (selectedCount === 0 || selectedCount === allCount) {
            sectionIds = '';
        } else {
            const selectedValues = Array.from(selectedItems).map(item => item.dataset.section);
            sectionIds = selectedValues.join(',');
        }
        
        const search = document.getElementById('searchApt')?.value || '';
        const searchNumbers = parseApartmentNumbers(search);
        
        let url = `/api/complexes/${state.currentComplex}/apartments`;
        const params = new URLSearchParams();
        
        if (sectionIds) {
            params.append('section_ids', sectionIds);
        }
        
        // Add cache-busting timestamp
        params.append('_', Date.now());
        
        url += '?' + params.toString();
        
        console.log('Fetching apartments from:', url);
        const res = await fetch(url);
        console.log('Fetch response:', res.status, res.ok);
        let apts = await res.json();
        console.log('Loaded apartments:', apts.length);
        
        // Fetch defects for category-based badge counts and filtering
        const catFilter = document.getElementById('defectCategoryFilter')?.value;
        const statusFilter = document.getElementById('defectStatusFilter')?.value;
        const defectsRes = await fetch(`/api/complexes/${state.currentComplex}/defects`);
        state.currentDefects = await defectsRes.json();
        
        // Filter apartments by defects if category filter is active
        if (catFilter || statusFilter) {
            const filteredIds = new Set();
            
            state.currentDefects.forEach(d => {
                if (catFilter && d.category !== catFilter) return;
                if (statusFilter === 'new' && d.status !== 'new') return;
                if (statusFilter === 'in_progress' && d.status !== 'in_progress') return;
                if (statusFilter === 'ready' && !['ready','rejected'].includes(d.status)) return;
                filteredIds.add(d.apartment_id);
            });
            apts = apts.filter(a => filteredIds.has(a.id));
        }
        
        if (state.accessFilter === 'defects') {
            apts = apts.filter(a => a.total_defects > 0);
        } else if (state.accessFilter) {
            apts = apts.filter(a => a.access_status === state.accessFilter);
        }
        
        if (searchNumbers) {
            apts = apts.filter(a => searchNumbers.includes(a.number));
        }
        
        // Update subtitle with displayed count
        const propName = state.currentPropertyType === 'апартаменты' ? 'квартир' : 'квартир';
        const pageSubtitle = document.getElementById('pageSubtitle');
        if (pageSubtitle) {
            pageSubtitle.textContent = `${apts.length} ${propName}`;
        }
        
        renderApartments(apts);
    } catch (err) {
        const propName = state.currentPropertyType === 'апартаменты' ? 'апартаментов' : 'квартир';
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">[!]</div>
                <h3>Ошибка загрузки ${propName}</h3>
                <button class="btn btn-primary" onclick="loadApartments()">Попробовать снова</button>
            </div>
        `;
    }
}

function setAccessFilter(filter) {
    // Если кнопка уже активна - снимаем фильтр (показываем все)
    const currentFilter = state.accessFilter;
    if (currentFilter === filter) {
        state.accessFilter = '';
        document.querySelectorAll('.pill').forEach(chip => {
            chip.classList.remove('active');
        });
    } else {
        state.accessFilter = filter;
        document.querySelectorAll('.pill').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.filter === filter);
        });
    }
    
    if (elements.defectFilterPanel) {
        elements.defectFilterPanel.style.display = state.accessFilter === 'defects' ? 'flex' : 'none';
    }
    
    loadApartments();
}

function debouncedLoad() {
    clearTimeout(window.loadTimer);
    window.loadTimer = setTimeout(loadApartments, 300);
}

// Update stats panel with current filter/counts
function updateStatsPanel(apartments) {
    try {
        if (!elements.statAvailable) return;
        
        let available = 0, accepted = 0, call = 0, noAccess = 0, defects = 0;
        
        if (apartments) {
            apartments.forEach(a => {
                if (a.access_status === 'available') available++;
                else if (a.access_status === 'owner_accepted') accepted++;
                else if (a.access_status === 'call') call++;
                else if (a.access_status === 'no_access') noAccess++;
                if (a.active_defects_count > 0) defects++;
            });
        }
        
        if (elements.statAvailable) elements.statAvailable.textContent = available;
        if (elements.statAccepted) elements.statAccepted.textContent = accepted;
        if (elements.statCall) elements.statCall.textContent = call;
        if (elements.statNoAccess) elements.statNoAccess.textContent = noAccess;
        if (elements.statDefects) elements.statDefects.textContent = defects;
    } catch (e) {
        console.error('Stats panel error:', e);
    }
}

// Render apartments with new .apt classes and colors
function renderApartments(apartments) {
    console.log('=== renderApartments START ===', apartments?.length);
    const container = elements.apartmentsContainer;
    if (!container) {
        console.log('renderApartments: No container');
        return;
    }
    
    const viewMode = document.getElementById('viewMode')?.value || 'section';
    const propType = state.currentPropertyType;
    const propName = propType === 'апартаменты' ? 'квартир' : 'квартир';
    const propShort = propType === 'апартаменты' ? 'апарт.' : 'кв.';
    const propFull = propType === 'апартаменты' ? 'апартамент' : 'квартира';
    
    if (!apartments?.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✓</div>
                <h3>Замечаний нет</h3>
                <p>По выбранным фильтрам замечаний не найдено</p>
            </div>
        `;
        return;
    }
    
    // Group by section
    const bySection = {};
    apartments.forEach(a => {
        const sec = a.section_number;
        if (!bySection[sec]) bySection[sec] = { section_id: a.section_id, building_number: a.building_number, floors: {} };
        if (!bySection[sec].floors[a.floor]) bySection[sec].floors[a.floor] = [];
        bySection[sec].floors[a.floor].push(a);
    });
    
    const sortedSections = Object.keys(bySection).sort((a, b) => a - b);
    
    let html = '<div class="sections-grid">';
    
    // Get selected sections from filter (only from filterOptions, not category filter)
    const filterOpts = document.getElementById('filterOptions');
    const selectedItems = filterOpts ? filterOpts.querySelectorAll('.filter-item.selected') : [];
    const allItems = filterOpts ? filterOpts.querySelectorAll('.filter-item') : [];
    
    const selectedValues = Array.from(selectedItems).map(item => item.dataset.section);
    const allSelected = selectedItems.length === 0 || selectedItems.length === allItems.length;
    const selectedSectionIds = allSelected ? [] : selectedValues.map(v => parseInt(v));
    
    // Check if we have multiple buildings from the data
    const uniqueBuildings = new Set(apartments.map(a => a.building_number || 1));
    const hasMultipleBuildings = uniqueBuildings.size > 1;
    
    if (viewMode === 'building') {
        // Group by building -> section
        const byBuilding = {};
        apartments.forEach(a => {
            const secId = a.section_id;
            if (selectedSectionIds.length > 0 && !selectedSectionIds.includes(secId)) return;
            
            const bld = a.building_number || 1;
            
            if (!byBuilding[bld]) byBuilding[bld] = {};
            if (!byBuilding[bld][secId]) {
                byBuilding[bld][secId] = { 
                    building_number: bld, 
                    section_id: secId,
                    section_number: a.section_number,
                    floors: {} 
                };
            }
            if (!byBuilding[bld][secId].floors[a.floor]) byBuilding[bld][secId].floors[a.floor] = [];
            byBuilding[bld][secId].floors[a.floor].push(a);
        });
        
        const sortedBuildings = Object.keys(byBuilding).sort((a, b) => a - b);
        
        // For each building - show sections inside one frame
        html += sortedBuildings.map(bnum => {
            const sections = byBuilding[bnum];
            const sortedSectionIds = Object.keys(sections).sort((a, b) => {
                return sections[a].section_number - sections[b].section_number;
            });
            
            // Building totals
            const allApts = [];
            sortedSectionIds.forEach(secId => {
                allApts.push(...Object.values(sections[secId].floors).flat());
            });
            const bldDefectCount = allApts.filter(a => a.active_defects_count > 0).length;
            const bldOwnerCount = allApts.filter(a => a.access_status === 'owner_accepted').length;
            const bldCallCount = allApts.filter(a => a.access_status === 'call').length;
            const bldNoCount = allApts.filter(a => a.access_status === 'no_access').length;
            
            const title = `Корпус ${bnum}`;
            
            return `
                <div class="section-item">
                    <div class="section-header">
                        <span class="section-title">${title}</span>
                        <span class="section-count">${allApts.length} ${propShort}</span>
                    </div>
                    <div class="section-body-container">
                        <div class="section-body">
                            ${sortedSectionIds.map(secId => {
                                const secData = sections[secId];
                                const secFloors = secData.floors;
                                const secApts = Object.values(secFloors).flat();
                                const secDefectCount = secApts.filter(a => a.active_defects_count > 0).length;
                                const secOwnerCount = secApts.filter(a => a.access_status === 'owner_accepted').length;
                                const secCallCount = secApts.filter(a => a.access_status === 'call').length;
                                const secNoCount = secApts.filter(a => a.access_status === 'no_access').length;
                                const sortedFloors = Object.keys(secFloors).sort((a, b) => b - a);
                                
                                return `
                                    <div class="section-block">
                                        <div class="section-header" style="background:#f8f9fa;border-bottom:1px solid #eee;">
                                            <span class="section-title">Секция ${secData.section_number}</span>
                                            <span class="section-count">${secApts.length} ${propShort}</span>
                                        </div>
                                        <div class="section-body-container" style="padding:0;">
                                            <div class="section-body">
                                                ${sortedFloors.map(floor => {
                                                    const floorApts = secFloors[floor].sort((a, b) => a.number - b.number);
                                                    return renderFloorRow(floorApts, floor, propFull);
                                                }).join('')}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        // View by sections
        const filteredSections = sortedSections.filter(sec => {
            const secId = bySection[sec]?.section_id;
            return selectedSectionIds.length === 0 || (secId && selectedSectionIds.includes(secId));
        });
        
        html += filteredSections.map(sec => {
            const sectionData = bySection[sec];
            const floors = sectionData?.floors;
            if (!floors) return '';
            
            const buildingNum = sectionData?.building_number || 1;
            const allApts = Object.values(floors).flat();
            
            const defectCount = allApts.filter(a => a.active_defects_count > 0).length;
            const ownerCount = allApts.filter(a => a.access_status === 'owner_accepted').length;
            const callCount = allApts.filter(a => a.access_status === 'call').length;
            const noCount = allApts.filter(a => a.access_status === 'no_access').length;
            
            const sortedFloors = Object.keys(floors).sort((a, b) => b - a);
            
            const title = uniqueBuildings.size > 1 ? `Корпус ${buildingNum} • Секция ${sec}` : `Секция ${sec}`;
            
            return `
                <div class="section-item">
                    <div class="section-header">
                        <span class="section-title">${title}</span>
                        <span class="section-count">${allApts.length} ${propShort}</span>
                    </div>
                    <div class="section-body-container">
                        <div class="section-body">
                            ${sortedFloors.map(floor => {
                                const floorApts = floors[floor].sort((a, b) => a.number - b.number);
                                return renderFloorRow(floorApts, floor, propFull);
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    container.innerHTML = html + '</div>';
    try {
        updateStatsPanel(apartments);
    } catch (e) {
        console.error('Stats update error:', e);
    }
}

// Get defect count for apartment by category filter
function getDefectBadgeCount(aptId) {
    const catFilter = document.getElementById('defectCategoryFilter')?.value;
    
    // If no category filter, return total count
    if (!catFilter || !state.currentDefects.length) {
        const apt = state.currentApartmentData || {};
        return null; // Will use default count
    }
    
    // Count defects only for selected category
    return state.currentDefects.filter(d => d.apartment_id === aptId && d.category === catFilter && d.status !== 'ready' && d.status !== 'rejected').length;
}

function renderFloorRow(floorApts, floor, propFull) {
    const catFilter = document.getElementById('defectCategoryFilter')?.value;
    
    return `
        <div class="floor-row">
            <div class="floor-label">${floor} эт</div>
            <div class="floor-apts">
                ${floorApts.map(a => {
                    const deadlineClass = getDeadlineClass(a);
                    const cls = getApartmentClass(a.access_status, a.active_defects_count);
                    
                    // Get badge count - use category filter if active
                    let badgeCount = a.active_defects_count;
                    if (catFilter && state.currentDefects.length) {
                        badgeCount = state.currentDefects.filter(d => d.apartment_id === a.id && d.category === catFilter && d.status !== 'ready' && d.status !== 'rejected').length;
                    }
                    
                    const badge = (badgeCount > 0 && a.access_status !== 'owner_accepted') ? `<span class="apt-badge">${badgeCount}</span>` : '';
                    const tooltip = `${propFull === 'апартамент' ? 'Апартамент' : 'Квартира'} ${a.number}`;
                    return `
                        <div class="apt ${cls} ${deadlineClass}" 
                             data-id="${a.id}" 
                             title="${tooltip}"
                             onclick="showApartmentDetail(${a.id})">
                            ${a.number}
                            ${badge}
                            </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Get apartment CSS class based on status and defects
function getApartmentClass(status, defects) {
    // Принята - зелёная ячейка
    if (status === 'owner_accepted') {
        return 'apt apt-owner_accepted';
    }
    // Пригласить - светло-зеленая ячейка
    if (status === 'call') {
        return 'apt apt-call';
    }
    // Доступ по звонку - голубая ячейка
    if (status === 'by_phone') {
        return 'apt apt-by_phone';
    }
    // В работе - желтая ячейка
    if (status === 'in_progress') {
        return 'apt apt-in_progress';
    }
    // Особое внимание - красная ячейка
    if (status === 'complex') {
        return 'apt apt-complex';
    }
    // Без замечаний - серая ячейка
    if (status === 'available') {
        return 'apt apt-available';
    }
    // Нет доступа - синяя ячейка
    return 'apt apt-no_access';
}

function getDeadlineClass(apt) {
    if (!apt.earliest_deadline || apt.active_defects_count === 0) return '';
    
    const now = new Date();
    const deadline = new Date(apt.earliest_deadline);
    const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 0) {
        return 'apt-deadline-passed';
    } else if (daysUntil < 15) {
        return 'apt-deadline-urgent';
    } else if (daysUntil < 30) {
        return 'apt-deadline-warning';
    }
    return '';
}

// Apartment Detail
async function showApartmentDetail(id) {
    state.currentApartment = id;
    state.currentApartmentData = null;
    updateHeader(true, false);
    setPageTitle('Загрузка...', '');
    showTab('apartment-detail');
    
    // Switch to apartment status toolbar
    const toolbarSearch = document.getElementById('toolbarSearch');
    const headerFilters = document.getElementById('headerFilters');
    const toolbarFilters = document.getElementById('toolbarFilters');
    const toolbarStatus = document.getElementById('toolbarStatus');
    if (toolbarSearch) toolbarSearch.style.display = 'none';
    if (headerFilters) headerFilters.style.display = 'none';
    if (toolbarFilters) toolbarFilters.style.display = 'none';
    if (toolbarStatus) toolbarStatus.style.display = 'flex';
    
    try {
        const [defectsRes, aptsRes] = await Promise.all([
            fetch(`/api/apartments/${id}/defects`),
            fetch(`/api/complexes/${state.currentComplex}/apartments`)
        ]);
        
        const defects = await defectsRes.json();
        const apts = await aptsRes.json();
        const apt = apts.find(a => a.id === id);
        
        if (!apt) {
            const propType = state.currentPropertyType;
            const propLabel = propType === 'апартаменты' ? 'Апартаменты' : 'Квартира';
            showToast(`${propLabel} не найден(а)`, 'error');
            return;
        }
        
        state.currentApartmentData = apt;
        const propType = state.currentPropertyType;
        const propLabel = propType === 'апартаменты' ? 'Апартаменты' : 'Квартира';
        
        const complexSections = state.currentComplexData?.sections || [];
        const hasMultipleBuildings = new Set(complexSections.map(s => s.building_number || 1)).size > 1;
        
        const aptSubtitle = hasMultipleBuildings
            ? `Корпус ${apt.building_number} • Секция ${apt.section_number} • Этаж ${apt.floor}`
            : `Секция ${apt.section_number} • Этаж ${apt.floor}`;
        
        const active = defects.filter(d => !['ready','rejected'].includes(d.status));
        const done = defects.filter(d => ['ready','rejected'].includes(d.status));
        
        const fullSubtitle = `${aptSubtitle} | Активных: ${active.length} | Готовых: ${done.length}`;
        setPageTitle(`${propLabel} ${apt.number}`, fullSubtitle);
        
        // Set status buttons
        document.querySelectorAll('.status-item').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.status === apt.access_status) {
                btn.classList.add('active');
            }
        });
        
        // Phone field
        const phoneBlock = document.getElementById('phoneBlock');
        const phoneInput = document.getElementById('phoneInput');
        
        if (phoneInput) phoneInput.value = apt.access_phone || '';
        if (phoneBlock) {
            phoneBlock.style.display = apt.access_status === 'by_phone' ? 'block' : 'none';
        }
        
        // Comment field
        const commentBlock = document.getElementById('commentBlock');
        const commentInput = document.getElementById('commentInput');
        
        if (commentInput) commentInput.value = apt.access_comment || '';
        if (commentBlock) {
            commentBlock.style.display = apt.access_status === 'elevated' ? 'block' : 'none';
        }
        
        renderDefects(defects);
    } catch (err) {
        showToast('Ошибка загрузки', 'error');
        console.error(err);
    }
}

// Status Functions
function setStatus(status) {
    document.querySelectorAll('.status-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.status === status) {
            btn.classList.add('active');
        }
    });
    
    const phoneBlock = document.getElementById('phoneBlock');
    if (phoneBlock) {
        phoneBlock.style.display = status === 'by_phone' ? 'block' : 'none';
    }
    
    const commentBlock = document.getElementById('commentBlock');
    if (commentBlock) {
        commentBlock.style.display = status === 'elevated' ? 'block' : 'none';
    }
    
    saveStatus(status);
}

async function saveStatus(status) {
    if (!state.currentApartment) return;
    
    try {
        const res = await fetch(`/api/apartments/${state.currentApartment}/access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `access_status=${status}`
        });
        
        if (res.ok) {
            showToast('Статус сохранен', 'success');
            
            // Update apartment card in list
            const apt = document.querySelector(`.apt[data-id="${state.currentApartment}"]`);
            if (apt && state.currentApartmentData) {
                const defects = state.currentApartmentData.active_defects_count || 0;
                const newClass = getApartmentClass(status, defects);
                apt.className = `apt ${newClass}`;
            }
            
            state.currentApartmentData.access_status = status;
        } else {
            showToast('Ошибка сохранения', 'error');
        }
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

async function savePhone() {
    if (!state.currentApartment) return;
    
    const phoneInput = document.getElementById('phoneInput');
    const phone = phoneInput?.value.trim();
    const status = document.querySelector('.status-item.active')?.dataset.status || 'by_phone';
    
    try {
        await fetch(`/api/apartments/${state.currentApartment}/access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `access_status=${status}&access_phone=${encodeURIComponent(phone)}`
        });
        
        state.currentApartmentData.access_phone = phone;
        showToast('Телефон сохранен', 'success');
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

async function deletePhone() {
    if (!state.currentApartment) return;
    
    const status = document.querySelector('.status-item.active')?.dataset.status || 'by_phone';
    
    try {
        await fetch(`/api/apartments/${state.currentApartment}/access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `access_status=${status}&access_phone=`
        });
        
        const phoneInput = document.getElementById('phoneInput');
        if (phoneInput) phoneInput.value = '';
        
        state.currentApartmentData.access_phone = null;
        showToast('Телефон удален', 'success');
    } catch (err) {
        showToast('Ошибка удаления', 'error');
    }
}

async function saveComment() {
    if (!state.currentApartment) return;
    
    const commentInput = document.getElementById('commentInput');
    const comment = commentInput?.value.trim();
    
    try {
        await fetch(`/api/apartments/${state.currentApartment}/access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `access_status=elevated&access_comment=${encodeURIComponent(comment)}`
        });
        
        state.currentApartmentData.access_comment = comment;
        showToast('Комментарий сохранен', 'success');
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

// Defects
function renderDefects(defects) {
    const container = elements.defectsList;
    if (!container) return;
    
    if (!defects.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Нет замечаний</h3>
            </div>
        `;
        return;
    }
    
    const badges = { 
        'new': 'badge-new', 
        'in_progress': 'badge-progress', 
        'ready': 'badge-ready', 
        'rejected': 'badge-rejected' 
    };
    
    const labels = { 
        'new': 'Новое', 
        'in_progress': 'В работе', 
        'ready': 'Готово', 
        'rejected': 'Отклонено' 
    };
    
    container.innerHTML = defects.map((d, index) => `
        <div class="defect-item" style="animation: slideIn 0.3s ease ${index * 0.05}s both;">
            <div class="defect-head">
                <div class="defect-head-left">
                    <span class="badge ${badges[d.status]}">${labels[d.status]}</span>
                    <span class="badge badge-cat">${escapeHtml(d.category)}</span>
                </div>
                <span class="defect-date">${formatDate(d.created_at)}</span>
            </div>
            <div class="defect-body">
                ${d.photos?.length ? `
                    <div class="defect-imgs">
                        ${d.photos.map(p => `
                            <img src="/uploads/${escapeHtml(p.filename)}" 
                                 onclick="showPhoto('/uploads/${escapeHtml(p.filename)}')" 
                                 loading="lazy">
                        `).join('')}
                    </div>
                ` : ''}
                ${d.items?.length ? `
                    <div class="items-list">
                        ${d.items.map((item, i) => `
                            <div class="item-row">
                                <select onchange="updateItemStatus(${item.id}, this.value)" class="status-select">
                                    <option value="new" ${item.status === 'new' ? 'selected' : ''}>Новое</option>
                                    <option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                                    <option value="ready" ${item.status === 'ready' ? 'selected' : ''}>Готово</option>
                                    <option value="rejected" ${item.status === 'rejected' ? 'selected' : ''}>Отклонено</option>
                                </select>
                                <span class="item-text">${i + 1}. ${escapeHtml(item.text)}</span>
                                <div class="actions">
                                    <button class="btn-icon cmt" onclick="showComments(${item.id})" title="Комментарии">
                                        [Ком] ${item.comments?.length || 0}
                                    </button>
                                    <button class="btn-icon del" onclick="deleteItem(${item.id})" title="Удалить">×</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `<p class="defect-desc">${escapeHtml(d.description)}</p>`}
                ${d.deadline ? `<p class="defect-deadline">📅 Срок: ${formatDate(d.deadline)}</p>` : ''}
            </div>
            <div class="defect-foot">
                <select onchange="updateDefectStatus(${d.id}, this.value)" class="status-select">
                    <option value="new" ${d.status === 'new' ? 'selected' : ''}>Новое</option>
                    <option value="in_progress" ${d.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                    <option value="ready" ${d.status === 'ready' ? 'selected' : ''}>Готово</option>
                    <option value="rejected" ${d.status === 'rejected' ? 'selected' : ''}>Отклонено</option>
                </select>
                <button class="btn btn-sm btn-danger" onclick="deleteDefect(${d.id})">Удалить</button>
            </div>
        </div>
    `).join('');
}

async function updateDefectStatus(id, status) {
    try {
        await fetch(`/api/defects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `status=${status}`
        });
        
        showToast('Статус обновлен', 'success');
        showApartmentDetail(state.currentApartment);
    } catch (err) {
        showToast('Ошибка обновления', 'error');
    }
}

async function deleteDefect(id) {
    if (!confirm('Удалить замечание?')) return;
    
    try {
        await fetch(`/api/defects/${id}`, { method: 'DELETE' });
        showToast('Удалено', 'success');
        showApartmentDetail(state.currentApartment);
    } catch (err) {
        showToast('Ошибка удаления', 'error');
    }
}

// Items
async function updateItemStatus(id, status) {
    try {
        await fetch(`/api/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `status=${status}`
        });
        showToast('Сохранено', 'success');
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

function editItem(id, el) {
    const text = el.textContent.split('. ')[1];
    const input = document.createElement('input');
    input.value = text;
    input.className = 'item-input';
    
    input.onblur = async () => {
        if (input.value.trim()) {
            await fetch(`/api/items/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `text=${encodeURIComponent(input.value.trim())}`
            });
        }
        showApartmentDetail(state.currentApartment);
    };
    
    input.onkeypress = (e) => {
        if (e.key === 'Enter') input.blur();
    };
    
    el.replaceWith(input);
    input.focus();
}

async function deleteItem(id) {
    if (!confirm('Удалить пункт?')) return;
    
    try {
        await fetch(`/api/items/${id}`, { method: 'DELETE' });
        showApartmentDetail(state.currentApartment);
    } catch (err) {
        showToast('Ошибка удаления', 'error');
    }
}

// Comments
function showComments(itemId) {
    state.currentItemId = itemId;
    const modal = document.getElementById('commentsModal');
    if (modal) {
        modal.classList.add('active');
        loadComments(itemId);
    }
}

async function loadComments(itemId) {
    try {
        const res = await fetch(`/api/items/${itemId}/comments`);
        const comments = await res.json();
        
        const commentsBody = document.getElementById('commentsBody');
        if (commentsBody) {
            commentsBody.innerHTML = comments.map(c => `
                <div class="comment-item">
                    <div class="comment-author">
                        ${escapeHtml(c.author)} 
                        <span class="comment-date">${formatDate(c.created_at)}</span>
                    </div>
                    <div class="comment-text">${escapeHtml(c.text)}</div>
                </div>
            `).join('') || '<p class="empty-comments">Нет комментариев</p>';
        }
    } catch (err) {
        console.error('Error loading comments:', err);
    }
}

async function submitComment() {
    const input = document.getElementById('commentInput');
    const text = input?.value.trim();
    
    if (!text || !state.currentItemId) return;
    
    try {
        await fetch(`/api/items/${state.currentItemId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `text=${encodeURIComponent(text)}`
        });
        
        input.value = '';
        loadComments(state.currentItemId);
    } catch (err) {
        showToast('Ошибка отправки', 'error');
    }
}

function closeComments() {
    const modal = document.getElementById('commentsModal');
    if (modal) modal.classList.remove('active');
}

// Add Defect Form
function showAddDefectForm() {
    showTab('add-defect');
    const form = document.getElementById('addDefectForm');
    if (form) form.reset();
    
    const windowGroup = document.getElementById('windowGroup');
    const templatesGroup = document.getElementById('templatesGroup');
    const previewGrid = document.getElementById('previewGrid');
    
    if (windowGroup) windowGroup.style.display = 'none';
    if (templatesGroup) templatesGroup.style.display = 'none';
    if (previewGrid) previewGrid.innerHTML = '';
}

function handleFileSelect(e) {
    const files = e.target.files;
    const grid = document.getElementById('previewGrid');
    
    if (!grid) return;
    grid.innerHTML = '';
    
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}">
                <button class="preview-remove" onclick="this.parentElement.remove()">×</button>
            `;
            grid.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

async function handleAddDefect(e) {
    e.preventDefault();
    
    const category = document.getElementById('defectCategory')?.value;
    const description = document.getElementById('defectDescription')?.value.trim();
    
    if (!category || !description) {
        showToast('Заполните все обязательные поля', 'warning');
        return;
    }
    
    const windowNumber = document.getElementById('windowNumber')?.value;
    const deadline = document.getElementById('defectDeadline')?.value;
    
    try {
        const formData = new FormData();
        formData.append('category', category);
        formData.append('description', description);
        
        if (windowNumber) formData.append('window_number', windowNumber);
        if (deadline) formData.append('deadline', deadline);
        
        const photos = document.getElementById('defectPhotos')?.files;
        if (photos) {
            for (let i = 0; i < photos.length; i++) {
                formData.append('photos', photos[i]);
            }
        }
        
        const res = await fetch(`/api/apartments/${state.currentApartment}/defects`, {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            showToast('Замечание добавлено', 'success');
            showApartmentDetail(state.currentApartment);
        } else {
            showToast('Ошибка добавления', 'error');
        }
    } catch (err) {
        showToast('Ошибка добавления', 'error');
    }
}

// Photo Modal
function showPhoto(src) {
    const modalImg = document.getElementById('modalImg');
    const photoModal = document.getElementById('photoModal');
    
    if (modalImg) modalImg.src = src;
    if (photoModal) photoModal.classList.add('active');
}

function closeModal() {
    const photoModal = document.getElementById('photoModal');
    if (photoModal) photoModal.classList.remove('active');
}

// CSV Export
async function exportToCSV(complexId) {
    try {
        showToast('Генерация отчета...', 'info');
        
        const res = await fetch(`/api/complexes/${complexId}/apartments`);
        const apts = await res.json();
        
        const propType = state.currentPropertyType;
        const propLabel = propType === 'апартаменты' ? 'Апартамент' : 'Квартира';
        let csv = `${propLabel};Секция;Этаж;Статус доступа;Замечаний\n`;
        
        apts.forEach(a => {
            const status = {
                available: 'Без замечаний',
                tech_accepted: 'Тех Надзор',
                owner_accepted: 'Собственник',
                by_phone: 'По звонку',
                no_access: 'Нет доступа'
            }[a.access_status] || '';
            
            csv += `${a.number};${a.section_number};${a.floor};"${status}";${a.active_defects_count}\n`;
        });
        
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = `report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Отчет готов', 'success');
    } catch (err) {
        showToast('Ошибка экспорта', 'error');
    }
}

// Toast Notifications
function showToast(message, type = 'info') {
    const toast = elements.toast || document.getElementById('toast');
    if (!toast) return;
    
    // Remove existing classes
    toast.className = 'toast';
    
    // Add type class
    toast.classList.add(`toast-${type}`);
    toast.classList.add('show');
    toast.textContent = message;
    
    // Clear existing timeout
    if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
    }
    
    // Hide after 3 seconds
    toast.timeoutId = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Legacy toast function for backwards compatibility
function toast(msg, error = false) {
    showToast(msg, error ? 'error' : 'info');
}

// Utils
function formatDate(str) {
    if (!str) return '';
    return new Date(str).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function isOverdue(deadline, status) {
    if (['ready', 'rejected'].includes(status)) return false;
    return new Date(deadline) < new Date();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusClass(status) {
    const map = {
        'available': 'ok',
        'tech_accepted': 'tech',
        'owner_accepted': 'owner',
        'by_phone': 'phone',
        'no_access': 'no'
    };
    return map[status] || '';
}

// Deprecated: use getApartmentClass instead
function getStatusCssClass(status, defects) {
    return getApartmentClass(status, defects);
}

function pluralize(n, one, few, many) {
    if (n % 10 === 1 && n % 100 !== 11) return one;
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
    return many;
}

// Handle Create Complex
function handleCreateComplex(e) {
    e.preventDefault();
    submitComplexForm();
}

// Building View (legacy, now handled by renderApartments)
function renderBuildingView(apartments) {
    renderApartments(apartments);
}

// Print Defects
async function printDefects() {
    if (!state.currentApartment) return;
    
    try {
        const res = await fetch(`/api/apartments/${state.currentApartment}/defects`);
        const defects = await res.json();
        
        if (!defects.length) {
            showToast('Нет замечаний для печати', 'warning');
            return;
        }
        
        const apt = state.currentApartmentData;
        const propType = state.currentPropertyType;
        const propLabel = propType === 'апартаменты' ? 'Апартамент' : 'Квартира';
        const statusLabels = {
            'new': 'Новое',
            'in_progress': 'В работе',
            'ready': 'Готово',
            'rejected': 'Отклонено'
        };
        
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Замечания - ${propLabel} ${apt.number}</title>
                <style>
                    body{font-family:Arial,sans-serif;padding:20px;font-size:12px}
                    h1{font-size:18px;margin-bottom:5px}
                    .meta{color:#666;margin-bottom:20px}
                    .defect{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #ddd}
                    .defect:last-child{border-bottom:none}
                    .defect-header{display:flex;gap:10px;margin-bottom:8px}
                    .badge{padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold}
                    .badge-new{background:#fee2e2;color:#991b1b}
                    .badge-progress{background:#fef3c7;color:#92400e}
                    .badge-ready{background:#dcfce7;color:#166534}
                    .badge-rejected{background:#f3f4f6;color:#374151}
                    .cat{background:#e2e8f0;padding:2px 8px;border-radius:4px;font-size:10px}
                    .desc{line-height:1.5}
                    .items{margin-top:8px;padding-left:20px}
                    .item{display:flex;gap:10px;padding:4px 0}
                    .item-status{width:80px;color:#666}
                    .date{color:#999;font-size:10px;margin-top:4px}
                    @media print{body{padding:0}.defect{page-break-inside:avoid}}
                </style>
            </head>
            <body>
                <h1>Замечания - ${propLabel} ${apt.number}</h1>
                <p class="meta">${apt.building_number > 1 ? `Корпус ${apt.building_number}, Секция ${apt.section_number}` : `Секция ${apt.section_number}`} | Этаж ${apt.floor} | ${defects.length} ${pluralize(defects.length, 'замечание', 'замечания', 'замечаний')}</p>
        `;
        
        defects.forEach(d => {
            html += `
                <div class="defect">
                    <div class="defect-header">
                        <span class="badge badge-${d.status}">${statusLabels[d.status] || d.status}</span>
                        <span class="cat">${escapeHtml(d.category)}</span>
                    </div>
                    <p class="desc">${escapeHtml(d.description)}</p>
            `;
            
            if (d.items?.length) {
                html += '<div class="items">';
                d.items.forEach(item => {
                    html += `<div class="item"><span class="item-status">${statusLabels[item.status] || item.status}</span><span>${escapeHtml(item.text)}</span></div>`;
                });
                html += '</div>';
            }
            
            if (d.deadline) {
                html += `<p class="date">Срок: ${formatDate(d.deadline)}</p>`;
            }
            
            html += '</div>';
        });
        
        html += '</body></html>';
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.print();
    } catch (err) {
        showToast('Ошибка печати', 'error');
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
    
    // Backspace to go back (when not in input)
    if (e.key === 'Backspace' && 
        !e.target.matches('input, textarea, select') && 
        (state.currentApartment || state.currentComplex)) {
        e.preventDefault();
        goBack();
    }
});

console.log('app.js loaded - v2.0 optimized');