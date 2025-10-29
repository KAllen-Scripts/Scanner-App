const lastScan = document.getElementById('last-scan');
const scanStatus = document.getElementById('scan-status');
const itemDropdown = document.getElementById('item-dropdown');
const scannedItemsList = document.getElementById('scanned-items-list');
const submitBtn = document.getElementById('submit-adjustments');
const clearListBtn = document.getElementById('clear-list');
let buffer = '';

// Selected item type from dropdown
let selectedItemType = null;
let selectedDefaultItemId = null;

// Data structure to store scanned items
// Key: barcode, Value: { barcode, itemType, itemName, itemId, defaultItemId, count, isCorrectType }
const scannedItems = new Map();

// Modal elements
const credBtn = document.getElementById('manage-credentials');
const credModal = document.getElementById('cred-modal');
const closeModal = document.getElementById('close-modal');
const credForm = document.getElementById('cred-form');
const apiKeyInput = document.getElementById('api-key');
const apiSecretInput = document.getElementById('api-secret');
const accountKeyInput = document.getElementById('account-key');

const buzzerAudio = new Audio('../assets/error-buzzer.wav');

// Stock details modal elements
const stockBtn = document.getElementById('manage-stock-details');
const stockModal = document.getElementById('stock-modal');
const closeStockModal = document.getElementById('close-stock-modal');
const stockForm = document.getElementById('stock-form');
const stockOutLocationInput = document.getElementById('stock-out-location');
const stockOutBinInput = document.getElementById('stock-out-bin');
const stockInLocationInput = document.getElementById('stock-in-location');
const stockInBinInput = document.getElementById('stock-in-bin');

// Edit quantity modal elements
const editQuantityModal = document.getElementById('edit-quantity-modal');
const closeEditModal = document.getElementById('close-edit-modal');
const editQuantityForm = document.getElementById('edit-quantity-form');
const editQuantityInput = document.getElementById('edit-quantity-input');
const editItemName = document.getElementById('edit-item-name');
const deleteItemBtn = document.getElementById('delete-item');
let currentEditingBarcode = null;

// Open stock details modal and pre-fill if available
stockBtn.addEventListener('click', () => {
  credModal.style.display = 'none';
  const details = JSON.parse(localStorage.getItem('stockDetails') || '{}');
  stockOutLocationInput.value = details.stockOutLocation || '';
  stockOutBinInput.value = details.stockOutBin || '';
  stockInLocationInput.value = details.stockInLocation || '';
  stockInBinInput.value = details.stockInBin || '';
  stockModal.style.display = 'flex';
});

closeStockModal.addEventListener('click', () => {
  stockModal.style.display = 'none';
});

stockForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const details = {
    stockOutLocation: stockOutLocationInput.value.trim(),
    stockOutBin: stockOutBinInput.value.trim(),
    stockInLocation: stockInLocationInput.value.trim(),
    stockInBin: stockInBinInput.value.trim()
  };
  localStorage.setItem('stockDetails', JSON.stringify(details));
  stockModal.style.display = 'none';
});

// Edit quantity modal handlers
function openEditModal(barcode) {
  const item = scannedItems.get(barcode);
  if (!item) return;
  
  currentEditingBarcode = barcode;
  editItemName.textContent = item.itemName;
  editQuantityInput.value = item.count;
  
  // Hide other modals
  credModal.style.display = 'none';
  stockModal.style.display = 'none';
  
  editQuantityModal.style.display = 'flex';
  editQuantityInput.focus();
  editQuantityInput.select();
}

closeEditModal.addEventListener('click', () => {
  editQuantityModal.style.display = 'none';
  currentEditingBarcode = null;
});

editQuantityForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  if (!currentEditingBarcode) return;
  
  const newQuantity = parseInt(editQuantityInput.value);
  
  if (isNaN(newQuantity) || newQuantity < 1) {
    alert('Please enter a valid quantity (minimum 1)');
    return;
  }
  
  const item = scannedItems.get(currentEditingBarcode);
  if (item) {
    item.count = newQuantity;
    scannedItems.set(currentEditingBarcode, item);
    updateUI();
  }
  
  editQuantityModal.style.display = 'none';
  currentEditingBarcode = null;
});

