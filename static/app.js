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
    executors: [],
    currentItemId: null,
    accessFilter: '',
    activeAccessFilters: [],
    defectsOnly: false,
    reviewOnly: false,
    restorationOnly: false,
    sortByDefects: false,
    loading: false,
    currentDefects: [], // Store defects for category filtering
    allApartments: [],
    apartmentsCacheComplexId: null,
    filteredApartments: [],
    executorAssignmentSelectedApartmentIds: [],
    currentExecutorReportId: null,
    pendingAccessStatus: null,
    gridNeedsRerender: false,
    parsedSearchCache: { input: '', numbers: null }
};

// Global filter constants
const FILTERS = ['', 'defects', 'restoration', 'on_review', 'in_progress', 'call', 'owner_accepted', 'complex', 'no_access'];
const FILTER_NAMES = ['Все', 'С замечаниями', 'Реставрация', 'На проверке', 'В работе', 'Вызваные квартиры', 'Принята', 'Сложная', 'Нет доступа'];
const FILTER_INDEXES = {
    '': 0,
    'defects': 1,
    'restoration': 2,
    'on_review': 3,
    'in_progress': 4,
    'call': 5,
    'owner_accepted': 6,
    'complex': 7,
    'no_access': 8
};
const ACCEPTED_ACCESS_STATUSES = ['owner_accepted', 'tech_accepted'];
const APARTMENT_STATUS_SORT_ORDER = {
    available: 0,
    in_progress: 1,
    by_phone: 2,
    complex: 3,
    no_access: 4,
    call: 5,
    owner_accepted: 6,
    tech_accepted: 6
};
const DEFECT_STATUS_LABELS = {
    recorded: 'Зафиксированно',
    in_progress: 'В работе',
    on_review: 'На проверке',
    completed: 'Выполнено'
};
const DEFECT_STATUS_ORDER = ['recorded', 'in_progress', 'on_review', 'completed'];
const AVAILABLE_DEFECT_STATUSES = ['in_progress', 'on_review', 'completed'];
const DEFECT_STATUS_CLASSES = {
    recorded: 'badge-recorded',
    in_progress: 'badge-progress',
    on_review: 'badge-on-review',
    completed: 'badge-completed'
};
const CLOSED_DEFECT_STATUSES = ['completed', 'on_review'];
const COMMENT_AUTHOR_STORAGE_KEY = 'dubrovkaDefectsCommentAuthor';
let currentFilterIndex = 0;
let photoModalItems = [];
let photoModalIndex = 0;
const defectAutosaveTimers = new Map();

// DOM Elements cache
const elements = {};
let wasMobileComplexLayout = window.innerWidth <= 768;
let loadComplexesController = null;
let apartmentsRequestPromise = null;
let apartmentsRequestComplexId = null;
let defectsRequestPromise = null;
let defectsRequestComplexId = null;
let loadApartmentsRequestId = 0;
let loadApartmentsPromise = null;
let loadApartmentsQueued = false;
let categoriesRequestPromise = null;
let contractorsRequestPromise = null;
let appInitialized = false;
let loadComplexesPromise = null;
let delayedComplexPrintBtnTimer = null;
let executorsRequestPromise = null;

function shouldShowComplexPrintButton() {
    return state.currentTab === 'complex-detail' && !!state.currentComplex && !state.currentApartment;
}

function hideDelayedComplexPrintButton() {
    if (delayedComplexPrintBtnTimer) {
        clearTimeout(delayedComplexPrintBtnTimer);
        delayedComplexPrintBtnTimer = null;
    }
    if (elements.complexPrintBtn) {
        elements.complexPrintBtn.style.display = 'none';
    }
    if (elements.assignmentBtn) {
        elements.assignmentBtn.style.display = 'none';
    }
}

function showDelayedComplexPrintButton() {
    if (!elements.complexPrintBtn) return;
    if (!shouldShowComplexPrintButton()) {
        hideDelayedComplexPrintButton();
        return;
    }

    if (elements.complexPrintBtn.style.display === 'inline-flex') {
        return;
    }

    if (delayedComplexPrintBtnTimer) {
        clearTimeout(delayedComplexPrintBtnTimer);
        delayedComplexPrintBtnTimer = null;
    }

    delayedComplexPrintBtnTimer = setTimeout(() => {
        if (shouldShowComplexPrintButton() && elements.complexPrintBtn) {
            elements.complexPrintBtn.style.display = 'inline-flex';
        }
        if (shouldShowComplexPrintButton() && elements.assignmentBtn) {
            elements.assignmentBtn.style.display = 'inline-flex';
        }
        delayedComplexPrintBtnTimer = null;
    }, 120);
}

function reportClientError(payload) {
    try {
        const body = JSON.stringify({
            message: String(payload?.message || 'Unknown client error'),
            source: String(payload?.source || ''),
            lineno: Number(payload?.lineno || 0),
            colno: Number(payload?.colno || 0),
            stack: String(payload?.stack || ''),
            href: window.location.href,
            user_agent: navigator.userAgent
        });

        if (navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon('/api/client-error', blob);
            return;
        }

        fetch('/api/client-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true
        }).catch(() => {});
    } catch (_) {
    }
}

window.addEventListener('error', (event) => {
    reportClientError({
        message: event.message,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack || ''
    });
});

window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientError({
        message: reason?.message || String(reason || 'Unhandled promise rejection'),
        stack: reason?.stack || ''
    });
});

function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    cacheElements();
    loadCategories();
    loadContractors();
    loadExecutors();
    loadComplexes();
    setupForms();
    setupEventListeners();
    setBodyViewClass('complexes');
    updateMobileFilterIndicator('');
    updateMobileFilterButtons('');
}

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
    initApp();
}

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
    elements.mobileApartmentStatusSelect = document.getElementById('mobileApartmentStatusSelect');
    elements.mobileApartmentFinder = document.getElementById('mobileApartmentFinder');
    elements.mobileApartmentNumberInput = document.getElementById('mobileApartmentNumberInput');
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
    elements.assignmentBtn = document.getElementById('assignmentBtn');
    elements.executorRegistryModal = document.getElementById('executorRegistryModal');
    elements.complexPrintBtn = document.getElementById('complexPrintBtn');
    elements.complexCommentsBtn = document.getElementById('complexCommentsBtn');
    elements.tabPanels = document.querySelectorAll('.tab-panel');
}

// Setup Forms
function setupForms() {
    const createForm = document.getElementById('createComplexForm');
    if (createForm) createForm.addEventListener('submit', handleCreateComplex);
    
    const defectForm = document.getElementById('addDefectForm');
    if (defectForm) defectForm.addEventListener('submit', handleAddDefect);

    const executorAssignmentForm = document.getElementById('executorAssignmentForm');
    if (executorAssignmentForm) executorAssignmentForm.addEventListener('submit', submitExecutorAssignment);

    const executorRegistryForm = document.getElementById('executorRegistryForm');
    if (executorRegistryForm) executorRegistryForm.addEventListener('submit', submitExecutorRegistryForm);

    const executorAssignmentResponsibleType = document.getElementById('executorAssignmentResponsibleType');
    if (executorAssignmentResponsibleType) executorAssignmentResponsibleType.addEventListener('change', syncResponsibleAssignmentTypeVisibility);
    
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
                if (e.target.matches('[id^="defectCommentText_"]')) {
                    markDefectRowDirty(row);
                    scheduleDefectCommentAutosave(row, e.target);
                    return;
                }
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
            if (e.target.matches('select[id^="defectExecutor_"]')) {
                updateDefectExecutorSelectAppearance(e.target);
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

    if (elements.mobileApartmentNumberInput) {
        elements.mobileApartmentNumberInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                openApartmentByNumber();
            }
        });
    }
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
        const apartmentsForSubtitle = Array.isArray(state.filteredApartments) && state.filteredApartments.length
            ? state.filteredApartments
            : (Array.isArray(state.allApartments) ? state.allApartments : []);
        const propName = state.currentPropertyType === 'апартаменты' ? 'апартаментов' : 'квартир';
        setPageTitle(complex.name, `${apartmentsForSubtitle.length} ${propName}`);
    }
    
    showTab('complex-detail');
    updateHeader(true, false);
    showDelayedComplexPrintButton();
    updateDesktopFilterButtons();

    if (state.gridNeedsRerender) {
        state.gridNeedsRerender = false;
        renderCurrentApartmentGrid();
    }
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
    state.allApartments = [];
    state.filteredApartments = [];
    state.currentDefects = [];
    state.apartmentsCacheComplexId = null;
    apartmentsRequestPromise = null;
    apartmentsRequestComplexId = null;
    defectsRequestPromise = null;
    defectsRequestComplexId = null;
    state.gridNeedsRerender = false;
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
    if (elements.mobileApartmentStatusSelect) {
        elements.mobileApartmentStatusSelect.value = getMobileApartmentStatusValue();
    }
}

function getMobileApartmentStatusValue() {
    const status = state.currentApartmentData?.access_status || '';
    return status === 'available' ? '' : status;
}

function handleMobileApartmentStatusChange(status) {
    if (!state.currentApartment) return;

    if (!status) {
        syncApartmentStatusButtons('');
        applyApartmentStatusLocally('available');
        saveStatus('available');
        return;
    }

    setStatus(status);
}

function resetPendingAccessStatus() {
    state.pendingAccessStatus = null;
    syncApartmentStatusButtons(state.currentApartmentData?.access_status || '');
}

async function openApartmentByNumber() {
    if (!state.currentComplex) return;

    const input = elements.mobileApartmentNumberInput;
    const rawValue = input?.value?.trim();
    const apartmentNumber = Number(rawValue);

    if (!rawValue || Number.isNaN(apartmentNumber)) {
        showToast('Введите номер квартиры', 'error');
        return;
    }

    let apartment = (state.filteredApartments || []).find((entry) => Number(entry.number) === apartmentNumber);

    if (!apartment) {
        try {
            const apartments = await ensureCurrentComplexApartmentsLoaded();
            apartment = apartments.find((entry) => Number(entry.number) === apartmentNumber);
        } catch (err) {
            console.error(err);
            showToast('Ошибка загрузки квартир', 'error');
            return;
        }
    }

    if (!apartment) {
        showToast(`Квартира ${apartmentNumber} не найдена`, 'error');
        return;
    }

    if (input) input.value = '';
    showApartmentDetail(apartment.id);
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
    if (elements.complexPrintBtn && !shouldShowComplexPrintButton()) {
        hideDelayedComplexPrintButton();
    }
    if (elements.editComplexBtn) elements.editComplexBtn.style.display = 'none';
    if (elements.deleteComplexBtn) elements.deleteComplexBtn.style.display = 'none';
}

async function ensureCurrentComplexDefectsLoaded(force = false) {
    if (!state.currentComplex) return [];
    if (!force && Array.isArray(state.currentDefects) && state.currentDefects.length) {
        return state.currentDefects;
    }

    if (!force && defectsRequestPromise && defectsRequestComplexId === state.currentComplex) {
        return defectsRequestPromise;
    }

    const complexId = state.currentComplex;
    defectsRequestComplexId = complexId;
    defectsRequestPromise = (async () => {
        const defectsRes = await fetch(`/api/complexes/${complexId}/defects`, { cache: 'no-store' });
        if (!defectsRes.ok) {
            throw new Error(`defects request failed: ${defectsRes.status}`);
        }

        const defects = await defectsRes.json();
        if (state.currentComplex === complexId) {
            state.currentDefects = defects;
        }
        return defects;
    })();

    try {
        return await defectsRequestPromise;
    } finally {
        if (defectsRequestComplexId === complexId) {
            defectsRequestPromise = null;
            defectsRequestComplexId = null;
        }
    }
}

function hasCurrentComplexApartmentsCache() {
    return state.apartmentsCacheComplexId === state.currentComplex && Array.isArray(state.allApartments);
}

async function ensureCurrentComplexApartmentsLoaded(force = false) {
    if (!state.currentComplex) return [];
    if (!force && hasCurrentComplexApartmentsCache()) {
        return state.allApartments;
    }

    if (!force && apartmentsRequestPromise && apartmentsRequestComplexId === state.currentComplex) {
        return apartmentsRequestPromise;
    }

    const complexId = state.currentComplex;
    apartmentsRequestComplexId = complexId;
    apartmentsRequestPromise = (async () => {
        const res = await fetch(`/api/complexes/${complexId}/apartments`, { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`apartments request failed: ${res.status}`);
        }

        const apartments = await res.json();
        if (state.currentComplex === complexId) {
            state.allApartments = apartments;
            state.apartmentsCacheComplexId = complexId;
        }
        return apartments;
    })();

    try {
        return await apartmentsRequestPromise;
    } finally {
        if (apartmentsRequestComplexId === complexId) {
            apartmentsRequestPromise = null;
            apartmentsRequestComplexId = null;
        }
    }
}

function getSelectedSectionIds() {
    const filterOptions = document.getElementById('filterOptions');
    const selectedItems = filterOptions ? filterOptions.querySelectorAll('.filter-item.selected') : [];
    const allItems = filterOptions ? filterOptions.querySelectorAll('.filter-item') : [];
    const allSelected = selectedItems.length === 0 || selectedItems.length === allItems.length;

    if (allSelected) return [];

    return Array.from(selectedItems)
        .map((item) => Number(item.dataset.section))
        .filter((value) => !Number.isNaN(value));
}

function applyApartmentFilters(apartments) {
    let filtered = Array.isArray(apartments) ? [...apartments] : [];
    const selectedSectionIds = getSelectedSectionIds();
    const search = document.getElementById('searchApt')?.value || '';
    const searchNumbers = parseApartmentNumbers(search);
    const catFilter = document.getElementById('defectCategoryFilter')?.value;
    const statusFilter = document.getElementById('defectStatusFilter')?.value;

    if (selectedSectionIds.length > 0) {
        filtered = filtered.filter((apartment) => selectedSectionIds.includes(Number(apartment.section_id)));
    }

    if (catFilter || statusFilter) {
        const filteredIds = new Set();

        state.currentDefects.forEach((defect) => {
            if (catFilter && defect.category !== catFilter) return;
            if (statusFilter === 'recorded' && defect.status !== 'recorded') return;
            if (statusFilter === 'in_progress' && defect.status !== 'in_progress') return;
            if (statusFilter === 'on_review' && defect.status !== 'on_review') return;
            if (statusFilter === 'completed' && !isClosedDefectStatus(defect.status)) return;
            filteredIds.add(defect.apartment_id);
        });

        filtered = filtered.filter((apartment) => filteredIds.has(apartment.id));
    }

    const filterConditions = [];
    
    if (state.activeAccessFilters && state.activeAccessFilters.length > 0) {
        filterConditions.push((apartment) => {
            return state.activeAccessFilters.some((filter) => {
                if (filter === 'owner_accepted') {
                    return isAcceptedApartment(apartment);
                }
                if (filter === 'no_access') {
                    return isNoAccessApartment(apartment);
                }
                return apartment.access_status === filter;
            });
        });
    }

    if (state.defectsOnly) {
        filterConditions.push(countsAsDefectApartment);
    }

    if (state.reviewOnly) {
        filterConditions.push((apartment) => {
            if (Number(apartment.on_review_defects_count || 0) <= 0) return false;
            if (state.defectsOnly) return true;
            return !countsAsDefectApartment(apartment);
        });
    }

    if (state.restorationOnly) {
        filterConditions.push((apartment) => apartmentNeedsRestoration(apartment.id));
    }

    if (filterConditions.length > 0) {
        filtered = filtered.filter((apartment) => {
            return filterConditions.every((condition) => condition(apartment));
        });
    }

    if (searchNumbers) {
        filtered = filtered.filter((apartment) => searchNumbers.has(Number(apartment.number)));
    }

    return filtered;
}

function updateApartmentListSubtitle(apartments) {
    const propName = state.currentPropertyType === 'апартаменты' ? 'апартаментов' : 'квартир';
    const pageSubtitle = document.getElementById('pageSubtitle');
    if (pageSubtitle) {
        pageSubtitle.textContent = `${apartments.length} ${propName}`;
    }
}

function renderCurrentApartmentGrid() {
    const catFilter = document.getElementById('defectCategoryFilter')?.value;
    const statusFilter = document.getElementById('defectStatusFilter')?.value;
    const needsComplexDefects = Boolean(catFilter || statusFilter || state.restorationOnly);

    if (!hasCurrentComplexApartmentsCache() || (needsComplexDefects && !state.currentDefects.length)) {
        loadApartments();
        return;
    }

    const filteredApartments = applyApartmentFilters(state.allApartments || []);
    state.filteredApartments = Array.isArray(filteredApartments) ? [...filteredApartments] : [];
    updateApartmentListSubtitle(filteredApartments);
    renderApartments(filteredApartments);
}

function getApartmentById(apartmentId) {
    return (state.allApartments || []).find((apartment) => apartment.id === apartmentId)
        || (state.filteredApartments || []).find((apartment) => apartment.id === apartmentId)
        || null;
}

function syncCurrentApartmentSummaryFromDefects() {
    if (!state.currentApartment || !Array.isArray(state.currentApartmentData?.defects)) return;
 
    const defects = state.currentApartmentData.defects;
    const recordedCount = defects.filter((defect) => defect.status === 'recorded').length;
    const inProgressCount = defects.filter((defect) => defect.status === 'in_progress').length;
    const onReviewCount = defects.filter((defect) => defect.status === 'on_review').length;
    const restorationCount = defects.filter((defect) => (defect.restoration === 1 || defect.restoration === true) && defect.restoration_completed !== 1).length;
    const activeCount = recordedCount + inProgressCount + restorationCount;

    const updates = {
        recorded_defects_count: recordedCount,
        in_progress_defects_count: inProgressCount,
        on_review_defects_count: onReviewCount,
        active_defects_count: activeCount
    };

    updateApartmentSummaryCache(state.currentApartment, updates);

    if (state.currentApartmentData) {
        Object.assign(state.currentApartmentData, updates);
    }

    const apartment = getApartmentById(state.currentApartment);
    if (apartment) {
        Object.assign(apartment, updates);
    }

    state.gridNeedsRerender = true;
    
    if (state.currentApartment) {
        refreshApartmentTile(state.currentApartment);
    }
}

async function syncApartmentAfterDefectCollectionChange() {
    if (!state.currentApartment) return;

    try {
        await ensureCurrentComplexApartmentsLoaded(true);
    } catch (err) {
        console.error('Apartments sync failed:', err);
    }

    if (state.currentComplex) {
        try {
            await ensureCurrentComplexDefectsLoaded(true);
        } catch (err) {
            console.error('Defects sync failed:', err);
        }
    }

    state.gridNeedsRerender = true;

    const statsModal = document.getElementById('statsModal');
    const shouldRefreshStats = Boolean(statsModal?.classList.contains('active') && state.currentComplex);

    await showApartmentDetail(state.currentApartment);

    if (shouldRefreshStats) {
        refreshStatsModal();
    }
}

function syncCurrentApartmentGridAfterAccessChange() {
    const apartment = getApartmentById(state.currentApartment);
    if (!apartment) return;

    const needsFullGridRerender = Boolean(state.accessFilter);
    if (needsFullGridRerender) {
        state.gridNeedsRerender = true;
        return;
    }

    refreshApartmentTile(apartment.id);
    updateStatsPanel(state.filteredApartments);
    refreshApartmentSectionSummary(apartment.id);
}

function refreshApartmentTile(apartmentId) {
    const apartment = getApartmentById(apartmentId);
    if (!apartment) return;

    const catFilter = document.getElementById('defectCategoryFilter')?.value;
    const propFull = state.currentPropertyType === 'апартаменты' ? 'апартамент' : 'квартира';
    const tiles = document.querySelectorAll(`.apt[data-id="${apartmentId}"]`);

    tiles.forEach((tile) => {
        const wrapper = tile.closest('.apt-wrap');
        if (!wrapper) return;
        wrapper.outerHTML = renderApartmentTile(apartment, propFull, catFilter);
    });
}

