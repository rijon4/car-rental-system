// AutoClip Car Rental System - Frontend

const API = '/api';
let token = localStorage.getItem('crm_token') || '';
let currentUser = null;

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtMoney(n) { const v = Number(n || 0); return '$' + v.toFixed(2); }
function fmtDate(s) { return s || '—'; }
function todayStr() { const d = new Date(); return d.toISOString().slice(0, 10); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  localStorage.removeItem('crm_token');
  token = '';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
  currentUser = null;
}

// ---------- View switching ----------
const VIEWS = ['dashboard', 'vehicles', 'customers', 'rentals', 'reports'];
async function setView(name) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector('.nav-item[data-view="' + name + '"]');
  if (btn) btn.classList.add('active');
  document.getElementById('topbar-title').textContent = name.charAt(0).toUpperCase() + name.slice(1);
  const content = document.getElementById('content');
  content.innerHTML = '';
  if (name === 'dashboard') { content.innerHTML = await renderDashboard(); }
  else if (name === 'vehicles') { content.innerHTML = await renderVehicles(); await loadVehicles(); }
  else if (name === 'customers') { content.innerHTML = await renderCustomers(); await loadCustomers(); }
  else if (name === 'rentals') { content.innerHTML = await renderRentals(); await loadRentals(); }
  else if (name === 'reports') { content.innerHTML = await renderReports(); }
}

// ---------- Login ----------
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    token = data.token;
    localStorage.setItem('crm_token', token);
    currentUser = data.user;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    document.getElementById('topbar-username').textContent = currentUser.name;
    setView('dashboard');
  } catch (e) {
    err.textContent = e.message;
  }
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const summary = await api('/api/reports/summary');
  const activeRentals = await api('/api/rentals?status=active');
  const recent = await api('/api/rentals?status=completed');
  let html = '<div class="page-header"><h2>Dashboard</h2></div>';
  html += '<div class="stats-grid">';
  const t = summary.totals;
  const cards = [
    ['Fleet Size', t.vehicles], ['Available Now', t.available], ['Rented Out', t.rented], ['Maintenance', t.maintenance],
    ['Customers', t.customers], ['Active Rentals', t.activeRentals], ['Revenue (Month)', fmtMoney(summary.revenueThisMonth)], ['Outstanding', fmtMoney(summary.outstanding)],
  ];
  for (const [label, val] of cards) {
    html += `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${val}</div><div class="stat-sub">AutoClip Fleet</div></div>`;
  }
  html += '</div>';
  html += '<div class="two-col">';
  // Active rentals
  html += '<div class="card"><h3>Current Rentals</h3>';
  if (!activeRentals.length) html += '<div class="empty">No active rentals</div>';
  for (const r of activeRentals) {
    const overdue = r.status === 'active' && r.endDate < todayStr();
    html += `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:10px;">
      <div class="row" style="justify-content:space-between;">
        <b>Rental ${r.id}</b>
        <span class="badge ${overdue ? 'badge-overdue' : 'badge-active'}">${overdue ? 'OVERDUE' : 'ACTIVE'}</span>
      </div>
      <div class="muted mt">Vehicle: ${r.vehicle ? r.vehicle.make + ' ' + r.vehicle.model + ' (' + r.vehicle.licensePlate + ')' : ''} &nbsp;|&nbsp; Customer: ${r.customer ? r.customer.firstName + ' ' + r.customer.lastName : ''}</div>
      <div class="muted">Dates: ${r.startDate} → ${r.endDate} &nbsp;|&nbsp; Days: ${r.days} &nbsp;|&nbsp; Total: ${fmtMoney(r.totalAmount)}</div>
      <div class="muted">Paid: ${fmtMoney(r.paidAmount)} &nbsp;|&nbsp; Balance: ${fmtMoney(r.outstanding || r.totalAmount - (r.paidAmount || 0))}</div>
    </div>`;
  }
  html += '</div>';
  // Recent completed
  html += '<div class="card"><h3>Recent Completed Rentals</h3>';
  html += '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Customer</th><th>Vehicle</th><th>Return Date</th><th>Total</th><th>Paid</th></tr></thead><tbody>';
  for (const r of recent.slice(0, 5)) {
    html += `<tr><td>${r.id}</td><td>${r.customer ? r.customer.firstName + ' ' + r.customer.lastName : ''}</td><td>${r.vehicle ? r.vehicle.make + ' ' + r.vehicle.model : ''}</td><td>${fmtDate(r.actualReturnDate)}</td><td class="money">${fmtMoney(r.totalDue || r.totalAmount)}</td><td class="money">${fmtMoney(r.paidAmount)}</td></tr>`;
  }
  html += '</tbody></table></div></div>';
  html += '</div>';
  return html;
}

