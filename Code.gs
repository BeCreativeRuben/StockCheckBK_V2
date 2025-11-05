// Google Apps Script for Battlekart Stock Management System
// This script should be deployed as a Web App with:
// - Execute as: Me
// - Who has access: Anyone

// Spreadsheet Configuration
const SPREADSHEET_ID = '12gHHK06tSex6EOZuPsLaZMgsqk9gNv4XYqgF3Kp5Qqs';
const SHEET_STOCK_DATA = 'Stock Data';
const SHEET_LOGGING = 'Logging';
const SHEET_CONFIG = 'Config';

// Get Spreadsheet
function getSpreadsheet() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (error) {
    console.error('Error opening spreadsheet:', error);
    throw new Error('Cannot open spreadsheet. Check if the ID is correct and the spreadsheet is accessible. Error: ' + error.toString());
  }
}

// Get Sheet by Name
function getSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  
  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    
    // Set headers based on sheet name
    if (sheetName === SHEET_STOCK_DATA) {
      sheet.getRange(1, 1, 1, 9).setValues([[
        'ID', 'Naam', 'Categorie', 'Eenheid', 'Minimum', 'Current', 
        'Laatste Wijziging', 'Gewijzigd Door', 'Sorteer Volgorde'
      ]]);
      sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    } else if (sheetName === SHEET_LOGGING) {
      sheet.getRange(1, 1, 1, 7).setValues([[
        'Timestamp', 'Gebruiker', 'Item ID', 'Item Naam', 'Veld', 'Oude Waarde', 'Nieuwe Waarde'
      ]]);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    } else if (sheetName === SHEET_CONFIG) {
      sheet.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]);
      sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    }
  }
  
  return sheet;
}

// Handle GET Requests
function doGet(e) {
  const action = e.parameter.action;
  
  try {
    if (action === 'read') {
      return readStockData();
    } else if (action === 'config') {
      return getConfig();
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Invalid action'
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle POST Requests
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  
  try {
    if (action === 'update') {
      return updateStock(data);
    } else if (action === 'updateItem') {
      return updateSingleItem(data);
    } else if (action === 'updateBatch') {
      return updateBatch(data);
    } else if (action === 'reset') {
      return resetStock(data);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Invalid action'
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Read Stock Data
function readStockData() {
  const sheet = getSheet(SHEET_STOCK_DATA);
  const data = sheet.getDataRange().getValues();
  
  // Skip header row
  const items = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0] !== '') { // Check if ID exists
      items.push({
        id: data[i][0],
        name: data[i][1] || '',
        category: data[i][2] || 'drank',
        unit: data[i][3] || '',
        minimum: data[i][4] || 0,
        current: data[i][5] || 0,
        lastModified: data[i][6] ? new Date(data[i][6]).toISOString() : new Date().toISOString(),
        modifiedBy: data[i][7] || '',
        sortOrder: data[i][8] || 0
      });
    }
  }
  
  const lastModified = getLastModifiedInfo();
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    items: items,
    lastModified: lastModified
  })).setMimeType(ContentService.MimeType.JSON);
}

