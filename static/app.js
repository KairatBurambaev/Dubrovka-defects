// State
const state = {
    currentTab: 'complexes',
    complexes: [],
    currentComplex: null,
    currentComplexData: null,
    currentComplexStats: null,
    currentPropertyType: 'квартиры',
    currentApartment: null,
    currentApartmentData: null,
    currentDefect: null,
    currentDefectCommentId: null,
    currentDefectComments: [],
    editingDefectCommentId: null,
    currentStatusDefectId: null,
    categories: [],
    contractors: [],
    currentItemId: null,
    accessFilter: '',
    defectsOnly: false,
    sortByDefects: false,
    loading: false,
    currentDefects: [], // Store defects for category filtering
    filteredApartments: []
};

// Global filter constants
const FILTERS = ['', 'defects', 'on_review', 'in_progress', 'call', 'owner_accepted', 'complex', 'no_access'];
const FILTER_NAMES = ['Все', 'С замечаниями', 'На проверке', 'В работе', 'Вызваные квартиры', 'Принята', 'Сложные', 'Нет доступа'];
const FILTER_INDEXES = {
    '': 0,
    'defects': 1,
    'on_review': 2,
    'in_progress': 3,
    'call': 4,
    'owner_accepted': 5,
    'complex': 6,
    'no_access': 7
};
const ACCEPTED_ACCESS_STATUSES = ['owner_accepted', 'tech_accepted'];
const DEFECT_STATUS_LABELS = {
    new: 'Новое',
    recorded: 'Зафиксировано',
    in_progress: 'В работе',
    on_review: 'На проверке',
    completed: 'Выполнено',
    rejected: 'Отклонено',
    rework: 'Отправленно на доработку'
};
const DEFECT_STATUS_ORDER = ['new', 'recorded', 'in_progress', 'on_review', 'completed', 'rejected', 'rework'];
const AVAILABLE_DEFECT_STATUSES = ['new', 'recorded', 'in_progress', 'on_review', 'completed', 'rework'];
const DEFECT_STATUS_CLASSES = {
    new: 'badge-new',
    recorded: 'badge-recorded',
    in_progress: 'badge-progress',
    on_review: 'badge-on-review',
    completed: 'badge-completed',
    rejected: 'badge-rejected',
    rework: 'badge-rework'
};
const CLOSED_DEFECT_STATUSES = ['completed', 'rejected'];
let currentFilterIndex = 0;
let photoModalItems = [];
let photoModalIndex = 0;
const defectAutosaveTimers = new Map();

// DOM Elements cache
const elements = {};
let wasMobileComplexLayout = window.innerWidth <= 768;

// Init
document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    loadCategories();
    loadContractors();
    loadComplexes();
    setupForms();
    setupEventListeners();
    setBodyViewClass('complexes');
    updateMobileFilterIndicator('');
    updateMobileFilterButtons('');
});

function setBodyViewClass(tab) {
    document.body.classList.remove(
        'page-home',
        'page-create-complex',
        'page-complex-detail',
        'page-apartment-detail',
        'page-add-defect'
    );

    if (tab === 'complexes') document.body.classList.add('page-home');
    if (tab === 'create-complex') document.body.classList.add('page-create-complex');
    if (tab === 'complex-detail') document.body.classList.add('page-complex-detail');
    if (tab === 'apartment-detail') document.body.classList.add('page-apartment-detail');
    if (tab === 'add-defect') document.body.classList.add('page-add-defect');
}

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
    elements.apartmentHeaderActions = document.getElementById('apartmentHeaderActions');
    elements.headerPrintBtn = document.getElementById('headerPrintBtn');
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
    elements.statsBtn = document.getElementById('statsBtn');
    elements.complexPrintBtn = document.getElementById('complexPrintBtn');
    elements.tabPanels = document.querySelectorAll('.tab-panel');
}

// Setup Forms
function setupForms() {
    const createForm = document.getElementById('createComplexForm');
    if (createForm) createForm.addEventListener('submit', handleCreateComplex);
    
    const defectForm = document.getElementById('addDefectForm');
    if (defectForm) defectForm.addEventListener('submit', handleAddDefect);
    
    const fileInputBefore = document.getElementById('defectPhotosBefore');
    if (fileInputBefore) fileInputBefore.addEventListener('change', (e) => renderSelectedFiles(e.target, 'before'));

    const fileInputBeforeGallery = document.getElementById('defectPhotosBeforeGallery');
    if (fileInputBeforeGallery) {
        fileInputBeforeGallery.addEventListener('change', (e) => appendSelectedFiles(e.target, fileInputBefore, 'before'));
    }

    const fileInputBeforeCamera = document.getElementById('defectPhotosBeforeCamera');
    if (fileInputBeforeCamera) {
        fileInputBeforeCamera.addEventListener('change', (e) => appendSelectedFiles(e.target, fileInputBefore, 'before'));
    }
    
    const uploadZoneBefore = document.getElementById('fileUploadArea');
    if (uploadZoneBefore && fileInputBefore) {
        uploadZoneBefore.addEventListener('click', () => openDefectGallery());
        uploadZoneBefore.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZoneBefore.classList.add('dragover');
        });
        uploadZoneBefore.addEventListener('dragleave', () => {
            uploadZoneBefore.classList.remove('dragover');
        });
        uploadZoneBefore.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZoneBefore.classList.remove('dragover');
            appendFilesToSelection(Array.from(e.dataTransfer.files || []), 'before', fileInputBefore);
        });
    }
    
    const categorySelect = document.getElementById('defectCategory');
    if (categorySelect) categorySelect.addEventListener('change', handleCategoryChange);
    
    const commentInput = document.getElementById('commentInput');
    if (commentInput) commentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitComment();
    });
}

function initCreateComplexForm() {
    buildingCount = 0;
    globalSectionCount = 0;
    const container = document.getElementById('buildingsContainer');
    if (container) container.innerHTML = '';
    addBuildingRow();
}

// Event Listeners
function setupEventListeners() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });

    // Mobile filter buttons
    const mobileFilterButtons = document.querySelectorAll('.mobile-filter-btn');
    mobileFilterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;
            setAccessFilter(filter);
        });
    });

    if (elements.defectsList) {
        elements.defectsList.addEventListener('input', (e) => {
            const row = e.target.closest('.defect-row');
            if (row) {
                markDefectRowDirty(row);
                scheduleDefectAutosave(row);
            }
        });
        elements.defectsList.addEventListener('change', (e) => {
            const row = e.target.closest('.defect-row');
            if (row) {
                markDefectRowDirty(row);
                scheduleDefectAutosave(row);
            }
            if (e.target.matches('.status-select')) {
                const badge = row?.querySelector('.defect-status-badge');
                if (badge) {
                    badge.className = `defect-status-badge ${getDefectStatusBadgeClass(e.target.value)}`;
                    badge.textContent = getDefectStatusLabel(e.target.value);
                }
            }
        });
    }

    window.addEventListener('resize', handleViewportResize);
}

function handleViewportResize() {
    const isMobileComplexLayout = window.innerWidth <= 768;
    if (isMobileComplexLayout === wasMobileComplexLayout) {
        return;
    }

    wasMobileComplexLayout = isMobileComplexLayout;

    if (state.currentTab === 'complex-detail' && state.currentComplex && !state.loading) {
        loadApartments();
    }
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
    setBodyViewClass(tab);
    syncApartmentHeaderControls();
    
    // Toggle body class for create-complex
    if (tab === 'create-complex') {
        initCreateComplexForm();
    }
    
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
    updateHeader(true, false);
    loadApartments();
}

function backToApartment() {
    if (state.currentApartment) showApartmentDetail(state.currentApartment);
}

function goBack() {
    if (state.currentApartment) {
        backToComplex();
    } else if (state.currentComplex) {
        showTab('complexes');
    }
}

function goHome() {
    state.currentComplex = null;
    state.currentApartment = null;
    state.currentComplexData = null;
    state.currentPropertyType = 'квартиры';
    showTab('complexes');
    loadComplexes();
}

