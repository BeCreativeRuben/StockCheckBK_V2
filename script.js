// Global Variables
let currentUser = null;
let isAdmin = false;
let currentCategory = 'all';
let stockData = [];
let lastKnownModifiedDate = null;
let realtimeSyncInterval = null;
let pendingUpdates = []; // Batch queue voor updates
let batchSyncTimeout = null; // Timeout voor debouncing
const REALTIME_SYNC_INTERVAL = 30000; // 30 seconden - interval voor realtime updates
const BATCH_SYNC_DELAY = 1000; // 1 seconde wachten na laatste wijziging voor batch sync
const adminPassword = 'battlekart2025';
// IMPORTANT: After deploying Google Apps Script as Web App, paste the Web App URL here:
// Example: const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwtha4Hzc1pk-WjKCqrmL_r7EozWl8UG-sfV-U7-GTcMZ3RmK_bsGmcQNCEvUC3j4MuRQ/exec';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Stop realtime sync bij page unload en probeer pending updates te flush
window.addEventListener('beforeunload', () => {
    stopRealtimeSync();
    // Flush pending updates before page unload (niet altijd betrouwbaar, maar we proberen het)
    if (pendingUpdates.length > 0 && batchSyncTimeout) {
        clearTimeout(batchSyncTimeout);
        // Gebruik fetch met keepalive flag (wordt mogelijk niet uitgevoerd, maar we proberen het)
        if (GOOGLE_APPS_SCRIPT_URL && pendingUpdates.length === 1) {
            const update = pendingUpdates[0];
            fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'updateItem',
                    item: { id: update.itemId, value: update.value },
                    field: update.field,
                    user: currentUser
                }),
                keepalive: true
            }).catch(() => {}); // Ignore errors, we're leaving anyway
        } else if (GOOGLE_APPS_SCRIPT_URL && pendingUpdates.length > 1) {
            fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'updateBatch',
                    updates: pendingUpdates,
                    user: currentUser
                }),
                keepalive: true
            }).catch(() => {}); // Ignore errors, we're leaving anyway
        }
    }
});

function initializeApp() {
    updateCurrentDate();
    setupEventListeners();
    checkUserSession();
    loadStockData();
}

function updateCurrentDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateString = now.toLocaleDateString('nl-NL', options);
    document.getElementById('currentDate').textContent = dateString;
}

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleUserLogin);
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
    
    // Category filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const category = e.target.dataset.category;
            setCategory(category);
        });
    });
    
    // Add item form
    document.getElementById('addItemForm').addEventListener('submit', addNewItem);
}

function checkUserSession() {
    const storedUser = sessionStorage.getItem('currentUser');
    const storedAdmin = sessionStorage.getItem('isAdmin') === 'true';
    
    if (storedUser) {
        currentUser = storedUser;
        isAdmin = storedAdmin;
        updateUserDisplay();
        loadStockData();
        startRealtimeSync();
    } else {
        showLoginModal();
    }
}

// User System
function showLoginModal() {
    document.getElementById('loginModal').classList.add('show');
}

function hideLoginModal() {
    document.getElementById('loginModal').classList.remove('show');
}

function handleUserLogin(e) {
    e.preventDefault();
    const userName = document.getElementById('userNameInput').value.trim();
    
    if (!userName) {
        showToast('Voer een naam in', 'error');
        return;
    }
    
    currentUser = userName;
    sessionStorage.setItem('currentUser', currentUser);
    updateUserDisplay();
    hideLoginModal();
    loadStockData();
    startRealtimeSync();
}

function handleLogout() {
    stopRealtimeSync();
    // Flush pending updates before logout
    if (pendingUpdates.length > 0 && batchSyncTimeout) {
        clearTimeout(batchSyncTimeout);
        syncBatchToGoogleSheets();
    }
    pendingUpdates = [];
    currentUser = null;
    isAdmin = false;
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('isAdmin');
    updateUserDisplay();
    showLoginModal();
}

function showAdminLoginModal() {
    if (!currentUser) {
        showToast('Log eerst in als gebruiker', 'error');
        return;
    }
    document.getElementById('adminLoginModal').classList.add('show');
}

function hideAdminLoginModal() {
    document.getElementById('adminLoginModal').classList.remove('show');
    document.getElementById('adminPasswordInput').value = '';
}

function handleAdminLogin(e) {
    e.preventDefault();
    const password = document.getElementById('adminPasswordInput').value;
    
    if (password === adminPassword) {
        isAdmin = true;
        sessionStorage.setItem('isAdmin', 'true');
        updateUserDisplay();
        hideAdminLoginModal();
        showToast('Admin toegang verkregen', 'success');
    } else {
        showToast('Onjuist wachtwoord', 'error');
        document.getElementById('adminPasswordInput').value = '';
    }
}

