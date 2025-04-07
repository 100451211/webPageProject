function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  let searchTerm = params.get('query') || '';

  // Input sanitization: remove any unwanted characters
  searchTerm = searchTerm.replace(/[^a-zA-Z0-9\-]/g, '').toLowerCase();
  // console.log("searchTerm:", searchTerm);

  if (!searchTerm) {
    showPopup('Error! Ingrese un término de búsqueda válido.');
    window.location.href = '../index.html'; // Redirect to search page
    return;
  }

  // Update the page title and breadcrumb
  document.title = `${capitalizeFirstLetter(searchTerm)} - AURIDAL S.L.`;

  const breadcrumb = document.querySelector('.product-title p');
  console.log("Breadcrumb:", breadcrumb);

  breadcrumb.innerHTML = `
  <!-- Home SVG icon -->
  <a href="../index.html" style="text-decoration: none; color: inherit;">
      <svg href="../index.html" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-house" viewBox="0 0 16 16">
          <path fill-rule="evenodd" d="M8 .134l6.571 5.428c.326.27.429.745.245 1.12a.857.857 0 0 1-.794.48H12.86v5.527a.857.857 0 0 1-.857.857h-1.715a.857.857 0 0 1-.857-.857V9.429H6.571v3.857a.857.857 0 0 1-.857.857H4a.857.857 0 0 1-.857-.857V7.163H2.128a.857.857 0 0 1-.794-.48.857.857 0 0 1 .245-1.12L8 .134z"/>
      </svg>
  </a>
    &gt Resultados de búsqueda &gt
    <span style="text-decoration: none; color: inherit;">${searchTerm}</span>
    </a>
  `;
  
  // List of data files to fetch
  const dataFiles = [
    'data/products/colores.json',
    'data/products/clasico.json',
    'data/products/moderno.json'
  ];

  // Fetch and process all data files
  Promise.all(dataFiles.map(fetchData))
    .then(allDataArrays => {
      // Combine all products into a single array
      const allProducts = [].concat(...allDataArrays);

      const filteredProducts = allProducts.filter(product => {
        const id = product.id.toLowerCase();
        console.log("search-id:", id);
      
        // Check if the product ID contains the search term, allowing partial matches like '318-3'
        if (id.includes(searchTerm)) {
          console.log("Matched ID:", id);
          return true;
        }
        
        return false;
      });

      // Display the results
      displayResults(filteredProducts, searchTerm);
    })
    .catch(error => {
      console.error('Error fetching product data:', error);
      const resultsContainer = document.getElementById('resultsContainer');
      if (resultsContainer) {
        resultsContainer.innerText = 'Ocurrió un error al cargar los productos. Por favor, inténtelo de nuevo.';
      }
    });
});

// Function to fetch data from a JSON file
function fetchData(filePath) {
  return fetch(filePath)
    .then(response => response.json())
    .then(data => {
      // Determine category based on the file path
      const category = filePath.replace('data/', '').replace('.json', '');
      // Ensure data is an array
      const products = Array.isArray(data) ? data : [data];
      // Add category to each product
      products.forEach(product => {
        product.category = category;
      });
      return products;
    });
}
  
// Function to handle click events on the carousel buttons
function handleClick(event, buttonElement, direction) {
  event.stopPropagation(); // Prevent click from triggering parent onclick
  const listWrapper = buttonElement.parentElement;
  const carouselList = listWrapper.querySelector('.carousel');
  const items = carouselList.querySelectorAll('.item');
  let currentIndex = Array.from(items).findIndex(item => item.style.display !== 'none');

  // Hide the current item
  items[currentIndex].style.display = 'none';

  // Calculate the next index
  if (direction === 'next') {
    currentIndex = (currentIndex + 1) % items.length;
  } else if (direction === 'previous') {
    currentIndex = (currentIndex - 1 + items.length) % items.length;
  }

  // Show the next item
  items[currentIndex].style.display = 'block';
}

// Function to redirect to the product page
function redirectToProduct(productId, category) {
  category =  category.replace("products/", "");
  console.log(`Redirecting to Product ID: ${productId}, Category: ${category}`);
  window.location.href = `../product.html?id=${encodeURIComponent(productId)}&category=${encodeURIComponent(category)}`;
}

// Function to display the results
function displayResults(products, searchTerm) {
  const resultsContainer = document.getElementById('searchResultsContainer');
  const noResultsContainer = document.getElementById('noResultsContainer');

  resultsContainer.innerHTML = ''; // Clear previous results if any

  if (products.length === 0) {
    // Hide results container and show no results container
    resultsContainer.style.display = 'none';
    noResultsContainer.style.display = 'block';
    
    // Display the no results image and search term
    noResultsContainer.innerHTML = `
      <div class="no-results-container">
        <img src="/images/noResults.jpg" alt="No Results Found" class="no-results">
        <p>No se encontraron productos para "<strong>${searchTerm}</strong>".</p>
      </div>
    `;
    return;
  } else {
    // Hide no results container and show results container
    noResultsContainer.style.display = 'none';
    resultsContainer.style.display = 'block';
  }

  // Create a grid to hold the product items
  const productGrid = document.createElement('div');
  productGrid.classList.add('product-grid');

  products.forEach(product => {
    const category = product.category;

    // Create the product item element
    const productItem = document.createElement('div');
    productItem.classList.add('product-item');
    productItem.setAttribute('data-product-id', product.id);
    productItem.setAttribute('data-category', category);

    // Attach the onclick event to redirect to product.html
    productItem.onclick = function () {
      redirectToProduct(product.id, category);
    };

    // Build the inner HTML (image carousel and product name)
    // Create the list-wrapper
    const listWrapper = document.createElement('div');
    listWrapper.classList.add('list-wrapper');

    // Create the carousel list
    const carouselList = document.createElement('ul');
    carouselList.classList.add('list', 'carousel');

    // Add images to the carousel
    product.images.forEach((imageSrc, index) => {
      const listItem = document.createElement('li');
      listItem.classList.add('item');

      // Show only the first image initially
      if (index !== 0) {
        listItem.style.display = 'none';
      }

      const img = document.createElement('img');
      img.src = imageSrc;
      img.alt = `${product.name} Image ${index + 1}`;
      img.classList.add('carousel-image');

      listItem.appendChild(img);
      carouselList.appendChild(listItem);
    });

    // Create navigation buttons
    const prevButton = document.createElement('button');
    prevButton.classList.add('button', 'button--previous');
    prevButton.type = 'button';
    prevButton.textContent = '❮';
    prevButton.onclick = function(event) {
      handleClick(event, this, 'previous');
    };

    const nextButton = document.createElement('button');
    nextButton.classList.add('button', 'button--next');
    nextButton.type = 'button';
    nextButton.textContent = '❯';
    nextButton.onclick = function(event) {
      handleClick(event, this, 'next');
    };

    // Assemble the list-wrapper
    listWrapper.appendChild(carouselList);
    listWrapper.appendChild(prevButton);
    listWrapper.appendChild(nextButton);

    // Create the product name element
    const productName = document.createElement('h2');
    productName.textContent = product.name;

    // Assemble the product item
    productItem.appendChild(listWrapper);
    productItem.appendChild(productName);

    // Append the product item to the grid
    productGrid.appendChild(productItem);
  });

  // Append the grid to the results container
  resultsContainer.appendChild(productGrid);
}
