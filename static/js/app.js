// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================
let state = {
    releaseNotes: [],      // Raw parsed release notes from API
    filteredNotes: [],     // Notes after applying search and type filters
    selectedUpdate: null,  // Currently selected update object
    selectedDate: '',      // Date of the selected update
    selectedLink: '',      // Link for the selected update
    activeFilter: 'all',   // Active type filter
    searchQuery: '',       // Active search input
    theme: 'dark'          // Current UI theme (light / dark)
};

// Map release types to CSS variable styles for badge rendering
const typeStyleMap = {
    'feature': {
        color: 'var(--badge-feature-text)',
        bg: 'var(--badge-feature-bg)',
        border: 'var(--badge-feature-border)',
        glow: 'var(--badge-feature-glow)'
    },
    'issue': {
        color: 'var(--badge-issue-text)',
        bg: 'var(--badge-issue-bg)',
        border: 'var(--badge-issue-border)',
        glow: 'var(--badge-issue-glow)'
    },
    'changed': {
        color: 'var(--badge-changed-text)',
        bg: 'var(--badge-changed-bg)',
        border: 'var(--badge-changed-border)',
        glow: 'var(--badge-changed-glow)'
    },
    'default': {
        color: 'var(--badge-other-text)',
        bg: 'var(--badge-other-bg)',
        border: 'var(--badge-other-border)',
        glow: 'var(--badge-other-glow)'
    }
};

// ==========================================================================
// INITIALIZATION & EVENT LISTENERS
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    fetchReleaseNotes(false);
});

function setupEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('btn-refresh');
    refreshBtn.addEventListener('click', () => fetchReleaseNotes(true));

    // Theme toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    themeBtn.addEventListener('click', toggleTheme);

    // Search bar input
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        clearSearchBtn.style.display = state.searchQuery.length > 0 ? 'block' : 'none';
        applyFilters();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        clearSearchBtn.style.display = 'none';
        applyFilters();
        searchInput.focus();
    });

    // Filter tags click delegation
    const filterTagsContainer = document.getElementById('filter-tags-container');
    filterTagsContainer.addEventListener('click', (e) => {
        const tagButton = e.target.closest('.tag');
        if (!tagButton) return;

        // Update active class
        document.querySelectorAll('#filter-tags-container .tag').forEach(t => t.classList.remove('active'));
        tagButton.classList.add('active');

        state.activeFilter = tagButton.dataset.type.toLowerCase();
        applyFilters();
    });

    // Tweet composer input
    const textarea = document.getElementById('tweet-textarea');
    textarea.addEventListener('input', updateCharCounter);

    // Tweet action buttons
    document.getElementById('btn-tweet').addEventListener('click', shareOnTwitter);
    document.getElementById('btn-copy-tweet').addEventListener('click', copyTweetText);
    document.getElementById('btn-reset-tweet').addEventListener('click', resetTweetComposer);

    // Mobile specific drawer actions
    const closeDrawerBtn = document.getElementById('btn-close-drawer');
    const mobileComposerBtn = document.getElementById('btn-open-mobile-composer');
    const sidebar = document.getElementById('composer-sidebar');
    
    // Create backdrop element
    const backdrop = document.createElement('div');
    backdrop.className = 'composer-backdrop';
    document.body.appendChild(backdrop);

    mobileComposerBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        backdrop.style.display = 'block';
    });

    const closeMobileComposer = () => {
        sidebar.classList.remove('open');
        backdrop.style.display = 'none';
    };

    closeDrawerBtn.addEventListener('click', closeMobileComposer);
    backdrop.addEventListener('click', closeMobileComposer);
}

