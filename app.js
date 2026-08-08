/* ============================================================
   Menora Nömrələr — CRM System
   Version 2.0
   ============================================================ */

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = 'https://rusrbieylhzpyvoeofoa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1c3JiaWV5bGh6cHl2b2VvZm9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMzAzNjMsImV4cCI6MjEwMTcwNjM2M30.SNRz3ECG9SbPTULwyKu9y69RA6oZChc1VgZNxl6qk_4';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let currentProfile = null;
let allNumbers = [];
let filteredNumbers = [];
let allWorkers = [];
let currentPage = 1;
const PAGE_SIZE = 20;
let pendingFileNumbers = [];
let searchPhoneTimeout = null;
let currentSection = null;

const STATUSES = [
  'Yeni', 'Danışılır', 'Cavab vermədi', 'Nömrə işləmir',
  'Razı olmadı', 'Gələcəkdə ala bilər', 'Maraqlanır', 'Müştəri oldu'
];

// Statuses that mean "contacted"
const CONTACTED_STATUSES = ['Danışılır', 'Cavab vermədi', 'Nömrə işləmir', 'Razı olmadı', 'Gələcəkdə ala bilər', 'Maraqlanır', 'Müştəri oldu'];
// Statuses that mean "not contacted" (no real connection established)
const UNCONTACTED_STATUSES = ['Yeni', 'Cavab vermədi', 'Nömrə işləmir'];

const STATUS_ICONS = {
  'Yeni': 'fas fa-plus-circle',
  'Danışılır': 'fas fa-comments',
  'Cavab vermədi': 'fas fa-phone-slash',
  'Nömrə işləmir': 'fas fa-ban',
  'Razı olmadı': 'fas fa-times-circle',
  'Gələcəkdə ala bilər': 'fas fa-clock',
  'Maraqlanır': 'fas fa-star',
  'Müştəri oldu': 'fas fa-user-check'
};

// Session storage key for last section
const SESSION_KEY = 'menora_last_section';

// ============================================================
// PWA INSTALL
// ============================================================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Show banner only if not dismissed
  const dismissed = sessionStorage.getItem('pwa_dismissed');
  if (!dismissed) {
    setTimeout(() => {
      const banner = document.getElementById('pwaInstallBanner');
      if (banner && currentUser) banner.style.display = 'flex';
    }, 3000);
  }
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.style.display = 'none';
  showToast('Menora Nömrələr quraşdırıldı!', 'success');
});

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((result) => {
      deferredPrompt = null;
      const banner = document.getElementById('pwaInstallBanner');
      if (banner) banner.style.display = 'none';
    });
  }
}

function dismissPWABanner() {
  sessionStorage.setItem('pwa_dismissed', '1');
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.style.display = 'none';
}

// ============================================================
// INIT
// ============================================================
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await initApp(session.user);
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await initApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      showLoginPage();
    }
  });
})();

async function initApp(user) {
  currentUser = user;
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error || !profile) {
    showToast('Profil tapılmadı. Adminlə əlaqə saxlayın.', 'error');
    await sb.auth.signOut();
    return;
  }
  currentProfile = profile;
  showAppPage();
}

// ============================================================
// AUTH
// ============================================================
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errEl.textContent = '';
  if (!email || !pass) { errEl.textContent = 'E-poçt və şifrəni daxil edin.'; return; }
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Giriş...';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Daxil ol';
  if (error) { errEl.textContent = 'E-poçt və ya şifrə yanlışdır.'; }
}

// Enter key login
document.addEventListener('DOMContentLoaded', () => {
  const passInput = document.getElementById('loginPassword');
  if (passInput) {
    passInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
  }
  const emailInput = document.getElementById('loginEmail');
  if (emailInput) {
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
  }
});

async function doLogout() {
  // Clear session storage on logout
  sessionStorage.removeItem(SESSION_KEY);
  await sb.auth.signOut();
}

function togglePass() {
  const inp = document.getElementById('loginPassword');
  const icon = document.getElementById('eyeIcon');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  icon.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
function showLoginPage() {
  document.getElementById('loginPage').classList.add('active');
  document.getElementById('appPage').classList.remove('active');
  currentUser = null; currentProfile = null;
}

function showAppPage() {
  document.getElementById('loginPage').classList.remove('active');
  document.getElementById('appPage').classList.add('active');
  const isAdmin = currentProfile.role === 'admin';

  // Show/hide nav items
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');
  document.querySelectorAll('.worker-only').forEach(el => el.style.display = isAdmin ? 'none' : '');

  // User info
  const name = currentProfile.full_name || currentProfile.email;
  document.getElementById('userInfoSidebar').textContent = `${name} (${isAdmin ? 'Admin' : 'İşçi'})`;
  document.getElementById('topUserName').textContent = name;

  // Restore last section from session storage
  const lastSection = sessionStorage.getItem(SESSION_KEY);

  if (isAdmin) {
    loadAllWorkers();
    // Validate saved section belongs to admin
    const adminSections = ['dashboard', 'numbers', 'workers', 'import', 'distribute'];
    if (lastSection && adminSections.includes(lastSection)) {
      showSection(lastSection);
    } else {
      showSection('dashboard');
    }
  } else {
    // Validate saved section belongs to worker
    const workerSections = ['myNumbers', 'reminders'];
    if (lastSection && workerSections.includes(lastSection)) {
      showSection(lastSection);
    } else {
      showSection('myNumbers');
    }
  }

  // Show PWA install banner after delay if prompt available
  if (deferredPrompt && !sessionStorage.getItem('pwa_dismissed')) {
    setTimeout(() => {
      const banner = document.getElementById('pwaInstallBanner');
      if (banner) banner.style.display = 'flex';
    }, 3000);
  }
}

function showSection(name) {
  // Hide all sections
  document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
  // Show target
  const sectionMap = {
    'dashboard': 'sectionDashboard',
    'numbers': 'sectionNumbers',
    'workers': 'sectionWorkers',
    'import': 'sectionImport',
    'distribute': 'sectionDistribute',
    'myNumbers': 'sectionMyNumbers',
    'reminders': 'sectionReminders'
  };
  const sectionId = sectionMap[name];
  if (sectionId) {
    document.getElementById(sectionId).classList.remove('hidden');
  }

  // Update active nav - remove active from all, add to clicked
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === name);
  });

  // Update top bar title
  const titles = {
    'dashboard': 'Dashboard', 'numbers': 'Bütün Nömrələr', 'workers': 'İşçilər',
    'import': 'Nömrə İmport', 'distribute': 'Nömrə Paylaşdır',
    'myNumbers': 'Nömrələrim', 'reminders': 'Xatırlatmalar'
  };
  document.getElementById('topBarTitle').textContent = titles[name] || name;

  closeSidebar();

  // Save current section to session storage
  currentSection = name;
  sessionStorage.setItem(SESSION_KEY, name);

  // Load data
  if (name === 'dashboard') loadDashboard();
  else if (name === 'numbers') loadAdminNumbers();
  else if (name === 'workers') loadWorkers();
  else if (name === 'distribute') loadDistributeInfo();
  else if (name === 'myNumbers') loadMyNumbers();
  else if (name === 'reminders') loadReminders();
}