// ---------- Fleet (Vehicles) ----------
async function renderVehicles() {
  const vehicles = await api('/api/vehicles');
  let html = '<div class="page-header"><h2>Fleet Management</h2><button class="btn btn-primary" onclick="openVehicleModal()">+ Add Vehicle</button></div>';
  html += '<div class="toolbar"><input type="text" id="vehicle-search" class="search" placeholder="Search make, model, plate, VIN, color..."><select id="vehicle-status-filter"><option value="">All Status</option><option value="available">Available</option><option value="rented">Rented</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select></div>';
  html += '<div class="card"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Vehicle</th><th>Year</th><th>Color</th><th>Plate</th><th>VIN</th><th>Fuel</th><th>Trans</th><th>Seats</th><th>Rate/Day</th><th>Status</th><th>Mileage</th><th>Actions</th></tr></thead><tbody id="vehicle-tbody"></tbody></table></div></div>';
  return html;
}

async function loadVehicles() {
  const q = document.getElementById('vehicle-search').value.trim().toLowerCase();
  const status = document.getElementById('vehicle-status-filter').value;
  let list = await api('/api/vehicles');
  if (status) list = list.filter(v => v.status === status);
  if (q) list = list.filter(v => [v.make, v.model, v.color, v.licensePlate, v.vin, String(v.year)].some(x => x && String(x).toLowerCase().includes(q)));
  const tbody = document.getElementById('vehicle-tbody');
  tbody.innerHTML = '';
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="13" class="empty">No vehicles found</td></tr>'; return; }
  for (const v of list) {
    const tr = document.createElement('tr');
    const td = (txt, cls) => { const t = document.createElement('td'); if (cls) t.className = cls; t.textContent = txt; return t; };
    tr.appendChild(td(v.id));
    tr.appendChild(td(v.year + ' ' + v.make + ' ' + v.model));
    tr.appendChild(td(v.year));
    tr.appendChild(td(v.color));
    tr.appendChild(td(v.licensePlate));
    tr.appendChild(td(v.vin));
    tr.appendChild(td(v.fuelType));
    tr.appendChild(td(v.transmission));
    tr.appendChild(td(String(v.seats)));
    tr.appendChild(td(fmtMoney(v.dailyRate), 'money'));
    const bs = document.createElement('span');
    bs.className = 'badge badge-' + v.status;
    bs.textContent = v.status;
    tr.appendChild(bs);
    tr.appendChild(td(String(v.mileageKm)));
    const actions = document.createElement('td');
    const editBtn = document.createElement('button'); editBtn.className = 'btn btn-outline btn-sm'; editBtn.textContent = 'Edit'; editBtn.onclick = () => openVehicleModal(v.id);
    const delBtn = document.createElement('button'); delBtn.className = 'btn btn-danger btn-sm'; delBtn.textContent = 'Delete'; delBtn.onclick = () => deleteVehicle(v.id);
    actions.appendChild(editBtn); actions.appendChild(delBtn);
    tr.appendChild(actions);
    tbody.appendChild(tr);
  }
}

