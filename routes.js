const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const router = express.Router();
const bcrypt = require('bcrypt');

const uploadDir = path.join(__dirname, 'images', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const usersFile = path.join(__dirname, 'db', 'users.json');
if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, JSON.stringify([]));
}

function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const key = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}$${key}`;
}

function verifyPassword(password, hash) {
  if (!hash || typeof hash !== 'string') return false;
  const [salt, storedKey] = hash.split('$');
  if (!salt || !storedKey) return false;
  return hashPassword(password, salt) === hash;
}

function loadUsers() {
  return JSON.parse(fs.readFileSync(usersFile, 'utf8') || '[]');
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// Ensure a seeded admin user exists so admin login works by default.
function ensureSeededAdmin() {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'adminpass';
  const users = loadUsers();
  const exists = users.some((u) => u.username === adminUser || u.email === adminUser);
  if (!exists) {
    const newAdmin = {
      name: 'Administrator',
      username: adminUser,
      email: `${adminUser}@localhost`,
      phone: '',
      password: hashPassword(adminPass),
      profilePhoto: '/images/profile-avatar.svg',
      isAdmin: true,
    };
    users.push(newAdmin);
    saveUsers(users);
    console.log('Seeded admin user:', adminUser);
  }
}

ensureSeededAdmin();

function findUserByLogin(login) {
  if (!login) return null;
  const q = login.toString().toLowerCase();
  const users = loadUsers();
  return users.find((user) => {
    const email = (user.email || '').toString().toLowerCase();
    const username = (user.username || '').toString().toLowerCase();
    return email === q || username === q;
  });
}

const slideshowImages = [
  {
    src: '/images/field-of-sugar-cane-mumias-kenya-africa-B1XPA8.jpg',
    title: 'Lush Sugarcane Fields',
    desc: 'Rich, standing sugarcane ready for sale or lease.',
  },
  {
    src: '/images/sugar-cane-being-taken-to-the-mill-near-mumias-kenya-africa-E7JKX2.jpg',
    title: 'Harvest and Milling',
    desc: 'High-value land with established harvest pathways.',
  },
  {
    src: '/images/sugarcane-field_5207-276.jpg',
    title: 'Green Plantation',
    desc: 'Large acreage of sugarcane available for long-term leasing.',
  },
  {
    src: '/images/sugarcane-growing-in-the-fields-in-sunrise-free-photo.jpg',
    title: 'Sunrise Growth',
    desc: 'Well-irrigated land perfect for premium sugarcane production.',
  },
];

const listingImages = [
  '/images/farm-photo-1.svg',
  '/images/farm-photo-2.svg',
  '/images/farm-photo-3.svg',
  '/images/farm-photo-4.svg',
  '/images/farm-photo-5.svg',
];

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getSortClause(sort) {
  switch (sort) {
    case 'priceAsc':
      return 'ORDER BY price ASC';
    case 'priceDesc':
      return 'ORDER BY price DESC';
    default:
      return 'ORDER BY datetime(createdAt) DESC';
  }
}

function getListingImage(index) {
  return listingImages[index % listingImages.length];
}

const defaultProfile = {
  name: 'Guest User',
  username: 'guest',
  email: 'No email yet',
  phone: 'No phone yet',
  bio: 'Your farm profile is ready to connect buyers and renters.',
  profilePhoto: '/images/profile-avatar.svg',
};

function saveBase64Image(base64Data, fallbackValue) {
  if (!base64Data) return fallbackValue;

  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) return fallbackValue;

  const extension = matches[1].split('/')[1] || 'png';
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;
  const filePath = path.join(uploadDir, fileName);
  const imageBuffer = Buffer.from(matches[2], 'base64');

  fs.writeFileSync(filePath, imageBuffer);
  return `/images/uploads/${fileName}`;
}

router.get('/', (req, res) => {
  const typeFilter = req.query.type || 'all';
  const sort = req.query.sort || 'newest';
  let query = 'SELECT * FROM listings';
  const params = [];

  if (typeFilter === 'sale' || typeFilter === 'lease') {
    query += ' WHERE type = ?';
    params.push(typeFilter);
  }

  query += ` ${getSortClause(sort)}`;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).send('Unable to load listings.');
    }

    const listingsWithImages = rows.map((listing, index) => ({
      ...listing,
      farmImage: listing.listingImage || getListingImage(index),
      ownerPhoto: listing.profilePhoto || '/images/profile-avatar.svg',
      ownerUsername: listing.ownerUsername || listing.ownerName,
      ownerPhone: listing.ownerPhone || null,
    }));

    const profile = {
      ...defaultProfile,
      ...(req.session.profile || {}),
    };

    res.render('index', {
      listings: listingsWithImages,
      filterType: typeFilter,
      sortBy: sort,
      profile,
      section: 'home',
      formatCurrency,
      slideshowImages,
    });
  });
});

router.get('/post', (req, res) => {
  res.render('post', { section: 'post' });
});

router.get('/signup', (req, res) => {
  res.render('signup', { section: 'signup', errors: [], form: {} });
});

router.get('/login', (req, res) => {
  res.render('login', { section: 'login', errors: [], form: {} });
});

router.post('/signup', (req, res) => {
  try {
    console.log('POST /signup', { body: req.body });
    const { name, username, email, phone, password, confirmPassword } = req.body;
    const errors = [];

    if (!name || !username || !email || !password || !confirmPassword) {
      errors.push('All fields are required.');
    }
    if (password !== confirmPassword) {
      errors.push('Passwords do not match.');
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push('Enter a valid email address.');
    }

    const users = loadUsers();
    const emailQ = (email || '').toString().toLowerCase();
    const usernameQ = (username || '').toString().toLowerCase();
    if (users.some((user) => ((user.email || '').toString().toLowerCase()) === emailQ)) {
      errors.push('Email is already registered.');
    }
    if (users.some((user) => ((user.username || '').toString().toLowerCase()) === usernameQ)) {
      errors.push('Username is already taken.');
    }

    if (errors.length) {
      return res.render('signup', { section: 'signup', errors, form: req.body });
    }

    const newUser = {
      name,
      username,
      email,
      phone,
      password: hashPassword(password),
      profilePhoto: '/images/profile-avatar.svg',
      isAdmin: false,
    };

    users.push(newUser);
    saveUsers(users);
    req.session.user = {
      name,
      username,
      email,
      phone,
      profilePhoto: newUser.profilePhoto,
    };
    res.redirect('/profile');
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).render('signup', { section: 'signup', errors: ['Server error, please try again.'], form: req.body });
  }
});

router.post('/login', (req, res) => {
  try {
    console.log('POST /login', { body: req.body });
    const { login, password } = req.body;
    const errors = [];

    if (!login || !password) {
      errors.push('Email or username and password are required.');
    }

    const user = findUserByLogin(login || '');
    if (!user || !verifyPassword(password, user.password)) {
      errors.push('Invalid credentials.');
    }

    if (errors.length) {
      return res.render('login', { section: 'login', errors, form: req.body });
    }

    req.session.user = {
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      profilePhoto: user.profilePhoto,
    };
    res.redirect('/profile');
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).render('login', { section: 'login', errors: ['Server error, please try again.'], form: req.body });
  }
});

router.get('/logout', (req, res) => {
  req.session.user = null;
  res.redirect('/');
});

router.post('/post', (req, res) => {
  const {
    title,
    location,
    type,
    size,
    price,
    sugarcaneStatus,
    description,
    ownerName,
    ownerUsername,
    ownerEmail,
    ownerPhone,
  } = req.body;

  const listingImagePath = saveBase64Image(req.body.listingImageBase64, null);
  const profilePhotoPath = saveBase64Image(req.body.profilePhotoBase64, '/images/profile-avatar.svg');

  const stmt = db.prepare(
    `INSERT INTO listings (title, location, type, size, price, sugarcaneStatus, description, ownerName, ownerUsername, ownerEmail, ownerPhone, listingImage, profilePhoto, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  stmt.run(
    title,
    location,
    type,
    Number(size),
    Number(price),
    sugarcaneStatus,
    description,
    ownerName,
    ownerUsername,
    ownerEmail,
    ownerPhone,
    listingImagePath,
    profilePhotoPath,
    new Date().toISOString(),
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Unable to save listing.');
      }

      req.session.profile = {
        name: ownerName,
        username: ownerUsername || ownerName,
        email: ownerEmail,
        phone: ownerPhone || 'No phone yet',
        profilePhoto: profilePhotoPath,
        bio: defaultProfile.bio,
      };
      res.redirect('/');
    }
  );
  stmt.finalize();
});

