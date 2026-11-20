const express = require('express');
const { getDb, save } = require('./db');
const { createSession, destroySession, getSessionUser, ensureUsers } = require('./auth');
const { seedIfEmpty } = require('./seed');

const app = express();
app.use(express.json());
app.use(express.static('public'));
seedIfEmpty();

const db = getDb();
const TAX_RATE = db.settings.taxRate;
const LATE_FEE_PER_DAY = db.settings.lateFeePerDay;
const round2 = (n) => Math.round(n * 100) / 100;

function nowISO() { return new Date().toISOString(); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function log(rentalId, type, message) {
  db.logs.unshift({ id: 'l' + Date.now() + Math.floor(Math.random() * 1000), rentalId, ts: nowISO(), type, message });
}
function saveDb() { save(db); }

function vehicleById(id) { return db.vehicles.find((v) => v.id === id); }
function customerById(id) { return db.customers.find((c) => c.id === id); }
function rentalById(id) { return db.rentals.find((r) => r.id === id); }

function computeTotals(vehicle, startDate, endDate, discountPct) {
  const days = Math.max(0, Math.round((new Date(endDate + 'T00:00:00') - new Date(startDate + 'T00:00:00')) / 86400000));
  const base = days * (vehicle ? vehicle.dailyRate : 0);
  const tax = base * TAX_RATE;
  const discount = (base * (discountPct || 0)) / 100;
  const total = base + tax - discount;
  return { days, baseAmount: round2(base), taxAmount: round2(tax), discountAmount: round2(discount), totalAmount: round2(total) };
}

function validateDateRange(startDate, endDate) {
  const d = /^\d{4}-\d{2}-\d{2}$/;
  if (!d.test(startDate) || !d.test(endDate)) return 'Dates must be in YYYY-MM-DD format';
  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T00:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 'Invalid date';
  if (e <= s) return 'End date must be after start date';
  return null;
}

function overlaps(rental, vehicleId, startDate, endDate) {
  if (rental.vehicleId !== vehicleId) return false;
  if (rental.status !== 'active' && rental.status !== 'pending') return false;
  const s = new Date(startDate + 'T00:00:00').getTime();
  const e = new Date(endDate + 'T00:00:00').getTime();
  const rs = new Date(rental.startDate + 'T00:00:00').getTime();
  const re = new Date(rental.endDate + 'T00:00:00').getTime();
  return s < re && e > rs;
}

// ---------------- Auth ----------------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = (db.users || []).find((u) => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = createSession(user);
  res.json({ token, user });
});
app.post('/api/auth/logout', requireAuth, (req, res) => { destroySession(req.user.token); res.json({ ok: true }); });
app.get('/api/auth/me', requireAuth, (req, res) => { res.json({ user: req.user }); });

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = token && getSessionUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = { ...user, token };
  next();
}
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin only' });
}

// ---------------- Vehicles ----------------
app.get('/api/vehicles', requireAuth, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  let list = db.vehicles.slice().sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));
  if (req.query.status) list = list.filter((v) => v.status === req.query.status);
  if (q) list = list.filter((v) => [v.make, v.model, v.color, v.licensePlate, v.vin, String(v.year)].some((x) => x && String(x).toLowerCase().includes(q)));
  res.json(list);
});

app.get('/api/vehicles/:id', requireAuth, (req, res) => {
  const v = vehicleById(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(v);
});

app.post('/api/vehicles', requireAuth, requireAdmin, (req, res) => {
  const v = req.body || {};
  const errors = [];
  if (!v.make || !v.model) errors.push('Make and model are required');
  if (v.year < 1980 || v.year > new Date().getFullYear() + 1) errors.push('Invalid year');
  if (!v.licensePlate) errors.push('License plate is required');
  if (!v.vin) errors.push('VIN is required');
  if (!v.dailyRate || v.dailyRate <= 0) errors.push('Daily rate must be positive');
  if (!['available', 'rented', 'maintenance', 'retired'].includes(v.status)) errors.push('Invalid status');
  if (db.vehicles.some((x) => x.licensePlate.toLowerCase() === String(v.licensePlate).toLowerCase())) errors.push('License plate already exists');
  if (db.vehicles.some((x) => x.vin.toLowerCase() === String(v.vin).toLowerCase())) errors.push('VIN already exists');
  if (errors.length) return res.status(400).json({ errors });
  const vehicle = { id: 'v' + Date.now(), make: v.make, model: v.model, year: Number(v.year), color: v.color || '', licensePlate: v.licensePlate, vin: v.vin, fuelType: v.fuelType || 'Petrol', transmission: v.transmission || 'Automatic', seats: Number(v.seats) || 5, dailyRate: Number(v.dailyRate), status: v.status, mileageKm: Number(v.mileageKm) || 0 };
  db.vehicles.push(vehicle);
  log(null, 'info', `Vehicle ${vehicle.make} ${vehicle.model} (${vehicle.licensePlate}) added to fleet`);
  saveDb();
  res.status(201).json(vehicle);
});

app.put('/api/vehicles/:id', requireAuth, requireAdmin, (req, res) => {
  const v = vehicleById(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });
  const b = req.body || {};
  if (b.make !== undefined) v.make = b.make;
  if (b.model !== undefined) v.model = b.model;
  if (b.year !== undefined) v.year = Number(b.year);
  if (b.color !== undefined) v.color = b.color;
  if (b.licensePlate !== undefined) v.licensePlate = b.licensePlate;
  if (b.vin !== undefined) v.vin = b.vin;
  if (b.fuelType !== undefined) v.fuelType = b.fuelType;
  if (b.transmission !== undefined) v.transmission = b.transmission;
  if (b.seats !== undefined) v.seats = Number(b.seats);
  if (b.dailyRate !== undefined) v.dailyRate = Number(b.dailyRate);
  if (b.status !== undefined) v.status = b.status;
  if (b.mileageKm !== undefined) v.mileageKm = Number(b.mileageKm);
  saveDb();
  res.json(v);
});