deleteItemBtn.addEventListener('click', () => {
  if (!currentEditingBarcode) return;
  
  if (confirm('Are you sure you want to remove this item from the list?')) {
    scannedItems.delete(currentEditingBarcode);
    updateUI();
    editQuantityModal.style.display = 'none';
    currentEditingBarcode = null;
  }
});

// Async function to load dropdown items
async function loadDropdownItems() {
  let returnArr = [];
  await window.stoklyAPI.loopThrough('https://api.dev.stok.ly/v0/items', 100, '', `(((([tags]::{Default}))))%26%26([status]!={1})`, (item)=>{
    returnArr.push(item.typeName);
  });
  return returnArr;
}

// Populate dropdown when user clicks/focuses on it
let dropdownLoaded = false;
itemDropdown.addEventListener('focus', async () => {
  if (!dropdownLoaded) {
    try {
      // Clear existing options except the first "-- Select --" option
      while (itemDropdown.options.length > 1) {
        itemDropdown.remove(1);
      }

      const items = await loadDropdownItems();
      
      // Add new options from the returned array
      items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.value || item;
        option.textContent = item.label || item;
        itemDropdown.appendChild(option);
      });
      
      dropdownLoaded = true;
    } catch (error) {
      console.error('Error loading dropdown items:', error);
    }
  }
});

// Handle dropdown selection change - fetch the default item for the selected type
itemDropdown.addEventListener('change', async () => {
  const selectedValue = itemDropdown.value;
  
  if (!selectedValue) {
    selectedItemType = null;
    selectedDefaultItemId = null;
    return;
  }
  
  try {
    selectedItemType = selectedValue;
    
    // Fetch the default item for this type
    const defaultItemResponse = await window.stoklyAPI.requester('get', 
      `https://api.dev.stok.ly/v0/items?filter=[typeName]=={${encodeURIComponent(selectedValue)}}%26%26[tags]::{Default}`);
    
    selectedDefaultItemId = defaultItemResponse.data[0]?.itemId;
    
    if (!selectedDefaultItemId) {
      throw new Error(`Default item not found for type: ${selectedValue}`);
    }
    
    console.log(`Selected item type: ${selectedItemType}, Default item ID: ${selectedDefaultItemId}`);
  } catch (error) {
    console.error('Error fetching default item:', error);
    scanStatus.textContent = 'Error loading default item';
    scanStatus.classList.add('error');
    setTimeout(() => {
      scanStatus.textContent = 'Ready to scan...';
      scanStatus.classList.remove('error');
    }, 2000);
  }
});

// Update the UI to show the current list of scanned items
function updateUI() {
  // Clear the list
  scannedItemsList.innerHTML = '';
  
  if (scannedItems.size === 0) {
    // Show empty message
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-message';
    emptyMsg.textContent = 'No items scanned yet';
    scannedItemsList.appendChild(emptyMsg);
    
    // Disable buttons
    submitBtn.disabled = true;
    clearListBtn.disabled = true;
  } else {
    // Show items
    scannedItems.forEach((item, barcode) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'scanned-item';
      itemDiv.style.cursor = 'pointer';
      
      // Add visual indicator for incorrect type
      if (!item.isCorrectType) {
        itemDiv.style.borderLeft = '4px solid #ff9800';
        itemDiv.style.backgroundColor = '#fff3e0';
      }
      
      // Add click handler to open edit modal
      itemDiv.addEventListener('click', () => {
        openEditModal(barcode);
      });
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'item-name';
      nameSpan.textContent = item.itemName || 'Unknown Item';
      
      // Add type indicator for incorrect items
      if (!item.isCorrectType) {
        const typeIndicator = document.createElement('span');
        typeIndicator.style.fontSize = '0.85em';
        typeIndicator.style.color = '#f57c00';
        typeIndicator.style.display = 'block';
        typeIndicator.textContent = `(${item.itemType})`;
        nameSpan.appendChild(typeIndicator);
      }
      
      const quantitySpan = document.createElement('span');
      quantitySpan.className = 'item-quantity';
      quantitySpan.textContent = item.count;
      
      itemDiv.appendChild(nameSpan);
      itemDiv.appendChild(quantitySpan);
      scannedItemsList.appendChild(itemDiv);
    });
    
    // Enable buttons
    submitBtn.disabled = false;
    clearListBtn.disabled = false;
  }
}

