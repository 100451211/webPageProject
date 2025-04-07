function loadCategory(category) {
    url= `../data/products/${category}.json`
    fetch(url)
        .then(response => response.json())
        .then(products => {
            const productGrid = document.getElementsByClassName('product-grid')[0];
            productGrid.innerHTML = '';

            products.forEach(product => {
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
                    event.stopPropagation(); // Prevent click from triggering parent onclick
                    handleClick(event, this, 'previous');
                };

                const nextButton = document.createElement('button');
                nextButton.classList.add('button', 'button--next');
                nextButton.type = 'button';
                nextButton.textContent = '❯';
                nextButton.onclick = function(event) {
                    event.stopPropagation();
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
        })
        .catch(error => console.error('Error loading products:', error));
}

function redirectToProduct(productId, category) {
    window.location.href = `../product.html?category=${encodeURIComponent(category)}&id=${encodeURIComponent(productId)}`;
}

function handleClick(event, buttonElement, direction) {
    event.stopPropagation(); // Prevents the click from triggering parent onclick

    const listWrapper = buttonElement.parentElement;
    const carousel = listWrapper.querySelector('.carousel');
    const items = carousel.querySelectorAll('.item');
    const totalItems = items.length;

    // Find the index of the currently visible item
    let currentIndex = Array.from(items).findIndex(item => item.style.display !== 'none');

    // Hide the current item
    items[currentIndex].style.display = 'none';

    // Calculate the new index
    if (direction === 'next') {
        currentIndex = (currentIndex + 1) % totalItems;
    } else {
        currentIndex = (currentIndex - 1 + totalItems) % totalItems;
    }

    // Show the new item
    items[currentIndex].style.display = 'block';
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

