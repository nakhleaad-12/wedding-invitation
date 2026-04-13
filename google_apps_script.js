var sheetName = "Guests";
var scriptProp = PropertiesService.getScriptProperties();

function initialSetup() {
  var activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  scriptProp.setProperty("key", activeSpreadsheet.getId());
}

function getSheet_() {
  var spreadsheetId = scriptProp.getProperty("key");
  return SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
}

function getHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function findGuestRowById_(sheet, guestId) {
  if (!guestId) return -1;

  var finder = sheet
    .getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1)
    .createTextFinder(String(guestId))
    .matchEntireCell(true);

  var cell = finder.findNext();
  return cell ? cell.getRow() : -1;
}

function rowToObject_(headers, rowValues) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = rowValues[i];
  }
  return obj;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var sheet = getSheet_();
    var headers = getHeaders_(sheet);

    var incomingGuestId =
      e.parameter["gid"] || e.parameter["guest_id"] || "unknown";

    var existingRow = findGuestRowById_(sheet, incomingGuestId);
    var targetRow = existingRow > -1 ? existingRow : sheet.getLastRow() + 1;

    var existingRowData =
      existingRow > -1
        ? sheet.getRange(existingRow, 1, 1, headers.length).getValues()[0]
        : new Array(headers.length).fill("");

    var newRow = headers.map(function (header, index) {
      var paramValue = e.parameter[header];

      if (header === "timestamp") {
        return new Date();
      }

      if (header === "guests") {
        if (
          e.parameter["guests"] !== undefined &&
          e.parameter["guests"] !== ""
        ) {
          return e.parameter["guests"] === "1" ? "Yes" : "No";
        }
        return existingRowData[index];
      }

      if (header === "attending_count") {
        if (e.parameter["guests"] === "na") {
          return 0;
        }

        if (
          e.parameter["attending_count"] !== undefined &&
          e.parameter["attending_count"] !== ""
        ) {
          return Number(e.parameter["attending_count"]);
        }

        if (
          e.parameter["npersons"] !== undefined &&
          e.parameter["npersons"] !== ""
        ) {
          return Number(e.parameter["npersons"]);
        }

        return existingRowData[index];
      }

      if (header === "allowed_persons") {
        if (paramValue !== undefined && paramValue !== "") {
          return Number(paramValue);
        }
        return existingRowData[index];
      }

      if (paramValue !== undefined && paramValue !== "") {
        return paramValue;
      }

      return existingRowData[index];
    });

    sheet.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);

    // clear cached guest after update
    var cache = CacheService.getScriptCache();
    cache.remove("guest_" + String(incomingGuestId));

    return ContentService.createTextOutput(
      JSON.stringify({
        result: "success",
        msg: "success",
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    var errorDetails = err && err.stack ? err.stack.toString() : err.toString();
    return ContentService.createTextOutput(
      JSON.stringify({
        result: "error",
        error: errorDetails,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var guestIdParam = e.parameter.guest_id;

  if (!guestIdParam) {
    return ContentService.createTextOutput(
      JSON.stringify({
        result: "error",
        msg: "No guest_id provided",
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = "guest_" + String(guestIdParam);
    var cached = cache.get(cacheKey);

    if (cached) {
      return ContentService.createTextOutput(cached).setMimeType(
        ContentService.MimeType.JSON,
      );
    }

    var sheet = getSheet_();
    var headers = getHeaders_(sheet);
    var rowNumber = findGuestRowById_(sheet, guestIdParam);

    if (rowNumber === -1) {
      return ContentService.createTextOutput(
        JSON.stringify({
          result: "error",
          msg: "Guest not found",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var rowValues = sheet
      .getRange(rowNumber, 1, 1, headers.length)
      .getValues()[0];
    var guestData = rowToObject_(headers, rowValues);

    var response = JSON.stringify({
      result: "success",
      guest: guestData,
    });

    cache.put(cacheKey, response, 300); // 5 minutes

    return ContentService.createTextOutput(response).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({
        result: "error",
        error: err.toString(),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
