
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.json({
    system: "FBIS",
    version: "1.0",
    status: "Backend online",
    provider: "Highlightly"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

async function getFootballMatches(date) {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY;

  if (!apiKey) {
    throw new Error("HIGHLIGHTLY_API_KEY is not configured");
  }

  const url = new URL("https://soccer.highlightly.net/matches");

  url.searchParams.set("date", date);
  url.searchParams.set("timezone", "Africa/Nairobi");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: {
      "x-rapidapi-key": apiKey
    }
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error("Highlightly provider error");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

app.get("/fixtures", async (req, res) => {
  const date = req.query.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Enter a date in YYYY-MM-DD format"
    });
  }

  try {
    const data = await getFootballMatches(date);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

app.get("/matches", async (req, res) => {
  const date = req.query.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Use date format YYYY-MM-DD"
    });
  }

  try {
    const data = await getFootballMatches(date);

    const matches = (data.data || []).map(item => ({
      id: item.id,
      match: `${item.homeTeam.name} vs ${item.awayTeam.name}`,
      home: item.homeTeam.name,
      away: item.awayTeam.name,
      league: item.league.name,
      country: item.country.name,
      date: item.date,
      status: item.state.description,
      score: item.state.score.current,
      homeTeamId: item.homeTeam.id,
      awayTeamId: item.awayTeam.id,
      leagueId: item.league.id
    }));

    res.json({
      date,
      totalMatches: matches.length,
      providerTotal: data.pagination?.totalCount ?? matches.length,
      plan: data.plan || null,
      matches
    });

  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

app.listen(PORT, () => {
  console.log(`FBIS API running on port ${PORT}`);
});