// ==========================================================================
// DATA FETCHING
// ==========================================================================
async function fetchReleaseNotes(forceRefresh = false) {
    const refreshBtn = document.getElementById('btn-refresh');
    const refreshIcon = document.getElementById('refresh-icon');
    const skeleton = document.getElementById('skeleton-loader');
    const feedContainer = document.getElementById('release-feed');
    const syncStatus = document.getElementById('sync-status');
    const syncDot = syncStatus.querySelector('.status-indicator-dot');
    const syncText = document.getElementById('status-text');
    
    // Set loading state
    refreshBtn.disabled = true;
    refreshIcon.classList.add('spinning');
    skeleton.style.display = 'flex';
    
    // Remove existing cards
    const existingGroups = feedContainer.querySelectorAll('.date-group');
    existingGroups.forEach(el => el.remove());
    
    syncDot.className = 'status-indicator-dot loading';
    syncText.textContent = 'Syncing...';

    // Call API
    const url = `/api/release-notes${forceRefresh ? '?refresh=true' : ''}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        const result = await response.json();
        
        if (result.status === 'error') {
            throw new Error(result.message);
        }

        state.releaseNotes = result.data;
        
        // Update sync status indicator
        syncDot.className = 'status-indicator-dot success';
        const syncDateStr = new Date(result.last_updated * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        syncText.textContent = `Synced ${syncDateStr}`;
        
        // Apply filters & render
        applyFilters();
        updateFilterCounts();
        
        // Hide skeleton
        skeleton.style.display = 'none';
    } catch (error) {
        console.error('Error fetching release notes:', error);
        syncDot.className = 'status-indicator-dot';
        syncText.textContent = 'Sync failed';
        skeleton.style.display = 'none';
        showErrorBanner(error.message);
    } finally {
        refreshBtn.disabled = false;
        refreshIcon.classList.remove('spinning');
    }
}

// ==========================================================================
// RENDER & FILTER LOGIC
// ==========================================================================
function applyFilters() {
    state.filteredNotes = [];

    // Filter nested updates
    state.releaseNotes.forEach(entry => {
        const matchingUpdates = entry.updates.filter(update => {
            // 1. Check type filter
            const matchesType = (state.activeFilter === 'all' || update.type.toLowerCase() === state.activeFilter);
            
            // 2. Check search query
            const matchesSearch = (!state.searchQuery || 
                update.plain_text.toLowerCase().includes(state.searchQuery) ||
                update.type.toLowerCase().includes(state.searchQuery) ||
                entry.date.toLowerCase().includes(state.searchQuery)
            );
            
            return matchesType && matchesSearch;
        });

        if (matchingUpdates.length > 0) {
            state.filteredNotes.push({
                ...entry,
                updates: matchingUpdates
            });
        }
    });

    renderFeed();
}

function updateFilterCounts() {
    let total = 0;
    let counts = { feature: 0, issue: 0, changed: 0 };

    state.releaseNotes.forEach(entry => {
        entry.updates.forEach(u => {
            total++;
            const t = u.type.toLowerCase();
            if (t in counts) {
                counts[t]++;
            }
        });
    });

    document.getElementById('count-all').textContent = total;
    document.getElementById('count-feature').textContent = counts.feature;
    document.getElementById('count-issue').textContent = counts.issue;
    document.getElementById('count-changed').textContent = counts.changed;
}

function renderFeed() {
    const feedContainer = document.getElementById('release-feed');
    const statusBanner = document.getElementById('feed-status');
    
    // Hide status banner
    statusBanner.style.display = 'none';
    statusBanner.className = 'feed-status-banner';
    
    // Remove previous cards (excluding skeleton)
    const existingGroups = feedContainer.querySelectorAll('.date-group');
    existingGroups.forEach(el => el.remove());

    if (state.filteredNotes.length === 0) {
        statusBanner.style.display = 'flex';
        statusBanner.classList.add('info');
        statusBanner.innerHTML = `
            <p><strong>No release notes found</strong></p>
            <p>Try refining your search query or choosing a different filter.</p>
        `;
        return;
    }

    state.filteredNotes.forEach(entry => {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group';

        // Sticky Date Header
        const stickyHeader = document.createElement('div');
        stickyHeader.className = 'sticky-date';
        stickyHeader.innerHTML = `
            <div class="date-heading-wrapper">
                <svg class="date-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke-width="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6" stroke-width="2"></line>
                    <line x1="8" y1="2" x2="8" y2="6" stroke-width="2"></line>
                    <line x1="3" y1="10" x2="21" y2="10" stroke-width="2"></line>
                </svg>
                <span>${entry.date}</span>
            </div>
        `;
        dateGroup.appendChild(stickyHeader);

        // Cards under this date
        entry.updates.forEach(update => {
            const card = document.createElement('div');
            card.className = 'update-card';
            card.id = `card-${update.id}`;
            
            // Set styles dynamically for type
            const style = getTypeStyle(update.type);
            card.style.setProperty('--type-color', style.color);
            card.style.setProperty('--type-bg', style.bg);
            card.style.setProperty('--type-border', style.border);
            card.style.setProperty('--type-glow', style.glow);

            // Re-apply selection state if this card was selected
            if (state.selectedUpdate && state.selectedUpdate.id === update.id) {
                card.classList.add('selected');
            }

            // Card HTML
            card.innerHTML = `
                <div class="card-header">
                    <span class="badge">${update.type}</span>
                    <div class="card-actions-quick">
                        <button class="btn-quick copy-quick" title="Copy text" data-id="${update.id}">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-width="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke-width="2"></path>
                            </svg>
                        </button>
                        <button class="btn-quick tweet-quick" title="Draft tweet" data-id="${update.id}">
                            <svg class="icon fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    ${update.html}
                </div>
            `;

            // Card click behavior (Select Update)
            card.addEventListener('click', (e) => {
                // Ignore click if it was on a quick action button
                if (e.target.closest('.card-actions-quick')) return;
                selectUpdate(update, entry.date, entry.link);
            });

            // Quick actions event bindings
            card.querySelector('.copy-quick').addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboard(update.plain_text, e.currentTarget);
            });

            card.querySelector('.tweet-quick').addEventListener('click', (e) => {
                e.stopPropagation();
                selectUpdate(update, entry.date, entry.link);
                // Open composer immediately
                if (window.innerWidth <= 1024) {
                    document.getElementById('btn-open-mobile-composer').click();
                }
            });

            dateGroup.appendChild(card);
        });

        feedContainer.appendChild(dateGroup);
    });
}

function getTypeStyle(type) {
    const t = type.toLowerCase();
    return typeStyleMap[t] || typeStyleMap['default'];
}

function showErrorBanner(message) {
    const statusBanner = document.getElementById('feed-status');
    statusBanner.style.display = 'flex';
    statusBanner.className = 'feed-status-banner error';
    statusBanner.innerHTML = `
        <p><strong>Failed to Sync Release Notes</strong></p>
        <p>${message}</p>
        <button class="btn btn-secondary btn-sm" onclick="fetchReleaseNotes(true)">Try Again</button>
    `;
}

// ==========================================================================
// COMPOSER & SELECTION LOGIC
// ==========================================================================
function selectUpdate(update, date, link) {
    // 1. Set State
    state.selectedUpdate = update;
    state.selectedDate = date;
    state.selectedLink = link;

    // 2. Visual card selection toggle
    document.querySelectorAll('.update-card').forEach(card => card.classList.remove('selected'));
    const selectedCard = document.getElementById(`card-${update.id}`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }

    // 3. Render side composer contents
    const emptyState = document.getElementById('composer-empty-state');
    const activeState = document.getElementById('composer-active-state');
    
    emptyState.style.display = 'none';
    activeState.style.display = 'flex';

    // Set composer badge & date
    const badge = document.getElementById('composer-badge');
    badge.textContent = update.type;
    badge.className = 'badge'; // reset
    
    const style = getTypeStyle(update.type);
    badge.style.setProperty('--type-color', style.color);
    badge.style.setProperty('--type-bg', style.bg);
    badge.style.setProperty('--type-border', style.border);

    document.getElementById('composer-date').textContent = date;
    document.getElementById('composer-snippet-text').textContent = update.plain_text;

    // Set mobile bar state
    const mobileBar = document.getElementById('mobile-action-bar');
    const mobileBadge = document.getElementById('mobile-bar-badge');
    const mobileText = document.getElementById('mobile-bar-text');

    mobileBadge.textContent = update.type;
    mobileBadge.style.setProperty('--type-color', style.color);
    mobileBadge.style.setProperty('--type-bg', style.bg);
    mobileBadge.style.setProperty('--type-border', style.border);
    mobileText.textContent = update.plain_text;
    mobileBar.style.display = 'flex';

    // Populate composer text area with auto-crafted tweet
    resetTweetComposer();
}

function resetTweetComposer() {
    if (!state.selectedUpdate) return;
    
    const defaultTweet = generateDefaultTweet(
        state.selectedDate,
        state.selectedUpdate.type,
        state.selectedUpdate.plain_text,
        state.selectedLink
    );
    
    const textarea = document.getElementById('tweet-textarea');
    textarea.value = defaultTweet;
    
    updateCharCounter();
}

function generateDefaultTweet(date, type, plainText, link) {
    // Compose Twitter/X Share structure
    const prefix = `📢 BigQuery Update (${date}) - ${type}:\n`;
    const suffix = `\n\nLink: ${link} #GoogleCloud #BigQuery`;
    
    // Calculate space for main text
    // 280 (Twitter limit) - elements length
    const maxTextLen = 280 - prefix.length - suffix.length - 4; // Buffer for '...'
    
    let text = plainText;
    if (text.length > maxTextLen) {
        text = text.substring(0, maxTextLen).trim() + '...';
    }
    
    return `${prefix}${text}${suffix}`;
}