function refreshApartmentSectionSummary(apartmentId) {
    const apartment = getApartmentById(apartmentId);
    if (!apartment) return;

    const tile = document.querySelector(`.apt[data-id="${apartmentId}"]`);
    const sectionCard = tile?.closest('.section-card-mobile-flat');
    if (!sectionCard) return;

    const summary = sectionCard.querySelector('.section-mobile-summary');
    if (!summary) return;

    const sectionApartments = (state.filteredApartments || []).filter(
        (entry) => Number(entry.section_id) === Number(apartment.section_id)
    );
    const propFull = state.currentPropertyType === 'апартаменты' ? 'апартамент' : 'квартира';
    const issueCount = sectionApartments.filter((entry) => countsAsDefectApartment(entry)).length;
    const acceptedCount = sectionApartments.filter((entry) => isAcceptedApartment(entry)).length;
    const inProgressCount = sectionApartments.filter((entry) => entry.access_status === 'in_progress').length;

    summary.innerHTML = `
        <span>${sectionApartments.length} ${propFull === 'апартамент' ? 'ап.' : 'кв.'}</span>
        ${issueCount ? `<span>${issueCount} с замеч.</span>` : ''}
        ${inProgressCount ? `<span>${inProgressCount} в работе</span>` : ''}
        ${acceptedCount ? `<span>${acceptedCount} приняты</span>` : ''}
    `;
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
    if (categoriesRequestPromise) {
        return categoriesRequestPromise;
    }

    categoriesRequestPromise = (async () => {
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
    })();

    try {
        return await categoriesRequestPromise;
    } finally {
        categoriesRequestPromise = null;
    }
}

async function loadContractors(selectedId = '') {
    if (contractorsRequestPromise) {
        await contractorsRequestPromise;
        const select = document.getElementById('defectContractorId');
        if (select) select.innerHTML = renderContractorOptions(selectedId);
        return;
    }

    contractorsRequestPromise = (async () => {
    try {
        const res = await fetch('/api/contractors');
        const data = await res.json();
        state.contractors = (data.contractors || []).map(c => ({
            ...c,
            full_name: c.name || ''
        }));
    } catch (err) {
        console.error('Error loading contractors:', err);
    }
    })();

    try {
        await contractorsRequestPromise;
        const select = document.getElementById('defectContractorId');
        if (select) select.innerHTML = renderContractorOptions(selectedId);
    } finally {
        contractorsRequestPromise = null;
    }
}

async function loadExecutors(selectedValue = '') {
    if (executorsRequestPromise) {
        await executorsRequestPromise;
        refreshExecutorSelects(selectedValue);
        return;
    }

    executorsRequestPromise = (async () => {
        try {
            const res = await fetch('/api/executors');
            const data = await res.json();
            state.executors = data.executors || [];
        } catch (err) {
            console.error('Error loading executors:', err);
        }
    })();

    try {
        await executorsRequestPromise;
        refreshExecutorSelects(selectedValue);
    } finally {
        executorsRequestPromise = null;
    }
}

function renderExecutorOptions(selectedValue = '') {
    const normalizedValue = String(selectedValue || '').trim();
    const knownValues = new Set(state.executors.map((executor) => String(executor.display_name || '').trim()).filter(Boolean));
    const options = ['<option value="">Не назначен</option>'];

    if (normalizedValue && !knownValues.has(normalizedValue)) {
        options.push(`<option value="${escapeHtml(normalizedValue)}" selected>${escapeHtml(normalizedValue)}</option>`);
    }

    state.executors.forEach((executor) => {
        const displayName = String(executor.display_name || '').trim();
        if (!displayName) return;
        options.push(`<option value="${escapeHtml(displayName)}" ${displayName === normalizedValue ? 'selected' : ''}>${escapeHtml(displayName)}</option>`);
    });

    return options.join('');
}

function refreshExecutorSelects(selectedValue = '') {
    const createSelect = document.getElementById('defectExecutorSelect');
    if (createSelect) {
        const currentValue = selectedValue || createSelect.value || '';
        createSelect.innerHTML = renderExecutorOptions(currentValue);
        createSelect.value = currentValue;
        updateDefectExecutorSelectAppearance(createSelect);
    }

    document.querySelectorAll('select[id^="defectExecutor_"]').forEach((select) => {
        const currentValue = select.value || '';
        const defectId = Number(String(select.id || '').replace('defectExecutor_', ''));
        const defect = state.currentApartmentData?.defects?.find((item) => item.id === defectId);
        select.innerHTML = renderDefectExecutorOptions({ ...(defect || {}), executor: currentValue || defect?.executor || '' });
        select.value = currentValue;
        updateDefectExecutorSelectAppearance(select);
    });
}

function updateDefectExecutorSelectAppearance(select) {
    if (!select) return;
    select.classList.toggle('is-placeholder', !String(select.value || '').trim());
}

