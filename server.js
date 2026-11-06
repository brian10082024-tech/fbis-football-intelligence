
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.static(__dirname));
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
// TEAM'S LAST FIVE MATCHES
app.get("/team-form/:teamId", async (req, res) => {
  const teamId = req.params.teamId;

  if (!/^\d+$/.test(teamId)) {
    return res.status(400).json({ error: "Invalid team ID" });
  }

  try {
    const url = new URL("https://soccer.highlightly.net/last-five-games");
    url.searchParams.set("teamId", teamId);

    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": process.env.HIGHLIGHTLY_API_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HEAD-TO-HEAD RECORD
app.get("/h2h", async (req, res) => {
  const { team1, team2 } = req.query;

  if (!/^\d+$/.test(team1 || "") || !/^\d+$/.test(team2 || "")) {
    return res.status(400).json({
      error: "Provide two valid team IDs"
    });
  }

  try {
    const url = new URL("https://soccer.highlightly.net/head-2-head");
    url.searchParams.set("teamIdOne", team1);
    url.searchParams.set("teamIdTwo", team2);

    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": process.env.HIGHLIGHTLY_API_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.listen(PORT, () => {
  console.log(`FBIS API running on port ${PORT}`);
});