app.delete('/api/vehicles/:id', requireAuth, requireAdmin, (req, res) => {
  const idx = db.vehicles.findIndex((v) => v.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Vehicle not found' });
  const v = db.vehicles[idx];
  if (v.status === 'rented') return res.status(400).json({ error: 'Vehicle is currently rented and cannot be removed' });
  db.vehicles.splice(idx, 1);
  saveDb();
  res.json({ ok: true });
});

// ---------------- Customers ----------------
app.get('/api/customers', requireAuth, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  let list = db.customers.slice().sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  if (q) list = list.filter((c) => [c.firstName, c.lastName, c.email, c.phone, c.licenseNumber].some((x) => x && String(x).toLowerCase().includes(q)));
  res.json(list);
});

app.get('/api/customers/:id', requireAuth, (req, res) => {
  const c = customerById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  res.json(c);
});

app.post('/api/customers', requireAuth, requireAdmin, (req, res) => {
  const c = req.body || {};
  const errors = [];
  if (!c.firstName) errors.push('First name is required');
  if (!c.lastName) errors.push('Last name is required');
  if (!c.email || !/^\S+@\S+\.\S+$/.test(c.email)) errors.push('Valid email is required');
  if (!c.phone) errors.push('Phone number is required');
  if (!c.licenseNumber) errors.push('License number is required');
  if (!c.licenseExpiry) errors.push('License expiry is required');
  if (c.dob && new Date(c.dob) > new Date()) errors.push('Date of birth cannot be in the future');
  if (db.customers.some((x) => x.licenseNumber.toLowerCase() === String(c.licenseNumber).toLowerCase())) errors.push('License number already registered');
  if (errors.length) return res.status(400).json({ errors });
  const customer = { id: 'c' + Date.now(), firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, licenseNumber: c.licenseNumber, licenseExpiry: c.licenseExpiry, licenseClass: c.licenseClass || 'B', dob: c.dob || '', drivingYears: Number(c.drivingYears) || 0 };
  db.customers.push(customer);
  saveDb();
  res.status(201).json(customer);
});

app.put('/api/customers/:id', requireAuth, requireAdmin, (req, res) => {
  const c = customerById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const b = req.body || {};
  if (b.firstName !== undefined) c.firstName = b.firstName;
  if (b.lastName !== undefined) c.lastName = b.lastName;
  if (b.email !== undefined) c.email = b.email;
  if (b.phone !== undefined) c.phone = b.phone;
  if (b.licenseNumber !== undefined) c.licenseNumber = b.licenseNumber;
  if (b.licenseExpiry !== undefined) c.licenseExpiry = b.licenseExpiry;
  if (b.licenseClass !== undefined) c.licenseClass = b.licenseClass;
  if (b.dob !== undefined) c.dob = b.dob;
  if (b.drivingYears !== undefined) c.drivingYears = Number(b.drivingYears);
  saveDb();
  res.json(c);
});

