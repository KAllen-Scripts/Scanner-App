const lastScan = document.getElementById('last-scan');
const scanStatus = document.getElementById('scan-status');
let buffer = '';

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

async function handleBarcode(barcode) {
  try {
    // Check if all required settings are present
    const details = JSON.parse(localStorage.getItem('stockDetails') || '{}');
    const stockOutLocation = details.stockOutLocation || '';
    const stockOutBin = details.stockOutBin || '';
    const stockInLocation = details.stockInLocation || '';
    const stockInBin = details.stockInBin || '';
    
    // Specific checks for stock details
    if (!stockOutLocation) {
      throw new Error('Stock Out Location Name is required');
    }
    if (!stockOutBin) {
      throw new Error('Stock Out Bin Name is required');
    }
    if (!stockInLocation) {
      throw new Error('Stock In Location Name is required');
    }
    if (!stockInBin) {
      throw new Error('Stock In Bin Name is required');
    }

    // First get the item details
    const itemBarcodeResponse = await window.stoklyAPI.requester('get', `https://api.dev.stok.ly/v0/item-barcodes?filter=[barcode]=={${barcode}}`);
    const itemId = itemBarcodeResponse.data[0]?.itemId;
    if (!itemId) {
      throw new Error(`Item not found for barcode: ${barcode}`);
    }

    // Second group: Get item type and locations in parallel
    const [itemTypeResponse, locationsResponse] = await Promise.all([
      window.stoklyAPI.requester('get', `https://api.dev.stok.ly/v0/items/${itemId}`),
      window.stoklyAPI.requester('get', `https://api.dev.stok.ly/v0/locations?filter=[name]=={${encodeURIComponent(stockOutLocation)}}||[name]=={${encodeURIComponent(stockInLocation)}}`)
    ]);

    const itemType = itemTypeResponse.data?.typeName;
    if (!itemType) {
      throw new Error('Item type not found for scanned item');
    }

    // Process locations with specific error messages
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

    // Check for missing locations with specific messages
    if (!stockOutLocationID) {
      throw new Error(`Stock Out Location "${stockOutLocation}" not found`);
    }
    if (!stockInLocationID) {
      throw new Error(`Stock In Location "${stockInLocation}" not found`);
    }

    // Third group: Get default item and bins in parallel
    const [defaultItemResponse, binsResponse] = await Promise.all([
      window.stoklyAPI.requester('get', `https://api.dev.stok.ly/v0/items?filter=[typeName]=={${encodeURIComponent(itemType)}}%26%26[tags]::{Default}`),
      window.stoklyAPI.requester('get', `https://api.dev.stok.ly/v0/bins?filter=[locationId]=={${stockOutLocationID}}||[locationId]=={${stockInLocationID}}`)
    ]);

    const defaultItemId = defaultItemResponse.data[0]?.itemId;
    if (!defaultItemId) {
      throw new Error(`Default item not found for type: ${itemType}`);
    }

    // Process bins with specific error messages
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

    // Check for missing bins with specific messages
    if (!stockOutBinId) {
      throw new Error(`Stock Out Bin "${stockOutBin}" not found in location "${stockOutLocation}"`);
    }
    if (!stockInBinId) {
      throw new Error(`Stock In Bin "${stockInBin}" not found in location "${stockInLocation}"`);
    }

    // Make adjustments
    if (stockOutBinId === stockInBinId && stockOutLocationID === stockInLocationID) {
      // Single adjustment when same location
      await window.stoklyAPI.requester('post', `https://api.dev.stok.ly/v1/adjustments`, {
        locationId: stockOutLocationID,
        binId: stockOutBinId,
        reason: "Adjustment from scanner app",
        items: [
          {
            itemId: defaultItemId,
            quantity: -1
          },
          {
            itemId: itemId,
            quantity: 1
          }
        ]
      });
    } else {
      // Run both adjustments in parallel for different locations
      await Promise.all([
        window.stoklyAPI.requester('post', `https://api.dev.stok.ly/v1/adjustments`, {
          locationId: stockOutLocationID,
          binId: stockOutBinId,
          reason: "Adjustment from scanner app",
          items: [
            {
              itemId: defaultItemId,
              quantity: -1
            }
          ]
        }),
        window.stoklyAPI.requester('post', `https://api.dev.stok.ly/v1/adjustments`, {
          locationId: stockInLocationID,
          binId: stockInBinId,
          reason: "Adjustment from scanner app",
          items: [
            {
              itemId: itemId,
              quantity: 1
            }
          ]
        })
      ]).catch(error => {
        throw new Error('Failed to make adjustments: ' + error.message);
      });
    }

    // Success feedback
    scanStatus.textContent = 'Scan successful!';
    scanStatus.classList.add('success');
    scanStatus.classList.remove('error');
    setTimeout(function () {
      scanStatus.textContent = 'Ready to scan...';
      scanStatus.classList.remove('success');
    }, 600);
  } catch (err) {
    console.error('Scan error:', err.message);  // Log error for debugging
    
    // Error feedback
    buzzerAudio.currentTime = 0;
    buzzerAudio.play().catch(e => console.error('Audio error:', e));
    
    // Show error state immediately
    scanStatus.style.transition = 'background-color 0.3s';
    scanStatus.style.backgroundColor = '#ff0000';
    scanStatus.classList.remove('success');
    scanStatus.classList.add('error');
    scanStatus.textContent = err.message || 'Error!';
    
    // Clear any existing timeouts
    if (window._errorTimeout) {
      clearTimeout(window._errorTimeout);
    }
    
    // Keep error visible for 2 seconds before changing anything
    window._errorTimeout = setTimeout(function () {
      scanStatus.style.backgroundColor = '';
      scanStatus.classList.remove('error');
      scanStatus.textContent = 'Ready to scan...';
    }, 2000);
  }
}

// Modal logic
credBtn.addEventListener('click', async () => {
  // Hide other modals first
  stockModal.style.display = 'none';
  // Load credentials from main process
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
  if (credModal.style.display === 'flex') return;
  if (e.key === 'Enter') {
    const value = buffer.trim();
    if (value) {
      lastScan.textContent = `Last scanned: ${value}`;
      buffer = '';
      // Let handleBarcode manage all status updates
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
});