// Add or increment an item in the scanned list
async function handleBarcode(barcode) {
  try {
    // Check if an item type is selected
    if (!selectedItemType || !selectedDefaultItemId) {
      throw new Error('Please select an item type from the dropdown first');
    }
    
    // Check if item already exists in our list
    if (scannedItems.has(barcode)) {
      // Increment count
      const item = scannedItems.get(barcode);
      item.count++;
      scannedItems.set(barcode, item);
      
      // Success feedback
      scanStatus.textContent = `Added ${item.itemName} (${item.count})`;
      scanStatus.classList.add('success');
      scanStatus.classList.remove('error');
      setTimeout(function () {
        scanStatus.textContent = 'Ready to scan...';
        scanStatus.classList.remove('success');
      }, 600);
      
      updateUI();
      return;
    }
    
    // New item - need to look up details
    const itemBarcodeResponse = await window.stoklyAPI.requester('get', `https://api.dev.stok.ly/v0/item-barcodes?filter=[barcode]=={${barcode}}`);
    const itemId = itemBarcodeResponse.data[0]?.itemId;
    if (!itemId) {
      throw new Error(`Item not found for barcode: ${barcode}`);
    }

    // Get item details
    const itemTypeResponse = await window.stoklyAPI.requester('get', `https://api.dev.stok.ly/v0/items/${itemId}`);
    const itemType = itemTypeResponse.data?.typeName;
    const itemName = itemTypeResponse.data?.name;
    if (!itemType) {
      throw new Error('Item type not found for scanned item');
    }
    if (!itemName) {
      throw new Error('Item name not found for scanned item');
    }

    // Check if this item's type matches the selected type
    const isCorrectType = (itemType === selectedItemType);

    // Add to our list
    scannedItems.set(barcode, {
      barcode: barcode,
      itemType: itemType,
      itemName: itemName,
      itemId: itemId,
      defaultItemId: selectedDefaultItemId, // Use the selected default, not the item's own default
      count: 1,
      isCorrectType: isCorrectType
    });

    // Success feedback
    const typeIndicator = isCorrectType ? '' : ' [INCORRECT TYPE]';
    scanStatus.textContent = `Added ${itemName} (1)${typeIndicator}`;
    scanStatus.classList.add('success');
    scanStatus.classList.remove('error');
    setTimeout(function () {
      scanStatus.textContent = 'Ready to scan...';
      scanStatus.classList.remove('success');
    }, 600);
    
    updateUI();
  } catch (err) {
    console.error('Scan error:', err.message);
    
    // Error feedback
    buzzerAudio.currentTime = 0;
    buzzerAudio.play().catch(e => console.error('Audio error:', e));
    
    scanStatus.style.transition = 'background-color 0.3s';
    scanStatus.style.backgroundColor = '#ff0000';
    scanStatus.classList.remove('success');
    scanStatus.classList.add('error');
    scanStatus.textContent = err.message || 'Error!';
    
    if (window._errorTimeout) {
      clearTimeout(window._errorTimeout);
    }
    
    window._errorTimeout = setTimeout(function () {
      scanStatus.style.backgroundColor = '';
      scanStatus.classList.remove('error');
      scanStatus.textContent = 'Ready to scan...';
    }, 2000);
  }
}