app.delete('/api/customers/:id', requireAuth, requireAdmin, (req, res) => {
  const idx = db.customers.findIndex((c) => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Customer not found' });
  db.customers.splice(idx, 1);
  saveDb();
  res.json({ ok: true });
});

// ---------------- Rentals ----------------
app.get('/api/rentals', requireAuth, (req, res) => {
  let list = db.rentals.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (req.query.status) list = list.filter((r) => r.status === req.query.status);
  if (req.query.customerId) list = list.filter((r) => r.customerId === req.query.customerId);
  if (req.query.vehicleId) list = list.filter((r) => r.vehicleId === req.query.vehicleId);
  res.json(list.map((r) => ({ ...r, vehicle: vehicleById(r.vehicleId), customer: customerById(r.customerId) })));
});

app.get('/api/rentals/:id', requireAuth, (req, res) => {
  const r = rentalById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rental not found' });
  res.json({ ...r, vehicle: vehicleById(r.vehicleId), customer: customerById(r.customerId) });
});

app.post('/api/rentals', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  const vehicle = vehicleById(b.vehicleId);
  const customer = customerById(b.customerId);
  const errors = [];
  if (!vehicle) errors.push('Vehicle not found');
  if (!customer) errors.push('Customer not found');
  const dateErr = validateDateRange(b.startDate, b.endDate);
  if (dateErr) errors.push(dateErr);
  if (vehicle && vehicle.status !== 'available') errors.push('Vehicle is not available for rent');
  if (customer && new Date(customer.licenseExpiry) < new Date(todayStr())) errors.push('Customer license is expired');
  if (!errors.length && vehicle) {
    const clash = db.rentals.find((r) => overlaps(r, vehicle.id, b.startDate, b.endDate));
    if (clash) errors.push(`Vehicle ${vehicle.licensePlate} is already rented during these dates`);
  }
  if (errors.length) return res.status(400).json({ errors });

  const totals = computeTotals(vehicle, b.startDate, b.endDate, Number(b.discountPct) || 0);
  const status = b.startDate <= todayStr() ? 'active' : 'pending';
  const rental = {
    id: 'r' + Date.now(),
    vehicleId: vehicle.id, customerId: customer.id,
    startDate: b.startDate, endDate: b.endDate,
    pickupLocation: b.pickupLocation || 'Downtown Office', dropoffLocation: b.dropoffLocation || 'Downtown Office',
    status, days: totals.days, ratePerDay: vehicle.dailyRate, baseAmount: totals.baseAmount, taxRate: TAX_RATE, taxAmount: totals.taxAmount, discountAmount: totals.discountAmount, totalAmount: totals.totalAmount,
    paidAmount: 0, checkinKm: status === 'active' ? vehicle.mileageKm : null, checkoutKm: null,
    lateFee: 0, damageCharges: [], actualReturnDate: null, createdAt: nowISO(), updatedAt: nowISO(),
  };
  db.rentals.unshift(rental);
  if (status === 'active') vehicle.status = 'rented';
  log(rental.id, 'info', `Rental ${rental.id} created (${vehicle.licensePlate} -> ${customer.lastName} ${customer.firstName})`);
  saveDb();
  res.status(201).json({ ...rental, vehicle, customer });
});

app.post('/api/rentals/:id/checkout', requireAuth, requireAdmin, (req, res) => {
  const r = rentalById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rental not found' });
  if (r.status !== 'active' && r.status !== 'pending') return res.status(400).json({ error: 'Rental cannot be checked out' });
  const vehicle = vehicleById(r.vehicleId);
  const customer = customerById(r.customerId);
  const checkinKm = Number(req.body.checkinKm);
  r.checkinKm = isNaN(checkinKm) ? (vehicle ? vehicle.mileageKm : null) : checkinKm;
  r.checkoutKm = null;
  r.status = 'active';
  if (vehicle) vehicle.status = 'rented';
  r.updatedAt = nowISO();
  log(r.id, 'info', `Rental ${r.id} started - vehicle ${vehicle ? vehicle.licensePlate : ''} checked out to ${customer ? customer.firstName + ' ' + customer.lastName : ''}`);
  saveDb();
  res.json({ ...r, vehicle, customer });
});

app.post('/api/rentals/:id/return', requireAuth, requireAdmin, (req, res) => {
  const r = rentalById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rental not found' });
  if (r.status !== 'active') return res.status(400).json({ error: 'Only active rentals can be returned' });
  const vehicle = vehicleById(r.vehicleId);
  const customer = customerById(r.customerId);
  const actualReturnDate = req.body.actualReturnDate || todayStr();
  const actualReturnKm = Number(req.body.actualReturnKm);
  const damages = Array.isArray(req.body.damageCharges) ? req.body.damageCharges : [];
  const damageTotal = damages.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  const daysLate = Math.max(0, Math.round((new Date(actualReturnDate + 'T00:00:00') - new Date(r.endDate + 'T00:00:00')) / 86400000));
  const lateFee = daysLate * LATE_FEE_PER_DAY;
  const totalDue = round2(r.totalAmount + lateFee + damageTotal);
  const outstanding = round2(Math.max(0, totalDue - (r.paidAmount || 0)));

  r.status = 'completed';
  r.actualReturnDate = actualReturnDate;
  r.lateFee = round2(lateFee);
  r.damageCharges = damages;
  r.totalDue = totalDue;
  r.outstanding = outstanding;
  if (vehicle) {
    vehicle.status = 'available';
    if (!isNaN(actualReturnKm)) vehicle.mileageKm = actualReturnKm;
  }
  r.updatedAt = nowISO();
  log(r.id, 'info', `Rental ${r.id} completed - vehicle ${vehicle ? vehicle.licensePlate : ''} returned`);
  saveDb();
  res.json({ ...r, vehicle, customer });
});