// Refresh current section
function refreshCurrentSection() {
  const btn = document.getElementById('refreshBtn');
  if (btn) {
    btn.querySelector('i').classList.add('fa-spin');
    setTimeout(() => btn.querySelector('i').classList.remove('fa-spin'), 1000);
  }
  if (currentSection) showSection(currentSection);
}

// ============================================================
// SIDEBAR
// ============================================================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const { data: nums } = await sb.from('phone_numbers').select('status, assigned_to');
  if (!nums) return;

  const total = nums.length;
  const counts = {};
  STATUSES.forEach(s => counts[s] = 0);
  nums.forEach(n => { if (counts[n.status] !== undefined) counts[n.status]++; });

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statNew').textContent = counts['Yeni'];
  document.getElementById('statCustomer').textContent = counts['Müştəri oldu'];
  document.getElementById('statInterested').textContent = counts['Maraqlanır'];
  document.getElementById('statFuture').textContent = counts['Gələcəkdə ala bilər'];
  document.getElementById('statRefused').textContent = counts['Razı olmadı'];
  document.getElementById('statNoAnswer').textContent = counts['Cavab vermədi'];
  document.getElementById('statInvalid').textContent = counts['Nömrə işləmir'];

  await loadWorkerStats();
  await loadDashboardReminders();
}

