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

        // 3. Apply Date Filter (This Week / Upcoming)
        const { start: weekStart, end: weekEnd } = getThisWeekRange();
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
                dateA = a.allotmentDate ? new Date(a.allotmentDate) : new Date(0);
                dateB = b.allotmentDate ? new Date(b.allotmentDate) : new Date(0);
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
                <td>
                    <span class="company-name">${company.companyName}</span>
                    <div class="company-meta">
                        ${typeBadge}
                    </div>
                </td>
                <td><span class="date-text text-muted date-clickable" data-company-idx="${companyIdx}">${listingDateDisplay}</span></td>
                <td class="col-anchor"><div class="date-clickable" data-company-idx="${companyIdx}">${col30}</div></td>
                <td class="col-anchor"><div class="date-clickable" data-company-idx="${companyIdx}">${col90}</div></td>
                <td class="col-preipo"><div class="date-clickable" data-company-idx="${companyIdx}">${colPre}</div></td>
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

    function openUnlockModal(company) {
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

            if (!data.found || !data.unlockEvents) {
                // No data — hide section
                if (detailsSection) detailsSection.style.display = 'none';
                return;
            }

            // Show the details section with correct source label
            if (detailsSection) detailsSection.style.display = '';
            const detailsTitle = document.getElementById('unlockDetailsTitle');
            const isNSE = data.source === 'NSE';
            if (detailsTitle) {
                detailsTitle.textContent = isNSE
                    ? '📊 NSE Circular Details'
                    : '📊 BSE Annexure-I Details';
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
                `/api/parse-bse-pdf?company=${encodeURIComponent(companyName)}&noticeId=${encodeURIComponent(noticeId)}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body: pdfBuffer
                }
            );

            return await parseResp.json();

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
                .replace(/[^A-Z0-9 ]/g, '')
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
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

});