// Update Stock Data
function updateStock(data) {
  const sheet = getSheet(SHEET_STOCK_DATA);
  const items = data.items || [];
  const user = data.user || 'Unknown';
  
  // Get existing data
  const existingData = sheet.getDataRange().getValues();
  const existingItems = {};
  
  // Build map of existing items (skip header)
  for (let i = 1; i < existingData.length; i++) {
    if (existingData[i][0] && existingData[i][0] !== '') {
      existingItems[existingData[i][0]] = {
        row: i + 1,
        oldValues: {
          current: existingData[i][5] || 0,
          minimum: existingData[i][4] || 0,
          unit: existingData[i][3] || ''
        }
      };
    }
  }
  
  const now = new Date();
  const timestamp = now.toISOString();
  
  // Update or insert items
  items.forEach(item => {
    const itemId = item.id;
    const row = existingItems[itemId] ? existingItems[itemId].row : null;
    
    if (row) {
      // Update existing row
      const oldValues = existingItems[itemId].oldValues;
      
      // Log changes
      if (item.current !== oldValues.current) {
        logChange({
          timestamp: timestamp,
          user: user,
          itemId: itemId,
          itemName: item.name,
          field: 'current',
          oldValue: oldValues.current,
          newValue: item.current
        });
      }
      
      if (item.minimum !== oldValues.minimum) {
        logChange({
          timestamp: timestamp,
          user: user,
          itemId: itemId,
          itemName: item.name,
          field: 'minimum',
          oldValue: oldValues.minimum,
          newValue: item.minimum
        });
      }
      
      if (item.unit !== oldValues.unit) {
        logChange({
          timestamp: timestamp,
          user: user,
          itemId: itemId,
          itemName: item.name,
          field: 'unit',
          oldValue: oldValues.unit,
          newValue: item.unit
        });
      }
      
      // Update row
      sheet.getRange(row, 1, 1, 9).setValues([[
        item.id,
        item.name,
        item.category,
        item.unit,
        item.minimum,
        item.current,
        timestamp,
        user,
        item.sortOrder || 0
      ]]);
    } else {
      // Insert new row
      const newRow = sheet.getLastRow() + 1;
      sheet.getRange(newRow, 1, 1, 9).setValues([[
        item.id,
        item.name,
        item.category,
        item.unit,
        item.minimum,
        item.current,
        timestamp,
        user,
        item.sortOrder || 0
      ]]);
      
      // Log new item
      logChange({
        timestamp: timestamp,
        user: user,
        itemId: itemId,
        itemName: item.name,
        field: 'new_item',
        oldValue: '',
        newValue: item.name
      });
    }
  });
  
  // Update config
  updateConfig(user, timestamp);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    lastModified: {
      lastModifiedBy: user,
      lastModifiedDate: timestamp
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

// Update Single Item (optimized for single field updates)
function updateSingleItem(data) {
  const sheet = getSheet(SHEET_STOCK_DATA);
  const item = data.item;
  const field = data.field;
  const user = data.user || 'Unknown';
  const now = new Date();
  const timestamp = now.toISOString();
  
  // Get all data to find the item
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  // Find the item row
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0] == item.id) {
      const row = i + 1;
      const oldValue = field === 'current' ? (values[i][5] || 0) : (values[i][4] || 0);
      const columnIndex = field === 'current' ? 6 : field === 'minimum' ? 5 : null;
      
      if (columnIndex) {
        // Update the field
        sheet.getRange(row, columnIndex).setValue(item.value);
        // Update timestamp and user
        sheet.getRange(row, 7).setValue(timestamp);
        sheet.getRange(row, 8).setValue(user);
        
        // Log change
        logChange({
          timestamp: timestamp,
          user: user,
          itemId: item.id,
          itemName: values[i][1] || '',
          field: field,
          oldValue: oldValue,
          newValue: item.value
        });
      }
      break;
    }
  }
  
  // Update config
  updateConfig(user, timestamp);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    lastModified: {
      lastModifiedBy: user,
      lastModifiedDate: timestamp
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

// Update Batch (multiple items in one request)
function updateBatch(data) {
  const sheet = getSheet(SHEET_STOCK_DATA);
  const updates = data.updates || [];
  const user = data.user || 'Unknown';
  const now = new Date();
  const timestamp = now.toISOString();
  
  // Get all data once
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  // Build map of existing items
  const itemRows = {};
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0] !== '') {
      itemRows[values[i][0]] = i + 1;
    }
  }
  
  // Process each update
  updates.forEach(update => {
    const row = itemRows[update.itemId];
    if (row) {
      const columnIndex = update.field === 'current' ? 6 : update.field === 'minimum' ? 5 : null;
      if (columnIndex) {
        const oldValue = values[row - 1][columnIndex - 1] || 0;
        
        // Update the field
        sheet.getRange(row, columnIndex).setValue(update.value);
        // Update timestamp and user
        sheet.getRange(row, 7).setValue(timestamp);
        sheet.getRange(row, 8).setValue(user);
        
        // Log change
        logChange({
          timestamp: timestamp,
          user: user,
          itemId: update.itemId,
          itemName: values[row - 1][1] || '',
          field: update.field,
          oldValue: oldValue,
          newValue: update.value
        });
      }
    }
  });
  
  // Update config once
  updateConfig(user, timestamp);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    lastModified: {
      lastModifiedBy: user,
      lastModifiedDate: timestamp
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

// Reset All Stock
function resetStock(data) {
  const sheet = getSheet(SHEET_STOCK_DATA);
  const user = data.user || 'Unknown';
  const dataRange = sheet.getDataRange().getValues();
  const now = new Date();
  const timestamp = now.toISOString();
  
  // Reset all current values (skip header)
  for (let i = 1; i < dataRange.length; i++) {
    if (dataRange[i][0] && dataRange[i][0] !== '') {
      const oldValue = dataRange[i][5] || 0;
      
      // Log reset
      logChange({
        timestamp: timestamp,
        user: user,
        itemId: dataRange[i][0],
        itemName: dataRange[i][1] || '',
        field: 'reset_current',
        oldValue: oldValue,
        newValue: 0
      });
      
      // Update current to 0
      sheet.getRange(i + 1, 6).setValue(0);
      sheet.getRange(i + 1, 7).setValue(timestamp);
      sheet.getRange(i + 1, 8).setValue(user);
    }
  }
  
  // Update config
  updateConfig(user, timestamp);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    lastModified: {
      lastModifiedBy: user,
      lastModifiedDate: timestamp
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

// Log Change
function logChange(changeData) {
  const sheet = getSheet(SHEET_LOGGING);
  const newRow = sheet.getLastRow() + 1;
  
  sheet.getRange(newRow, 1, 1, 7).setValues([[
    changeData.timestamp,
    changeData.user,
    changeData.itemId,
    changeData.itemName,
    changeData.field,
    changeData.oldValue,
    changeData.newValue
  ]]);
}

// Get Config
function getConfig() {
  const lastModified = getLastModifiedInfo();
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    lastModified: lastModified
  })).setMimeType(ContentService.MimeType.JSON);
}

