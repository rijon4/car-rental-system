const { getDb, save } = require('./db');

function daysBetween(start, end) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e - s) / 86400000);
}

function seedIfEmpty() {
  const db = getDb();
  if (db.vehicles.length > 0) return;

  db.vehicles = [
    { id: 'v1', make: 'Toyota', model: 'Corolla', year: 2022, color: 'Silver', licensePlate: 'ABC-1234', vin: '4T1B11HK8RU207431', fuelType: 'Petrol', transmission: 'Automatic', seats: 5, dailyRate: 45, status: 'available', mileageKm: 18420 },
    { id: 'v2', make: 'Honda', model: 'Civic', year: 2021, color: 'Blue', licensePlate: 'XYZ-9876', vin: '2HGFC2F59KH512334', fuelType: 'Petrol', transmission: 'Automatic', seats: 5, dailyRate: 50, status: 'available', mileageKm: 23011 },
    { id: 'v3', make: 'Ford', model: 'Focus', year: 2020, color: 'Red', licensePlate: 'DEF-5566', vin: '1FADP3S29KL334455', fuelType: 'Petrol', transmission: 'Manual', seats: 5, dailyRate: 38, status: 'maintenance', mileageKm: 30210 },
    { id: 'v4', make: 'Toyota', model: 'RAV4', year: 2023, color: 'Black', licensePlate: 'GHI-3344', vin: 'JTJDA3EF8M0123456', fuelType: 'Hybrid', transmission: 'Automatic', seats: 5, dailyRate: 85, status: 'available', mileageKm: 12400 },
    { id: 'v5', make: 'BMW', model: '3 Series', year: 2019, color: 'White', licensePlate: 'JKL-7788', vin: 'WBA8E9G51JNA23456', fuelType: 'Petrol', transmission: 'Automatic', seats: 5, dailyRate: 120, status: 'rented', mileageKm: 45120 },
    { id: 'v6', make: 'Honda', model: 'CR-V', year: 2022, color: 'Gray', licensePlate: 'MNO-2233', vin: '2HKRW2H59NH556677', fuelType: 'Hybrid', transmission: 'Automatic', seats: 5, dailyRate: 95, status: 'available', mileageKm: 16780 },
    { id: 'v7', make: 'Nissan', model: 'Altima', year: 2018, color: 'Silver', licensePlate: 'PQR-4455', vin: '1N4AL2AP4JC667788', fuelType: 'Petrol', transmission: 'Automatic', seats: 5, dailyRate: 42, status: 'retired', mileageKm: 58990 },
    { id: 'v8', make: 'Hyundai', model: 'Elantra', year: 2023, color: 'Blue', licensePlate: 'STU-8899', vin: 'KM8JBC11DU1234567', fuelType: 'Petrol', transmission: 'Automatic', seats: 5, dailyRate: 48, status: 'available', mileageKm: 9800 },
  ];

  db.customers = [
    { id: 'c1', firstName: 'John', lastName: 'Doe', email: 'john.doe@email.com', phone: '+1 555-0101', licenseNumber: 'DL-1001', licenseExpiry: '2028-04-15', licenseClass: 'B', dob: '1985-06-12', drivingYears: 12 },
    { id: 'c2', firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@email.com', phone: '+1 555-0102', licenseNumber: 'DL-1002', licenseExpiry: '2027-09-30', licenseClass: 'B', dob: '1990-01-22', drivingYears: 9 },
    { id: 'c3', firstName: 'Michael', lastName: 'Brown', email: 'michael.b@email.com', phone: '+1 555-0103', licenseNumber: 'DL-1003', licenseExpiry: '2026-12-01', licenseClass: 'C', dob: '1978-11-05', drivingYears: 20 },
    { id: 'c4', firstName: 'Emily', lastName: 'Davis', email: 'emily.davis@email.com', phone: '+1 555-0104', licenseNumber: 'DL-1004', licenseExpiry: '2029-02-18', licenseClass: 'B', dob: '1992-03-30', drivingYears: 7 },
    { id: 'c5', firstName: 'David', lastName: 'Wilson', email: 'david.wilson@email.com', phone: '+1 555-0105', licenseNumber: 'DL-1005', licenseExpiry: '2026-08-22', licenseClass: 'B', dob: '1988-09-14', drivingYears: 15 },
    { id: 'c6', firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.j@email.com', phone: '+1 555-0106', licenseNumber: 'DL-1006', licenseExpiry: '2030-01-05', licenseClass: 'B', dob: '1995-12-01', drivingYears: 5 },
  ];

  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const iso = (d) => d.toISOString();
  const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

  db.rentals = [
    {
      id: 'r1', vehicleId: 'v5', customerId: 'c1',
      startDate: fmt(addDays(-12)), endDate: fmt(addDays(3)),
      pickupLocation: 'Downtown Office', dropoffLocation: 'Downtown Office',
      status: 'active', days: 16, ratePerDay: 120, baseAmount: 1920, taxRate: 0.08, taxAmount: 153.6, discountAmount: 0, totalAmount: 2073.6,
      paidAmount: 0, checkinKm: 45120, checkoutKm: null,
      lateFee: 0, damageCharges: [], actualReturnDate: null, createdAt: iso(addDays(-20)), updatedAt: iso(addDays(-2)),
    },
    {
      id: 'r2', vehicleId: 'v2', customerId: 'c3',
      startDate: fmt(addDays(-40)), endDate: fmt(addDays(-24)),
      pickupLocation: 'Airport', dropoffLocation: 'Airport',
      status: 'completed', days: 16, ratePerDay: 50, baseAmount: 800, taxAmount: 64, discountAmount: 0, totalAmount: 864,
      paidAmount: 864, checkinKm: 23011, checkoutKm: 24880,
      lateFee: 0, damageCharges: [], actualReturnDate: fmt(addDays(-24)), createdAt: iso(addDays(-50)), updatedAt: iso(addDays(-24)),
    },
    {
      id: 'r3', vehicleId: 'v6', customerId: 'c5',
      startDate: fmt(addDays(5)), endDate: fmt(addDays(12)),
      pickupLocation: 'Downtown Office', dropoffLocation: 'Downtown Office',
      status: 'pending', days: 7, ratePerDay: 95, baseAmount: 665, taxAmount: 53.2, discountAmount: 0, totalAmount: 718.2,
      paidAmount: 0, checkinKm: null, checkoutKm: null,
      lateFee: 0, damageCharges: [], actualReturnDate: null, createdAt: iso(addDays(-2)), updatedAt: iso(addDays(-2)),
    },
  ];

  db.payments = [
    { id: 'p1', rentalId: 'r2', amount: 864, method: 'credit_card', status: 'paid', paidAt: iso(addDays(-24)), reference: 'PAY-9001', rentalTotal: 864 },
  ];

  db.logs = [
    { id: 'l1', rentalId: 'r1', ts: iso(addDays(-2)), type: 'info', message: 'Rental r1 started (vehicle v5 checked out to customer c1)' },
    { id: 'l2', rentalId: 'r2', ts: iso(addDays(-24)), type: 'info', message: 'Rental r2 completed - vehicle v2 returned' },
    { id: 'l3', rentalId: 'r3', ts: iso(addDays(-2)), type: 'info', message: 'Rental r3 created (pending)' },
  ];

  save(db);
}

module.exports = { seedIfEmpty, daysBetween };