function updateUserDisplay() {
    const userNameEl = document.getElementById('userName');
    const userInfoEl = document.getElementById('userInfo');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (currentUser) {
        userNameEl.textContent = currentUser;
        userInfoEl.style.display = 'flex';
        logoutBtn.style.display = 'block';
        
        if (isAdmin) {
            userNameEl.classList.add('admin');
        } else {
            userNameEl.classList.remove('admin');
        }
    } else {
        userInfoEl.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
}

// Category Filtering
function setCategory(category) {
    currentCategory = category;
    updateCategoryButtons();
    renderStockGrid();
}

function updateCategoryButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.category === currentCategory) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Stock Data Management
async function loadStockData() {
    try {
        showToast('Data laden...', 'info');
        
        // Try to load from Google Apps Script
        if (GOOGLE_APPS_SCRIPT_URL) {
            try {
                const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=read`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.items) {
                        stockData = data.items;
                        if (data.lastModified) {
                            updateLastModifiedInfo(data.lastModified);
                            // Bewaar de laatste wijzigingsdatum voor realtime sync
                            if (data.lastModified.lastModifiedDate) {
                                lastKnownModifiedDate = data.lastModified.lastModifiedDate;
                            }
                        }
                        
                        // Als de spreadsheet leeg is, initialiseer met default data
                        if (stockData.length === 0) {
                            initializeDefaultData();
                            renderStockGrid();
                            showToast('Data geïnitialiseerd', 'success');
                        } else {
                            renderStockGrid();
                            saveToLocalStorage();
                            showToast('Data geladen', 'success');
                        }
                        return;
                    }
                }
            } catch (fetchError) {
                console.error('Error fetching from Google Apps Script:', fetchError);
                // Fall through to localStorage
            }
        }
        
        // Fallback to localStorage
        loadFromLocalStorage();
        
        // If no data, initialize with default items
        if (stockData.length === 0) {
            initializeDefaultData();
        }
        
        renderStockGrid();
    } catch (error) {
        console.error('Error loading data:', error);
        loadFromLocalStorage();
        
        if (stockData.length === 0) {
            initializeDefaultData();
        }
        
        renderStockGrid();
        showToast('Fout bij laden data, gebruik lokale versie', 'error');
    }
}

function initializeDefaultData() {
    // Initialize with default items according to plan
    const defaultItems = [
        // Eerste Koelkast - Frisdranken
        { id: 1, name: 'Cola', category: 'drank', unit: 'krat/bak (24x25cl)', minimum: 10, current: 0, sortOrder: 1 },
        { id: 2, name: 'Cola zero', category: 'drank', unit: 'krat/bak (24x25cl)', minimum: 10, current: 0, sortOrder: 2 },
        { id: 3, name: 'Fanta', category: 'drank', unit: 'krat/bak (24x25cl)', minimum: 5, current: 0, sortOrder: 3 },
        { id: 4, name: 'Sprite', category: 'drank', unit: 'krat/bak (24x25cl)', minimum: 5, current: 0, sortOrder: 4 },
        
        // Tweede Koelkast - Ice Tea & Schweppes
        { id: 5, name: 'Ice Tea', category: 'drank', unit: 'krat/bak (24x25cl)', minimum: 8, current: 0, sortOrder: 5 },
        { id: 6, name: 'Ice Tea green', category: 'drank', unit: 'krat/bak (24x25cl)', minimum: 5, current: 0, sortOrder: 6 },
        { id: 7, name: 'Schweppes ginger', category: 'drank', unit: 'krat/bak (24x20cl)', minimum: 3, current: 0, sortOrder: 7 },
        { id: 8, name: 'Schweppes agrumes', category: 'drank', unit: 'krat/bak (24x20cl)', minimum: 3, current: 0, sortOrder: 8 },
        { id: 9, name: 'Schweppes spritz', category: 'drank', unit: 'krat/bak (24x20cl)', minimum: 3, current: 0, sortOrder: 9 },
        { id: 10, name: 'Schweppes tonic', category: 'drank', unit: 'krat/bak (24x20cl)', minimum: 5, current: 0, sortOrder: 10 },
        
        // Derde Koelkast - Sappen & Drankjes
        { id: 11, name: 'Looza Orange', category: 'drank', unit: 'tray/fles (20cl/1L)', minimum: 5, current: 0, sortOrder: 11 },
        { id: 12, name: 'Looza ACE original', category: 'drank', unit: 'tray/fles (20cl/1L)', minimum: 5, current: 0, sortOrder: 12 },
        { id: 13, name: 'Looza apple', category: 'drank', unit: 'tray/fles (20cl/1L)', minimum: 3, current: 0, sortOrder: 13 },
        { id: 14, name: 'Looza pineapple', category: 'drank', unit: 'tray/fles (20cl/1L)', minimum: 3, current: 0, sortOrder: 14 },
        { id: 15, name: 'Looza appel-kers', category: 'drank', unit: 'tray/fles (20cl/1L)', minimum: 3, current: 0, sortOrder: 15 },
        { id: 16, name: 'Caprisun', category: 'drank', unit: 'doos (10-15 stuks)', minimum: 8, current: 0, sortOrder: 16 },
        { id: 17, name: 'Cecemel', category: 'drank', unit: 'tray (24x20cl of 6x20cl brik)', minimum: 3, current: 0, sortOrder: 17 },
        { id: 18, name: 'Fristi', category: 'drank', unit: 'tray (24x20cl of 6x20cl brik)', minimum: 3, current: 0, sortOrder: 18 },
        { id: 19, name: 'Plat water', category: 'drank', unit: 'krat/bak (24x25cl)', minimum: 5, current: 0, sortOrder: 19 },
        { id: 20, name: 'Bruis water', category: 'drank', unit: 'krat/bak (24x25cl)', minimum: 5, current: 0, sortOrder: 20 },
        
        // Vierde Koelkast - Energy Drinks
        { id: 21, name: 'RedBull', category: 'drank', unit: 'tray (24x25cl)', minimum: 6, current: 0, sortOrder: 21 },
        
        // Vijfde Koelkast - Bieren, Wijnen & Grote Flessen
        { id: 22, name: 'Omer', category: 'drank', unit: 'krat/bak (24x33cl)', minimum: 6, current: 0, sortOrder: 22 },
        { id: 23, name: 'Martha', category: 'drank', unit: 'flessen', minimum: 6, current: 0, sortOrder: 23 },
        { id: 24, name: 'Wijn (wit)', category: 'drank', unit: 'dozen (6/12 flessen)', minimum: 2, current: 0, sortOrder: 24 },
        { id: 25, name: 'Wijn (rood)', category: 'drank', unit: 'dozen (6/12 flessen)', minimum: 2, current: 0, sortOrder: 25 },
        { id: 26, name: 'Wijn (rosé)', category: 'drank', unit: 'dozen (6/12 flessen)', minimum: 2, current: 0, sortOrder: 26 },
        { id: 27, name: 'Bubbels', category: 'drank', unit: 'dozen (6/12 flessen)', minimum: 2, current: 0, sortOrder: 27 },
        
        // Zesde Koelkast - Alcoholvrij & Light Bieren
        { id: 28, name: 'Stella 0.0%', category: 'drank', unit: 'krat/bak (24x25cl/33cl)', minimum: 5, current: 0, sortOrder: 28 },
        { id: 29, name: 'Hoegaarden rose', category: 'drank', unit: 'krat/bak (24x25cl/33cl)', minimum: 5, current: 0, sortOrder: 29 },
        { id: 30, name: 'Ouwen Duiker', category: 'drank', unit: 'krat/bak (24x33cl)', minimum: 5, current: 0, sortOrder: 30 },
        { id: 31, name: 'Sommersby appel', category: 'drank', unit: 'tray (24x33cl)', minimum: 3, current: 0, sortOrder: 31 },
        { id: 32, name: 'Corona', category: 'drank', unit: 'tray (24x33cl)', minimum: 3, current: 0, sortOrder: 32 },
        { id: 33, name: 'Corona 0.0%', category: 'drank', unit: 'tray (24x33cl)', minimum: 3, current: 0, sortOrder: 33 },
        
        // Zevende Koelkast - Trappist & Premium Bieren
        { id: 34, name: 'Orval', category: 'drank', unit: 'krat/bak (24x33cl)', minimum: 5, current: 0, sortOrder: 34 },
        { id: 35, name: 'Chimay', category: 'drank', unit: 'krat/bak (24x33cl)', minimum: 5, current: 0, sortOrder: 35 },
        { id: 36, name: 'Carlsberg', category: 'drank', unit: 'krat/bak (24x25cl/33cl)', minimum: 5, current: 0, sortOrder: 36 },
        { id: 37, name: 'Carlsberg 0.0%', category: 'drank', unit: 'krat/bak (24x25cl/33cl)', minimum: 5, current: 0, sortOrder: 37 },
        { id: 38, name: 'Westmalle', category: 'drank', unit: 'krat/bak (24x33cl)', minimum: 5, current: 0, sortOrder: 38 },
        
        // Achtste Koelkast - Stout & Speciale Bieren
        { id: 39, name: 'Guinness', category: 'drank', unit: 'krat/bak (24x33cl)', minimum: 5, current: 0, sortOrder: 39 },
        { id: 40, name: 'Paix Dieu', category: 'drank', unit: 'krat/bak (24x33cl)', minimum: 5, current: 0, sortOrder: 40 },
        { id: 41, name: 'Duvel', category: 'drank', unit: 'krat/bak (24x33cl)', minimum: 8, current: 0, sortOrder: 41 },
        { id: 42, name: 'Desperados', category: 'drank', unit: 'tray (24x33cl)', minimum: 3, current: 0, sortOrder: 42 },
        
        // Items buiten koelkasten
        { id: 43, name: 'Gasflessen', category: 'drank', unit: 'flessen', minimum: 3, current: 0, sortOrder: 43 },
        { id: 44, name: 'Caperol', category: 'drank', unit: 'flessen', minimum: 6, current: 0, sortOrder: 44 },
        { id: 45, name: 'Gin', category: 'drank', unit: 'flessen', minimum: 6, current: 0, sortOrder: 45 },
        { id: 46, name: 'Eristegy whisky', category: 'drank', unit: 'flessen', minimum: 6, current: 0, sortOrder: 46 },
        { id: 47, name: 'Jameson whisky', category: 'drank', unit: 'flessen', minimum: 6, current: 0, sortOrder: 47 },
        { id: 48, name: 'Bacardi', category: 'drank', unit: 'flessen', minimum: 6, current: 0, sortOrder: 48 },
        { id: 49, name: 'Hoegaarden', category: 'drank', unit: 'krat/bak (24x25cl/33cl)', minimum: 5, current: 0, sortOrder: 49 },
        { id: 50, name: 'Stella', category: 'drank', unit: 'krat/bak (24x25cl/33cl)', minimum: 5, current: 0, sortOrder: 50 },
        { id: 51, name: 'Gouwen Duvelen', category: 'drank', unit: 'krat/bak (24x33cl)', minimum: 5, current: 0, sortOrder: 51 },
        { id: 52, name: 'Chips', category: 'eten', unit: 'dozen (multipack)', minimum: 3, current: 0, sortOrder: 52 },
        { id: 53, name: 'Worstjes', category: 'eten', unit: 'dozen', minimum: 2, current: 0, sortOrder: 53 },
        { id: 54, name: 'Aiki', category: 'eten', unit: 'dozen', minimum: 2, current: 0, sortOrder: 54 }
    ];
    
    stockData = defaultItems.map(item => ({
        ...item,
        lastModified: new Date().toISOString(),
        modifiedBy: currentUser || 'System'
    }));
    
    saveToLocalStorage();
    renderStockGrid(); // Render de UI direct na initialisatie
    if (GOOGLE_APPS_SCRIPT_URL) {
        syncToGoogleSheets(); // Sync naar Google Sheets (async, maar niet blocking)
    }
}

function saveToLocalStorage() {
    localStorage.setItem('battlekartStockData', JSON.stringify(stockData));
}

function loadFromLocalStorage() {
    const stored = localStorage.getItem('battlekartStockData');
    if (stored) {
        try {
            stockData = JSON.parse(stored);
        } catch (error) {
            console.error('Error parsing localStorage data:', error);
            stockData = [];
        }
    }
}

// Sync batch of updates to Google Sheets (optimized)
async function syncBatchToGoogleSheets() {
    if (!GOOGLE_APPS_SCRIPT_URL || pendingUpdates.length === 0) return;
    
    // Make a copy of pending updates and clear the queue
    const updatesToSync = [...pendingUpdates];
    pendingUpdates = [];
    batchSyncTimeout = null;
    
    try {
        // If only one update, use single item update (more efficient)
        if (updatesToSync.length === 1) {
            const update = updatesToSync[0];
            const item = stockData.find(i => i.id === update.itemId);
            
            if (item) {
                const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'updateItem',
                        item: {
                            id: update.itemId,
                            value: update.value
                        },
                        field: update.field,
                        user: currentUser
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.lastModified) {
                        updateLastModifiedInfo(data.lastModified);
                    }
                }
            }
        } else {
            // Multiple updates: use batch update
            const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'updateBatch',
                    updates: updatesToSync,
                    user: currentUser
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.lastModified) {
                    updateLastModifiedInfo(data.lastModified);
                }
            }
        }
    } catch (error) {
        console.error('Error syncing batch to Google Sheets:', error);
        // Re-add failed updates to queue for retry
        pendingUpdates = [...updatesToSync, ...pendingUpdates];
        showToast('Fout bij sync, wordt opnieuw geprobeerd', 'error');
    }
}

// Legacy function for full sync (still used for initial data push)
async function syncToGoogleSheets() {
    if (!GOOGLE_APPS_SCRIPT_URL) return;
    
    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'update',
                items: stockData,
                user: currentUser
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.lastModified) {
                updateLastModifiedInfo(data.lastModified);
            }
        }
    } catch (error) {
        console.error('Error syncing to Google Sheets:', error);
        // Don't show error to user, just log it
    }
}

function updateLastModifiedInfo(lastModified) {
    if (lastModified && lastModified.lastModifiedDate) {
        try {
            const date = new Date(lastModified.lastModifiedDate);
            const user = lastModified.lastModifiedBy || 'Onbekend';
            const dateString = date.toLocaleString('nl-NL');
            document.getElementById('lastModifiedText').textContent = `${user} - ${dateString}`;
            // Update lastKnownModifiedDate voor realtime sync
            lastKnownModifiedDate = lastModified.lastModifiedDate;
        } catch (error) {
            document.getElementById('lastModifiedText').textContent = '-';
        }
    } else {
        document.getElementById('lastModifiedText').textContent = '-';
    }
}

// Realtime Sync - Check periodiek voor updates van andere gebruikers
function startRealtimeSync() {
    if (!GOOGLE_APPS_SCRIPT_URL) return;
    
    // Stop bestaande interval als die er is
    stopRealtimeSync();
    
    // Start nieuwe interval
    realtimeSyncInterval = setInterval(async () => {
        await checkForUpdates();
    }, REALTIME_SYNC_INTERVAL);
    
    console.log('Realtime sync gestart (elke 30 seconden)');
}

function stopRealtimeSync() {
    if (realtimeSyncInterval) {
        clearInterval(realtimeSyncInterval);
        realtimeSyncInterval = null;
        console.log('Realtime sync gestopt');
    }
}

// Check of er updates zijn zonder de volledige data op te halen
async function checkForUpdates() {
    if (!GOOGLE_APPS_SCRIPT_URL || !currentUser) return;
    
    try {
        // Haal alleen de config op (lichtgewicht - bevat LastModifiedDate)
        const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=config`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.lastModified && data.lastModified.lastModifiedDate) {
                const serverModifiedDate = data.lastModified.lastModifiedDate;
                const serverModifiedBy = data.lastModified.lastModifiedBy;
                
                // Check of er een wijziging is
                if (lastKnownModifiedDate && serverModifiedDate !== lastKnownModifiedDate) {
                    // Alleen toast tonen als het niet door de huidige gebruiker is
                    const isOwnChange = serverModifiedBy === currentUser;
                    
                    // Er is een wijziging, haal de volledige data op
                    await loadStockDataSilent();
                    
                    // Toon toast alleen als het niet onze eigen wijziging is
                    if (!isOwnChange) {
                        showToast('🔄 Data bijgewerkt', 'info');
                    }
                } else if (!lastKnownModifiedDate) {
                    // Eerste keer - initialiseer lastKnownModifiedDate
                    lastKnownModifiedDate = serverModifiedDate;
                }
            }
        }
    } catch (error) {
        // Stil falen - log alleen in console
        console.debug('Realtime sync check gefaald:', error);
    }
}