async function loadWorkerStats() {
  const { data: workers } = await sb.from('profiles').select('*').eq('role', 'worker');
  const { data: numbers } = await sb.from('phone_numbers').select('assigned_to, status');
  const container = document.getElementById('workerStatsTable');
  if (!workers || !workers.length) {
    container.innerHTML = '<p class="text-muted" style="padding:1rem">İşçi tapılmadı.</p>';
    return;
  }
  let html = '';
  workers.forEach(w => {
    const myNums = numbers ? numbers.filter(n => n.assigned_to === w.id) : [];
    const contacted = myNums.filter(n => CONTACTED_STATUSES.includes(n.status)).length;
    const customer = myNums.filter(n => n.status === 'Müştəri oldu').length;
    const interested = myNums.filter(n => n.status === 'Maraqlanır').length;
    const future = myNums.filter(n => n.status === 'Gələcəkdə ala bilər').length;
    html += `<div class="worker-stat-row">
      <div class="worker-name">${escHtml(w.full_name || w.email)}</div>
      <div class="worker-stats-chips">
        <span class="stat-chip total"><i class="fas fa-phone"></i> ${myNums.length} nömrə</span>
        <span class="stat-chip"><i class="fas fa-comments"></i> ${contacted} əlaqə</span>
        <span class="stat-chip interested"><i class="fas fa-star"></i> ${interested} maraqlanır</span>
        <span class="stat-chip"><i class="fas fa-clock"></i> ${future} gələcəkdə</span>
        <span class="stat-chip customer"><i class="fas fa-user-check"></i> ${customer} müştəri</span>
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

async function loadDashboardReminders() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await sb.from('phone_numbers')
    .select('id, phone_display, next_contact_date, assigned_to, profiles!assigned_to(full_name, email)')
    .not('next_contact_date', 'is', null)
    .lte('next_contact_date', today);
  const el = document.getElementById('dashReminders');
  if (!data || !data.length) { el.style.display = 'none'; return; }
  let html = `<h4><i class="fas fa-bell"></i> Bu gün/keçmiş xatırlatmalar (${data.length})</h4>`;
  data.forEach(n => {
    const worker = n.profiles ? (n.profiles.full_name || n.profiles.email) : 'Təyin edilməyib';
    html += `<div class="reminder-item">
      <span class="reminder-phone">${escHtml(n.phone_display)}</span>
      <span>${escHtml(worker)}</span>
      <span class="reminder-date">${formatDate(n.next_contact_date)}</span>
    </div>`;
  });
  el.innerHTML = html;
  el.style.display = 'block';
}

function filterByStatus(status) {
  document.getElementById('filterStatus').value = status;
  showSection('numbers');
}

// ============================================================
// ADMIN NUMBERS
// ============================================================
async function loadAdminNumbers() {
  document.getElementById('numbersTable').innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Yüklənir...</div>';
  const { data } = await sb.from('phone_numbers')
    .select('*, profiles!assigned_to(id, full_name, email)')
    .order('created_at', { ascending: false });
  allNumbers = data || [];
  populateWorkerFilter();
  applyAdminFilters();
}

function populateWorkerFilter() {
  const sel = document.getElementById('filterWorker');
  const current = sel.value;
  const workers = [...new Map(
    allNumbers.filter(n => n.profiles).map(n => [n.assigned_to, n.profiles])
  ).entries()].map(([id, p]) => ({ id, ...p }));
  sel.innerHTML = '<option value="">Bütün işçilər</option>';
  workers.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.full_name || w.email;
    if (w.id === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function applyAdminFilters() {
  const phone = document.getElementById('filterPhone').value.trim().toLowerCase();
  const status = document.getElementById('filterStatus').value;
  const worker = document.getElementById('filterWorker').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;

  filteredNumbers = allNumbers.filter(n => {
    if (phone && !n.phone_display.toLowerCase().includes(phone) && !n.phone.includes(phone)) return false;
    if (status && n.status !== status) return false;
    if (worker && n.assigned_to !== worker) return false;
    if (dateFrom && n.created_at.split('T')[0] < dateFrom) return false;
    if (dateTo && n.created_at.split('T')[0] > dateTo) return false;
    return true;
  });
  currentPage = 1;
  renderAdminNumbers();
}

function renderAdminNumbers() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = filteredNumbers.slice(start, start + PAGE_SIZE);
  let html = `<table><thead><tr>
    <th>Nömrə</th><th>Status</th><th>İşçi</th><th>Növbəti Əlaqə</th><th>Tarix</th><th>Əməliyyat</th>
  </tr></thead><tbody>`;
  if (!pageData.length) {
    html += '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-400)">Nömrə tapılmadı</td></tr>';
  }
  pageData.forEach(n => {
    const worker = n.profiles ? (n.profiles.full_name || n.profiles.email) : '<span style="color:var(--gray-400)">Yoxdur</span>';
    html += `<tr>
      <td><span class="phone-text" style="font-weight:600;letter-spacing:0.03em">${escHtml(n.phone_display)}</span></td>
      <td>${renderStatusBadge(n.status)}</td>
      <td>${worker}</td>
      <td>${n.next_contact_date ? `<span style="color:var(--warning);font-size:0.8rem"><i class="fas fa-calendar"></i> ${formatDate(n.next_contact_date)}</span>` : '—'}</td>
      <td style="color:var(--gray-400);font-size:0.8rem">${formatDateTime(n.created_at)}</td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="openNumberDetail('${n.id}')" title="Detal"><i class="fas fa-eye"></i></button>
        <button class="btn btn-ghost btn-xs" onclick="openAssignModal('${n.id}','${escHtml(n.phone_display)}')" title="Təyin et"><i class="fas fa-user-plus"></i></button>
        <button class="btn btn-danger btn-xs" onclick="confirmDeleteNumber('${n.id}','${escHtml(n.phone_display)}')" title="Sil"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('numbersTable').innerHTML = html;
  renderPagination('numbersPagination', filteredNumbers.length, currentPage, (p) => { currentPage = p; renderAdminNumbers(); });
}

// Delete number
function confirmDeleteNumber(id, phone) {
  showConfirm(`"${phone}" nömrəsini silmək istədiyinizə əminsiniz? Bu əməliyyat geri qaytarıla bilməz.`, async () => {
    const { error } = await sb.from('phone_numbers').delete().eq('id', id);
    if (error) { showToast('Silmə xətası: ' + error.message, 'error'); return; }
    showToast('Nömrə silindi.', 'success');
    loadAdminNumbers();
  }, 'Nömrəni Sil');
}

// ============================================================
// WORKERS (Admin)
// ============================================================
async function loadAllWorkers() {
  const { data } = await sb.from('profiles').select('*').eq('role', 'worker');
  allWorkers = data || [];
  const sel = document.getElementById('manualWorker');
  sel.innerHTML = '<option value="">İşçi seçin...</option>';
  allWorkers.forEach(w => {
    sel.innerHTML += `<option value="${w.id}">${escHtml(w.full_name || w.email)}</option>`;
  });
}

async function loadWorkers() {
  const { data } = await sb.from('profiles').select('*').eq('role', 'worker');
  allWorkers = data || [];
  const { data: nums } = await sb.from('phone_numbers').select('assigned_to');
  const countMap = {};
  (nums || []).forEach(n => { if (n.assigned_to) countMap[n.assigned_to] = (countMap[n.assigned_to] || 0) + 1; });

  let html = `<table><thead><tr><th>Ad</th><th>E-poçt</th><th>Nömrə sayı</th><th>Əməliyyat</th></tr></thead><tbody>`;
  if (!allWorkers.length) {
    html += '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--gray-400)">İşçi tapılmadı</td></tr>';
  }
  allWorkers.forEach(w => {
    html += `<tr>
      <td><strong>${escHtml(w.full_name || '—')}</strong></td>
      <td>${escHtml(w.email)}</td>
      <td><span class="badge badge-primary">${countMap[w.id] || 0}</span></td>
      <td>
        <button class="btn btn-danger btn-xs" onclick="confirmDeleteWorker('${w.id}','${escHtml(w.full_name || w.email)}')">
          <i class="fas fa-trash"></i> Sil
        </button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  document.getElementById('workersTable').innerHTML = html;
}

function openAddWorkerModal() {
  document.getElementById('workerName').value = '';
  document.getElementById('workerEmail').value = '';
  document.getElementById('workerPass').value = '';
  document.getElementById('addWorkerError').textContent = '';
  openModal('modalAddWorker');
}

async function doAddWorker() {
  const name = document.getElementById('workerName').value.trim();
  const email = document.getElementById('workerEmail').value.trim();
  const pass = document.getElementById('workerPass').value;
  const errEl = document.getElementById('addWorkerError');
  const btn = document.getElementById('addWorkerBtn');
  errEl.textContent = '';
  if (!name || !email || !pass) { errEl.textContent = 'Bütün sahələri doldurun.'; return; }
  if (pass.length < 6) { errEl.textContent = 'Şifrə minimum 6 simvol olmalıdır.'; return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Əlavə edilir...';

  try {
    // Step 1: Sign up the new worker
    const { data: signupData, error: signupErr } = await sb.auth.signUp({
      email,
      password: pass,
      options: {
        data: { full_name: name, role: 'worker' }
      }
    });

    if (signupErr) {
      errEl.textContent = signupErr.message;
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus"></i> Əlavə et';
      return;
    }

    // Step 2: Upsert profile for the new user
    if (signupData && signupData.user) {
      const { error: profileErr } = await sb.from('profiles').upsert({
        id: signupData.user.id,
        email: email,
        full_name: name,
        role: 'worker'
      }, { onConflict: 'id' });

      if (profileErr) {
        console.warn('Profile upsert error:', profileErr);
      }
    }

    closeModal('modalAddWorker');
    showToast(`İşçi "${name}" uğurla əlavə edildi! Email təsdiqi lazım ola bilər.`, 'success');
    loadWorkers();
    loadAllWorkers();
  } catch (e) {
    errEl.textContent = 'Xəta baş verdi: ' + e.message;
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-user-plus"></i> Əlavə et';
}

function confirmDeleteWorker(id, name) {
  showConfirm(`"${name}" adlı işçini silmək istədiyinizə əminsiniz?`, async () => {
    const { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) { showToast('Silmə xətası: ' + error.message, 'error'); return; }
    showToast('İşçi silindi.', 'success');
    loadWorkers();
    loadAllWorkers();
  });
}

// ============================================================
// ADD NUMBER (Admin)
// ============================================================
function openAddNumberModal() {
  document.getElementById('newPhone').value = '';
  document.getElementById('addNumberError').textContent = '';
  openModal('modalAddNumber');
}

async function doAddNumber() {
  const raw = document.getElementById('newPhone').value.trim();
  const errEl = document.getElementById('addNumberError');
  errEl.textContent = '';
  const normalized = normalizePhone(raw);
  if (!normalized) { errEl.textContent = 'Düzgün telefon nömrəsi daxil edin.'; return; }
  const display = formatPhoneDisplay(normalized);
  const { error } = await sb.from('phone_numbers').insert({ phone: normalized, phone_display: display, status: 'Yeni' });
  if (error) {
    if (error.code === '23505') { errEl.textContent = 'Bu nömrə artıq sistemdədir.'; }
    else { errEl.textContent = error.message; }
    return;
  }
  showToast('Nömrə əlavə edildi!', 'success');
  closeModal('modalAddNumber');
  loadAdminNumbers();
}

// ============================================================
// IMPORT
// ============================================================
let fileNumbers = [];

function handleFileDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) processFile(file);
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) processFile(file);
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    fileNumbers = extractPhones(text);
    document.getElementById('filePreview').innerHTML = `<p style="color:var(--success);font-size:0.85rem"><i class="fas fa-check"></i> <strong>${fileNumbers.length}</strong> nömrə aşkarlandı: ${escHtml(file.name)}</p>`;
    document.getElementById('importFileBtn').style.display = 'flex';
  };
  reader.readAsText(file);
}

async function doImport() {
  const text = document.getElementById('importText').value;
  const phones = extractPhones(text);
  await importPhones(phones);
}

async function doFileImport() {
  await importPhones(fileNumbers);
}

function extractPhones(text) {
  const phones = [];
  const lines = text.split(/[\n,;]+/);
  lines.forEach(line => {
    const cleaned = line.replace(/\s/g, '').replace(/[^\d+]/g, '');
    if (cleaned.length >= 9) phones.push(cleaned);
  });
  return phones;
}

async function importPhones(rawPhones) {
  if (!rawPhones.length) { showToast('Nömrə tapılmadı.', 'error'); return; }
  const resultEl = document.getElementById('importResult');
  resultEl.className = 'import-result';
  resultEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> İmport edilir...</div>';

  const normalized = rawPhones.map(p => normalizePhone(p)).filter(Boolean);
  const unique = [...new Set(normalized)];
  const duplicatesInInput = normalized.length - unique.length;

  const { data: existing } = await sb.from('phone_numbers').select('phone').in('phone', unique);
  const existingSet = new Set((existing || []).map(n => n.phone));
  const toInsert = unique.filter(p => !existingSet.has(p));
  const alreadyExist = unique.length - toInsert.length;

  let inserted = 0, errors = 0;
  if (toInsert.length) {
    const rows = toInsert.map(p => ({ phone: p, phone_display: formatPhoneDisplay(p), status: 'Yeni' }));
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await sb.from('phone_numbers').insert(batch);
      if (error) errors += batch.length;
      else inserted += batch.length;
    }
  }

  resultEl.className = 'import-result ' + (errors ? 'error' : 'success');
  resultEl.innerHTML = `
    <strong><i class="fas fa-check-circle"></i> İmport tamamlandı!</strong><br><br>
    📱 Ümumi nömrə sayı: <strong>${rawPhones.length}</strong><br>
    ✅ Əlavə edildi: <strong>${inserted}</strong><br>
    🔁 Daxiloldə təkrar: <strong>${duplicatesInInput}</strong><br>
    ⚠️ Artıq sistemdə var idi: <strong>${alreadyExist}</strong><br>
    ${errors ? `❌ Xəta: <strong>${errors}</strong>` : ''}
  `;
  if (inserted > 0) loadAdminNumbers();
}

// ============================================================
// DISTRIBUTE
// ============================================================
async function loadDistributeInfo() {
  const { data: unassigned } = await sb.from('phone_numbers').select('id').is('assigned_to', null);
  const { data: workers } = await sb.from('profiles').select('id, full_name, email').eq('role', 'worker');
  allWorkers = workers || [];

  const el = document.getElementById('distributeInfo');
  const total = unassigned ? unassigned.length : 0;
  const wCount = workers ? workers.length : 0;
  const perWorker = wCount > 0 ? Math.ceil(total / wCount) : 0;

  el.innerHTML = `
    <div class="distribute-stat"><span>Paylaşdırılmamış nömrələr</span><strong>${total}</strong></div>
    <div class="distribute-stat"><span>İşçi sayı</span><strong>${wCount}</strong></div>
    <div class="distribute-stat"><span>Hər işçiyə təxminən</span><strong>${perWorker}</strong></div>
  `;

  const sel = document.getElementById('manualWorker');
  sel.innerHTML = '<option value="">İşçi seçin...</option>';
  (workers || []).forEach(w => {
    sel.innerHTML += `<option value="${w.id}">${escHtml(w.full_name || w.email)}</option>`;
  });
}

async function doAutoDistribute() {
  const { data: unassigned } = await sb.from('phone_numbers').select('id').is('assigned_to', null);
  const { data: workers } = await sb.from('profiles').select('id').eq('role', 'worker');
  if (!unassigned || !unassigned.length) { showToast('Paylaşdırılmamış nömrə yoxdur.', 'warning'); return; }
  if (!workers || !workers.length) { showToast('İşçi tapılmadı.', 'error'); return; }

  const shuffled = [...unassigned].sort(() => Math.random() - 0.5);
  const updates = [];
  shuffled.forEach((num, i) => {
    updates.push({ id: num.id, assigned_to: workers[i % workers.length].id });
  });

  let done = 0;
  for (const upd of updates) {
    await sb.from('phone_numbers').update({ assigned_to: upd.assigned_to }).eq('id', upd.id);
    done++;
  }
  showToast(`${done} nömrə ${workers.length} işçiyə paylaşdırıldı!`, 'success');
  loadDistributeInfo();
}

function searchPhoneForManual() {
  clearTimeout(searchPhoneTimeout);
  const val = document.getElementById('manualPhone').value.trim();
  const dropdown = document.getElementById('phoneSearchResults');
  if (!val) { dropdown.innerHTML = ''; return; }
  searchPhoneTimeout = setTimeout(async () => {
    const { data } = await sb.from('phone_numbers').select('id, phone_display').ilike('phone', `%${val.replace(/\s/g,'')}%`).limit(10);
    dropdown.innerHTML = '';
    (data || []).forEach(n => {
      const div = document.createElement('div');
      div.className = 'search-dropdown-item';
      div.textContent = n.phone_display;
      div.onclick = () => {
        document.getElementById('manualPhone').dataset.phoneId = n.id;
        document.getElementById('manualPhone').value = n.phone_display;
        dropdown.innerHTML = '';
      };
      dropdown.appendChild(div);
    });
  }, 300);
}

async function doManualAssign() {
  const phoneInput = document.getElementById('manualPhone');
  const phoneId = phoneInput.dataset.phoneId;
  const workerId = document.getElementById('manualWorker').value;
  if (!phoneId) { showToast('Nömrə seçin.', 'error'); return; }
  if (!workerId) { showToast('İşçi seçin.', 'error'); return; }
  const { error } = await sb.from('phone_numbers').update({ assigned_to: workerId }).eq('id', phoneId);
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Nömrə təyin edildi!', 'success');
  phoneInput.value = '';
  phoneInput.dataset.phoneId = '';
  document.getElementById('phoneSearchResults').innerHTML = '';
  loadDistributeInfo();
}

// ============================================================
// MY NUMBERS (Worker)
// ============================================================
let myNumbers = [];
let myFilteredNumbers = [];
let myCurrentPage = 1;

async function loadMyNumbers() {
  document.getElementById('myNumbersList').innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Yüklənir...</div>';
  const { data } = await sb.from('phone_numbers')
    .select('*')
    .eq('assigned_to', currentProfile.id)
    .order('next_contact_date', { ascending: true, nullsFirst: false });
  myNumbers = data || [];
  document.getElementById('myNumbersCount').textContent = myNumbers.length;
  applyWorkerFilters();
  loadWorkerReminders();
}

function applyWorkerFilters() {
  const phone = document.getElementById('myFilterPhone').value.trim().toLowerCase();
  const status = document.getElementById('myFilterStatus').value;

  myFilteredNumbers = myNumbers.filter(n => {
    if (phone && !n.phone_display.toLowerCase().includes(phone)) return false;
    // Special "uncontacted" filter - show numbers with no real contact
    if (status === '__uncontacted__') {
      return UNCONTACTED_STATUSES.includes(n.status);
    }
    if (status && n.status !== status) return false;
    return true;
  });
  myCurrentPage = 1;
  renderMyNumbers();
}

function renderMyNumbers() {
  const start = (myCurrentPage - 1) * PAGE_SIZE;
  const pageData = myFilteredNumbers.slice(start, start + PAGE_SIZE);
  const container = document.getElementById('myNumbersList');
  if (!pageData.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-phone-slash"></i><p>Nömrə tapılmadı</p></div>';
    return;
  }
  let html = '';
  pageData.forEach(n => {
    const statusClass = 'status-' + n.status.replace(/ /g, '-');
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = n.next_contact_date && n.next_contact_date <= today;
    const isUncontacted = UNCONTACTED_STATUSES.includes(n.status);
    html += `<div class="number-card ${statusClass}${isUncontacted ? ' uncontacted' : ''}" id="card-${n.id}">
      <div class="number-card-header" onclick="toggleCardExtra('${n.id}')">
        <span class="number-card-phone"><i class="fas fa-phone" style="font-size:0.8rem;opacity:0.6;margin-right:0.35rem"></i>${escHtml(n.phone_display)}</span>
        <div class="number-card-meta">
          ${renderStatusBadge(n.status)}
          ${n.next_contact_date ? `<span class="next-contact-info ${isOverdue ? 'overdue' : ''}"><i class="fas fa-bell"></i> ${formatDate(n.next_contact_date)}</span>` : ''}
          <i class="fas fa-chevron-down" id="chevron-${n.id}" style="color:var(--gray-400);font-size:0.8rem;transition:transform 0.2s"></i>
        </div>
      </div>
      <div class="number-card-actions">
        <a href="tel:${n.phone}" class="btn btn-outline btn-sm call-btn">
          <i class="fas fa-phone"></i> Zəng
        </a>
        <a href="https://wa.me/994${waPhone(n.phone)}" target="_blank" class="btn btn-whatsapp btn-sm" onclick="logAction('${n.id}','WhatsApp-dan əlaqə saxladı')">
          <i class="fab fa-whatsapp"></i> WhatsApp
        </a>
        ${STATUSES.filter(s => s !== 'Yeni' && s !== 'Danışılır').map(s =>
          `<button class="btn btn-xs ${statusBtnClass(s)} ${n.status === s ? 'btn-active' : ''}" 
            onclick="changeStatus('${n.id}','${s}')"
            title="${s}"
            style="${n.status === s ? 'opacity:0.6;cursor:default' : ''}">
            <i class="${STATUS_ICONS[s]}"></i> ${s}
          </button>`
        ).join('')}
      </div>
      <div class="number-card-extra" id="extra-${n.id}">
        <div class="form-group">
          <label><i class="fas fa-calendar"></i> Növbəti əlaqə tarixi</label>
          <div style="display:flex;gap:0.5rem">
            <input type="date" id="nextDate-${n.id}" value="${n.next_contact_date || ''}" style="flex:1" />
            <button class="btn btn-primary btn-sm" onclick="saveNextDate('${n.id}')">Saxla</button>
            ${n.next_contact_date ? `<button class="btn btn-ghost btn-sm" onclick="clearNextDate('${n.id}')"><i class="fas fa-times"></i></button>` : ''}
          </div>
        </div>
        <div class="form-group">
          <label><i class="fas fa-sticky-note"></i> Qeyd əlavə et</label>
          <div style="display:flex;gap:0.5rem">
            <textarea id="noteText-${n.id}" rows="2" placeholder="Qeyd yazın..." style="flex:1"></textarea>
            <button class="btn btn-primary btn-sm" onclick="saveNote('${n.id}')"><i class="fas fa-save"></i></button>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="openNumberDetail('${n.id}')">
          <i class="fas fa-history"></i> Tarixçəyə bax
        </button>
      </div>
    </div>`;
  });
  container.innerHTML = html;
  renderPagination('myNumbersPagination', myFilteredNumbers.length, myCurrentPage, (p) => { myCurrentPage = p; renderMyNumbers(); });
}

function toggleCardExtra(id) {
  const extra = document.getElementById('extra-' + id);
  const chevron = document.getElementById('chevron-' + id);
  extra.classList.toggle('open');
  chevron.style.transform = extra.classList.contains('open') ? 'rotate(180deg)' : '';
}

function statusBtnClass(status) {
  const map = {
    'Cavab vermədi': 'btn-ghost',
    'Nömrə işləmir': 'btn-danger',
    'Razı olmadı': 'btn-ghost',
    'Gələcəkdə ala bilər': 'btn-warning',
    'Maraqlanır': 'btn-outline',
    'Müştəri oldu': 'btn-success',
    'Danışılır': 'btn-ghost'
  };
  return map[status] || 'btn-ghost';
}

async function changeStatus(phoneId, newStatus) {
  const { error } = await sb.from('phone_numbers').update({ status: newStatus }).eq('id', phoneId);
  if (error) { showToast(error.message, 'error'); return; }
  await logAction(phoneId, `Status dəyişdirildi: ${newStatus}`);
  showToast(`Status: ${newStatus}`, 'success');
  const idx = myNumbers.findIndex(n => n.id === phoneId);
  if (idx !== -1) myNumbers[idx].status = newStatus;
  applyWorkerFilters();
}

async function logAction(phoneId, action, note = null) {
  await sb.from('contact_history').insert({
    phone_id: phoneId,
    worker_id: currentProfile.id,
    action,
    note
  });
}

async function saveNote(phoneId) {
  const content = document.getElementById('noteText-' + phoneId).value.trim();
  if (!content) { showToast('Qeyd boş ola bilməz.', 'error'); return; }
  const { error } = await sb.from('notes').insert({
    phone_id: phoneId,
    worker_id: currentProfile.id,
    content
  });
  if (error) { showToast(error.message, 'error'); return; }
  await logAction(phoneId, 'Qeyd əlavə edildi', content);
  showToast('Qeyd saxlandı!', 'success');
  document.getElementById('noteText-' + phoneId).value = '';
}

async function saveNextDate(phoneId) {
  const date = document.getElementById('nextDate-' + phoneId).value;
  const { error } = await sb.from('phone_numbers').update({ next_contact_date: date || null }).eq('id', phoneId);
  if (error) { showToast(error.message, 'error'); return; }
  if (date) await logAction(phoneId, `Növbəti əlaqə tarixi: ${formatDate(date)}`);
  showToast('Tarix saxlandı!', 'success');
  const idx = myNumbers.findIndex(n => n.id === phoneId);
  if (idx !== -1) myNumbers[idx].next_contact_date = date || null;
  applyWorkerFilters();
}

async function clearNextDate(phoneId) {
  await sb.from('phone_numbers').update({ next_contact_date: null }).eq('id', phoneId);
  showToast('Tarix silindi.', 'success');
  const idx = myNumbers.findIndex(n => n.id === phoneId);
  if (idx !== -1) myNumbers[idx].next_contact_date = null;
  applyWorkerFilters();
}

async function loadWorkerReminders() {
  const today = new Date().toISOString().split('T')[0];
  const dueDates = myNumbers.filter(n => n.next_contact_date && n.next_contact_date <= today);
  const el = document.getElementById('workerReminders');
  if (!dueDates.length) { el.style.display = 'none'; return; }
  let html = `<h4><i class="fas fa-bell"></i> Xatırlatmalar (${dueDates.length})</h4>`;
  dueDates.forEach(n => {
    const isOverdue = n.next_contact_date < today;
    html += `<div class="reminder-item">
      <span class="reminder-phone">${escHtml(n.phone_display)}</span>
      <span class="reminder-date ${isOverdue ? 'overdue' : ''}">${formatDate(n.next_contact_date)}</span>
    </div>`;
  });
  el.innerHTML = html;
  el.style.display = 'block';
}

// ============================================================
// REMINDERS (Worker)
// ============================================================
async function loadReminders() {
  const today = new Date().toISOString().split('T')[0];
  const query = currentProfile.role === 'admin'
    ? sb.from('phone_numbers').select('*, profiles!assigned_to(full_name,email)').not('next_contact_date','is',null).lte('next_contact_date', today)
    : sb.from('phone_numbers').select('*').eq('assigned_to', currentProfile.id).not('next_contact_date','is',null).lte('next_contact_date', today);

  const { data } = await query.order('next_contact_date', { ascending: true });
  const container = document.getElementById('remindersList');
  if (!data || !data.length) {
    container.innerHTML = '<p class="text-muted" style="padding:1.5rem;text-align:center"><i class="fas fa-check-circle" style="color:var(--success);margin-right:0.5rem"></i>Aktiv xatırlatma yoxdur.</p>';
    return;
  }
  let html = `<table><thead><tr><th>Nömrə</th><th>Status</th>${currentProfile.role === 'admin' ? '<th>İşçi</th>' : ''}<th>Tarix</th><th></th></tr></thead><tbody>`;
  data.forEach(n => {
    const worker = n.profiles ? (n.profiles.full_name || n.profiles.email) : '';
    html += `<tr>
      <td><strong>${escHtml(n.phone_display)}</strong></td>
      <td>${renderStatusBadge(n.status)}</td>
      ${currentProfile.role === 'admin' ? `<td>${escHtml(worker)}</td>` : ''}
      <td><span style="color:var(--danger);font-size:0.8rem"><i class="fas fa-calendar"></i> ${formatDate(n.next_contact_date)}</span></td>
      <td><button class="btn btn-ghost btn-xs" onclick="openNumberDetail('${n.id}')"><i class="fas fa-eye"></i></button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ============================================================
// NUMBER DETAIL MODAL
// ============================================================
async function openNumberDetail(phoneId) {
  openModal('modalNumberDetail');
  document.getElementById('modalDetailBody').innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';

  const [{ data: phone }, { data: history }, { data: notes }] = await Promise.all([
    sb.from('phone_numbers').select('*, profiles!assigned_to(full_name, email)').eq('id', phoneId).single(),
    sb.from('contact_history').select('*, profiles!worker_id(full_name, email)').eq('phone_id', phoneId).order('created_at', { ascending: false }),
    sb.from('notes').select('*, profiles!worker_id(full_name, email)').eq('phone_id', phoneId).order('created_at', { ascending: false })
  ]);

  if (!phone) { document.getElementById('modalDetailBody').innerHTML = '<p>Nömrə tapılmadı.</p>'; return; }
  document.getElementById('modalDetailPhone').textContent = phone.phone_display;

  const isAdmin = currentProfile.role === 'admin';
  const canEdit = isAdmin || phone.assigned_to === currentProfile.id;
  const workerName = phone.profiles ? (phone.profiles.full_name || phone.profiles.email) : 'Yoxdur';

  let html = `
    <div class="detail-tabs">
      <div class="detail-tab active" onclick="switchTab(this,'tab-info')">Məlumat</div>
      <div class="detail-tab" onclick="switchTab(this,'tab-history')">Tarixçə (${(history||[]).length})</div>
      <div class="detail-tab" onclick="switchTab(this,'tab-notes')">Qeydlər (${(notes||[]).length})</div>
    </div>

    <div id="tab-info" class="detail-tab-content active">
      <div style="display:grid;gap:0.75rem;margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">Nömrə:</span><strong>${escHtml(phone.phone_display)}</strong></div>
        <div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--gray-500)">Status:</span>${renderStatusBadge(phone.status)}</div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">İşçi:</span><strong>${escHtml(workerName)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">Əlavə tarixi:</span><span>${formatDateTime(phone.created_at)}</span></div>
        ${phone.next_contact_date ? `<div style="display:flex;justify-content:space-between"><span style="color:var(--gray-500)">Növbəti əlaqə:</span><span style="color:var(--warning)"><i class="fas fa-bell"></i> ${formatDate(phone.next_contact_date)}</span></div>` : ''}
      </div>
      ${canEdit ? `
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <a href="tel:${phone.phone}" class="btn btn-outline btn-sm"><i class="fas fa-phone"></i> Zəng et</a>
        <a href="https://wa.me/994${waPhone(phone.phone)}" target="_blank" class="btn btn-whatsapp btn-sm"><i class="fab fa-whatsapp"></i> WhatsApp</a>
        ${isAdmin ? `<div style="display:flex;gap:0.5rem;flex:1;min-width:200px">
          <select id="detailStatus" style="flex:1;padding:0.4rem;border:1px solid var(--gray-200);border-radius:var(--radius)">
            ${STATUSES.map(s => `<option value="${s}" ${phone.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="updateStatusFromDetail('${phoneId}')">Dəyiş</button>
        </div>` : ''}
      </div>` : ''}
    </div>

    <div id="tab-history" class="detail-tab-content">
      <ul class="history-list">
        ${(history||[]).length ? (history||[]).map(h => `
          <li class="history-item">
            <div class="history-dot"></div>
            <div class="history-content">
              <div class="history-action">${escHtml(h.action)}</div>
              ${h.note ? `<div class="history-note">"${escHtml(h.note)}"</div>` : ''}
              <div class="history-meta">${formatDateTime(h.created_at)} — ${h.profiles ? escHtml(h.profiles.full_name || h.profiles.email) : 'Naməlum'}</div>
            </div>
          </li>`).join('') : '<p class="text-muted" style="padding:1rem">Tarixçə yoxdur.</p>'}
      </ul>
    </div>

    <div id="tab-notes" class="detail-tab-content">
      <div class="notes-list">
        ${(notes||[]).length ? (notes||[]).map(n => `
          <div class="note-item">
            <div class="note-content">${escHtml(n.content)}</div>
            <div class="note-meta">${formatDateTime(n.created_at)} — ${n.profiles ? escHtml(n.profiles.full_name || n.profiles.email) : 'Naməlum'}</div>
          </div>`).join('') : '<p class="text-muted">Qeyd yoxdur.</p>'}
      </div>
      ${canEdit ? `
      <div class="form-group mt-2">
        <textarea id="detailNoteText" rows="3" placeholder="Yeni qeyd əlavə edin..."></textarea>
        <button class="btn btn-primary btn-sm mt-2" onclick="saveDetailNote('${phoneId}')"><i class="fas fa-save"></i> Qeyd saxla</button>
      </div>` : ''}
    </div>
  `;
  document.getElementById('modalDetailBody').innerHTML = html;
}

async function updateStatusFromDetail(phoneId) {
  const status = document.getElementById('detailStatus').value;
  await sb.from('phone_numbers').update({ status }).eq('id', phoneId);
  await logAction(phoneId, `Status dəyişdirildi: ${status}`);
  showToast('Status yeniləndi!', 'success');
  openNumberDetail(phoneId);
  if (allNumbers.length) {
    const idx = allNumbers.findIndex(n => n.id === phoneId);
    if (idx !== -1) allNumbers[idx].status = status;
    applyAdminFilters();
  }
}

async function saveDetailNote(phoneId) {
  const content = document.getElementById('detailNoteText').value.trim();
  if (!content) return;
  await sb.from('notes').insert({ phone_id: phoneId, worker_id: currentProfile.id, content });
  await logAction(phoneId, 'Qeyd əlavə edildi', content);
  showToast('Qeyd saxlandı!', 'success');
  openNumberDetail(phoneId);
}

function switchTab(el, tabId) {
  el.closest('.modal-body, .content-section').querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  el.closest('.modal-body, .content-section').querySelectorAll('.detail-tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// ============================================================
// ASSIGN MODAL (Admin quick assign)
// ============================================================
function openAssignModal(phoneId, phoneDisplay) {
  let wOpts = allWorkers.map(w => `<option value="${w.id}">${escHtml(w.full_name || w.email)}</option>`).join('');
  const confirmed = () => {
    const sel = document.getElementById('quickAssignWorker');
    if (!sel.value) { showToast('İşçi seçin.', 'error'); return; }
    sb.from('phone_numbers').update({ assigned_to: sel.value }).eq('id', phoneId).then(() => {
      showToast('Nömrə təyin edildi!', 'success');
      closeModal('modalConfirm');
      loadAdminNumbers();
    });
  };
  document.getElementById('confirmTitle').textContent = 'Nömrə Təyin et';
  document.getElementById('confirmMessage').innerHTML = `
    <p style="margin-bottom:0.75rem"><strong>${escHtml(phoneDisplay)}</strong> nömrəsini hansı işçiyə təyin etmək istəyirsiniz?</p>
    <select id="quickAssignWorker" style="width:100%;padding:0.5rem;border:1px solid var(--gray-200);border-radius:var(--radius)">
      <option value="">İşçi seçin...</option>${wOpts}
    </select>`;
  document.getElementById('confirmOkBtn').textContent = 'Təyin et';
  document.getElementById('confirmOkBtn').className = 'btn btn-primary';
  document.getElementById('confirmOkBtn').onclick = confirmed;
  openModal('modalConfirm');
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function showConfirm(message, onOk, title = 'Təsdiq') {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmOkBtn').textContent = 'Təsdiq et';
  document.getElementById('confirmOkBtn').className = 'btn btn-danger';
  document.getElementById('confirmOkBtn').onclick = () => { closeModal('modalConfirm'); onOk(); };
  openModal('modalConfirm');
}

// Close modals on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  }
});

// ============================================================
// PAGINATION
// ============================================================
function renderPagination(containerId, total, current, onPage) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const el = document.getElementById(containerId);
  if (pages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  html += `<button class="page-btn" ${current===1?'disabled':''} onclick="(${onPage.toString()})(${current-1})"><i class="fas fa-chevron-left"></i></button>`;
  const range = getPageRange(current, pages);
  range.forEach(p => {
    if (p === '...') html += `<span class="page-info">...</span>`;
    else html += `<button class="page-btn ${p===current?'active':''}" onclick="(${onPage.toString()})(${p})">${p}</button>`;
  });
  html += `<button class="page-btn" ${current===pages?'disabled':''} onclick="(${onPage.toString()})(${current+1})"><i class="fas fa-chevron-right"></i></button>`;
  html += `<span class="page-info">${total} nəticə</span>`;
  el.innerHTML = html;
}

function getPageRange(current, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
  if (current <= 4) return [1,2,3,4,5,'...',total];
  if (current >= total - 3) return [1,'...',total-4,total-3,total-2,total-1,total];
  return [1,'...',current-1,current,current+1,'...',total];
}

// ============================================================
// UTILITIES
// ============================================================
function normalizePhone(raw) {
  let p = raw.replace(/\D/g, '');
  if (p.startsWith('994')) p = p.slice(3);
  if (p.startsWith('0')) p = p.slice(1);
  if (p.length !== 9) return null;
  return '0' + p;
}

function formatPhoneDisplay(normalized) {
  if (normalized.length === 10) {
    return `${normalized.slice(0,3)} ${normalized.slice(3,6)} ${normalized.slice(6,8)} ${normalized.slice(8,10)}`;
  }
  return normalized;
}

function waPhone(phone) {
  let p = phone.replace(/\D/g,'');
  if (p.startsWith('0')) p = p.slice(1);
  return p;
}

function renderStatusBadge(status) {
  const cls = 'status-' + status.replace(/ /g, '_');
  const icon = STATUS_ICONS[status] || 'fas fa-circle';
  return `<span class="status-badge ${cls}"><i class="${icon}"></i>${escHtml(status)}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimeout;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#manualPhone') && !e.target.closest('#phoneSearchResults')) {
    const dd = document.getElementById('phoneSearchResults');
    if (dd) dd.innerHTML = '';
  }
});

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
