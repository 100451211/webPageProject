// Function to open the pop-up with a message and an optional redirect
function showPopup(message, redirect = null, duration = 1500) { // Duration in milliseconds
  const popup = document.getElementById('popup');
  document.getElementById('popup-message').textContent = message;
  popup.style.display = 'block';

  // Close the pop-up automatically after the specified duration
  setTimeout(() => {
    closePopup();
    if (redirect) {
      window.location.href = redirect;
    }
  }, duration);
}

// Function to close the pop-up
function closePopup() {
  document.getElementById('popup').style.display = 'none';
}

// ========================================== //
// ============== CARGAR DATOS ============== //
// ========================================== //
// Fetch user data from the backend
async function loadUserData() {
  console.log('calling GET /api/get-user');
  try {
    const response = await fetch('/api/get-user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for authentication
    });

    const userData = await response.json();
    console.log('userData ::', userData);

    if (response.ok) {
      console.log('response.ok');
      // Populate fields with user data
      populateUserFields(userData);
    } else {
      console.error('Failed to load user data:', userData.message);
      showPopup(userData.message || 'Error al cargar los datos de usuario.');
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
    showPopup('Error al cargar los datos de usuario.');
  }
}

// Populate fields with user data or default values
function populateUserFields(userData) {
  document.getElementById('name').value = userData.name + ' '+ userData.surname || 'Nombre Apellido';
  document.getElementById('email').value = userData.email || 'nombre@example.com';
  document.getElementById('phone').value = userData.phone || '';
  document.getElementById('language').value = userData.language || 'es';
  
  const profilePicture = document.getElementById('profilePicture');
  profilePicture.src = userData.profilePicture || '../images/default-profile.png';
  profilePicture.alt = "Imagen de Perfil";
  
  document.getElementById('street').value = userData.street || '';
  document.getElementById('street_num').value = userData.street_num || '';
  document.getElementById('postal_code').value = userData.postal_code || '';
  document.getElementById('city').value = userData.city || '';
  document.getElementById('country').value = userData.country || '';
  document.getElementById('CIF').value = userData.cif || '';
}

// Load user data on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('calling loadUserData...');
  loadUserData();
});



// ========================================== //
// ============= CAMBIO CONTRASEÑA ========== //
// ========================================== //

document.getElementById('update-password-btn').addEventListener('click', async () => {
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;

  // Function to get the value of a specific cookie by name
  function getCookie(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return '';
  }

  // Retrieve the token from cookies
  const token = getCookie('token');
  console.log(token, "::token");

  if (!currentPassword || !newPassword) {
      showPopup("Rellenar campos obligatorios para el cambio de contraseña!");
      return;
  }

  try {
      const response = await fetch('/auth/reset-password', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ currentPassword, newPassword }) // Needs userId to identify user in api call
      });

      const result = await response.json();
      showPopup(result.message);

      if (result.message === 'Contraseña actual incorrecta.') {
          document.getElementById('current-password').value = '';
      } else if (response.ok) {
          document.getElementById('current-password').value = '';
          document.getElementById('new-password').value = '';
      }
  } catch (error) {
      showPopup("Error updating password.");
  }
});


// ========================================== //
// ============== CERRAR SESION ============= //
// ========================================== //
document.getElementById('logout-link').addEventListener('click', async (event) => {
  event.preventDefault(); // Prevent default link behavior
  console.log("logout-link clicked!");

  try {
    const response = await fetch('/auth/sign-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // Include cookies if using them for session management
    });

    const result = await response.json();

    if (response.ok) {
      // Clear any stored tokens if using JWTs
      localStorage.removeItem('token'); // Example: remove the token from localStorage

      // Show the API's success message and redirect to login page
      showPopup(result.message, '../login.html');
    } else {
      // Show the API's error message without redirect
      showPopup(result.message);
    }
  } catch (error) {
    console.error("Error during logout:", error);
    showPopup(result.message); // Show a fallback error message if API call fails
  }
});


document.addEventListener('DOMContentLoaded', loadUserData);