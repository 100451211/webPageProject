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
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.next();
}

// Middleware para verificar que el usuario sea administrador
function isAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.user.isAdmin) {
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
      const [rows] = await poolPromise.query('SELECT id, username, password, isAdmin, forcePasswordChange FROM users WHERE username = ?', [username]);      if (rows.length === 0) {
        return res.status(401).json({ error: 'Nombre de usuario o contraseña inválidos.' });
      }
      const user = rows[0];
      const valid_pass = await bcrypt.compare(password, user.password);
      const valid_user = (username === user.username);
      console.log('validation:', valid_user, valid_pass);

      if (valid_pass && valid_user){
        req.session.userId = user.id;
        req.session.username = user.username;
        if (user.isAdmin == 1){
          req.session.isAdmin = true;
        }
      }

      if (!valid_pass || !valid_user) {
        return res.status(401).json({ error: 'Nombre de usuario o contraseña inválidos.' });
      }
      // Solo se retorna el mensaje de éxito sin exponer detalles internos
      if (user.forcePasswordChange) {
        return res.json({ message: 'Se requiere cambio de contraseña', forcePasswordChange: true });
      }
      res.status(200).json({ message: 'Inicio de sesión exitoso' });
    } catch (error) {
      console.error("Error durante login:", error);
      return res.status(500).json({ error: "Error interno del servidor." });
    }
  }
);

app.get('/api/session/status', (req, res) => {
  if (req.session.userId) {
    res.status(200).json({
      loggedIn: true,
      userId: req.session.userId,
      username: req.session.username,
      isAdmin: req.session.isAdmin || false 
    });
  } else {
    res.status(200).json({
      loggedIn: false
    });
  }
});

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

  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    console.log(req);
    const [rows] = await poolPromise.query(
      'SELECT id, name, surname, email, phone, nif, username FROM users WHERE id = ?',
      [req.session.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    
    res.status(200)
    res.json(rows[0]);
  } catch (error) {
    console.error("Error en /profile:", error);
    res.status(500).json({ error: "Error al obtener los datos del usuario." });
  }

});

// -------------------------
// RECOGER INFO DE CATEGORIA PRODUCTOS
//    (condiciona ver el precio) 
// -------------------------

app.get('/api/products/:category', async (req, res) => {
  const { category } = req.params;
  try {
    // Usamos los nombres de columna de tu tabla AURIDAL_SL.products
    // Seleccionamos las columnas que necesitas para la vista de lista de productos
    const query = `
      SELECT id, proveedor, referencia, nombre, categoria, alto, ancho, largo, salto, precio, stock, descripcion, cuidado 
      FROM products 
      WHERE categoria = ?
    `;
    const [rows] = await poolPromise.query(query, [category]);

    if (rows.length === 0) {
      return res.status(200).json([]); // Devolvemos array vacío si no hay productos en la categoría
    }

    let productsToSend;
    if (!req.session.userId) {
      // Si el usuario NO está logueado, mapeamos los productos para quitarles el 'precio'.
      productsToSend = rows.map(product => {
        const { precio, ...productWithoutPrice } = product;
        // Alternativa: return { ...product, priceInfo: 'Inicia sesión para ver el precio' };
        return productWithoutPrice;
      });
    } else {
      // Si el usuario SÍ está logueado, enviamos los productos tal cual.
      productsToSend = rows;
    }

    res.status(200).json(productsToSend);
  } catch (error) {
    console.error(`Error al obtener productos para la categoría ${category}:`, error);
    res.status(500).json({ error: 'Error interno del servidor al obtener productos por categoría.' });
  }
});

// -------------------------
// RECOGER INFORMACION DE PRODUCTOS INDIVIDUALES
//    (condiciona ver el precio) 
// -------------------------

app.get('/api/product-details/:productId', async (req, res) => {
  const { productId } = req.params;
  try {
    // Usamos los nombres de columna de tu tabla AURIDAL_SL.products
    const [rows] = await poolPromise.query('SELECT id, proveedor, referencia, nombre, categoria, alto, ancho, largo, salto, precio, stock, descripcion, cuidado FROM products WHERE id = ?', [productId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    let product = rows[0];
    let productToSend = { ...product }; // Clonamos para modificar solo la copia que se envía

    if (!req.session.userId) {
      // Si el usuario NO está logueado, eliminamos el campo 'precio'.
      delete productToSend.precio;
      // Alternativa: añadir un mensaje en lugar de eliminar (si lo prefieres)
      // productToSend.priceInfo = 'Inicia sesión para ver el precio'; 
    }

    res.status(200).json(productToSend);
  } catch (error) {
    console.error(`Error al obtener detalles del producto ${productId}:`, error);
    res.status(500).json({ error: 'Error interno del servidor al obtener detalles del producto.' });
  }
});

// -------------------------
// BUSQUEDA DE PRODUCTOS 
// (condiciona ver el precio) 
// -------------------------

app.get('/api/products', async (req, res) => {
  const searchTerm = req.query.q ? String(req.query.q).toLowerCase() : '';
  // Seleccionamos todas las columnas necesarias de la tabla products
  let query = 'SELECT id, proveedor, referencia, nombre, categoria, alto, ancho, largo, salto, precio, stock, descripcion, cuidado FROM products';
  const queryParams = [];

  if (searchTerm) {
    // Buscamos en 'nombre', 'descripcion', 'categoria', 'referencia' y 'proveedor'.
    // Ajusta los campos de búsqueda según tus necesidades.
    query += ' WHERE LOWER(nombre) LIKE ? OR LOWER(descripcion) LIKE ? OR LOWER(categoria) LIKE ? OR LOWER(referencia) LIKE ? OR LOWER(proveedor) LIKE ?';
    const likeSearchTerm = `%${searchTerm}%`;
    queryParams.push(likeSearchTerm, likeSearchTerm, likeSearchTerm, likeSearchTerm, likeSearchTerm);
  }

  try {
    const [rows] = await poolPromise.query(query, queryParams);

    let productsToSend;
    if (!req.session.userId) {
      // Si el usuario NO está logueado, mapeamos los productos para quitarles el 'precio'.
      productsToSend = rows.map(product => {
        const { precio, ...productWithoutPrice } = product;
        // Alternativa: return { ...product, priceInfo: 'Inicia sesión para ver el precio' };
        return productWithoutPrice;
      });
    } else {
      // Si el usuario SÍ está logueado, enviamos los productos tal cual.
      productsToSend = rows;
    }

    res.status(200).json(productsToSend);
  } catch (error) {
    console.error(`Error al buscar productos con término "${searchTerm}":`, error);
    res.status(500).json({ error: 'Error interno del servidor al buscar productos.' });
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
