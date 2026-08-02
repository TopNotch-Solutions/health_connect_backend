require("dotenv").config();
const crypto = require("crypto");
const fetch = require("node-fetch");

const DPO_INITIATE_URL = "https://secure.paygate.co.za/payweb3/initiate.trans";
const DPO_QUERY_URL = "https://secure.paygate.co.za/payweb3/query.trans";

const DPO_CURRENCY = process.env.DPO_CURRENCY || "NAD";
const DPO_LOCALE = process.env.DPO_LOCALE || "en-za";
const DPO_COUNTRY = process.env.DPO_COUNTRY || "NAM";
// Must match the URL the app watches for to know the payment page is done.
const DPO_RETURN_URL = process.env.DPO_RETURN_URL || "https://kopanovertex.com";

// The app used to build this from the device clock, which is UTC+2 in Namibia.
// Pin the zone so it does not change with the server's own timezone.
const DPO_TIME_ZONE = process.env.DPO_TIME_ZONE || "Africa/Windhoek";

// PayWeb3 only considers a transaction paid on this exact pair. Every other
// status/result combination is treated as not paid.
const APPROVED_TRANSACTION_STATUS = 1;
const APPROVED_RESULT_CODE = 990017;

const md5 = (value) => crypto.createHash("md5").update(value).digest("hex");

// PayGate expects TRANSACTION_DATE as "YYYY-MM-DD HH:mm:ss".
const dpoDateString = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DPO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

const requireCredentials = () => {
  const paygateId = process.env.DPO_PAYGATE_ID;
  const encryptionKey = process.env.DPO_ENCRYPTION_KEY;

  if (!paygateId || !encryptionKey) {
    throw new Error("Missing DPO_PAYGATE_ID or DPO_ENCRYPTION_KEY env vars.");
  }

  return { paygateId, encryptionKey };
};

/**
 * Open a payment with PayGate and return the identifiers the app needs to
 * render the hosted payment page.
 *
 * The amount and email are supplied by our own controller from the package
 * and the authenticated user — never by the client — so a caller cannot pay
 * a small amount and claim an expensive package.
 *
 * @param {string} reference - unique reference we generate for this attempt
 * @param {number} amountInCents
 * @param {string} emailAddress
 */
async function initiateDpoPayment(reference, amountInCents, emailAddress) {
  const { paygateId, encryptionKey } = requireCredentials();
  const transactionDate = dpoDateString();

  // Field order here is part of the contract — PayGate recomputes the same
  // concatenation on its side and rejects any mismatch.
  const checksum = md5(
    paygateId +
      reference +
      amountInCents +
      DPO_CURRENCY +
      DPO_RETURN_URL +
      transactionDate +
      DPO_LOCALE +
      DPO_COUNTRY +
      emailAddress +
      encryptionKey,
  );

  const formData = new URLSearchParams();
  formData.append("PAYGATE_ID", paygateId);
  formData.append("REFERENCE", reference);
  formData.append("AMOUNT", String(amountInCents));
  formData.append("CURRENCY", DPO_CURRENCY);
  formData.append("RETURN_URL", DPO_RETURN_URL);
  formData.append("TRANSACTION_DATE", transactionDate);
  formData.append("LOCALE", DPO_LOCALE);
  formData.append("COUNTRY", DPO_COUNTRY);
  formData.append("EMAIL", emailAddress);
  // The encryption key is only ever hashed into CHECKSUM, never sent.
  formData.append("CHECKSUM", checksum);

  const response = await fetch(DPO_INITIATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const body = await response.text();
  if (!body || !body.includes("PAY_REQUEST_ID")) {
    console.warn("DPO initiate failed, raw response:", body);
    return { success: false };
  }

  const values = new URLSearchParams(body);
  return {
    success: true,
    payRequestId: values.get("PAY_REQUEST_ID") || undefined,
    checksum: values.get("CHECKSUM") || undefined,
  };
}

/**
 * Ask PayGate directly whether a transaction was actually paid.
 * The client is never trusted for this — it only supplies the identifiers,
 * and PayGate is the sole authority on whether money changed hands.
 *
 * @param {string} payRequestId - PAY_REQUEST_ID returned by initiate.trans
 * @param {string} reference - the REFERENCE used when initiating
 */
async function queryDpoTransaction(payRequestId, reference) {
  const { paygateId, encryptionKey } = requireCredentials();

  // The query checksum is its own hash of PAYGATE_ID + PAY_REQUEST_ID +
  // REFERENCE + ENCRYPTION_KEY. It is not the checksum returned by initiate.
  const checksum = md5(paygateId + payRequestId + reference + encryptionKey);

  const formData = new URLSearchParams();
  formData.append("PAYGATE_ID", paygateId);
  formData.append("PAY_REQUEST_ID", payRequestId);
  formData.append("REFERENCE", reference);
  formData.append("CHECKSUM", checksum);

  const response = await fetch(DPO_QUERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const body = await response.text();
  if (!body || !body.includes("PAYGATE_ID")) {
    console.warn("DPO query returned an unreadable response:", body);
    return { paid: false, reason: "Could not reach the payment provider." };
  }

  const values = new URLSearchParams(body);
  const transactionStatus = Number(values.get("TRANSACTION_STATUS"));
  const resultCode = Number(values.get("RESULT_CODE"));
  const amount = values.get("AMOUNT");

  const paid =
    transactionStatus === APPROVED_TRANSACTION_STATUS &&
    resultCode === APPROVED_RESULT_CODE;

  return {
    paid,
    reason: paid
      ? undefined
      : values.get("RESULT_DESC") || "Transaction not approved.",
    // PayGate reports AMOUNT in cents. It is absent on some error responses.
    amountInCents: amount ? Number(amount) : null,
    currency: values.get("CURRENCY") || null,
    transactionStatus,
    resultCode,
  };
}

module.exports = { initiateDpoPayment, queryDpoTransaction };
