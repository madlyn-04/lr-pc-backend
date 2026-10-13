const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "https://lunarays.in,https://www.lunarays.in,https://lunarays-pc-care.vercel.app")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  return true;
}

function validBooking(body) {
  return (
    body &&
    typeof body.fullName === "string" && body.fullName.trim().length > 0 &&
    typeof body.phone === "string" && body.phone.replace(/\D/g, "").length >= 10 &&
    typeof body.location === "string" && body.location.trim().length > 0 &&
    typeof body.deviceCategory === "string" && body.deviceCategory.trim().length > 0 &&
    typeof body.address === "string" && body.address.trim().length > 0 &&
    typeof body.issue === "string" && body.issue.trim().length > 0 &&
    typeof body.preferredServiceMode === "string" && body.preferredServiceMode.trim().length > 0
  );
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  const originAllowed = setCors(req, res);
  if (req.method === "OPTIONS") {
    if (!originAllowed) return json(res, 403, { error: "Request origin is not allowed." });
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed." });
  }

  if (origin && !originAllowed) {
    return json(res, 403, { error: "Request origin is not allowed." });
  }

  if (!validBooking(req.body)) {
    return json(res, 400, { error: "Please complete all required repair booking fields." });
  }

  const { GOOGLE_SHEETS_URL, GOOGLE_SHEETS_SECRET } = process.env;
  if (!GOOGLE_SHEETS_URL || !GOOGLE_SHEETS_SECRET) {
    console.error("Repair booking API is missing required environment variables.");
    return json(res, 503, { error: "Booking is temporarily unavailable. Please call us." });
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(GOOGLE_SHEETS_URL)) {
    console.error("GOOGLE_SHEETS_URL must be a Google Apps Script /exec URL.");
    return json(res, 500, { error: "Booking is temporarily unavailable. Please call us." });
  }

  const booking = {
    fullName: req.body.fullName.trim(),
    phone: req.body.phone.trim(),
    location: req.body.location,
    deviceCategory: req.body.deviceCategory,
    categoryDetails: req.body.categoryDetails || {},
    address: req.body.address.trim(),
    issue: req.body.issue.trim(),
    preferredServiceMode: req.body.preferredServiceMode,
    sourcePage: typeof req.body.sourcePage === "string" ? req.body.sourcePage.slice(0, 500) : "",
  };

  const sheetPayload = { token: GOOGLE_SHEETS_SECRET, ...booking };

  const [sheetResult] = await Promise.allSettled([
    fetch(GOOGLE_SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(sheetPayload),
      redirect: "follow",
    }).then((response) => {
      if (!response.ok) throw new Error(`Sheets service returned ${response.status}.`);
    }),
  ]);

  if (sheetResult.status === "rejected") console.error("Repair booking Sheets delivery failed:", sheetResult.reason);
  if (sheetResult.status === "rejected") {
    return json(res, 502, { error: "The booking was received by email, but could not be saved to Sheets." });
  }

  return json(res, 200, {
    success: true,
    sheetSent: sheetResult.status === "fulfilled",
  });
};
