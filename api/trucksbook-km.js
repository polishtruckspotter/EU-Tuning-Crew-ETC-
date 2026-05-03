const DRIVER_PROFILES = {
  polishtruckspotter: { id: "570956", profileUrl: "https://trucksbook.eu/profile/570956", joinDate: "2026-03-27T19:25:12+01:00" },
  olas12253: { id: "575831", profileUrl: "https://trucksbook.eu/profile/575831", joinDate: "2026-03-29T10:11:33+02:00" },
  tonbacon: { id: "575664", profileUrl: "https://trucksbook.eu/profile/575664", joinDate: "2026-03-30T19:19:17+02:00" },
  mubdel: { id: "386012", profileUrl: "https://trucksbook.eu/profile/386012", joinDate: "2026-04-06T09:28:38+02:00" },
  wazar: { id: "597504", profileUrl: "https://trucksbook.eu/profile/597504", joinDate: "2026-03-28T19:10:57+01:00" }
};

function parseDistance(html) {
  const match = html.match(/Distance[\s\S]*?<span class="float-end">\s*([\d\s.,]+)\s*km/i);
  if (!match) return null;

  const rawValue = match[1].replace(/\s+/g, " ").trim();
  const numericValue = Number(rawValue.replace(/[^\d]/g, ""));
  if (!Number.isFinite(numericValue)) return null;

  return { raw: rawValue, value: numericValue };
}

async function fetchYearlyDistanceData(profileId, headers, startYear) {
  const currentYear = new Date().getUTCFullYear();
  const byYear = [];

  for (let year = startYear; year <= currentYear; year += 1) {
    const yearResponse = await fetch(
      `https://trucksbook.eu/user-game-overview-data/${profileId}?game=1&stat=0&data=distance&period=${year}`,
      { headers }
    );

    if (!yearResponse.ok) {
      throw new Error(`Failed yearly distance fetch for ${profileId}: ${yearResponse.status}`);
    }

    const yearData = await yearResponse.json();
    const values = Array.isArray(yearData?.values?.selected_user) ? yearData.values.selected_user : [];
    byYear.push({ year, values });
  }

  return byYear;
}

async function fetchDriverKm(key, profile) {
  const headers = {
    "user-agent": "EU-Tuning-Crew-Vercel/1.0",
    "accept-language": "en-US,en;q=0.9"
  };
  const endpoint = `https://trucksbook.eu/components/app/profile/game_overview.php?user=${profile.id}&game=1&stat=0`;
  const response = await fetch(endpoint, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${key}: ${response.status}`);
  }

  const html = await response.text();
  const distance = parseDistance(html);
  if (!distance) {
    throw new Error(`Could not parse distance for ${key}`);
  }

  const joinDate = new Date(profile.joinDate);
  const firstKnownYear = 2016;
  const yearlyData = await fetchYearlyDistanceData(profile.id, headers, firstKnownYear);

  let historyAllTime = 0;
  for (const { values } of yearlyData) {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) {
        historyAllTime += value;
      }
    }
  }

  let etcDistance = null;
  if (Number.isFinite(joinDate.getTime())) {
    const startYear = joinDate.getUTCFullYear();
    let totalSinceJoin = 0;

    for (const { year, values } of yearlyData) {
      if (year < startYear) continue;
      const startMonthIndex = year === startYear ? joinDate.getUTCMonth() : 0;
      for (let monthIndex = startMonthIndex; monthIndex < values.length; monthIndex += 1) {
        const value = values[monthIndex];
        if (typeof value === "number" && Number.isFinite(value)) {
          totalSinceJoin += value;
        }
      }
    }

    etcDistance = totalSinceJoin;
  }

  const finalAllTime = distance.value === 0 && historyAllTime > 0 ? historyAllTime : Math.max(distance.value, historyAllTime);

  return {
    key,
    value: finalAllTime,
    raw: String(finalAllTime),
    profileUrl: profile.profileUrl,
    joinDate: profile.joinDate,
    etcValue: etcDistance,
    overviewValue: distance.value,
    historyAllTimeValue: historyAllTime
  };
}

export default async function handler(req, res) {
  try {
    const results = await Promise.allSettled(
      Object.entries(DRIVER_PROFILES).map(([key, profile]) => fetchDriverKm(key, profile))
    );

    const drivers = {};
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        drivers[result.value.key] = result.value;
      }
    });

    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || "Unknown error");

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=43200");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      drivers,
      failures
    });
  } catch (error) {
    res.status(500).json({
      error: "Unable to load TrucksBook kilometers right now."
    });
  }
}
