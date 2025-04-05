const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const app = express();

// Middleware to parse JSON requests
app.use(express.json());

// Configure session management (for development, secure should be false)
app.use(session({
  secret: 'your-secret-key', // Ideally, use an environment variable here
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Create a MySQL connection pool
const pool = mysql.createPool({
  host: 'localhost',
  user: 'your_mysql_username',
  password: 'your_mysql_password',
  database: 'your_database',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Configure NodeMailer transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.example.com', // Replace with your SMTP host
  port: 587, // Use 465 for secure connection if needed
  secure: false, // Set true if using port 465
  auth: {
    user: 'your_email@example.com',
    pass: 'your_email_password'
  }
});

// Helper function to send emails
async function sendEmail(to, subject, text) {
  return transporter.sendMail({
    from: '"Your E-commerce App" <your_email@example.com>',
    to,
    subject,
    text
  });
}

// -------------------------
// ADMIN: Create User Profile
// -------------------------
// This endpoint lets an administrator create a new user profile.
// It generates a username (name.surname.randomNum) and a temporary password.
// The temporary password is hashed and saved in the database with a flag to force a password change.
// Admin endpoint to create external users
app.post('/admin/create-user', isAuthenticated, isAdmin, async (req, res) => {
    const { name, surname, email, phone, nif } = req.body;
    if (!name || !surname || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // Generate a unique username and temporary password
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const username = `${name.toLowerCase()}.${surname.toLowerCase()}.${randomNum}`;
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
  
    pool.query(
      'INSERT INTO users (name, surname, email, phone, nif, username, password, forcePasswordChange, isAdmin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, surname, email, phone, nif, username, hashedPassword, 1, false], // External users are not admin
      async (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Database error' });
        }
        try {
          await sendEmail(email, 'Your Account Credentials', 
            `Your account has been created.\nUsername: ${username}\nTemporary Password: ${tempPassword}\nPlease log in and change your password immediately.`
          );
          res.json({ message: 'User created and email sent', username });
        } catch (emailError) {
          console.error(emailError);
          res.status(500).json({ error: 'User created but failed to send email' });
        }
      }
    );
  });
  

// -------------------------
// USER LOGIN
// -------------------------
// This endpoint logs a user in by verifying their username and password.
// If the user is flagged to change the password on first login, that info is returned.
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if(!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }
  pool.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = results[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    // Save user info in session
    req.session.user = {
      id: user.id,
      username: user.username,
      forcePasswordChange: user.forcePasswordChange,
      isAdmin: user.isAdmin  // Add this line
    };
    // If password change is required, notify the client
    if (user.forcePasswordChange) {
      return res.json({ message: 'Password change required', forcePasswordChange: true });
    }
    res.json({ message: 'Logged in successfully' });
  });
});

// Middleware to ensure the user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Middleware to ensure the user is an admin
function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.isAdmin) {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized: Admin access required' });
  }

// -------------------------
// CHANGE PASSWORD
// -------------------------
// This endpoint allows an authenticated user to change their password.
// It also clears the forcePasswordChange flag after a successful update.
app.post('/change-password', isAuthenticated, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' });
  }
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  pool.query('UPDATE users SET password = ?, forcePasswordChange = 0 WHERE id = ?', [hashedPassword, req.session.user.id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Password updated successfully' });
  });
});

// -------------------------
// LOGOUT
// -------------------------
// This endpoint logs out the user by destroying their session.
app.get('/logout', isAuthenticated, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// -------------------------
// PROFILE MANAGEMENT
// -------------------------
// Get the profile details for the authenticated user.
app.get('/profile', isAuthenticated, (req, res) => {
  pool.query('SELECT id, name, surname, email, phone, nif, username FROM users WHERE id = ?', [req.session.user.id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(results[0]);
  });
});

// Update profile information (e.g., name, surname, email, phone, nif)
app.put('/profile', isAuthenticated, (req, res) => {
  const { name, surname, email, phone, nif } = req.body;
  pool.query(
    'UPDATE users SET name = ?, surname = ?, email = ?, phone = ?, nif = ? WHERE id = ?',
    [name, surname, email, phone, nif, req.session.user.id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Profile updated successfully' });
    }
  );
});


// -------------------------
// CART MANAGEMENT
// -------------------------
// Dummy endpoints assuming a "carts" table related to users
// Add an item to the cart
app.post('/cart/add', isAuthenticated, (req, res) => {
  const { itemId, quantity } = req.body;
  if (!itemId || !quantity) {
    return res.status(400).json({ error: 'Missing itemId or quantity' });
  }
  pool.query('INSERT INTO carts (user_id, item_id, quantity) VALUES (?, ?, ?)', [req.session.user.id, itemId, quantity], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Item added to cart' });
  });
});

// Remove an item from the cart
app.post('/cart/delete', isAuthenticated, (req, res) => {
  const { itemId } = req.body;
  if (!itemId) {
    return res.status(400).json({ error: 'Missing itemId' });
  }
  pool.query('DELETE FROM carts WHERE user_id = ? AND item_id = ?', [req.session.user.id, itemId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Item removed from cart' });
  });
});

// -------------------------
// ORDER MANAGEMENT
// -------------------------
// Retrieve orders for the authenticated user.
// Assumes an "orders" table related to the user.
app.get('/orders', isAuthenticated, (req, res) => {
  pool.query('SELECT * FROM orders WHERE user_id = ?', [req.session.user.id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

// -------------------------
// START SERVER
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