function renderExecutorRegistryList() {
    const container = document.getElementById('executorRegistryList');
    if (!container) return;

    if (!state.executors.length) {
        container.innerHTML = '<div class="executor-registry-empty">Исполнителей пока нет</div>';
        return;
    }

    container.innerHTML = state.executors.map((executor) => `
        <div class="executor-registry-item">
            <div class="executor-registry-item-head">
                <div>
                    <button type="button" class="executor-registry-title executor-registry-title-btn" onclick="showExecutorResponsibleReportModal(${executor.id})">${escapeHtml(executor.display_name || executor.full_name || '')}</button>
                </div>
                <div class="executor-registry-item-actions">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="editExecutor(${executor.id})">Ред.</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteExecutor(${executor.id})">Удалить</button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderExecutorResponsibleReportContent(report) {
    const propertyLabel = report.property_type === 'апартаменты' ? 'Апартамент' : 'Квартира';
    if (!(report.apartments || []).length) {
        return '<div class="executor-report-empty">Нет непринятых замечаний, назначенных исполнителю.</div>';
    }

    const rowsHtml = report.apartments.flatMap((entry) => {
        const apartment = entry.apartment || {};
        const apartmentLabel = `${propertyLabel} ${apartment.number || '—'}`;
        const meta = [
            apartment.section_number ? `Секция ${apartment.section_number}` : '',
            apartment.floor !== null && apartment.floor !== undefined ? `Этаж ${apartment.floor}` : ''
        ].filter(Boolean).join(' ');

        const defects = entry.categories.flatMap((categoryEntry) => categoryEntry.defects.map((defect) => ({
            category: categoryEntry.category || '',
            location: defect.location || 'Без локации',
            items: defect.items || [],
            status: defect.status || '',
            status_label: defect.status_label || defect.status || '',
        })));

        return defects.map((defect, index) => `
            <tr>
                <td class="filtered-defects-apartment-cell">${index === 0 ? `${escapeHtml(apartmentLabel)}${meta ? `<div class="filtered-defects-apartment-meta">${escapeHtml(meta)}</div>` : ''}` : ''}</td>
                <td>${escapeHtml(defect.category)}${defect.location ? `<div class="filtered-defects-apartment-meta">${escapeHtml(defect.location)}</div>` : ''}</td>
                <td><div class="filtered-defect-items">${defect.items.length ? defect.items.map((item) => `<div>${escapeHtml(item)}</div>`).join('') : '<div>Без текста</div>'}</div></td>
                <td><span class="filtered-defect-status defect-status-badge ${getDefectStatusBadgeClass(defect.status)}">${escapeHtml(getDefectStatusLabel(defect.status))}</span></td>
            </tr>
        `);
    }).join('');

    return `
        <div class="filtered-defects-table-wrap executor-report-table-wrap">
            <table class="filtered-defects-table filtered-defects-table-flat">
                <thead>
                    <tr>
                        <th>Квартира</th>
                        <th>Место</th>
                        <th>Замечание</th>
                        <th>Статус</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}

function renderModalPaneHeader({ title, subtitle = '', actions = '', actionsClass = '' }) {
    return `
        <div class="modal-pane-header${actions ? ' has-actions' : ''}">
            <div class="modal-pane-copy">
                <div class="modal-pane-title">${escapeHtml(title || '')}</div>
                ${subtitle ? `<div class="modal-pane-subtitle">${escapeHtml(subtitle)}</div>` : ''}
            </div>
            ${actions ? `<div class="modal-pane-actions ${actionsClass}">${actions}</div>` : ''}
        </div>
    `;
}

function resetExecutorRegistryForm() {
    const form = document.getElementById('executorRegistryForm');
    const submitBtn = document.getElementById('executorRegistrySubmitBtn');
    const cancelBtn = document.getElementById('executorRegistryCancelEditBtn');
    const editingIdField = document.getElementById('executorEditingId');

    if (form) form.reset();
    if (editingIdField) editingIdField.value = '';
    if (submitBtn) submitBtn.textContent = 'Добавить';
    if (cancelBtn) cancelBtn.style.display = 'none';
}

function syncResponsibleAssignmentTypeVisibility() {
    const typeField = document.getElementById('executorAssignmentResponsibleType');
    const nameLabel = document.getElementById('executorAssignmentNameLabel');
    const nameInput = document.getElementById('executorAssignmentExecutor');
    const isLegal = (typeField?.value || 'legal') === 'legal';

    if (nameLabel) nameLabel.textContent = isLegal ? 'Компания' : 'ФИО';
    if (nameInput) {
        nameInput.placeholder = isLegal ? 'Название компании' : 'ФИО';
    }
}

async function setExecutorRegistryMode(mode = 'executors') {
    const normalizedMode = mode === 'responsible' ? 'responsible' : 'executors';
    if (normalizedMode === 'responsible') {
        const isReady = await prepareResponsibleAssignmentForm();
        if (!isReady) return;
    }

    const executorsPanel = document.getElementById('executorRegistryExecutorsPanel');
    const responsiblePanel = document.getElementById('executorRegistryResponsiblePanel');
    const executorsBtn = document.getElementById('executorRegistryModeExecutors');
    const responsibleBtn = document.getElementById('executorRegistryModeResponsible');
    const executorsSubmitBtn = document.getElementById('executorRegistrySubmitBtn');
    const responsibleSubmitBtn = document.getElementById('executorAssignmentSubmitBtn');

    if (executorsPanel) executorsPanel.style.display = normalizedMode === 'executors' ? 'block' : 'none';
    if (responsiblePanel) responsiblePanel.style.display = normalizedMode === 'responsible' ? 'block' : 'none';
    if (executorsBtn) executorsBtn.classList.toggle('is-active', normalizedMode === 'executors');
    if (responsibleBtn) responsibleBtn.classList.toggle('is-active', normalizedMode === 'responsible');
    if (executorsSubmitBtn) executorsSubmitBtn.style.display = normalizedMode === 'executors' ? 'inline-flex' : 'none';
    if (responsibleSubmitBtn) responsibleSubmitBtn.style.display = normalizedMode === 'responsible' ? 'inline-flex' : 'none';
}

async function prepareResponsibleAssignmentForm() {
    if (!state.currentComplex) return false;

    const apartments = getExecutorAssignmentApartments();
    if (!apartments.length) {
        showToast('Нет квартир для выбора', 'warning');
        return false;
    }

    if (!state.categories.length) {
        await loadCategories();
    }

    const categorySelect = document.getElementById('executorAssignmentCategory');
    const executorInput = document.getElementById('executorAssignmentExecutor');
    const summary = document.getElementById('executorAssignmentSummary');
    const responsibleType = document.getElementById('executorAssignmentResponsibleType');
    if (!categorySelect || !executorInput || !summary || !responsibleType) return false;

    state.executorAssignmentSelectedApartmentIds = apartments.map((apartment) => apartment.id);
    renderExecutorAssignmentApartmentList();

    const categoryFilter = document.getElementById('defectCategoryFilter')?.value || '';
    categorySelect.innerHTML = '<option value="">Выберите</option>' + state.categories.map((category) => (
        `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
    )).join('');
    categorySelect.value = categoryFilter;

    const complexName = state.currentComplexData?.name || 'ЖК';
    summary.textContent = `${complexName}: текущая выборка из ${apartments.length} ${state.currentPropertyType === 'апартаменты' ? 'апартаментов' : 'квартир'}`;
    responsibleType.value = 'legal';
    executorInput.value = '';
    syncResponsibleAssignmentTypeVisibility();
    return true;
}

function editExecutor(executorId) {
    const executor = state.executors.find((item) => Number(item.id) === Number(executorId));
    if (!executor) return;

    const editingIdField = document.getElementById('executorEditingId');
    const submitBtn = document.getElementById('executorRegistrySubmitBtn');
    const cancelBtn = document.getElementById('executorRegistryCancelEditBtn');
    const fullNameField = document.getElementById('executorFullName');
    const legalNameField = document.getElementById('executorLegalEntityName');

    if (editingIdField) editingIdField.value = String(executor.id);
    if (submitBtn) submitBtn.textContent = 'Сохранить';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    if (fullNameField) fullNameField.value = executor.full_name || '';
    if (legalNameField) legalNameField.value = executor.legal_entity_name || '';
    if (fullNameField) fullNameField.focus();
}

async function deleteExecutor(executorId) {
    const executor = state.executors.find((item) => Number(item.id) === Number(executorId));
    if (!executor) return;
    if (!confirm(`Удалить исполнителя "${executor.display_name || executor.full_name}"?`)) return;

    try {
        const res = await fetch(`/api/executors/${executorId}`, { method: 'DELETE' });
        if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload?.detail || 'Ошибка удаления исполнителя');
        }
        await loadExecutors();
        renderExecutorRegistryList();
        showToast('Исполнитель удален', 'success');
    } catch (err) {
        showToast(err.message || 'Ошибка удаления исполнителя', 'error');
    }
}

function getExecutorById(executorId) {
    return state.executors.find((item) => Number(item.id) === Number(executorId)) || null;
}

async function fetchExecutorResponsibleReport(executorId) {
    if (!state.currentComplex) throw new Error('ЖК не выбран');
    const executor = getExecutorById(executorId);
    if (!executor) throw new Error('Исполнитель не найден');

    const params = new URLSearchParams();
    params.set('executor_name', executor.display_name || executor.full_name || '');
    const res = await fetch(`/api/complexes/${state.currentComplex}/executor-report?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.detail || 'Ошибка загрузки отчета');
    }
    return res.json();
}

async function printExecutorResponsibleReport(executorId) {
    try {
        const report = await fetchExecutorResponsibleReport(executorId);
        const win = window.open('', '_blank');
        if (!win) return;
        const contentHtml = renderExecutorResponsibleReportContent(report);

        win.document.write(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtml(report.executor_name || 'Отчет')}</title>
                <style>
                    * { box-sizing: border-box; }
                    @page { margin: 10mm; size: A4 portrait; }
                    body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; background: #fff; }
                    .sheet { max-width: 190mm; margin: 0 auto; }
                    h1 { margin: 0 0 6px; font-size: 24px; line-height: 1.1; }
                    .meta { margin-bottom: 18px; font-size: 12px; color: #475569; line-height: 1.55; }
                    .filtered-defects-table-wrap { border: 1px solid #111; }
                    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                    th, td { border: 1px solid #111; padding: 8px 10px; text-align: left; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; font-size: 12px; line-height: 1.45; }
                    th { background: #eef2f7; color: #334155; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
                    .filtered-defects-apartment-cell { width: 180px; font-weight: 700; }
                    .filtered-defects-apartment-meta { margin-top: 4px; font-size: 11px; color: #64748b; font-weight: 400; }
                    .filtered-defect-items { display: flex; flex-direction: column; gap: 4px; }
                    .filtered-defect-status { display: inline-flex; font-weight: 700; }
                    .executor-report-empty { font-size: 13px; color: #475569; }
                    tr { page-break-inside: avoid; }
                </style>
            </head>
            <body>
                <div class="sheet">
                    <h1>${escapeHtml(report.complex_name || '')}</h1>
                    <div class="meta">Ответственный: ${escapeHtml(report.executor_name || '')}<br>Сформировано: ${escapeHtml(report.generated_at || '')}</div>
                    ${contentHtml}
                </div>
            </body>
            </html>
        `);
        win.document.close();
        setTimeout(() => win.print(), 120);
    } catch (err) {
        showToast(err.message || 'Ошибка печати отчета', 'error');
    }
}

function exportExecutorResponsibleJpg(executorId) {
    if (!state.currentComplex) return;
    const executor = getExecutorById(executorId);
    if (!executor) return;
    const params = new URLSearchParams();
    params.set('executor_name', executor.display_name || executor.full_name || '');
    window.open(`/api/complexes/${state.currentComplex}/executor-report/jpg?${params.toString()}`, '_blank');
}

async function showExecutorResponsibleReportModal(executorId) {
    const modal = document.getElementById('executorReportModal');
    const body = document.getElementById('executorReportBody');
    if (!modal || !body) return;

    state.currentExecutorReportId = executorId;
    const executor = getExecutorById(executorId);
    const executorTitle = executor?.display_name || executor?.full_name || 'Исполнитель';
    body.innerHTML = `
        ${renderModalPaneHeader({
            title: executorTitle,
            subtitle: 'Сводка по назначенным замечаниям с экспортом в JPG и печатью',
            actions: `
                <button class="btn btn-secondary" onclick="exportCurrentExecutorResponsibleJpg()">JPG</button>
                <button class="btn btn-secondary" onclick="printCurrentExecutorResponsibleReport()">Печать</button>
            `,
            actionsClass: 'filtered-defects-header-actions'
        })}
        <div class="executor-report-loading">Загрузка...</div>
    `;
    modal.classList.add('active');

    try {
        const report = await fetchExecutorResponsibleReport(executorId);
        body.innerHTML = `
            ${renderModalPaneHeader({
                title: report.executor_name || executorTitle,
                subtitle: 'Сводка по назначенным замечаниям с экспортом в JPG и печатью',
                actions: `
                    <button class="btn btn-secondary" onclick="exportCurrentExecutorResponsibleJpg()">JPG</button>
                    <button class="btn btn-secondary" onclick="printCurrentExecutorResponsibleReport()">Печать</button>
                `,
                actionsClass: 'filtered-defects-header-actions'
            })}
            ${renderExecutorResponsibleReportContent(report)}
        `;
    } catch (err) {
        body.innerHTML = `
            ${renderModalPaneHeader({
                title: executorTitle,
                subtitle: 'Сводка по назначенным замечаниям с экспортом в JPG и печатью',
                actions: `
                    <button class="btn btn-secondary" onclick="exportCurrentExecutorResponsibleJpg()">JPG</button>
                    <button class="btn btn-secondary" onclick="printCurrentExecutorResponsibleReport()">Печать</button>
                `,
                actionsClass: 'filtered-defects-header-actions'
            })}
            <div class="executor-report-empty">${escapeHtml(err.message || 'Ошибка загрузки отчета')}</div>
        `;
    }
}

function closeExecutorResponsibleReportModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('executorReportModal');
    if (modal) modal.classList.remove('active');
    state.currentExecutorReportId = null;
}

function printCurrentExecutorResponsibleReport() {
    if (!state.currentExecutorReportId) return;
    printExecutorResponsibleReport(state.currentExecutorReportId);
}

function exportCurrentExecutorResponsibleJpg() {
    if (!state.currentExecutorReportId) return;
    exportExecutorResponsibleJpg(state.currentExecutorReportId);
}

function renderDefectExecutorOptions(defect) {
    const selectedValue = String(defect?.executor || '').trim();
    const options = ['<option value="">Исполнитель</option>'];
    const seen = new Set(['']);

    const responsibleName = String(defect?.responsible_name || '').trim();
    if (responsibleName) {
        seen.add(responsibleName);
        options.push(`<option value="${escapeHtml(responsibleName)}" ${responsibleName === selectedValue ? 'selected' : ''}>Ответственный: ${escapeHtml(responsibleName)}</option>`);
    }

    state.executors.forEach((executor) => {
        const displayName = String(executor.display_name || '').trim();
        if (!displayName || seen.has(displayName)) return;
        seen.add(displayName);
        options.push(`<option value="${escapeHtml(displayName)}" ${displayName === selectedValue ? 'selected' : ''}>${escapeHtml(displayName)}</option>`);
    });

    if (selectedValue && !seen.has(selectedValue)) {
        options.push(`<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`);
    }

    return options.join('');
}

async function showExecutorRegistryModal() {
    await loadExecutors();
    renderExecutorRegistryList();
    const modal = document.getElementById('executorRegistryModal');
    const fullNameInput = document.getElementById('executorFullName');
    resetExecutorRegistryForm();
    await setExecutorRegistryMode('executors');
    if (modal) modal.classList.add('active');
    if (fullNameInput) fullNameInput.focus();
}

function closeExecutorRegistryModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('executorRegistryModal');
    if (modal) modal.classList.remove('active');
}

async function submitExecutorRegistryForm(event) {
    event.preventDefault();

    const editingId = document.getElementById('executorEditingId')?.value?.trim() || '';
    const fullName = document.getElementById('executorFullName')?.value?.trim() || '';
    const legalEntityName = document.getElementById('executorLegalEntityName')?.value?.trim() || '';

    if (!fullName && !legalEntityName) {
        showToast('Укажите ФИО или название юридического лица', 'warning');
        return;
    }

    const entityType = legalEntityName ? 'legal' : 'individual';

    const body = new URLSearchParams();
    body.set('full_name', fullName);
    body.set('entity_type', entityType);
    body.set('legal_entity_name', legalEntityName);

    try {
        const res = await fetch(editingId ? `/api/executors/${editingId}` : '/api/executors', {
            method: editingId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload?.detail || 'Ошибка сохранения исполнителя');
        }

        const executor = await res.json();
        await loadExecutors(executor.display_name || executor.full_name || '');
        renderExecutorRegistryList();
        resetExecutorRegistryForm();
        showToast(editingId ? 'Исполнитель обновлен' : 'Исполнитель добавлен', 'success');
    } catch (err) {
        showToast(err.message || 'Ошибка сохранения исполнителя', 'error');
    }
}

function renderContractorOptions(selectedId = '') {
    const normalizedId = String(selectedId || '');
    return [
        '<option value="">Не назначен</option>',
        ...state.contractors.map(contractor => `
            <option value="${contractor.id}" ${String(contractor.id) === normalizedId ? 'selected' : ''}>${escapeHtml(contractor.full_name || '')}</option>
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
                for (let i = 1; i <= 14; i++) {
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
    if (windowNumber === null || windowNumber === undefined || windowNumber === '') return '';
    return `Об${escapeHtml(windowNumber)}`;
}

function getDoorVariantLabel(variant) {
    const normalized = String(variant || '').trim();
    if (normalized === 'Межкомнатная') return 'Межкомнатная';
    if (normalized === 'Входная') return 'Входная';
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
    const rawText = getDefectSummaryText(defect);
    const parts = rawText
        .split(/\r?\n|,/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (!parts.length) return '';
    return parts.map((part) => escapeHtml(part)).join(' <span class="defect-inline-separator">•</span> ');
}

function getDateKey(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).split('T')[0].split(' ')[0];
}

function getDefectItemDateKey(item, defect) {
    return getDateKey(item?.created_at) || getDateKey(defect?.created_at);
}

function renderDefectDateBadges(defect) {
    const items = Array.isArray(defect.items) ? defect.items : [];
    const primaryDateKey = getDateKey(defect.created_at);
    const extraDateKeys = [...new Set(
        items
            .map((item) => getDefectItemDateKey(item, defect))
            .filter((dateKey) => dateKey && dateKey !== primaryDateKey)
    )].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return extraDateKeys.map((dateKey) => {
        const formattedDate = formatDate(dateKey);
        return `<span class="defect-compact-date defect-compact-date-chip" onmouseenter="setDefectDateHover(${defect.id}, '${escapeHtml(dateKey)}', true)" onmouseleave="setDefectDateHover(${defect.id}, '${escapeHtml(dateKey)}', false)">${formattedDate || '—'}</span>`;
    }).join('');
}

function renderDefectRestorationBadge(defectId, isCompleted) {
    return `<button type="button" class="defect-restoration-badge ${isCompleted ? 'is-completed' : ''}" onclick="toggleDefectRestorationCompleted(${defectId}, event)">Р${isCompleted ? '<span class="defect-restoration-check">&#10003;</span>' : ''}</button>`;
}

function getSortedDefectItems(defect) {
    return Array.isArray(defect.items) && defect.items.length
        ? [...defect.items].sort((a, b) => {
            const dateA = a?.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b?.created_at ? new Date(b.created_at).getTime() : 0;
            if (dateA !== dateB) return dateA - dateB;
            return Number(a?.id || 0) - Number(b?.id || 0);
        })
        : [{ id: null, text: getDefectSummaryText(defect), status: defect.status }];
}

function getDefectItemStatusClass(itemStatus) {
    if (itemStatus === 'completed') return 'is-completed';
    if (itemStatus === 'on_review') return 'is-on-review';
    if (itemStatus === 'in_progress') return 'is-in-progress';
    return '';
}

function renderReadonlyDefectItems(defect, baseClass = 'defect-item-token') {
    const items = getSortedDefectItems(defect);
    let itemNumber = 0;
    return items.flatMap((item) => {
        const itemStatus = item.status || 'recorded';
        const contentParts = String(item.text || '')
            .split(/\r?\n|,/) 
            .map((part) => part.trim())
            .filter(Boolean);
        const normalizedParts = contentParts.length ? contentParts : [String(item.text || '').trim()];

        return normalizedParts
            .filter(Boolean)
            .map((part) => {
                itemNumber += 1;
                return `<span class="${baseClass} ${getDefectItemStatusClass(itemStatus)}"><span class="defect-item-number">${itemNumber}.</span> ${escapeHtml(part)}</span>`;
            });
    }).join(' ');
}

function getDefectPrintPhotos(defect) {
    const directPhotos = Array.isArray(defect?.photos) ? defect.photos : [];
    const itemPhotos = Array.isArray(defect?.items)
        ? defect.items.flatMap((item) => Array.isArray(item?.photos) ? item.photos : [])
        : [];

    const seen = new Set();
    return [...directPhotos, ...itemPhotos].filter((photo) => {
        const key = `${photo?.id || ''}:${photo?.filename || ''}`;
        if (!photo?.filename || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function renderDefectTextItems(defect) {
    const items = getSortedDefectItems(defect);

    return `
        <span class="defect-text-items">
            ${items.map((item, index) => {
                const itemStatus = item.status || 'recorded';
                const itemDateKey = getDefectItemDateKey(item, defect);
                const isEditableItem = canEditDefectItem(item, defect);
                const contentParts = String(item.text || '')
                    .split(/\r?\n|,/) 
                    .map((part) => part.trim())
                    .filter(Boolean);
                const content = contentParts.length
                    ? contentParts.map((part) => escapeHtml(part)).join(', ')
                    : escapeHtml(String(item.text || ''));
                const itemPhotoUrls = (item.photos || []).map((photo) => `/uploads/${encodeURIComponent(photo.filename)}`);
                const clickHandler = item.id
                    ? `onclick="toggleDefectItemLine(${item.id}, '${itemStatus}', event)"`
                    : '';
                const mouseHandlers = item.id && isEditableItem
                    ? `onmousedown="handleDefectItemMouseDown(${item.id}, event)" onmouseup="handleDefectItemMouseUp(event)" onmouseleave="handleDefectItemMouseCancel(event)"`
                    : '';
                const touchHandlers = item.id && isEditableItem
                    ? `ontouchstart="handleDefectItemTouchStart(${item.id}, event)" ontouchend="handleDefectItemTouchEnd(event)" ontouchmove="handleDefectItemTouchCancel(event)" ontouchcancel="handleDefectItemTouchCancel(event)"`
                    : '';

                return `<button type="button" class="defect-item-token ${isEditableItem ? 'is-editable' : ''} ${getDefectItemStatusClass(itemStatus)}" data-item-id="${item.id || ''}" data-item-date="${escapeHtml(itemDateKey)}" ${clickHandler} ${mouseHandlers} ${touchHandlers}><span class="defect-item-number">${index + 1}.</span> ${content}${itemPhotoUrls.length ? ` <span class="defect-item-photo-icon" title="Открыть фото" onclick='event.stopPropagation(); openDefectPhoto(${JSON.stringify(itemPhotoUrls)}, 0)' aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12"><path d="M4 7h3l1.6-2h7.8L18 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"></path><circle cx="12" cy="13" r="4"></circle></svg><span class="defect-item-photo-count">${itemPhotoUrls.length}</span></span>` : ''}${isEditableItem ? ` <span class="defect-item-edit-icon" title="Редактировать" onclick="startDefectItemEdit(${item.id}, event)" aria-hidden="true">✎</span>` : ''}</button>`;
            }).join(' ')}
        </span>
    `;
}

function canEditDefectItem(item, defect) {
    if (!item?.id) return false;
    if (!item?.created_at) return false;
    const created = new Date(item.created_at);
    const now = new Date();
    return ((now - created) / (1000 * 60 * 60)) <= 24;
}

function collectDefectPhotos(defect) {
    const seen = new Set();
    const photos = [];

    const pushPhoto = (photo) => {
        if (!photo?.filename) return;
        const key = `${photo.id || ''}:${photo.filename}`;
        if (seen.has(key)) return;
        seen.add(key);
        photos.push(photo);
    };

    (defect?.photos || []).forEach(pushPhoto);
    (defect?.items || []).forEach((item) => (item?.photos || []).forEach(pushPhoto));

    return photos;
}

function syncDefectDraftState(id) {
    const defects = state.currentApartmentData?.defects;
    if (!Array.isArray(defects)) return;

    const defect = defects.find((item) => item.id === id);
    if (!defect) return;

    const descriptionField = document.getElementById(`defectDescription_${id}`);
    const commentField = document.getElementById(`defectCommentText_${id}`);
    const executorField = document.getElementById(`defectExecutor_${id}`);

    if (descriptionField) defect.description = descriptionField.value;
    if (commentField) defect.comment_text = commentField.value;
    if (executorField) defect.executor = executorField.value;
}

function setDefectDateHover(defectId, dateKey, isActive) {
    const row = document.querySelector(`.defect-compact-row[data-defect-id="${defectId}"]`);
    if (!row) return;

    row.querySelectorAll('.defect-item-token').forEach((token) => {
        const shouldHighlight = isActive && token.dataset.itemDate === dateKey;
        token.classList.toggle('date-hover-match', shouldHighlight);
    });
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

    if (loadComplexesPromise) {
        return loadComplexesPromise;
    }

    if (loadComplexesController) {
        loadComplexesController.abort();
    }

    const controller = new AbortController();
    loadComplexesController = controller;
    
    loadComplexesPromise = (async () => {
        showLoading(container);
        
        try {
            const res = await fetch('/api/complexes', { signal: controller.signal });
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
            if (err.name === 'AbortError') return;
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">[!]</div>
                    <h3>Ошибка загрузки</h3>
                    <p>Попробуйте обновить страницу</p>
                    <button class="btn btn-primary" onclick="loadComplexes()">Обновить</button>
                </div>
            `;
        } finally {
            if (loadComplexesController === controller) {
                loadComplexesController = null;
            }
        }
    })();

    try {
        return await loadComplexesPromise;
    } finally {
        loadComplexesPromise = null;
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
    const isAnotherComplex = state.currentComplex !== id;
    state.currentComplex = id;
    state.currentPropertyType = 'квартиры';
    setPageTitle('Загрузка...', '');

    if (isAnotherComplex) {
        state.allApartments = [];
        state.filteredApartments = [];
        state.currentDefects = [];
        state.apartmentsCacheComplexId = null;
        apartmentsRequestPromise = null;
        apartmentsRequestComplexId = null;
        defectsRequestPromise = null;
        defectsRequestComplexId = null;
        state.gridNeedsRerender = false;
    }
    
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
    const normalizedInput = String(input || '').trim();
    if (!normalizedInput) return null;
    if (state.parsedSearchCache.input === normalizedInput) {
        return state.parsedSearchCache.numbers;
    }
    
    const numbers = new Set();
    const parts = normalizedInput.split(',');
    
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
    
    const result = numbers.size > 0 ? numbers : null;
    state.parsedSearchCache = { input: normalizedInput, numbers: result };
    return result;
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
    
    const statsModal = document.getElementById('statsModal');
    if (statsModal?.classList.contains('active')) {
        loadStats(document.getElementById('statsBody'), statsModal);
    }
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
    if (searchInput) searchInput.placeholder = 'Пример: 1,3-5,10';
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
    if (loadApartmentsPromise) {
        loadApartmentsQueued = true;
        return loadApartmentsPromise;
    }

    loadApartmentsPromise = (async () => {
    const requestId = ++loadApartmentsRequestId;
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
    
    const shouldShowLoading = !hasCurrentComplexApartmentsCache();
    if (shouldShowLoading) {
        showLoading(container);
    }
    
    try {
        let apts = await ensureCurrentComplexApartmentsLoaded();
        if (requestId !== loadApartmentsRequestId) return;
        console.log('Loaded apartments from cache/source:', apts.length);
        
        const catFilter = document.getElementById('defectCategoryFilter')?.value;
        const statusFilter = document.getElementById('defectStatusFilter')?.value;
        const needsComplexDefects = Boolean(catFilter || statusFilter || state.restorationOnly);

        if (needsComplexDefects) {
            try {
                await ensureCurrentComplexDefectsLoaded(false);
                if (requestId !== loadApartmentsRequestId) return;
            } catch (defectsErr) {
                console.error('Defects loading failed:', defectsErr);
                state.currentDefects = [];
            }
        }

        if (elements.defectFilterPanel) {
            elements.defectFilterPanel.style.display = state.defectsOnly ? 'flex' : 'none';
        }

        apts = applyApartmentFilters(apts);
        if (requestId !== loadApartmentsRequestId) return;
        state.filteredApartments = Array.isArray(apts) ? [...apts] : [];
        updateApartmentListSubtitle(apts);
        renderApartments(apts);
        showDelayedComplexPrintButton();
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
    })();

    try {
        return await loadApartmentsPromise;
    } finally {
        loadApartmentsPromise = null;
        if (loadApartmentsQueued) {
            loadApartmentsQueued = false;
            queueMicrotask(() => {
                loadApartments();
            });
        }
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

    if (filter === 'on_review') {
        state.reviewOnly = !state.reviewOnly;
        updateDesktopFilterButtons();
        updateMobileFilterIndicator();
        updateMobileFilterButtons();
        const mobileStatusFilter = document.getElementById('mobileStatusFilter');
        if (mobileStatusFilter && !state.accessFilter) {
            mobileStatusFilter.value = state.reviewOnly ? 'on_review' : '';
        }
        loadApartments();
        return;
    }

    if (filter === 'restoration') {
        state.restorationOnly = !state.restorationOnly;
        updateDesktopFilterButtons();
        updateMobileFilterIndicator();
        updateMobileFilterButtons();
        const mobileStatusFilter = document.getElementById('mobileStatusFilter');
        if (mobileStatusFilter && !state.accessFilter) {
            mobileStatusFilter.value = state.restorationOnly ? 'restoration' : '';
        }
        loadApartments();
        return;
    }

    const filterIndex = state.activeAccessFilters.indexOf(filter);
    if (filterIndex >= 0) {
        state.activeAccessFilters.splice(filterIndex, 1);
    } else {
        state.activeAccessFilters.push(filter);
    }

    const hasAnyFilter = state.activeAccessFilters.length > 0;
    updateDesktopFilterButtons();
    
    // Update mobile filter indicator and buttons
    updateMobileFilterIndicator();
    updateMobileFilterButtons();
    const mobileStatusFilter = document.getElementById('mobileStatusFilter');
    if (mobileStatusFilter) mobileStatusFilter.value = state.activeAccessFilters.length > 0 ? state.activeAccessFilters.join(',') : '';
    
    // Update current filter index for swipe
    if (state.activeAccessFilters.length > 0) {
        const index = FILTERS.indexOf(state.activeAccessFilters[0]);
        if (index >= 0) currentFilterIndex = index;
    }
    
    if (elements.defectFilterPanel) {
        elements.defectFilterPanel.style.display = state.defectsOnly ? 'flex' : 'none';
    }
    
    loadApartments();
}

function updateDesktopFilterButtons() {
    document.querySelectorAll('.pill[data-filter]').forEach((chip) => {
        if (chip.dataset.filter === 'defects') {
            chip.classList.toggle('active', state.defectsOnly);
            return;
        }
        if (chip.dataset.filter === 'on_review') {
            chip.classList.toggle('active', state.reviewOnly);
            return;
        }
        if (chip.dataset.filter === 'restoration') {
            chip.classList.toggle('active', state.restorationOnly);
            return;
        }
        chip.classList.toggle('active', state.activeAccessFilters && state.activeAccessFilters.includes(chip.dataset.filter));
    });
}

function updateMobileFilterIndicator() {
    const indicator = document.getElementById('mobileFilterIndicator');
    if (indicator) {
        const parts = [];
        if (state.activeAccessFilters && state.activeAccessFilters.length > 0) {
            state.activeAccessFilters.forEach((filter) => {
                const index = FILTERS.indexOf(filter);
                parts.push(index >= 0 ? FILTER_NAMES[index] : filter);
            });
        }
        if (state.defectsOnly) parts.push('С замечаниями');
        if (state.restorationOnly) parts.push('Реставрация');
        if (state.reviewOnly) parts.push('На проверке');
        const name = parts.join(' + ') || 'Все';
        indicator.textContent = name;
        indicator.classList.toggle('filter-active', Boolean((state.activeAccessFilters && state.activeAccessFilters.length > 0) || state.defectsOnly || state.reviewOnly || state.restorationOnly));
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
        if (btn.dataset.filter === 'on_review') {
            btn.classList.toggle('active', state.reviewOnly);
            return;
        }
        if (btn.dataset.filter === 'restoration') {
            btn.classList.toggle('active', state.restorationOnly);
            return;
        }
        btn.classList.toggle('active', state.activeAccessFilters && state.activeAccessFilters.includes(btn.dataset.filter));
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

function apartmentNeedsRestoration(apartmentId) {
    return state.currentDefects.some((defect) => (
        defect.apartment_id === apartmentId
        && Number(defect.restoration || 0) === 1
        && Number(defect.restoration_completed || 0) !== 1
    ));
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
    try {
        return localStorage.getItem(COMMENT_AUTHOR_STORAGE_KEY) || '';
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
            localStorage.setItem(COMMENT_AUTHOR_STORAGE_KEY, author);
        } catch (err) {
            // ignore storage errors
        }
    }

    return author;
}

function getAvailableDefectStatuses(currentStatus) {
    if (currentStatus === 'recorded') {
        return ['in_progress', 'on_review', 'completed'];
    }
    if (currentStatus === 'in_progress') {
        return ['on_review', 'completed'];
    }
    return [];
}

function renderDefectStatusOptions(currentStatus) {
    const normalizedCurrentStatus = currentStatus === 'new' ? 'recorded' : currentStatus;
    return getAvailableDefectStatuses(normalizedCurrentStatus).map((value) => `
        <option value="${value}" ${normalizedCurrentStatus === value ? 'selected' : ''}>${getDefectStatusLabel(value)}</option>
    `).join('');
}

function renderDefectStatusButtons(currentStatus, defectId) {
    const normalizedCurrentStatus = currentStatus === 'new' ? 'recorded' : currentStatus;
    return getAvailableDefectStatuses(normalizedCurrentStatus).map((value) => `
        <button
            type="button"
            class="defect-status-option status-${value} ${normalizedCurrentStatus === value ? 'active' : ''}"
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

function calculateDefectStatusFromItems(defect) {
    const itemStatuses = Array.isArray(defect?.items)
        ? defect.items.map((item) => item.status || 'recorded')
        : [];

    if (!itemStatuses.length) return defect?.status || 'recorded';
    if (itemStatuses.some((status) => status === 'in_progress')) return 'in_progress';
    if (itemStatuses.every((status) => status === 'completed')) return 'completed';
    if (itemStatuses.some((status) => status === 'on_review')) return 'on_review';
    return 'recorded';
}

function syncDefectItemStatusState(itemId, status) {
    const defects = state.currentApartmentData?.defects;
    if (!Array.isArray(defects)) return null;

    for (const defect of defects) {
        const item = defect.items?.find((entry) => entry.id === itemId);
        if (!item) continue;
        item.status = status;
        const nextDefectStatus = calculateDefectStatusFromItems(defect);
        defect.status = nextDefectStatus;
        syncDefectStatusState(defect.id, nextDefectStatus);
        return defect;
    }

    return null;
}

function rerenderCurrentApartmentDefects() {
    if (!Array.isArray(state.currentApartmentData?.defects)) return;
    renderDefects(state.currentApartmentData.defects);
}

function getCachedApartmentSummary(apartmentId) {
    if (state.currentApartmentData?.id === apartmentId) {
        const { defects, ...apartment } = state.currentApartmentData;
        return { ...apartment };
    }

    return (state.filteredApartments || []).find((apartment) => apartment.id === apartmentId) || null;
}

const defectItemTouchTimers = new Map();
const DEFECT_ITEM_LONG_PRESS_MS = 450;

async function toggleDefectItemLine(itemId, currentStatus, event) {
    if (event) event.stopPropagation();
    const token = event?.currentTarget;
    if (token?.dataset.longPressTriggered === '1') {
        token.dataset.longPressTriggered = '0';
        return;
    }

    const normalizedStatus = currentStatus === 'new' ? 'recorded' : (currentStatus || 'recorded');
    let nextStatus = 'in_progress';

    if (normalizedStatus === 'in_progress') nextStatus = 'on_review';
    if (normalizedStatus === 'on_review') nextStatus = 'completed';
    if (normalizedStatus === 'completed') nextStatus = 'in_progress';

    if (normalizedStatus === nextStatus) {
        return;
    }
    try {
        const response = await fetch(`/api/defects/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `status=${encodeURIComponent(nextStatus)}`
        });
        if (!response.ok) throw new Error('save failed');
        syncDefectItemStatusState(itemId, nextStatus);
        syncCurrentApartmentSummaryFromDefects();
        rerenderCurrentApartmentDefects();
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

function handleDefectItemTouchStart(itemId, event) {
    const token = event.currentTarget;
    if (!token) return;
    token.dataset.longPressTriggered = '0';
    handleDefectItemTouchCancel(event);
    const timer = setTimeout(() => {
        token.dataset.longPressTriggered = '1';
        startDefectItemEdit(itemId, event);
    }, DEFECT_ITEM_LONG_PRESS_MS);
    defectItemTouchTimers.set(itemId, timer);
}

function handleDefectItemTouchEnd(event) {
    const token = event.currentTarget;
    const itemId = Number(token?.dataset.itemId || 0);
    if (!itemId) return;
    const timer = defectItemTouchTimers.get(itemId);
    if (timer) {
        clearTimeout(timer);
        defectItemTouchTimers.delete(itemId);
    }
}

function handleDefectItemTouchCancel(event) {
    const token = event.currentTarget;
    const itemId = Number(token?.dataset.itemId || 0);
    if (!itemId) return;
    const timer = defectItemTouchTimers.get(itemId);
    if (timer) {
        clearTimeout(timer);
        defectItemTouchTimers.delete(itemId);
    }
}

function handleDefectItemMouseDown(itemId, event) {
    if (event.button !== 0) return;
    const token = event.currentTarget;
    if (!token) return;
    token.dataset.longPressTriggered = '0';
    handleDefectItemMouseCancel(event);
    const timer = setTimeout(() => {
        token.dataset.longPressTriggered = '1';
        startDefectItemEdit(itemId, event);
    }, DEFECT_ITEM_LONG_PRESS_MS);
    defectItemTouchTimers.set(itemId, timer);
}

function handleDefectItemMouseUp(event) {
    const token = event.currentTarget;
    const itemId = Number(token?.dataset.itemId || 0);
    if (!itemId) return;
    const timer = defectItemTouchTimers.get(itemId);
    if (timer) {
        clearTimeout(timer);
        defectItemTouchTimers.delete(itemId);
    }
}

function handleDefectItemMouseCancel(event) {
    const token = event.currentTarget;
    const itemId = Number(token?.dataset.itemId || 0);
    if (!itemId) return;
    const timer = defectItemTouchTimers.get(itemId);
    if (timer) {
        clearTimeout(timer);
        defectItemTouchTimers.delete(itemId);
    }
}

function startDefectItemEdit(itemId, event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    const token = event.currentTarget?.closest?.('.defect-item-token') || event.currentTarget;
    if (!token || token.dataset.editing === '1') return;

    const defect = state.currentApartmentData?.defects?.find((entry) => entry.items?.some((item) => item.id === itemId));
    const item = defect?.items?.find((entry) => entry.id === itemId);
    if (!item || !canEditDefectItem(item, defect)) return;

    token.dataset.editing = '1';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = item.text || '';
    input.className = 'defect-item-inline-input';
    input.setAttribute('aria-label', 'Редактировать строку замечания');

    const finish = async (shouldSave) => {
        if (token.dataset.editing !== '1') return;
        token.dataset.editing = '0';
        const nextText = input.value.trim();

        if (!shouldSave) {
            showApartmentDetail(state.currentApartment);
            return;
        }

        try {
            if (!nextText) {
                const response = await fetch(`/api/defects/items/${itemId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error('delete failed');
            } else if (nextText !== (item.text || '').trim()) {
                const response = await fetch(`/api/defects/items/${itemId}/text`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `text=${encodeURIComponent(nextText)}`
                });
                if (!response.ok) throw new Error('save failed');
            }
            showApartmentDetail(state.currentApartment);
        } catch (err) {
            showToast('Ошибка сохранения', 'error');
            showApartmentDetail(state.currentApartment);
        }
    };

    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await finish(true);
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            await finish(false);
        }
    });
    input.addEventListener('blur', async () => {
        await finish(true);
    });

    token.replaceWith(input);
    input.focus();
    input.select();
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

    if (currentStatus === status && !['on_review', 'completed'].includes(status)) {
        closeDefectStatusModal();
        return;
    }

    const pendingTimer = defectAutosaveTimers.get(String(id)) || defectAutosaveTimers.get(id);
    if (pendingTimer) {
        clearTimeout(pendingTimer);
        defectAutosaveTimers.delete(String(id));
        defectAutosaveTimers.delete(id);
    }

    syncDefectDraftState(id);

    applyDefectStatusUI(id, status);

    const ok = await updateDefectStatus(id, status);
    if (!ok) {
        applyDefectStatusUI(id, currentStatus);
        return;
    }

    syncDefectStatusState(id, status);
    syncCurrentApartmentSummaryFromDefects();
    closeDefectStatusModal();
    showToast('Статус обновлен', 'success');
    rerenderCurrentApartmentDefects();
}

async function cycleDefectStatus(id, event) {
    if (event) event.stopPropagation();
}

function getApartmentWorkflowClass(apartment) {
    if (!apartment) return '';
    if (Number(apartment.on_review_defects_count || 0) > 0) return 'apt apt-ready_for_acceptance';
    if (Number(apartment.in_progress_defects_count || 0) > 0) return 'apt apt-in_progress';
    if (Number(apartment.recorded_defects_count || 0) > 0) return 'apt apt-defects';
    return '';
}

function countsAsDefectApartment(apartment) {
    const hasActiveDefects = Number(apartment?.active_defects_count || 0) > 0;
    const hasRestoration = apartmentNeedsRestoration(apartment?.id);
    return hasRestoration || hasActiveDefects;
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
    const activeFilterName = state.restorationOnly
        ? 'Реставрация'
        : state.reviewOnly
            ? 'На проверке'
            : state.defectsOnly
                ? 'С замечаниями'
                : (FILTER_NAMES[FILTERS.indexOf(state.accessFilter)] || 'Все');

    if (search || category || state.accessFilter || hasSectionFilter || state.defectsOnly || state.reviewOnly || state.restorationOnly) {
        return {
            title: 'Ничего не найдено',
            description: `Измени поиск или фильтры. Сейчас активен статус «${activeFilterName}».`
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
    let badgeCount = Math.max(0, Number(apartment.active_defects_count || 0));
    if (catFilter && state.currentDefects.length) {
        badgeCount = state.currentDefects.filter(
            d => d.apartment_id === apartment.id && d.category === catFilter && !isClosedDefectStatus(d.status)
        ).length;
    }
    return badgeCount;
}

function getApartmentSortCount(apartment, catFilter) {
    let activeOrNewCount = Number(apartment.active_defects_count || 0);

    if (catFilter && state.currentDefects.length) {
        activeOrNewCount = state.currentDefects.filter(
            d => d.apartment_id === apartment.id && d.category === catFilter && !isClosedDefectStatus(d.status)
        ).length;
    }

    if (activeOrNewCount > 0) return activeOrNewCount;

    return Number(apartment.on_review_defects_count || 0);
}

function getApartmentSortMeta(apartment, catFilter) {
    let openCount = Number(apartment.active_defects_count || 0);
    let reviewCount = Number(apartment.on_review_defects_count || 0);
    const isAccepted = isAcceptedApartment(apartment);
    const hasActiveDefects = openCount > 0;
    const isRepeatCall = apartment?.access_status === 'call'
        && Boolean(apartment?.last_call_at)
        && Number(apartment?.changes_after_last_call_count || 0) > 0
        && Boolean(apartment?.resolved_after_last_call_date)
        && apartment?.resolved_after_last_call_date !== apartment?.last_call_date;

    const blackBadge = isAccepted && hasActiveDefects;
    const greenBadge = !isAccepted && hasActiveDefects;

    if (catFilter && state.currentDefects.length) {
        const categoryDefects = state.currentDefects.filter(
            (d) => d.apartment_id === apartment.id && d.category === catFilter
        );

        openCount = categoryDefects.filter((d) => !isClosedDefectStatus(d.status)).length;
        reviewCount = categoryDefects.filter((d) => d.status === 'on_review').length;
    }

    const finalBlackBadge = isAccepted && openCount > 0;
    const finalGreenBadge = !isAccepted && openCount > 0;

    return {
        openCount,
        reviewCount,
        greenBadge: finalGreenBadge,
        blackBadge: finalBlackBadge,
        repeatCall: isRepeatCall,
        totalAll: openCount + reviewCount,
    };
}

function getApartmentStatusSortOrder(apartment) {
    return APARTMENT_STATUS_SORT_ORDER[apartment?.access_status] ?? 99;
}

function getApartmentDefectSortPriority(apartment, catFilter) {
    const meta = getApartmentSortMeta(apartment, catFilter);

    if (meta.totalAll === 0) return 0;
    if (meta.openCount === 0 && meta.reviewCount > 0) return 1;
    return 2;
}

function getApartmentSortBucketKey(apartment, catFilter) {
    const status = apartment?.access_status || 'available';

    if (ACCEPTED_ACCESS_STATUSES.includes(status)) return 'accepted';
    if (status === 'in_progress') return 'in_progress';
    if (status === 'by_phone') return 'by_phone';
    if (status === 'complex') return 'complex';
    if (status === 'no_access') return 'no_access';
    if (status === 'call') return 'call';
    return 'available';
}

function getAdaptiveBucketColumns(bucketSize, bucketCount) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1440;
    const isMobile = viewportWidth <= 768;
    const maxColumns = isMobile ? 3 : viewportWidth <= 1180 ? 3 : viewportWidth <= 1480 ? 4 : 5;
    const minColumns = 1;
    const blockGap = 10;
    const tileSize = 44;
    const tileGap = 10;
    const blockPadding = 24;
    const sidePadding = isMobile ? 32 : 96;
    const availableWidth = Math.max(220, viewportWidth - sidePadding - Math.max(0, bucketCount - 1) * blockGap);
    const targetBucketWidth = Math.max(64, Math.floor(availableWidth / Math.max(1, bucketCount)));
    const columnsByWidth = Math.floor((targetBucketWidth - blockPadding + tileGap) / (tileSize + tileGap));

    return Math.max(minColumns, Math.min(maxColumns, bucketSize, columnsByWidth || 1));
}

function renderSortedApartmentBuckets(apartments, propFull, catFilter) {
    const buckets = [];
    const bucketMap = new Map();

    apartments.forEach((apartment) => {
        const key = getApartmentSortBucketKey(apartment, catFilter);
        let bucket = bucketMap.get(key);

        if (!bucket) {
            bucket = {
                key,
                items: []
            };
            bucketMap.set(key, bucket);
            buckets.push(bucket);
        }

        bucket.items.push(apartment);
    });

    const bucketCount = buckets.length;

    return buckets.map((bucket) => {
        const desktopColumns = getAdaptiveBucketColumns(bucket.items.length, bucketCount);
        const mobileColumns = Math.max(1, Math.min(3, desktopColumns));
        const sortedItems = [...bucket.items].sort((a, b) => {
            const aDefectPriority = getApartmentDefectSortPriority(a, catFilter);
            const bDefectPriority = getApartmentDefectSortPriority(b, catFilter);
            if (aDefectPriority !== bDefectPriority) return aDefectPriority - bDefectPriority;

            const aSortCount = getApartmentSortCount(a, catFilter);
            const bSortCount = getApartmentSortCount(b, catFilter);
            if (aSortCount !== bSortCount) return aSortCount - bSortCount;

            const aMeta = getApartmentSortMeta(a, catFilter);
            const bMeta = getApartmentSortMeta(b, catFilter);
            if (aMeta.totalAll !== bMeta.totalAll) return aMeta.totalAll - bMeta.totalAll;

            return Number(b.number) - Number(a.number);
        });

        return `
            <div class="apt-sort-bucket" style="--bucket-columns:${desktopColumns}; --bucket-columns-mobile:${mobileColumns};">
                <div class="apt-sort-grid apt-sort-grid-sorted apt-sort-grid-bucket">
                    ${sortedItems.map(apartment => renderApartmentTile(apartment, propFull, catFilter)).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function getApartmentSortGroupPriority(apartment, catFilter) {
    const status = apartment?.access_status || '';

    if (status === 'available' || !status) return 0;
    if (status === 'in_progress') return 1;
    if (status === 'by_phone') return 2;
    if (status === 'complex') return 3;
    if (status === 'no_access') return 4;
    if (status === 'call') return 5;

    const meta = getApartmentSortMeta(apartment, catFilter);
    const isAccepted = isAcceptedApartment(apartment);
    const hasReview = meta.reviewCount > 0;
    const hasDefects = meta.openCount > 0;

    if (isAccepted) return 6;
    if (hasReview) return 7;
    if (hasDefects && !isAccepted) return 8;
    return 9;
}

function getExecutorAssignmentApartments() {
    return [...(state.filteredApartments || [])].sort((a, b) => Number(a.number) - Number(b.number));
}

function renderExecutorAssignmentApartmentList() {
    const container = document.getElementById('executorAssignmentApartments');
    if (!container) return;

    const apartments = getExecutorAssignmentApartments();
    const selectedIds = new Set(state.executorAssignmentSelectedApartmentIds || []);
    const itemLabel = state.currentPropertyType === 'апартаменты' ? 'ап.' : 'кв.';

    container.innerHTML = apartments.map((apartment) => {
        const checked = selectedIds.has(apartment.id) ? 'checked' : '';
        const section = apartment.section_number ? `Секция ${apartment.section_number}` : '';
        const floor = apartment.floor ? `Этаж ${apartment.floor}` : '';
        const meta = [section, floor].filter(Boolean).join(' • ');

        return `
            <label class="executor-assignment-apartment-option">
                <input type="checkbox" class="executor-assignment-apartment-checkbox" value="${apartment.id}" ${checked} onchange="handleExecutorAssignmentSelectionChange()">
                <span class="executor-assignment-apartment-main">${itemLabel} ${escapeHtml(String(apartment.number || ''))}</span>
                ${meta ? `<span class="executor-assignment-apartment-meta">${escapeHtml(meta)}</span>` : ''}
            </label>
        `;
    }).join('');

    updateExecutorAssignmentSelectionCount();
}

function handleExecutorAssignmentSelectionChange() {
    const checkboxes = document.querySelectorAll('.executor-assignment-apartment-checkbox');
    state.executorAssignmentSelectedApartmentIds = Array.from(checkboxes)
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => Number(checkbox.value));
    updateExecutorAssignmentSelectionCount();
}

function updateExecutorAssignmentSelectionCount() {
    const counter = document.getElementById('executorAssignmentCount');
    if (!counter) return;
    const total = getExecutorAssignmentApartments().length;
    const selected = (state.executorAssignmentSelectedApartmentIds || []).length;
    counter.textContent = `Выбрано: ${selected} из ${total}`;
}

function setExecutorAssignmentApartmentSelection(selectAll) {
    const apartments = getExecutorAssignmentApartments();
    state.executorAssignmentSelectedApartmentIds = selectAll ? apartments.map((apartment) => apartment.id) : [];
    renderExecutorAssignmentApartmentList();
}

async function showExecutorAssignmentModal() {
    await loadExecutors();
    renderExecutorRegistryList();
    const modal = document.getElementById('executorRegistryModal');
    const executorInput = document.getElementById('executorAssignmentExecutor');
    resetExecutorRegistryForm();
    await setExecutorRegistryMode('responsible');
    if (document.getElementById('executorRegistryResponsiblePanel')?.style.display === 'none') return;
    if (modal) modal.classList.add('active');
    if (executorInput) executorInput.focus();
}

function closeExecutorAssignmentModal(event) {
    closeExecutorRegistryModal(event);
}

async function submitExecutorAssignment(event) {
    event.preventDefault();
    if (!state.currentComplex) return;

    const apartmentIds = [...(state.executorAssignmentSelectedApartmentIds || [])];
    const category = document.getElementById('executorAssignmentCategory')?.value?.trim() || '';
    const executor = document.getElementById('executorAssignmentExecutor')?.value?.trim() || '';

    if (!apartmentIds.length) {
        showToast('Выберите хотя бы одну квартиру', 'warning');
        return;
    }
    if (!category) {
        showToast('Выберите категорию', 'warning');
        return;
    }
    if (!executor) {
        showToast('Укажите ФИО исполнителя', 'warning');
        return;
    }

    const body = new URLSearchParams();
    body.set('apartment_ids_json', JSON.stringify(apartmentIds));
    body.set('category', category);
    body.set('executor_name', executor);

    try {
        const res = await fetch(`/api/complexes/${state.currentComplex}/executor-assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        if (!res.ok) {
            const message = await res.text();
            throw new Error(message || `assignment request failed: ${res.status}`);
        }

        closeExecutorAssignmentModal();
        showToast('Ответственный сохранен', 'success');
    } catch (err) {
        console.error('Executor assignment save failed:', err);
        showToast('Ошибка сохранения ответственного', 'error');
    }
}

function renderApartmentTile(apartment, propFull, catFilter) {
    const deadlineClass = getDeadlineClass(apartment);
    const cls = getApartmentClass(apartment.access_status, apartment.active_defects_count);
    const isAccepted = isAcceptedApartment(apartment);
    const hasActiveDefects = Number(apartment?.active_defects_count || 0) > 0;
    
    // Show black badge for accepted apartments with defects
    const showBlackBadge = isAccepted && hasActiveDefects;
    const badge = !isAccepted && hasActiveDefects ? `<span class="apt-badge apt-badge-total">${formatApartmentBadgeCount(apartment.active_defects_count)}</span>` : '';
    const blackBadge = showBlackBadge ? `<span class="apt-badge apt-badge-black">${formatApartmentBadgeCount(apartment.active_defects_count)}</span>` : '';
    const newCount = Number(apartment.recorded_defects_count || 0);
    const newBadge = newCount > 0 && !showBlackBadge ? `<span class="apt-badge apt-badge-new">${formatApartmentBadgeCount(newCount)}</span>` : '';
    const onReviewCount = Number(apartment.on_review_defects_count || 0);
    const reviewBadge = onReviewCount > 0 ? `<span class="apt-badge apt-badge-review">${formatApartmentBadgeCount(onReviewCount)}</span>` : '';
    const accessPhone = String(apartment.access_phone || '').trim();
    const accessComment = String(apartment.access_comment || '').trim();
    const tooltip = apartment.access_status === 'by_phone'
        ? (accessPhone ? `Номер: ${accessPhone}` : 'Нет номера')
        : apartment.access_status === 'complex'
            ? (accessComment || 'Нет комментария')
            : '';

    return `
        <div class="apt-wrap">
            <div class="apt ${cls} ${deadlineClass}" 
                 data-id="${apartment.id}" 
                 title="${tooltip}"
                 onclick="showApartmentDetail(${apartment.id})">
                ${apartment.number}
                ${showBlackBadge ? '' : badge}
                ${blackBadge}
                ${newBadge}
                ${reviewBadge}
            </div>
        </div>
    `;
}

function renderSectionCard(title, apartments, floors, propFull) {
    const sortedFloors = Object.keys(floors).sort((a, b) => b - a);
    const catFilter = document.getElementById('defectCategoryFilter')?.value;
    const sortedApartments = [...apartments].sort((a, b) => Number(a.number) - Number(b.number));
    const issueCount = sortedApartments.filter((apartment) => countsAsDefectApartment(apartment)).length;
    const acceptedCount = sortedApartments.filter((apartment) => isAcceptedApartment(apartment)).length;
    const inProgressCount = sortedApartments.filter((apartment) => apartment.access_status === 'in_progress').length;

    if (window.innerWidth <= 768) {
        return `
            <section class="section-card section-card-mobile-flat">
                <div class="section-header">
                    <div class="section-heading section-heading-simple">
                        <span class="section-title">${title}</span>
                    </div>
                    <div class="section-mobile-summary">
                        <span>${sortedApartments.length} ${propFull === 'апартамент' ? 'ап.' : 'кв.'}</span>
                        ${issueCount ? `<span>${issueCount} с замеч.</span>` : ''}
                        ${inProgressCount ? `<span>${inProgressCount} в работе</span>` : ''}
                        ${acceptedCount ? `<span>${acceptedCount} приняты</span>` : ''}
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
                <div class="section-header-spacer" aria-hidden="true"></div>
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

function getCombinedSectionWidth(floors) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1440;
    const aptWidth = Math.min(44, Math.max(38, viewportWidth * 0.0265));
    const floorLabelWidth = 48;
    const floorGap = 8;
    const aptGap = 6;
    const sectionPadding = 8;
    const maxFloorCount = Math.max(
        ...Object.values(floors).map((apartments) => apartments.length),
        1
    );

    return Math.ceil(
        floorLabelWidth +
        floorGap +
        (maxFloorCount * aptWidth) +
        (Math.max(0, maxFloorCount - 1) * aptGap) +
        sectionPadding
    );
}

function splitCombinedSectionsIntoRows(sectionItems) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1440;
    const isMobile = viewportWidth <= 760;
    const rowGap = 30;
    const sidePadding = isMobile ? 24 : 32;
    const availableWidth = Math.max(viewportWidth - sidePadding, 320);

    const measuredItems = sectionItems.map((item) => ({
        ...item,
        estimatedWidth: isMobile ? availableWidth : Math.min(getCombinedSectionWidth(item.floors), availableWidth)
    }));

    if (isMobile) {
        return measuredItems.map((item) => [item]);
    }

    const rows = [];
    let currentRow = [];
    let currentWidth = 0;

    measuredItems.forEach((item) => {
        const nextWidth = currentRow.length === 0
            ? item.estimatedWidth
            : currentWidth + rowGap + item.estimatedWidth;

        if (currentRow.length > 0 && nextWidth > availableWidth) {
            rows.push(currentRow);
            currentRow = [item];
            currentWidth = item.estimatedWidth;
            return;
        }

        currentRow.push(item);
        currentWidth = nextWidth;
    });

    if (currentRow.length) rows.push(currentRow);
    return rows;
}

function splitSectionFloorsIntoChunks(sectionItem) {
    const sortedFloors = Object.keys(sectionItem.floors)
        .map(Number)
        .sort((a, b) => b - a);

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1440;
    const isMobile = viewportWidth <= 760;
    const sidePadding = isMobile ? 24 : 32;
    const rowGap = 30;
    const availableWidth = Math.max(viewportWidth - sidePadding, 320);
    const estimatedWidth = Math.min(getCombinedSectionWidth(sectionItem.floors), availableWidth);
    const columnCount = Math.max(1, Math.floor((availableWidth + rowGap) / (estimatedWidth + rowGap)));
    const chunkSize = Math.max(1, Math.ceil(sortedFloors.length / columnCount));

    if (sortedFloors.length <= chunkSize) {
        return [{ ...sectionItem, floorRangeLabel: '' }];
    }

    const chunks = [];
    for (let i = 0; i < sortedFloors.length; i += chunkSize) {
        const chunkFloors = sortedFloors.slice(i, i + chunkSize);
        const floors = {};

        chunkFloors.forEach((floor) => {
            floors[floor] = sectionItem.floors[floor];
        });

        chunks.push({
            ...sectionItem,
            floors
        });
    }

    return chunks;
}

function renderCombinedSectionCard(sectionItems, propFull, uniqueBuildingsCount, options = {}) {
    if (!sectionItems.length) return '';

    const { splitSingleSectionFloors = false } = options;
    const isSingleSplitSection = splitSingleSectionFloors && sectionItems.length === 1;
    const renderItems = isSingleSplitSection ? splitSectionFloorsIntoChunks(sectionItems[0]) : sectionItems;
    const singleSectionTitle = isSingleSplitSection
        ? (uniqueBuildingsCount > 1
            ? `Корпус ${sectionItems[0].buildingNumber} • Секция ${sectionItems[0].sectionNumber}`
            : `Секция ${sectionItems[0].sectionNumber}`)
        : '';

    const rows = splitCombinedSectionsIntoRows(renderItems);

    return `
        <section class="section-card section-card-combined">
            <div class="section-body-container">
                <div class="section-body section-body-combined">
                    ${singleSectionTitle ? `<div class="section-combined-title section-combined-title-main">${singleSectionTitle}</div>` : ''}
                    ${rows.map((row) => `
                        <div class="section-combined-row">
                            ${row.map(({ sectionNumber, buildingNumber, floors, estimatedWidth }) => {
                                const title = uniqueBuildingsCount > 1
                                    ? `Корпус ${buildingNumber} • Секция ${sectionNumber}`
                                    : `Секция ${sectionNumber}`;
                                const sortedFloors = Object.keys(floors).sort((a, b) => b - a);

                                return `
                                    <div class="section-combined-block" style="width:${estimatedWidth}px; max-width:100%;">
                                        ${singleSectionTitle ? '' : `<div class="section-combined-title">${title}</div>`}
                                        <div class="section-combined-floors">
                                            ${sortedFloors.map((floor) => {
                                                const floorApts = floors[floor].sort((a, b) => a.number - b.number);
                                                return renderFloorRow(floorApts, floor, propFull);
                                            }).join('')}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `).join('')}
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
        // Sort mode - group by section
        
        const sortedBySection = {};
        
        visibleApartments.forEach((apartment) => {
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
                    <h3>${emptyState.title}</h3>
                    <p>Нет квартир.</p>
                </div>
            `;
            updateStatsPanel(apartments);
            return;
        }

        container.innerHTML = `
            <div class="sections-grid sections-grid-sorted sections-grid-centered">
                ${sortedSectionNumbers.map((sectionNumber) => {
                    const apts = sortedBySection[sectionNumber];
                    const sortedApts = [...apts].sort((a, b) => {
                        const aPriority = getApartmentSortGroupPriority(a, catFilter);
                        const bPriority = getApartmentSortGroupPriority(b, catFilter);

                        if (aPriority !== bPriority) return aPriority - bPriority;

                        const aStatusOrder = getApartmentStatusSortOrder(a);
                        const bStatusOrder = getApartmentStatusSortOrder(b);
                        if (aStatusOrder !== bStatusOrder) return aStatusOrder - bStatusOrder;

                        const aDefectPriority = getApartmentDefectSortPriority(a, catFilter);
                        const bDefectPriority = getApartmentDefectSortPriority(b, catFilter);
                        if (aDefectPriority !== bDefectPriority) return aDefectPriority - bDefectPriority;

                        const aSortCount = getApartmentSortCount(a, catFilter);
                        const bSortCount = getApartmentSortCount(b, catFilter);
                        if (aSortCount !== bSortCount) return aSortCount - bSortCount;

                        const aMeta = getApartmentSortMeta(a, catFilter);
                        const bMeta = getApartmentSortMeta(b, catFilter);
                        if (aMeta.totalAll !== bMeta.totalAll) return aMeta.totalAll - bMeta.totalAll;

                        return Number(b.number) - Number(a.number);
                    });

                    return `
                        <section class="section-card section-card-sorted">
                            <div class="section-body-container section-body-container-sorted">
                                <div class="section-combined-title">Секция ${sectionNumber}</div>
                                <div class="apt-sort-buckets">
                                    ${renderSortedApartmentBuckets(sortedApts, propFull, catFilter)}
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
            
            const sectionGroupClass = sortedSectionIds.length <= 4 ? 'section-group-grid section-group-grid-centered' : 'section-group-grid';
            return `
                <section class="section-group">
                    <div class="section-group-header">
                        <div>
                            <div class="section-group-title">${title}</div>
                        </div>
                    </div>
                    <div class="${sectionGroupClass}">
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

        const combinedSections = filteredSections
            .map((sec) => {
                const sectionData = bySection[sec];
                if (!sectionData?.floors) return null;

                return {
                    sectionNumber: sec,
                    buildingNumber: sectionData.building_number || 1,
                    floors: sectionData.floors
                };
            })
            .filter(Boolean);

        html = '<div class="sections-grid sections-grid-combined">';
        html += renderCombinedSectionCard(combinedSections, propFull, uniqueBuildings.size, {
            splitSingleSectionFloors: selectedSectionIds.length === 1 && combinedSections.length === 1
        });
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
            <div class="floor-label">${floor} этаж</div>
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
    const isSameApartment = state.currentApartment === id;
    state.currentApartment = id;
    if (!isSameApartment) {
        state.currentApartmentData = null;
        setPageTitle('Загрузка...', '');
    }
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
        const defectsRes = await fetch(`/api/apartments/${id}/defects`);
        if (!defectsRes.ok) throw new Error(`Defects fetch failed: ${defectsRes.status}`);
        const defects = await defectsRes.json();
        const apts = await ensureCurrentComplexApartmentsLoaded(true);
        const apt = apts.find(a => a.id === id);
        
        if (!apt) {
            const propType = state.currentPropertyType;
            const propLabel = propType === 'апартаменты' ? 'Апартамент' : 'Квартира';
            showToast(`${propLabel} не найден(а)`, 'error');
            return;
        }
        
        state.currentApartmentData = { ...apt, defects };
        syncApartmentStatusButtons(apt.access_status === 'available' ? '' : apt.access_status);
        const propType = state.currentPropertyType;
        const propLabel = propType === 'апартаменты' ? 'Апартамент' : 'Квартира';
        
        if (!isSameApartment) {
            setPageTitle(`${propLabel} ${apt.number}`, '');
        }
        
        renderDefects(defects);
        
        syncCurrentApartmentSummaryFromDefects();
    } catch (err) {
        showToast('Ошибка загрузки', 'error');
        console.error(err);
    }
}

// Status Functions
function syncApartmentStatusButtons(status) {
    document.querySelectorAll('.status-item').forEach(btn => {
        btn.classList.toggle('active', Boolean(status) && btn.dataset.status === status);
    });

    if (elements.mobileApartmentStatusSelect) {
        elements.mobileApartmentStatusSelect.value = status === 'available' ? '' : status;
    }
}

function updateApartmentSummaryCache(apartmentId, updates = {}) {
    const caches = [state.allApartments, state.filteredApartments];

    caches.forEach((collection) => {
        const apartment = (collection || []).find((entry) => entry.id === apartmentId);
        if (apartment) {
            Object.assign(apartment, updates);
        }
    });
}

function reloadPageAfterStatusChange() {
    if (state.currentApartment) {
        showApartmentDetail(state.currentApartment);
        return;
    }
    window.location.reload();
}

function setStatus(status) {
    const statusButton = document.querySelector(`.status-item[data-status="${status}"]`);
    const isButtonActive = statusButton?.classList.contains('active');
    const currentStatus = state.currentApartmentData?.access_status || '';
    const nextStatus = status === 'in_progress' && (isButtonActive || currentStatus === 'in_progress')
        ? 'available'
        : status;

    if (nextStatus === 'by_phone') {
        state.pendingAccessStatus = nextStatus;
        syncApartmentStatusButtons(nextStatus);
        showPhoneModal();
        return;
    }
    
    if (nextStatus === 'complex') {
        state.pendingAccessStatus = nextStatus;
        syncApartmentStatusButtons(nextStatus);
        showComplexModal();
        return;
    }

    state.pendingAccessStatus = null;
    syncApartmentStatusButtons(nextStatus === 'available' ? '' : nextStatus);
    applyApartmentStatusLocally(nextStatus);
    
    saveStatus(nextStatus);
}

function applyApartmentStatusLocally(status) {
    const apt = document.querySelector(`.apt[data-id="${state.currentApartment}"]`);
    if (state.currentApartmentData) {
        state.currentApartmentData.access_status = status;
    }
    if (state.currentApartment) {
        updateApartmentSummaryCache(state.currentApartment, { access_status: status });
    }
    syncApartmentStatusButtons(status === 'available' ? '' : status);
    if (apt && state.currentApartmentData) {
        const newClass = getApartmentClass(status, state.currentApartmentData.active_defects_count || 0);
        apt.className = `apt ${newClass}`;
    }
}

function showPhoneModal() {
    const modal = document.getElementById('phoneModal');
    const input = document.getElementById('accessPhoneInput');
    const callField = document.getElementById('callButtonField');
    const callLink = document.getElementById('callPhoneLink');
    const currentApartment = state.currentApartmentData;
    const phone = currentApartment?.access_phone || '';
    
    if (input) {
        input.value = phone;
    }
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile && phone) {
        const cleanPhone = phone.replace(/[^\d+]/g, '');
        if (callField && callLink) {
            callLink.href = `tel:${cleanPhone}`;
            callField.style.display = 'block';
            input.parentElement.style.display = 'none';
        }
    } else {
        if (callField) callField.style.display = 'none';
        if (input && input.parentElement) input.parentElement.style.display = 'block';
    }
    
    if (modal) {
        modal.classList.add('active');
    }

    if (input) {
        setTimeout(() => input.focus(), 30);
    }
}

function closePhoneModal() {
    const modal = document.getElementById('phoneModal');
    if (modal) {
        modal.classList.remove('active');
    }
    resetPendingAccessStatus();
}

async function savePhoneAndStatus() {
    const input = document.getElementById('accessPhoneInput');
    const phone = input?.value.trim() || '';
    const currentApartment = state.currentApartmentData;
    
    try {
        await fetch(`/api/apartments/${state.currentApartment}/access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `access_status=by_phone&access_phone=${encodeURIComponent(phone)}`
        });
        
        if (currentApartment) {
            currentApartment.access_phone = phone;
            currentApartment.access_status = 'by_phone';
        }
        state.pendingAccessStatus = null;
        if (state.currentApartment) {
            updateApartmentSummaryCache(state.currentApartment, { access_phone: phone, access_status: 'by_phone' });
        }
        
        closePhoneModal();
        syncCurrentApartmentGridAfterAccessChange();
        showToast('Сохранено', 'success');
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

function showComplexModal() {
    const modal = document.getElementById('complexModal');
    const input = document.getElementById('complexCommentInput');
    const currentApartment = state.currentApartmentData;
    
    if (input && currentApartment) {
        input.value = currentApartment.access_comment || '';
    }
    
    if (modal) {
        modal.classList.add('active');
    }

    if (input) {
        setTimeout(() => input.focus(), 30);
    }
}

function closeComplexModal() {
    const modal = document.getElementById('complexModal');
    if (modal) {
        modal.classList.remove('active');
    }
    resetPendingAccessStatus();
}

async function saveComplexAndStatus() {
    const input = document.getElementById('complexCommentInput');
    const comment = input?.value.trim() || '';
    const currentApartment = state.currentApartmentData;
    
    try {
        await fetch(`/api/apartments/${state.currentApartment}/access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `access_status=complex&access_comment=${encodeURIComponent(comment)}`
        });
        
        if (currentApartment) {
            currentApartment.access_comment = comment;
            currentApartment.access_status = 'complex';
        }
        state.pendingAccessStatus = null;
        if (state.currentApartment) {
            updateApartmentSummaryCache(state.currentApartment, { access_comment: comment, access_status: 'complex' });
        }
        
        closeComplexModal();
        syncCurrentApartmentGridAfterAccessChange();
        showToast('Сохранено', 'success');
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
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

            applyApartmentStatusLocally(status);
            syncCurrentApartmentGridAfterAccessChange();
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
        if (state.currentApartment) {
            updateApartmentSummaryCache(state.currentApartment, { access_phone: phone });
        }
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
        if (state.currentApartment) {
            updateApartmentSummaryCache(state.currentApartment, { access_phone: null });
        }
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
        if (state.currentApartment) {
            updateApartmentSummaryCache(state.currentApartment, { access_comment: comment });
        }
        showToast('Комментарий сохранен', 'success');
    } catch (err) {
        showToast('Ошибка сохранения', 'error');
    }
}

// Defects
function getCategoryIcon(category) {
    const icons = {
        'Общестроительные работы': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 10h6"/><path d="M9 14h6"/></svg>',
        'Окна': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16"/><path d="M4 12h16"/></svg>',
        'Двери': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V5a2 2 0 0 1 2-2h8v18"/><path d="M10 12h.01"/></svg>',
        'Сантехника': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h7a4 4 0 0 1 4 4v1H9"/><path d="M9 9v4a3 3 0 0 0 6 0V9"/><path d="M5 9h14"/></svg>',
        'Электрика': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 6 14h5l-1 8 7-12h-5z"/></svg>',
        'Вентиляция': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h7"/><path d="M13 12h7"/><path d="M12 4v7"/><path d="M12 13v7"/><circle cx="12" cy="12" r="2"/></svg>',
        'Прочее': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 5.8 1c-.4 1.2-1.9 1.8-2.4 2.5-.3.4-.4.8-.4 1.5"/><path d="M12 17h.01"/></svg>'
    };

    return icons[category] || icons['Прочее'];
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
        const currentRow = document.querySelector(`.defect-row[data-defect-id="${defectId}"]`);
        if (!currentRow || !currentRow.isConnected) {
            defectAutosaveTimers.delete(defectId);
            return;
        }
        defectAutosaveTimers.delete(defectId);
        saveDefectMeta(defectId, { silentSuccess: true });
    }, 700);

    defectAutosaveTimers.set(defectId, timer);
}

function scheduleDefectCommentAutosave(row, sourceElement = null) {
    const defectId = row?.dataset?.defectId;
    if (!defectId) return;

    const prevTimer = defectAutosaveTimers.get(defectId);
    if (prevTimer) clearTimeout(prevTimer);

    const timer = setTimeout(() => {
        const currentRow = document.querySelector(`.defect-row[data-defect-id="${defectId}"]`);
        if (!currentRow || !currentRow.isConnected) {
            defectAutosaveTimers.delete(defectId);
            return;
        }
        defectAutosaveTimers.delete(defectId);
        saveDefectCommentText(defectId, { silentSuccess: true, sourceElement });
    }, 700);

    defectAutosaveTimers.set(defectId, timer);
}

async function saveDefectCommentText(id, options = {}) {
    const { silentSuccess = false, sourceElement = null } = options;
    if (sourceElement && !sourceElement.isConnected) return;

    const commentField = document.getElementById(`defectCommentText_${id}`);
    if (!commentField) return;

    const commentText = commentField.value.trim();

    try {
        const response = await fetch(`/api/defects/${id}/comment-text`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `comment_text=${encodeURIComponent(commentText)}`
        });

        if (!response.ok) {
            let message = 'Ошибка сохранения комментария';
            try {
                const payload = await response.json();
                if (payload?.detail) message = payload.detail;
            } catch (err) {}
            throw new Error(message);
        }

        const currentDefect = state.currentApartmentData?.defects?.find((item) => item.id === Number(id));
        if (currentDefect) currentDefect.comment_text = commentText;
        const row = document.querySelector(`.defect-row[data-defect-id="${id}"]`);
        if (row) markDefectRowClean(row);
        if (!silentSuccess) showToast('Сохранено', 'success');
    } catch (err) {
        showToast(err.message || 'Ошибка сохранения комментария', 'error');
    }
}

function renderDefectCard(d, index) {
    const summaryText = escapeHtml(getDefectSummaryText(d));
    const fixedAt = formatDate(d.created_at);
    const windowNumber = d.window_number ?? '';
    const photos = collectDefectPhotos(d);
    const mediaHtml = renderDefectMedia(photos);
    const statusLabel = getDefectStatusLabel(d.status);
    const statusBadgeClass = getDefectStatusBadgeClass(d.status);
    const windowChipText = getWindowChipText(windowNumber) || 'Без окна';
    const commentsCount = Number(d.comments_count || 0);
    const executorValue = String(d.executor || '').trim();

    return `
        <div class="defect-row defect-row-card" data-defect-id="${d.id}" style="animation: slideIn 0.25s ease ${index * 0.03}s both;">
            <div class="defect-card-header">
                <div class="defect-card-header-meta">
                    <span class="defect-date">${fixedAt || 'Без даты'}</span>
                    <select id="defectExecutor_${d.id}" class="select defect-executor-input" style="width: 220px;">
                        ${renderDefectExecutorOptions(d)}
                    </select>
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
                    <textarea id="defectCommentText_${d.id}" class="input defect-comment-input" placeholder="Комментарий" rows="1" onblur="saveDefectCommentText(${d.id}, { silentSuccess: true, sourceElement: this })">${escapeHtml(d.comment_text || '')}</textarea>
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
                <button class="status-item status-item-action" onclick="showAddDefectForm()">Добавить замечание</button>
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
    const summaryHtml = renderDefectTextItems(d);
    const fixedAt = formatDate(d.created_at);
    const primaryDateKey = getDateKey(d.created_at);
    const extraDateBadges = renderDefectDateBadges(d);
    const windowNumber = d.window_number ?? '';
    const statusLabel = getDefectStatusLabel(d.status);
    const statusBadgeClass = getDefectStatusBadgeClass(d.status);

    const isWindowCategory = d.category === 'Окна';
    const isDoorCategory = d.category === 'Двери';
    const windowChipText = isWindowCategory ? getWindowChipText(windowNumber) : '';
    const doorVariant = isDoorCategory ? String(d.variant_number || '').trim() : '';
    const doorChipText = getDoorVariantLabel(doorVariant);
    const isRestoration = d.restoration === 1;
    const isRestorationCompleted = d.restoration_completed === 1;

    return `
        <div class="defect-row defect-compact-row" data-defect-id="${d.id}" data-restoration="${isRestoration ? 1 : 0}" data-restoration-completed="${isRestorationCompleted ? 1 : 0}">
            <div class="defect-compact-main">
                <div class="defect-compact-meta">
                    ${isWindowCategory && windowChipText ? `<span class="defect-icon-chip defect-restoration-toggle" onclick="toggleDefectRestoration(${d.id}, event)">${windowChipText}</span>` : ''}
                    ${isDoorCategory && doorChipText ? `<span class="defect-icon-chip defect-restoration-toggle" onclick="toggleDefectRestoration(${d.id}, event)">${escapeHtml(doorChipText)}</span>` : ''}
                    ${isRestoration ? renderDefectRestorationBadge(d.id, isRestorationCompleted) : ''}
                    <span class="defect-compact-date" onmouseenter="setDefectDateHover(${d.id}, '${escapeHtml(primaryDateKey)}', true)" onmouseleave="setDefectDateHover(${d.id}, '${escapeHtml(primaryDateKey)}', false)">${fixedAt || '—'}</span>
                    ${extraDateBadges}
                    <input type="text" id="defectCommentText_${d.id}" class="input defect-compact-comment-input" placeholder="Комментарий к замечанию" value="${escapeHtml(d.comment_text || '')}" onblur="saveDefectCommentText(${d.id}, { silentSuccess: true, sourceElement: this })">
                </div>
                <span class="defect-compact-desc">${summaryHtml}</span>
                <div class="defect-compact-actions">
                    <select id="defectExecutor_${d.id}" class="select defect-compact-executor-select">
                        ${renderDefectExecutorOptions(d)}
                    </select>
                    <span class="defect-compact-status ${statusBadgeClass}" onclick="cycleDefectStatus(${d.id}, event)">${statusLabel}</span>
                </div>
            </div>
            <input type="hidden" id="defectStatus_${d.id}" value="${escapeHtml(d.status)}">
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
        const savedCompleted = Number(row.dataset.restorationCompleted || 0) === 1;
        if (next) {
            if (!existingBadge) {
                const dateNode = row.querySelector('.defect-compact-date');
                if (dateNode) {
                    dateNode.insertAdjacentHTML('beforebegin', renderDefectRestorationBadge(id, savedCompleted));
                }
            }
        } else if (existingBadge) {
            existingBadge.remove();
        }

        const defect = state.currentApartmentData?.defects?.find(item => item.id === id);
        if (defect) {
            defect.restoration = next;
        }
        syncCurrentApartmentSummaryFromDefects();
        showToast(next ? 'Отмечена реставрация' : 'Реставрация снята', 'success');
    } catch (err) {
        showToast('Ошибка обновления', 'error');
    }
}

async function toggleDefectRestorationCompleted(id, event) {
    event.stopPropagation();
    const row = event.currentTarget?.closest('.defect-compact-row');
    if (!row) return;

    const badge = row.querySelector('.defect-restoration-badge');
    if (!badge) return;

    const defect = state.currentApartmentData?.defects?.find(item => item.id === id);
    const current = defect?.restoration_completed === 1 || badge.classList.contains('is-completed');
    const next = current ? 0 : 1;

    try {
        const response = await fetch(`/api/defects/${id}/restoration-completed`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `completed=${next}`
        });
        if (!response.ok) throw new Error('save failed');

        badge.classList.toggle('is-completed', Boolean(next));
        badge.innerHTML = `Р${next ? '<span class="defect-restoration-check">&#10003;</span>' : ''}`;
        row.dataset.restorationCompleted = String(next);
        if (defect) defect.restoration_completed = next;
        syncCurrentApartmentSummaryFromDefects();
        showToast(next ? 'Реставрация выполнена' : 'Отметка выполнения снята', 'success');
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
        const defects = state.currentApartmentData?.defects || [];
        state.currentApartmentData.defects = defects.filter(d => d.id !== id);
        syncCurrentApartmentSummaryFromDefects();
        rerenderCurrentApartmentDefects();
        showToast('Удалено', 'success');
    } catch (err) {
        showToast('Ошибка удаления', 'error');
    }
}

async function saveDefectMeta(id, options = {}) {
    const { silentSuccess = false, sourceElement = null } = options;
    if (sourceElement && !sourceElement.isConnected) {
        return;
    }

    const currentDefect = state.currentApartmentData?.defects?.find((item) => item.id === Number(id));
    const defectItemsPayload = Array.isArray(currentDefect?.items)
        ? currentDefect.items.map((item, index) => ({
            id: item.id || null,
            key: item.key || `existing-${item.id || index}`,
            text: String(item.text || '').trim()
        })).filter((item) => item.text)
        : [];
    const contractorField = document.getElementById(`defectContractor_${id}`);
    const contractorId = contractorField ? contractorField.value : (currentDefect?.contractor_id || null);
    const executorField = document.getElementById(`defectExecutor_${id}`);
    const executor = executorField ? executorField.value.trim() : String(currentDefect?.executor || '');
    const descriptionField = document.getElementById(`defectDescription_${id}`);
    const description = descriptionField
        ? descriptionField.value.trim()
        : (defectItemsPayload.length ? defectItemsPayload.map((item) => item.text).join('\n') : String(currentDefect?.description || ''));
    const commentField = document.getElementById(`defectCommentText_${id}`);
    const commentText = commentField ? commentField.value.trim() : String(currentDefect?.comment_text || '');
    const status = document.getElementById(`defectStatus_${id}`)?.value || String(currentDefect?.status || '');
    const windowNumber = currentDefect?.window_number ?? '';
    const variantNumber = String(currentDefect?.variant_number || '');
    const restoration = Number(currentDefect?.restoration || 0);
    const projectName = String(currentDefect?.project_name || '');
    const materialsInfo = String(currentDefect?.materials_info || '');
    const costAmount = String(currentDefect?.cost_amount || '');
    const laborCost = String(currentDefect?.labor_cost || '');
    const deadline = currentDefect?.deadline || '';

    if (!currentDefect && !contractorField && !executorField && !descriptionField && !commentField) {
        return;
    }

    try {
        if (status) {
            const statusResponse = await fetch(`/api/defects/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `status=${encodeURIComponent(status)}`
            });
            if (!statusResponse.ok) {
                let message = 'Ошибка сохранения статуса';
                try {
                    const payload = await statusResponse.json();
                    if (payload?.detail) message = payload.detail;
                } catch (err) {}
                throw new Error(message);
            }
        }
        const metaBody = [
            `contractor_id=${encodeURIComponent(contractorId || '')}`,
            `comment_text=${encodeURIComponent(commentText)}`,
            `description=${encodeURIComponent(description)}`,
            `executor=${encodeURIComponent(executor)}`,
            `defect_items_json=${encodeURIComponent(JSON.stringify(defectItemsPayload))}`,
            `window_number=${encodeURIComponent(windowNumber)}`,
            `variant_number=${encodeURIComponent(variantNumber)}`,
            `restoration=${encodeURIComponent(restoration)}`,
            `project_name=${encodeURIComponent(projectName)}`,
            `materials_info=${encodeURIComponent(materialsInfo)}`,
            `cost_amount=${encodeURIComponent(costAmount)}`,
            `labor_cost=${encodeURIComponent(laborCost)}`,
            `deadline=${encodeURIComponent(deadline)}`
        ].join('&');
        const metaResponse = await fetch(`/api/defects/${id}/meta`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: metaBody
        });
        if (!metaResponse.ok) {
            let message = 'Ошибка сохранения';
            try {
                const payload = await metaResponse.json();
                if (payload?.detail) message = payload.detail;
            } catch (err) {
                try {
                    const text = await metaResponse.text();
                    if (text) message = text;
                } catch (readErr) {}
            }
            throw new Error(message);
        }
        if (currentDefect) {
            currentDefect.contractor_id = contractorId || null;
            currentDefect.executor = executor;
            currentDefect.description = description;
            currentDefect.comment_text = commentText;
            currentDefect.window_number = windowNumber === '' ? null : Number(windowNumber);
            currentDefect.variant_number = variantNumber;
            currentDefect.restoration = restoration;
            currentDefect.project_name = projectName;
            currentDefect.materials_info = materialsInfo;
            currentDefect.cost_amount = costAmount;
            currentDefect.labor_cost = laborCost;
            currentDefect.deadline = deadline || null;
        }
        const row = document.querySelector(`.defect-row[data-defect-id="${id}"]`);
        if (row) markDefectRowClean(row);
        if (!silentSuccess) showToast('Сохранено', 'success');
        syncCurrentApartmentSummaryFromDefects();
    } catch (err) {
        showToast(err.message || 'Ошибка сохранения', 'error');
    }
}

// Items
async function updateItemStatus(id, status) {
    try {
        const response = await fetch(`/api/defects/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `status=${status}`
        });
        if (!response.ok) throw new Error('save failed');
        showToast('Сохранено', 'success');
        reloadPageAfterStatusChange();
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
    refreshExecutorSelects('');
    resetSelectedDefectPhotos();
    addDefectFormItem();
    
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
let defectFormItemsState = [];
let selectedDefectPhotoFilesByItem = {};
let activeDefectPhotoItemKey = null;

function resetSelectedDefectPhotos() {
    selectedDefectPhotoFilesByItem = {};
    defectFormItemsState = [];
    activeDefectPhotoItemKey = null;
    const inputIds = ['defectPhotosBefore', 'defectPhotosBeforeGallery', 'defectPhotosBeforeCamera'];
    inputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
}

function createDefectFormItemKey() {
    return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function syncDefectFormDescription() {
    const input = document.getElementById('defectDescription');
    if (!input) return;
    input.value = defectFormItemsState
        .map((item) => String(item.text || '').trim())
        .filter(Boolean)
        .join('\n');
}

function getDefectFormItemsPayload() {
    return defectFormItemsState
        .map((item) => ({
            id: item.id || null,
            key: item.key,
            text: String(item.text || '').trim()
        }))
        .filter((item) => item.text);
}

function addDefectFormItem(prefill = {}) {
    defectFormItemsState.push({
        key: prefill.key || createDefectFormItemKey(),
        id: prefill.id || null,
        text: prefill.text || '',
        existingPhotos: Array.isArray(prefill.existingPhotos) ? prefill.existingPhotos : []
    });
    renderDefectFormItems();
}

function updateDefectFormItem(key, value) {
    const item = defectFormItemsState.find((entry) => entry.key === key);
    if (!item) return;
    item.text = value;
    syncDefectFormDescription();
}

function removeDefectFormItem(key) {
    defectFormItemsState = defectFormItemsState.filter((item) => item.key !== key);
    delete selectedDefectPhotoFilesByItem[key];
    if (!defectFormItemsState.length) {
        addDefectFormItem();
        return;
    }
    renderDefectFormItems();
}

function getSelectedDefectPhotoFiles(itemKey = '') {
    return selectedDefectPhotoFilesByItem[itemKey] || [];
}

function renderDefectItemPhotos(itemKey, existingPhotos = []) {
    const selectedPhotos = getSelectedDefectPhotoFiles(itemKey);
    return `
        <div class="previews defect-item-previews">
            ${existingPhotos.map((photo) => `
                <div class="preview-item is-existing">
                    <img src="/uploads/${encodeURIComponent(photo.filename)}" alt="Фото замечания">
                </div>
            `).join('')}
            ${selectedPhotos.map((file, index) => `
                <div class="preview-item">
                    <img src="${URL.createObjectURL(file)}" alt="Фото замечания">
                    <button class="preview-remove" type="button" onclick="removeSelectedFile('${itemKey}', ${index})">×</button>
                </div>
            `).join('')}
        </div>
    `;
}

function renderDefectFormItems() {
    const editor = document.getElementById('defectItemsEditor');
    if (!editor) return;
    syncDefectFormDescription();
    editor.innerHTML = defectFormItemsState.map((item, index) => `
        <div class="defect-form-item-row">
            <div class="defect-form-item-head">
                <span class="defect-form-item-index">${index + 1}.</span>
                <input
                    type="text"
                    class="input defect-form-item-input"
                    value="${escapeHtml(item.text || '')}"
                    placeholder="Добавьте отдельное замечание"
                    oninput="updateDefectFormItem('${item.key}', this.value)"
                >
                <button type="button" class="btn btn-secondary btn-sm" onclick="openDefectGallery('${item.key}')">Фото</button>
                <button type="button" class="btn btn-sm" onclick="removeDefectFormItem('${item.key}')">×</button>
            </div>
            ${renderDefectItemPhotos(item.key, item.existingPhotos)}
        </div>
    `).join('');
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
        
        defectFormItemsState = (Array.isArray(defect.items) ? defect.items : []).map((item) => ({
            key: createDefectFormItemKey(),
            id: item.id,
            text: item.text || '',
            existingPhotos: Array.isArray(item.photos) ? item.photos : []
        }));
        if (!defectFormItemsState.length) {
            addDefectFormItem({ text: defect.description || '', existingPhotos: Array.isArray(defect.photos) ? defect.photos : [] });
        } else if (Array.isArray(defect.photos) && defect.photos.length) {
            defectFormItemsState[0].existingPhotos = [
                ...(defectFormItemsState[0].existingPhotos || []),
                ...defect.photos
            ];
        }
        renderDefectFormItems();
        
        // For Windows, populate the window number select
        if (defect.category === 'Окна') {
            const windowSelect = document.getElementById('windowNumber');
            if (windowSelect) {
                windowSelect.disabled = false;
                windowSelect.style.display = '';
                windowSelect.value = defect.window_number ?? '';
            }
        }

        if (defect.category === 'Двери') {
            const doorSideSelect = document.getElementById('doorSide');
            if (doorSideSelect) doorSideSelect.value = defect.variant_number || '';
        }
        
        document.getElementById('defectRestoration').checked = Boolean(defect.restoration);
        selectedDefectPhotoFilesByItem = {};
        
        if (modal) modal.classList.add('active');
        
    } catch (err) {
        showToast('Ошибка загрузки', 'error');
    }
}

async function saveDefectEdit() {
    if (!currentEditingDefectId) return;
    
    const category = document.getElementById('defectCategory')?.value;
    const defectItems = getDefectFormItemsPayload();
    const description = defectItems.map((item) => item.text).join('\n');
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
        showToast('Выберите тип двери: Межкомнатная или Входная.', 'warning');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('description', description);
        formData.append('defect_items_json', JSON.stringify(defectItems));
        if (category === 'Окна' && windowNumber) {
            formData.append('window_number', windowNumber);
        } else {
            formData.append('window_number', '');
        }
        formData.append('variant_number', category === 'Двери' ? doorSide : '');
        formData.append('restoration', restoration);
        
        // Add new photos
        defectItems.forEach((item) => {
            getSelectedDefectPhotoFiles(item.key).forEach((file) => {
                formData.append('photos', file);
                formData.append('photo_types', 'before');
                formData.append('photo_item_keys', item.key);
            });
        });
        
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
            await syncApartmentAfterDefectCollectionChange();
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

function renderSelectedFiles() {
    renderDefectFormItems();
}

function appendSelectedFiles(sourceInput, targetInput, type = 'before', itemKey = '') {
    if (!sourceInput?.files?.length) {
        return;
    }

    appendFilesToSelection(Array.from(sourceInput.files), type, targetInput, itemKey);
    sourceInput.value = '';
}

function appendFilesToSelection(filesToAppend, type = 'before', targetInput = null, itemKey = '') {
    if (type === 'before') {
        const resolvedItemKey = itemKey || activeDefectPhotoItemKey;
        if (!resolvedItemKey) return;
        const currentFiles = getSelectedDefectPhotoFiles(resolvedItemKey);
        selectedDefectPhotoFilesByItem[resolvedItemKey] = currentFiles.concat(filesToAppend);
        syncFilesToInput(targetInput || document.getElementById('defectPhotosBefore'), selectedDefectPhotoFilesByItem[resolvedItemKey]);
        renderSelectedFiles();
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

function removeSelectedFile(itemKey, indexToRemove) {
    selectedDefectPhotoFilesByItem[itemKey] = getSelectedDefectPhotoFiles(itemKey).filter((_, index) => index !== indexToRemove);
    renderSelectedFiles();
}

function openDefectGallery(itemKey = '') {
    activeDefectPhotoItemKey = itemKey;
    const isMobileDevice = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
    if (isMobileDevice) {
        const mobilePicker = document.getElementById('defectPhotosBeforeCamera');
        if (mobilePicker) {
            mobilePicker.click();
            return;
        }
    }
    launchDefectFilePicker({ accept: 'image/*', multiple: true }, 'before', itemKey);
}

function openDefectCamera(itemKey = '') {
    activeDefectPhotoItemKey = itemKey;
    const cameraPicker = document.getElementById('defectPhotosBeforeCamera');
    if (cameraPicker) {
        cameraPicker.click();
        return;
    }
    launchDefectFilePicker({ accept: 'image/*', capture: 'environment' }, 'before', itemKey);
}

function launchDefectFilePicker(options = {}, type = 'before', itemKey = '') {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = options.accept || 'image/*';
    picker.multiple = Boolean(options.multiple);
    if (options.capture) picker.capture = options.capture;
    picker.addEventListener('change', () => {
        appendSelectedFiles(picker, document.getElementById('defectPhotosBefore'), type, itemKey);
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
    const defectItems = getDefectFormItemsPayload();
    const description = defectItems.map((item) => item.text).join('\n');
    const status = 'recorded';
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
        showToast('Выберите тип двери: Межкомнатная или Входная.', 'warning');
        return;
    }
    
    try {
        console.log('Adding defect:', category, description);
        
        const formData = new FormData();
        formData.append('category', category);
        formData.append('description', description);
        formData.append('defect_items_json', JSON.stringify(defectItems));
        formData.append('status', status);
        
        if (windowNumber) formData.append('window_number', windowNumber);
        if (category === 'Двери') formData.append('variant_number', doorSide);
        if (restoration) formData.append('restoration', restoration);
        
        defectItems.forEach((item) => {
            getSelectedDefectPhotoFiles(item.key).forEach((file) => {
                formData.append('photos', file);
                formData.append('photo_types', 'before');
                formData.append('photo_item_keys', item.key);
            });
        });
        
        const res = await fetch(`/api/apartments/${state.currentApartment}/defects`, {
            method: 'POST',
            body: formData
        });
        
        console.log('Defect add response:', res.status, res.statusText);
        
        if (res.ok) {
            showToast('Замечание добавлено', 'success');
            closeDefectModal();
            await syncApartmentAfterDefectCollectionChange();
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
        const variant = String(defect?.variant_number || '').trim();
        if (variant === 'Входная') return 'Входная дверь';
        if (variant === 'Межкомнатная') return 'Межкомнатная дверь';
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
        const res = await fetch(`/api/apartments/${state.currentApartment}/defects`, { cache: 'no-store' });
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
            const photos = getDefectPrintPhotos(d);
            const defectNumber = startIndex + index + 1;
            const photoHtml = photos.length
                ? `<div class="photo-stack">${photos.map((photo, photoIndex) => `<figure class="photo-item"><img src="${window.location.origin}/uploads/${encodeURIComponent(photo.filename)}" alt="Фото ${defectNumber}.${photoIndex + 1}"><figcaption>Фото ${defectNumber}.${photoIndex + 1}</figcaption></figure>`).join('')}</div>`
                : '';
            const rowClass = index % 2 === 0 ? 'print-row-light' : 'print-row-white';

            return `
                <tr class="defect-print-item ${rowClass}">
                    <td class="num-cell">${defectNumber}.</td>
                    <td class="place-cell">${getDefectPrintLocation(d)}</td>
                    <td class="desc-cell"><div class="defect-print-items">${renderReadonlyDefectItems(d, 'defect-print-item-token')}</div></td>
                </tr>
                ${photoHtml ? `
                    <tr class="defect-print-photos-row ${rowClass}">
                        <td class="num-cell"></td>
                        <td class="photos-cell" colspan="2">${photoHtml}</td>
                    </tr>
                ` : ''}
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

                        <div class="field-line">Дольщик/уполномоченный представитель: ${renderPrintLine('', 'line-person')}<span class="hint">(Фамилия, Имя, Отчество)</span></div>
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
                        <div>Фотографии, размещённые под соответствующим замечанием перечня, являются неотъемлемой частью настоящего акта. Каждое фото сделано при осмотре квартиры ${photoDate} и достоверно отображает указанный дефект.</div>

                        <div class="section">Обязательства Подрядчика:</div>
                        <div>Подрядчик обязуется устранить замечания, указанные в настоящем акте, в срок до «__» _________ 20__г. (либо в порядке и сроки, предусмотренные договором). О завершении устранения замечаний Подрядчик уведомляет Дольщика не позднее чем за 3 рабочих дня до даты повторной приёмки.</div>

                        <div class="section">Подписи сторон:</div>
                        <div class="signature-grid">
                            <div class="signature-block">
                                <div><strong>Дольщик/уполномоченный представитель</strong></div>
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
                    @page { margin: 12mm; size: A4 portrait; }
                    body { font-family: "Times New Roman", serif; margin: 0; color: #111; font-size: 14px; line-height: 1.48; background: #fff; }
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
                    .defect-print-table td { border: 1px solid #111; padding: 8px; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
                    .defect-print-table th { text-align: left; background: #f3f4f6; color: #334155; font-size: 12px; }
                    .num-cell { width: 42px; }
                    .place-cell { width: 28%; }
                    .desc-cell { width: auto; }
                    .print-row-light td { background: #f7f7f7; }
                    .print-row-white td { background: #ffffff; }
                    .defect-print-photos-row td { border-top: 0; }
                    .photos-cell { padding-top: 2px; padding-bottom: 12px; }
                    .defect-print-items { display: flex; flex-wrap: wrap; gap: 6px; }
                    .defect-print-item-token { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; color: #111; word-break: break-word; }
                    .defect-print-item-token.is-in-progress { background: #fef3c7; color: #92400e; }
                    .defect-print-item-token.is-on-review { background: #ecfeff; color: #0f766e; }
                    .defect-print-item-token.is-completed { background: #dcfce7; color: #166534; }
                    .defect-item-number { font-weight: 600; }
                    .photo-stack { display: flex; flex-wrap: wrap; gap: 12px; }
                    .photo-item { margin: 0; width: 300px; max-width: 100%; }
                    .photo-item img { width: 100%; max-height: 240px; object-fit: cover; border: 1px solid #999; display: block; }
                    .photo-item figcaption { font-size: 12px; text-align: center; margin-top: 4px; font-weight: 600; }
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
        if (state.reviewOnly && defect.status !== 'on_review') return false;
        if (categoryFilter && defect.category !== categoryFilter) return false;
        if (statusFilter === 'recorded' && defect.status !== 'recorded') return false;
        if (statusFilter === 'in_progress' && defect.status !== 'in_progress') return false;
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

function getApartmentPhoneNote(apartment) {
    const accessPhone = String(apartment?.access_phone || '').trim();
    if (apartment?.access_status !== 'by_phone' || !accessPhone) return '';
    return `Тел.: ${accessPhone}`;
}

function renderFilteredDefectsTable(groups, options = {}) {
    const includeRowClasses = Boolean(options.includeRowClasses);
    const rowsHtml = groups
        .flatMap(({ apartment, defects }) => defects.map((defect, index) => {
            const apartmentLabel = `${state.currentPropertyType === 'апартаменты' ? 'Апартамент' : 'Квартира'} ${apartment.number}`;
            const section = apartment.section_number ? `Секция ${apartment.section_number}` : '';
            const floor = apartment.floor ? `Этаж ${apartment.floor}` : '';
            const phoneNote = getApartmentPhoneNote(apartment);
            const meta = [section, floor].filter(Boolean).join(' ');
            const rowClass = includeRowClasses ? (index % 2 === 0 ? 'print-row-light' : 'print-row-white') : '';
            return `
                <tr${rowClass ? ` class="${rowClass}"` : ''}>
                    <td class="filtered-defects-apartment-cell">${index === 0 ? `${escapeHtml(apartmentLabel)}${phoneNote ? `<div class="filtered-defects-apartment-phone">${escapeHtml(phoneNote)}</div>` : ''}${meta ? `<div class="filtered-defects-apartment-meta">${escapeHtml(meta)}</div>` : ''}` : ''}</td>
                    <td>${getDefectPrintLocation(defect)}</td>
                    <td><div class="filtered-defect-items">${renderReadonlyDefectItems(defect, 'filtered-defect-item-token')}</div></td>
                    <td><span class="filtered-defect-status defect-status-badge ${getDefectStatusBadgeClass(defect.status)}">${escapeHtml(getDefectStatusLabel(defect.status))}</span></td>
                </tr>
            `;
        }))
        .join('');

    return `
        <div class="filtered-defects-table-wrap">
            <table class="filtered-defects-table filtered-defects-table-flat">
                <thead>
                    <tr>
                        <th>Квартира</th>
                        <th>Место</th>
                        <th>Замечание</th>
                        <th>Статус</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}

function renderFilteredDefectCommentList(comments) {
    if (!comments.length) {
        return '<div class="filtered-comments-empty">Замечаний нет</div>';
    }

    return `
        <div class="filtered-comment-list">
            ${comments.map((comment) => `
                <article class="filtered-comment-card">
                    <div class="filtered-comment-head">
                        ${comment.location ? `<span class="filtered-comment-location-label">${escapeHtml(comment.location)}</span>` : '<span class="filtered-comment-location-label is-muted">Без локации</span>'}
                    </div>
                    <div class="filtered-comment-line">
                        <span class="filtered-comment-value">${escapeHtml(comment.text || '').replace(/\n/g, '<br>')}</span>
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

async function getFilteredDefectCommentGroups() {
    const apartmentIds = (state.filteredApartments || []).map((apartment) => apartment.id);
    const categoryFilter = document.getElementById('defectCategoryFilter')?.value || '';
    if (!apartmentIds.length || !state.currentComplex) return [];

    const body = new URLSearchParams();
    body.set('apartment_ids_json', JSON.stringify(apartmentIds));
    if (categoryFilter) body.set('category_filter', categoryFilter);

    const res = await fetch(`/api/complexes/${state.currentComplex}/item-comments`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!res.ok) {
        throw new Error(`item comments request failed: ${res.status}`);
    }

    const groups = await res.json();
    return groups.filter((group) => Array.isArray(group.comments) && group.comments.length);
}

async function showFilteredDefectsModal() {
    if (!state.currentComplex) return;

    try {
        await ensureCurrentComplexDefectsLoaded(true);
    } catch (err) {
        console.error('Defects loading failed:', err);
        showToast('Ошибка загрузки замечаний', 'error');
        return;
    }

    const groups = getFilteredDefectGroups();
    if (!groups.length) {
        showToast('Нет замечаний для показа', 'warning');
        return;
    }

    const body = document.getElementById('filteredDefectsBody');
    const modal = document.getElementById('filteredDefectsModal');
    const commentsModal = document.getElementById('filteredDefectCommentsModal');
    if (!body || !modal) return;
    if (commentsModal) commentsModal.classList.remove('active');

    body.innerHTML = renderFilteredDefectsTable(groups);

    modal.classList.add('active');
}

async function showFilteredDefectCommentsModal() {
    if (!state.currentComplex) return;

    try {
        await ensureCurrentComplexDefectsLoaded(true);
    } catch (err) {
        console.error('Defects loading failed:', err);
        showToast('Ошибка загрузки замечаний', 'error');
        return;
    }

    let groups;
    try {
        groups = await getFilteredDefectCommentGroups();
    } catch (err) {
        console.error('Comments loading failed:', err);
        showToast('Ошибка загрузки комментариев', 'error');
        return;
    }

    if (!groups.length) {
        showToast('Нет комментариев для показа', 'warning');
        return;
    }

    const body = document.getElementById('filteredDefectCommentsBody');
    const modal = document.getElementById('filteredDefectCommentsModal');
    const defectsModal = document.getElementById('filteredDefectsModal');
    if (!body || !modal) return;
    if (defectsModal) defectsModal.classList.remove('active');

    body.innerHTML = groups.map(({ apartment, comments }) => {
        const apartmentLabel = `${state.currentPropertyType === 'апартаменты' ? 'Апартамент' : 'Квартира'} ${apartment.number}`;
        const phoneNote = getApartmentPhoneNote(apartment);

        return `
            <section class="filtered-defects-group">
                <div class="filtered-defects-group-title">${escapeHtml(apartmentLabel)}${phoneNote ? `<div class="filtered-defects-apartment-phone">${escapeHtml(phoneNote)}</div>` : ''}</div>
                ${renderFilteredDefectCommentList(comments)}
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

function closeFilteredDefectCommentsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('filteredDefectCommentsModal');
    if (modal) modal.classList.remove('active');
}

async function printFilteredDefects() {
    if (!state.currentComplex) return;

    try {
        await ensureCurrentComplexDefectsLoaded(true);
    } catch (err) {
        console.error('Defects loading failed:', err);
        showToast('Ошибка загрузки замечаний', 'error');
        return;
    }

    const groups = getFilteredDefectGroups();
    if (!groups.length) {
        showToast('Нет замечаний для печати', 'warning');
        return;
    }

    const tableHtml = renderFilteredDefectsTable(groups);

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
                @page { margin: 10mm; size: A4 landscape; }
                body { font-family: Inter, Arial, sans-serif; margin: 0; padding: 0; color: #111; font-size: 14px; background: #fff; }
                .sheet { padding: 10mm 4mm; }
                h1 { margin: 0 0 6px; font-size: 20px; }
                .subtitle { margin-bottom: 16px; color: #475569; line-height: 1.5; }
                .filtered-defects-table-wrap { margin-top: 10px; overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 10px 12px; border: 1px solid #dadce0; vertical-align: top; text-align: left; }
                th { background: #f1f3f4; font-size: 12px; }
                .filtered-defects-table th:first-child, .filtered-defects-table td:first-child, .filtered-defects-table th:last-child, .filtered-defects-table td:last-child { width: 160px; }
                .filtered-defects-table-flat th:first-child, .filtered-defects-table-flat td:first-child { width: 190px; }
                .filtered-defects-apartment-phone { margin-top: 4px; font-size: 12px; font-weight: 500; color: #5f6368; }
                .filtered-defects-apartment-meta { margin-top: 4px; font-size: 11px; color: #6b7280; font-weight: 500; white-space: normal; text-align: left; }
                .filtered-defect-items { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; }
                .filtered-defect-item-token { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; background: transparent; color: inherit; }
                .filtered-defect-status.defect-status-badge { min-width: 140px; width: 100%; justify-content: center; min-height: auto; padding: 0; border-radius: 2px; background: transparent !important; border: 0 !important; box-shadow: none !important; font-size: 13px; font-weight: 800; }
                tr { page-break-inside: avoid; }
            </style>
        </head>
        <body>
            <div class="sheet">
                <h1>${title}</h1>
                ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
                ${tableHtml}
            </div>
        </body>
        </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.document.title = title;
    setTimeout(() => printWindow.print(), 150);
}

async function printFilteredDefectComments() {
    if (!state.currentComplex) return;

    let groups;
    try {
        groups = await getFilteredDefectCommentGroups();
    } catch (err) {
        console.error('Comments loading failed:', err);
        showToast('Ошибка загрузки комментариев', 'error');
        return;
    }

    if (!groups.length) {
        showToast('Нет комментариев для печати', 'warning');
        return;
    }

    const title = 'Комментарии по отфильтрованным квартирам';
    const subtitle = state.currentComplexData?.name ? escapeHtml(state.currentComplexData.name) : '';
    const contentHtml = groups.map(({ apartment, comments }) => {
        const apartmentLabel = `${state.currentPropertyType === 'апартаменты' ? 'Апартамент' : 'Квартира'} ${apartment.number}`;
        const phoneNote = getApartmentPhoneNote(apartment);

        return `
            <section class="filtered-defects-group">
                <div class="filtered-defects-group-title">${escapeHtml(apartmentLabel)}
                    ${phoneNote ? `<div class="print-comment-phone">${escapeHtml(phoneNote)}</div>` : ''}
                </div>
                ${renderFilteredDefectCommentList(comments)}
            </section>
        `;
    }).join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                @page { margin: 12mm; size: A4 portrait; }
                body { font-family: Inter, Arial, sans-serif; margin: 0; color: #111; font-size: 14px; background: #fff; }
                .sheet { padding: 8mm 2mm; }
                h1 { margin: 0 0 6px; font-size: 20px; }
                .subtitle { margin-bottom: 16px; color: #475569; line-height: 1.5; }
                .filtered-defects-group + .filtered-defects-group { margin-top: 18px; }
                .filtered-defects-group-title { font-size: 16px; font-weight: 700; color: #202124; line-height: 1.3; }
                .print-comment-phone { margin-top: 4px; font-size: 12px; font-weight: 500; color: #5f6368; }
                .filtered-comment-list { display: flex; flex-direction: column; gap: 8px; }
                .filtered-comment-card { padding: 2px 0; background: transparent; border: 0; border-radius: 0; box-shadow: none; text-align: left; page-break-inside: avoid; }
                .filtered-comment-head { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
                .filtered-comment-line { color: #202124; line-height: 1.5; word-break: break-word; font-size: 14px; font-weight: 400; text-align: left; }
                .filtered-comment-location-label { font-weight: 600; font-size: 12px; line-height: 1.4; color: #334155; padding: 0; border-radius: 999px; background: transparent; text-align: left; }
                .filtered-comment-location-label.is-muted { color: #64748b; background: transparent; }
                .filtered-comment-value { font-weight: 400; white-space: normal; text-align: left; font-size: 14px; line-height: 1.5; }
            </style>
        </head>
        <body>
            <div class="sheet">
                <h1>${title}</h1>
                ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
                ${contentHtml}
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
    const selectedSectionIds = getSelectedSectionIds();
    if (selectedSectionIds.length > 0) {
        params.set('sections', selectedSectionIds.join(','));
    }
    if (state.activeAccessFilters && state.activeAccessFilters.length > 0) {
        params.set('access_filters', state.activeAccessFilters.join(','));
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

function formatStatsShortDate(dateValue) {
    if (!dateValue) return '';
    return new Date(dateValue).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit'
    });
}

function renderStatsTrendChart(timeline, options = {}) {
    if (!Array.isArray(timeline) || !timeline.length) {
        return '<div class="stats-chart-empty">Нет данных для графика</div>';
    }

    const defaultSeries = [
        { key: 'remaining_with_defects', label: 'Остаток с замечаниями', color: '#e60042' },
        { key: 'with_defects', label: 'С замечаниями', color: '#111111' },
        { key: 'call', label: 'Вызов', color: '#e969a8' },
        { key: 'accepted', label: 'Принято', color: '#009d91' },
        { key: 'no_access', label: 'Нет доступа', color: '#64748b' }
    ];
    const legendLabels = options.legendLabels || {};
    const series = defaultSeries.map((item) => ({
        ...item,
        label: legendLabels[item.key] || item.label,
    }));

    const width = Number(options.width || 760);
    const height = Number(options.height || 320);
    const padding = {
        top: Number(options.paddingTop || 20),
        right: Number(options.paddingRight || 20),
        bottom: Number(options.paddingBottom || 34),
        left: Number(options.paddingLeft || 42),
    };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(1, ...timeline.flatMap((point) => series.map((item) => Number(point[item.key] || 0))));
    const ySteps = 4;
    const xStep = timeline.length > 1 ? innerWidth / (timeline.length - 1) : 0;
    const toX = (index) => padding.left + (index * xStep);
    const toY = (value) => padding.top + innerHeight - ((Number(value || 0) / maxValue) * innerHeight);

    const axisFontSize = Number(options.axisFontSize || 11);
    const lineStrokeWidth = Number(options.lineStrokeWidth || 3);
    const pointRadius = Number(options.pointRadius || 4);
    const legendFontSize = Number(options.legendFontSize || 12);
    const legendGap = Number(options.legendGap || 14);
    const legendColumns = Math.max(1, Number(options.legendColumns || series.length));

    const gridLines = Array.from({ length: ySteps + 1 }, (_, index) => {
        const value = Math.round((maxValue / ySteps) * index);
        const y = padding.top + innerHeight - (innerHeight / ySteps) * index;
        return `
            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="stats-chart-grid-line"></line>
            <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" class="stats-chart-axis-label" style="font-size:${axisFontSize}px">${value}</text>
        `;
    }).join('');

    const linePaths = series.map((item) => {
        const points = timeline.map((point, index) => `${toX(index)},${toY(point[item.key])}`).join(' ');
        const lastPoint = timeline[timeline.length - 1];
        return `
            <polyline fill="none" stroke="${item.color}" stroke-width="${lineStrokeWidth}" stroke-linecap="round" stroke-linejoin="round" points="${points}"></polyline>
            <circle cx="${toX(timeline.length - 1)}" cy="${toY(lastPoint[item.key])}" r="${pointRadius}" fill="${item.color}"></circle>
        `;
    }).join('');

    const firstLabel = formatStatsShortDate(timeline[0]?.date);
    const midLabel = formatStatsShortDate(timeline[Math.floor((timeline.length - 1) / 2)]?.date);
    const lastLabel = formatStatsShortDate(timeline[timeline.length - 1]?.date);

    return `
        <div class="stats-chart-shell">
            <svg viewBox="0 0 ${width} ${height}" class="stats-chart" role="img" aria-label="График статистики за все время">
                ${gridLines}
                ${linePaths}
                <text x="${padding.left}" y="${height - 8}" text-anchor="start" class="stats-chart-axis-label" style="font-size:${axisFontSize}px">${firstLabel}</text>
                <text x="${padding.left + innerWidth / 2}" y="${height - 8}" text-anchor="middle" class="stats-chart-axis-label" style="font-size:${axisFontSize}px">${midLabel}</text>
                <text x="${width - padding.right}" y="${height - 8}" text-anchor="end" class="stats-chart-axis-label" style="font-size:${axisFontSize}px">${lastLabel}</text>
            </svg>
            <div class="stats-chart-legend" style="grid-template-columns: repeat(${legendColumns}, minmax(0, 1fr)); gap:${Math.max(6, legendGap - 4)}px ${legendGap}px;">
                ${series.map((item) => `
                    <span class="stats-chart-legend-item" style="font-size:${legendFontSize}px; gap:${Math.max(6, legendGap - 6)}px;">
                        <span class="stats-chart-legend-icon" style="background:${item.color};"></span>
                        ${item.label}
                    </span>
                `).join('')}
            </div>
        </div>
    `;
}

function getStatsPrintRows(stats) {
    const totalApartments = stats.total_apartments || 0;
    const todayMetrics = stats.today_metrics || {};
    return [
        { label: 'Вызов', value: todayMetrics.call || 0, percent: formatStatsPercent(todayMetrics.call || 0, totalApartments), tone: 'call' },
        { label: 'Принято', value: todayMetrics.accepted || 0, percent: formatStatsPercent(todayMetrics.accepted || 0, totalApartments), tone: 'accepted' },
        { label: 'Нет доступа', value: todayMetrics.no_access || 0, percent: formatStatsPercent(todayMetrics.no_access || 0, totalApartments), tone: 'no-access' },
        { label: 'Остаток с замечаниями', value: todayMetrics.remaining_with_defects || 0, percent: formatStatsPercent(todayMetrics.remaining_with_defects || 0, totalApartments), tone: 'defects' },
        { label: 'С замечаниями', value: todayMetrics.with_defects || 0, percent: formatStatsPercent(todayMetrics.with_defects || 0, totalApartments), tone: 'remaining' }
    ];
}

function renderStatsExportLayout(stats, chartOptions = {}) {
    const periodLabel = formatStatsPeriodLabel(stats.first_defect_date || stats.period_start, new Date().toISOString().split('T')[0]);
    const statRows = getStatsPrintRows(stats);
    const timeline = stats.timeline || [];
    const firstDefectDate = stats.first_defect_date || stats.period_start;
    const todayLabel = formatStatsPeriodLabel(new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0]);

    return `
        <div class="stats-shell stats-dashboard-shell stats-export-shell">
            <div class="stats-dashboard-head">
                <div class="stats-dashboard-copy">
                    <div class="stats-dashboard-title">${escapeHtml(stats.complex_name || '')}</div>
                    <span class="stats-dashboard-period">Сводка и динамика за весь период: ${escapeHtml(periodLabel)}</span>
                </div>
            </div>

            <section class="stats-export-section stats-export-stats">
                <div class="stats-panel-head">
                    <strong>Оперативная статистика</strong>
                    <span>${escapeHtml(todayLabel)}</span>
                </div>
                <div class="stats-export-table">
                    <div class="stats-export-table-head">
                        <span>Статус</span>
                        <span>Количество</span>
                        <span>%</span>
                    </div>
                    ${statRows.map((row) => `
                        <div class="stats-export-table-row tone-${row.tone}">
                            <label>${escapeHtml(row.label)}</label>
                            <strong>${row.value}</strong>
                            <em>${escapeHtml(row.percent)}</em>
                        </div>
                    `).join('')}
                </div>
            </section>

            <section class="stats-export-section stats-export-chart">
                <div class="stats-panel-head">
                    <strong>Динамика за все время</strong>
                    <span>С ${escapeHtml(formatStatsShortDate(firstDefectDate))} по ${escapeHtml(formatStatsShortDate(new Date().toISOString().split('T')[0]))}</span>
                </div>
                <div class="stats-chart-wrap">
                    ${renderStatsTrendChart(timeline, chartOptions)}
                </div>
            </section>
        </div>
    `;
}

function formatStatsDateTime(value) {
    if (!value) return 'Дата не указана';
    const parsed = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatStatsApartmentLabel(apartment) {
    return String(apartment.number ?? '—');
}

function renderStatsApartmentList(apartments, options = {}) {
    const {
        emptyText = 'Список пуст',
        showCallTime = false,
        showDefectReason = false,
        defectReasonLabel = 'count',
    } = options;

    if (!Array.isArray(apartments) || apartments.length === 0) {
        return `<div class="stats-focus-empty">${escapeHtml(emptyText)}</div>`;
    }

    const groups = new Map();
    apartments.forEach((apartment) => {
        const key = String(apartment.section_number ?? 'Без секции');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(apartment);
    });

    const rendered = Array.from(groups.entries()).map(([sectionKey, sectionApartments]) => {
        const sectionText = sectionKey === 'Без секции' ? sectionKey : `Секция ${sectionKey}`;
        const items = sectionApartments.map((apartment) => {
            const meta = [];
            if (showCallTime && apartment.last_call_at) {
                meta.push(`последний вызов ${formatStatsDateTime(apartment.last_call_at)}`);
            }
            if (showDefectReason && Number(apartment.open_defects_count || 0) > 0) {
                if (defectReasonLabel === 'tag') {
                    meta.push('Открытые замечания');
                } else {
                    meta.push(`открытых замечаний: ${Number(apartment.open_defects_count || 0)}`);
                }
            }
            const label = escapeHtml(formatStatsApartmentLabel(apartment));
            return meta.length ? `${label} (${escapeHtml(meta.join(', '))})` : label;
        }).join(', ');
        return `<div class="stats-focus-line"><strong>${escapeHtml(sectionText)}:</strong> ${items}</div>`;
    }).join('');

    return `
        <div class="stats-focus-text">${rendered}</div>
    `;
}

function renderCallFocusStats(stats) {
    const callDetails = stats.call_details || {};
    const complexName = stats.complex_name || document.getElementById('jkName')?.textContent || 'ЖК';
    const referenceDateLabel = formatStatsPeriodLabel(callDetails.reference_date || stats.period_end, callDetails.reference_date || stats.period_end);

    return `
        <div class="stats-shell stats-dashboard-shell stats-focus-shell">
            <div class="stats-focus-header">
                <div class="stats-dashboard-title">${escapeHtml(complexName)}</div>
                <div class="stats-focus-subtitle">Вызов на ${escapeHtml(referenceDateLabel)}</div>
            </div>

            <div class="stats-focus-stack">
                <section class="stats-focus-section">
                    <div class="stats-focus-section-title">Ожидают приглашения: ${Number(callDetails.current_call_count || 0)}</div>
                    ${Array.isArray(callDetails.waiting_by_day) && callDetails.waiting_by_day.length ? callDetails.waiting_by_day.map((group) => `
                        <div class="stats-focus-group">
                            <div class="stats-focus-group-head">
                                <strong>${escapeHtml(group.date === 'Без даты' ? group.date : formatStatsPeriodLabel(group.date, group.date))}</strong>
                                <span>${Number(group.count || 0)}</span>
                            </div>
                            ${renderStatsApartmentList(group.apartments || [], { showCallTime: false })}
                        </div>
                    `).join('') : '<div class="stats-focus-empty">Нет квартир, ожидающих приглашения.</div>'}
                </section>

                <section class="stats-focus-section">
                    <div class="stats-focus-section-title">Повторный вызов: ${Number(callDetails.repeat_calls_count || 0)}</div>
                    ${renderStatsApartmentList(callDetails.repeat_calls || [], {
                        emptyText: 'Нет квартир в повторном вызове.',
                        showCallTime: false,
                        showDefectReason: false,
                    })}
                </section>

                <section class="stats-focus-section">
                    <div class="stats-focus-section-title">Не приняты после вызова: ${Number(callDetails.not_accepted_count || 0)}</div>
                    ${renderStatsApartmentList(callDetails.not_accepted_apartments || [], {
                        emptyText: 'После вызова нет квартир с новыми или незакрытыми замечаниями.',
                        showCallTime: false,
                        showDefectReason: true,
                    })}
                </section>
            </div>
        </div>
    `;
}

function renderAcceptedFocusStats(stats) {
    const acceptedDetails = stats.accepted_details || {};
    const complexName = stats.complex_name || document.getElementById('jkName')?.textContent || 'ЖК';
    const referenceDateLabel = formatStatsPeriodLabel(acceptedDetails.reference_date || stats.period_end, acceptedDetails.reference_date || stats.period_end);

    return `
        <div class="stats-shell stats-dashboard-shell stats-focus-shell">
            <div class="stats-focus-header">
                <div class="stats-dashboard-title">${escapeHtml(complexName)}</div>
                <div class="stats-focus-subtitle">Принятые квартиры на ${escapeHtml(referenceDateLabel)}</div>
            </div>

            <div class="stats-focus-stack">
                <section class="stats-focus-section">
                    <div class="stats-focus-section-title">Принятые сегодня: ${Number(acceptedDetails.accepted_today_count || 0)}</div>
                    ${renderStatsApartmentList(acceptedDetails.accepted_today || [], {
                        emptyText: 'Нет квартир, принятых сегодня.',
                        showCallTime: false,
                        showDefectReason: true,
                        defectReasonLabel: 'tag',
                    })}
                </section>

                <section class="stats-focus-section">
                    <div class="stats-focus-section-title">Принятые ранее: ${Number(acceptedDetails.accepted_earlier_count || 0)}</div>
                    ${Array.isArray(acceptedDetails.accepted_earlier_by_day) && acceptedDetails.accepted_earlier_by_day.length ? acceptedDetails.accepted_earlier_by_day.map((group) => `
                        <div class="stats-focus-group">
                            <div class="stats-focus-group-head">
                                <strong>${escapeHtml(group.date === 'Без даты' ? group.date : formatStatsPeriodLabel(group.date, group.date))}</strong>
                                <span>${Number(group.count || 0)}</span>
                            </div>
                            ${renderStatsApartmentList(group.apartments || [], {
                                emptyText: 'Список пуст',
                                showCallTime: false,
                                showDefectReason: true,
                                defectReasonLabel: 'tag',
                            })}
                        </div>
                    `).join('') : '<div class="stats-focus-empty">Нет ранее принятых квартир.</div>'}
                </section>
            </div>
        </div>
    `;
}

function formatNoAccessPeriod(period) {
    const fromLabel = period.from_date ? formatStatsDateTime(period.from_date).split(',')[0] : 'без даты';
    if (!period.to_date) return `с ${fromLabel}`;
    const toLabel = formatStatsDateTime(period.to_date).split(',')[0];
    return `с ${fromLabel} по ${toLabel}`;
}

function renderNoAccessList(records, emptyText) {
    if (!Array.isArray(records) || records.length === 0) {
        return `<div class="stats-focus-empty">${escapeHtml(emptyText)}</div>`;
    }

    const groups = new Map();
    records.forEach((record) => {
        const key = String(record.section_number ?? 'Без секции');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(record);
    });

    return `
        <div class="stats-focus-column">
            ${Array.from(groups.entries()).map(([sectionKey, sectionRecords]) => `
                <div class="stats-focus-group">
                    <div class="stats-focus-group-head">
                        <strong>${escapeHtml(sectionKey === 'Без секции' ? sectionKey : `Секция ${sectionKey}`)}</strong>
                        <span>${Number(sectionRecords.length || 0)}</span>
                    </div>
                    ${sectionRecords.map((record) => `
                        <div class="stats-focus-column-row">
                            <strong>${escapeHtml(String(record.apartment_number ?? '—'))}</strong>
                            <span>${escapeHtml((record.periods || []).map(formatNoAccessPeriod).join('; '))}</span>
                        </div>
                    `).join('')}
                </div>
            `).join('')}
        </div>
    `;
}

function renderNoAccessFocusStats(stats) {
    const noAccessDetails = stats.no_access_details || {};
    const complexName = stats.complex_name || document.getElementById('jkName')?.textContent || 'ЖК';
    const referenceDateLabel = formatStatsPeriodLabel(noAccessDetails.reference_date || stats.period_end, noAccessDetails.reference_date || stats.period_end);

    return `
        <div class="stats-shell stats-dashboard-shell stats-focus-shell">
            <div class="stats-focus-header">
                <div class="stats-dashboard-title">${escapeHtml(complexName)}</div>
                <div class="stats-focus-subtitle">Нет доступа на ${escapeHtml(referenceDateLabel)}</div>
            </div>

            <div class="stats-focus-stack">
                <section class="stats-focus-section">
                    <div class="stats-focus-section-title">Нет доступа сейчас: ${Number(noAccessDetails.current_no_access_count || 0)}</div>
                    ${renderNoAccessList(noAccessDetails.records || [], 'Нет квартир с периодами нет доступа.')}
                </section>
            </div>
        </div>
    `;
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
        const statsRes = await fetch(`/api/complexes/${state.currentComplex}/statistics?${getStatsQueryString()}`, { cache: 'no-store' });
        if (!statsRes.ok) throw new Error(`Statistics request failed: ${statsRes.status}`);
        const stats = await statsRes.json();
        statsMinDate = stats.first_defect_date || statsDate;

        const totalApartments = stats.total_apartments || 0;
        const complexName = stats.complex_name || document.getElementById('jkName')?.textContent || 'ЖК';
        const periodLabel = formatStatsPeriodLabel(stats.first_defect_date || stats.period_start, new Date().toISOString().split('T')[0]);
        const todayLabel = formatStatsPeriodLabel(new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0]);
        const todayMetrics = stats.today_metrics || {};
        const timeline = stats.timeline || [];
        const isApartmentType = state.currentPropertyType === 'апартаменты';
        const firstDefectDate = stats.first_defect_date || stats.period_start || new Date().toISOString().split('T')[0];

        if (stats.focus_mode === 'call' && stats.call_details) {
            body.innerHTML = renderCallFocusStats(stats);
            modal.classList.add('active');
            return;
        }

        if (stats.focus_mode === 'accepted' && stats.accepted_details) {
            body.innerHTML = renderAcceptedFocusStats(stats);
            modal.classList.add('active');
            return;
        }

        if (stats.focus_mode === 'no_access' && stats.no_access_details) {
            body.innerHTML = renderNoAccessFocusStats(stats);
            modal.classList.add('active');
            return;
        }

        const statRows = [
            {
                label: 'Вызов',
                value: todayMetrics.call || 0,
                percent: formatStatsPercent(todayMetrics.call || 0, totalApartments),
                tone: 'call'
            },
            {
                label: 'Принято',
                value: todayMetrics.accepted || 0,
                percent: formatStatsPercent(todayMetrics.accepted || 0, totalApartments),
                tone: 'accepted'
            },
            {
                label: 'Нет доступа',
                value: todayMetrics.no_access || 0,
                percent: formatStatsPercent(todayMetrics.no_access || 0, totalApartments),
                tone: 'no-access'
            },
            {
                label: 'Остаток с замечаниями',
                value: todayMetrics.remaining_with_defects || 0,
                percent: formatStatsPercent(todayMetrics.remaining_with_defects || 0, totalApartments),
                tone: 'defects'
            },
            {
                label: 'С замечаниями',
                value: todayMetrics.with_defects || 0,
                percent: formatStatsPercent(todayMetrics.with_defects || 0, totalApartments),
                tone: 'remaining'
            }
        ];

        const highlightCards = [
            {
                label: isApartmentType ? 'Всего апартаментов' : 'Всего квартир',
                value: totalApartments,
                meta: 'В корпусах текущего ЖК',
                tone: 'neutral'
            },
            {
                label: 'Принято',
                value: todayMetrics.accepted || 0,
                meta: formatStatsPercent(todayMetrics.accepted || 0, totalApartments),
                tone: 'accepted'
            },
            {
                label: 'Остаток с замечаниями',
                value: todayMetrics.remaining_with_defects || 0,
                meta: formatStatsPercent(todayMetrics.remaining_with_defects || 0, totalApartments),
                tone: 'defects'
            },
            {
                label: 'Нет доступа',
                value: todayMetrics.no_access || 0,
                meta: formatStatsPercent(todayMetrics.no_access || 0, totalApartments),
                tone: 'no-access'
            }
        ];

        body.innerHTML = `
            <div class="stats-shell stats-dashboard-shell">
                <div class="stats-dashboard-head">
                    <div class="stats-dashboard-copy">
                        <div class="stats-dashboard-title">${complexName}</div>
                        <span class="stats-dashboard-period">Сводка и динамика за весь период: ${periodLabel}</span>
                    </div>
                    <div class="stats-dashboard-actions">
                        <button class="pill pill-stats" onclick="printStatsReport()">Печать</button>
                        <button class="pill pill-stats" onclick="exportStatsJpg()">JPG</button>
                    </div>
                </div>

                <div class="stats-dashboard-grid">
                    <section class="stats-dashboard-card stats-metrics-card">
                        <div class="stats-panel-head">
                            <strong>Оперативная статистика</strong>
                            <span>${todayLabel}</span>
                        </div>
                        <div class="stats-metric-list">
                            ${statRows.map((row) => `
                                <div class="stats-metric-row tone-${row.tone}">
                                    <label>${row.label}</label>
                                    <strong>${row.value}</strong>
                                    <em>${row.percent}</em>
                                </div>
                            `).join('')}
                        </div>
                    </section>

                    <section class="stats-dashboard-card stats-chart-card">
                        <div class="stats-panel-head">
                            <strong>Динамика за все время</strong>
                            <span>С ${formatStatsShortDate(firstDefectDate)} по ${formatStatsShortDate(new Date().toISOString().split('T')[0])}</span>
                        </div>
                        <div class="stats-chart-wrap">
                            ${renderStatsTrendChart(timeline)}
                        </div>
                    </section>
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
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Браузер заблокировал окно печати');
        return;
    }

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Подготовка печати</title></head><body style="font-family: Arial, sans-serif; padding: 24px;">Подготовка печати...</body></html>`);
    printWindow.document.close();

    fetch(`/api/complexes/${state.currentComplex}/statistics?${getStatsQueryString()}`, { cache: 'no-store' })
    .then(r => r.json())
    .then(stats => {
        const jkName = stats.complex_name || document.getElementById('jkName').textContent;
        const contentHtml = renderStatsExportLayout(stats, {
            width: 920,
            height: 300,
            paddingLeft: 48,
            paddingRight: 24,
            paddingTop: 14,
            paddingBottom: 28,
            axisFontSize: 11,
            legendFontSize: 11,
            legendColumns: 3,
            legendGap: 8,
            lineStrokeWidth: 3,
            pointRadius: 4,
        });

        printWindow.document.open();
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Отчет - ${jkName}</title>
                <style>
                    * { box-sizing: border-box; }
                    @page { size: A4 landscape; margin: 0; }
                    html, body { width: 297mm; height: 210mm; margin: 0; padding: 0; background: #ffffff; }
                    body { font-family: Inter, Arial, sans-serif; color: #111111; display: flex; align-items: center; justify-content: center; }
                    .sheet { width: 297mm; height: 210mm; padding: 0; display: flex; align-items: center; justify-content: center; }
                    .stats-export-shell { width: 70%; height: 70%; display: flex; flex-direction: column; gap: 7px; padding: 0; background: #ffffff; overflow: visible; }
                    .stats-dashboard-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; border-bottom: 1px solid #d6d9de; padding: 0 0 8px; }
                    .stats-dashboard-copy { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
                    .stats-dashboard-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; color: #111111; }
                    .stats-dashboard-period { font-size: 12px; color: #555555; line-height: 1.35; }
                    .stats-export-section { display: flex; flex-direction: column; }
                    .stats-export-stats { flex: 0 0 auto; }
                    .stats-export-chart { flex: 1 1 auto; min-height: 0; }
                    .stats-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 0 0 6px; }
                    .stats-panel-head strong { font-size: 14px; font-weight: 700; color: #111111; letter-spacing: -0.01em; }
                    .stats-panel-head span { font-size: 12px; color: #555555; white-space: nowrap; }
                    .stats-export-table-head, .stats-export-table-row { display: grid; grid-template-columns: minmax(0, 1fr) 88px 56px; gap: 10px; align-items: center; }
                    .stats-export-table-head { padding: 0 0 6px; border-bottom: 1px solid #d6d9de; font-size: 10px; color: #666666; text-transform: uppercase; letter-spacing: 0.04em; }
                    .stats-export-table-head span:nth-child(2), .stats-export-table-head span:nth-child(3) { text-align: right; }
                    .stats-export-table-row { padding: 9px 0; border-bottom: 1px solid #ececec; }
                    .stats-export-table-row:last-child { border-bottom: 0; }
                    .stats-export-table-row label, .stats-export-table-row strong, .stats-export-table-row em { font-style: normal; }
                    .stats-export-table-row label { font-size: 13px; font-weight: 600; color: #111111; }
                    .stats-export-table-row strong { text-align: right; font-size: 20px; line-height: 1; color: #111111; font-variant-numeric: tabular-nums; }
                    .stats-export-table-row em { text-align: right; font-size: 11px; color: #666666; font-variant-numeric: tabular-nums; }
                    .stats-chart-wrap { padding: 2px 0 0; flex: 1; min-height: 0; overflow: visible; }
                    .stats-chart-shell { display: flex; flex-direction: column; gap: 6px; overflow: visible; }
                    .stats-chart { width: 100%; height: auto; display: block; }
                    .stats-chart-grid-line { stroke: #d6d9de; stroke-width: 1; }
                    .stats-chart-axis-label { fill: #666666; font-size: 10px; }
                    .stats-chart-legend { display: flex !important; flex-wrap: wrap; align-items: center; gap: 6px 12px !important; overflow: visible; }
                    .stats-chart-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 9px; color: #444444; min-width: 0; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.04em; }
                    .stats-chart-legend-icon { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex: 0 0 auto; border: 1px solid rgba(17,17,17,0.18); print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    .stats-chart-empty { min-height: 100%; display: flex; align-items: center; justify-content: center; color: #666666; font-size: 13px; border: 0; border-radius: 0; background: #ffffff; }
                    body, .stats-chart-legend-icon, .stats-chart, .stats-chart-shell { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    @media print { html, body { width: auto; height: auto; } }
                </style>
            </head>
            <body>
                <div class="sheet">
                    ${contentHtml}
                </div>
                <script>
                    window.onload = function () {
                        window.focus();
                        setTimeout(function () {
                            window.print();
                        }, 300);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    })
    .catch(error => {
        console.error('Print statistics failed', error);
        printWindow.document.open();
        printWindow.document.write(`<!DOCTYPE html><html><head><title>Ошибка печати</title></head><body style="font-family: Arial, sans-serif; padding: 24px;">Не удалось подготовить печать статистики.</body></html>`);
        printWindow.document.close();
    });
}

function exportStatsJpg() {
    window.open(`/api/complexes/${state.currentComplex}/statistics/jpg?${getStatsQueryString()}`, '_blank');
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
        'complex': 'Сложная',
        'no_access': 'Нет доступа',
        'by_phone': 'По звонку',
        'elevated': 'Поднять',
        'in_progress': 'В работе'
    };
    return names[status] || status || 'Неизвестно';
}

let tooltipTimeout = null;
let currentTooltip = null;

function showPhoneTooltip(event) {
    const phone = state.currentApartmentData?.access_phone;
    if (!phone) return;
    
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
        showTooltip(event, phone);
    }, 500);
}

function showComplexTooltip(event) {
    const comment = state.currentApartmentData?.access_comment;
    if (!comment) return;
    
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
        showTooltip(event, comment);
    }, 500);
}

function showTooltip(event, text) {
    hideTooltip();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'status-tooltip';
    tooltip.textContent = text;
    tooltip.style.cssText = `
        position: fixed;
        background: #333;
        color: #fff;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 10000;
        max-width: 250px;
        word-wrap: break-word;
        pointer-events: none;
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
    
    currentTooltip = tooltip;
}

function hideTooltip() {
    clearTimeout(tooltipTimeout);
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

console.log('app.js loaded - v2.0 optimized');
