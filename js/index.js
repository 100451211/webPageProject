require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const app = express();
const path = require('path');

// Middleware to parse JSON requests
app.use(express.json());
const url = path.join(__dirname, '../');
app.use(express.static(url));  // Serve static files (HTML, CSS, JS)

// Configuración de la sesión
app.use(session({
    secret: process.env.SESSION_SECRET || 'clave-secreta-de-respaldo', // Usar variable de entorno
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' } // Cookies seguras en producción
  }));
  

// Crear un pool de conexiones MySQL usando variables de entorno
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'tu_usuario_mysql',
    password: process.env.DB_PASSWORD || 'tu_contraseña_mysql',
    database: process.env.DB_NAME || 'tu_base_de_datos',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
const poolPromise = pool.promise();      

// Configurar NodeMailer usando variables de entorno
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465, // true para el puerto 465
    auth: {
      user: process.env.EMAIL_USER || 'mariatapiacosta@gmail.com',
      pass: process.env.EMAIL_PASS || 'mary0208'
    }
});
  
// Función auxiliar para enviar correos con manejo de errores
async function sendEmail(to, subject, text) {
try {
    const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"AURIDAL S.L." <mariatapiacosta@gmail.com>',
    to,
    subject,
    text
    });
    console.log('Correo enviado: %s', info.messageId);
    return info;
} catch (error) {
    console.error('Error al enviar el correo:', error);
    throw error;
}
}

// Middleware para verificar que el usuario esté autenticado
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
      return next();
    }
    res.status(401).json({ error: 'No autorizado' });
  }
  
  // Middleware para verificar que el usuario sea administrador
  function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.isAdmin) {
      return next();
    }
    res.status(401).json({ error: 'No autorizado: se requiere acceso de administrador' });
  }


// -------------------------
// ADMIN: Crear perfil de usuario
// -------------------------

// This endpoint lets an administrator create a new user profile.
// It generates a username (name.surname.randomNum) and a temporary password.
// The temporary password is hashed and saved in the database with a flag to force a password change.
// Admin endpoint to create external users


app.post('/admin/create-user',
  isAuthenticated,
  isAdmin,
  [
    body('name').isString().trim().notEmpty().withMessage('El nombre es obligatorio'),
    body('surname').isString().trim().notEmpty().withMessage('El apellido es obligatorio'),
    body('email').isEmail().normalizeEmail().withMessage('Se requiere un correo electrónico válido'),
    body('phone').optional().isString().trim(),
    body('nif').optional().isString().trim()
  ],
  async (req, res) => {
    // Validar errores de entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { name, surname, email, phone, nif } = req.body;
      // Generar un nombre de usuario único y una contraseña temporal
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const username = `${name.toLowerCase()}.${surname.toLowerCase()}.${randomNum}`;
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      await poolPromise.query(
        'INSERT INTO users (name, surname, email, phone, nif, username, password, forcePasswordChange, isAdmin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, surname, email, phone, nif, username, hashedPassword, 1, false]
      );

      // Enviar correo con las credenciales
      await sendEmail(email, 'Credenciales de tu cuenta', 
        `Tu cuenta ha sido creada.\nNombre de usuario: ${username}\nContraseña temporal: ${tempPassword}\nPor favor, inicia sesión y cambia tu contraseña inmediatamente.`
      );
      res.json({ message: 'Usuario creado y correo enviado', username });
    } catch (err) {
      console.error('Error en /admin/create-user:', err);
      res.status(500).json({ error: 'Ocurrió un error al crear el usuario' });
    }
  }
);

// -------------------------
// INICIO DE SESIÓN
// -------------------------
app.post('/login',
  [
    body('username').isString().trim().notEmpty().withMessage('El nombre de usuario es obligatorio'),
    body('password').isString().trim().notEmpty().withMessage('La contraseña es obligatoria')
  ],
  async (req, res) => {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { username, password } = req.body;
      const [rows] = await poolPromise.query('SELECT * FROM users WHERE username = ?', [username]);
      if (rows.length === 0) {
        return res.status(401).json({ error: 'Nombre de usuario o contraseña inválidos' });
      }
      const user = rows[0];
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Nombre de usuario o contraseña inválidos' });
      }
      // Guardar información del usuario en la sesión
      req.session.user = {
        id: user.id,
        username: user.username,
        forcePasswordChange: user.forcePasswordChange,
        isAdmin: user.isAdmin
      };
      if (user.forcePasswordChange) {
        return res.json({ message: 'Se requiere cambio de contraseña', forcePasswordChange: true });
      }
      res.json({ message: 'Inicio de sesión exitoso' });
    } catch (err) {
      console.error('Error en /login:', err);
      res.status(500).json({ error: 'Ocurrió un error durante el inicio de sesión' });
    }
  }
);