// Submit all adjustments
async function submitAdjustments() {
  if (scannedItems.size === 0) return;
  
  try {
    // Disable button during processing
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    
    // Get stock details
    const details = JSON.parse(localStorage.getItem('stockDetails') || '{}');
    const stockOutLocation = details.stockOutLocation || '';
    const stockOutBin = details.stockOutBin || '';
    const stockInLocation = details.stockInLocation || '';
    const stockInBin = details.stockInBin || '';
    
    // Validate stock details
    if (!stockOutLocation) throw new Error('Stock Out Location Name is required');
    if (!stockOutBin) throw new Error('Stock Out Bin Name is required');
    if (!stockInLocation) throw new Error('Stock In Location Name is required');
    if (!stockInBin) throw new Error('Stock In Bin Name is required');

    // Get locations
    const locationsResponse = await window.stoklyAPI.requester('get', `https://api.dev.stok.ly/v0/locations?filter=[name]=={${encodeURIComponent(stockOutLocation)}}||[name]=={${encodeURIComponent(stockInLocation)}}`);
    
    let stockOutLocationID = '';
    let stockInLocationID = '';
    for (const location of locationsResponse.data) {
      if (location.name.toLowerCase().trim() === stockOutLocation.trim().toLowerCase()) {
        stockOutLocationID = location.locationId;
      }
      if (location.name.toLowerCase().trim() === stockInLocation.trim().toLowerCase()) {
        stockInLocationID = location.locationId;
      }
    }

    if (!stockOutLocationID) throw new Error(`Stock Out Location "${stockOutLocation}" not found`);
    if (!stockInLocationID) throw new Error(`Stock In Location "${stockInLocation}" not found`);

    // Get bins
    const binsResponse = await window.stoklyAPI.requester('get', `https://api.dev.stok.ly/v0/bins?filter=[locationId]=={${stockOutLocationID}}||[locationId]=={${stockInLocationID}}`);
    
    let stockOutBinId = '';
    let stockInBinId = '';
    for (const bin of binsResponse.data) {
      if (bin.locationId === stockOutLocationID && bin.name.trim().toLowerCase() === stockOutBin.trim().toLowerCase()) {
        stockOutBinId = bin.binId;
      }
      if (bin.locationId === stockInLocationID && bin.name.trim().toLowerCase() === stockInBin.trim().toLowerCase()) {
        stockInBinId = bin.binId;
      }
    }

    if (!stockOutBinId) throw new Error(`Stock Out Bin "${stockOutBin}" not found in location "${stockOutLocation}"`);
    if (!stockInBinId) throw new Error(`Stock In Bin "${stockInBin}" not found in location "${stockInLocation}"`);

    // Separate items into correct type vs incorrect type
    const correctTypeItems = [];
    const incorrectTypeItemsByType = new Map(); // Group incorrect items by their type
    let totalItemCount = 0;
    
    scannedItems.forEach((item) => {
      totalItemCount += item.count;
      
      if (item.isCorrectType) {
        correctTypeItems.push(item);
      } else {
        if (!incorrectTypeItemsByType.has(item.itemType)) {
          incorrectTypeItemsByType.set(item.itemType, []);
        }
        incorrectTypeItemsByType.get(item.itemType).push(item);
      }
    });

    // Array to hold all adjustment promises
    const adjustmentPromises = [];

    // 1. Create adjustment to stock OUT the default item (by total count of all items)
    if (totalItemCount > 0) {
      adjustmentPromises.push(
        window.stoklyAPI.requester('post', `https://api.dev.stok.ly/v1/adjustments`, {
          locationId: stockOutLocationID,
          binId: stockOutBinId,
          reason: "Adjustment from scanner app",
          items: [{
            itemId: selectedDefaultItemId,
            quantity: -totalItemCount
          }]
        })
      );
    }

    // 2. Create adjustment to stock IN correct type items (if any)
    if (correctTypeItems.length > 0) {
      const stockInMap = new Map();
      
      correctTypeItems.forEach((item) => {
        // Stock in the scanned item
        if (stockInMap.has(item.itemId)) {
          stockInMap.set(item.itemId, stockInMap.get(item.itemId) + item.count);
        } else {
          stockInMap.set(item.itemId, item.count);
        }
      });
      
      const stockInItems = [];
      stockInMap.forEach((quantity, itemId) => {
        stockInItems.push({ itemId, quantity });
      });

      adjustmentPromises.push(
        window.stoklyAPI.requester('post', `https://api.dev.stok.ly/v1/adjustments`, {
          locationId: stockInLocationID,
          binId: stockInBinId,
          reason: "Adjustment from scanner app",
          items: stockInItems
        })
      );
    }

    // 3. Create separate adjustments for each incorrect type
    incorrectTypeItemsByType.forEach((items, itemType) => {
      const stockInMap = new Map();
      
      items.forEach((item) => {
        // Only stock in the scanned item (no stock out for incorrect types)
        if (stockInMap.has(item.itemId)) {
          stockInMap.set(item.itemId, stockInMap.get(item.itemId) + item.count);
        } else {
          stockInMap.set(item.itemId, item.count);
        }
      });
      
      const stockInItems = [];
      stockInMap.forEach((quantity, itemId) => {
        stockInItems.push({ itemId, quantity });
      });
      
      // Create adjustment with "Incorrect stock" reason
      adjustmentPromises.push(
        window.stoklyAPI.requester('post', `https://api.dev.stok.ly/v1/adjustments`, {
          locationId: stockInLocationID,
          binId: stockInBinId,
          reason: `Incorrect stock - ${selectedItemType}`,
          items: stockInItems
        })
      );
    });

    // Execute all adjustments in parallel
    await Promise.all(adjustmentPromises);

    // Success!
    scanStatus.textContent = 'Adjustments submitted successfully!';
    scanStatus.classList.add('success');
    scanStatus.classList.remove('error');
    
    // Clear the list
    scannedItems.clear();
    updateUI();
    
    setTimeout(function () {
      scanStatus.textContent = 'Ready to scan...';
      scanStatus.classList.remove('success');
      submitBtn.textContent = 'Submit Adjustments';
    }, 2000);
    
  } catch (err) {
    console.error('Submit error:', err.message);
    
    // Error feedback
    buzzerAudio.currentTime = 0;
    buzzerAudio.play().catch(e => console.error('Audio error:', e));
    
    scanStatus.style.transition = 'background-color 0.3s';
    scanStatus.style.backgroundColor = '#ff0000';
    scanStatus.classList.remove('success');
    scanStatus.classList.add('error');
    scanStatus.textContent = err.message || 'Submission failed!';
    
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Adjustments';
    
    if (window._errorTimeout) {
      clearTimeout(window._errorTimeout);
    }
    
    window._errorTimeout = setTimeout(function () {
      scanStatus.style.backgroundColor = '';
      scanStatus.classList.remove('error');
      scanStatus.textContent = 'Ready to scan...';
    }, 3000);
  }
}

