const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", (req, res) => {
  res.json({
    system: "FBIS",
    version: "1.0",
    status: "Backend online"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

app.get("/fixtures", async (req, res) => {
  const date = req.query.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Enter a date in YYYY-MM-DD format"
    });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "API key is not configured"
    });
  }

  try {
    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?date=${date}`,
      {
        headers: {
          "x-apisports-key": apiKey
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Football data provider error",
        details: data
      });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Could not retrieve fixtures"
    });
  }
});app.get("/matches", async (req, res) => {
  const date = req.query.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Use date format YYYY-MM-DD"
    });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;

  try {
    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?date=${date}`,
      {
        headers: {
          "x-apisports-key": apiKey
        }
      }
    );

    const data = await response.json();

    if (!response.ok || data.errors && Object.keys(data.errors).length) {
      return res.status(502).json({
        error: "Football data provider error",
        details: data.errors || data
      });
    }

    const matches = (data.response || []).map(item => ({
      match: `${item.teams.home.name} vs ${item.teams.away.name}`,
      home: item.teams.home.name,
      away: item.teams.away.name,
      league: item.league.name,
      country: item.league.country,
      date: item.fixture.date,
      status: item.fixture.status.long,
      homeGoals: item.goals.home,
      awayGoals: item.goals.away
    }));

    res.json({
      date,
      totalMatches: matches.length,
      matches
    });

  } catch (error) {
    res.status(500).json({
      error: "Could not load matches"
    });
  }
});

app.listen(PORT, () => {
  console.log(`FBIS API running on port ${PORT}`);
});