router.get('/profile', (req, res) => {
  db.get('SELECT COUNT(*) AS total, SUM(type = "sale") AS sale, SUM(type = "lease") AS lease FROM listings', (err, stats) => {
    if (err) {
      return res.status(500).send('Unable to load profile data.');
    }

    const profile = {
      ...defaultProfile,
      ...(req.session.user || req.session.profile || {}),
    };

    res.render('profile', {
      section: 'profile',
      profile,
      stats: {
        total: stats.total || 0,
        sale: stats.sale || 0,
        lease: stats.lease || 0,
      },
    });
  });
});

router.post('/profile', (req, res) => {
  const { name, username, email, phone, bio, profilePhotoBase64 } = req.body;
  const current = req.session.profile || {};

  const profilePhotoPath = profilePhotoBase64
    ? saveBase64Image(profilePhotoBase64, current.profilePhoto || defaultProfile.profilePhoto)
    : current.profilePhoto || defaultProfile.profilePhoto;

  req.session.profile = {
    name: name || current.name || defaultProfile.name,
    username: username || current.username || defaultProfile.username,
    email: email || current.email || defaultProfile.email,
    phone: phone || current.phone || defaultProfile.phone,
    bio: bio || current.bio || defaultProfile.bio,
    profilePhoto: profilePhotoPath,
  };

  res.redirect('/profile');
});