// Clear the list
function clearList() {
  scannedItems.clear();
  updateUI();
  
  scanStatus.textContent = 'List cleared';
  scanStatus.classList.add('success');
  scanStatus.classList.remove('error');
  
  setTimeout(function () {
    scanStatus.textContent = 'Ready to scan...';
    scanStatus.classList.remove('success');
  }, 600);
}

// Button event listeners
submitBtn.addEventListener('click', submitAdjustments);
clearListBtn.addEventListener('click', clearList);

// Modal logic
credBtn.addEventListener('click', async () => {
  stockModal.style.display = 'none';
  const creds = await window.credentials.load();
  apiKeyInput.value = creds.apiKey || '';
  apiSecretInput.value = creds.apiSecret || '';
  accountKeyInput.value = creds.accountKey || '';
  credModal.style.display = 'flex';
});

closeModal.addEventListener('click', () => {
  credModal.style.display = 'none';
});

credForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  const apiSecret = apiSecretInput.value.trim();
  const accountKey = accountKeyInput.value.trim();
  await window.credentials.save(apiKey, apiSecret, accountKey);
  credModal.style.display = 'none';
});

// Reset buffer on any click event
document.addEventListener('click', () => {
  buffer = '';
});

// Barcode scan logic
window.addEventListener('keydown', async function (e) {
  // Ignore input if modal is open
  if (credModal.style.display === 'flex' || stockModal.style.display === 'flex' || editQuantityModal.style.display === 'flex') return;
  
  if (e.key === 'Enter') {
    const value = buffer.trim();
    if (value) {
      lastScan.textContent = `Last scanned: ${value}`;
      buffer = '';
      handleBarcode(value);
    }
  } else if (e.key.length === 1) {
    buffer += e.key;
  }
});

// Initialize Stokly API on startup
window.addEventListener('DOMContentLoaded', async () => {
  const creds = await window.credentials.load();
  await window.stoklyAPI.initializeStoklyAPI({
    accountKey: creds.accountKey,
    clientId: creds.apiKey,
    secretKey: creds.apiSecret
  });
  
  // Initialize UI
  updateUI();
});