// Silent load zonder toast notifications (voor realtime updates)
async function loadStockDataSilent() {
    try {
        if (GOOGLE_APPS_SCRIPT_URL) {
            try {
                const response = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=read`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.items) {
                        stockData = data.items;
                        if (data.lastModified) {
                            updateLastModifiedInfo(data.lastModified);
                            if (data.lastModified.lastModifiedDate) {
                                lastKnownModifiedDate = data.lastModified.lastModifiedDate;
                            }
                        }
                        renderStockGrid();
                        saveToLocalStorage();
                        return;
                    }
                }
            } catch (fetchError) {
                console.error('Error fetching from Google Apps Script:', fetchError);
            }
        }
        
        // Fallback to localStorage
        loadFromLocalStorage();
        renderStockGrid();
    } catch (error) {
        console.error('Error loading data:', error);
        loadFromLocalStorage();
        renderStockGrid();
    }
}

// Stock Grid Rendering
function renderStockGrid() {
    const grid = document.getElementById('stockGrid');
    
    if (!currentUser) {
        grid.innerHTML = '<div class="loading">Log in om stock te bekijken</div>';
        return;
    }
    
    // Filter by category
    let filteredData = stockData;
    if (currentCategory !== 'all') {
        filteredData = stockData.filter(item => item.category === currentCategory);
    }
    
    // Sort by sortOrder
    filteredData.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    if (filteredData.length === 0) {
        grid.innerHTML = '<div class="loading">Geen items gevonden</div>';
        return;
    }
    
    grid.innerHTML = filteredData.map(item => createStockItemHTML(item)).join('');
    
    // Add event listeners
    filteredData.forEach(item => {
        addStockItemEventListeners(item);
    });
}

function createStockItemHTML(item) {
    const isLowStock = item.current < item.minimum;
    const isNearMinimum = item.current <= item.minimum + 2;
    const statusClass = isLowStock ? 'low-stock' : isNearMinimum ? 'near-minimum' : '';
    
    return `
        <div class="stock-item ${statusClass}" data-id="${item.id}">
            <div class="stock-item-header">
                <span class="stock-item-name">${escapeHtml(item.name)}</span>
                <span class="category-badge ${item.category}">${item.category.toUpperCase()}</span>
            </div>
            <div class="stock-item-body">
                <div class="stock-field">
                    <label>Huidige Stock</label>
                    <input type="number" 
                           class="stock-input current-input" 
                           data-id="${item.id}" 
                           data-field="current"
                           value="${item.current}" 
                           min="0" 
                           step="1">
                    <span class="error-message" id="error-current-${item.id}"></span>
                </div>
                <div class="stock-field">
                    <label>Minimum</label>
                    <input type="number" 
                           class="stock-input minimum-input ${isAdmin ? '' : 'readonly'}" 
                           data-id="${item.id}" 
                           data-field="minimum"
                           value="${item.minimum}" 
                           min="0" 
                           step="1"
                           ${isAdmin ? '' : 'readonly'}>
                    <span class="error-message" id="error-minimum-${item.id}"></span>
                </div>
                <div class="stock-unit">${escapeHtml(item.unit)}</div>
            </div>
        </div>
    `;
}

function addStockItemEventListeners(item) {
    const currentInput = document.querySelector(`.current-input[data-id="${item.id}"]`);
    const minimumInput = document.querySelector(`.minimum-input[data-id="${item.id}"]`);
    
    if (currentInput) {
        currentInput.addEventListener('blur', (e) => updateStockValue(item.id, 'current', e.target.value));
        currentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });
    }
    
    if (minimumInput && isAdmin) {
        minimumInput.addEventListener('blur', (e) => updateStockValue(item.id, 'minimum', e.target.value));
        minimumInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });
    }
}

async function updateStockValue(itemId, field, value) {
    const item = stockData.find(i => i.id === itemId);
    if (!item) return;
    
    // Validation
    const numValue = parseInt(value);
    if (isNaN(numValue) || numValue < 0) {
        showFieldError(itemId, field, 'Voer een geldig getal in (≥ 0)');
        // Reset to original value
        document.querySelector(`.${field}-input[data-id="${itemId}"]`).value = item[field];
        return;
    }
    
    clearFieldError(itemId, field);
    
    const oldValue = item[field];
    
    // Check if value actually changed
    if (oldValue === numValue) {
        return; // No change, skip update
    }
    
    item[field] = numValue;
    item.lastModified = new Date().toISOString();
    item.modifiedBy = currentUser;
    
    saveToLocalStorage();
    
    // Add to batch queue (only the changed item)
    if (GOOGLE_APPS_SCRIPT_URL) {
        // Remove any existing update for this item+field combination
        pendingUpdates = pendingUpdates.filter(u => !(u.itemId === itemId && u.field === field));
        
        // Add new update
        pendingUpdates.push({
            itemId: itemId,
            field: field,
            value: numValue,
            oldValue: oldValue
        });
        
        // Clear existing timeout
        if (batchSyncTimeout) {
            clearTimeout(batchSyncTimeout);
        }
        
        // Schedule batch sync with debouncing
        batchSyncTimeout = setTimeout(async () => {
            await syncBatchToGoogleSheets();
        }, BATCH_SYNC_DELAY);
    }
    
    showToast('Stock bijgewerkt', 'success');
    
    // Re-render to update visual feedback
    renderStockGrid();
}

function showFieldError(itemId, field, message) {
    const errorEl = document.getElementById(`error-${field}-${itemId}`);
    if (errorEl) {
        errorEl.textContent = message;
        const inputEl = document.querySelector(`.${field}-input[data-id="${itemId}"]`);
        if (inputEl) {
            inputEl.classList.add('error');
        }
    }
}

function clearFieldError(itemId, field) {
    const errorEl = document.getElementById(`error-${field}-${itemId}`);
    if (errorEl) {
        errorEl.textContent = '';
        const inputEl = document.querySelector(`.${field}-input[data-id="${itemId}"]`);
        if (inputEl) {
            inputEl.classList.remove('error');
        }
    }
}

// Order List Generation
function generateOrderList() {
    if (!currentUser) {
        showToast('Log eerst in', 'error');
        return;
    }
    
    const orderItems = stockData.filter(item => item.current < item.minimum);
    
    if (orderItems.length === 0) {
        showToast('Geen items om te bestellen', 'info');
        return;
    }
    
    // Sort by sortOrder
    orderItems.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    const now = new Date();
    const dateString = now.toLocaleDateString('nl-NL');
    const timeString = now.toLocaleTimeString('nl-NL');
    
    let html = `
        <div class="order-list-header">
            <h3>Bestellijst - ${dateString} ${timeString}</h3>
            <p>Gegenereerd door: ${currentUser}</p>
        </div>
        <table class="order-list-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Categorie</th>
                    <th>Huidig</th>
                    <th>Minimum</th>
                    <th>Te Bestellen</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    let totalToOrder = 0;
    
    orderItems.forEach(item => {
        const toOrder = item.minimum - item.current;
        totalToOrder += toOrder;
        
        html += `
            <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.category)}</td>
                <td>${item.current}</td>
                <td>${item.minimum}</td>
                <td><strong>${toOrder}</strong></td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
        <div class="order-list-summary">
            <h4>Samenvatting</h4>
            <p><strong>Totaal aantal items:</strong> ${orderItems.length}</p>
            <p><strong>Totale hoeveelheid te bestellen:</strong> ${totalToOrder}</p>
        </div>
    `;
    
    document.getElementById('orderListContent').innerHTML = html;
    document.getElementById('orderListModal').classList.add('show');
}

function closeOrderListModal() {
    document.getElementById('orderListModal').classList.remove('show');
}

function copyOrderList() {
    const orderItems = stockData.filter(item => item.current < item.minimum);
    
    if (orderItems.length === 0) {
        showToast('Geen items om te bestellen', 'info');
        return;
    }
    
    orderItems.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    const now = new Date();
    const dateString = now.toLocaleDateString('nl-NL');
    const timeString = now.toLocaleTimeString('nl-NL');
    
    let text = `BESTELLIJST - ${dateString} ${timeString}\n`;
    text += `Gegenereerd door: ${currentUser}\n\n`;
    text += 'ITEM\tCATEGORIE\tHUIDIG\tMINIMUM\tTE BESTELLEN\n';
    text += '─'.repeat(60) + '\n';
    
    let totalToOrder = 0;
    
    orderItems.forEach(item => {
        const toOrder = item.minimum - item.current;
        totalToOrder += toOrder;
        text += `${item.name}\t${item.category}\t${item.current}\t${item.minimum}\t${toOrder}\n`;
    });
    
    text += '\n';
    text += `SAMENVATTING:\n`;
    text += `Totaal aantal items: ${orderItems.length}\n`;
    text += `Totale hoeveelheid te bestellen: ${totalToOrder}\n`;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('✅ Gekopieerd!', 'success');
    }).catch(() => {
        showToast('Fout bij kopiëren', 'error');
    });
}

// Excel Export
function exportToExcel() {
    if (!currentUser) {
        showToast('Log eerst in', 'error');
        return;
    }
    
    const now = new Date();
    const dateString = now.toISOString().split('T')[0];
    
    // Sort by sortOrder
    const sortedData = [...stockData].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    // CSV Header
    let csv = 'Item,Categorie,Huidig,Minimum,Eenheid,Te Bestellen,Gebruiker,Datum\n';
    
    sortedData.forEach(item => {
        const toOrder = item.current < item.minimum ? item.minimum - item.current : 0;
        csv += `"${item.name}","${item.category}",${item.current},${item.minimum},"${item.unit}",${toOrder},"${item.modifiedBy || currentUser}","${dateString}"\n`;
    });
    
    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `battlekart_stock_${dateString}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Excel export gedownload', 'success');
}

// Clear All Stock
async function clearAllStock() {
    if (!currentUser) {
        showToast('Log eerst in', 'error');
        return;
    }
    
    if (!confirm('Weet u zeker dat u alle stockwaarden naar 0 wilt resetten?')) {
        return;
    }
    
    stockData.forEach(item => {
        item.current = 0;
        item.lastModified = new Date().toISOString();
        item.modifiedBy = currentUser;
    });
    
    saveToLocalStorage();
    
    if (GOOGLE_APPS_SCRIPT_URL) {
        try {
            await fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'reset',
                    user: currentUser
                })
            });
            showToast('Alle stock gereset', 'success');
        } catch (error) {
            showToast('Fout bij sync, lokaal gereset', 'error');
        }
    } else {
        showToast('Alle stock gereset', 'success');
    }
    
    renderStockGrid();
}

// Admin Panel
function showAdminPanel() {
    if (!currentUser) {
        showToast('Log eerst in', 'error');
        return;
    }
    
    if (!isAdmin) {
        showAdminLoginModal();
        return;
    }
    
    renderAdminItemsList();
    document.getElementById('adminPanelModal').classList.add('show');
}

function hideAdminPanel() {
    document.getElementById('adminPanelModal').classList.remove('show');
}

function renderAdminItemsList() {
    const list = document.getElementById('adminItemsList');
    
    // Sort by sortOrder
    const sortedData = [...stockData].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    
    list.innerHTML = sortedData.map(item => `
        <div class="admin-item" data-id="${item.id}">
            <div style="font-weight: bold; color: #666;">${item.sortOrder || 0}</div>
            <div class="admin-item-info">
                <div class="admin-item-name">${escapeHtml(item.name)}</div>
                <div class="admin-item-category">${escapeHtml(item.category)} - ${escapeHtml(item.unit)}</div>
            </div>
            <div>
                <label>Min: </label>
                <input type="number" 
                       class="admin-minimum-input" 
                       data-id="${item.id}"
                       value="${item.minimum}" 
                       min="0" 
                       style="width: 80px; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div>
                <label>Eenheid: </label>
                <input type="text" 
                       class="admin-unit-input" 
                       data-id="${item.id}"
                       value="${escapeHtml(item.unit)}" 
                       style="width: 150px; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div class="admin-item-actions">
                <button class="btn-edit" onclick="saveAdminItem(${item.id})">Opslaan</button>
                <button class="btn-delete" onclick="deleteAdminItem(${item.id})">Verwijderen</button>
            </div>
        </div>
    `).join('');
    
    // Add event listeners
    sortedData.forEach(item => {
        const minInput = document.querySelector(`.admin-minimum-input[data-id="${item.id}"]`);
        const unitInput = document.querySelector(`.admin-unit-input[data-id="${item.id}"]`);
        
        if (minInput) {
            minInput.addEventListener('blur', () => saveAdminItem(item.id));
        }
        if (unitInput) {
            unitInput.addEventListener('blur', () => saveAdminItem(item.id));
        }
    });
}

function saveAdminItem(itemId) {
    const item = stockData.find(i => i.id === itemId);
    if (!item) return;
    
    const minInput = document.querySelector(`.admin-minimum-input[data-id="${itemId}"]`);
    const unitInput = document.querySelector(`.admin-unit-input[data-id="${itemId}"]`);
    
    if (minInput) {
        const minValue = parseInt(minInput.value);
        if (!isNaN(minValue) && minValue >= 0) {
            item.minimum = minValue;
        }
    }
    
    if (unitInput) {
        const unitValue = unitInput.value.trim();
        if (unitValue) {
            item.unit = unitValue;
        }
    }
    
    item.lastModified = new Date().toISOString();
    item.modifiedBy = currentUser;
    
    saveToLocalStorage();
    
    if (GOOGLE_APPS_SCRIPT_URL) {
        syncToGoogleSheets();
    }
    
    showToast('Item bijgewerkt', 'success');
    renderStockGrid();
}

function deleteAdminItem(itemId) {
    const item = stockData.find(i => i.id === itemId);
    if (!item) return;
    
    if (!confirm(`Weet u zeker dat u "${item.name}" wilt verwijderen?`)) {
        return;
    }
    
    stockData = stockData.filter(i => i.id !== itemId);
    saveToLocalStorage();
    
    if (GOOGLE_APPS_SCRIPT_URL) {
        syncToGoogleSheets();
    }
    
    showToast('Item verwijderd', 'success');
    renderAdminItemsList();
    renderStockGrid();
}

function addNewItem(e) {
    e.preventDefault();
    
    const name = document.getElementById('newItemName').value.trim();
    const category = document.getElementById('newItemCategory').value;
    const unit = document.getElementById('newItemUnit').value.trim();
    const minimum = parseInt(document.getElementById('newItemMinimum').value) || 0;
    
    if (!name || !unit) {
        showToast('Vul alle verplichte velden in', 'error');
        return;
    }
    
    // Generate new ID
    const newId = stockData.length > 0 ? Math.max(...stockData.map(i => i.id)) + 1 : 1;
    const newSortOrder = stockData.length > 0 ? Math.max(...stockData.map(i => i.sortOrder || 0)) + 1 : 1;
    
    const newItem = {
        id: newId,
        name: name,
        category: category,
        unit: unit,
        minimum: minimum,
        current: 0,
        sortOrder: newSortOrder,
        lastModified: new Date().toISOString(),
        modifiedBy: currentUser
    };
    
    stockData.push(newItem);
    saveToLocalStorage();
    
    if (GOOGLE_APPS_SCRIPT_URL) {
        syncToGoogleSheets();
    }
    
    // Reset form
    document.getElementById('addItemForm').reset();
    document.getElementById('newItemMinimum').value = '0';
    
    showToast('Item toegevoegd', 'success');
    renderAdminItemsList();
    renderStockGrid();
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}