router.post('/profile/reset', (req, res) => {
  db.run('DELETE FROM listings', (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Unable to clear listings.');
    }
    req.session.profile = null;
    res.redirect('/profile');
  });
});

function ensureAdmin(req, res, next) {
  const user = req.session.user || {};
  const adminUser = process.env.ADMIN_USER || 'admin';
  if (user.isAdmin || user.username === adminUser) return next();
  return res.redirect('/admin/login');
}

router.get('/admin/login', (req, res) => {
  res.render('admin_login', { section: 'admin', errors: [], form: {} });
});

router.post('/admin/login', (req, res) => {
  const { login, password } = req.body;
  const errors = [];
  if (!login || !password) {
    errors.push('Username and password are required.');
    return res.render('admin_login', { section: 'admin', errors, form: req.body });
  }

  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'adminpass';

  // Environment-backed admin
  if (login === adminUser && password === adminPass) {
    req.session.user = {
      username: adminUser,
      name: 'Administrator',
      email: 'admin@localhost',
      isAdmin: true,
    };
    return res.redirect('/admin');
  }

  // Allow admin sign-in only if the login matches the configured admin username
  // and the password matches the stored hashed password for that account.
  const user = findUserByLogin(login || '');
  if (user && user.username === adminUser && verifyPassword(password, user.password)) {
    req.session.user = {
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      profilePhoto: user.profilePhoto,
      isAdmin: true,
    };
    return res.redirect('/admin');
  }

  errors.push('Invalid admin credentials.');
  return res.render('admin_login', { section: 'admin', errors, form: req.body });
});

router.get('/admin', ensureAdmin, (req, res) => {
  const users = loadUsers();
  db.all('SELECT * FROM listings', [], (err, rows) => {
    if (err) {
      return res.status(500).send('Unable to load admin data.');
    }

    const listings = rows || [];

    const leasePeopleMap = new Map();
    const salePeopleMap = new Map();

    listings.forEach((l) => {
      const key = l.ownerEmail || l.ownerName || l.ownerUsername;
      const person = {
        name: l.ownerName,
        username: l.ownerUsername,
        email: l.ownerEmail,
        phone: l.ownerPhone,
      };
      if (l.type === 'lease') {
        leasePeopleMap.set(key, person);
      }
      if (l.type === 'sale') {
        salePeopleMap.set(key, person);
      }
    });

    const leasePeople = Array.from(leasePeopleMap.values());
    const salePeople = Array.from(salePeopleMap.values());

    const stats = {
      totalListings: listings.length,
      totalUsers: users.length,
      totalLeasePeople: leasePeople.length,
      totalSalePeople: salePeople.length,
    };

    res.render('admin', {
      section: 'admin',
      users,
      listings,
      leasePeople,
      salePeople,
      stats,
    });
  });
});

module.exports = router;