async function openVehicleModal(id) {
  const isEdit = id;
  document.getElementById('vehicle-modal-title').textContent = isEdit ? 'Edit Vehicle' : 'Add Vehicle';
  const v = isEdit ? await api('/api/vehicles/' + id) : null;
  document.getElementById('vehicle-form').dataset.id = isEdit ? id : '';
  setVal('v-make', v ? v.make : '');
  setVal('v-model', v ? v.model : '');
  setVal('v-year', v ? v.year : new Date().getFullYear());
  setVal('v-color', v ? v.color : '');
  setVal('v-plate', v ? v.licensePlate : '');
  setVal('v-vin', v ? v.vin : '');
  setVal('v-fuel', v ? v.fuelType : 'Petrol');
  setVal('v-trans', v ? v.transmission : 'Automatic');
  setVal('v-seats', v ? v.seats : 5);
  setVal('v-rate', v ? v.dailyRate : 50);
  setVal('v-status', v ? v.status : 'available');
  setVal('v-mileage', v ? v.mileageKm : 0);
  document.getElementById('vehicle-modal').style.display = 'flex';
}
async function saveVehicle() {
  const body = {
    make: document.getElementById('v-make').value, model: document.getElementById('v-model').value,
    year: document.getElementById('v-year').value, color: document.getElementById('v-color').value,
    licensePlate: document.getElementById('v-plate').value, vin: document.getElementById('v-vin').value,
    fuelType: document.getElementById('v-fuel').value, transmission: document.getElementById('v-trans').value,
    seats: document.getElementById('v-seats').value, dailyRate: document.getElementById('v-rate').value,
    status: document.getElementById('v-status').value, mileageKm: document.getElementById('v-mileage').value,
  };
  const id = document.getElementById('vehicle-form').dataset.id;
  try {
    if (id) await api('/api/vehicles/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/vehicles', { method: 'POST', body: JSON.stringify(body) });
    toast('Vehicle saved');
    document.getElementById('vehicle-modal').style.display = 'none';
    loadVehicles();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteVehicle(id) {
  if (!confirm('Delete this vehicle?')) return;
  try { await api('/api/vehicles/' + id, { method: 'DELETE' }); toast('Vehicle deleted'); loadVehicles(); }
  catch (e) { toast(e.message, 'error'); }
}

// ---------- Customers ----------
async function renderCustomers() {
  const customers = await api('/api/customers');
  let html = '<div class="page-header"><h2>Customers</h2><button class="btn btn-primary" onclick="openCustomerModal()">+ Add Customer</button></div>';
  html += '<div class="toolbar"><input type="text" id="customer-search" class="search" placeholder="Search name, email, phone, license..."><div class="muted">Total customers: ' + customers.length + '</div></div>';
  html += '<div class="card"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>License #</th><th>Expiry</th><th>Class</th><th>Driving Yrs</th><th>Actions</th></tr></thead><tbody id="customer-tbody"></tbody></table></div></div>';
  return html;
}

async function loadCustomers() {
  const q = document.getElementById('customer-search').value.trim().toLowerCase();
  let list = await api('/api/customers');
  if (q) list = list.filter(c => [c.firstName, c.lastName, c.email, c.phone, c.licenseNumber].some(x => x && String(x).toLowerCase().includes(q)));
  const tbody = document.getElementById('customer-tbody');
  tbody.innerHTML = '';
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty">No customers found</td></tr>'; return; }
  for (const c of list) {
    const tr = document.createElement('tr');
    const td = (txt) => { const t = document.createElement('td'); t.textContent = txt; return t; };
    tr.appendChild(td(c.id));
    tr.appendChild(td(c.firstName + ' ' + c.lastName));
    tr.appendChild(td(c.email)); tr.appendChild(td(c.phone)); tr.appendChild(td(c.licenseNumber));
    tr.appendChild(td(c.licenseExpiry)); tr.appendChild(td(c.licenseClass)); tr.appendChild(td(String(c.drivingYears)));
    const actions = document.createElement('td');
    const editBtn = document.createElement('button'); editBtn.className = 'btn btn-outline btn-sm'; editBtn.textContent = 'Edit'; editBtn.onclick = () => openCustomerModal(c.id);
    const delBtn = document.createElement('button'); delBtn.className = 'btn btn-danger btn-sm'; delBtn.textContent = 'Delete'; delBtn.onclick = () => deleteCustomer(c.id);
    actions.appendChild(editBtn); actions.appendChild(delBtn);
    tr.appendChild(actions);
    tbody.appendChild(tr);
  }
}

function openCustomerModal(id) {
  document.getElementById('customer-modal-title').textContent = id ? 'Edit Customer' : 'Add Customer';
  document.getElementById('customer-form').dataset.id = id || '';
  setVal('cu-first', ''); setVal('cu-last', ''); setVal('cu-email', ''); setVal('cu-phone', ''); setVal('cu-lic', ''); setVal('cu-exp', ''); setVal('cu-class', 'B'); setVal('cu-dob', ''); setVal('cu-drv', 0);
  if (id) {
    api('/api/customers/' + id).then(c => {
      setVal('cu-first', c.firstName); setVal('cu-last', c.lastName); setVal('cu-email', c.email); setVal('cu-phone', c.phone); setVal('cu-lic', c.licenseNumber); setVal('cu-exp', c.licenseExpiry); setVal('cu-class', c.licenseClass); setVal('cu-dob', c.dob); setVal('cu-drv', c.drivingYears);
    });
  }
  document.getElementById('customer-modal').style.display = 'flex';
}
function setVal(id, val) { document.getElementById(id).value = val === null || val === undefined ? '' : val; }
async function saveCustomer() {
  const body = { firstName: document.getElementById('cu-first').value, lastName: document.getElementById('cu-last').value, email: document.getElementById('cu-email').value, phone: document.getElementById('cu-phone').value, licenseNumber: document.getElementById('cu-lic').value, licenseExpiry: document.getElementById('cu-exp').value, licenseClass: document.getElementById('cu-class').value, dob: document.getElementById('cu-dob').value, drivingYears: document.getElementById('cu-drv').value };
  const id = document.getElementById('customer-form').dataset.id;
  try {
    if (id) await api('/api/customers/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/customers', { method: 'POST', body: JSON.stringify(body) });
    toast('Customer saved');
    document.getElementById('customer-modal').style.display = 'none';
    loadCustomers();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteCustomer(id) { if (!confirm('Delete this customer?')) return; try { await api('/api/customers/' + id, { method: 'DELETE' }); toast('Customer deleted'); loadCustomers(); } catch (e) { toast(e.message, 'error'); } }

// ---------- Rentals ----------
async function renderRentals() {
  const rentals = await api('/api/rentals');
  let html = '<div class="page-header"><h2>Rentals & Bookings</h2><button class="btn btn-primary" onclick="openRentalModal()">+ New Rental</button></div>';
  html += '<div class="toolbar"><select id="rental-status-filter"><option value="">All Status</option><option value="active">Active</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>';
  html += '<div class="card"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Customer</th><th>Vehicle</th><th>Dates</th><th>Pickup</th><th>Drop-off</th><th>Days</th><th>Total</th><th>Paid</th><th>Status</th><th>Actions</th></tr></thead><tbody id="rental-tbody"></tbody></table></div></div>';
  return html;
}

async function loadRentals() {
  const status = document.getElementById('rental-status-filter').value;
  let list = await api('/api/rentals');
  if (status) list = list.filter(r => r.status === status);
  const tbody = document.getElementById('rental-tbody');
  tbody.innerHTML = '';
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty">No rentals found</td></tr>'; return; }
  for (const r of list) {
    const tr = document.createElement('tr');
    const td = (txt, cls) => { const t = document.createElement('td'); if (cls) t.className = cls; t.textContent = txt; return t; };
    tr.appendChild(td(r.id));
    tr.appendChild(td(r.customer ? r.customer.firstName + ' ' + r.customer.lastName : ''));
    tr.appendChild(td(r.vehicle ? r.vehicle.make + ' ' + r.vehicle.model + ' (' + r.vehicle.licensePlate + ')' : ''));
    tr.appendChild(td(r.startDate + ' → ' + r.endDate));
    tr.appendChild(td(r.pickupLocation)); tr.appendChild(td(r.dropoffLocation));
    tr.appendChild(td(String(r.days)));
    tr.appendChild(td(fmtMoney(r.totalAmount), 'money'));
    tr.appendChild(td(fmtMoney(r.paidAmount), 'money'));
    const bs = document.createElement('span');
    bs.className = 'badge badge-' + (r.status === 'partially_paid' ? 'pending' : r.status);
    bs.textContent = r.status;
    tr.appendChild(bs);
    const actions = document.createElement('td');
    if (r.status === 'pending' || r.status === 'active') {
      const co = document.createElement('button'); co.className = 'btn btn-outline btn-sm'; co.textContent = 'Checkout'; co.onclick = () => openCheckoutModal(r.id);
      actions.appendChild(co);
    }
    if (r.status === 'active') {
      const ret = document.createElement('button'); ret.className = 'btn btn-success btn-sm'; ret.textContent = 'Return'; ret.onclick = () => openReturnModal(r.id);
      actions.appendChild(ret);
    }
    const pay = document.createElement('button'); pay.className = 'btn btn-outline btn-sm'; pay.textContent = 'Pay'; pay.onclick = () => openPayModal(r.id);
    actions.appendChild(pay);
    const canc = document.createElement('button'); canc.className = 'btn btn-danger btn-sm'; canc.textContent = 'Cancel'; canc.onclick = () => cancelRental(r.id);
    actions.appendChild(canc);
    tr.appendChild(actions);
    tbody.appendChild(tr);
  }
}

async function openRentalModal() {
  const vehicles = await api('/api/vehicles?status=available');
  document.getElementById('rental-vehicle-options').innerHTML = '';
  for (const v of vehicles) {
    const opt = document.createElement('option'); opt.value = v.id; opt.textContent = `${v.year} ${v.make} ${v.model} (${v.licensePlate}) - $${v.dailyRate}/day`; document.getElementById('rental-vehicle-options').appendChild(opt);
  }
  document.getElementById('rental-customer-options').innerHTML = '';
  const customers = await api('/api/customers');
  for (const c of customers) {
    const opt = document.createElement('option'); opt.value = c.id; opt.textContent = `${c.firstName} ${c.lastName} (${c.licenseNumber})`; document.getElementById('rental-customer-options').appendChild(opt);
  }
  setVal('rent-vehicle', vehicles[0] ? vehicles[0].id : '');
  setVal('rent-customer', customers[0] ? customers[0].id : '');
  setVal('rent-start', todayStr());
  setVal('rent-end', ''); setVal('rent-pickup', 'Downtown Office'); setVal('rent-dropoff', 'Downtown Office'); setVal('rent-discount', 0);
  document.getElementById('rental-modal').style.display = 'flex';
}
async function createRental() {
  const vehicleId = document.getElementById('rent-vehicle').value;
  const body = {
    vehicleId, customerId: document.getElementById('rent-customer').value,
    startDate: document.getElementById('rent-start').value, endDate: document.getElementById('rent-end').value,
    pickupLocation: document.getElementById('rent-pickup').value, dropoffLocation: document.getElementById('rent-dropoff').value,
    discountPct: document.getElementById('rent-discount').value,
  };
  try { await api('/api/rentals', { method: 'POST', body: JSON.stringify(body) }); toast('Rental created'); document.getElementById('rental-modal').style.display = 'none'; loadRentals(); }
  catch (e) { toast(e.message, 'error'); }
}
async function openCheckoutModal(id) {
  const r = await api('/api/rentals/' + id);
  document.getElementById('co-id').value = id;
  document.getElementById('co-checkin').value = r.checkinKm || (r.vehicle ? r.vehicle.mileageKm : 0);
  document.getElementById('co-info').textContent = `Rental ${r.id}: ${r.vehicle ? r.vehicle.make + ' ' + r.vehicle.model : ''} → ${r.customer ? r.customer.firstName + ' ' + r.customer.lastName : ''} (${r.startDate} → ${r.endDate})`;
  document.getElementById('checkout-modal').style.display = 'flex';
}
async function doCheckout() {
  const id = document.getElementById('co-id').value;
  const body = { checkinKm: Number(document.getElementById('co-checkin').value) };
  try { await api('/api/rentals/' + id + '/checkout', { method: 'POST', body: JSON.stringify(body) }); toast('Vehicle checked out'); document.getElementById('checkout-modal').style.display = 'none'; loadRentals(); }
  catch (e) { toast(e.message, 'error'); }
}
async function openReturnModal(id) {
  const r = await api('/api/rentals/' + id);
  document.getElementById('ret-id').value = id;
  document.getElementById('ret-date').value = todayStr();
  document.getElementById('ret-km').value = r.checkinKm || (r.vehicle ? r.vehicle.mileageKm : 0);
  document.getElementById('ret-damages').innerHTML = '';
  window._damageRows = [];
  addDamageRow();
  document.getElementById('return-modal').style.display = 'flex';
}
function addDamageRow() {
  const container = document.getElementById('ret-damages');
  const row = document.createElement('div');
  row.className = 'row';
  const desc = document.createElement('input'); desc.placeholder = 'Damage description'; desc.className = 'full';
  const amt = document.createElement('input'); amt.placeholder = 'Amount'; amt.type = 'number'; amt.min = 0; amt.className = 'full';
  const rm = document.createElement('button'); rm.className = 'btn btn-danger btn-sm'; rm.textContent = 'Remove'; rm.onclick = () => row.remove();
  row.appendChild(desc); row.appendChild(amt); row.appendChild(rm);
  container.appendChild(row);
}
async function doReturn() {
  const id = document.getElementById('ret-id').value;
  const damages = Array.from(document.querySelectorAll('#ret-damages .row')).map(row => ({ description: row.querySelector('input').value, amount: Number(row.querySelectorAll('input')[1].value) })).filter(d => d.description && d.amount > 0);
  const body = { actualReturnDate: document.getElementById('ret-date').value, actualReturnKm: Number(document.getElementById('ret-km').value), damageCharges: damages };
  try { const r = await api('/api/rentals/' + id + '/return', { method: 'POST', body: JSON.stringify(body) }); toast('Rental returned. Total due: ' + fmtMoney(r.totalDue)); document.getElementById('return-modal').style.display = 'none'; loadRentals(); }
  catch (e) { toast(e.message, 'error'); }
}
async function openPayModal(id) {
  const r = await api('/api/rentals/' + id);
  document.getElementById('pay-id').value = id;
  document.getElementById('pay-amount').value = r.outstanding || Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0));
  document.getElementById('pay-method').value = 'credit_card';
  document.getElementById('pay-info').textContent = `Rental ${r.id} - Amount due: ${fmtMoney(r.outstanding || Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0)))}`;
  document.getElementById('pay-modal').style.display = 'flex';
}
async function doPay() {
  const id = document.getElementById('pay-id').value;
  const body = { amount: Number(document.getElementById('pay-amount').value), method: document.getElementById('pay-method').value };
  try { const p = await api('/api/rentals/' + id + '/payments', { method: 'POST', body: JSON.stringify(body) }); toast('Payment received: ' + fmtMoney(p.amount)); document.getElementById('pay-modal').style.display = 'none'; loadRentals(); }
  catch (e) { toast(e.message, 'error'); }
}
async function cancelRental(id) { if (!confirm('Cancel this rental?')) return; try { await api('/api/rentals/' + id + '/cancel', { method: 'POST' }); toast('Rental cancelled'); loadRentals(); } catch (e) { toast(e.message, 'error'); } }

// ---------- Reports ----------
async function renderReports() {
  const summary = await api('/api/reports/summary');
  const revenue = await api('/api/reports/revenue?from=1970-01-01&to=' + todayStr());
  let html = '<div class="page-header"><h2>Reports & Analytics</h2></div>';
  html += '<div class="stats-grid">';
  html += `<div class="stat-card"><div class="stat-label">Revenue (All Time)</div><div class="stat-value">${fmtMoney(revenue.revenue)}</div><div class="stat-sub">Completed rentals</div></div>`;
  html += `<div class="stat-card"><div class="stat-label">Revenue (This Month)</div><div class="stat-value">${fmtMoney(summary.revenueThisMonth)}</div><div class="stat-sub">Completed rentals</div></div>`;
  html += `<div class="stat-card"><div class="stat-label">Outstanding Balance</div><div class="stat-value">${fmtMoney(summary.outstanding)}</div><div class="stat-sub">Unpaid rentals</div></div>`;
  html += `<div class="stat-card"><div class="stat-label">Fleet Occupancy</div><div class="stat-value">${summary.occupancyRate}%</div><div class="stat-sub">Rented / total fleet</div></div>`;
  html += `<div class="stat-card"><div class="stat-label">Avg. Rental Days</div><div class="stat-value">${summary.avgRentalDays}</div><div class="stat-sub">Per rental</div></div>`;
  html += '</div>';
  html += '<div class="card"><h3>Revenue by Period</h3>';
  html += '<div class="toolbar">';
  const from = document.createElement('input'); from.type = 'date'; from.id = 'rev-from'; from.value = '1970-01-01';
  const to = document.createElement('input'); to.type = 'date'; to.id = 'rev-to'; to.value = todayStr();
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Get Report';
  btn.onclick = async () => {
    const r = await api('/api/reports/revenue?from=' + from.value + '&to=' + to.value);
    document.getElementById('rev-result').textContent = 'Revenue from ' + from.value + ' to ' + to.value + ': <b>' + fmtMoney(r.revenue) + '</b>';
  };
  html += from.outerHTML + to.outerHTML + btn.outerHTML + '<span id="rev-result" class="muted"></span></div>';
  html += '</div>';
  // Monthly revenue bars (last 6 months)
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  const monthly = {};
  const rentals = await api('/api/rentals');
  for (const r of rentals) { if (r.status === 'completed' && r.actualReturnDate) { const m = r.actualReturnDate.slice(0, 7); monthly[m] = (monthly[m] || 0) + (r.totalDue || r.totalAmount || 0); } }
  html += '<div class="card"><h3>Monthly Revenue (Last 6 Months)</h3>';
  const max = Math.max(1, ...Object.values(monthly));
  let bars = '';
  for (const m of months) { const val = monthly[m] || 0; bars += `<div style="margin-bottom:8px;"><div class="row" style="justify-content:space-between;"><span>${m}</span><span class="money">${fmtMoney(val)}</span></div><div style="background:#e2e8f0;border-radius:4px;height:14px;"><div style="width:${(val / max) * 100}%;background:#2563eb;height:14px;border-radius:4px;"></div></div></div>`; }
  html += bars;
  html += '</div>';
  const logs = await api('/api/logs');
  let logsHtml = '';
  for (const l of logs.slice(0, 10)) { logsHtml += `<tr><td>${String(l.ts || '').slice(0, 10)}</td><td><span class="badge badge-${l.type === 'warning' ? 'cancelled' : l.type}">${l.type}</span></td><td>${l.message}</td></tr>`; }
  html += '<div class="card"><h3>Recent Activity Logs</h3>';
  html += '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Type</th><th>Message</th></tr></thead><tbody>' + logsHtml + '</tbody></table></div></div>';
  return html;
}

// ---------- Modal openers wiring (called from inline onclick via window) ----------
window.openVehicleModal = openVehicleModal;
window.saveVehicle = saveVehicle;
window.deleteVehicle = deleteVehicle;
window.openCustomerModal = openCustomerModal;
window.saveCustomer = saveCustomer;
window.deleteCustomer = deleteCustomer;
window.openRentalModal = openRentalModal;
window.createRental = createRental;
window.openCheckoutModal = openCheckoutModal;
window.doCheckout = doCheckout;
window.openReturnModal = openReturnModal;
window.doReturn = doReturn;
window.openPayModal = openPayModal;
window.doPay = doPay;
window.cancelRental = cancelRental;

// ---------- Wire UI events ----------
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('login-form').addEventListener('submit', async (e) => { e.preventDefault(); await doLogin(); });
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  document.addEventListener('input', (e) => { if (e.target.id === 'vehicle-search') loadVehicles(); if (e.target.id === 'customer-search') loadCustomers(); });
  document.addEventListener('change', (e) => { if (e.target.id === 'vehicle-status-filter') loadVehicles(); if (e.target.id === 'rental-status-filter') loadRentals(); });

  // vehicle modal
  document.getElementById('vehicle-form').addEventListener('submit', (e) => { e.preventDefault(); saveVehicle(); });

  // customer modal
  document.getElementById('customer-form').addEventListener('submit', (e) => { e.preventDefault(); saveCustomer(); });

  // rental modal
  document.getElementById('rental-form').addEventListener('submit', (e) => { e.preventDefault(); createRental(); });

  // checkout modal
  document.getElementById('checkout-form').addEventListener('submit', (e) => { e.preventDefault(); doCheckout(); });

  // return modal
  document.getElementById('return-form').addEventListener('submit', (e) => { e.preventDefault(); doReturn(); });
  document.addEventListener('click', (e) => { if (e.target && e.target.id === 'add-damage') addDamageRow(); });

  // pay modal
  document.getElementById('pay-form').addEventListener('submit', (e) => { e.preventDefault(); doPay(); });

  // expose modal openers globally for inline onclick
  window.loadVehicles = loadVehicles;
  window.loadCustomers = loadCustomers;
  window.loadRentals = loadRentals;

  // restore session
  if (token) {
    try {
      const me = await api('/api/auth/me');
      currentUser = me.user;
      document.getElementById('topbar-username').textContent = currentUser.name;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-shell').style.display = 'flex';
      await setView('dashboard');
    } catch (e) { localStorage.removeItem('crm_token'); token = ''; }
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
});