app.post('/api/rentals/:id/cancel', requireAuth, requireAdmin, (req, res) => {
  const r = rentalById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rental not found' });
  if (r.status === 'completed') return res.status(400).json({ error: 'Completed rentals cannot be cancelled' });
  const vehicle = vehicleById(r.vehicleId);
  const customer = customerById(r.customerId);
  r.status = 'cancelled';
  if (vehicle && vehicle.status === 'rented') vehicle.status = 'available';
  r.updatedAt = nowISO();
  log(r.id, 'warning', `Rental ${r.id} cancelled`);
  saveDb();
  res.json({ ...r, vehicle, customer });
});

app.post('/api/rentals/:id/payments', requireAuth, requireAdmin, (req, res) => {
  const r = rentalById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rental not found' });
  const amount = Number(req.body.amount);
  const method = req.body.method || 'credit_card';
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Payment amount must be positive' });
  const payment = { id: 'p' + Date.now(), rentalId: r.id, amount: round2(amount), method, status: 'paid', paidAt: nowISO(), reference: 'PAY-' + Math.floor(1000 + Math.random() * 9000) };
  db.payments.unshift(payment);
  r.paidAmount = round2((r.paidAmount || 0) + amount);
  r.updatedAt = nowISO();
  const totalDue = r.totalDue !== undefined ? r.totalDue : (r.totalAmount + (r.lateFee || 0) + (r.damageCharges || []).reduce((s, d) => s + (Number(d.amount) || 0), 0));
  if ((r.paidAmount || 0) + 1e-9 >= totalDue) r.status = 'paid';
  else r.status = 'partially_paid';
  log(r.id, 'info', `Payment ${payment.id} received (${method}) - ${amount} on rental ${r.id}`);
  saveDb();
  res.json(payment);
});

// ---------------- Reports ----------------
app.get('/api/reports/summary', requireAuth, (req, res) => {
  const active = db.rentals.filter((r) => r.status === 'active');
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthStr = monthStart.toISOString().slice(0, 7);
  const revenueThisMonth = db.rentals.filter((r) => r.status === 'completed' && r.actualReturnDate && r.actualReturnDate.slice(0, 7) === monthStr).reduce((s, r) => s + (r.totalDue || r.totalAmount || 0), 0);
  const outstanding = db.rentals.filter((r) => r.status !== 'cancelled' && r.status !== 'completed' && (r.outstanding || 0) > 0).reduce((s, r) => s + (r.outstanding || 0), 0);
  const fleetSize = db.vehicles.length;
  const availableCount = db.vehicles.filter((v) => v.status === 'available').length;
  const occupancy = fleetSize ? Math.round(((fleetSize - availableCount) / fleetSize) * 100) : 0;
  const rentalCount = db.rentals.length;
  const avgDays = rentalCount ? db.rentals.filter(r => r.status !== 'cancelled').reduce((s, r) => s + (r.days || 0), 0) / Math.max(1, db.rentals.filter(r => r.status !== 'cancelled').length) : 0;
  res.json({
    totals: { vehicles: fleetSize, available: availableCount, rented: db.vehicles.filter(v => v.status === 'rented').length, maintenance: db.vehicles.filter(v => v.status === 'maintenance').length, retired: db.vehicles.filter(v => v.status === 'retired').length, customers: db.customers.length, rentals: rentalCount, activeRentals: active.length },
    revenueThisMonth: round2(revenueThisMonth),
    outstanding: round2(outstanding),
    occupancyRate: occupancy,
    avgRentalDays: round2(avgDays),
  });
});

app.get('/api/reports/revenue', requireAuth, (req, res) => {
  const from = req.query.from || '1970-01-01';
  const to = req.query.to || todayStr();
  const revenue = db.rentals.filter((r) => r.status === 'completed' && r.actualReturnDate >= from && r.actualReturnDate <= to).reduce((s, r) => s + (r.totalDue || r.totalAmount || 0), 0);
  res.json({ from, to, revenue: round2(revenue) });
});

app.get('/api/logs', requireAuth, (req, res) => { res.json(db.logs.slice(0, 200)); });
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

app.listen(3000, () => console.log('Car Rental System running at http://localhost:3000'));
module.exports = app;
