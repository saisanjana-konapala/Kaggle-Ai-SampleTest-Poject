// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================
let currentStudentId = null;
let searchTimeout = null;

// ==========================================================================
// INITIALIZATION & EVENT LISTENERS
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    fetchStudents();

    // Student Search as they type (Debounced to 300ms)
    const searchInput = document.getElementById('student-search');
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            fetchStudents(e.target.value.trim());
        }, 300);
    });

    // Backup Button Listener
    document.getElementById('btn-backup').addEventListener('click', triggerS3Backup);
});

// ==========================================================================
// STUDENTS RETRIEVAL & RENDERING
// ==========================================================================
async function fetchStudents(query = '') {
    const grid = document.getElementById('student-grid-container');
    
    try {
        const url = `/api/students${query ? `?query=${encodeURIComponent(query)}` : ''}`;
        const response = await fetch(url);
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            renderStudentsGrid(result.data);
        } else {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--color-danger);">
                    Error: ${result.message || 'Failed to load students.'}
                </div>
            `;
        }
    } catch (e) {
        console.error("Error fetching students:", e);
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--color-danger);">
                Network Error: Failed to reach the server.
            </div>
        `;
    }
}

function renderStudentsGrid(students) {
    const grid = document.getElementById('student-grid-container');
    grid.innerHTML = '';

    if (students.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                No students found matching your search.
            </div>
        `;
        return;
    }

    students.forEach(student => {
        const card = document.createElement('div');
        card.className = 'student-card';
        card.innerHTML = `
            <div class="student-card-header">
                <div class="student-avatar">
                    ${student.name[0].toUpperCase()}
                </div>
                <div class="student-meta">
                    <span class="student-name">${student.name}</span>
                    <span class="student-roll">Roll: ${student.roll_number}</span>
                </div>
            </div>
            <div class="student-card-details">
                <span>Branch: <strong>${student.department}</strong></span>
                <span>Semester: <strong>${student.semester}</strong></span>
            </div>
            <button class="btn btn-primary btn-sm" style="margin-top: auto; width: 100%;">
                Manage Marks
            </button>
        `;

        card.addEventListener('click', () => openMarksModal(student.id));
        grid.appendChild(card);
    });
}

// ==========================================================================
// MARKS MANAGEMENT (MODAL CONTROLLER)
// ==========================================================================
async function openMarksModal(studentId) {
    currentStudentId = studentId;
    const modal = document.getElementById('marks-modal');
    const marksList = document.getElementById('modal-marks-list');
    const title = document.getElementById('modal-student-name');
    
    marksList.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading marks information...</div>';
    modal.style.display = 'flex';

    try {
        const response = await fetch(`/api/student/${studentId}/marks`);
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            title.textContent = `Manage Marks - ${result.student_name}`;
            renderMarksEditor(result.data);
        } else {
            marksList.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--color-danger);">${result.message}</div>`;
        }
    } catch (e) {
        console.error("Error loading student marks:", e);
        marksList.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--color-danger);">Network error loading marks.</div>';
    }
}

function renderMarksEditor(marks) {
    const container = document.getElementById('modal-marks-list');
    container.innerHTML = '';
    
    if (marks.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No subjects configured in system.</div>';
        return;
    }

    const editList = document.createElement('div');
    editList.className = 'marks-edit-list';

    marks.forEach(item => {
        const row = document.createElement('div');
        row.className = 'marks-edit-row';
        
        // Show empty input or current score
        const displayValue = item.marks_obtained === -1 ? '' : item.marks_obtained;
        
        row.innerHTML = `
            <div class="subject-info-col">
                <span class="sub-code">${item.code}</span>
                <span class="sub-name">${item.subject_name}</span>
            </div>
            <div class="marks-input-wrapper">
                <input type="number" 
                       class="marks-input" 
                       min="0" 
                       max="100" 
                       value="${displayValue}" 
                       placeholder="N/A"
                       data-subject-id="${item.subject_id}"
                       data-code="${item.code}"
                       data-original="${displayValue}">
                <span style="font-size: 0.875rem; color: var(--text-tertiary);">/ 100</span>
            </div>
        `;
        editList.appendChild(row);
    });

    container.appendChild(editList);
}

function closeModal() {
    document.getElementById('marks-modal').style.display = 'none';
    currentStudentId = null;
}

async function saveAllMarks() {
    if (!currentStudentId) return;
    
    const saveBtn = document.getElementById('btn-save-marks');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    const inputs = document.querySelectorAll('.marks-input');
    let successCount = 0;
    let failCount = 0;
    
    for (const input of inputs) {
        const originalVal = input.dataset.original;
        const currentVal = input.value.trim();
        
        // Only trigger update if the marks have changed
        if (originalVal !== currentVal) {
            // Validate input
            if (currentVal !== '') {
                const num = parseInt(currentVal);
                if (isNaN(num) || num < 0 || num > 100) {
                    showToast(`Invalid score for ${input.dataset.code}. Must be between 0 and 100.`, 'error');
                    failCount++;
                    continue;
                }
            } else {
                // Ignore clearing out to N/A for this simple demo, or you can treat it as deletion
                continue; 
            }
            
            const subjectId = input.dataset.subjectId;
            
            try {
                const response = await fetch('/api/marks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        student_id: currentStudentId,
                        subject_id: subjectId,
                        marks_obtained: currentVal
                    })
                });
                
                const result = await response.json();
                if (response.ok && result.status === 'success') {
                    successCount++;
                    input.dataset.original = currentVal; // Update base reference
                } else {
                    failCount++;
                    showToast(`Failed to update ${input.dataset.code}: ${result.message}`, 'error');
                }
            } catch (e) {
                failCount++;
                showToast(`Network error updating ${input.dataset.code}`, 'error');
            }
        }
    }
    
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
    
    if (successCount > 0) {
        showToast(`Successfully updated marks for ${successCount} subjects.`, 'success');
    }
    
    if (failCount === 0) {
        closeModal();
    }
}

// ==========================================================================
// AWS S3 BACKUP ROUTINE
// ==========================================================================
async function triggerS3Backup() {
    const backupBtn = document.getElementById('btn-backup');
    const btnText = document.getElementById('backup-btn-text');
    const originalText = btnText.textContent;
    
    // Add spinner status
    backupBtn.disabled = true;
    btnText.textContent = 'Backing up to S3...';
    showToast('Database S3 backup initialized...', 'info');

    try {
        const response = await fetch('/api/backup', { method: 'POST' });
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showToast('Backup uploaded successfully to AWS S3!', 'success');
            console.log("AWS S3 URI:", result.message);
        } else {
            showToast(`S3 Backup failed: ${result.message}`, 'error');
        }
    } catch (e) {
        console.error("Error triggering S3 backup:", e);
        showToast('Network error triggering S3 backup.', 'error');
    } finally {
        backupBtn.disabled = false;
        btnText.textContent = originalText;
    }
}

// ==========================================================================
// TOAST NOTIFICATIONS UTILITY
// ==========================================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Choose status icon / spinner based on type
    let iconHTML = '';
    if (type === 'info') {
        iconHTML = '<div class="spinner"></div>';
    } else if (type === 'success') {
        iconHTML = `
            <svg class="icon" style="color: var(--color-success);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
    } else {
        iconHTML = `
            <svg class="icon" style="color: var(--color-danger);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
        `;
    }

    toast.innerHTML = `
        ${iconHTML}
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Fade and remove after 4.5 seconds
    setTimeout(() => {
        toast.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, 4500);
}