// Get Last Modified Info
function getLastModifiedInfo() {
  const configSheet = getSheet(SHEET_CONFIG);
  const configData = configSheet.getDataRange().getValues();
  
  let lastModifiedBy = 'Unknown';
  let lastModifiedDate = new Date().toISOString();
  
  // Find config values (skip header)
  for (let i = 1; i < configData.length; i++) {
    if (configData[i][0] === 'LastModifiedBy') {
      lastModifiedBy = configData[i][1] || 'Unknown';
    } else if (configData[i][0] === 'LastModifiedDate') {
      lastModifiedDate = configData[i][1] || new Date().toISOString();
    }
  }
  
  return {
    lastModifiedBy: lastModifiedBy,
    lastModifiedDate: lastModifiedDate
  };
}

// Update Config
function updateConfig(user, timestamp) {
  const configSheet = getSheet(SHEET_CONFIG);
  const configData = configSheet.getDataRange().getValues();
  
  let lastModifiedByRow = -1;
  let lastModifiedDateRow = -1;
  
  // Find existing config rows (skip header)
  for (let i = 1; i < configData.length; i++) {
    if (configData[i][0] === 'LastModifiedBy') {
      lastModifiedByRow = i + 1;
    } else if (configData[i][0] === 'LastModifiedDate') {
      lastModifiedDateRow = i + 1;
    }
  }
  
  // Update or insert
  if (lastModifiedByRow > 0) {
    configSheet.getRange(lastModifiedByRow, 2).setValue(user);
  } else {
    const newRow = configSheet.getLastRow() + 1;
    configSheet.getRange(newRow, 1, 1, 2).setValues([['LastModifiedBy', user]]);
  }
  
  if (lastModifiedDateRow > 0) {
    configSheet.getRange(lastModifiedDateRow, 2).setValue(timestamp);
  } else {
    const newRow = configSheet.getLastRow() + 1;
    configSheet.getRange(newRow, 1, 1, 2).setValues([['LastModifiedDate', timestamp]]);
  }
  
  // Update LastSync
  let lastSyncRow = -1;
  for (let i = 1; i < configData.length; i++) {
    if (configData[i][0] === 'LastSync') {
      lastSyncRow = i + 1;
      break;
    }
  }
  
  if (lastSyncRow > 0) {
    configSheet.getRange(lastSyncRow, 2).setValue(timestamp);
  } else {
    const newRow = configSheet.getLastRow() + 1;
    configSheet.getRange(newRow, 1, 1, 2).setValues([['LastSync', timestamp]]);
  }
}

