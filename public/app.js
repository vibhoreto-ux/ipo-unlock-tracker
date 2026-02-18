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

            const url = forceRefresh ? '/api/unlock-data?refresh=true' : '/api/unlock-data';
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

        countTotal.textContent = allCompanies.length;

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
                if (company.issueType !== currentType) {
                    return false;
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

            // Company Info
            const isSME = company.issueType && company.issueType.toLowerCase().includes('sme');
            const typeBadge = isSME ? '<span class="badge badge-sme">SME</span>' : '<span class="badge badge-main">Mainboard</span>';

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
    const bseLink = document.getElementById('bseLink');
    const nseLink = document.getElementById('nseLink');
    const copyNameBtn = document.getElementById('copyNameBtn');

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
        modalBadge.innerHTML = isSME
            ? '<span class="badge badge-sme">SME</span>'
            : '<span class="badge badge-main">Mainboard</span>';

        // Exchange badge
        const exchange = company.exchange || '';
        if (exchange) {
            modalExchangeBadge.textContent = exchange;
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

        // BSE link
        bseLink.href = 'https://www.bseindia.com/markets/MarketInfo/NoticesCirculars.aspx?id=0&txtscripcd=&pagecont=&subject=';
        // NSE link
        nseLink.href = 'https://www.nseindia.com/resources/exchange-communication-circulars#';

        // Copy button
        copyNameBtn.textContent = '📋 Copy Company Name';
        copyNameBtn.classList.remove('copied');
        copyNameBtn.onclick = () => {
            navigator.clipboard.writeText(company.companyName).then(() => {
                copyNameBtn.textContent = '✅ Copied!';
                copyNameBtn.classList.add('copied');
                setTimeout(() => {
                    copyNameBtn.textContent = '📋 Copy Company Name';
                    copyNameBtn.classList.remove('copied');
                }, 2000);
            });
        };

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

        // Fetch BSE Annexure-I unlock details (async, non-blocking)
        fetchUnlockDetails(company.companyName, items);
    }

    // Fetch and display BSE unlock details
    async function fetchUnlockDetails(companyName, timelineItems) {
        const detailsSection = document.getElementById('unlockDetailsSection');
        const detailsLoading = document.getElementById('unlockDetailsLoading');
        const detailsContent = document.getElementById('unlockDetailsContent');
        const detailsNotice = document.getElementById('unlockDetailsNotice');

        try {
            const resp = await fetch(`/api/unlock-details/${encodeURIComponent(companyName)}`);
            const data = await resp.json();

            if (detailsLoading) detailsLoading.style.display = 'none';

            if (!data.found || !data.unlockEvents) {
                // No data — hide section
                if (detailsSection) detailsSection.style.display = 'none';
                return;
            }

            // Show the details section
            if (detailsSection) detailsSection.style.display = '';
            if (detailsNotice) detailsNotice.textContent = `Notice: ${data.noticeId || '—'}`;

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