function syncApartmentHeaderControls() {
    const showApartmentControls = state.currentTab === 'apartment-detail' && !!state.currentApartment;
    if (elements.apartmentHeaderActions) {
        elements.apartmentHeaderActions.style.display = showApartmentControls ? 'flex' : 'none';
    }
    if (elements.headerPrintBtn) {
        elements.headerPrintBtn.style.display = showApartmentControls ? 'inline-flex' : 'none';
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
    if (elements.statsBtn) {
        const showStats = state.currentTab === 'complex-detail' && !!state.currentComplex && !state.currentApartment;
        elements.statsBtn.style.display = showStats ? 'inline-flex' : 'none';
    }
    if (elements.complexPrintBtn) {
        const showComplexPrint = state.currentTab === 'complex-detail' && !!state.currentComplex && !state.currentApartment;
        elements.complexPrintBtn.style.display = showComplexPrint ? 'inline-flex' : 'none';
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

async function loadContractors(selectedId = '') {
    try {
        const res = await fetch('/api/contractors');
        const data = await res.json();
        state.contractors = data.contractors || [];

        const select = document.getElementById('defectContractorId');
        if (select) select.innerHTML = renderContractorOptions(selectedId);
    } catch (err) {
        console.error('Error loading contractors:', err);
    }
}

function renderContractorOptions(selectedId = '') {
    const normalizedId = String(selectedId || '');
    return [
        '<option value="">Не назначен</option>',
        ...state.contractors.map(contractor => `
            <option value="${contractor.id}" ${String(contractor.id) === normalizedId ? 'selected' : ''}>${escapeHtml(contractor.name)}</option>
        `)
    ].join('');
}

async function addContractorPrompt(context = 'create', defectId = null) {
    const name = prompt('Название подрядчика');
    if (!name || !name.trim()) return;

    try {
        const formData = new FormData();
        formData.append('name', name.trim());
        const res = await fetch('/api/contractors', {
            method: 'POST',
            body: formData
        });
        const contractor = await res.json();
        await loadContractors(contractor.id);

        if (context === 'create') {
            const select = document.getElementById('defectContractorId');
            if (select) select.value = String(contractor.id);
        }

        if (context === 'defect' && defectId) {
            const select = document.getElementById(`defectContractor_${defectId}`);
            if (select) select.innerHTML = renderContractorOptions(contractor.id);
        }

        showToast('Подрядчик добавлен', 'success');
    } catch (err) {
        showToast('Ошибка добавления подрядчика', 'error');
    }
}

function handleCategoryChange() {
    const cat = document.getElementById('defectCategory')?.value;
    const windowGroup = document.getElementById('windowGroup');
    const windowSelect = document.getElementById('windowNumber');
    const doorSideGroup = document.getElementById('doorSideGroup');
    const doorSideSelect = document.getElementById('doorSide');
    const restorationGroup = document.getElementById('restorationGroup');
    
    if (windowGroup) {
        if (cat === 'Окна') {
            windowGroup.style.display = 'block';
            if (windowSelect) {
                let options = '<option value="">Выберите</option>';
                options += '<option value="0">Общ.</option>';
                for (let i = 1; i <= 20; i++) {
                    options += `<option value="${i}">Об${i}</option>`;
                }
                windowSelect.innerHTML = options;
            }
        } else {
            windowGroup.style.display = 'none';
            if (windowSelect) windowSelect.value = '';
        }
    }

    if (doorSideGroup) {
        if (cat === 'Двери') {
            doorSideGroup.style.display = 'block';
            if (doorSideSelect) doorSideSelect.required = true;
        } else {
            doorSideGroup.style.display = 'none';
            if (doorSideSelect) {
                doorSideSelect.value = '';
                doorSideSelect.required = false;
            }
        }
    }
    
    if (restorationGroup) {
        restorationGroup.style.display = (cat === 'Окна' || cat === 'Двери') ? 'block' : 'none';
    }
}

function getWindowChipText(windowNumber) {
    if (windowNumber === 0 || windowNumber === '0') return 'Общ.';
    if (windowNumber === null || windowNumber === undefined || windowNumber === '') return '';
    return `Об${escapeHtml(windowNumber)}`;
}

function getDoorVariantLabel(variant) {
    const normalized = String(variant || '').trim();
    if (normalized === 'Нар') return 'Наружная';
    if (normalized === 'Вн') return 'Внутренняя';
    if (normalized === 'Общ.') return 'Общ.';
    return normalized;
}

function getExecutorIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20a8 8 0 0 1 16 0"/><circle cx="12" cy="8" r="4"/><path d="M19 6l1.5 1.5L22 6"/></svg>';
}

function getDefectSummaryText(defect) {
    return defect.items?.length
        ? defect.items.map((item) => item.text).join('\n')
        : (defect.description || '');
}

function getDefectSummaryHtml(defect) {
    return escapeHtml(getDefectSummaryText(defect)).replace(/\n/g, '<br>');
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
        state.complexes = Array.isArray(complexes) ? complexes : [];
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
            
            const cardClass = 'complex-card';
            const address = c.address?.trim() || 'Адрес не указан';
            return `
                <div class="${cardClass}" onclick="showComplexDetail(${c.id})">
                    <div class="complex-card-body">
                        <div class="complex-card-name">${escapeHtml(c.name)}</div>
                        <div class="complex-card-info">${escapeHtml(address)}</div>
                    </div>
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
}

let buildingCount = 0;
let globalSectionCount = 0;

function addBuildingRow() {
    buildingCount++;
    const container = document.getElementById('buildingsContainer');
    if (!container) return;
    
    const buildingId = Date.now() + buildingCount;
    const row = document.createElement('div');
    row.className = 'building-row';
    row.dataset.buildingId = buildingId;
    row.dataset.buildingNum = buildingCount;
    row.innerHTML = `
        <div class="building-header">
            <span class="building-num">Корпус ${buildingCount}</span>
            <button type="button" class="btn-remove-row" onclick="removeBuildingRow(this)">× Удалить</button>
        </div>
        <div class="sections-container">
        </div>
        <button type="button" class="btn btn-secondary btn-sm add-section-btn" onclick="addSectionRow(${buildingId}, ${buildingCount})">+ Добавить секцию</button>
    `;
    container.appendChild(row);
    // Auto-add first section
    addSectionRow(buildingId, buildingCount);
}

function addSectionRow(buildingId, buildingNum) {
    const buildingRow = document.querySelector(`[data-building-id="${buildingId}"]`);
    if (!buildingRow) return;
    
    const sectionsContainer = buildingRow.querySelector('.sections-container');
    if (!sectionsContainer) return;
    
    globalSectionCount++;
    const sectionNum = globalSectionCount;
    
    const sectionId = Date.now() + globalSectionCount;
    const sectionRow = document.createElement('div');
    sectionRow.className = 'section-row';
    sectionRow.dataset.sectionId = sectionId;
    sectionRow.dataset.sectionNum = sectionNum;
    sectionRow.innerHTML = `
        <div class="section-header">
            <span class="sec-num">Секция ${sectionNum}</span>
            <button type="button" class="btn-remove-row" onclick="removeSectionRow(this)">×</button>
        </div>
        <div class="section-settings">
            <div class="section-settings-row">
                <div class="setting-item">
                    <label>Всего этажей</label>
                    <input type="number" class="total-floors" value="1" min="1">
                </div>
                <div class="setting-item">
                    <label>Квартир на этаже</label>
                    <input type="number" class="apts-per-floor" value="4" min="1">
                </div>
                <div class="setting-item">
                    <label>Начальный номер</label>
                    <input type="number" class="start-apt" value="1" min="1">
                </div>
            </div>
            <div class="exceptions-section" id="exceptions-${sectionId}">
                <div class="exceptions-header">
                    <span>Исключения (если есть)</span>
                    <button type="button" class="btn-link btn-sm" onclick="addException('${sectionId}')">+ Добавить исключение</button>
                </div>
                <div class="exceptions-list" id="exceptions-list-${sectionId}"></div>
            </div>
            <button type="button" class="btn btn-primary btn-sm generate-btn" onclick="generateFloors('${sectionId}')">Сгенерировать этажи</button>
        </div>
        <div class="floors-container" id="floors-${sectionId}">
        </div>
    `;
    sectionsContainer.appendChild(sectionRow);
}

function addException(sectionId) {
    const exceptionsList = document.getElementById(`exceptions-list-${sectionId}`);
    if (!exceptionsList) return;
    
    const exceptionRow = document.createElement('div');
    exceptionRow.className = 'exception-row';
    exceptionRow.innerHTML = `
        <input type="number" placeholder="Этаж" class="exc-floor" min="1">
        <input type="number" placeholder="Кол-во кв." class="exc-count" min="1">
        <button type="button" class="btn-remove-row" onclick="this.parentElement.remove()">×</button>
    `;
    exceptionsList.appendChild(exceptionRow);
}

function generateFloors(sectionId) {
    const sectionRow = document.querySelector(`[data-section-id="${sectionId}"]`);
    if (!sectionRow) return;
    
    const totalFloors = parseInt(sectionRow.querySelector('.total-floors')?.value) || 1;
    const aptsPerFloor = parseInt(sectionRow.querySelector('.apts-per-floor')?.value) || 4;
    const startApt = parseInt(sectionRow.querySelector('.start-apt')?.value) || 1;
    
    // Collect exceptions (including count=0 for skipping floors)
    const exceptions = {};
    sectionRow.querySelectorAll('.exception-row').forEach(row => {
        const floor = parseInt(row.querySelector('.exc-floor')?.value);
        const count = parseInt(row.querySelector('.exc-count')?.value);
        if (floor) {
            exceptions[floor] = count || 0;
        }
    });
    
    const floorsContainer = document.getElementById(`floors-${sectionId}`);
    if (!floorsContainer) return;
    
    floorsContainer.innerHTML = '';
    
    let currentApt = startApt;
    let generatedCount = 0;
    
    for (let i = 1; i <= totalFloors; i++) {
        const count = i in exceptions ? exceptions[i] : aptsPerFloor;
        
        // Skip floor if count is 0
        if (count === 0) {
            continue;
        }
        
        const floorFrom = currentApt;
        const floorTo = currentApt + count - 1;
        
        const floorRow = document.createElement('div');
        floorRow.className = 'floor-row-input';
        floorRow.innerHTML = `
            <input type="hidden" class="floor-num" value="${i}">
            <input type="hidden" class="floor-from" value="${floorFrom}">
            <input type="hidden" class="floor-to" value="${floorTo}">
            <span class="floor-label">Этаж ${i}</span>
            <span class="floor-info">кв. ${floorFrom} - ${floorTo}</span>
            <button type="button" class="btn-remove-row" onclick="this.parentElement.remove()">×</button>
        `;
        floorsContainer.appendChild(floorRow);
        
        currentApt = floorTo + 1;
        generatedCount++;
    }
    
    showToast(`Сгенерировано ${generatedCount} этажей`, 'success');
}

function removeSectionRow(btn) {
    const row = btn.closest('.section-row');
    if (row) row.remove();
}

async function submitComplexForm() {
    const nameInput = document.getElementById('complexName');
    const name = nameInput?.value.trim();
    const addressInput = document.getElementById('complexAddress');
    const address = addressInput?.value.trim() || '';
    const typeInput = document.getElementById('complexType');
    const propertyType = typeInput?.value || 'квартиры';
    
    if (!name) {
        showToast('Введите название ЖК', 'warning');
        return;
    }
    
    const buildings = [];
    document.querySelectorAll('.building-row').forEach(buildingRow => {
        const buildingNum = buildingRow.dataset.buildingNum;
        
        if (!buildingNum) return;
        
        const sections = [];
        buildingRow.querySelectorAll('.section-row').forEach(row => {
            const secNum = row.dataset.sectionNum;
            
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
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('address', address);
    formData.append('property_type', propertyType);
    formData.append('commissioning_date', commissioningDate);
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
            showToast('Комплекс создан', 'success');
            goHome();
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
        
        setPageTitle(complex.name, complex.address || '');
        
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
                        const sectionLabel = hasMultipleBuildings
                            ? `Корпус ${s.building_number || 1} • Секция ${s.section_number}`
                            : `Секция ${s.section_number}`;

                        return `
                            <div class="filter-item" data-section="${s.id}" data-label="${sectionLabel}" onclick="toggleSectionFilter(${s.id})">
                                <span>${sectionLabel}</span>
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
        updateHeader(true, false);
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
    const button = document.getElementById('filterBtn');
    const willOpen = dropdown && !dropdown.classList.contains('open');
    if (dropdown && willOpen && button) {
        if (wrapper) wrapper.classList.add('active');
        positionDropdown(dropdown, button);
        requestAnimationFrame(() => dropdown.classList.add('open'));
    } else {
        if (dropdown) dropdown.classList.remove('open');
        if (wrapper) wrapper.classList.remove('active');
    }
    
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
    const button = document.getElementById('categoryFilterBtn');
    const willOpen = dropdown && !dropdown.classList.contains('open');
    if (dropdown && willOpen && button) {
        if (wrapper) wrapper.classList.add('active');
        positionDropdown(dropdown, button);
        requestAnimationFrame(() => dropdown.classList.add('open'));
    } else {
        if (dropdown) dropdown.classList.remove('open');
        if (wrapper) wrapper.classList.remove('active');
    }
    
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

function positionDropdown(dropdown, button) {
    const rect = button.getBoundingClientRect();
    const viewportPadding = 8;
    const dropdownWidth = Math.max(rect.width, 180);
    const maxLeft = window.innerWidth - dropdownWidth - viewportPadding;
    const left = Math.min(Math.max(rect.left, viewportPadding), Math.max(viewportPadding, maxLeft));

    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.minWidth = `${Math.max(rect.width, 160)}px`;
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
        const selectedSection = selectedItems[0].dataset.label || selectedItems[0].textContent.trim();
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
        if (!res.ok) {
            throw new Error(`apartments request failed: ${res.status}`);
        }
        let apts = await res.json();
        console.log('Loaded apartments:', apts.length);
        
        // Fetch defects for category-based badge counts and filtering
        const catFilter = document.getElementById('defectCategoryFilter')?.value;
        const statusFilter = document.getElementById('defectStatusFilter')?.value;
        try {
            const defectsRes = await fetch(`/api/complexes/${state.currentComplex}/defects`);
            if (!defectsRes.ok) {
                throw new Error(`defects request failed: ${defectsRes.status}`);
            }
            state.currentDefects = await defectsRes.json();
        } catch (defectsErr) {
            console.error('Defects loading failed:', defectsErr);
            state.currentDefects = [];
        }
        
        // Filter apartments by defects if category filter is active
        if (catFilter || statusFilter) {
            const filteredIds = new Set();
            
            state.currentDefects.forEach(d => {
                if (catFilter && d.category !== catFilter) return;
                if (statusFilter === 'recorded' && d.status !== 'recorded') return;
                if (statusFilter === 'in_progress' && !['in_progress', 'rework'].includes(d.status)) return;
                if (statusFilter === 'on_review' && d.status !== 'on_review') return;
                if (statusFilter === 'completed' && !isClosedDefectStatus(d.status)) return;
                filteredIds.add(d.apartment_id);
            });
            apts = apts.filter(a => filteredIds.has(a.id));
        }
        
        if (elements.defectFilterPanel) {
            elements.defectFilterPanel.style.display = state.defectsOnly ? 'flex' : 'none';
        }

        if (state.defectsOnly) {
            apts = apts.filter(countsAsDefectApartment);
        }

        if (state.accessFilter) {
            apts = apts.filter(a => {
                if (state.accessFilter === 'on_review') {
                    return Number(a.on_review_defects_count || 0) > 0;
                }
                if (state.accessFilter === 'owner_accepted') {
                    return isAcceptedApartment(a);
                }
                if (state.accessFilter === 'no_access') {
                    return isNoAccessApartment(a);
                }
                return a.access_status === state.accessFilter;
            });
        }
        
        if (searchNumbers) {
            apts = apts.filter(a => searchNumbers.includes(a.number));
        }
        
        // Update subtitle with displayed count
        const propName = state.currentPropertyType === 'апартаменты' ? 'апартаментов' : 'квартир';
        const pageSubtitle = document.getElementById('pageSubtitle');
        if (pageSubtitle) {
            pageSubtitle.textContent = `${apts.length} ${propName}`;
        }

        state.filteredApartments = Array.isArray(apts) ? [...apts] : [];
        
        renderApartments(apts);
    } catch (err) {
        console.error('Apartments loading failed:', err);
        state.filteredApartments = [];
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
    if (filter === 'defects') {
        state.defectsOnly = !state.defectsOnly;
        updateDesktopFilterButtons();
        updateMobileFilterIndicator();
        updateMobileFilterButtons();
        if (elements.defectFilterPanel) {
            elements.defectFilterPanel.style.display = state.defectsOnly ? 'flex' : 'none';
        }
        loadApartments();
        return;
    }

    const currentFilter = state.accessFilter;
    let nextFilter = filter;
    
    if (currentFilter === filter) {
        nextFilter = '';
        state.accessFilter = '';
    } else {
        state.accessFilter = filter;
    }

    const filterChanged = currentFilter !== nextFilter;
    updateDesktopFilterButtons();
    
    // Update mobile filter indicator and buttons
    updateMobileFilterIndicator();
    updateMobileFilterButtons();
    const mobileStatusFilter = document.getElementById('mobileStatusFilter');
    if (mobileStatusFilter) mobileStatusFilter.value = state.accessFilter;
    
    // Update current filter index for swipe
    const index = FILTERS.indexOf(state.accessFilter);
    if (index >= 0) currentFilterIndex = index;
    
    if (elements.defectFilterPanel) {
        elements.defectFilterPanel.style.display = state.defectsOnly ? 'flex' : 'none';
    }
    
    // Only reload if filter actually changed
    if (filterChanged) {
        loadApartments();
    }
}

function updateDesktopFilterButtons() {
    document.querySelectorAll('.pill[data-filter]').forEach((chip) => {
        if (chip.dataset.filter === 'defects') {
            chip.classList.toggle('active', state.defectsOnly);
            return;
        }
        chip.classList.toggle('active', chip.dataset.filter === state.accessFilter);
    });
}

function updateMobileFilterIndicator() {
    const indicator = document.getElementById('mobileFilterIndicator');
    if (indicator) {
        const parts = [];
        if (state.accessFilter) {
            const index = FILTERS.indexOf(state.accessFilter);
            parts.push(index >= 0 ? FILTER_NAMES[index] : state.accessFilter);
        }
        if (state.defectsOnly) parts.push('С замечаниями');
        const name = parts.join(' + ') || 'Все';
        indicator.textContent = name;
        indicator.classList.toggle('filter-active', Boolean(state.accessFilter || state.defectsOnly));
        // Add animation class
        indicator.classList.add('filter-changed');
        setTimeout(() => {
            indicator.classList.remove('filter-changed');
        }, 200);
    }
}

function updateMobileFilterButtons() {
    const buttons = document.querySelectorAll('.mobile-filter-btn');
    buttons.forEach(btn => {
        if (btn.dataset.filter === 'defects') {
            btn.classList.toggle('active', state.defectsOnly);
            return;
        }
        btn.classList.toggle('active', btn.dataset.filter === state.accessFilter);
    });
}

function debouncedLoad() {
    clearTimeout(window.loadTimer);
    window.loadTimer = setTimeout(loadApartments, 300);
}

function isAcceptedApartment(apartment) {
    return ACCEPTED_ACCESS_STATUSES.includes(apartment?.access_status);
}

function isNoAccessApartment(apartment) {
    return ['no_access', 'by_phone'].includes(apartment?.access_status);
}

function isClosedDefectStatus(status) {
    return CLOSED_DEFECT_STATUSES.includes(status);
}

function getDefectStatusLabel(status) {
    return DEFECT_STATUS_LABELS[status] || status;
}

function getDefectStatusBadgeClass(status) {
    return DEFECT_STATUS_CLASSES[status] || 'badge-recorded';
}

function getStoredCommentAuthor() {
    const storageKey = 'dubrovkaDefectsCommentAuthor';
    try {
        return localStorage.getItem(storageKey) || '';
    } catch (err) {
        return '';
    }
}

function getCurrentCommentAuthor(forcePrompt = false) {
    let author = getStoredCommentAuthor();

    if (!author || forcePrompt) {
        const entered = prompt('Введите ваше имя для комментариев:', author || '');
        if (!entered || !entered.trim()) return '';
        author = entered.trim();
        try {
            localStorage.setItem(storageKey, author);
        } catch (err) {
            // ignore storage errors
        }
    }

    return author;
}

function renderDefectStatusOptions(currentStatus) {
    return AVAILABLE_DEFECT_STATUSES.map((value) => `
        <option value="${value}" ${currentStatus === value ? 'selected' : ''}>${getDefectStatusLabel(value)}</option>
    `).join('');
}

function renderDefectStatusButtons(currentStatus, defectId) {
    return AVAILABLE_DEFECT_STATUSES.map((value) => `
        <button
            type="button"
            class="defect-status-option ${currentStatus === value ? 'active' : ''}"
            onclick="selectDefectStatus(${defectId}, '${value}')"
        >
            ${getDefectStatusLabel(value)}
        </button>
    `).join('');
}

function getDefectStatusBadgeElement(id) {
    return document.querySelector(
        `[data-defect-id="${id}"] .defect-status-badge, [data-defect-id="${id}"] .defect-compact-status`
    );
}

function applyDefectStatusUI(id, status) {
    const statusInput = document.getElementById(`defectStatus_${id}`);
    const badge = getDefectStatusBadgeElement(id);

    if (statusInput) statusInput.value = status;
    if (!badge) return;

    badge.className = badge.className.includes('defect-status-badge')
        ? `defect-status-badge ${getDefectStatusBadgeClass(status)}`
        : `defect-compact-status ${getDefectStatusBadgeClass(status)}`;
    badge.textContent = getDefectStatusLabel(status);
}

function syncDefectStatusState(id, status) {
    const defects = state.currentApartmentData?.defects;
    if (Array.isArray(defects)) {
        const defect = defects.find((item) => item.id === id);
        if (defect) defect.status = status;
    }

    if (Array.isArray(state.currentDefects)) {
        const defect = state.currentDefects.find((item) => item.id === id);
        if (defect) defect.status = status;
    }
}

function positionDefectStatusPopover() {
    const popover = document.getElementById('defectStatusPopover');
    if (!(popover instanceof HTMLElement)) return;

    const width = popover.offsetWidth || 220;
    const height = popover.offsetHeight || 0;
    const margin = 8;
    popover.style.left = `${Math.max((window.innerWidth - width) / 2, margin)}px`;
    popover.style.top = `${Math.max((window.innerHeight - height) / 2, margin)}px`;
}

function openDefectStatusModal(id, event) {
    if (event) event.stopPropagation();

    const modal = document.getElementById('defectStatusModal');
    const body = document.getElementById('defectStatusBody');
    const popover = document.getElementById('defectStatusPopover');
    const statusInput = document.getElementById(`defectStatus_${id}`);
    const currentStatus = statusInput?.value || DEFECT_STATUS_ORDER[0];
    state.currentStatusDefectId = id;
    if (body) {
        body.innerHTML = renderDefectStatusButtons(currentStatus, id);
    }
    if (modal) modal.classList.add('active');

    if (popover) {
        requestAnimationFrame(() => positionDefectStatusPopover());
    }
}

function closeDefectStatusModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('defectStatusModal');
    const popover = document.getElementById('defectStatusPopover');
    if (modal) modal.classList.remove('active');
    if (popover instanceof HTMLElement) {
        popover.style.left = '';
        popover.style.top = '';
    }
    state.currentStatusDefectId = null;
}

async function selectDefectStatus(id, status) {
    const statusInput = document.getElementById(`defectStatus_${id}`);
    const currentStatus = statusInput?.value || DEFECT_STATUS_ORDER[0];

    if (currentStatus === status) {
        closeDefectStatusModal();
        return;
    }

    applyDefectStatusUI(id, status);

    const ok = await updateDefectStatus(id, status);
    if (!ok) {
        applyDefectStatusUI(id, currentStatus);
        return;
    }

    syncDefectStatusState(id, status);
    closeDefectStatusModal();
    showToast('Статус обновлен', 'success');
}

async function cycleDefectStatus(id, event) {
    openDefectStatusModal(id, event);
}

function getApartmentWorkflowClass(apartment) {
    if (!apartment) return '';
    if (Number(apartment.on_review_defects_count || 0) > 0) return 'apt apt-ready_for_acceptance';
    if (Number(apartment.in_progress_defects_count || 0) > 0 || Number(apartment.rework_defects_count || 0) > 0) return 'apt apt-in_progress';
    if (Number(apartment.recorded_defects_count || 0) > 0) return 'apt apt-defects';
    return '';
}

function countsAsDefectApartment(apartment) {
    return !isAcceptedApartment(apartment) && Number(apartment?.active_defects_count || 0) > 0;
}

// Update stats panel with current filter/counts
function updateStatsPanel(apartments) {
    try {
        if (!elements.statAvailable) return;
        
        let available = 0, accepted = 0, call = 0, noAccess = 0, defects = 0;
        
        if (apartments) {
            apartments.forEach(a => {
                if (a.access_status === 'available') available++;
                else if (isAcceptedApartment(a)) accepted++;
                else if (a.access_status === 'call') call++;
                else if (isNoAccessApartment(a)) noAccess++;
                if (countsAsDefectApartment(a)) defects++;
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

function buildSectionSummary(apartments) {
    const total = apartments.length;
    const accepted = apartments.filter(isAcceptedApartment).length;
    const defects = apartments.filter(countsAsDefectApartment).length;
    const noAccess = apartments.filter(isNoAccessApartment).length;
    const overdue = apartments.filter(a => getDeadlineClass(a) === 'apt-deadline-passed').length;

    return [
        { label: 'Всего', value: total, tone: 'neutral' },
        { label: 'С замеч.', value: defects, tone: defects ? 'warning' : 'neutral' },
        { label: 'Принята', value: accepted, tone: accepted ? 'success' : 'neutral' },
        { label: 'Нет доступа', value: noAccess, tone: noAccess ? 'slate' : 'neutral' },
        { label: 'Просрочено', value: overdue, tone: overdue ? 'danger' : 'neutral' },
    ];
}

function getApartmentListEmptyState() {
    const search = document.getElementById('searchApt')?.value?.trim();
    const category = document.getElementById('defectCategoryFilter')?.value;
    const sectionItems = document.querySelectorAll('#filterOptions .filter-item.selected');
    const hasSectionFilter = sectionItems.length > 0;
    const filterName = FILTER_NAMES[FILTERS.indexOf(state.accessFilter)] || 'Все';

    if (search || category || state.accessFilter || hasSectionFilter) {
        return {
            title: 'Ничего не найдено',
            description: `Измени поиск или фильтры. Сейчас активен статус «${filterName}».`
        };
    }

    return {
        title: 'Квартиры не найдены',
        description: 'Для этого комплекса пока нет квартир в текущем диапазоне секций.'
    };
}

function formatApartmentBadgeCount(count) {
    return String(count);
}

function getApartmentBadgeCount(apartment, catFilter) {
    let badgeCount = apartment.active_defects_count || 0;
    if (catFilter && state.currentDefects.length) {
        badgeCount = state.currentDefects.filter(d => d.apartment_id === apartment.id && d.category === catFilter && !isClosedDefectStatus(d.status)).length;
    }
    return badgeCount;
}

function renderApartmentTile(apartment, propFull, catFilter) {
    const deadlineClass = getDeadlineClass(apartment);
    const cls = getApartmentClass(apartment.access_status, apartment.active_defects_count);
    const isAccepted = isAcceptedApartment(apartment);
    const badgeCount = getApartmentBadgeCount(apartment, catFilter);
    const badge = (badgeCount > 0 && !isAccepted) ? `<span class="apt-badge">${formatApartmentBadgeCount(badgeCount)}</span>` : '';
    const onReviewCount = Number(apartment.on_review_defects_count || 0);
    const reviewBadge = (onReviewCount > 0 && !isAccepted) ? `<span class="apt-badge apt-badge-review">${onReviewCount}</span>` : '';
    const phaseLabel = Number(apartment.on_review_defects_count || 0) > 0
        ? 'на проверке'
        : (Number(apartment.in_progress_defects_count || 0) > 0 || Number(apartment.rework_defects_count || 0) > 0)
            ? 'в работе'
            : Number(apartment.recorded_defects_count || 0) > 0
                ? 'зафиксировано'
                : '';
    const tooltip = `${propFull === 'апартамент' ? 'Апартамент' : 'Квартира'} ${apartment.number}${phaseLabel ? ` • ${phaseLabel}` : ''}`;

    return `
        <div class="apt-wrap">
            <div class="apt ${cls} ${deadlineClass}" 
                 data-id="${apartment.id}" 
                 title="${tooltip}"
                 onclick="showApartmentDetail(${apartment.id})">
                ${apartment.number}
                ${badge}
                ${reviewBadge}
            </div>
        </div>
    `;
}

function renderSectionCard(title, apartments, floors, propFull) {
    const sortedFloors = Object.keys(floors).sort((a, b) => b - a);
    const catFilter = document.getElementById('defectCategoryFilter')?.value;
    const sortedApartments = [...apartments].sort((a, b) => Number(a.number) - Number(b.number));

    if (window.innerWidth <= 768) {
        return `
            <section class="section-card section-card-mobile-flat">
                <div class="section-header">
                    <div class="section-heading section-heading-simple">
                        <span class="section-title">${title}</span>
                    </div>
                </div>
                <div class="section-body-container">
                    <div class="apt-sort-grid section-mobile-apt-grid">
                        ${sortedApartments.map(apartment => renderApartmentTile(apartment, propFull, catFilter)).join('')}
                    </div>
                </div>
            </section>
        `;
    }

    return `
        <section class="section-card">
            <div class="section-header">
                <div class="section-heading section-heading-simple">
                    <span class="section-title">${title}</span>
                </div>
            </div>
            <div class="section-body-container">
                <div class="section-body">
                    ${sortedFloors.map(floor => {
                        const floorApts = floors[floor].sort((a, b) => a.number - b.number);
                        return renderFloorRow(floorApts, floor, propFull);
                    }).join('')}
                </div>
            </div>
        </section>
    `;
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
    const propFull = propType === 'апартаменты' ? 'апартамент' : 'квартира';
    const catFilter = document.getElementById('defectCategoryFilter')?.value;
    
    if (!apartments?.length) {
        const emptyState = getApartmentListEmptyState();
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">#</div>
                <h3>${emptyState.title}</h3>
                <p>${emptyState.description}</p>
            </div>
        `;
        updateStatsPanel([]);
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
    const visibleApartments = apartments.filter(a => selectedSectionIds.length === 0 || (a.section_id && selectedSectionIds.includes(a.section_id)));

    const sortByDefectsBtn = document.getElementById('sortByDefectsBtn');
    if (sortByDefectsBtn) {
        sortByDefectsBtn.classList.toggle('active', state.sortByDefects);
    }

    if (state.sortByDefects) {
        const sortedBySection = {};

        visibleApartments
            .filter((apartment) => getApartmentBadgeCount(apartment, catFilter) > 0)
            .forEach((apartment) => {
            const sectionNumber = apartment.section_number || 0;
            if (!sortedBySection[sectionNumber]) {
                sortedBySection[sectionNumber] = [];
            }
            sortedBySection[sectionNumber].push(apartment);
        });

        const sortedSectionNumbers = Object.keys(sortedBySection)
            .map(Number)
            .sort((a, b) => a - b);

        if (!sortedSectionNumbers.length) {
            const emptyState = getApartmentListEmptyState();
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">#</div>
                    <h3>${emptyState.title}</h3>
                    <p>Для выбранных фильтров нет квартир с открытыми замечаниями.</p>
                </div>
            `;
            updateStatsPanel(apartments);
            return;
        }

        container.innerHTML = `
            <div class="sections-grid sections-grid-sorted">
                ${sortedSectionNumbers.map((sectionNumber) => {
                    const sectionApartments = sortedBySection[sectionNumber].sort((a, b) => {
                        const countA = getApartmentBadgeCount(a, catFilter);
                        const countB = getApartmentBadgeCount(b, catFilter);
                        if (countA !== countB) return countA - countB;
                        return Number(a.number) - Number(b.number);
                    });

                    return `
                        <section class="section-card section-card-sorted">
                            <div class="section-header">
                                <div class="section-heading section-heading-simple">
                                    <span class="section-title">Секция ${sectionNumber}</span>
                                </div>
                            </div>
                            <div class="section-body-container">
                                <div class="apt-sort-grid">
                                    ${sectionApartments.map(apartment => renderApartmentTile(apartment, propFull, catFilter)).join('')}
                                </div>
                            </div>
                        </section>
                    `;
                }).join('')}
            </div>
        `;
        updateStatsPanel(apartments);
        return;
    }
    
    // Check if we have multiple buildings from the data
    const uniqueBuildings = new Set(apartments.map(a => a.building_number || 1));
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
            
            const allApts = [];
            sortedSectionIds.forEach(secId => {
                allApts.push(...Object.values(sections[secId].floors).flat());
            });
            
            const title = `Корпус ${bnum}`;
            
            return `
                <section class="section-group">
                    <div class="section-group-header">
                        <div>
                            <div class="section-group-title">${title}</div>
                        </div>
                    </div>
                    <div class="section-group-grid">
                            ${sortedSectionIds.map(secId => {
                                const secData = sections[secId];
                                const secFloors = secData.floors;
                                const secApts = Object.values(secFloors).flat();
                                return renderSectionCard(`Секция ${secData.section_number}`, secApts, secFloors, propFull);
                            }).join('')}
                    </div>
                </section>
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
            
            const title = uniqueBuildings.size > 1 ? `Корпус ${buildingNum} • Секция ${sec}` : `Секция ${sec}`;

            return renderSectionCard(title, allApts, floors, propFull);
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
    return state.currentDefects.filter(d => d.apartment_id === aptId && d.category === catFilter && !isClosedDefectStatus(d.status)).length;
}

function renderFloorRow(floorApts, floor, propFull) {
    const catFilter = document.getElementById('defectCategoryFilter')?.value;
    
    return `
        <div class="floor-row">
            <div class="floor-label">${floor} эт</div>
            <div class="floor-apts">
                ${floorApts.map(a => renderApartmentTile(a, propFull, catFilter)).join('')}
            </div>
        </div>
    `;
}

function toggleApartmentSort() {
    state.sortByDefects = !state.sortByDefects;
    loadApartments();
}

// Get apartment CSS class based on status and defects
function getApartmentClass(status, defects) {
    // Принята - зелёная ячейка
    if (ACCEPTED_ACCESS_STATUSES.includes(status)) {
        return 'apt apt-owner_accepted';
    }
    // Вызов - фиолетовая ячейка
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
    setPageTitle('Загрузка...', '');
    showTab('apartment-detail');
    updateHeader(true, false);
    
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
            const propLabel = propType === 'апартаменты' ? 'Апартамент' : 'Квартира';
            showToast(`${propLabel} не найден(а)`, 'error');
            return;
        }
        
        state.currentApartmentData = { ...apt, defects };
        const propType = state.currentPropertyType;
        const propLabel = propType === 'апартаменты' ? 'Апартамент' : 'Квартира';
        
        const complexSections = state.currentComplexData?.sections || [];
        const hasMultipleBuildings = new Set(complexSections.map(s => s.building_number || 1)).size > 1;

        const aptSubtitle = hasMultipleBuildings
            ? `Корпус ${apt.building_number || 1} • Секция ${apt.section_number} • Этаж ${apt.floor}`
            : `Секция ${apt.section_number} • Этаж ${apt.floor}`;
        const active = defects.filter(d => !isClosedDefectStatus(d.status));
        const done = defects.filter(d => isClosedDefectStatus(d.status));
        setPageTitle(`${propLabel} ${apt.number}`, `${aptSubtitle} • Активных: ${active.length} • Закрытых: ${done.length}`);
        
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
        commentBlock.style.display = status === 'complex' ? 'block' : 'none';
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
                state.currentApartmentData.access_status = status;
                const newClass = getApartmentClass(status, state.currentApartmentData.active_defects_count || 0);
                apt.className = `apt ${newClass}`;
            }
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
    
    const commentInput = document.getElementById('complexCommentInput');
    const comment = commentInput?.value.trim();
    
    try {
        await fetch(`/api/apartments/${state.currentApartment}/access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `access_status=complex&access_comment=${encodeURIComponent(comment)}`
        });
        
        state.currentApartmentData.access_comment = comment;
        showToast('Комментарий сохранен', 'success');
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

// Defects
function getCategoryIcon(category) {
    const icons = {
        'Стены/Пол/Потолок': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 10h6"/><path d="M9 14h6"/></svg>',
        'Окна': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16"/><path d="M4 12h16"/></svg>',
        'Двери': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V5a2 2 0 0 1 2-2h8v18"/><path d="M10 12h.01"/></svg>',
        'Сантехника': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h7a4 4 0 0 1 4 4v1H9"/><path d="M9 9v4a3 3 0 0 0 6 0V9"/><path d="M5 9h14"/></svg>',
        'Электрика': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 6 14h5l-1 8 7-12h-5z"/></svg>',
        'Отопление': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10a4 4 0 1 0 8 0V3"/><path d="M12 3v12"/></svg>',
        'Вентиляция': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h7"/><path d="M13 12h7"/><path d="M12 4v7"/><path d="M12 13v7"/><circle cx="12" cy="12" r="2"/></svg>',
        'Балкон/Лоджия': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M6 20V9h12v11"/><path d="M9 9V5h6v4"/></svg>',
        'Другое': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 5.8 1c-.4 1.2-1.9 1.8-2.4 2.5-.3.4-.4.8-.4 1.5"/><path d="M12 17h.01"/></svg>'
    };

    return icons[category] || icons['Другое'];
}

function getCategoryKey(category) {
    return String(category || '').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function isImageFilename(filename) {
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(String(filename || ''));
}

function isVideoFilename(filename) {
    return /\.(mp4|mov|webm)$/i.test(String(filename || ''));
}

function renderDefectMedia(photos) {
    if (!photos?.length) return '';

    const imageUrls = photos
        .filter(photo => !isVideoFilename(photo.filename))
        .map(photo => `/uploads/${encodeURIComponent(photo.filename)}`);
    let imageIndex = -1;

    return `
        <div class="defect-media-grid">
            ${photos.map(photo => {
                const url = `/uploads/${encodeURIComponent(photo.filename)}`;
                if (isVideoFilename(photo.filename)) {
                    return `
                        <a class="defect-media-card" href="${url}" target="_blank" rel="noopener noreferrer">
                            <video class="defect-media-thumb" src="${url}" preload="metadata" muted playsinline></video>
                        </a>
                    `;
                }

                imageIndex += 1;

                return `
                    <button type="button" class="defect-media-card" onclick='openDefectPhoto(${JSON.stringify(imageUrls)}, ${imageIndex})'>
                        <img class="defect-media-thumb" src="${url}" alt="Фото замечания">
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

function markDefectRowDirty(row) {
    row.classList.add('is-dirty');
}

function markDefectRowClean(row) {
    row.classList.remove('is-dirty');
}

function scheduleDefectAutosave(row) {
    const defectId = row?.dataset?.defectId;
    if (!defectId) return;

    const prevTimer = defectAutosaveTimers.get(defectId);
    if (prevTimer) clearTimeout(prevTimer);

    const timer = setTimeout(() => {
        defectAutosaveTimers.delete(defectId);
        saveDefectMeta(defectId, { silentSuccess: true });
    }, 700);

    defectAutosaveTimers.set(defectId, timer);
}

function renderDefectCard(d, index) {
    const summaryText = escapeHtml(getDefectSummaryText(d));
    const fixedAt = formatDate(d.created_at);
    const windowNumber = d.window_number ?? '';
    const mediaHtml = renderDefectMedia(d.photos);
    const statusLabel = getDefectStatusLabel(d.status);
    const statusBadgeClass = getDefectStatusBadgeClass(d.status);
    const windowChipText = getWindowChipText(windowNumber) || 'Без окна';
    const commentsCount = Number(d.comments_count || 0);

    return `
        <div class="defect-row defect-row-card" data-defect-id="${d.id}" style="animation: slideIn 0.25s ease ${index * 0.03}s both;">
            <div class="defect-card-header">
                <div class="defect-card-header-meta">
                    <span class="defect-date">${fixedAt || 'Без даты'}</span>
                    <span class="defect-window">${windowChipText}</span>
                </div>
                <button type="button" class="defect-status-badge ${statusBadgeClass}" onclick="cycleDefectStatus(${d.id}, event)">${statusLabel}</button>
                <span class="defect-card-header-spacer" aria-hidden="true"></span>
            </div>
            <div class="defect-card-body">
                <textarea id="defectDescription_${d.id}" class="input defect-textarea" placeholder="Опишите замечание" rows="2">${summaryText}</textarea>
                ${mediaHtml}
            </div>
            <div class="defect-card-footer">
                <select id="defectContractor_${d.id}" class="select defect-contractor-select">
                    <option value="">Исполнитель</option>
                    ${renderContractorOptions(d.contractor_id || '')}
                </select>
                <div class="defect-comment-wrap">
                    <textarea id="defectCommentText_${d.id}" class="input defect-comment-input" placeholder="Комментарий" rows="1">${escapeHtml(d.comment_text || '')}</textarea>
                    ${commentsCount ? `<button type="button" class="btn btn-xs btn-secondary" onclick="showDefectComments(${d.id})">💬 ${commentsCount}</button>` : ''}
                </div>
            </div>
            <input type="hidden" id="defectStatus_${d.id}" value="${escapeHtml(d.status)}">
        </div>
    `;
}

function renderDefects(defects) {
    const container = elements.defectsList;
    if (!container) return;
    
    if (!defects.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Нет замечаний</h3>
                <button class="btn btn-sm btn-primary" onclick="showAddDefectForm()">Добавить замечание</button>
            </div>
        `;
        return;
    }
    
    const grouped = defects.reduce((acc, defect) => {
        if (!acc[defect.category]) acc[defect.category] = [];
        acc[defect.category].push(defect);
        return acc;
    }, {});

    const orderedCategories = state.categories.filter(category => grouped[category]?.length);
    const extraCategories = Object.keys(grouped).filter(category => !orderedCategories.includes(category));
    const categories = [...orderedCategories, ...extraCategories];

    container.innerHTML = `
        <div class="defect-categories-grid">
            ${categories.map(category => {
                const categoryDefects = grouped[category] || [];
                const count = categoryDefects.length;
                const openCount = categoryDefects.filter(d => !['accepted', 'cancelled'].includes(d.status)).length;
                return `
                    <div class="defect-category-card" onclick="toggleCategoryDefects('${escapeHtml(category)}')">
                        <div class="defect-category-icon">${getCategoryIcon(category)}</div>
                        <div class="defect-category-name">${escapeHtml(category)}</div>
                        <div class="defect-category-count">
                            <span class="count-total">${count}</span>
                            ${openCount > 0 ? `<span class="count-open">${openCount}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="defects-by-category">
            ${categories.map((category, idx) => {
                const categoryDefects = grouped[category] || [];
                const contractorNames = [...new Set(
                    categoryDefects
                        .map(defect => String(defect.contractor_name || '').trim())
                        .filter(Boolean)
                )];
                const sortedDefects = category === 'Окна' 
                    ? [...categoryDefects].sort((a, b) => Number(a.window_number ?? 0) - Number(b.window_number ?? 0))
                    : categoryDefects;
                return `
                    <div class="defect-category-section expanded" id="defect-section-${idx}" data-category="${escapeHtml(category)}">
                        <div class="defect-section-header">
                            <span class="defects-category-label">${getCategoryIcon(category)} ${escapeHtml(category)}</span>
                            ${contractorNames.length ? `<span class="defect-section-contractors">${escapeHtml(contractorNames.join(', '))}</span>` : ''}
                        </div>
                        <div class="defects-list">
                            ${sortedDefects.map((defect, defectIndex) => renderDefectCompactRow(defect, `${category}-${defectIndex}`)).join('')}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function toggleCategoryDefects(category) {
    const section = document.querySelector(`.defect-category-section[data-category="${category}"]`);
    if (section) {
        section.classList.toggle('expanded');
    }
}

function renderDefectCompactRow(d, index) {
    const summaryHtml = getDefectSummaryHtml(d);
    const fixedAt = formatDate(d.created_at);
    const windowNumber = d.window_number ?? '';
    const statusLabel = getDefectStatusLabel(d.status);
    const statusBadgeClass = getDefectStatusBadgeClass(d.status);

    const isWindowCategory = d.category === 'Окна';
    const isDoorCategory = d.category === 'Двери';
    const windowChipText = isWindowCategory ? getWindowChipText(windowNumber) : '';
    const doorVariant = isDoorCategory ? String(d.variant_number || '').trim() : '';
    const doorChipText = getDoorVariantLabel(doorVariant);
    const isRestoration = d.restoration === 1;

    const contractorName = d.contractor_name || '—';
    const executorName = d.executor || '';

    const allPhotos = d.photos || [];
    const beforePhotos = allPhotos.filter(p => !p.photo_type || p.photo_type === 'before');
    const afterPhotos = allPhotos.filter(p => p.photo_type === 'after');
    const hasBeforePhotos = beforePhotos.length > 0;
    const hasAfterPhotos = afterPhotos.length > 0;

    const renderPhotos = (photos, label) => {
        if (!photos.length) return '';
        return `
            <div class="defect-photos-row">
                <span class="defect-photos-label">${label}</span>
                <div class="defect-photos-grid">
                    ${photos.map(photo => `
                        <img class="defect-photo-thumb" src="/uploads/${encodeURIComponent(photo.filename)}" 
                             onclick="showPhoto('/uploads/${encodeURIComponent(photo.filename)}')" 
                             alt="Фото">
                    `).join('')}
                </div>
            </div>
        `;
    };

    return `
        <div class="defect-compact-row" data-defect-id="${d.id}" data-restoration="${isRestoration ? 1 : 0}">
            <div class="defect-compact-main">
                ${isDefectEditable(d) ? `<span class="defect-edit-btn" onclick="event.stopPropagation(); showDefectActionsForId(${d.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>` : ''}
                ${isWindowCategory ? `<span class="defect-icon-chip defect-restoration-toggle" onclick="toggleDefectRestoration(${d.id}, event)">${windowChipText}</span>` : ''}
                ${isDoorCategory && doorChipText ? `<span class="defect-icon-chip defect-restoration-toggle" onclick="toggleDefectRestoration(${d.id}, event)">${escapeHtml(doorChipText)}</span>` : ''}
                ${isRestoration ? `<span class="defect-restoration-badge">Р</span>` : ''}
                <span class="defect-compact-date">${fixedAt || '—'}</span>
                <span class="defect-compact-desc">${summaryHtml}</span>
                ${executorName ? `<span class="defect-compact-executor"><span class="defect-compact-executor-icon">${getExecutorIcon()}</span>${escapeHtml(executorName)}</span>` : ''}
                ${hasBeforePhotos ? `<span class="defect-photos-toggle" onclick="toggleDefectPhotos('before', ${d.id}, event)">📷 До (${beforePhotos.length})</span>` : ''}
                ${hasAfterPhotos ? `<span class="defect-photos-toggle" onclick="toggleDefectPhotos('after', ${d.id}, event)">📷 После (${afterPhotos.length})</span>` : ''}
                <span class="defect-compact-status ${statusBadgeClass}" onclick="cycleDefectStatus(${d.id}, event)">${statusLabel}</span>
            </div>
            <input type="hidden" id="defectStatus_${d.id}" value="${escapeHtml(d.status)}">
            <div class="defect-photos-container" id="photos-before-${d.id}" style="display:none;">
                ${renderPhotos(beforePhotos, 'До')}
            </div>
            <div class="defect-photos-container" id="photos-after-${d.id}" style="display:none;">
                ${renderPhotos(afterPhotos, 'После')}
            </div>
        </div>
    `;
}

async function toggleDefectRestoration(id, event) {
    event.stopPropagation();
    const row = event.currentTarget?.closest('.defect-compact-row');
    if (!row) return;

    const current = Number(row.dataset.restoration || 0);
    const next = current ? 0 : 1;

    try {
        await fetch(`/api/defects/${id}/restoration`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `restoration=${next}`
        });

        row.dataset.restoration = String(next);
        const existingBadge = row.querySelector('.defect-restoration-badge');
        if (next) {
            if (!existingBadge) {
                const dateNode = row.querySelector('.defect-compact-date');
                if (dateNode) {
                    dateNode.insertAdjacentHTML('beforebegin', '<span class="defect-restoration-badge">Р</span>');
                }
            }
        } else if (existingBadge) {
            existingBadge.remove();
        }

        const defect = state.currentApartmentData?.defects?.find(item => item.id === id);
        if (defect) defect.restoration = next;
        showToast(next ? 'Отмечена реставрация' : 'Реставрация снята', 'success');
    } catch (err) {
        showToast('Ошибка обновления', 'error');
    }
}

function toggleDefectPhotos(type, id, event) {
    event.stopPropagation();
    const container = document.getElementById(`photos-${type}-${id}`);
    if (container) {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    }
}

function renderDefectRow(d, index) {
    const summaryText = escapeHtml(getDefectSummaryText(d));
    const fixedAt = formatDate(d.created_at);
    const windowNumber = d.window_number ?? '';
    const statusLabel = getDefectStatusLabel(d.status);
    const statusBadgeClass = getDefectStatusBadgeClass(d.status);
    const windowChipText = getWindowChipText(windowNumber) || '—';

    return `
        <tr class="defect-row" data-defect-id="${d.id}">
            <td class="defect-cell-date">${fixedAt || '—'}</td>
            <td class="defect-cell-window">${windowChipText}</td>
            <td class="defect-cell-desc">
                <textarea id="defectDescription_${d.id}" class="table-input" placeholder="Замечание" rows="1">${summaryText}</textarea>
            </td>
            <td class="defect-cell-contractor">
                <select id="defectContractor_${d.id}" class="table-input">
                    <option value="">—</option>
                    ${renderContractorOptions(d.contractor_id || '')}
                </select>
            </td>
            <td class="defect-cell-comment">
                <input type="text" id="defectCommentText_${d.id}" class="table-input" placeholder="Комментарий" value="${escapeHtml(d.comment_text || '')}">
            </td>
            <td class="defect-cell-status">
                <button type="button" class="defect-status-badge ${statusBadgeClass}" onclick="cycleDefectStatus(${d.id}, event)">${statusLabel}</button>
            </td>
            <input type="hidden" id="defectStatus_${d.id}" value="${escapeHtml(d.status)}">
        </tr>
    `;
}

async function updateDefectStatus(id, status) {
    try {
        const response = await fetch(`/api/defects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `status=${status}`
        });

        if (!response.ok) {
            let message = 'Ошибка обновления';
            try {
                const payload = await response.json();
                if (payload?.detail) message = payload.detail;
            } catch (err) {
                // ignore invalid json
            }
            throw new Error(message);
        }

        return true;
    } catch (err) {
        showToast(err.message || 'Ошибка обновления', 'error');
        return false;
    }
}

async function updateDefectStatusLegacy(id, status) {
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

async function saveDefectMeta(id, options = {}) {
    const { silentSuccess = false } = options;
    const contractorField = document.getElementById(`defectContractor_${id}`);
    const contractorId = contractorField ? contractorField.value : null;
    const description = document.getElementById(`defectDescription_${id}`)?.value.trim() || '';
    const commentText = document.getElementById(`defectCommentText_${id}`)?.value.trim() || '';
    const status = document.getElementById(`defectStatus_${id}`)?.value || '';

    try {
        if (status) {
            await fetch(`/api/defects/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `status=${encodeURIComponent(status)}`
            });
        }
        const metaBody = `contractor_id=${encodeURIComponent(contractorId || '')}&comment_text=${encodeURIComponent(commentText)}&description=${encodeURIComponent(description)}`;
        await fetch(`/api/defects/${id}/meta`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: metaBody
        });
        const row = document.querySelector(`.defect-row[data-defect-id="${id}"]`);
        if (row) markDefectRowClean(row);
        if (!silentSuccess) showToast('Сохранено', 'success');
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

// Items
async function updateItemStatus(id, status) {
    try {
        await fetch(`/api/defects/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `status=${status}`
        });
        showToast('Сохранено', 'success');
        showApartmentDetail(state.currentApartment);
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
            await fetch(`/api/defects/items/${id}/text`, {
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
        await fetch(`/api/defects/items/${id}`, { method: 'DELETE' });
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
        const res = await fetch(`/api/defects/items/${itemId}/comments`);
        const comments = await res.json();
        
        const commentsBody = document.getElementById('commentsBody');
        if (commentsBody) {
            commentsBody.innerHTML = comments.map(c => `
                <div class="comment-item">
                    <div class="comment-author">
                        ${escapeHtml(c.author)} 
                        <span class="comment-date">${formatDateTime(c.created_at)}</span>
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
        await fetch(`/api/defects/items/${state.currentItemId}/comments`, {
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

function canEditDefectComment(comment) {
    const currentAuthor = getStoredCommentAuthor();
    return Boolean(currentAuthor) && currentAuthor === String(comment?.author || '').trim();
}

function updateDefectCommentsButton(defectId, count) {
    const button = document.querySelector(`[data-defect-comments-btn="${defectId}"]`);
    if (button) {
        button.textContent = `Диалог${count ? ` (${count})` : ''}`;
    }
}

function renderDefectComments() {
    const commentsBody = document.getElementById('defectCommentsBody');
    if (!commentsBody) return;

    const comments = state.currentDefectComments || [];
    commentsBody.innerHTML = comments.map(comment => {
        const isEditing = state.editingDefectCommentId === comment.id;
        const canEdit = canEditDefectComment(comment);

        if (isEditing) {
            return `
                <div class="comment-item defect-comment-item is-editing">
                    <div class="comment-author">${escapeHtml(comment.author)} <span class="comment-date">${formatDateTime(comment.created_at)}</span></div>
                    <textarea id="editDefectComment_${comment.id}" class="input defect-comment-edit-input" rows="3">${escapeHtml(comment.text)}</textarea>
                    <div class="comment-actions">
                        <button class="btn btn-primary btn-sm" onclick="saveEditedDefectComment(${comment.id})">Сохранить</button>
                        <button class="btn btn-sm" onclick="cancelEditDefectComment()">Отмена</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="comment-item defect-comment-item">
                <div class="comment-head-row">
                    <div class="comment-author">${escapeHtml(comment.author)} <span class="comment-date">${formatDateTime(comment.created_at)}</span></div>
                    ${canEdit ? `<button class="btn btn-sm btn-secondary btn-compact" onclick="startEditDefectComment(${comment.id})">Редактировать</button>` : ''}
                </div>
                <div class="comment-text">${escapeHtml(comment.text)}</div>
            </div>
        `;
    }).join('') || '<p class="empty-comments">Комментариев пока нет</p>';
}

async function loadDefectComments(defectId) {
    try {
        const res = await fetch(`/api/defects/${defectId}/comments`);
        const comments = await res.json();
        state.currentDefectComments = comments;
        renderDefectComments();
        updateDefectCommentsButton(defectId, comments.length);
    } catch (err) {
        showToast('Ошибка загрузки комментариев', 'error');
    }
}

function showDefectComments(defectId) {
    state.currentDefectCommentId = defectId;
    state.editingDefectCommentId = null;
    const modal = document.getElementById('defectCommentsModal');
    if (modal) modal.classList.add('active');
    loadDefectComments(defectId);
}

async function submitDefectComment() {
    const defectId = state.currentDefectCommentId;
    const input = document.getElementById('defectCommentInput');
    const text = input?.value.trim();
    const author = getCurrentCommentAuthor(true);

    if (!defectId || !text) return;
    if (!author) {
        showToast('Нужно указать имя автора', 'warning');
        return;
    }

    try {
        await fetch(`/api/defects/${defectId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `text=${encodeURIComponent(text)}&author=${encodeURIComponent(author)}`
        });

        if (input) input.value = '';
        await loadDefectComments(defectId);
    } catch (err) {
        showToast('Ошибка сохранения комментария', 'error');
    }
}

function startEditDefectComment(commentId) {
    state.editingDefectCommentId = commentId;
    renderDefectComments();
}

function cancelEditDefectComment() {
    state.editingDefectCommentId = null;
    renderDefectComments();
}

async function saveEditedDefectComment(commentId) {
    const author = getCurrentCommentAuthor(true);
    const input = document.getElementById(`editDefectComment_${commentId}`);
    const text = input?.value.trim();

    if (!author || !text) return;

    try {
        const res = await fetch(`/api/comments/${commentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `text=${encodeURIComponent(text)}&author=${encodeURIComponent(author)}`
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            showToast(error.detail || 'Ошибка сохранения комментария', 'error');
            return;
        }

        state.editingDefectCommentId = null;
        await loadDefectComments(state.currentDefectCommentId);
    } catch (err) {
        showToast('Ошибка сохранения комментария', 'error');
    }
}

function closeDefectComments() {
    const modal = document.getElementById('defectCommentsModal');
    if (modal) modal.classList.remove('active');
    state.currentDefectCommentId = null;
    state.currentDefectComments = [];
    state.editingDefectCommentId = null;
}

// Add Defect Modal
function showAddDefectForm(prefillCategory = '') {
    const modal = document.getElementById('defectModal');
    const form = document.getElementById('addDefectForm');
    if (form) form.reset();
    resetSelectedDefectPhotos();
    
    const previewGrid = document.getElementById('previewGridBefore');
    if (previewGrid) previewGrid.innerHTML = '';

    const categoryInput = document.getElementById('defectCategory');
    if (categoryInput) {
        categoryInput.value = prefillCategory || '';
        categoryInput.disabled = false;
        handleCategoryChange();
    }
    
    const windowSelect = document.getElementById('windowNumber');
    if (windowSelect) windowSelect.disabled = false;
    
    document.getElementById('defectModalTitle').textContent = 'Новое замечание';
    
    if (modal) {
        modal.classList.add('active');
    }
}

function closeDefectModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('defectModal');
    if (modal) modal.classList.remove('active');
    currentEditingDefectId = null;
    resetSelectedDefectPhotos();
}

function isDefectEditable(defect) {
    if (!defect.created_at) return false;
    const created = new Date(defect.created_at);
    const now = new Date();
    const diffMs = now - created;
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours <= 24;
}

function showDefectActions(defect) {
    if (!isDefectEditable(defect)) return;
    
    const modal = document.getElementById('defectActionsModal');
    const body = document.getElementById('defectActionsBody');
    
    body.innerHTML = `
        <p>Замечание создано ${formatDateTime(defect.created_at)}</p>
        <p style="color: var(--text-secondary); font-size: 13px;">Редактирование доступно в течение 24 часов</p>
        <div style="display: flex; gap: 10px; margin-top: 16px;">
            <button class="btn btn-primary" onclick="editDefect(${defect.id})">Редактировать</button>
            <button class="btn btn-danger" onclick="deleteDefect(${defect.id})">Удалить</button>
        </div>
    `;
    
    if (modal) modal.classList.add('active');
}

async function showDefectActionsForId(id) {
    try {
        const res = await fetch(`/api/defects/${id}`);
        if (!res.ok) {
            showToast('Ошибка загрузки', 'error');
            return;
        }
        const defect = await res.json();
        if (!isDefectEditable(defect)) {
            showToast('Редактирование недоступно', 'warning');
            return;
        }
        showDefectActions(defect);
    } catch (err) {
        showToast('Ошибка загрузки', 'error');
    }
}

function closeDefectActionsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('defectActionsModal');
    if (modal) modal.classList.remove('active');
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

let currentEditingDefectId = null;
let selectedDefectPhotoFiles = [];

function resetSelectedDefectPhotos() {
    selectedDefectPhotoFiles = [];
    const inputIds = ['defectPhotosBefore', 'defectPhotosBeforeGallery', 'defectPhotosBeforeCamera'];
    inputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
}

function getSelectedDefectPhotoFiles() {
    return selectedDefectPhotoFiles;
}

async function editDefect(id) {
    currentEditingDefectId = id;
    try {
        const res = await fetch(`/api/defects/${id}`);
        if (!res.ok) {
            showToast('Ошибка загрузки', 'error');
            return;
        }
        const defect = await res.json();
        
        closeDefectActionsModal();
        
        const modal = document.getElementById('defectModal');
        document.getElementById('defectModalTitle').textContent = 'Редактирование замечания';
        
        document.getElementById('defectCategory').value = defect.category || '';
        document.getElementById('defectCategory').disabled = true; // Cannot change category
        handleCategoryChange();
        
        document.getElementById('defectDescription').value = defect.description || '';
        
        // For Windows, populate the window number select
        if (defect.category === 'Окна') {
            const windowSelect = document.getElementById('windowNumber');
            windowSelect.disabled = false;
            windowSelect.value = defect.window_number ?? '';
        }

        if (defect.category === 'Двери') {
            const doorSideSelect = document.getElementById('doorSide');
            if (doorSideSelect) doorSideSelect.value = defect.variant_number || '';
        }
        
        document.getElementById('defectRestoration').checked = Boolean(defect.restoration);
        resetSelectedDefectPhotos();
        
        // Show existing photos
        const previewGrid = document.getElementById('previewGridBefore');
        if (previewGrid) {
            previewGrid.innerHTML = '';
            if (defect.photos?.length) {
                defect.photos.forEach(photo => {
                    const div = document.createElement('div');
                    div.className = 'preview-item';
                    div.innerHTML = `
                        <img src="/uploads/${encodeURIComponent(photo.filename)}">
                    `;
                    previewGrid.appendChild(div);
                });
            }
        }
        
        if (modal) modal.classList.add('active');
        
    } catch (err) {
        showToast('Ошибка загрузки', 'error');
    }
}

async function saveDefectEdit() {
    if (!currentEditingDefectId) return;
    
    const category = document.getElementById('defectCategory')?.value;
    const description = document.getElementById('defectDescription')?.value.trim();
    const windowNumber = document.getElementById('windowNumber')?.value;
    const doorSide = document.getElementById('doorSide')?.value;
    const restoration = document.getElementById('defectRestoration')?.checked ? 1 : 0;
    
    if (!category || !description) {
        showToast('Заполните все поля', 'warning');
        return;
    }
    
    if (category === 'Окна' && !windowNumber) {
        showToast('Выберите номер оконного блока', 'warning');
        return;
    }

    if (category === 'Двери' && !doorSide) {
        showToast('Выберите часть двери: Нар, Вн или Общ.', 'warning');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('description', description);
        if (category === 'Окна' && windowNumber) {
            formData.append('window_number', windowNumber);
        } else {
            formData.append('window_number', '');
        }
        formData.append('variant_number', category === 'Двери' ? doorSide : '');
        formData.append('restoration', restoration);
        
        // Add new photos
        const photos = getSelectedDefectPhotoFiles();
        if (photos) {
            for (let i = 0; i < photos.length; i++) {
                formData.append('photos', photos[i]);
                formData.append('photo_types', 'before');
            }
        }
        
        const res = await fetch(`/api/defects/${currentEditingDefectId}/meta`, {
            method: 'PUT',
            body: formData
        });
        
        if (res.ok) {
            showToast('Замечание обновлено', 'success');
            currentEditingDefectId = null;
            closeDefectModal();
            showApartmentDetail(state.currentApartment);
        } else {
            showToast('Ошибка сохранения', 'error');
        }
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

async function deleteDefect(id) {
    if (!confirm('Удалить замечание?')) return;
    
    try {
        const res = await fetch(`/api/defects/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Замечание удалено', 'success');
            closeDefectActionsModal();
            showApartmentDetail(state.currentApartment);
        } else {
            showToast('Ошибка удаления', 'error');
        }
    } catch (err) {
        showToast('Ошибка удаления', 'error');
    }
}

function handleFileSelect(e, type = 'before') {
    appendFilesToSelection(Array.from(e.target?.files || []), type);
    if (e.target) e.target.value = '';
}

function renderSelectedFiles(input, type = 'before') {
    const files = type === 'before' ? getSelectedDefectPhotoFiles() : Array.from(input?.files || []);
    const gridId = type === 'after' ? 'previewGridAfter' : 'previewGridBefore';
    const grid = document.getElementById(gridId);
    
    if (!grid) return;
    grid.innerHTML = '';
    
    Array.from(files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `
                <img src="${e.target.result}">
                <button class="preview-remove" type="button" onclick="removeSelectedFile('${input?.id || ''}', ${index}, '${type}')">×</button>
            `;
            grid.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function appendSelectedFiles(sourceInput, targetInput, type = 'before') {
    if (!sourceInput?.files?.length) {
        return;
    }

    appendFilesToSelection(Array.from(sourceInput.files), type, targetInput);
    sourceInput.value = '';
}

function appendFilesToSelection(filesToAppend, type = 'before', targetInput = null) {
    if (type === 'before') {
        selectedDefectPhotoFiles = selectedDefectPhotoFiles.concat(filesToAppend);
        syncFilesToInput(targetInput || document.getElementById('defectPhotosBefore'), selectedDefectPhotoFiles);
        renderSelectedFiles(targetInput || document.getElementById('defectPhotosBefore'), type);
        return;
    }

    appendFilesToInput(targetInput, filesToAppend);
    renderSelectedFiles(targetInput, type);
}

function appendFilesToInput(targetInput, filesToAppend) {
    if (!targetInput) {
        return;
    }

    try {
        const transfer = new DataTransfer();
        Array.from(targetInput.files || []).forEach(file => transfer.items.add(file));
        filesToAppend.forEach(file => transfer.items.add(file));
        targetInput.files = transfer.files;
    } catch (err) {
        // Some mobile browsers do not support programmatic FileList updates.
    }
}

function syncFilesToInput(targetInput, files) {
    if (!targetInput) {
        return;
    }

    try {
        const transfer = new DataTransfer();
        files.forEach(file => transfer.items.add(file));
        targetInput.files = transfer.files;
    } catch (err) {
        // Some mobile browsers do not support programmatic FileList updates.
    }
}

function removeSelectedFile(inputId, indexToRemove, type = 'before') {
    if (type === 'before') {
        selectedDefectPhotoFiles = selectedDefectPhotoFiles.filter((_, index) => index !== indexToRemove);
        syncFilesToInput(document.getElementById('defectPhotosBefore'), selectedDefectPhotoFiles);
        renderSelectedFiles(document.getElementById('defectPhotosBefore'), type);
        return;
    }

    const input = document.getElementById(inputId);
    if (!input) {
        return;
    }

    const transfer = new DataTransfer();
    Array.from(input.files || []).forEach((file, index) => {
        if (index !== indexToRemove) {
            transfer.items.add(file);
        }
    });
    input.files = transfer.files;
    renderSelectedFiles(input, type);
}

function openDefectGallery() {
    launchDefectFilePicker({ accept: 'image/*', multiple: true }, 'before');
}

function openDefectCamera() {
    launchDefectFilePicker({ accept: 'image/*', capture: 'environment' }, 'before');
}

function launchDefectFilePicker(options = {}, type = 'before') {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = options.accept || 'image/*';
    picker.multiple = Boolean(options.multiple);
    if (options.capture) picker.capture = options.capture;
    picker.addEventListener('change', () => {
        appendSelectedFiles(picker, document.getElementById('defectPhotosBefore'), type);
    }, { once: true });
    picker.click();
}

async function handleAddDefect(e) {
    e.preventDefault();
    
    // If we're editing, call saveDefectEdit instead
    if (currentEditingDefectId) {
        await saveDefectEdit();
        return;
    }
    
    const category = document.getElementById('defectCategory')?.value;
    const description = document.getElementById('defectDescription')?.value.trim();
    const status = 'new';
    const windowNumber = document.getElementById('windowNumber')?.value;
    const doorSide = document.getElementById('doorSide')?.value;
    const restoration = document.getElementById('defectRestoration')?.checked ? 1 : 0;
    
    console.log('Form values - category:', category, 'description:', description, 'apartment:', state.currentApartment);
    
    if (!category || !description) {
        showToast('Заполните все обязательные поля', 'warning');
        return;
    }
    
    if (category === 'Окна' && !windowNumber) {
        showToast('Выберите номер оконного блока', 'warning');
        return;
    }

    if (category === 'Двери' && !doorSide) {
        showToast('Выберите часть двери: Нар, Вн или Общ.', 'warning');
        return;
    }
    
    try {
        console.log('Adding defect:', category, description);
        
        const formData = new FormData();
        formData.append('category', category);
        formData.append('description', description);
        formData.append('status', status);
        
        if (windowNumber) formData.append('window_number', windowNumber);
        if (category === 'Двери') formData.append('variant_number', doorSide);
        if (restoration) formData.append('restoration', restoration);
        
        const photosBefore = getSelectedDefectPhotoFiles();
        if (photosBefore) {
            for (let i = 0; i < photosBefore.length; i++) {
                formData.append('photos', photosBefore[i]);
                formData.append('photo_types', 'before');
            }
        }
        
        const res = await fetch(`/api/apartments/${state.currentApartment}/defects`, {
            method: 'POST',
            body: formData
        });
        
        console.log('Defect add response:', res.status, res.statusText);
        
        if (res.ok) {
            showToast('Замечание добавлено', 'success');
            closeDefectModal();
            showApartmentDetail(state.currentApartment);
        } else {
            const errText = await res.text();
            console.error('Defect add error:', res.status, errText);
            showToast('Ошибка добавления: ' + errText, 'error');
        }
    } catch (err) {
        console.error('Defect add exception:', err);
        showToast('Ошибка добавления', 'error');
    }
}

// Photo Modal
function showPhoto(src) {
    openDefectPhoto([src], 0);
}

function openDefectPhoto(urls, index = 0) {
    photoModalItems = Array.isArray(urls) ? urls.filter(Boolean) : [];
    if (!photoModalItems.length) return;

    photoModalIndex = Math.min(Math.max(index, 0), photoModalItems.length - 1);
    syncPhotoModal();
}

function syncPhotoModal() {
    const modalImg = document.getElementById('modalImg');
    const photoModal = document.getElementById('photoModal');
    const counter = document.getElementById('photoModalCounter');
    const prevBtn = document.getElementById('photoModalPrev');
    const nextBtn = document.getElementById('photoModalNext');

    if (modalImg) modalImg.src = photoModalItems[photoModalIndex] || '';
    if (counter) counter.textContent = photoModalItems.length > 1 ? `${photoModalIndex + 1} / ${photoModalItems.length}` : '';
    if (prevBtn) prevBtn.disabled = photoModalItems.length <= 1;
    if (nextBtn) nextBtn.disabled = photoModalItems.length <= 1;
    if (photoModal) photoModal.classList.add('active');
}

function changePhoto(direction) {
    if (photoModalItems.length <= 1) return;
    photoModalIndex = (photoModalIndex + direction + photoModalItems.length) % photoModalItems.length;
    syncPhotoModal();
}

function closeModal() {
    const photoModal = document.getElementById('photoModal');
    if (photoModal) photoModal.classList.remove('active');
    photoModalItems = [];
    photoModalIndex = 0;
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

function formatDateTime(str) {
    if (!str) return '';
    return new Date(str).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatPrintDateLong(date = new Date()) {
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `«${day}» ${month} ${year} г.`;
}

function formatActNumberDate(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}${month}${year}`;
}

function renderPrintLine(value = '', className = '') {
    const safeValue = value ? escapeHtml(String(value)) : '&nbsp;';
    return `<span class="line-fill ${className}">${safeValue}</span>`;
}

function getDefectPrintLocation(defect) {
    const category = defect?.category || 'Не указано';
    if (category === 'Окна' && defect?.window_number) {
        return `Окно ${escapeHtml(String(defect.window_number))}`;
    }
    if (category === 'Двери') {
        return 'Дверь';
    }
    return escapeHtml(String(category));
}

function splitDefectsForPrint(defects) {
    const pages = [];
    const firstPageBudget = 17;
    const otherPagesBudget = 19;
    let currentPage = [];
    let currentUnits = 0;
    let pageBudget = firstPageBudget;

    defects.forEach(defect => {
        const photosCount = Array.isArray(defect?.photos) ? defect.photos.length : 0;
        const units = Math.max(1, Math.ceil(photosCount / 3)) + ((defect?.description || '').length > 320 ? 1 : 0);

        if (currentPage.length && currentUnits + units > pageBudget) {
            pages.push(currentPage);
            currentPage = [];
            currentUnits = 0;
            pageBudget = otherPagesBudget;
        }

        currentPage.push(defect);
        currentUnits += units;
    });

    if (currentPage.length) {
        pages.push(currentPage);
    }

    return pages.length ? pages : [[]];
}

async function getCurrentComplexSequenceNumber() {
    let complexes = state.complexes;
    if (!Array.isArray(complexes) || !complexes.length) {
        const res = await fetch('/api/complexes');
        complexes = await res.json();
        state.complexes = Array.isArray(complexes) ? complexes : [];
    }

    const complexIndex = (complexes || []).findIndex(complex => String(complex.id) === String(state.currentComplex));
    return complexIndex >= 0 ? complexIndex + 1 : 1;
}

function isOverdue(deadline, status) {
    if (isClosedDefectStatus(status)) return false;
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
        const complexSequenceNumber = await getCurrentComplexSequenceNumber();
        const complexAddress = state.currentComplexData?.address?.trim() || '';
        const now = new Date();
        const printDate = formatPrintDateLong(now);
        const photoDate = formatPrintDateLong(now);
        const actNumber = `${formatActNumberDate(now)}/${complexSequenceNumber}/${apt.number}`;
        const defectPages = splitDefectsForPrint(defects);

        const renderRowsHtml = (pageDefects, startIndex) => pageDefects.map((d, index) => {
            const photos = Array.isArray(d.photos) ? d.photos : [];
            const photoHtml = photos.length
                ? `<div class="photo-stack">${photos.map((photo, photoIndex) => `<figure class="photo-item"><img src="${window.location.origin}/uploads/${encodeURIComponent(photo.filename)}" alt="Фото ${photoIndex + 1}"><figcaption>Фото ${startIndex + index + 1}.${photoIndex + 1}</figcaption></figure>`).join('')}</div>`
                : '<div class="photo-placeholder">Новое замечание</div>';

            return `
                <tr class="defect-print-item">
                    <td class="num-cell">${startIndex + index + 1}.</td>
                    <td class="place-cell">${getDefectPrintLocation(d)}</td>
                    <td class="desc-cell">${escapeHtml(d.description || '')}</td>
                    <td class="photo-cell">${photoHtml}</td>
                </tr>
            `;
        }).join('');

        const printPagesHtml = defectPages.map((pageDefects, pageIndex) => {
            const startIndex = defectPages.slice(0, pageIndex).reduce((sum, page) => sum + page.length, 0);
            const footerText = pageIndex === 0 ? '' : `Продолжение акта № ${actNumber}`;

            return `
                <section class="print-page ${pageIndex === 0 ? 'first-page' : 'continued-page'}">
                    ${pageIndex === 0 ? `
                        <div class="act-title">АКТ № ${actNumber}</div>
                        <div class="act-subtitle">осмотра квартиры и фиксации замечаний Дольщика</div>

                        <div class="city-row">
                            <div>г. ${renderPrintLine('', 'line-city')}</div>
                            <div>${printDate}</div>
                        </div>

                        <div class="field-line">Дольщик: ${renderPrintLine('', 'line-person')}<span class="hint">(Фамилия, Имя, Отчество)</span></div>
                        <div class="field-line">Подрядчик (Застройщик/уполномоченный представитель): ${renderPrintLine('', 'line-contractor')}<span class="hint">(наименование организации, должность, Фамилия, Имя, Отчество представителя)</span></div>
                        <div class="field-line">Квартира № ${renderPrintLine(apt.number, 'line-apt-number')}, расположенная по адресу: ${renderPrintLine(complexAddress, 'line-address')}</div>

                        <div class="section">Настоящим актом стороны подтверждают, что Дольщиком предъявлены, а Подрядчиком приняты к рассмотрению замечания к указанной квартире, подлежащие устранению.</div>
                        <div class="section">Перечень замечаний (недостатков) на текущую дату ${printDate}:</div>
                    ` : ''}

                    <table class="defect-print-table">
                        <thead>
                            <tr>
                                <th>№</th>
                                <th>Место замечания</th>
                                <th>Описание дефекта</th>
                                <th>Фото</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${renderRowsHtml(pageDefects, startIndex)}
                        </tbody>
                    </table>

                    ${pageIndex === defectPages.length - 1 ? `
                        <div class="section">Подтверждение полноты перечня:</div>
                        <div>Стороны настоящим удостоверяют, что на дату подписания настоящего акта (текущую дату) акт содержит все замечания, выявленные Дольщиком в результате осмотра указанной квартиры. Иные недостатки, не указанные в настоящем акте, Дольщиком на момент его подписания не предъявляются.</div>

                        <div class="section">Фотоматериалы:</div>
                        <div>Фотографии, размещённые в столбце «Фото» перечня замечаний, являются неотъемлемой частью настоящего акта. Каждое фото сделано при осмотре квартиры ${photoDate} и достоверно отображает указанный дефект.</div>

                        <div class="section">Обязательства Подрядчика:</div>
                        <div>Подрядчик обязуется устранить замечания, указанные в настоящем акте, в срок до «__» _________ 20 г. (либо в порядке и сроки, предусмотренные договором). О завершении устранения замечаний Подрядчик уведомляет Дольщика не позднее чем за 3 рабочих дня до даты повторной приёмки.</div>

                        <div class="section">Подписи сторон:</div>
                        <div class="signature-grid">
                            <div class="signature-block">
                                <div><strong>Дольщик</strong></div>
                                <div class="signature-line">_______________ /________________________/</div>
                                <div class="hint">(подпись) (расшифровка)</div>
                            </div>
                            <div class="signature-block">
                                <div><strong>Подрядчик</strong></div>
                                <div class="signature-line">_______________ /________________________/</div>
                                <div class="hint">(подпись) (расшифровка)</div>
                            </div>
                        </div>

                        <div class="section">Дата подписания акта: ${printDate}</div>
                    ` : ''}

                    <div class="page-footer">${footerText}</div>
                </section>
            `;
        }).join('');
        
        let html = `
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Акт № ${actNumber}</title>
                <style>
                    @page { margin: 12mm; }
                    body { font-family: "Times New Roman", serif; margin: 0; color: #111; font-size: 14px; line-height: 1.45; }
                    .print-page { padding: 3mm 4mm 6mm; box-sizing: border-box; position: relative; page-break-after: always; }
                    .print-page:last-child { page-break-after: auto; }
                    .act-title { text-align: center; font-weight: 700; font-size: 20px; margin: 0 0 4px; }
                    .act-subtitle { text-align: center; font-weight: 700; font-size: 16px; margin: 0 0 18px; }
                    .city-row { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
                    .field-line { margin-bottom: 14px; }
                    .line-fill { display: inline-block; border-bottom: 1px solid #111; min-height: 18px; vertical-align: baseline; padding: 0 4px 2px; }
                    .line-city { min-width: 170px; }
                    .line-person { min-width: 460px; }
                    .line-contractor { min-width: 420px; }
                    .line-apt-number { min-width: 52px; text-align: center; }
                    .line-address { min-width: 360px; }
                    .hint { display: block; font-size: 12px; color: #444; margin-top: 3px; }
                    .section { margin-top: 16px; }
                    .defect-print-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    .defect-print-table th,
                    .defect-print-table td { border: 1px solid #111; padding: 8px; vertical-align: top; }
                    .defect-print-table th { text-align: left; }
                    .num-cell { width: 42px; }
                    .place-cell { width: 22%; }
                    .desc-cell { width: 38%; }
                    .photo-stack { display: flex; flex-wrap: wrap; gap: 8px; }
                    .photo-item { margin: 0; width: 150px; }
                    .photo-item img { width: 100%; max-height: 120px; object-fit: cover; border: 1px solid #999; display: block; }
                    .photo-item figcaption { font-size: 11px; text-align: center; margin-top: 3px; }
                    .photo-placeholder { color: #666; font-style: italic; }
                    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 24px; }
                    .signature-block { margin-top: 18px; }
                    .signature-line { margin-top: 36px; }
                    .page-footer { position: absolute; left: 0; right: 0; bottom: 0; font-size: 10px; color: #555; text-align: right; padding: 0 4mm 0.5mm; }
                    @media print {
                        body { margin: 0; }
                        .defect-print-item { page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                ${printPagesHtml}
            `;

        html += '</body></html>';
        
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        win.document.title = `Акт № ${actNumber}`;
        setTimeout(() => win.print(), 150);
    } catch (err) {
        showToast('Ошибка печати', 'error');
    }
}

function getFilteredDefectsForComplexPrint() {
    const apartmentIds = new Set((state.filteredApartments || []).map(apartment => apartment.id));
    const categoryFilter = document.getElementById('defectCategoryFilter')?.value || '';
    const statusFilter = document.getElementById('defectStatusFilter')?.value || '';

    return (state.currentDefects || []).filter(defect => {
        if (!apartmentIds.has(defect.apartment_id)) return false;
        if (categoryFilter && defect.category !== categoryFilter) return false;
        if (statusFilter === 'recorded' && defect.status !== 'recorded') return false;
        if (statusFilter === 'in_progress' && !['in_progress', 'rework'].includes(defect.status)) return false;
        if (statusFilter === 'on_review' && defect.status !== 'on_review') return false;
        if (statusFilter === 'completed' && !isClosedDefectStatus(defect.status)) return false;
        return true;
    });
}

function getFilteredDefectGroups() {
    const apartments = state.filteredApartments || [];
    const defects = getFilteredDefectsForComplexPrint();
    const grouped = new Map();

    defects.forEach(defect => {
        if (!grouped.has(defect.apartment_id)) grouped.set(defect.apartment_id, []);
        grouped.get(defect.apartment_id).push(defect);
    });

    return apartments
        .filter(apartment => grouped.has(apartment.id))
        .map(apartment => ({ apartment, defects: grouped.get(apartment.id) || [] }));
}

function showFilteredDefectsModal() {
    if (!state.currentComplex) return;

    const groups = getFilteredDefectGroups();
    if (!groups.length) {
        showToast('Нет замечаний для показа', 'warning');
        return;
    }

    const body = document.getElementById('filteredDefectsBody');
    const modal = document.getElementById('filteredDefectsModal');
    if (!body || !modal) return;

    body.innerHTML = groups.map(({ apartment, defects }) => {
        const apartmentLabel = `${state.currentPropertyType === 'апартаменты' ? 'Апартамент' : 'Квартира'} ${apartment.number}`;
        const section = apartment.section_number ? `Секция ${apartment.section_number}` : '';
        const floor = apartment.floor ? `Этаж ${apartment.floor}` : '';
        const meta = [section, floor].filter(Boolean).join(' • ');

        return `
            <section class="filtered-defects-group">
                <div class="filtered-defects-group-title">${escapeHtml(apartmentLabel)}</div>
                ${meta ? `<div class="filtered-defects-group-meta">${escapeHtml(meta)}</div>` : ''}
                <div class="filtered-defects-table-wrap">
                    <table class="filtered-defects-table">
                        <thead>
                            <tr>
                                <th>Место</th>
                                <th>Замечание</th>
                                <th>Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${defects.map(defect => `
                                <tr>
                                    <td>${getDefectPrintLocation(defect)}</td>
                                    <td>${escapeHtml(defect.description || '')}</td>
                                    <td><span class="filtered-defect-status defect-status-badge ${getDefectStatusBadgeClass(defect.status)}">${escapeHtml(getDefectStatusLabel(defect.status))}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }).join('');

    modal.classList.add('active');
}

function closeFilteredDefectsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('filteredDefectsModal');
    if (modal) modal.classList.remove('active');
}

async function printFilteredDefects() {
    if (!state.currentComplex) return;

    const groups = getFilteredDefectGroups();
    if (!groups.length) {
        showToast('Нет замечаний для печати', 'warning');
        return;
    }

    const rowsHtml = groups
        .flatMap(({ apartment, defects }) => {
            return defects.map((defect, index) => {
                const apartmentLabel = `${state.currentPropertyType === 'апартаменты' ? 'Апартамент' : 'Квартира'} ${apartment.number}`;
                const place = getDefectPrintLocation(defect);
                const section = apartment.section_number ? `Секция ${apartment.section_number}` : '';
                const floor = apartment.floor ? `Этаж ${apartment.floor}` : '';
                const meta = [section, floor].filter(Boolean).join(' • ');
                return `
                    <tr>
                        <td class="print-col-apartment">${index === 0 ? `${escapeHtml(apartmentLabel)}${meta ? `<div class="print-apartment-meta">${escapeHtml(meta)}</div>` : ''}` : ''}</td>
                        <td class="print-col-place">${place}</td>
                        <td class="print-col-desc">${escapeHtml(defect.description || '')}</td>
                        <td class="print-col-status">${escapeHtml(getDefectStatusLabel(defect.status))}</td>
                    </tr>
                `;
            });
        })
        .join('');

    const title = `Замечания по отфильтрованным квартирам`;
    const subtitle = state.currentComplexData?.name ? escapeHtml(state.currentComplexData.name) : '';
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                @page { margin: 12mm; }
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #111; font-size: 12px; }
                .sheet { padding: 10mm 4mm; }
                h1 { margin: 0 0 6px; font-size: 18px; }
                .subtitle { margin-bottom: 14px; color: #555; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #111; padding: 6px 8px; vertical-align: top; }
                th { text-align: left; background: #f5f5f5; }
                .print-col-apartment { width: 160px; }
                .print-col-place { width: 120px; }
                .print-col-status { width: 120px; }
                .print-apartment-meta { margin-top: 4px; font-size: 11px; color: #666; }
                tr { page-break-inside: avoid; }
            </style>
        </head>
        <body>
            <div class="sheet">
                <h1>${title}</h1>
                ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
                <table>
                    <thead>
                        <tr>
                            <th>Квартира</th>
                            <th>Место</th>
                            <th>Замечание</th>
                            <th>Статус</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.document.title = title;
    setTimeout(() => printWindow.print(), 150);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    if (document.getElementById('photoModal')?.classList.contains('active')) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            changePhoto(-1);
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            changePhoto(1);
        }
    }
    
    // Backspace to go back (when not in input)
    if (e.key === 'Backspace' && 
        !e.target.matches('input, textarea, select') && 
        (state.currentApartment || state.currentComplex)) {
        e.preventDefault();
        goBack();
    }
});

// ========== STATISTICS MODAL ==========

let statsDate = new Date().toISOString().split('T')[0];
let statsMinDate = '';
let statsMode = 'day';
let statsRangeStart = statsDate;
let statsRangeEnd = statsDate;

function getStatsQueryString() {
    const params = new URLSearchParams();
    if (statsMode === 'range') {
        params.set('start_date', statsRangeStart);
        params.set('end_date', statsRangeEnd);
    } else {
        params.set('stat_date', statsDate);
    }
    return params.toString();
}

function formatStatsPeriodLabel(startDate, endDate) {
    if (!startDate || !endDate) {
        const today = new Date().toISOString().split('T')[0];
        startDate = today;
        endDate = today;
    }
    const formatDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    return startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function formatStatsPercent(count, total) {
    if (!total) return '0%';
    return `${Math.round((count / total) * 1000) / 10}%`;
}

function refreshStatsModal() {
    loadStats(document.getElementById('statsBody'), document.getElementById('statsModal'));
}

async function showStatsModal() {
    const modal = document.getElementById('statsModal');
    const body = document.getElementById('statsBody');
    
    if (!state.currentComplex) {
        body.innerHTML = '<p>Выберите ЖК для просмотра статистики</p>';
        modal.classList.add('active');
        return;
    }
    
    await loadStats(body, modal);
}

async function loadStats(body, modal) {
    try {
        const statsRes = await fetch(`/api/complexes/${state.currentComplex}/statistics?${getStatsQueryString()}`);
        if (!statsRes.ok) throw new Error(`Statistics request failed: ${statsRes.status}`);
        const stats = await statsRes.json();
        
        // Set min date from first defect
        statsMinDate = stats.first_defect_date || statsDate;
        
        const totalApartments = stats.total_apartments || 0;
        const allTimeApartmentsWithDefects = stats.all_time_apartments_with_defects || 0;
        const periodOpenDefects = stats.period_open_defects || 0;
        const periodApartmentsWithDefects = stats.period_apartments_with_defects || 0;
        const statusChangeRows = stats.period_status_changes || [];
        const accessStats = stats.by_access_status || [];
        const statusPeriodNet = stats.status_period_net || {};
        const complexName = stats.complex_name || document.getElementById('jkName')?.textContent || 'ЖК';
        const periodLabel = statsMode === 'range'
            ? formatStatsPeriodLabel(statsRangeStart || stats.period_start, statsRangeEnd || stats.period_end)
            : formatStatsPeriodLabel(statsDate || stats.period_start, statsDate || stats.period_end);

        const getCurrentStatusCount = (status) => accessStats.find((row) => row.access_status === status)?.count || 0;
        const formatStatsDelta = (value) => {
            if (value > 0) return `+${value}`;
            if (value < 0) return `${value}`;
            return '0';
        };
        const deltaLabel = statsMode === 'range' ? 'за период' : 'за день';
        const acceptedTotal = getCurrentStatusCount('owner_accepted') + getCurrentStatusCount('tech_accepted');
        const noAccessTotal = getCurrentStatusCount('no_access');
        const callTotal = getCurrentStatusCount('call');
        const isApartmentType = state.currentPropertyType === 'апартаменты';

        const statRows = [
            {
                label: 'Вызов',
                value: callTotal,
                percent: formatStatsPercent(callTotal, totalApartments),
                delta: formatStatsDelta(statusPeriodNet.call || 0),
                tone: 'call'
            },
            {
                label: 'Приняты',
                value: acceptedTotal,
                percent: formatStatsPercent(acceptedTotal, totalApartments),
                delta: formatStatsDelta((statusPeriodNet.owner_accepted || 0) + (statusPeriodNet.tech_accepted || 0)),
                tone: 'accepted'
            },
            {
                label: 'Нет доступа',
                value: noAccessTotal,
                percent: formatStatsPercent(noAccessTotal, totalApartments),
                delta: formatStatsDelta(statusPeriodNet.no_access || 0),
                tone: 'no-access'
            },
            {
                label: 'С замечаниями',
                value: stats.with_defects || 0,
                percent: formatStatsPercent(stats.with_defects || 0, totalApartments),
                delta: formatStatsDelta(periodApartmentsWithDefects || 0),
                tone: 'defects'
            },
            {
                label: 'С замечаниями за все время',
                value: allTimeApartmentsWithDefects,
                percent: formatStatsPercent(allTimeApartmentsWithDefects, totalApartments),
                delta: formatStatsDelta(periodApartmentsWithDefects || 0),
                tone: 'all-time'
            }
        ];

        body.innerHTML = `
            <div class="stats-shell stats-shell-ticket">
                <div class="stats-ticket-head">
                    <div class="stats-ticket-copy">
                        <div class="stats-ticket-title">${complexName}</div>
                        <span class="stats-ticket-period">${periodLabel}</span>
                    </div>
                    <div class="stats-ticket-head-actions">
                        <button class="btn btn-secondary btn-compact" onclick="printStatsReport()">Печать</button>
                        <button class="btn btn-secondary btn-compact" onclick="exportStatsPdf()">PDF</button>
                    </div>
                    <div class="stats-ticket-total">
                        <span>${isApartmentType ? 'Апартаментов' : 'Квартир'}</span>
                        <strong>${totalApartments}</strong>
                    </div>
                </div>

                <div class="stats-toolbar stats-toolbar-ticket">
                    <div class="stats-mode-switch">
                        <button class="pill ${statsMode === 'day' ? 'active' : ''}" onclick="setStatsMode('day')">День</button>
                        <button class="pill ${statsMode === 'range' ? 'active' : ''}" onclick="setStatsMode('range')">Период</button>
                    </div>
                    <div class="stats-date-range">
                        ${statsMode === 'range' ? `
                            <label class="stats-date-picker" for="statsDateStart">
                                <span>С</span>
                                <input type="date" id="statsDateStart" value="${statsRangeStart}" min="${statsMinDate}" max="${new Date().toISOString().split('T')[0]}" onchange="changeStatsRange('start', this.value)" oninput="changeStatsRange('start', this.value)">
                            </label>
                            <label class="stats-date-picker" for="statsDateEnd">
                                <span>По</span>
                                <input type="date" id="statsDateEnd" value="${statsRangeEnd}" min="${statsMinDate}" max="${new Date().toISOString().split('T')[0]}" onchange="changeStatsRange('end', this.value)" oninput="changeStatsRange('end', this.value)">
                            </label>
                        ` : `
                            <label class="stats-date-picker" for="statsDateInput">
                                <span>Дата</span>
                                <input type="date" id="statsDateInput" value="${statsDate}" min="${statsMinDate}" max="${new Date().toISOString().split('T')[0]}" onchange="changeStatsDate(this.value)" oninput="changeStatsDate(this.value)">
                            </label>
                        `}
                    </div>
                </div>

                <div class="stats-ticket-layout">
                    <div class="stats-ticket-panel stats-ticket-card">
                        <div class="stats-ticket-list">
                            ${statRows.map((row) => `
                                <div class="stats-ticket-row stats-ticket-row-${row.tone}">
                                    <label>${row.label}</label>
                                    <strong>${row.value}</strong>
                                    <em>${row.percent}</em>
                                    <span>${row.delta} ${deltaLabel}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

            </div>
        `;

        modal.classList.add('active');
    } catch (err) {
        console.error('Stats error:', err);
        body.innerHTML = `
            <div class="stats-error-state">
                <strong>Не удалось загрузить статистику</strong>
                <span>Попробуйте открыть окно еще раз.</span>
            </div>
        `;
        modal.classList.add('active');
    }
}

function changeStatsDate(newDate) {
    const minDate = statsMinDate;
    const maxDate = new Date().toISOString().split('T')[0];
    
    if (newDate < minDate) {
        alert('Нельзя выбрать дату ранее первого замечания (' + minDate + ')');
        document.getElementById('statsDateInput').value = statsDate;
        return;
    }
    
    if (newDate > maxDate) {
        alert('Нельзя выбрать дату в будущем');
        document.getElementById('statsDateInput').value = statsDate;
        return;
    }
    
    statsDate = newDate;
    statsRangeStart = newDate;
    statsRangeEnd = newDate;
    refreshStatsModal();
}

function setStatsMode(mode) {
    statsMode = mode;
    if (mode === 'day') {
        statsDate = statsRangeEnd || statsRangeStart || statsDate;
    } else {
        statsRangeStart = statsRangeStart || statsDate;
        statsRangeEnd = statsRangeEnd || statsDate;
    }
    refreshStatsModal();
}

function changeStatsRange(edge, newDate) {
    const maxDate = new Date().toISOString().split('T')[0];
    if (newDate < statsMinDate || newDate > maxDate) {
        loadStats(document.getElementById('statsBody'), document.getElementById('statsModal'));
        return;
    }
    if (edge === 'start') {
        statsRangeStart = newDate;
        if (statsRangeEnd < statsRangeStart) statsRangeEnd = newDate;
    } else {
        statsRangeEnd = newDate;
        if (statsRangeStart > statsRangeEnd) statsRangeStart = newDate;
    }
    refreshStatsModal();
}

function printStatsReport() {
    const statsRes = fetch(`/api/complexes/${state.currentComplex}/statistics?${getStatsQueryString()}`).then(r => r.json());
    
    statsRes.then(stats => {
        const totalApartments = stats.total_apartments || 0;
        const periodApartmentsWithDefects = stats.period_apartments_with_defects || 0;
        const allTimeApartmentsWithDefects = stats.all_time_apartments_with_defects || 0;
        const jkName = stats.complex_name || document.getElementById('jkName').textContent;
        const statusChangeRows = stats.period_status_changes || [];
        const periodLabel = statsMode === 'range'
            ? formatStatsPeriodLabel(statsRangeStart || stats.period_start, statsRangeEnd || stats.period_end)
            : formatStatsPeriodLabel(statsDate || stats.period_start, statsDate || stats.period_end);
        const acceptedCount = statusChangeRows
            .filter((row) => ['owner_accepted', 'tech_accepted'].includes(row.access_status))
            .reduce((sum, row) => sum + row.count, 0);
        const noAccessCount = statusChangeRows.find((row) => row.access_status === 'no_access')?.count || 0;
        const callCount = statusChangeRows.find((row) => row.access_status === 'call')?.count || 0;
        const rows = [
            ['С замечаниями', periodApartmentsWithDefects, formatStatsPercent(periodApartmentsWithDefects, totalApartments)],
            ['Приняты', acceptedCount, formatStatsPercent(acceptedCount, totalApartments)],
            ['Нет доступа', noAccessCount, formatStatsPercent(noAccessCount, totalApartments)],
            ['Вызов', callCount, formatStatsPercent(callCount, totalApartments)],
        ].map((row) => `
            <tr>
                <td>${row[0]}</td>
                <td>${row[1]}</td>
                <td>${row[2]}</td>
            </tr>
        `).join('');
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Отчет - ${jkName}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 24px; max-width: 900px; margin: 0 auto; color: #111; }
                    h1 { font-size: 26px; margin-bottom: 6px; }
                    .report-date { color: #555; margin-bottom: 18px; font-size: 14px; }
                    .summary { display: grid; grid-template-columns: repeat(3, 1fr); margin-bottom: 24px; border: 1px solid #111; }
                    .summary-box { padding: 16px; border-right: 1px solid #111; }
                    .summary-box:last-child { border-right: none; }
                    .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 6px; }
                    .summary-value { font-size: 32px; font-weight: bold; }
                    .summary-meta { font-size: 13px; color: #444; margin-top: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background: #111; color: #fff; font-weight: 700; font-size: 12px; text-transform: uppercase; }
                    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <h1>${jkName}</h1>
                <p class="report-date">Период: ${periodLabel}</p>
                
                <div class="summary">
                    <div class="summary-box">
                        <div class="summary-label">Квартир</div>
                        <div class="summary-value">${totalApartments}</div>
                    </div>
                    <div class="summary-box">
                        <div class="summary-label">С замечаниями</div>
                        <div class="summary-value">${periodApartmentsWithDefects}</div>
                        <div class="summary-meta">${formatStatsPercent(periodApartmentsWithDefects, totalApartments)} от общего числа</div>
                    </div>
                    <div class="summary-box">
                        <div class="summary-label">С замечаниями за все время</div>
                        <div class="summary-value">${allTimeApartmentsWithDefects}</div>
                        <div class="summary-meta">${formatStatsPercent(allTimeApartmentsWithDefects, totalApartments)} от общего числа квартир</div>
                    </div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Статус</th>
                            <th>Количество</th>
                            <th>% от общего</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                
                <div class="footer">
                    Сформировано системой "Перспектива Инжиниринг гарантийный сервис"
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    });
}

function exportStatsPdf() {
    window.open(`/api/complexes/${state.currentComplex}/statistics/pdf?${getStatsQueryString()}`, '_blank');
}

function closeStatsModal(event) {
    if (!event || event.target === event.currentTarget || event.target.id === 'statsModal') {
        document.getElementById('statsModal').classList.remove('active');
    }
}

function getAccessStatusName(status) {
    const names = {
        '': 'Все',
        'available': 'Доступна',
        'defects': 'С замеч.',
        'call': 'Вызов',
        'owner_accepted': 'Принята',
        'tech_accepted': 'Тех. принята',
        'complex': 'Сложные',
        'no_access': 'Нет доступа',
        'by_phone': 'По звонку',
        'elevated': 'Поднять',
        'in_progress': 'В работе'
    };
    return names[status] || status || 'Неизвестно';
}

console.log('app.js loaded - v2.0 optimized');