// -------------------------
// CAMBIAR CONTRASEÑA
// -------------------------
app.post('/change-password',
  isAuthenticated,
  [
    body('newPassword').isString().trim().notEmpty().withMessage('Se requiere una nueva contraseña')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { newPassword } = req.body;
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await poolPromise.query('UPDATE users SET password = ?, forcePasswordChange = 0 WHERE id = ?', [hashedPassword, req.session.user.id]);
      res.json({ message: 'Contraseña actualizada con éxito' });
    } catch (err) {
      console.error('Error en /change-password:', err);
      res.status(500).json({ error: 'Ocurrió un error al actualizar la contraseña' });
    }
  }
);

// -------------------------
// CERRAR SESIÓN
// -------------------------
app.get('/logout', isAuthenticated, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.status(500).json({ error: 'No se pudo cerrar sesión' });
    }
    res.json({ message: 'Sesión cerrada con éxito' });
  });
});

// -------------------------
// GESTIÓN DE PERFIL
// -------------------------
app.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const [rows] = await poolPromise.query('SELECT id, name, surname, email, phone, nif, username FROM users WHERE id = ?', [req.session.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error en GET /profile:', err);
    res.status(500).json({ error: 'Ocurrió un error al obtener el perfil' });
  }
});

app.put('/profile',
  isAuthenticated,
  [
    body('name').isString().trim().notEmpty().withMessage('El nombre es obligatorio'),
    body('surname').isString().trim().notEmpty().withMessage('El apellido es obligatorio'),
    body('email').isEmail().normalizeEmail().withMessage('Se requiere un correo electrónico válido'),
    body('phone').optional().isString().trim(),
    body('nif').optional().isString().trim()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { name, surname, email, phone, nif } = req.body;
      await poolPromise.query(
        'UPDATE users SET name = ?, surname = ?, email = ?, phone = ?, nif = ? WHERE id = ?',
        [name, surname, email, phone, nif, req.session.user.id]
      );
      res.json({ message: 'Perfil actualizado con éxito' });
    } catch (err) {
      console.error('Error en PUT /profile:', err);
      res.status(500).json({ error: 'Ocurrió un error al actualizar el perfil' });
    }
  }
);

// -------------------------
// GESTIÓN DEL CARRITO
// -------------------------
app.post('/cart/add',
  isAuthenticated,
  [
    body('itemId').notEmpty().withMessage('Se requiere el ID del artículo'),
    body('quantity').isInt({ gt: 0 }).withMessage('La cantidad debe ser un número entero positivo')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { itemId, quantity } = req.body;
      await poolPromise.query('INSERT INTO carts (user_id, item_id, quantity) VALUES (?, ?, ?)', [req.session.user.id, itemId, quantity]);
      res.json({ message: 'Artículo agregado al carrito' });
    } catch (err) {
      console.error('Error en POST /cart/add:', err);
      res.status(500).json({ error: 'Ocurrió un error al agregar el artículo al carrito' });
    }
  }
);

app.post('/cart/delete',
  isAuthenticated,
  [
    body('itemId').notEmpty().withMessage('Se requiere el ID del artículo')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { itemId } = req.body;
      await poolPromise.query('DELETE FROM carts WHERE user_id = ? AND item_id = ?', [req.session.user.id, itemId]);
      res.json({ message: 'Artículo eliminado del carrito' });
    } catch (err) {
      console.error('Error en POST /cart/delete:', err);
      res.status(500).json({ error: 'Ocurrió un error al eliminar el artículo del carrito' });
    }
  }
);

// -------------------------
// GESTIÓN DE PEDIDOS
// -------------------------
app.get('/orders', isAuthenticated, async (req, res) => {
  try {
    const [rows] = await poolPromise.query('SELECT * FROM orders WHERE user_id = ?', [req.session.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /orders:', err);
    res.status(500).json({ error: 'Ocurrió un error al obtener los pedidos' });
  }
});

// -------------------------
// INICIAR SERVIDOR
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});