function updateCharCounter() {
    const textarea = document.getElementById('tweet-textarea');
    const countSpan = document.getElementById('char-count');
    const counterDiv = document.getElementById('char-counter');
    const tweetBtn = document.getElementById('btn-tweet');
    
    const count = textarea.value.length;
    countSpan.textContent = count;

    // Twitter allows 280 characters
    if (count === 0) {
        tweetBtn.disabled = true;
        counterDiv.className = 'char-counter';
    } else if (count <= 280) {
        tweetBtn.disabled = false;
        counterDiv.className = 'char-counter';
        if (count > 250) {
            counterDiv.classList.add('warning');
        }
    } else {
        // Over limit
        tweetBtn.disabled = true;
        counterDiv.className = 'char-counter danger';
    }
}

function shareOnTwitter() {
    const textarea = document.getElementById('tweet-textarea');
    const tweetText = textarea.value;
    if (!tweetText) return;

    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
}

function copyTweetText() {
    const textarea = document.getElementById('tweet-textarea');
    const btn = document.getElementById('btn-copy-tweet');
    copyToClipboard(textarea.value, btn, 'Text Copied!');
}

// Helper to copy strings to clipboard and give button feedback
function copyToClipboard(text, buttonElement, successMessage = '') {
    navigator.clipboard.writeText(text).then(() => {
        const originalContent = buttonElement.innerHTML;
        
        buttonElement.classList.add('success-flash');
        if (successMessage) {
            buttonElement.innerHTML = `
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="20 6 9 17 4 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
                </svg>
                <span>${successMessage}</span>
            `;
        } else {
            buttonElement.innerHTML = `
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="20 6 9 17 4 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
                </svg>
            `;
        }

        setTimeout(() => {
            buttonElement.classList.remove('success-flash');
            buttonElement.innerHTML = originalContent;
        }, 2000);
    }).catch(err => {
        console.error('Could not copy text: ', err);
    });
}

// ==========================================================================
// THEME CONTROLLER
// ==========================================================================
function initTheme() {
    // Read from localStorage or system setting
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        state.theme = savedTheme;
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        state.theme = prefersDark ? 'dark' : 'light';
    }

    applyTheme();
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    applyTheme();
}

function applyTheme() {
    const html = document.documentElement;
    if (state.theme === 'dark') {
        html.className = 'dark-theme';
    } else {
        html.className = '';
    }
}
