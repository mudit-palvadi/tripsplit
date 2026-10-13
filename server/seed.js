import bcrypt from 'bcryptjs';
import { get, run, transaction } from './db.js';
import { computeSplits } from './ledger.js';

const PASSWORD = 'password';

const people = [
  { name: 'Aarav Sharma', email: 'aarav@demo.com' },
  { name: 'Priya Patel', email: 'priya@demo.com' },
  { name: 'Rohan Mehta', email: 'rohan@demo.com' },
  { name: 'Sara Khan', email: 'sara@demo.com' },
];

if (get('SELECT 1 FROM users WHERE email = ?', people[0].email)) {
  console.log('Demo data already exists. Log in as aarav@demo.com / password');
  process.exit(0);
}

transaction(() => {
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const ids = people.map((p) => Number(run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', p.name, p.email, hash).lastInsertRowid));
  const [aarav, priya, rohan, sara] = ids;

  const tripId = Number(
    run(
      'INSERT INTO trips (name, description, currency, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      'Goa Getaway',
      'Five days of beaches, forts and seafood in North Goa.',
      'INR',
      '2026-10-01',
      '2026-10-05',
      aarav,
    ).lastInsertRowid,
  );
  ids.forEach((uid) => run('INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?)', tripId, uid, uid === aarav ? 'owner' : 'member'));

  const everyone = ids.map((userId) => ({ userId }));
  const expenses = [
    ['Flights BOM → GOI', 18400, 'Transport', aarav, '2026-10-01', 'equal', everyone],
    ['Villa in Anjuna (4 nights)', 32000, 'Accommodation', priya, '2026-10-01', 'equal', everyone],
    ['Welcome dinner at Thalassa', 6200, 'Food & Drinks', rohan, '2026-10-01', 'equal', everyone],
    ['Scooter rentals', 2400, 'Transport', sara, '2026-10-02', 'shares', [{ userId: aarav, value: 1 }, { userId: priya, value: 1 }, { userId: rohan, value: 2 }]],
    ['Fuel', 900, 'Fuel', rohan, '2026-10-02', 'equal', [{ userId: aarav }, { userId: priya }, { userId: rohan }]],
    ['Parasailing at Baga', 7200, 'Activities', aarav, '2026-10-02', 'exact', [{ userId: aarav, value: 2400 }, { userId: priya, value: 2400 }, { userId: sara, value: 2400 }]],
    ['Lunch at Britto’s', 3150, 'Food & Drinks', priya, '2026-10-03', 'equal', everyone],
    ['Flea market shopping', 4800, 'Shopping', sara, '2026-10-03', 'percent', [{ userId: sara, value: 60 }, { userId: priya, value: 40 }]],
    ['Groceries for the villa', 2650, 'Groceries', aarav, '2026-10-03', 'equal', everyone],
    ['Fort Aguada entry + guide', 1200, 'Tickets', rohan, '2026-10-04', 'equal', everyone],
    ['Sunset cruise', 5600, 'Activities', sara, '2026-10-04', 'equal', everyone],
    ['Seafood feast', 7400, 'Food & Drinks', aarav, '2026-10-04', 'equal', everyone],
    ['Airport cabs', 2200, 'Transport', priya, '2026-10-05', 'equal', everyone],
  ];
  const memberIds = new Set(ids);
  for (const [description, amount, category, paidBy, date, splitType, splits] of expenses) {
    const amountCents = amount * 100;
    const parts = computeSplits({ amountCents, splitType, splits, memberIds });
    const expenseId = Number(
      run(
        `INSERT INTO expenses (trip_id, description, amount_cents, category, paid_by, split_type, expense_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        tripId, description, amountCents, category, paidBy, splitType, date, paidBy,
      ).lastInsertRowid,
    );
    for (const p of parts) {
      run('INSERT INTO expense_splits (expense_id, user_id, amount_cents, share_value) VALUES (?, ?, ?, ?)', expenseId, p.userId, p.cents, p.value);
    }
  }

  run(
    'INSERT INTO settlements (trip_id, from_user, to_user, amount_cents, note, settled_on, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    tripId, rohan, priya, 500000, 'UPI transfer', '2026-10-06', rohan,
  );

  run(
    'INSERT INTO notes (trip_id, title, content, pinned, created_by) VALUES (?, ?, ?, 1, ?)',
    tripId,
    'Villa check-in',
    'Address: House 42, Anjuna Beach Road\nCheck-in after 1 PM, caretaker: Mr. D’Souza (+91 98200 00000)\nWi-Fi: AnjunaVilla / goa2026',
    priya,
  );
  run(
    'INSERT INTO notes (trip_id, title, content, pinned, created_by) VALUES (?, ?, ?, 0, ?)',
    tripId,
    'Packing list',
    '- Sunscreen SPF 50\n- Swimwear\n- Power bank\n- Driving licence (for scooters)\n- Mosquito repellent',
    aarav,
  );

  const trip2 = Number(
    run(
      'INSERT INTO trips (name, description, currency, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      'Manali Winter Trip',
      'Planning stage: snow, cafes and Solang Valley.',
      'INR',
      '2026-12-20',
      '2026-12-26',
      priya,
    ).lastInsertRowid,
  );
  [priya, aarav].forEach((uid) => run('INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?)', trip2, uid, uid === priya ? 'owner' : 'member'));
});

console.log(`Demo data created. Log in as any of: ${people.map((p) => p.email).join(', ')} (password: ${PASSWORD})`);
