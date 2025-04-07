document.getElementById('loginForm').addEventListener('submit', function(event) {
  event.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',  // Enviar cookies de sesión
    body: JSON.stringify({ username, password })
  })
  .then(response => {
    console.log('Login attempt::', username, password)
    console.log('response ::', response);
    if (!response.contains('ok')) {
      throw new Error('Usuario o contraseña inválida');
    }
    return response.json();
  })
  .then(data => {
    if (data.message === 'Login successful') {
      // Revisa si hay parámetro redirectUrl para redirigir
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get('redirectUrl');

      if (redirectUrl) {
        window.location.href = decodeURIComponent(redirectUrl);
      } else {
        window.location.href = '../index.html';
      }
    } else {
      document.getElementById('loginError').textContent = 'Usuario o contraseña inválida. Por favor, inténtelo de nuevo.';
      document.getElementById('loginError').style.display = 'block';
    }
  })
  .catch(error => {
    console.error('Error:', error);
    document.getElementById('loginError').textContent = 'Usuario o contraseña inválida. Por favor, inténtelo de nuevo.';
    document.getElementById('loginError').style.display = 'block';
  });
});

function logoutUser() {
  localStorage.removeItem('isLoggedIn');
  window.location.href = '../index.html';
}
