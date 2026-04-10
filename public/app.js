document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const tableBody = document.getElementById('tableBody');
    const loading = document.getElementById('loading');
    const noData = document.getElementById('noData');
    const searchInput = document.getElementById('searchInput');
    const refreshBtn = document.getElementById('refreshBtn');

    const filterBtns = document.querySelectorAll('.filter-btn');
    const typeBtns = document.querySelectorAll('.type-filter-btn');
    const showAnchorBox = document.getElementById('showAnchor');
    const showPreIPOBox = document.getElementById('showPreIPO');

    // Stats Elements
    const lastUpdated = document.getElementById('lastUpdated');
    const countThisWeek = document.getElementById('countThisWeek');
    const countUpcoming = document.getElementById('countUpcoming');
    const countTotal = document.getElementById('countTotal');

    // State
    let allCompanies = [];
    let currentFilter = 'week'; // week, upcoming, all
    let currentType = 'all'; // all, Mainboard, SME

    // Sorting State
    let currentSort = { column: 'listing', direction: 'desc' }; // columns: listing, anchor30, anchor90, preipo

    // Initialize
    fetchData();

    // Event Listeners
    if (searchInput) {
        searchInput.addEventListener('input', renderTable);
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (!refreshBtn.disabled) {
                fetchData(true);
            }
        });
    }

    if (showAnchorBox) {
        showAnchorBox.addEventListener('change', renderTable);
    }

    if (showPreIPOBox) {
        showPreIPOBox.addEventListener('change', renderTable);
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Set filter
            currentFilter = btn.getAttribute('data-filter');
            renderTable();
        });
    });

    typeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.getAttribute('data-type');
            renderTable();
        });
    });

    // Headers for sorting
    const headers = document.querySelectorAll('#unlockTable th');
    // 1: Listing, 2: 30-Day, 3: 90-Day, 4: Pre-IPO

    if (headers.length >= 5) {
        setupSortHeader(headers[1], 'listing');
        setupSortHeader(headers[2], 'anchor30');
        setupSortHeader(headers[3], 'anchor90');
        setupSortHeader(headers[4], 'preipo');
    }

    function setupSortHeader(th, columnKey) {
        th.style.cursor = 'pointer';
        th.title = 'Click to sort';
        th.addEventListener('click', () => {
            if (currentSort.column === columnKey) {
                // Toggle direction
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = columnKey;
                currentSort.direction = 'asc'; // Default to asc for new column (earliest date first)
            }
            updateHeaderIcons();
            renderTable();
        });
    }

    function updateHeaderIcons() {
        headers.forEach((th, index) => {
            // Clear existing icons
            let text = th.innerText.replace(' ↑', '').replace(' ↓', '');
            th.innerText = text;

            // Map index to key
            let key = '';
            if (index === 1) key = 'listing';
            if (index === 2) key = 'anchor30';
            if (index === 3) key = 'anchor90';
            if (index === 4) key = 'preipo';

            if (key === currentSort.column) {
                th.innerText += currentSort.direction === 'asc' ? ' ↑' : ' ↓';
            }
        });
    }


    async function fetchData(forceRefresh = false) {
        try {
            if (forceRefresh) {
                loading.classList.remove('hidden');
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<span class="icon spinner-icon">↻</span> Refreshing...';
            }

            const url = forceRefresh
                ? `/api/unlock-data?refresh=true&t=${Date.now()}`
                : `/api/unlock-data?t=${Date.now()}`;
            const response = await fetch(url);
            const result = await response.json();

            allCompanies = result.data || [];

            // Set last updated time
            if (result.lastRefreshed) {
                const date = new Date(result.lastRefreshed);
                lastUpdated.textContent = date.toLocaleString();
            }

            // Update Global Stats
            updateStats();

            loading.classList.add('hidden');

            // Reset refresh button
            if (forceRefresh) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<span class="icon">↻</span> Refresh Data';
            }

            // Initial sort icon
            updateHeaderIcons();
            renderTable();

        } catch (error) {
            console.error('Error fetching data:', error);
            loading.innerHTML = '<p style="color: #ef4444">Failed to load data. Please try again.</p>';

            if (forceRefresh) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<span class="icon">⚠</span> Retry';
            }
        }
    }

    // Silent data loader — fetches company data WITHOUT touching Tracker UI elements.
    // Used by tabs (Upcoming IPOs) that share allCompanies but have their own refresh UI.
    async function loadCompanyData(forceRefresh = false) {
        try {
            const url = forceRefresh 
                ? `/api/unlock-data?refresh=true&t=${Date.now()}` 
                : `/api/unlock-data?t=${Date.now()}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            allCompanies = result.data || [];
            if (result.lastRefreshed && lastUpdated) {
                lastUpdated.textContent = new Date(result.lastRefreshed).toLocaleString();
            }
            updateStats();
            // Do NOT call renderTable() — Tracker tab is not active
        } catch (err) {
            console.error('[loadCompanyData] Failed:', err);
            throw err; // re-throw so .catch() in caller shows the error message
        }
    }

    function updateStats() {
        if (!countTotal) return;

        // Only count companies with 2025+ listing dates
        const cutoff = new Date('2025-01-01').getTime();
        const relevantCompanies = allCompanies.filter(c => {
            const d = c.allotmentDate?.adjusted || c.allotmentDate?.original;
            return d && new Date(d).getTime() >= cutoff;
        });
        countTotal.textContent = relevantCompanies.length;

        let thisWeekCount = 0;
        let upcomingCount = 0;

        const { start, end } = getThisWeekRange();
        const today = new Date();
        const next30 = new Date();
        next30.setDate(today.getDate() + 30);

        allCompanies.forEach(company => {
            // Collect all valid dates for this company
            const dates = [];
            if (company.anchor30) dates.push(new Date(company.anchor30.adjusted || company.anchor30.original));
            if (company.anchor90) dates.push(new Date(company.anchor90.adjusted || company.anchor90.original));
            if (company.preIPO) dates.push(new Date(company.preIPO.expiryDate || company.preIPO.originalDate));

            // Check if ANY date falls in This Week
            const hasThisWeek = dates.some(d => d >= start && d <= end);
            if (hasThisWeek) thisWeekCount++;

            // Upcoming Count logic
            upcomingCount += dates.filter(d => d >= today && d <= next30).length;
        });

        countThisWeek.textContent = thisWeekCount;
        countUpcoming.textContent = upcomingCount;
    }

    function renderTable() {
        tableBody.innerHTML = '';

        // 1. Get Filters
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const showAnchor = showAnchorBox ? showAnchorBox.checked : true;
        const showPreIPO = showPreIPOBox ? showPreIPOBox.checked : true;

        // 2. Filter Search & Type
        let filtered = allCompanies.filter(company => {
            // Search
            if (searchTerm && !company.companyName.toLowerCase().includes(searchTerm)) {
                return false;
            }
            // Type Filter
            if (currentType !== 'all') {
                if (currentType === 'BSE SME') {
                    if (company.issueType !== 'SME' || !(company.exchange || '').toUpperCase().includes('BSE')) return false;
                } else if (currentType === 'NSE SME') {
                    if (company.issueType !== 'SME' || !(company.exchange || '').toUpperCase().includes('NSE')) return false;
                } else {
                    if (company.issueType !== currentType) {
                        return false;
                    }
                }
            }
            return true;
        });

        // 3. Apply Date Filter (This Week / This Month / Last Month / Upcoming)
        const { start: weekStart, end: weekEnd } = getThisWeekRange();
        const { start: monthStart, end: monthEnd } = getThisMonthRange();
        const { start: lastMonthStart, end: lastMonthEnd } = getLastMonthRange();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const next30 = new Date();
        next30.setDate(today.getDate() + 30);

        filtered = filtered.filter(company => {
            if (currentFilter === 'all') return true;

            const dates = [];
            if (showAnchor && company.anchor30) dates.push(new Date(company.anchor30.adjusted || company.anchor30.original));
            if (showAnchor && company.anchor90) dates.push(new Date(company.anchor90.adjusted || company.anchor90.original));
            if (showPreIPO && company.preIPO) dates.push(new Date(company.preIPO.expiryDate || company.preIPO.originalDate));

            if (currentFilter === 'week') {
                return dates.some(d => d >= weekStart && d <= weekEnd);
            }
            if (currentFilter === 'thisMonth') {
                return dates.some(d => d >= monthStart && d <= monthEnd);
            }
            if (currentFilter === 'lastMonth') {
                return dates.some(d => d >= lastMonthStart && d <= lastMonthEnd);
            }
            if (currentFilter === 'upcoming') {
                return dates.some(d => d >= today && d <= next30);
            }
            return true;
        });

        // 4. Sort Logic
        filtered.sort((a, b) => {
            let dateA, dateB;

            // Extract date based on currentSort.column
            if (currentSort.column === 'listing') {
                dateA = companyListingDate(a.allotmentDate);
                dateB = companyListingDate(b.allotmentDate);
            } else if (currentSort.column === 'anchor30') {
                dateA = getDateFromObj(a.anchor30);
                dateB = getDateFromObj(b.anchor30);
            } else if (currentSort.column === 'anchor90') {
                dateA = getDateFromObj(a.anchor90);
                dateB = getDateFromObj(b.anchor90);
            } else if (currentSort.column === 'preipo') {
                dateA = getDateFromObj(a.preIPO);
                dateB = getDateFromObj(b.preIPO);
            }

            // Direction
            if (currentSort.direction === 'asc') {
                return dateA - dateB;
            } else {
                return dateB - dateA;
            }
        });

        // Helper to get date regardless of structure
        function getDateFromObj(obj) {
            if (!obj) return currentSort.direction === 'asc' ? new Date(8640000000000000) : new Date(0);

            const s = obj.adjusted || obj.expiryDate || obj.original || obj.originalDate;
            return s ? new Date(s) : (currentSort.direction === 'asc' ? new Date(8640000000000000) : new Date(0));
        }

        // Helper specifically for fixing the nested Listing Date object
        function companyListingDate(obj) {
            if (!obj) return currentSort.direction === 'asc' ? new Date(8640000000000000) : new Date(0);
            const s = obj.adjusted || obj.original;
            return s ? new Date(s) : (currentSort.direction === 'asc' ? new Date(8640000000000000) : new Date(0));
        }


        // 5. Update Table Headers Visibility
        updateColumnVisibility(showAnchor, showPreIPO);

        if (filtered.length === 0) {
            if (noData) noData.classList.remove('hidden');
            return;
        }
        if (noData) noData.classList.add('hidden');

        // 6. Render Rows
        filtered.forEach(company => {
            const row = document.createElement('tr');

            // Company Info — exchange-specific badge
            const isSME = company.issueType && company.issueType.toLowerCase().includes('sme');
            const exchangeStr = (company.exchange || '').toUpperCase();
            let exchangeLabel = '';
            if (exchangeStr.includes('NSE') && exchangeStr.includes('BSE')) {
                exchangeLabel = 'NSE/BSE';
            } else if (exchangeStr.includes('BSE')) {
                exchangeLabel = 'BSE';
            } else if (exchangeStr.includes('NSE')) {
                exchangeLabel = 'NSE';
            }
            const typeLabel = isSME ? 'SME' : 'Mainboard';
            const badgeClass = isSME ? 'badge-sme' : 'badge-main';
            const typeBadge = `<span class="badge ${badgeClass}">${typeLabel} ${exchangeLabel}</span>`;

            // Listing Date Display
            const listingObj = company.allotmentDate;
            let listingDateDisplay = '--';
            if (listingObj) {
                const finalStr = listingObj.adjusted || listingObj.original;
                listingDateDisplay = formatDateSimple(finalStr);
                if (listingObj.isAdjusted) listingDateDisplay += '*';
            }

            // Cells
            const col30 = createDateCell(company.anchor30);
            const col90 = createDateCell(company.anchor90);
            const colPre = createDateCell(company.preIPO);
            const companyIdx = allCompanies.indexOf(company);

            row.innerHTML = `
                <td data-label="Company">
                    <span class="company-name">${company.companyName}</span>
                    <div class="company-meta">
                        ${typeBadge}
                    </div>
                </td>
                <td data-label="Listing Date"><span class="date-text text-muted date-clickable" data-company-idx="${companyIdx}">${listingDateDisplay}</span></td>
                <td class="col-anchor" data-label="30-Day Unlock"><div class="date-clickable" data-company-idx="${companyIdx}">${col30}</div></td>
                <td class="col-anchor" data-label="90-Day Unlock"><div class="date-clickable" data-company-idx="${companyIdx}">${col90}</div></td>
                <td class="col-preipo" data-label="Pre-IPO Lock-in"><div class="date-clickable" data-company-idx="${companyIdx}">${colPre}</div></td>
            `;

            tableBody.appendChild(row);
        });

        // Attach click handlers to all date-clickable cells
        document.querySelectorAll('.date-clickable').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.getAttribute('data-company-idx'));
                if (!isNaN(idx) && allCompanies[idx]) {
                    openUnlockModal(allCompanies[idx]);
                }
            });
        });

        // Re-apply visibility to new rows
        updateColumnVisibility(showAnchor, showPreIPO);
    }

    function updateColumnVisibility(showAnchor, showPreIPO) {
        // Headers
        const ths = document.querySelectorAll('#unlockTable th');
        if (ths.length >= 5) {
            // Index 2, 3 are Anchor. Index 4 is Pre-IPO.
            ths[2].style.display = showAnchor ? '' : 'none';
            ths[3].style.display = showAnchor ? '' : 'none';
            ths[4].style.display = showPreIPO ? '' : 'none';
        }

        // Body Cells
        const anchorCells = document.querySelectorAll('.col-anchor');
        const preCells = document.querySelectorAll('.col-preipo');

        anchorCells.forEach(td => td.style.display = showAnchor ? '' : 'none');
        preCells.forEach(td => td.style.display = showPreIPO ? '' : 'none');
    }

    // Helper: Create Date Cell
    function createDateCell(dateObj) {
        if (!dateObj) return '<span class="text-muted">--</span>';

        const finalDateStr = dateObj.adjusted || dateObj.expiryDate || dateObj.original || dateObj.originalDate;
        if (!finalDateStr) return '<span class="text-muted">--</span>';

        const date = new Date(finalDateStr);
        const formatted = formatDateSimple(finalDateStr);
        const badge = getStatusBadge(date);
        const isAdj = dateObj.isAdjusted;

        // Check if past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(date);
        target.setHours(0, 0, 0, 0);
        const isPast = target < today;

        return `
            <div class="date-cell">
                <span class="date-text ${isAdj ? 'date-adjusted' : ''} ${isPast ? 'text-past' : ''}" 
                      title="${isAdj ? 'Adjusted for holiday' : ''}">${formatted}</span>
                ${badge}
            </div>
        `;
    }

    // Helper: Status Badge
    function getStatusBadge(targetDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const t = new Date(targetDate);
        t.setHours(0, 0, 0, 0);

        const diffTime = t - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            // Past
            if (diffDays >= -3) {
                return `<span class="badge-days badge-past-recent">${diffDays}d</span>`;
            }
            return ''; // Older past events
        } else if (diffDays === 0) {
            return '<span class="badge-days badge-today">Today</span>';
        } else if (diffDays === 1) {
            return '<span class="badge-days badge-tomorrow">Tomorrow</span>';
        } else if (diffDays <= 7) {
            return `<span class="badge-days badge-soon">in ${diffDays}d</span>`;
        } else if (diffDays <= 60) {
            return `<span class="badge-days badge-future">in ${diffDays}d</span>`;
        }
        return '';
    }

    // Helper: This Week Range (Mon-Sun)
    function getThisWeekRange() {
        const now = new Date();
        const day = now.getDay(); // 0-6 (Sun-Sat)
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

        const start = new Date(now.setDate(diff));
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    // Helper: This Month Range (1st to last day)
    function getThisMonthRange() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);

        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    // Helper: Last Month Range
    function getLastMonthRange() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        start.setHours(0, 0, 0, 0);

        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    // Helper: Date Format
    function formatDateSimple(dateStr) {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    }

    // ===== Unlock Timeline Modal =====
    const modal = document.getElementById('preIPOModal');
    const modalClose = document.getElementById('modalClose');
    const modalCompanyName = document.getElementById('modalCompanyName');
    const modalBadge = document.getElementById('modalBadge');
    const modalExchangeBadge = document.getElementById('modalExchangeBadge');
    const modalRefreshBtn = document.getElementById('modalRefreshBtn');

    // Track current modal company for refresh
    let currentModalCompany = null;
    let currentModalTimelineItems = null;

    // Wire modal refresh button
    if (modalRefreshBtn) {
        modalRefreshBtn.addEventListener('click', () => {
            if (!currentModalCompany || modalRefreshBtn.disabled) return;
            modalRefreshBtn.disabled = true;
            modalRefreshBtn.classList.add('spinning');

            // Reset and show loading
            const detailsSection = document.getElementById('unlockDetailsSection');
            const detailsLoading = document.getElementById('unlockDetailsLoading');
            if (detailsSection) detailsSection.style.display = 'none';
            if (detailsLoading) detailsLoading.style.display = 'flex';

            fetchUnlockDetails(currentModalCompany.companyName, currentModalTimelineItems, true)
                .finally(() => {
                    modalRefreshBtn.disabled = false;
                    modalRefreshBtn.classList.remove('spinning');
                });
        });
    }


    function getDateStatus(dateStr) {
        if (!dateStr) return { class: 'tl-na', badge: '<span class="tl-badge tl-badge-na">N/A</span>' };
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const date = new Date(dateStr);
        date.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { class: 'tl-completed', badge: `<span class="tl-badge tl-badge-unlocked">✅ Unlocked ${Math.abs(diffDays)}d ago</span>` };
        } else if (diffDays === 0) {
            return { class: 'tl-today', badge: '<span class="tl-badge tl-badge-today">⚠️ Today!</span>' };
        } else if (diffDays <= 7) {
            return { class: 'tl-upcoming', badge: `<span class="tl-badge tl-badge-upcoming">in ${diffDays}d</span>` };
        } else {
            return { class: 'tl-upcoming', badge: `<span class="tl-badge tl-badge-upcoming">in ${diffDays}d</span>` };
        }
    }

// Helper to dynamically poll if the RHP is extracting
let pollTimer = null;
function pollForNLP(companyName, attempts = 0) {
    if (pollTimer) clearTimeout(pollTimer);
    if (attempts > 15) return; // Stop after ~75 seconds
    
    pollTimer = setTimeout(async () => {
        try {
            const res = await fetch(`/api/unlock-details/${encodeURIComponent(companyName)}`);
            const updatedCompany = await res.json();
            if (updatedCompany && updatedCompany.preIpoInvestors !== undefined) {
                // Extractor finished!
                const index = unlockData.findIndex(c => c.companyName === companyName);
                if (index !== -1) unlockData[index] = updatedCompany;
                
                const titleEl = document.getElementById('modalTitle');
                if (titleEl && titleEl.textContent === companyName) {
                    openUnlockModal(updatedCompany);
                }
            } else {
                pollForNLP(companyName, attempts + 1);
            }
        } catch (e) {
            console.error('Polling error:', e);
        }
    }, 5000);
}

    function openUnlockModal(company) {
        // Clear any existing timer just in case
        if (pollTimer) clearTimeout(pollTimer);
        if (!company || !modal) return;

        // Company name & badges
        modalCompanyName.textContent = company.companyName;
        const isSME = company.issueType && company.issueType.toLowerCase().includes('sme');
        const exStr = (company.exchange || '').toUpperCase();
        let exLabel = '';
        if (exStr.includes('NSE') && exStr.includes('BSE')) {
            exLabel = 'NSE/BSE';
        } else if (exStr.includes('BSE')) {
            exLabel = 'BSE';
        } else if (exStr.includes('NSE')) {
            exLabel = 'NSE';
        }
        const modalTypeLabel = isSME ? 'SME' : 'Mainboard';
        modalBadge.innerHTML = isSME
            ? `<span class="badge badge-sme">${modalTypeLabel}</span>`
            : `<span class="badge badge-main">${modalTypeLabel}</span>`;

        // Exchange badge
        if (exLabel) {
            modalExchangeBadge.textContent = exLabel;
            modalExchangeBadge.style.display = '';
        } else {
            modalExchangeBadge.style.display = 'none';
        }

        const rhpSection = document.getElementById('rhpSection');
        const btnViewRhp = document.getElementById('btnViewRhp');
        if (rhpSection && btnViewRhp) {
            if (company.rhpUrl && company.rhpUrl.endsWith('.pdf')) {
                btnViewRhp.href = company.rhpUrl;
                rhpSection.style.display = '';
            } else {
                rhpSection.style.display = 'none';
            }
        }

        // Render Pre-IPO details
        const preIpoBlock = document.getElementById('preIpoDetailsBlock');
        if (preIpoBlock) {
            let preIpoNamesStr = '';
            if (!company.rhpUrl && company.preIpoInvestors === undefined) {
                preIpoNamesStr = `<span style="color:var(--warning); font-style:italic; font-size: 0.9em;">Waiting for RHP PDF... (may take ~45s)</span>`;
                pollForNLP(company.companyName);
            } else if (company.preIpoInvestors === undefined) {
                preIpoNamesStr = `<span style="color:var(--text-muted); font-style:italic; font-size: 0.9em;">Scanning RHP... (may take ~45s)</span>`;
                pollForNLP(company.companyName);
            } else if (company.preIpoInvestors && company.preIpoInvestors.length > 0) {
                let listItems = company.preIpoInvestors.map(i => `<li style="margin-bottom:4px;">${i}</li>`).join('');
                let wacaHtml = company.preIpoWaca ? `<div style="margin-top: 8px; font-size: 0.9em; font-weight: 500; color: var(--text);">Bonus & Split Adjusted WACA: <span style="color: var(--success);">₹${company.preIpoWaca}</span></div>` : '';
                preIpoNamesStr = `
                    <details>
                        <summary style="cursor:pointer; font-weight:600; color:var(--text); list-style-position: inside;">View Pre-IPO Investors (${company.preIpoInvestors.length})</summary>
                        <ul style="margin-top:10px; padding-left:22px; color:var(--text-muted); font-size:0.95em; max-height: 160px; overflow-y: auto; overflow-x: hidden; padding-right: 10px;">
                            ${listItems}
                        </ul>
                    </details>
                    ${wacaHtml}
                `;
            } else {
                preIpoNamesStr = `<span style="color:var(--text-muted); font-style:italic;">0 Pre-IPO Investors recorded.</span>`;
            }
            // Use line-height to ensure it looks uniform whether expanded or not
            preIpoBlock.innerHTML = `<div style="font-size: 13px; color: var(--text); line-height: 1.4;">${preIpoNamesStr}</div>`;
            preIpoBlock.style.display = 'block';
        }

        // Set Issue Price and resetting Live Price
        const issuePriceEl = document.getElementById('modalIssuePrice');
        if (issuePriceEl) {
            issuePriceEl.textContent = company.issuePrice ? '₹' + company.issuePrice.toFixed(2) : '—';
        }
        const livePriceEl = document.getElementById('modalLivePrice');
        if (livePriceEl) {
            livePriceEl.textContent = 'Loading...';
            livePriceEl.className = 'price-value'; // reset classes
        }

        // Timeline items
        const items = [
            { id: 'Listing', dateObj: company.allotmentDate, label: 'Listing Date' },
            { id: 'Anchor30', dateObj: company.anchor30, label: '1-Month Anchor Unlock' },
            { id: 'Anchor90', dateObj: company.anchor90, label: '3-Month Anchor Unlock' },
            { id: 'PreIPO', dateObj: company.preIPO, label: 'Pre-IPO Lock-in Expiry' }
        ];

        items.forEach(item => {
            const dateEl = document.getElementById(`tl${item.id}Date`);
            const statusEl = document.getElementById(`tl${item.id}Status`);
            const timelineEl = document.getElementById(`timeline${item.id}`);
            const subEl = document.getElementById(`tl${item.id}Sub`);

            let dateStr = null;
            if (item.dateObj) {
                if (item.id === 'PreIPO') {
                    dateStr = item.dateObj.expiryDate || item.dateObj.originalDate;
                } else {
                    dateStr = item.dateObj.adjusted || item.dateObj.original;
                }
            }

            if (dateStr) {
                dateEl.textContent = formatDateSimple(dateStr);
                if (item.dateObj && item.dateObj.isAdjusted) {
                    dateEl.textContent += ' *';
                }
            } else {
                dateEl.textContent = '—';
            }

            const status = getDateStatus(dateStr);
            statusEl.innerHTML = status.badge;

            // Clear sub-labels (will be populated from BSE data)
            if (subEl) subEl.textContent = '';

            // Set class on timeline item
            timelineEl.className = 'timeline-item ' + status.class;
        });





        // Reset unlock details
        const detailsSection = document.getElementById('unlockDetailsSection');
        const detailsLoading = document.getElementById('unlockDetailsLoading');
        const detailsContent = document.getElementById('unlockDetailsContent');
        const detailsNotice = document.getElementById('unlockDetailsNotice');

        if (detailsSection) detailsSection.style.display = 'none';
        if (detailsLoading) detailsLoading.style.display = 'flex';

        // Show modal
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Store for refresh button
        currentModalCompany = company;
        currentModalTimelineItems = items;

        // Fetch BSE Annexure-I unlock details (async, non-blocking)
        fetchUnlockDetails(company.companyName, items);
    }

    // Fetch and display BSE unlock details
    async function fetchUnlockDetails(companyName, timelineItems, force = false) {
        const detailsSection = document.getElementById('unlockDetailsSection');
        const detailsLoading = document.getElementById('unlockDetailsLoading');
        const detailsContent = document.getElementById('unlockDetailsContent');
        const detailsNotice = document.getElementById('unlockDetailsNotice');

        try {
            const url = `/api/unlock-details/${encodeURIComponent(companyName)}${force ? '?force=true' : ''}`;
            const resp = await fetch(url);
            let data = await resp.json();

            // If server needs client-side BSE fetch (WAF bypass)
            if (data.needsClientFetch && data.bseNoticeId) {
                console.log(`[BSE/Client] Server needs client fetch for notice: ${data.bseNoticeId}`);
                if (detailsLoading) {
                    detailsLoading.innerHTML = '<span class="spinner"></span> Fetching from BSE...';
                }
                data = await clientFetchBSENotice(companyName, data.bseNoticeId);
            }

            // If server needs client-side BSE search (both bsesme.com and bseindia.com blocked)
            if (data.needsBSESearch && data.listingDate) {
                console.log(`[BSE/Client] Server needs client search near ${data.listingDate}`);
                if (detailsLoading) {
                    detailsLoading.innerHTML = '<span class="spinner"></span> Searching BSE notices...';
                }
                data = await clientSearchBSENotice(companyName, data.listingDate);
            }

            if (detailsLoading) detailsLoading.style.display = 'none';

            // Update Live Price
            const liveEl = document.getElementById('modalLivePrice');
            if (liveEl) {
                if (data.liveMarketPrice && data.liveMarketPrice.price) {
                    liveEl.textContent = '₹' + data.liveMarketPrice.price.toFixed(2);
                    // Add subtle color context
                    if (currentModalCompany && currentModalCompany.issuePrice) {
                        if (data.liveMarketPrice.price > currentModalCompany.issuePrice) {
                            liveEl.style.color = 'var(--success-text)';
                        } else if (data.liveMarketPrice.price < currentModalCompany.issuePrice) {
                            liveEl.style.color = 'var(--warning-text)';
                        }
                    }
                } else {
                    liveEl.textContent = 'Unlisted';
                    liveEl.style.color = 'var(--text-muted)';
                }
            }

            if (data.isScannedPDF || (data.found && data.unlockEvents && data.unlockEvents.length === 0)) {
                if (detailsSection) detailsSection.style.display = 'block';
                const detailsTitle = document.getElementById('unlockDetailsTitle');
                if (detailsTitle) detailsTitle.textContent = '⚠️ Scanned Document Viewer';
                if (detailsNotice) detailsNotice.textContent = 'Displaying original Annexure PDF';

                if (detailsContent) {
                    let pdfHtml = '';
                    if (data.localPdfUrl) {
                        pdfHtml = `<iframe src="${data.localPdfUrl}#view=FitH" width="100%" height="450px" style="border: 1px solid #ccc; border-radius: 8px; margin-top: 15px; display: block; background: #fff;"></iframe>`;
                    } else if (data.noticeId && data.source === 'BSE') {
                        // Cached response without blob: Button to fetch it securely via browser
                        pdfHtml = `
                            <button id="btnFetchPdfViewer" class="filter-btn" style="margin-top: 15px; font-weight: bold; padding: 10px 20px; background: var(--accent-light); color: var(--primary); border: none; border-radius: 4px; cursor: pointer;">
                                Load Embedded PDF Viewer
                            </button>
                        `;
                    } else {
                        pdfHtml = `<a href="https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${data.noticeId}" target="_blank" style="display:inline-block; margin-top: 15px; font-weight: bold;">View Notice on BSE</a>`;
                    }

                    detailsContent.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: var(--warning-text); background: rgba(239, 154, 154, 0.1); border-radius: 8px;">
                            The Annexure PDF for this company is an image scan and cannot be parsed autonomously. Please verify its lock-in dates manually from the embedded document below.
                            ${pdfHtml}
                        </div>
                    `;

                    if (!data.localPdfUrl && data.noticeId && data.source === 'BSE') {
                        const btnFetch = document.getElementById('btnFetchPdfViewer');
                        if (btnFetch) {
                            btnFetch.addEventListener('click', async (e) => {
                                e.target.textContent = 'Downloading PDF securely...';
                                e.target.style.opacity = '0.7';
                                e.target.style.cursor = 'wait';
                                e.target.disabled = true;
                                try {
                                    const freshData = await clientFetchBSENotice(companyName, data.noticeId);
                                    if (freshData && freshData.localPdfUrl) {
                                        const newIframe = document.createElement('iframe');
                                        newIframe.src = freshData.localPdfUrl + '#view=FitH';
                                        newIframe.width = '100%';
                                        newIframe.height = '450px';
                                        newIframe.style.cssText = 'border: 1px solid #ccc; border-radius: 8px; margin-top: 15px; display: block; background: #fff;';
                                        e.target.parentNode.replaceChild(newIframe, e.target);
                                    } else {
                                        e.target.textContent = 'Failed to load PDF view. Check internet connection.';
                                    }
                                } catch (err) {
                                    e.target.textContent = 'Error securely downloading PDF.';
                                    e.target.style.cursor = 'pointer';
                                    e.target.disabled = false;
                                }
                            });
                        }
                    }
                }
                return;
            }

            if (!data.found || !data.unlockEvents) {
                // No data — hide section
                if (detailsSection) detailsSection.style.display = 'none';
                return;
            }

            // Show the details section with correct source label
            if (detailsSection) detailsSection.style.display = '';
            const detailsTitle = document.getElementById('unlockDetailsTitle');

            let isNSE = data.source === 'NSE';
            let isBSE = data.source === 'BSE';

            // Explicitly force inference from actual company exchange if available to correct bad cache labels
            if (currentModalCompany && currentModalCompany.exchange) {
                const ex = currentModalCompany.exchange.toUpperCase();
                if (ex === 'BSE SME' || ex === 'BSE') {
                    isNSE = false;
                    isBSE = true;
                } else if (ex === 'NSE SME' || ex === 'NSE') {
                    isNSE = true;
                    isBSE = false;
                } else {
                    // Hybrid or generic fallback
                    if (ex.includes('NSE')) isNSE = true;
                    else if (ex.includes('BSE')) isBSE = true;
                }
            }

            // Figure out the source document link (direct PDF takes priority)
            let linkHref = '';
            if (data.pdfUrl) {
                if (data.pdfUrl.toLowerCase().endsWith('.zip')) {
                    // Pipe NSE ZIP files through the backend proxy to extract the PDF on-the-fly
                    linkHref = `/api/nse-pdf?url=${encodeURIComponent(data.pdfUrl)}`;
                } else {
                    linkHref = data.pdfUrl;
                }
            } else if ((isBSE || data.source === 'BSE') && data.noticeId) {
                linkHref = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${data.noticeId}`;
            }

            if (detailsTitle) {
                const titleText = isNSE ? '📊 NSE Circular Details' : '📊 BSE Circular Details';

                if (linkHref) {
                    detailsTitle.innerHTML = `<a href="${linkHref}" target="_blank" style="text-decoration:none; color:inherit; border-bottom: 2px solid var(--accent); padding-bottom: 2px; transition: color 0.2s;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='inherit'">${titleText}</a>`;
                } else {
                    detailsTitle.textContent = titleText;
                }
            }
            if (detailsNotice) {
                const sourceLabel = isNSE ? 'NSE' : 'BSE';
                detailsNotice.textContent = `${sourceLabel}: ${data.noticeId || data.circNumber || '—'}`;
            }

            // Build bar chart HTML
            let html = '';
            for (const event of data.unlockEvents) {
                if (event.percentage < 0.1) continue; // Skip negligible entries

                let label = event.label || '';
                let fillClass = 'fill-locked';
                if (event.date === null) {
                    label = label || 'Not locked';
                    fillClass = 'fill-free';
                } else {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const eventDate = new Date(event.date);
                    if (eventDate <= today) {
                        fillClass = 'fill-unlocked';
                        label = '✅ ' + formatDateSimple(event.date + 'T00:00:00.000Z');
                    } else {
                        label = formatDateSimple(event.date + 'T00:00:00.000Z');
                    }
                }

                html += `
                    <div class="unlock-bar-row">
                        <span class="unlock-bar-label">${label}</span>
                        <div class="unlock-bar-container">
                            <div class="unlock-bar-fill ${fillClass}" style="width: ${Math.max(event.percentage, 1)}%"></div>
                        </div>
                        <span class="unlock-bar-pct">${event.percentage}%</span>
                        <span class="unlock-bar-shares">${event.shares.toLocaleString()}</span>
                    </div>
                `;
            }

            if (detailsContent) detailsContent.innerHTML = html;

            // Match unlock events to timeline items and show % as sub-labels
            matchUnlockToTimeline(data.unlockEvents, timelineItems);

        } catch (err) {
            console.error('Failed to fetch unlock details:', err);
            if (detailsLoading) detailsLoading.style.display = 'none';
        }
    }

    /**
     * Client-side BSE notice fetching.
     * Browsers bypass BSE's Akamai WAF, so we fetch the notice page directly,
     * extract the Annexure-I PDF link, download it, and send to server for parsing.
     */
    async function clientFetchBSENotice(companyName, noticeId) {
        try {
            const noticeUrl = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`;
            console.log(`[BSE/Client] Fetching notice page: ${noticeUrl}`);

            const pageResp = await fetch(noticeUrl);
            if (!pageResp.ok) {
                console.error(`[BSE/Client] Notice page returned ${pageResp.status}`);
                return { found: false };
            }

            const html = await pageResp.text();

            // Parse HTML to find Annexure-I link
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            let annexureUrl = null;

            doc.querySelectorAll('a').forEach(a => {
                const text = (a.textContent || '').trim().toLowerCase();
                const href = a.getAttribute('href') || '';

                if (text.includes('annexure') && (text.includes('ii') || text.includes(' 2'))) {
                    return; // Skip Annexure II entirely
                }

                // Match Annexure-I but not Annexure-II
                if (text.includes('annexure-i') || text.includes('annexure - i')) {
                    if (!annexureUrl) annexureUrl = href;
                } else if (text === 'annexure-i.pdf' || text === 'annexure - i.pdf') {
                    if (!annexureUrl) annexureUrl = href;
                } else if (text.includes('annexure') && text.includes('.pdf') && !text.includes('annexure_')) {
                    if (!annexureUrl) annexureUrl = href;
                } else if ((text.includes('annexure i') || text.includes('annexure 1'))) {
                    if (!annexureUrl) annexureUrl = href;
                } else if ((text.includes('annexure') || text.includes('annex')) && href.includes('DownloadAttach')) {
                    if (!annexureUrl) annexureUrl = href;
                }
            });

            if (!annexureUrl) {
                console.error('[BSE/Client] No Annexure-I link found on notice page');
                return { found: false };
            }

            // Make URL absolute if needed
            if (annexureUrl.startsWith('/')) {
                annexureUrl = 'https://www.bseindia.com' + annexureUrl;
            } else if (!annexureUrl.startsWith('http')) {
                annexureUrl = 'https://www.bseindia.com/markets/MarketInfo/' + annexureUrl;
            }

            console.log(`[BSE/Client] Downloading PDF: ${annexureUrl}`);

            // Download the PDF
            const pdfResp = await fetch(annexureUrl);
            if (!pdfResp.ok) {
                console.error(`[BSE/Client] PDF download returned ${pdfResp.status}`);
                return { found: false };
            }

            const pdfBuffer = await pdfResp.arrayBuffer();
            console.log(`[BSE/Client] PDF downloaded: ${(pdfBuffer.byteLength / 1024).toFixed(1)} KB`);

            // Send PDF to server for parsing
            const parseResp = await fetch(
                `/api/parse-bse-pdf?company=${encodeURIComponent(companyName)}&noticeId=${encodeURIComponent(noticeId)}&pdfUrl=${encodeURIComponent(annexureUrl)}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body: pdfBuffer
                }
            );

            const result = await parseResp.json();

            try {
                // Generate a local ObjectURL matching the raw bytes to bypass BSE X-Frame-Options DOM restrictions
                const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
                result.localPdfUrl = URL.createObjectURL(blob);
            } catch (blobErr) {
                console.warn('[BSE/Client] Local Blob assignment failed:', blobErr);
            }

            return result;

        } catch (err) {
            console.error('[BSE/Client] Error:', err);
            return { found: false };
        }
    }

    /**
     * Client-side BSE notice search.
     * Brute-force scans notice IDs around the listing date from the browser.
     * Format: YYYYMMDD-N where N is 1-100
     */
    async function clientSearchBSENotice(companyName, listingDateISO) {
        try {
            const listDate = new Date(listingDateISO);
            if (isNaN(listDate.getTime())) return { found: false };

            // Normalize company name for matching
            const normalized = companyName
                .toUpperCase()
                .replace(/ (LTD|LIMITED|INDIA|PRIVATE|PVT)\.?/g, '')
                .replace(/[^A-Z0-9]/g, ' ') // replace punctuation with spaces so acronyms dont glue (H.M. -> H M)
                .trim();
            const words = normalized.split(/\s+/).filter(w => w.length >= 3);

            console.log(`[BSE/Client] Searching for "${normalized}" near ${listingDateISO.substring(0, 10)}`);

            // Generate dates to scan: day before listing through day after
            const dates = [];
            for (let offset = -1; offset <= 1; offset++) {
                const d = new Date(listDate);
                d.setDate(d.getDate() + offset);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                dates.push(`${y}${m}${day}`);
            }

            // Scan each date, checking notice IDs in batches
            for (const dateStr of dates) {
                console.log(`[BSE/Client] Scanning date: ${dateStr}`);

                for (let start = 1; start <= 80; start += 5) {
                    const batch = [];
                    for (let i = start; i < start + 5 && i <= 80; i++) {
                        batch.push(`${dateStr}-${i}`);
                    }

                    const results = await Promise.allSettled(
                        batch.map(async (noticeId) => {
                            const url = `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?page=${noticeId}`;
                            try {
                                const resp = await fetch(url);
                                if (!resp.ok) return null;
                                const html = await resp.text();
                                if (html.length < 5000) return null; // Error/empty page

                                const upper = html.toUpperCase();

                                // Check if this is a listing notice
                                if (!upper.includes('LISTING') && !upper.includes('SHARES ADMITTED')) return null;

                                // Check if company name matches
                                const matchCount = words.filter(w => upper.includes(w)).length;
                                if (matchCount < Math.min(words.length, 2)) return null;

                                // MUST have an annexure pdf link to be the actual listing circular we need
                                if (!upper.includes('ANNEXURE') || !upper.includes('.PDF')) {
                                    return null;
                                }

                                console.log(`[BSE/Client] Found match: ${noticeId} (${matchCount}/${words.length} words)`);
                                return noticeId;
                            } catch {
                                return null;
                            }
                        })
                    );

                    for (const r of results) {
                        if (r.status === 'fulfilled' && r.value) {
                            // Found the notice! Now fetch annexure
                            return await clientFetchBSENotice(companyName, r.value);
                        }
                    }
                }
            }

            console.log('[BSE/Client] No matching notice found');
            return { found: false };
        } catch (err) {
            console.error('[BSE/Client] Search error:', err);
            return { found: false };
        }
    }

    // Match BSE unlock events to timeline items based on date proximity
    function matchUnlockToTimeline(unlockEvents, timelineItems) {
        const datedEvents = unlockEvents.filter(e => e.date && e.percentage >= 0.5);

        for (const tlItem of timelineItems) {
            if (tlItem.id === 'Listing') continue; // Listing date doesn't have unlock %

            let dateStr = null;
            if (tlItem.dateObj) {
                if (tlItem.id === 'PreIPO') {
                    dateStr = tlItem.dateObj.expiryDate || tlItem.dateObj.originalDate;
                } else {
                    dateStr = tlItem.dateObj.adjusted || tlItem.dateObj.original;
                }
            }
            if (!dateStr) continue;

            const tlDate = new Date(dateStr);
            tlDate.setHours(0, 0, 0, 0);

            // Find closest BSE unlock event within 5 days
            let bestMatch = null;
            let bestDiff = Infinity;
            for (const event of datedEvents) {
                const eventDate = new Date(event.date);
                const diff = Math.abs(tlDate - eventDate) / (1000 * 60 * 60 * 24);
                if (diff < bestDiff && diff <= 5) {
                    bestDiff = diff;
                    bestMatch = event;
                }
            }

            if (bestMatch) {
                const subEl = document.getElementById(`tl${tlItem.id}Sub`);
                if (subEl) subEl.textContent = `${bestMatch.percentage}% unlock`;
            }
        }
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    // Close handlers
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
    // --- Views Logic ---
    const navTrackerBtn = document.getElementById('navTrackerBtn');
    const navUpcomingBtn = document.getElementById('navUpcomingBtn');
    const navPreferentialBtn = document.getElementById('navPreferentialBtn');

    const viewTracker = document.getElementById('viewTracker');
    const viewUpcomingIPOs = document.getElementById('viewUpcomingIPOs');
    const viewPreferentialUnlock = document.getElementById('viewPreferentialUnlock');
    const upcomingList = document.getElementById('upcomingList');

    function switchView(activeNav, activeView) {
        if (navTrackerBtn) navTrackerBtn.classList.remove('active');
        if (navUpcomingBtn) navUpcomingBtn.classList.remove('active');
        if (navPreferentialBtn) navPreferentialBtn.classList.remove('active');
        if (activeNav) activeNav.classList.add('active');

        if (viewTracker) { viewTracker.classList.remove('active'); viewTracker.classList.add('hidden'); }
        if (viewUpcomingIPOs) { viewUpcomingIPOs.classList.remove('active'); viewUpcomingIPOs.classList.add('hidden'); }
        if (viewPreferentialUnlock) { viewPreferentialUnlock.classList.remove('active'); viewPreferentialUnlock.classList.add('hidden'); }
        if (activeView) { activeView.classList.add('active'); activeView.classList.remove('hidden'); }
    }

    if (navTrackerBtn) {
        navTrackerBtn.addEventListener('click', () => {
            switchView(navTrackerBtn, viewTracker);
            renderTable(); // ensure main table renders
        });
    }

    if (navUpcomingBtn) {
        navUpcomingBtn.addEventListener('click', () => {
            switchView(navUpcomingBtn, viewUpcomingIPOs);
            // If data not yet loaded, fetch silently (no Tracker UI changes) then render
            if (allCompanies.length === 0) {
                upcomingList.innerHTML = '<div class="no-data"><p>Loading IPO data...</p></div>';
                loadCompanyData().then(() => renderUpcomingIPOs()).catch(() => {
                    upcomingList.innerHTML = '<div class="no-data"><p style="color:var(--danger)">Failed to load data.</p></div>';
                });
            } else {
                renderUpcomingIPOs();
            }
        });
    }

    // Wire Upcoming IPO refresh button — silent reload, no Tracker UI changes
    const refreshUpcomingBtn = document.getElementById('refreshUpcomingBtn');
    if (refreshUpcomingBtn) {
        refreshUpcomingBtn.addEventListener('click', () => {
            upcomingList.innerHTML = '<div class="no-data"><p>Refreshing (this may take up to 60s)...</p></div>';
            loadCompanyData(true).then(() => renderUpcomingIPOs()).catch(() => {
                upcomingList.innerHTML = '<div class="no-data"><p style="color:var(--danger)">Failed to refresh.</p></div>';
            });
        });
    }

    if (navPreferentialBtn) {
        navPreferentialBtn.addEventListener('click', () => {
            switchView(navPreferentialBtn, viewPreferentialUnlock);
            // Auto-load from cache on tab switch (no scan)
            loadPrefFromCache();
        });
    }

    // --- Preferential Unlock Logic ---
    let preferentialDataLoaded = false;
    let prefAllResults = [];       // merged NSE + BSE results
    let prefSortMode = 'expiry';   // 'expiry' | 'recent'

    const refreshPrefBtn = document.getElementById('refreshPrefBtn');
    const prefSearchInput = document.getElementById('prefSearch');

    // Wire sort buttons (only 2 now: expiry, recent)
    ['prefSortExpiry', 'prefSortRecent'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                prefSortMode = btn.dataset.sort;
                ['prefSortExpiry', 'prefSortRecent'].forEach(b => {
                    const el = document.getElementById(b);
                    if (el) el.classList.remove('active');
                });
                btn.classList.add('active');
                applyPrefFilter();
            });
        }
    });

    if (prefSearchInput) prefSearchInput.addEventListener('input', applyPrefFilter);

    function applyPrefFilter() {
        const query = (prefSearchInput ? prefSearchInput.value : '').toLowerCase().trim();

        let data = prefAllResults.filter(item => {
            if (!query) return true;
            return (item.company || '').toLowerCase().includes(query) ||
                (item.symbol || '').toLowerCase().includes(query);
        });

        data = [...data].sort((a, b) => {
            if (prefSortMode === 'recent') {
                const da = a.broadcast_dt || '';
                const db = b.broadcast_dt || '';
                return db.localeCompare(da); // most recent first
            }
            // expiry: unknown dates go last
            const da = a.unlock_date || '9999-12-31';
            const db = b.unlock_date || '9999-12-31';
            return da.localeCompare(db);
        });

        const prefNoData = document.getElementById('prefNoData');
        if (!data.length) {
            if (prefNoData) {
                prefNoData.classList.remove('hidden');
                prefNoData.innerHTML = query
                    ? `<p>No results matching "<strong>${query}</strong>".</p>`
                    : '<p>No trading approvals found in the last 365 days.</p>';
            }
        } else {
            if (prefNoData) prefNoData.classList.add('hidden');
            renderPreferentialTable(data);
        }
    }

    if (refreshPrefBtn) {
        // Refresh = delta scan (not force)
        refreshPrefBtn.addEventListener('click', () => triggerPrefScan());
    }

    // Load cached data from disk — called on tab switch, no NSE/BSE scan
    async function loadPrefFromCache() {
        if (preferentialDataLoaded) return; // already loaded this session
        const prefLoading = document.getElementById('prefLoading');
        const prefNoData = document.getElementById('prefNoData');
        const prefTableBody = document.getElementById('prefTableBody');
        const prefLastUpdated = document.getElementById('prefLastUpdated');
        if (!prefTableBody) return;

        prefLoading.classList.remove('hidden');
        const loadingP = prefLoading.querySelector('p');
        if (loadingP) loadingP.textContent = 'Loading saved data...';

        try {
            const resp = await fetch('/api/pref-cache');
            const data = await resp.json();
            prefLoading.classList.add('hidden');
            if (data.results && data.results.length) {
                prefAllResults = data.results;
                preferentialDataLoaded = true;
                if (prefLastUpdated) prefLastUpdated.textContent = data.savedAt ? new Date(data.savedAt).toLocaleString() : '--';
                const prefCountEl = document.getElementById('prefCountNum');
                if (prefCountEl) prefCountEl.textContent = prefAllResults.length;
                applyPrefFilter();
            } else {
                // No cache yet — show prompt to scan
                prefNoData.classList.remove('hidden');
                prefNoData.innerHTML = '<p>No saved data yet. Click <strong>Refresh Data</strong> to scan.</p>';
            }
        } catch (e) {
            prefLoading.classList.add('hidden');
            prefNoData.classList.remove('hidden');
            prefNoData.innerHTML = '<p style="color:var(--danger)">Error loading cache.</p>';
        }
    }

    // Trigger a delta scan (Refresh button) — fetches only new data since last scan
    async function triggerPrefScan() {
        const prefLoading = document.getElementById('prefLoading');
        const prefNoData = document.getElementById('prefNoData');
        const prefTableBody = document.getElementById('prefTableBody');
        const prefLastUpdated = document.getElementById('prefLastUpdated');
        if (!prefTableBody || !prefLoading || !prefNoData) return;

        prefLoading.classList.remove('hidden');
        prefNoData.classList.add('hidden');
        if (refreshPrefBtn) refreshPrefBtn.disabled = true;
        const loadingP = prefLoading.querySelector('p');
        if (loadingP) loadingP.textContent = 'Starting delta scan...';

        try {
            const startResp = await fetch('/api/scan-preferential/start', { method: 'POST' });
            const startData = await startResp.json();

            // Poll until done
            let dots = 0;
            const pollInterval = setInterval(async () => {
                dots = (dots % 3) + 1;
                try {
                    const st = await fetch('/api/scan-preferential/status');
                    const sd = await st.json();
                    if (loadingP) loadingP.textContent = sd.message || `Scanning${'.'.repeat(dots)}`;
                    if (sd.status === 'done') {
                        clearInterval(pollInterval);
                        prefAllResults = sd.results || [];
                        preferentialDataLoaded = true;
                        prefLoading.classList.add('hidden');
                        if (prefLastUpdated) prefLastUpdated.textContent = new Date().toLocaleString();
                        const prefCountEl2 = document.getElementById('prefCountNum');
                        if (prefCountEl2) prefCountEl2.textContent = prefAllResults.length;
                        if (!prefAllResults.length) {
                            prefNoData.classList.remove('hidden');
                            prefNoData.innerHTML = '<p>No trading approvals found.</p>';
                        } else {
                            applyPrefFilter();
                        }
                        if (refreshPrefBtn) refreshPrefBtn.disabled = false;
                    } else if (sd.status === 'error') {
                        clearInterval(pollInterval);
                        prefLoading.classList.add('hidden');
                        prefNoData.classList.remove('hidden');
                        prefNoData.innerHTML = `<p style="color:var(--danger)">Scan failed: ${sd.error || 'Unknown'}</p>`;
                        if (refreshPrefBtn) refreshPrefBtn.disabled = false;
                    }
                } catch (e) { /* keep polling */ }
            }, 3000);
        } catch (error) {
            prefLoading.classList.add('hidden');
            prefNoData.classList.remove('hidden');
            prefNoData.innerHTML = '<p style="color:var(--danger)">Error connecting to server.</p>';
            if (refreshPrefBtn) refreshPrefBtn.disabled = false;
        }
    }

    function renderPreferentialTable(data) {
        const prefTableBody = document.getElementById('prefTableBody');
        if (!prefTableBody) return;
        prefTableBody.innerHTML = '';

        data.forEach(item => {
            const row = document.createElement('tr');
            const isBSE = item.source === 'BSE';

            // Exchange badge
            const exchBadge = isBSE
                ? '<span class="badge" style="background:#e65c00;color:#fff;font-size:10px;padding:2px 6px;">BSE</span>'
                : '<span class="badge" style="background:#0066a1;color:#fff;font-size:10px;padding:2px 6px;">NSE</span>';

            // Notice / Listing Date: use listing_date for NSE, broadcast_dt for BSE
            let listingHtml = '<span class="text-muted">--</span>';
            const noticeDate = item.listing_date || (isBSE ? item.broadcast_dt : null);
            if (noticeDate) {
                listingHtml = `<span class="date-text">${formatDateSimple(noticeDate)}</span>`;
            }

            // Lock-in Expiry
            let unlockHtml = '<span class="text-muted">Pending</span>';
            if (item.unlock_date) {
                const isPast = new Date(item.unlock_date) < new Date();
                unlockHtml = `<div class="date-cell">
                    <span class="date-text ${isPast ? 'text-past' : ''}">${formatDateSimple(item.unlock_date)}</span>
                    ${getStatusBadge(item.unlock_date)}
                </div>`;
            }

            // PDF link
            let linkHtml = '<span class="text-muted">—</span>';
            if (item.pdf_url) {
                linkHtml = `<a href="${item.pdf_url}" target="_blank" class="badge badge-main" style="text-decoration:none;padding:4px 10px;font-size:11px;">View PDF</a>`;
            }

            row.innerHTML = `
                <td data-label="Company"><strong>${item.company || item.symbol || '--'}</strong></td>
                <td data-label="Symbol">${exchBadge} <span class="badge badge-main" style="margin-left:2px;">${item.symbol || item.scrip_cd || '--'}</span></td>
                <td data-label="Shares">${item.shares ? item.shares.toLocaleString('en-IN') : '--'}</td>
                <td data-label="Notice / Listing Date">${listingHtml}</td>
                <td data-label="Lock-in Expiry">${unlockHtml}</td>
                <td data-label="Circular">${linkHtml}</td>
            `;
            prefTableBody.appendChild(row);
        });
    }

    function renderUpcomingIPOs() {
        if (!upcomingList) return;
        upcomingList.innerHTML = '';

        // Guard: data not yet loaded
        if (allCompanies.length === 0) {
            upcomingList.innerHTML = '<div class="no-data"><p>No data loaded yet. Click <strong>Refresh</strong>.</p></div>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcomingIPOs = allCompanies.filter(c => {
            // Exclude InvIT entries — they're not real IPOs
            if (c.companyName && c.companyName.toLowerCase().includes('invit')) return false;

            const listDateStr = c.allotmentDate ? (c.allotmentDate.original || c.allotmentDate.adjusted) : null;
            if (!listDateStr) return true;
            const listDate = new Date(listDateStr);
            listDate.setHours(0, 0, 0, 0);
            return listDate > today;
        });

        if (upcomingIPOs.length === 0) {
            upcomingList.innerHTML = '<div class="no-data"><p>No upcoming IPOs found in database.</p></div>';
            return;
        }

        const fmtDate = (obj) => {
            if (!obj) return 'TBD';
            const finalStr = obj.adjusted || obj.original;
            if (!finalStr) return 'TBD';
            let formatted = formatDateSimple(finalStr);
            if (obj.adjusted) formatted += '*';
            return formatted;
        };

        const smeIpos = upcomingIPOs.filter(c => c.issueType === 'SME');
        const mainIpos = upcomingIPOs.filter(c => c.issueType !== 'SME');

        const splitView = document.createElement('div');
        splitView.className = 'upcoming-split-view';

        const createCard = (ipo) => {
            const item = document.createElement('div');
            item.className = 'upcoming-item';

            const badgeCls = ipo.issueType === 'SME' ? 'label-sme' : 'label-mainboard';
            const exc = ipo.exchange ? ` - ${ipo.exchange}` : '';

            // --- Compact summary line: IPO@110, 9.15lk anc., 23.36lk pub. U1 Apr 15, U2 Jun 14 ---
            const pricePart = ipo.issuePrice ? `@₹${ipo.issuePrice}` : ' — Price TBD';

            // Format shares in lakhs (1 lakh = 100,000)
            const toLk = (n) => (n !== null && n !== undefined && !isNaN(n)) ? (n / 100000).toFixed(2) + 'lk' : '0.00lk';

            let sharesPart = '';
            if (ipo.totalShares) {
                const ancNum = ipo.anchorShares || 0;
                const pubNum = Math.max(0, ipo.totalShares - ancNum);
                if (ancNum > 0) {
                    sharesPart = `, ${toLk(ancNum)} anc., ${toLk(pubNum)} pub.`;
                } else {
                    sharesPart = `, 0 anc., ${toLk(pubNum)} pub.`;
                }
            }

            const d30Str = fmtDate(ipo.anchor30);
            const d90Str = fmtDate(ipo.anchor90);
            const unlockPart = (d30Str !== 'TBD' || d90Str !== 'TBD')
                ? `U1 ${d30Str}, U2 ${d90Str}.`
                : '';

            // Anchor + Pre-IPO investor names — always show anchor status
            let anchorNamesStr = '';
            if (ipo.anchorInvestors && ipo.anchorInvestors.length) {
                anchorNamesStr = `<strong style="color:var(--success)">Anchors (${ipo.anchorInvestors.length}):</strong> ${ipo.anchorInvestors.join(', ')}.`;
            } else {
                anchorNamesStr = `<span style="color:var(--text-muted); font-style:italic;">No anchors yet</span>`;
            }
            let preIpoNamesStr = '';
            if (!ipo.rhpUrl && ipo.preIpoInvestors === undefined) {
                preIpoNamesStr = `<span style="color:var(--warning); font-style:italic; font-size: 0.9em;">Waiting for RHP PDF...</span>`;
            } else if (ipo.preIpoInvestors === undefined) {
                preIpoNamesStr = `<span style="color:var(--text-muted); font-style:italic; font-size: 0.9em;">Scanning RHP...</span>`;
            } else if (ipo.preIpoInvestors && ipo.preIpoInvestors.length > 0) {
                preIpoNamesStr = `<strong>Pre-IPO:</strong> ${ipo.preIpoInvestors.join(', ')}.`;
            } else {
                preIpoNamesStr = `<span style="color:var(--text-muted); font-style:italic;">0 Pre-IPOs.</span>`;
            }
            item.innerHTML = `
                <div class="upcoming-summary-text">
                    <span class="upcoming-label ${badgeCls}">${ipo.issueType}${exc}</span>
                    <strong>${ipo.companyName} IPO</strong>${pricePart}${sharesPart}<br>
                    <span style="font-size: 0.9em; color: var(--text-secondary);">${unlockPart}</span><br>
                    <span style="font-size: 0.85em;">${anchorNamesStr} ${preIpoNamesStr}</span>
                </div>
            `;
            return item;
        };

        const createColumn = (title, count, badgeCls, ipos) => {
            const col = document.createElement('div');
            col.className = 'upcoming-column';
            
            const header = document.createElement('h3');
            header.className = 'upcoming-col-title';
            header.innerHTML = `${title} <span class="badge ${badgeCls}">${count}</span>`;
            col.appendChild(header);

            if (ipos.length === 0) {
                const noData = document.createElement('div');
                noData.className = 'no-data';
                noData.innerHTML = `<p>No upcoming ${title} currently listed.</p>`;
                col.appendChild(noData);
            } else {
                ipos.forEach(ipo => col.appendChild(createCard(ipo)));
            }
            return col;
        };

        splitView.appendChild(createColumn('Mainboard', mainIpos.length, 'label-mainboard', mainIpos));
        splitView.appendChild(createColumn('SME', smeIpos.length, 'label-sme', smeIpos));

        upcomingList.appendChild(splitView);
    }

});
