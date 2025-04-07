require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const path = require('path');
const app = express();

// Middleware para parsear solicitudes JSON
app.use(express.json());

// Serve static files (HTML, CSS, JS)
const url = path.join(__dirname, '../');
app.use(express.static(url));  

// Configuración de la sesión
app.use(session({
  secret: process.env.SESSION_SECRET || 'clave-secreta-de-respaldo',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Crear pool de conexión MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'tu_usuario',
  password: process.env.DB_PASSWORD || 'tu_contraseña',
  database: process.env.DB_NAME || 'nombre_de_la_base_de_datos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
const poolPromise = pool.promise();

// Configuración de NodeMailer (por ejemplo, para Gmail)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: Number(process.env.EMAIL_PORT) === 465, // true para puerto 465
  auth: {
    user: process.env.EMAIL_USER || 'tu_email@example.com',
    pass: process.env.EMAIL_PASS || 'tu_contraseña'
  }
});

// Función auxiliar para enviar correo
async function sendEmail(to, subject, text) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Tu App E-commerce" <tu_email@example.com>',
      to,
      subject,
      text
    });
    console.log('Correo enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo:', error);
    throw error;
  }
}

// Middleware para verificar que el usuario esté autenticado
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'No autorizado' });
}

// Middleware para verificar que el usuario sea administrador
function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Acceso restringido: se requiere permisos de administrador' });
}

// -------------------------
// LOGIN (endpoint con validación y sanitización)
// -------------------------
app.post('/login',
  [
    body('username').trim().notEmpty().withMessage('El nombre de usuario es obligatorio'),
    body('password').trim().notEmpty().withMessage('La contraseña es obligatoria')
  ],
  async (req, res) => {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
      const { username, password } = req.body;
      
      // Consulta parametrizada para evitar inyección SQL
      const [rows] = await poolPromise.query('SELECT * FROM users WHERE username = ?', [username]);
      if (rows.length === 0) {
        return res.status(401).json({ error: 'Nombre de usuario o contraseña inválidos.' });
      }
      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'Nombre de usuario o contraseña inválidos.' });
      }
      
      // Guardar datos relevantes del usuario en la sesión
      req.session.user = {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        forcePasswordChange: user.forcePasswordChange
      };
      
      // Solo se retorna el mensaje de éxito sin exponer detalles internos
      return res.json({ ok: "Login successful" });
    } catch (error) {
      console.error("Error durante login:", error);
      return res.status(500).json({ error: "Error interno del servidor." });
    }
  }
);

// -------------------------
// ADMIN: Crear usuario (con validación de entrada)
// -------------------------
app.post('/admin/create-user',
  isAuthenticated,
  isAdmin,
  [
    body('name').trim().notEmpty().withMessage('El nombre es obligatorio'),
    body('surname').trim().notEmpty().withMessage('El apellido es obligatorio'),
    body('email').trim().isEmail().withMessage('Se requiere un correo válido'),
    body('phone').optional().trim(),
    body('nif').optional().trim()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
      const { name, surname, email, phone, nif } = req.body;
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const username = `${name.toLowerCase()}.${surname.toLowerCase()}.${randomNum}`;
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      await poolPromise.query(
        'INSERT INTO users (name, surname, email, phone, nif, username, password, forcePasswordChange, isAdmin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, surname, email, phone, nif, username, hashedPassword, 1, false]
      );
      
      await sendEmail(email, 'Credenciales de tu cuenta',
        `Tu cuenta ha sido creada.\nUsuario: ${username}\nContraseña temporal: ${tempPassword}\nPor favor, inicia sesión y cambia tu contraseña inmediatamente.`
      );
      res.json({ ok: 'User created and email sent', username });
    } catch (error) {
      console.error("Error en /admin/create-user:", error);
      res.status(500).json({ error: "Error al crear el usuario." });
    }
  }
);

// -------------------------
// CAMBIO DE CONTRASEÑA
// -------------------------
app.post('/change-password',
  isAuthenticated,
  [
    body('newPassword').trim().notEmpty().withMessage('Se requiere una nueva contraseña')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    try {
      const { newPassword } = req.body;
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await poolPromise.query('UPDATE users SET password = ?, forcePassword = 0 WHERE id = ?', [hashedPassword, req.session.user.id]);
      res.json({ ok: "Password updated successfully" });
    } catch (error) {
      console.error("Error en /change-password:", error);
      res.status(500).json({ error: "Error al actualizar la contraseña." });
    }
  }
);

// -------------------------
// CERRAR SESIÓN
// -------------------------
app.get('/logout', isAuthenticated, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Error al cerrar sesión:", err);
      return res.status(500).json({ error: "No se pudo cerrar la sesión" });
    }
    res.json({ ok: "Logged out successfully" });
  });
});

// -------------------------
// OBTENER PERFIL DE USUARIO
// -------------------------
app.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const [rows] = await poolPromise.query(
      'SELECT id, name, surname, email, phone, nif, username, profilePicture, street, street_num, postal_code, city, country, cif FROM users WHERE id = ?',
      [req.session.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("Error en /profile:", error);
    res.status(500).json({ error: "Error al obtener los datos del usuario." });
  }
});

// -------------------------
// AGREGAR PRODUCTOS AL CARRITO
// -------------------------
app.post('/cart/add', isAuthenticated, async (req, res) => {
  try {
    // Se asume que el carrito se guarda en una tabla "carts" en MySQL
    const cartItems = Array.isArray(req.body) ? req.body : [req.body];
    for (const item of cartItems) {
      const { productId, quantity } = item;
      // Consulta parametrizada para insertar en carrito
      await poolPromise.query(
        'INSERT INTO carts (user_id, item_id, quantity) VALUES (?, ?, ?)',
        [req.session.user.id, productId, quantity]
      );
    }
    res.json({ ok: "Products added to cart successfully" });
  } catch (error) {
    console.error("Error en /cart/add:", error);
    res.status(500).json({ error: "Error al agregar productos al carrito." });
  }
});

// -------------------------
// ELIMINAR PRODUCTO DEL CARRITO
// -------------------------
app.post('/cart/remove', isAuthenticated, async (req, res) => {
  try {
    const { productId } = req.body;
    await poolPromise.query(
      'DELETE FROM carts WHERE user_id = ? AND item_id = ?',
      [req.session.user.id, productId]
    );
    res.json({ ok: "Product removed from cart" });
  } catch (error) {
    console.error("Error en /cart/remove:", error);
    res.status(500).json({ error: "Error al eliminar producto del carrito." });
  }
});

// -------------------------
// OBTENER PEDIDOS DEL USUARIO
// -------------------------
app.get('/orders', isAuthenticated, async (req, res) => {
  try {
    const [rows] = await poolPromise.query('SELECT * FROM orders WHERE user_id = ?', [req.session.user.id]);
    res.json({ ok: true, orders: rows });
  } catch (error) {
    console.error("Error en /orders:", error);
    res.status(500).json({ error: "Error al obtener los pedidos." });
  }
});

// Iniciar el servidor en el puerto configurado
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
